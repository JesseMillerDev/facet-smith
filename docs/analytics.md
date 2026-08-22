# Analytics and attribution

FacetSmith automatically reports visible experiment exposure and makes the
resulting attribution available to the host application's existing analytics.
It does not define application events or metrics.

## Exposure adapters

An adapter receives immutable exposure events and owns delivery:

```ts
interface ExperimentAnalyticsAdapter {
  exposure(event: ExperimentExposureEvent): void | Promise<void>;
}
```

Events contain experiment ID, iteration, variant ID, revision, assignment source, ISO
timestamp, and—when available—subject ID, URL/route, and application context.
`noopAnalyticsAdapter`, `createConsoleAnalyticsAdapter()`, and
`InMemoryAnalyticsAdapter` cover disabled, development, and test scenarios.

Assignment is not exposure. FacetSmith emits only after experimental content
becomes visible and deduplicates each experiment/iteration/variant/revision for the
provider lifetime.

Missing-subject defaults and resolver failure/timeout defaults are not
assignments and never emit exposure, even when their fallback content is visible.

## PostHog example

PostHog remains an application dependency. Adapt an already configured client
rather than making it a framework dependency:

```ts
import type { ExperimentAnalyticsAdapter } from "@facet-smith/analytics";
import posthog from "posthog-js";

export const posthogExperiments: ExperimentAnalyticsAdapter = {
  exposure(event) {
    posthog.capture("experiment_exposure", {
      experiment_id: event.experimentId,
      experiment_iteration: event.experimentIteration,
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

## Attribute existing application events

`useExposedExperiments()` returns only experiments that have actually become
visible beneath the current provider. Use it at the application's analytics
boundary instead of adding experiment-specific event names:

```tsx
"use client";

import { useExposedExperiments } from "@facet-smith/react";
import { useMemo } from "react";
import { analytics } from "./configured-application-analytics";

export function useApplicationAnalytics() {
  const attribution = useExposedExperiments();

  return useMemo(
    () => ({
      track(name: string, properties: Record<string, unknown>) {
        analytics.track(name, {
          ...properties,
          experiment_subject_id: attribution.subjectId,
          experiment_attribution: attribution.exposures,
        });
      },
    }),
    [attribution],
  );
}
```

The rest of the application keeps its own vocabulary:

```tsx
const analytics = useApplicationAnalytics();

analytics.track("document_shared", { documentId });
```

Each attribution contains `experimentId`, `experimentIteration`, `variantId`,
`variantRevision`, and `assignmentSource`. The snapshot is empty before visibility, safe outside a
provider, deterministically ordered by experiment ID, and retained for the
provider lifetime. Changing the provider subject clears attribution until the
new subject sees the experiment. The snapshot is deliberately not persisted to
localStorage.

For a server-side event that already has an `AssignmentResult`, use the
framework-neutral helper:

```ts
import { toExperimentAttribution } from "@facet-smith/analytics";

const properties = {
  experiment_attribution: [toExperimentAttribution(assignment)],
};
```

## Delayed and offline outcomes

Purchases, retention, support contacts, and other outcomes may occur after the
experiment is no longer mounted or outside the browser. Send the same stable,
opaque subject or account identity with both exposure and application events,
then join them in the application's analytics system within its chosen
attribution window. FacetSmith does not persist exposure history or perform the
join.

## Metrics remain application-owned

An experiment should state a falsifiable hypothesis, primary metric, secondary
metrics, and guardrails next to its source definition or in the application's
analytics configuration. Those metric identifiers and calculations remain
unrestricted. FacetSmith does not impose an event vocabulary, automatically
capture clicks, calculate metrics, or infer statistical winners.

Applications remain responsible for consent handling, conversion definitions,
bot policy, sample-ratio checks, statistical methodology, retries, and secure
ingestion.
