# `@facet-smith/next`

Next.js App Router integration for server- and client-rendered [FacetSmith](https://github.com/JesseMillerDev/facet-smith) experiments.

## Install

```bash
pnpm add @facet-smith/next
```

## Server Component example

```tsx
import {
  createNextExperiment,
  readExperimentOptions,
} from "@facet-smith/next/server";

const Hero = createNextExperiment({
  id: "server-hero",
  defaultVariant: "control",
  variants: {
    control: { revision: "1", component: Control },
    narrative: { revision: "1", component: Narrative },
  },
  allocation: { control: 0.5, narrative: 0.5 },
});

export default async function Page({ searchParams }) {
  const options = await readExperimentOptions({ searchParams });
  return Hero.render({ title: "Hello" }, options);
}
```

For an anonymous subject, create `proxy.ts`:

```ts
import { createExperimentProxy } from "@facet-smith/next/proxy";

export const proxy = createExperimentProxy();
```

If the application already owns Proxy, compose it without duplicating its logic:

```ts
import { withExperimentSubject } from "@facet-smith/next/proxy";
import { applicationProxy } from "./src/application-proxy";

export const proxy = withExperimentSubject(applicationProxy);
```

The wrapped proxy receives the subject-injected request. If it forwards a custom request-header allow-list, that allow-list must retain `x-experiment-subject`; FacetSmith throws rather than silently assigning a different first render.

Public entry points:

- `@facet-smith/next` exports shared cookie and header constants.
- `@facet-smith/next/server` resolves Server Component variants and provides consolidated request options plus validated route helpers.
- `@facet-smith/next/client` exports `NextExperimentProvider`, which includes the router-refresh bridge used after server override changes.
- `@facet-smith/next/proxy` creates or composes anonymous-subject Proxy behavior.

Server switches require a cookie update and `router.refresh()`. Reading experiment cookies makes personalized routes request-time rendered, so do not cache personalized HTML across subjects. See the complete [Next.js guide](https://github.com/JesseMillerDev/facet-smith/blob/main/docs/nextjs.md).
