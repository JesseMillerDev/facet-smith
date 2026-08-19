"use client";

import {
  createConsoleAnalyticsAdapter,
  type ExperimentExposureEvent,
} from "@facet-smith/analytics";
import type { AssignmentResult, ExperimentOverrides } from "@facet-smith/core";
import { NextExperimentRefresh } from "@facet-smith/next/client";
import { ExperimentProvider } from "@facet-smith/react";
import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";
import { PricingHero } from "./experiments/client-experiments";

const inspectorBuildEnabled =
  process.env.NEXT_PUBLIC_EXPERIMENT_INSPECTOR === "true";
// This branch is compile-time removable. Production consumers can omit the inspector chunk entirely.
const Inspector = inspectorBuildEnabled
  ? dynamic(
      () =>
        import("@facet-smith/inspector").then(
          (module) => module.ExperimentInspector,
        ),
      {
        ssr: false,
      },
    )
  : undefined;

export interface ProviderShellProps {
  readonly children: ReactNode;
  readonly subjectId?: string;
  readonly initialAssignments?: Readonly<Record<string, AssignmentResult>>;
  readonly developerOverrides?: ExperimentOverrides;
  readonly qaOverrides?: ExperimentOverrides;
  readonly forceDisabled?: boolean;
}

export function ProviderShell({
  children,
  subjectId,
  initialAssignments,
  developerOverrides,
  qaOverrides,
  forceDisabled = false,
}: ProviderShellProps) {
  const [events, setEvents] = useState<ExperimentExposureEvent[]>([]);
  const consoleAnalytics = useMemo(() => createConsoleAnalyticsAdapter(), []);
  const environment = process.env.NEXT_PUBLIC_DEPLOYMENT_ENV ?? "development";
  const enabled = inspectorBuildEnabled && !forceDisabled;

  return (
    <ExperimentProvider
      {...(subjectId === undefined ? {} : { subjectId })}
      {...(initialAssignments === undefined ? {} : { initialAssignments })}
      {...(developerOverrides === undefined ? {} : { developerOverrides })}
      {...(qaOverrides === undefined ? {} : { qaOverrides })}
      analytics={consoleAnalytics}
      onExposure={(event) => setEvents((current) => [...current, event])}
      inspector={{
        enabled,
        environment,
        ...(Inspector === undefined ? {} : { component: Inspector }),
        serverOverrideEndpoint: "/api/experiment-overrides",
      }}
    >
      <NextExperimentRefresh />
      <main>
        <PricingHero title="Experiment in source" />
        <section className="content-grid" id="demo">
          {children}
          <aside className="event-log" aria-label="Exposure event log">
            <span className="eyebrow">Development event log</span>
            <h2>Actual exposures</h2>
            {events.length === 0 ? (
              <p>Scroll variants into view to emit exposure events.</p>
            ) : (
              <ol>
                {events.map((event, index) => (
                  <li key={`${event.experimentId}-${event.variantId}-${index}`}>
                    <strong>{event.experimentId}</strong> / {event.variantId} /
                    revision {event.variantRevision}
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </section>
      </main>
    </ExperimentProvider>
  );
}
