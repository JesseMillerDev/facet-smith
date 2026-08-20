import { readExperimentOptions } from "@facet-smith/next/server";
import { ProviderShell } from "./provider-shell";
import { ServerCard } from "./experiments/server-experiment";

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ searchParams }: PageProps) {
  const options = await readExperimentOptions({ searchParams });
  const serverAssignment = ServerCard.resolve(options);
  const serverCard = await ServerCard.render(
    { release: "FacetSmith v0.1" },
    options,
  );

  return (
    <ProviderShell
      {...options}
      initialAssignments={{ "server-card": serverAssignment }}
    >
      {serverCard}
    </ProviderShell>
  );
}
