"use client";

import {
  applyOverridesToUrl,
  createExperimentDefinitionRegistry,
  DEFAULT_ASSIGNMENT_RESOLVER_ID,
  OVERRIDE_QUERY_PARAMETER,
  parseOverrides,
  resolveExperiment,
  serializeOverrides,
  type AssignmentResult,
  type AssignmentResolver,
  type ExperimentDefinition,
  type ExperimentOverrides,
  type VariantMetadata,
} from "@facet-smith/core";
import {
  noopAnalyticsAdapter,
  toExperimentAttribution,
  type ExperimentAttribution,
  type ExperimentExposureEvent,
} from "@facet-smith/analytics";
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ExperimentContext, type ExperimentRuntime } from "./context";
import type {
  ExperimentProviderProps,
  InitialAssignment,
  RegisteredExperiment,
} from "./types";

export const OVERRIDE_STORAGE_KEY = "__facetsmith-overrides";
export const SERVER_REFRESH_EVENT = "facetsmith:server-refresh";
const EMPTY_OVERRIDES: ExperimentOverrides = Object.freeze({});
const EMPTY_ASSIGNMENTS: Readonly<Record<string, InitialAssignment>> =
  Object.freeze({});
const EMPTY_EXPERIMENT_ATTRIBUTION: readonly ExperimentAttribution[] =
  Object.freeze([]);

interface ExposedExperimentState {
  readonly subjectId: string | undefined;
  readonly exposures: readonly ExperimentAttribution[];
}

function safeStoredOverrides(): ExperimentOverrides {
  if (typeof window === "undefined") return {};
  try {
    return parseOverrides(window.localStorage.getItem(OVERRIDE_STORAGE_KEY));
  } catch {
    return {};
  }
}

function safeUrlOverrides(): ExperimentOverrides {
  if (typeof window === "undefined") return {};
  return parseOverrides(
    new URL(window.location.href).searchParams.get(OVERRIDE_QUERY_PARAMETER),
  );
}

