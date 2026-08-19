import { createOverrideRouteHandler } from "@facetsmith/next/server";
import { ServerCard } from "../../experiments/server-experiment";

export const POST = createOverrideRouteHandler({
  definitions: [ServerCard.definition],
  enabled: process.env.NEXT_PUBLIC_EXPERIMENT_INSPECTOR === "true",
  environment: process.env.NEXT_PUBLIC_DEPLOYMENT_ENV ?? "development",
  secure: process.env.NODE_ENV === "production",
});
