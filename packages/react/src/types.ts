import type {
  ExperimentAnalyticsAdapter,
  ExperimentExposureEvent,
} from "@facet-smith/analytics";
import type {
  AssignmentResolver,
  AssignmentResult,
  ExperimentDefinition,
  ExperimentOverrides,
  VariantMetadata,
} from "@facet-smith/core";
import type { ComponentType, ReactNode } from "react";

export interface ReactVariant<P> extends VariantMetadata {
  readonly component: ComponentType<P>;
}

export type ReactExperimentDefinition<
  P,
  TVariants extends Record<string, ReactVariant<P>>,
> = ExperimentDefinition<TVariants>;

export interface InspectorConfiguration {
  readonly enabled: boolean;
  readonly environment: string;
  readonly allowInProduction?: boolean;
  readonly component?: ComponentType;
  readonly serverOverrideEndpoint?: string;
}

/**
 * Hydration-only migration shape for assignments emitted before resolver identity
 * became mandatory. The provider normalizes it immediately to AssignmentResult.
 */
export type InitialAssignment =
  | AssignmentResult
  | (Omit<AssignmentResult, "resolverId"> & {
      readonly resolverId?: undefined;
    });

export interface ExperimentProviderProps {
  readonly children: ReactNode;
  readonly subjectId?: string;
  readonly assignmentAttributes?: Readonly<Record<string, unknown>>;
  readonly assignmentTimeoutMs?: number;
  readonly initialAssignments?: Readonly<Record<string, InitialAssignment>>;
  readonly developerOverrides?: ExperimentOverrides;
  readonly qaOverrides?: ExperimentOverrides;
  readonly analytics?: ExperimentAnalyticsAdapter;
  readonly analyticsContext?: Readonly<Record<string, unknown>>;
  readonly inspector?: InspectorConfiguration;
  readonly onExposure?: (event: ExperimentExposureEvent) => void;
}

export interface RegisteredExperiment {
  readonly instanceId: string;
  readonly experimentId: string;
  readonly experimentIteration: string;
  readonly variantId: string;
  readonly variantRevision: string;
  readonly assignment: AssignmentResult;
  readonly variants: Readonly<Record<string, string>>;
  readonly marker: HTMLElement;
  readonly renderingMode: "client" | "server";
}

export type ExperimentAssignmentResolver = AssignmentResolver;
