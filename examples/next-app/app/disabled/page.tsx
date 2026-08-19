import { readExperimentRequest } from "@facetsmith/next/server";
import { ProviderShell } from "../provider-shell";
import { ServerCard } from "../experiments/server-experiment";

export default async function DisabledPage() {
  const requestContext = await readExperimentRequest();
  const options = {
    ...(requestContext.subjectId === undefined
      ? {}
      : { subjectId: requestContext.subjectId }),
    qaOverrides: requestContext.overrides,
  };
  return (
    <ProviderShell
      {...(requestContext.subjectId === undefined
        ? {}
        : { subjectId: requestContext.subjectId })}
      forceDisabled
      initialAssignments={{ "server-card": ServerCard.resolve(options) }}
    >
      {await ServerCard.render(
        { release: "Inspector-disabled preview" },
        options,
      )}
    </ProviderShell>
  );
}
