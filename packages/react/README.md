# `@facet-smith/react`

Typed, source-native client experiments for React applications, powered by [FacetSmith](https://github.com/JesseMillerDev/facet-smith).

## Install

```bash
pnpm add @facet-smith/react react react-dom
```

## Example

```tsx
"use client";

import { ExperimentProvider, createClientExperiment } from "@facet-smith/react";

interface HeroProps {
  title: string;
}

const PricingHero = createClientExperiment<HeroProps>()({
  id: "pricing-hero",
  iteration: "launch-1",
  defaultVariant: "control",
  variants: {
    control: {
      revision: "1",
      component: ({ title }: HeroProps) => <h1>{title}</h1>,
    },
    concise: {
      revision: "1",
      component: ({ title }: HeroProps) => <h1>{title}, simply.</h1>,
    },
  },
  allocation: { control: 0.5, concise: 0.5 },
});

export function App() {
  return (
    <ExperimentProvider subjectId="stable-user-id">
      <PricingHero title="Choose your plan" />
    </ExperimentProvider>
  );
}
```

The explicit generic is the shared prop contract every variant must accept. Direct calls remain supported and infer the safe intersection of variant props. The runtime distinguishes assignment from actual visible exposure, supports iteration-matched server assignments, and safely renders the default without a provider. The optional inspector is a separate package and is not required in production bundles.

Pass an `AssignmentResolver` as the factory's second argument when an external flag platform owns assignment. Its allocation may be omitted from source. Prefer server-resolved vendor integration. A deliberately async client resolver must pass an explicit `{ fallback: Component }` or `{ fallback: null }` as the third factory argument; otherwise FacetSmith renders nothing and warns in development. See the [resolver authoring guide](https://github.com/JesseMillerDev/facet-smith/blob/main/docs/assignment-resolvers.md).

Use visibility-qualified experiment attribution at the application's existing
analytics boundary:

```tsx
import { useExposedExperiments } from "@facet-smith/react";

function ShareButton() {
  const attribution = useExposedExperiments();

  return (
    <button
      onClick={() =>
        appAnalytics.track("document_shared", {
          experiment_attribution: attribution.exposures,
        })
      }
    >
      Share
    </button>
  );
}
```

The hook returns an empty snapshot before content becomes visible and when no
provider exists. FacetSmith does not replace the application's event vocabulary
or analytics transport.

When browser tests need to target an inspected experiment, use the public marker helper instead of spelling FacetSmith's DOM attributes yourself:

```ts
import {
  EXPERIMENT_MARKER_ATTRIBUTES,
  experimentMarkerSelector,
} from "@facet-smith/react/markers";

const marker = page.locator(experimentMarkerSelector("pricing-hero"));
await expect(marker).toHaveAttribute(
  EXPERIMENT_MARKER_ATTRIBUTES.variant,
  "concise",
);
```

These markers are emitted only while the inspector is enabled, so they do not add production DOM attributes.

For Next.js Server Components, use [`@facet-smith/next`](https://www.npmjs.com/package/@facet-smith/next) rather than hiding server/client boundaries behind this factory.
