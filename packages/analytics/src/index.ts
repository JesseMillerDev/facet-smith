import type { AssignmentSource } from "@facet-smith/core";

export interface ExperimentExposureEvent {
  readonly experimentId: string;
  readonly variantId: string;
  readonly variantRevision: string;
  readonly subjectId?: string;
  readonly assignmentSource: AssignmentSource;
  readonly timestamp: string;
  readonly url?: string;
  readonly context?: Readonly<Record<string, unknown>>;
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