export function ExperimentProvider({
  children,
  subjectId,
  assignmentAttributes,
  assignmentTimeoutMs,
  initialAssignments = EMPTY_ASSIGNMENTS,
  developerOverrides = EMPTY_OVERRIDES,
  qaOverrides = EMPTY_OVERRIDES,
  analytics = noopAnalyticsAdapter,
  analyticsContext,
  inspector,
  onExposure,
}: ExperimentProviderProps) {
  const inspectorEnabled = Boolean(
    inspector?.enabled &&
    (inspector.environment !== "production" ||
      inspector.allowInProduction === true),
  );
  const canonicalInitialAssignments = useMemo<
    Readonly<Record<string, AssignmentResult>>
  >(
    () =>
      Object.fromEntries(
        Object.entries(initialAssignments).map(([experimentId, assignment]) => [
          experimentId,
          assignment.resolverId === undefined
            ? {
                ...assignment,
                resolverId: DEFAULT_ASSIGNMENT_RESOLVER_ID,
              }
            : assignment,
        ]),
      ),
    [initialAssignments],
  );
  const [browserOverrides, setBrowserOverrides] =
    useState<ExperimentOverrides>(developerOverrides);
  const [resetOverrides, setResetOverrides] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const effectiveOverrides = useMemo(() => {
    const sourceOverrides = Object.fromEntries(
      Object.entries(developerOverrides).filter(
        ([experimentId]) => !resetOverrides.has(experimentId),
      ),
    );
    return { ...browserOverrides, ...sourceOverrides };
  }, [browserOverrides, developerOverrides, resetOverrides]);
  const [registrations, setRegistrations] = useState<
    readonly RegisteredExperiment[]
  >([]);
  const exposed = useRef(new Set<string>());
  const definitionRegistry = useRef(createExperimentDefinitionRegistry());
  const resolutionCacheScope = useMemo(
    () => ({
      assignmentAttributes,
      assignmentTimeoutMs,
      effectiveOverrides,
      initialAssignments: canonicalInitialAssignments,
      environment: inspector?.environment,
      qaOverrides,
      subjectId,
    }),
    [
      assignmentAttributes,
      assignmentTimeoutMs,
      effectiveOverrides,
      canonicalInitialAssignments,
      inspector?.environment,
      qaOverrides,
      subjectId,
    ],
  );
  const resolutionCaches = useRef(
    new WeakMap<
      object,
      WeakMap<
        object,
        WeakMap<object, AssignmentResult | Promise<AssignmentResult>>
      >
    >(),
  );
  const [exposedState, setExposedState] = useState<ExposedExperimentState>(
    () => ({ subjectId, exposures: EMPTY_EXPERIMENT_ATTRIBUTION }),
  );

  useEffect(() => {
    if (!inspectorEnabled) return;
    // Defer browser-only state until after hydration. URL values intentionally
    // win over persisted values for the same experiment.
    const timer = window.setTimeout(() => {
      setBrowserOverrides({
        ...safeStoredOverrides(),
        ...safeUrlOverrides(),
        ...developerOverrides,
      });
      setResetOverrides(new Set());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [developerOverrides, inspectorEnabled]);

  const register = useCallback((registration: RegisteredExperiment) => {
    setRegistrations((current) => [
      ...current.filter((item) => item.instanceId !== registration.instanceId),
      registration,
    ]);
    return () => {
      setRegistrations((current) =>
        current.filter((item) => item.instanceId !== registration.instanceId),
      );
    };
  }, []);

  const resolve = useCallback(
    <TVariants extends Record<string, VariantMetadata>>(
      definition: ExperimentDefinition<TVariants>,
      resolver?: AssignmentResolver,
    ):
      | AssignmentResult<keyof TVariants & string>
      | Promise<AssignmentResult<keyof TVariants & string>> => {
      definitionRegistry.current.register(definition, resolver);
      const resolverId = resolver?.id ?? DEFAULT_ASSIGNMENT_RESOLVER_ID;
      const coreOptions = {
        ...(subjectId === undefined ? {} : { subjectId }),
        qaOverrides,
        ...(assignmentAttributes === undefined
          ? {}
          : { attributes: assignmentAttributes }),
        ...(assignmentTimeoutMs === undefined
          ? {}
          : { timeoutMs: assignmentTimeoutMs }),
        mode:
          inspector?.environment === "production"
            ? ("production" as const)
            : ("development" as const),
      };
      const browserOverride = effectiveOverrides[definition.id];
      if (browserOverride !== undefined) {
        const overrideOptions = {
          ...coreOptions,
          developerOverrides: { [definition.id]: browserOverride },
        };
        return resolver === undefined
          ? resolveExperiment(definition, overrideOptions)
          : resolveExperiment(definition, {
              ...overrideOptions,
              resolver,
            });
      }
      const initial = canonicalInitialAssignments[definition.id];
      if (
        initial &&
        initial.experimentId === definition.id &&
        initial.experimentIteration === definition.iteration &&
        Object.hasOwn(definition.variants, initial.variantId) &&
        definition.variants[initial.variantId]?.revision ===
          initial.variantRevision &&
        initial.resolverId === resolverId
      ) {
        return initial as AssignmentResult<keyof TVariants & string>;
      }
      if (resolver === undefined)
        return resolveExperiment(definition, coreOptions);

      let resolutionCache = resolutionCaches.current.get(resolutionCacheScope);
      if (!resolutionCache) {
        resolutionCache = new WeakMap();
        resolutionCaches.current.set(resolutionCacheScope, resolutionCache);
      }
      let resolverCache = resolutionCache.get(definition);
      if (!resolverCache) {
        resolverCache = new WeakMap();
        resolutionCache.set(definition, resolverCache);
      }
      const cached = resolverCache.get(resolver);
      if (cached) {
        return cached as
          | AssignmentResult<keyof TVariants & string>
          | Promise<AssignmentResult<keyof TVariants & string>>;
      }
      const assignment = resolveExperiment(definition, {
        ...coreOptions,
        resolver,
      });
      resolverCache.set(resolver, assignment);
      return assignment;
    },
    [
      assignmentAttributes,
      assignmentTimeoutMs,
      effectiveOverrides,
      canonicalInitialAssignments,
      inspector?.environment,
      qaOverrides,
      resolutionCacheScope,
      subjectId,
    ],
  );

  const persist = useCallback((next: ExperimentOverrides) => {
    try {
      if (Object.keys(next).length === 0)
        localStorage.removeItem(OVERRIDE_STORAGE_KEY);
      else localStorage.setItem(OVERRIDE_STORAGE_KEY, serializeOverrides(next));
    } catch {
      // Storage may be unavailable in privacy modes; the in-memory override remains useful.
    }
  }, []);

  const serverOverrideEndpoint = inspector?.serverOverrideEndpoint;
  const requestServerChange = useCallback(
    async (experimentId: string, variantId: string | null) => {
      const isServer = registrations.some(
        (item) =>
          item.experimentId === experimentId && item.renderingMode === "server",
      );
      if (!isServer || !serverOverrideEndpoint) return;
      const response = await fetch(serverOverrideEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ experimentId, variantId }),
      });
      if (!response.ok)
        throw new Error(`Server override failed (${response.status})`);
      window.dispatchEvent(new CustomEvent(SERVER_REFRESH_EVENT));
    },
    [registrations, serverOverrideEndpoint],
  );

  const setOverride = useCallback(
    async (experimentId: string, variantId: string | null) => {
      const known = registrations.find(
        (item) => item.experimentId === experimentId,
      );
      if (
        !known ||
        (variantId !== null && !Object.hasOwn(known.variants, variantId))
      ) {
        throw new Error(
          `Unknown experiment or variant: ${experimentId}/${variantId ?? "reset"}`,
        );
      }
      const next = { ...browserOverrides };
      if (variantId === null) {
        delete next[experimentId];
        setResetOverrides((current) => new Set([...current, experimentId]));
        if (typeof window !== "undefined") {
          const urlOverrides = safeUrlOverrides();
          if (urlOverrides[experimentId] !== undefined) {
            const remaining = { ...urlOverrides };
            delete remaining[experimentId];
            window.history.replaceState(
              null,
              "",
              applyOverridesToUrl(window.location.href, remaining),
            );
          }
        }
      } else {
        next[experimentId] = variantId;
        setResetOverrides((current) => {
          const updated = new Set(current);
          updated.delete(experimentId);
          return updated;
        });
      }
      setBrowserOverrides(next);
      persist(next);
      await requestServerChange(experimentId, variantId);
    },
    [browserOverrides, persist, registrations, requestServerChange],
  );

  const resetAllOverrides = useCallback(async () => {
    const serverIds = Array.from(
      new Set(
        registrations
          .filter((item) => item.renderingMode === "server")
          .map((item) => item.experimentId),
      ),
    );
    setBrowserOverrides({});
    setResetOverrides(new Set(Object.keys(developerOverrides)));
    persist({});
    if (typeof window !== "undefined") {
      const clean = applyOverridesToUrl(window.location.href, {});
      window.history.replaceState(null, "", clean);
    }
    await Promise.all(serverIds.map((id) => requestServerChange(id, null)));
  }, [developerOverrides, persist, registrations, requestServerChange]);

  const expose = useCallback(
    (event: ExperimentExposureEvent) => {
      const attribution = toExperimentAttribution(event);
      setExposedState((current) => {
        const currentExposures =
          current.subjectId === event.subjectId
            ? current.exposures
            : EMPTY_EXPERIMENT_ATTRIBUTION;
        const existing = currentExposures.find(
          (item) => item.experimentId === attribution.experimentId,
        );
        if (
          existing?.variantId === attribution.variantId &&
          existing.experimentIteration === attribution.experimentIteration &&
          existing.variantRevision === attribution.variantRevision &&
          existing.assignmentSource === attribution.assignmentSource
        ) {
          return current;
        }
        return {
          subjectId: event.subjectId,
          exposures: [
            ...currentExposures.filter(
              (item) => item.experimentId !== attribution.experimentId,
            ),
            attribution,
          ].sort((left, right) =>
            left.experimentId.localeCompare(right.experimentId),
          ),
        };
      });
      const key = `${event.subjectId ?? ""}\u0000${event.experimentId}\u0000${event.experimentIteration}\u0000${event.variantId}\u0000${event.variantRevision}`;
      if (exposed.current.has(key)) return;
      exposed.current.add(key);
      const enriched = analyticsContext
        ? { ...event, context: analyticsContext }
        : event;
      onExposure?.(enriched);
      void Promise.resolve(analytics.exposure(enriched)).catch(
        (error: unknown) => {
          if (inspector?.environment !== "production") {
            console.error(
              "FacetSmith analytics adapter rejected an exposure",
              error,
            );
          }
        },
      );
    },
    [analytics, analyticsContext, inspector?.environment, onExposure],
  );

  const attribution = useMemo(
    () => ({
      ...(subjectId === undefined ? {} : { subjectId }),
      exposures:
        exposedState.subjectId === subjectId
          ? exposedState.exposures
          : EMPTY_EXPERIMENT_ATTRIBUTION,
    }),
    [exposedState, subjectId],
  );

  const runtime = useMemo<ExperimentRuntime>(
    () => ({
      ...(subjectId === undefined ? {} : { subjectId }),
      overrides: effectiveOverrides,
      qaOverrides,
      initialAssignments: canonicalInitialAssignments,
      inspectorEnabled,
      registrations,
      attribution,
      resolve,
      setOverride,
      resetAllOverrides,
      register,
      expose,
    }),
    [
      effectiveOverrides,
      expose,
      attribution,
      canonicalInitialAssignments,
      inspectorEnabled,
      qaOverrides,
      register,
      registrations,
      resetAllOverrides,
      resolve,
      setOverride,
      subjectId,
    ],
  );

  const Inspector = inspectorEnabled ? inspector?.component : undefined;
  return (
    <ExperimentContext.Provider value={runtime}>
      {children}
      {Inspector ? createElement(Inspector) : null}
    </ExperimentContext.Provider>
  );
}
