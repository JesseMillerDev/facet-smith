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

const PricingHero = createClientExperiment({
  id: "pricing-hero",
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

The runtime distinguishes assignment from actual visible exposure, supports server-provided initial assignments, and safely renders the default without a provider. The optional inspector is a separate package and is not required in production bundles.

When browser tests need to target an inspected experiment, use the public marker helper instead of spelling FacetSmith's DOM attributes yourself:

```ts
import {
  EXPERIMENT_MARKER_ATTRIBUTES,
  experimentMarkerSelector,
} from "@facet-smith/react";

const marker = page.locator(experimentMarkerSelector("pricing-hero"));
await expect(marker).toHaveAttribute(
  EXPERIMENT_MARKER_ATTRIBUTES.variant,
  "concise",
);
```

These markers are emitted only while the inspector is enabled, so they do not add production DOM attributes.

For Next.js Server Components, use [`@facet-smith/next`](https://www.npmjs.com/package/@facet-smith/next) rather than hiding server/client boundaries behind this factory.
