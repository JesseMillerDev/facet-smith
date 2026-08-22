# `@facet-smith/growthbook`

Server-resolved GrowthBook assignment for [FacetSmith](https://github.com/JesseMillerDev/facet-smith). GrowthBook owns targeting, allocation, rollout, forced values, and sticky storage; FacetSmith keeps source variants authoritative and records exposure only after visible render.

## Install

```bash
pnpm add @facet-smith/core @facet-smith/next @facet-smith/growthbook @growthbook/growthbook
```

## Next.js server usage

Initialize one `GrowthBookClient` outside the request path, then pass the adapter to a server experiment:

```tsx
import { GrowthBookClient } from "@growthbook/growthbook";
import {
  createGrowthBookResolver,
  growthBookIterationKey,
} from "@facet-smith/growthbook";
import { createNextExperiment } from "@facet-smith/next/server";

const growthbook = new GrowthBookClient({
  clientKey: process.env.GROWTHBOOK_CLIENT_KEY,
});
await growthbook.init({ timeout: 2_000 });

const growthBookResolver = createGrowthBookResolver({ client: growthbook });

const Hero = createNextExperiment(
  {
    id: "pricing-hero",
    iteration: "launch-1",
    defaultVariant: "control",
    variants: {
      control: { revision: "1", component: Control },
      concise: { revision: "1", component: Concise },
    },
  },
  growthBookResolver,
);

// Configure this exact feature key in GrowthBook. Its string values must be
// the source variant IDs: "control" and "concise".
growthBookIterationKey("pricing-hero", "launch-1");
// => "facetsmith-12-pricing-hero-8-launch-1"
```

Call `await Hero.resolve(options)` or `await Hero.render(props, options)` during the Server Component render. Pass the returned assignment through `initialAssignments` if a matching client boundary hydrates below it.

Do not configure a GrowthBook `trackingCallback` on the client used by this adapter. GrowthBook invokes that callback at evaluation time, while FacetSmith deliberately waits for visible render. Send exposure through the FacetSmith analytics adapter instead.

## Identity and sticky bucketing

The adapter generates one GrowthBook feature key per `(experiment ID, iteration)`. GrowthBook sticky documents use `experimentKey__bucketVersion`; the adapter rejects an experiment rule whose explicit key differs from its generated feature key with `FSGB106`. This prevents a new FacetSmith iteration from inheriting a stale GrowthBook assignment.

To enable server sticky storage, pass a GrowthBook `StickyBucketService`. Loading sticky documents makes resolver execution asynchronous, which the Next server factory awaits before rendering:

```ts
const growthBookResolver = createGrowthBookResolver({
  client: growthbook,
  stickyBucketService: redisStickyBuckets,
});
```

Changing the key prefix, subject attribute, GrowthBook rule mapping, resolver, or eligibility semantics requires a new FacetSmith iteration.

## Anonymous subjects

FacetSmith remains the identity owner. Supply the long-lived first-party anonymous cookie as `subjectId`; the adapter writes it to GrowthBook's `id` attribute by default. To use GrowthBook's documented anonymous attribute instead:

```ts
createGrowthBookResolver({
  client: growthbook,
  subjectAttribute: "anonymousId",
});
```

The adapter never mints an identifier. Additional attributes remain available through FacetSmith assignment attributes, including a secondary anonymous ID used as a GrowthBook sticky fallback attribute.

## Non-assignment diagnostics

Only a GrowthBook result with `source: "experiment"`, `inExperiment: true`, and `hashUsed: true` is exposure-eligible. Forced, overridden, missing, defaulted, and prerequisite-blocked values render a declared source variant without exposure and carry stable `FSGB1xx` diagnostics.

GrowthBook 1.7's public result currently reports both targeting misses and coverage exclusion as `source: "defaultValue"`. The adapter therefore emits `FSGB101` for that combined state. FacetSmith's resolver contract preserves arbitrary distinct reason codes, so the adapter can separate those populations if a future GrowthBook SDK exposes them without changing core.

This package is intentionally server-first. It performs no feature fetches during resolution and does not provide a React client integration.
