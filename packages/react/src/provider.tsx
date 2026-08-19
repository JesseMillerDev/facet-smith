"use client";

import {
  applyOverridesToUrl,
  OVERRIDE_QUERY_PARAMETER,
  parseOverrides,
  resolveExperiment,
  serializeOverrides,
  type AssignmentResult,
  type ExperimentDefinition,
  type ExperimentOverrides,
  type VariantMetadata,
} from "@facet-smith/core";
import {
  noopAnalyticsAdapter,
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
import type { ExperimentProviderProps, RegisteredExperiment } from "./types";

export const OVERRIDE_STORAGE_KEY = "__facetsmith-overrides";
export const SERVER_REFRESH_EVENT = "facetsmith:server-refresh";
const EMPTY_OVERRIDES: ExperimentOverrides = Object.freeze({});
const EMPTY_ASSIGNMENTS: Readonly<Record<string, AssignmentResult>> =
  Object.freeze({});

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
    ): AssignmentResult<keyof TVariants & string> => {
      const browserOverride = effectiveOverrides[definition.id];
      if (browserOverride !== undefined) {
        return resolveExperiment(definition, {
          ...(subjectId === undefined ? {} : { subjectId }),
          developerOverrides: { [definition.id]: browserOverride },
          qaOverrides,
          mode:
            inspector?.environment === "production"
              ? "production"
              : "development",
        });
      }
      const initial = initialAssignments[definition.id];
      if (
        initial &&
        Object.hasOwn(definition.variants, initial.variantId) &&
        definition.variants[initial.variantId]?.revision ===
          initial.variantRevision
      ) {
        return initial as AssignmentResult<keyof TVariants & string>;
      }
      return resolveExperiment(definition, {
        ...(subjectId === undefined ? {} : { subjectId }),
        qaOverrides,
        mode:
          inspector?.environment === "production"
            ? "production"
            : "development",
      });
    },
    [
      effectiveOverrides,
      initialAssignments,
      inspector?.environment,
      qaOverrides,
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
      const key = `${event.experimentId}\u0000${event.variantId}\u0000${event.variantRevision}`;
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

  const runtime = useMemo<ExperimentRuntime>(
    () => ({
      ...(subjectId === undefined ? {} : { subjectId }),
      overrides: effectiveOverrides,
      qaOverrides,
      initialAssignments,
      inspectorEnabled,
      registrations,
      resolve,
      setOverride,
      resetAllOverrides,
      register,
      expose,
    }),
    [
      effectiveOverrides,
      expose,
      initialAssignments,
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
