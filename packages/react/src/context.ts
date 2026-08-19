"use client";

import { createContext, useContext } from "react";
import type { ExperimentExposureEvent } from "@facetsmith/analytics";
import type {
  AssignmentResult,
  ExperimentDefinition,
  ExperimentOverrides,
  VariantMetadata,
} from "@facetsmith/core";
import type { RegisteredExperiment } from "./types";

export interface ExperimentRuntime {
  readonly subjectId?: string;
  readonly overrides: ExperimentOverrides;
  readonly qaOverrides: ExperimentOverrides;
  readonly initialAssignments: Readonly<Record<string, AssignmentResult>>;
  readonly inspectorEnabled: boolean;
  readonly registrations: readonly RegisteredExperiment[];
  resolve<TVariants extends Record<string, VariantMetadata>>(
    definition: ExperimentDefinition<TVariants>,
  ): AssignmentResult<keyof TVariants & string>;
  setOverride(experimentId: string, variantId: string | null): Promise<void>;
  resetAllOverrides(): Promise<void>;
  register(registration: RegisteredExperiment): () => void;
  expose(event: ExperimentExposureEvent): void;
}

export const ExperimentContext = createContext<ExperimentRuntime | null>(null);

export function useExperimentRuntime(): ExperimentRuntime | null {
  return useContext(ExperimentContext);
}

export function useExperimentRegistry(): ExperimentRuntime {
  const runtime = useContext(ExperimentContext);
  if (!runtime) {
    throw new Error(
      "useExperimentRegistry must be used inside ExperimentProvider",
    );
  }
  return runtime;
}
