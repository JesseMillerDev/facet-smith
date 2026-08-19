import { parseOverrides } from "@facetsmith/core";
import { readExperimentRequest } from "@facetsmith/next/server";
import { ProviderShell } from "./provider-shell";
import { ServerCard } from "./experiments/server-experiment";

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ searchParams }: PageProps) {
  const [requestContext, query] = await Promise.all([
    readExperimentRequest(),
    searchParams,
  ]);
  const rawOverride = typeof query.__exp === "string" ? query.__exp : undefined;
  const urlOverrides = parseOverrides(rawOverride);
  const options = {
    ...(requestContext.subjectId === undefined
      ? {}
      : { subjectId: requestContext.subjectId }),
    developerOverrides: urlOverrides,
    qaOverrides: requestContext.overrides,
  };
  const serverAssignment = ServerCard.resolve(options);
  const serverCard = await ServerCard.render(
    { release: "FacetSmith v0.1" },
    options,
  );

  return (
    <ProviderShell
      {...(requestContext.subjectId === undefined
        ? {}
        : { subjectId: requestContext.subjectId })}
      developerOverrides={urlOverrides}
      qaOverrides={requestContext.overrides}
      initialAssignments={{ "server-card": serverAssignment }}
    >
      {serverCard}
    </ProviderShell>
  );
}
