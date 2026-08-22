import { createNextExperiment } from "@facet-smith/next/server";
import { externalServiceResolver } from "./external-resolver";

export const ServerBanner = createNextExperiment(
  {
    id: "custom-server-banner",
    iteration: "external-service-1",
    defaultVariant: "control",
    variants: {
      control: { revision: "1", component: () => <p>Standard delivery</p> },
      express: { revision: "1", component: () => <p>Express delivery</p> },
    },
  },
  externalServiceResolver,
);

export async function renderCustomServerBanner(subjectId: string) {
  return ServerBanner.render(undefined, {
    subjectId,
    attributes: { country: "US" },
  });
}
