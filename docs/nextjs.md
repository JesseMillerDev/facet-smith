# Next.js App Router integration

The example targets Next.js 16 App Router. It uses asynchronous `cookies()`/`headers()` request APIs and the current `proxy.ts` request interception convention. Proxy exists only to establish the anonymous subject before the first render: it forwards the new subject in a request header and persists the same value in a long-lived HttpOnly cookie. This prevents a default first render followed by a different assigned render.

For an application without an existing Proxy:

```ts
import { createExperimentProxy } from "@facet-smith/next/proxy";

export const proxy = createExperimentProxy();

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
```

For an application that already owns Proxy, keep that logic in one function and compose it:

```ts
import { withExperimentSubject } from "@facet-smith/next/proxy";
import { applicationProxy } from "./src/application-proxy";

export const proxy = withExperimentSubject(applicationProxy);
```

The existing proxy receives a `NextRequest` that already contains the subject header. Redirects and produced responses only need the persisted response cookie. A continuing `NextResponse.next()` is automatically upgraded to forward the subject. If the existing proxy supplies its own request-header allow-list, it must retain `x-experiment-subject`; FacetSmith rejects an incompatible response rather than silently allowing the first render to disagree with later renders.

Authenticated applications should skip anonymous generation and pass their own stable, opaque account or user ID to both `read`/resolution code and `ExperimentProvider`. Avoid email addresses or other analytics-facing personal data. If neither identity exists, FacetSmith renders the default and reports exposures without a subject ID.

## Overrides and route handler

`readExperimentOptions({ searchParams })` combines the subject, URL developer overrides, and persisted QA override cookie into the options accepted directly by `resolve()` and `render()`:

```tsx
export default async function Page({ searchParams }: PageProps) {
  const options = await readExperimentOptions({ searchParams });
  const assignment = Hero.resolve(options);
  const hero = await Hero.render({ title: "Hello" }, options);

  return (
    <NextExperimentProvider
      {...options}
      initialAssignments={{ [Hero.definition.id]: assignment }}
    >
      {hero}
    </NextExperimentProvider>
  );
}
```

`NextExperimentProvider` includes `NextExperimentRefresh`, so applications do not need to mount the refresh bridge separately. `readExperimentRequest()` remains available as the lower-level cookie/header reader.

Define the override route beside the application registry:

```ts
import { createOverrideRouteHandler } from "@facet-smith/next/server";
import { ServerCard } from "../../experiments/server-card";

export const POST = createOverrideRouteHandler({
  definitions: [ServerCard.definition],
  enabled: process.env.NEXT_PUBLIC_EXPERIMENT_INSPECTOR === "true",
  environment: process.env.NEXT_PUBLIC_DEPLOYMENT_ENV ?? "development",
  secure: process.env.NODE_ENV === "production",
});
```

When the inspector changes a registered server experiment, the provider posts the validated change, the route writes `__facetsmith_overrides`, and the integration calls `router.refresh()`. The server then resolves and renders the new component. This round trip is intentional; Server Components cannot be switched reliably as client-only state.

## URL and cookie precedence

The example treats URL overrides as developer overrides and the reserved cookie as explicit QA overrides, yielding URL → cookie → deterministic assignment → default. This makes copied links reproducible while retaining persisted QA state. Client localStorage is loaded after hydration and URL values win over localStorage for matching IDs.

## SSR, caching, and hydration

Pass the server assignment through `initialAssignments` when the same experiment has a client boundary. A matching variant and revision is reused during hydration. Reading request cookies makes that route dynamic; never place personalized output in a shared full-page cache. Static data can still be fetched/cached outside this request-specific resolution. Streaming does not permit setting cookies during Server Component render, which is why all mutations use a route handler.
