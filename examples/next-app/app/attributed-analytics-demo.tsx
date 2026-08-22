"use client";

import type { ExperimentAttribution } from "@facet-smith/analytics";
import { useExposedExperiments } from "@facet-smith/react";
import { useState } from "react";

interface ApplicationEvent {
  readonly name: string;
  readonly experimentAttribution: readonly ExperimentAttribution[];
}

function existingApplicationAnalytics(event: ApplicationEvent): void {
  console.info("[Application analytics]", event);
}

export function AttributedAnalyticsDemo() {
  const { exposures } = useExposedExperiments();
  const [lastEvent, setLastEvent] = useState<ApplicationEvent>();

  function trackExistingEvent() {
    const event = {
      name: "existing_app_event",
      experimentAttribution: exposures,
    } satisfies ApplicationEvent;
    existingApplicationAnalytics(event);
    setLastEvent(event);
  }

  return (
    <div className="attribution-demo">
      <h3>Existing app analytics</h3>
      <p>
        Attach visible experiment identities without changing the app&apos;s
        event vocabulary.
      </p>
      <button
        type="button"
        onClick={trackExistingEvent}
        disabled={exposures.length === 0}
      >
        Track existing app event
      </button>
      <output data-testid="attributed-app-event" aria-live="polite">
        {lastEvent
          ? `${lastEvent.name}: ${lastEvent.experimentAttribution
              .map(
                (item) =>
                  `${item.experimentId}#${item.experimentIteration}/${item.variantId}@${item.variantRevision}`,
              )
              .join(", ")}`
          : "No application event tracked yet."}
      </output>
    </div>
  );
}
