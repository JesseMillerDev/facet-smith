import type { AssignmentResult, AssignmentSource } from "@facet-smith/core";

/** Immutable experiment identity suitable for attaching to application events. */
export interface ExperimentAttribution {
  readonly experimentId: string;
  readonly experimentIteration: string;
  readonly variantId: string;
  readonly variantRevision: string;
  readonly assignmentSource: AssignmentSource;
}

/** The experiments visibly exposed during the current provider lifetime. */
export interface ExperimentAttributionSnapshot {
  readonly subjectId?: string;
  readonly exposures: readonly ExperimentAttribution[];
}

export interface ExperimentExposureEvent extends ExperimentAttribution {
  readonly subjectId?: string;
  readonly timestamp: string;
  readonly url?: string;
  readonly context?: Readonly<Record<string, unknown>>;
}

export function toExperimentAttribution(
  source: AssignmentResult | ExperimentExposureEvent,
): ExperimentAttribution {
  return {
    experimentId: source.experimentId,
    experimentIteration: source.experimentIteration,
    variantId: source.variantId,
    variantRevision: source.variantRevision,
    assignmentSource:
      "assignmentSource" in source ? source.assignmentSource : source.source,
  };
}

export interface ExperimentAnalyticsAdapter {
  exposure(event: ExperimentExposureEvent): void | Promise<void>;
}

export const noopAnalyticsAdapter: ExperimentAnalyticsAdapter = {
  exposure: () => undefined,
};

export function createConsoleAnalyticsAdapter(
  label = "[FacetSmith exposure]",
): ExperimentAnalyticsAdapter {
  return {
    exposure(event) {
      console.info(label, event);
    },
  };
}

export class InMemoryAnalyticsAdapter implements ExperimentAnalyticsAdapter {
  readonly events: ExperimentExposureEvent[] = [];

  exposure(event: ExperimentExposureEvent): void {
    this.events.push(event);
  }

  clear(): void {
    this.events.length = 0;
  }
}
