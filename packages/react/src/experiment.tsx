"use client";

/* eslint-disable no-redeclare -- TypeScript overloads share one implementation. */

import {
  resolveExperiment,
  validateExperiment,
  type AssignmentResolver,
  type AssignmentResult,
  type ExperimentDefinition,
  type VariantMetadata,
} from "@facet-smith/core";
import {
  createElement,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ComponentType,
  type ElementType,
} from "react";
import { ExperimentBoundary } from "./boundary";
import { useExperimentRuntime } from "./context";

export type ExperimentComponent<
  P,
  TVariant extends string,
> = ComponentType<P> & {
  readonly experimentId: string;
  readonly variants: readonly TVariant[];
};

export interface ClientExperimentOptions<P> {
  /**
   * Explicit content rendered while a client resolver is pending. Use `null`
   * intentionally to render nothing. Server-resolved integrations do not use it.
   */
  readonly fallback?: ComponentType<P> | null;
}

export function useExperimentState<
  TVariants extends Record<string, VariantMetadata>,
>(
  definition: ExperimentDefinition<TVariants>,
  resolver?: AssignmentResolver,
):
  | AssignmentResult<keyof TVariants & string>
  | Promise<AssignmentResult<keyof TVariants & string>> {
  const runtime = useExperimentRuntime();
  const runtimeResolve = runtime?.resolve;
  return useMemo(
    () =>
      runtimeResolve
        ? runtimeResolve(definition, resolver)
        : resolver === undefined
          ? resolveExperiment(definition, { mode: "production" })
          : resolveExperiment(definition, {
              mode: "production",
              resolver,
            }),
    [definition, resolver, runtimeResolve],
  );
}

type VariantShape = {
  readonly revision: string;
  readonly component: ElementType;
};
interface ClientDefinitionShape {
  readonly id: string;
  readonly iteration: string;
  readonly defaultVariant: string;
  readonly variants: Readonly<Record<string, VariantShape>>;
  readonly allocation?: Readonly<Record<string, number>>;
  readonly salt?: string;
}
type PropsOfComponent<T> = T extends (props: infer P) => unknown
  ? P
  : T extends new (props: infer P) => unknown
    ? P
    : never;
type InferredProps<TVariants extends Record<string, VariantShape>> =
  UnionToIntersection<
    PropsOfComponent<TVariants[keyof TVariants]["component"]>
  > extends infer P
    ? unknown extends P
      ? Record<string, never>
      : P extends object
        ? P
        : never
    : never;
type UnionToIntersection<U> = (
  U extends unknown ? (value: U) => void : never
) extends (value: infer I) => void
  ? I
  : never;
type VariantsOf<T> = T extends {
  readonly variants: infer V extends Record<string, VariantShape>;
}
  ? V
  : never;

export function createClientExperiment<P>(): <
  const TVariants extends Record<
    string,
    VariantShape & { readonly component: ComponentType<P> }
  >,
>(
  definition: ExperimentDefinition<TVariants>,
  resolver?: AssignmentResolver,
  options?: ClientExperimentOptions<P>,
) => ExperimentComponent<P, keyof TVariants & string>;
export function createClientExperiment<const TDefinition>(
  definition: TDefinition extends ClientDefinitionShape ? TDefinition : never,
  resolver?: AssignmentResolver,
  options?: ClientExperimentOptions<InferredProps<VariantsOf<TDefinition>>>,
): ExperimentComponent<
  InferredProps<VariantsOf<TDefinition>>,
  keyof VariantsOf<TDefinition> & string
>;
export function createClientExperiment(
  definition?: ClientDefinitionShape,
  resolver?: AssignmentResolver,
  options?: unknown,
): unknown {
  if (definition === undefined) {
    return (
      explicitDefinition: ClientDefinitionShape,
      explicitResolver?: AssignmentResolver,
      explicitOptions?: unknown,
    ) =>
      buildClientExperiment(
        explicitDefinition,
        explicitResolver,
        explicitOptions,
      );
  }
  return buildClientExperiment(definition, resolver, options);
}

