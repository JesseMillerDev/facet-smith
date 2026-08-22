"use client";

/* eslint-disable no-redeclare -- TypeScript overloads share one implementation. */

import {
  resolveExperiment,
  validateExperiment,
  type AssignmentResult,
  type ExperimentDefinition,
  type VariantMetadata,
} from "@facet-smith/core";
import {
  createElement,
  useMemo,
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

export function useExperimentState<
  TVariants extends Record<string, VariantMetadata>,
>(
  definition: ExperimentDefinition<TVariants>,
): AssignmentResult<keyof TVariants & string> {
  const runtime = useExperimentRuntime();
  const runtimeResolve = runtime?.resolve;
  return useMemo(
    () =>
      runtimeResolve
        ? runtimeResolve(definition)
        : resolveExperiment(definition, { mode: "production" }),
    [definition, runtimeResolve],
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
  readonly allocation: Readonly<Record<string, number>>;
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
) => ExperimentComponent<P, keyof TVariants & string>;
export function createClientExperiment<const TDefinition>(
  definition: TDefinition extends ClientDefinitionShape ? TDefinition : never,
): ExperimentComponent<
  InferredProps<VariantsOf<TDefinition>>,
  keyof VariantsOf<TDefinition> & string
>;
export function createClientExperiment(
  definition?: ClientDefinitionShape,
): unknown {
  if (definition === undefined) {
    return (explicitDefinition: ClientDefinitionShape) =>
      buildClientExperiment(explicitDefinition);
  }
  return buildClientExperiment(definition);
}

function buildClientExperiment<const TDefinition extends ClientDefinitionShape>(
  definition: TDefinition,
): ExperimentComponent<
  InferredProps<VariantsOf<TDefinition>>,
  keyof VariantsOf<TDefinition> & string
> {
  type TVariants = VariantsOf<TDefinition>;
  type P = InferredProps<TVariants>;
  const checked = definition as unknown as ExperimentDefinition<TVariants>;
  validateExperiment(checked);
  const revisions = Object.fromEntries(
    Object.entries(checked.variants).map(([id, variant]) => [
      id,
      variant.revision,
    ]),
  );

  function ExperimentComponent(props: P) {
    const assignment = useExperimentState(checked);
    const Variant = checked.variants[assignment.variantId]?.component as
      | ComponentType<P>
      | undefined;
    if (!Variant) {
      const Fallback = checked.variants[checked.defaultVariant]?.component as
        | ComponentType<P>
        | undefined;
      return Fallback ? createElement(Fallback, props) : null;
    }
    return (
      <ExperimentBoundary assignment={assignment} variants={revisions}>
        {createElement(Variant, props)}
      </ExperimentBoundary>
    );
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

/** Alias retained for the concise client-only quick start. */
export const createExperiment = createClientExperiment;
