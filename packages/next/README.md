# `@facet-smith/next`

Next.js App Router integration for server- and client-rendered [FacetSmith](https://github.com/JesseMillerDev/facet-smith) experiments.

## Install

```bash
pnpm add @facet-smith/next @facet-smith/react react next
```

## Server Component example

```tsx
import {
  createNextExperiment,
  readExperimentRequest,
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

export default async function Page() {
  const request = await readExperimentRequest();
  return Hero.render(
    { title: "Hello" },
    { subjectId: request.subjectId, qaOverrides: request.overrides },
  );
}
```

Public entry points:

- `@facet-smith/next` exports shared cookie and header constants.
- `@facet-smith/next/server` resolves Server Component variants and provides validated request/route helpers.
- `@facet-smith/next/client` exports the router-refresh bridge used after server override changes.

Server switches require a cookie update and `router.refresh()`. Reading experiment cookies makes personalized routes request-time rendered, so do not cache personalized HTML across subjects. See the complete [Next.js guide](https://github.com/JesseMillerDev/facet-smith/blob/main/docs/nextjs.md).
