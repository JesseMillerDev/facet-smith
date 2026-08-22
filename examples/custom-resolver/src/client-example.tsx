"use client";

import { ExperimentProvider, createClientExperiment } from "@facet-smith/react";
import { externalServiceResolver } from "./external-resolver";

const ClientBanner = createClientExperiment(
  {
    id: "custom-client-banner",
    iteration: "external-service-1",
    defaultVariant: "control",
    variants: {
      control: { revision: "1", component: () => <p>Standard delivery</p> },
      express: { revision: "1", component: () => <p>Express delivery</p> },
    },
  },
  externalServiceResolver,
);

export function CustomResolverClientExample({
  subjectId,
}: {
  readonly subjectId: string;
}) {
  return (
    <ExperimentProvider
      subjectId={subjectId}
      assignmentAttributes={{ country: "US" }}
    >
      <ClientBanner />
    </ExperimentProvider>
  );
}
