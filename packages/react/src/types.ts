import type {
  ExperimentAnalyticsAdapter,
  ExperimentExposureEvent,
} from "@facetsmith/analytics";
import type {
  AssignmentResult,
  ExperimentDefinition,
  ExperimentOverrides,
  VariantMetadata,
} from "@facetsmith/core";
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

export interface ExperimentProviderProps {
  readonly children: ReactNode;
  readonly subjectId?: string;
  readonly initialAssignments?: Readonly<Record<string, AssignmentResult>>;
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
  readonly variantId: string;
  readonly variantRevision: string;
  readonly assignment: AssignmentResult;
  readonly variants: Readonly<Record<string, string>>;
  readonly marker: HTMLElement;
  readonly renderingMode: "client" | "server";
}