function buildClientExperiment<const TDefinition extends ClientDefinitionShape>(
  definition: TDefinition,
  resolver?: AssignmentResolver,
  options?: unknown,
): ExperimentComponent<
  InferredProps<VariantsOf<TDefinition>>,
  keyof VariantsOf<TDefinition> & string
> {
  type TVariants = VariantsOf<TDefinition>;
  type P = InferredProps<TVariants>;
  const clientOptions = options as ClientExperimentOptions<P> | undefined;
  const checked = definition as unknown as ExperimentDefinition<TVariants>;
  validateExperiment(checked, resolver);
  const revisions = Object.fromEntries(
    Object.entries(checked.variants).map(([id, variant]) => [
      id,
      variant.revision,
    ]),
  );

  function ExperimentComponent(props: P) {
    const assignment = useExperimentState(checked, resolver);
    const warnedMissingFallback = useRef(false);
    const missingAsyncFallback =
      assignment instanceof Promise && clientOptions?.fallback === undefined;
    useEffect(() => {
      if (
        !missingAsyncFallback ||
        warnedMissingFallback.current ||
        process.env.NODE_ENV === "production"
      ) {
        return;
      }
      warnedMissingFallback.current = true;
      console.warn(
        `FacetSmith experiment "${checked.id}" suspended on a client assignment resolver without an explicit fallback. Pass { fallback: Component } or { fallback: null } as the third factory argument. Prefer server-resolved assignment when possible.`,
      );
    }, [missingAsyncFallback]);
    const renderAssignment = (
      resolved: AssignmentResult<keyof TVariants & string>,
    ) => {
      const Variant = checked.variants[resolved.variantId]?.component as
        | ComponentType<P>
        | undefined;
      if (!Variant) return null;
      return (
        <ExperimentBoundary assignment={resolved} variants={revisions}>
          {createElement(Variant, props)}
        </ExperimentBoundary>
      );
    };
    if (assignment instanceof Promise) {
      const Fallback = clientOptions?.fallback;
      return (
        <Suspense fallback={Fallback ? createElement(Fallback, props) : null}>
          <AsyncExperiment assignment={assignment} render={renderAssignment} />
        </Suspense>
      );
    }
    return renderAssignment(assignment);
  }

  ExperimentComponent.displayName = `Experiment(${checked.id})`;
  Object.defineProperties(ExperimentComponent, {
    experimentId: { value: checked.id, enumerable: true },
    variants: {
      value: Object.freeze(Object.keys(checked.variants)),
      enumerable: true,
    },
  });
  return ExperimentComponent as unknown as ExperimentComponent<
    P,
    keyof TVariants & string
  >;
}

interface TrackedPromise<T> extends Promise<T> {
  status?: "pending" | "fulfilled" | "rejected";
  value?: T;
  reason?: unknown;
}

function readPromise<T>(promise: Promise<T>): T {
  const tracked = promise as TrackedPromise<T>;
  if (tracked.status === "fulfilled") return tracked.value as T;
  if (tracked.status === "rejected") throw tracked.reason;
  if (tracked.status !== "pending") {
    tracked.status = "pending";
    void tracked.then(
      (value) => {
        tracked.status = "fulfilled";
        tracked.value = value;
      },
      (reason: unknown) => {
        tracked.status = "rejected";
        tracked.reason = reason;
      },
    );
  }
  throw tracked;
}

function AsyncExperiment<T>({
  assignment,
  render,
}: {
  readonly assignment: Promise<T>;
  readonly render: (assignment: T) => ReturnType<typeof createElement> | null;
}) {
  return render(readPromise(assignment));
}

/** Alias retained for the concise client-only quick start. */
export const createExperiment = createClientExperiment;
