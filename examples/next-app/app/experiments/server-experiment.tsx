import { createNextExperiment } from "@facetsmith/next/server";

export interface ServerCardProps {
  readonly release: string;
}

function Technical({ release }: ServerCardProps) {
  return (
    <article
      className="server-card technical"
      data-testid="server-variant"
      data-variant="technical"
    >
      <span className="eyebrow">Server Component experiment</span>
      <h2>Assignment happens before render</h2>
      <p>
        {release} resolves from the anonymous subject and validated cookie
        overrides.
      </p>
      <code>source: server · refresh: explicit</code>
    </article>
  );
}

function Narrative({ release }: ServerCardProps) {
  return (
    <article
      className="server-card narrative"
      data-testid="server-variant"
      data-variant="narrative"
    >
      <span className="eyebrow">Server Component experiment · story</span>
      <h2>The first pixel already knows its variant</h2>
      <p>
        {release} carries the same resolved identity across the React
        server/client boundary.
      </p>
      <code>cookie-backed · hydration-safe</code>
    </article>
  );
}

export const ServerCard = createNextExperiment({
  id: "server-card",
  defaultVariant: "technical",
  variants: {
    technical: { component: Technical, revision: "1" },
    narrative: { component: Narrative, revision: "1" },
  },
  allocation: { technical: 0.5, narrative: 0.5 },
  salt: "example-v1",
});
