# `@facet-smith/core`

Framework-neutral experiment definition, validation, deterministic assignment, and override utilities for [FacetSmith](https://github.com/JesseMillerDev/facet-smith).

## Install

```bash
pnpm add @facet-smith/core
```

## Example

```ts
import { defineExperiment, resolveExperiment } from "@facet-smith/core";

const pricing = defineExperiment({
  id: "pricing-hero",
  iteration: "launch-1",
  defaultVariant: "control",
  variants: {
    control: { revision: "1" },
    concise: { revision: "1" },
  },
  allocation: { control: 0.5, concise: 0.5 },
});

const assignment = resolveExperiment(pricing, {
  subjectId: "stable-user-id",
});
```

Assignments are stable across Node.js and browsers. Without a stable subject ID, resolution safely uses the default variant. Overrides select only known source-defined variants and never evaluate code or remote markup.

Variant revisions are immutable implementation identities. Iterations are immutable experimental-run identities and participate in bucketing. Increment a revision after any traffic-bearing implementation change; start a new iteration when assignment semantics change.

See the [architecture guide](https://github.com/JesseMillerDev/facet-smith/blob/main/docs/architecture.md) for hashing, precedence, and trust-boundary details.
