# Analytics adapters

An adapter receives immutable exposure events and owns delivery:

```ts
interface ExperimentAnalyticsAdapter {
  exposure(event: ExperimentExposureEvent): void | Promise<void>;
}
```

Events contain experiment ID, variant ID, revision, assignment source, ISO timestamp, and—when available—subject ID, URL/route, and application context. `noopAnalyticsAdapter`, `createConsoleAnalyticsAdapter()`, and `InMemoryAnalyticsAdapter` cover disabled, development, and test scenarios.

## PostHog example

PostHog remains an application dependency. Adapt an already configured client rather than making it a framework dependency:

```ts
import type { ExperimentAnalyticsAdapter } from "@facet-smith/analytics";
import posthog from "posthog-js";

export const posthogExperiments: ExperimentAnalyticsAdapter = {
  exposure(event) {
    posthog.capture("experiment_exposure", {
      experiment_id: event.experimentId,
      variant_id: event.variantId,
      variant_revision: event.variantRevision,
      assignment_source: event.assignmentSource,
      subject_id: event.subjectId,
      url: event.url,
      ...event.context,
    });
  },
};
```

Do not infer a winner from these events alone. Applications need consent handling, conversion definitions, bot policy, sample-ratio checks, statistical methodology, and secure ingestion outside FacetSmith.
