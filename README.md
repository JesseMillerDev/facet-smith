# FacetSmith

[![CI](https://github.com/JesseMillerDev/facet-smith/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JesseMillerDev/facet-smith/actions/workflows/ci.yml)
[![npm: core](https://img.shields.io/npm/v/@facet-smith/core?label=npm%20core)](https://www.npmjs.com/package/@facet-smith/core)
[![npm: CLI](https://img.shields.io/npm/v/@facet-smith/cli?label=npm%20CLI)](https://www.npmjs.com/package/@facet-smith/cli)
[![License: MIT](https://img.shields.io/github/license/JesseMillerDev/facet-smith)](LICENSE)

FacetSmith is a source-native A/B/N experimentation framework for typed React components and Next.js App Router applications.

> **Project status:** v0.1, suitable for evaluation and early adopters. The public packages are available from npm under the `@facet-smith/*` scope.

Variants are ordinary reviewable source-code components with immutable identities. FacetSmith validates definitions, assigns a stable variant from an application-provided subject ID, records exposure only when rendered content becomes visible, and optionally exposes a non-production in-app inspector. It does **not** provide statistical analysis, remote flags, authentication, a database, injected markup, telemetry, or a hosted control plane.

## Install

Install the framework-neutral runtime, analytics contracts, and React bindings:

```bash
npm install @facet-smith/core @facet-smith/analytics @facet-smith/react
```

For Next.js App Router support, add:

```bash
npm install @facet-smith/next
```

The non-production inspector is deliberately separate:

```bash
npm install --save-dev @facet-smith/inspector
```

## Agent setup

Install the versioned FacetSmith skill into a consuming repository with:

```bash
npx @facet-smith/cli init
```

This writes `.agents/skills/facetsmith/SKILL.md`. Running it again is safe; a locally modified skill is preserved unless `--force` is explicit. Use `npx @facet-smith/cli init --check` in CI to verify that the checked-in skill matches the installed CLI version. The CLI does not use an npm lifecycle script and never modifies application source, dependencies, `AGENTS.md`, or global agent configuration.

## Five-minute client experiment

```tsx
"use client";

import { ExperimentProvider, createExperiment } from "@facet-smith/react";

interface HeroProps {
  title: string;
}
const Control = ({ title }: HeroProps) => <h1>{title}</h1>;
const Concise = ({ title }: HeroProps) => <h1>{title}, simply.</h1>;

const PricingHero = createExperiment({
  id: "pricing-hero",
  defaultVariant: "control",
  variants: {
    control: { component: Control, revision: "1" },
    concise: { component: Concise, revision: "1" },
  },
  allocation: { control: 0.5, concise: 0.5 },
});

export function App() {
  return (
    <ExperimentProvider subjectId="stable-application-user-id">
      <PricingHero title="Choose your plan" />
    </ExperimentProvider>
  );
}
```

Props and variant names remain inferred. Without a provider, an experiment safely renders its default and does not report exposure. Without a stable subject, the provider also uses the default—there is no random hydration-time assignment.

## Next.js Server Component experiment

Server and client experiments intentionally use different factories. A server experiment is resolved before rendering and its switch requires a cookie mutation plus `router.refresh()`:

```tsx
// experiments/hero.tsx — Server Component module
import {
  createNextExperiment,
  readExperimentOptions,
} from "@facet-smith/next/server";

export const Hero = createNextExperiment({
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

Anonymous assignment is one line in `proxy.ts`:

```ts
import { createExperimentProxy } from "@facet-smith/next/proxy";

export const proxy = createExperimentProxy();
```

Wrap the experiment subtree with `NextExperimentProvider` to enable visible-render exposure and server override refresh. See [the Next.js guide](docs/nextjs.md) for an existing-proxy composition example, the validated route handler, caching implications, and authenticated identity.

## Inspector setup

The inspector is disabled unless explicitly enabled. `environment: "production"` disables it even when an override URL is present. The noisy `allowInProduction: true` escape hatch exists for tightly controlled environments but is strongly discouraged.

```tsx
const buildEnabled = process.env.NEXT_PUBLIC_EXPERIMENT_INSPECTOR === "true";
const Inspector = buildEnabled
  ? dynamic(
      () => import("@facet-smith/inspector").then((m) => m.ExperimentInspector),
      { ssr: false },
    )
  : undefined;

<ExperimentProvider
  inspector={{
    enabled: buildEnabled,
    environment: process.env.NEXT_PUBLIC_DEPLOYMENT_ENV ?? "development",
    ...(Inspector ? { component: Inspector } : {}),
    serverOverrideEndpoint: "/api/experiment-overrides",
  }}
>
  {children}
</ExperimentProvider>;
```

The compile-time branch lets a production build omit the optional inspector chunk. Overrides are stored as `?__exp=pricing-hero:concise,server-hero:narrative`. URL values win over localStorage values for the same experiment; invalid syntax is ignored and unknown variants are rejected when definitions register. See [inspector.md](docs/inspector.md).

## Analytics

Pass any `ExperimentAnalyticsAdapter` to the provider. The runtime emits at most one exposure per experiment/variant/revision in a provider lifetime after `IntersectionObserver` reports visible content. In platforms without `IntersectionObserver`, a rendered DOM descendant emits on mount as the documented compatibility fallback. Assignment by itself never emits.

```tsx
import { createConsoleAnalyticsAdapter } from "@facet-smith/analytics";

<ExperimentProvider
  analytics={createConsoleAnalyticsAdapter()}
  subjectId={user.id}
>
  {children}
</ExperimentProvider>;
```

To attribute the application's existing events, call
`useExposedExperiments()` once at its analytics boundary and add the returned
visibility-qualified identities to the normal event properties. FacetSmith
does not require experiment-specific event names or impose a metric vocabulary.
Delayed or offline outcomes can instead be joined to exposure events through
the same stable subject/account identity.

See [analytics.md](docs/analytics.md), including a dependency-free PostHog adapter example.

## Revision semantics

**A revision is an immutable analytics identity.** Once a variant has received traffic, any behavior-bearing implementation change must increment its revision. `pricing-hero / concise / revision 1` and revision 2 are deliberately distinct exposures and must not be silently combined.

## Production safety, SSR, and caching

- Use stable authenticated IDs when available; otherwise mint a long-lived anonymous, first-party subject cookie. Never use `Math.random()`.
- Supply the same subject and pre-resolved assignments to server and client. React requires hydration output to match; suppressing warnings is not a resolution strategy.
- Reading cookies opts a Next.js route into request-time rendering. Do not cache personalized HTML across subjects. If application caching is required, cache invariant data outside the personalized boundary.
- Keep the inspector endpoint closed in production, do not set `allowInProduction`, and compile out the inspector component.
- Override input selects only statically imported variants. It never evaluates code, JSON templates, or remote markup.
- Analytics adapters must handle consent, transport security, retries, and data policy for the host application.

## Packages

| Package                  | Responsibility                                                     |
| ------------------------ | ------------------------------------------------------------------ |
| `@facet-smith/core`      | Validation, FNV-1a hashing, weighted resolution, override URLs     |
| `@facet-smith/analytics` | Vendor-neutral exposure event contract and basic adapters          |
| `@facet-smith/react`     | Provider, typed client factory, registry, visibility exposure      |
| `@facet-smith/next`      | Server factory, request cookies, validated handler, router refresh |
| `@facet-smith/inspector` | Optional portal-based non-production overlay and toolbar           |
| `@facet-smith/cli`       | Explicit repository-scoped agent skill installer                   |

The example is in `examples/next-app`; design notes are in [architecture.md](docs/architecture.md).

## Current limitations

- Allocation is static source configuration and totals exactly one; there is no ramping control plane.
- Exposure deduplication is in-memory per provider lifetime, not a cross-tab/session guarantee.
- Server switches make an HTTP round trip and App Router refresh.
- The overlay targets DOM-rendering React applications and uses the union of descendant rectangles; unusual portals or canvas-only variants cannot be outlined automatically.
- v0.1 has no statistical inference, mutual exclusion groups, traffic namespaces, bot filtering, consent framework, or React Native adapter.

## Roadmap

Deferred work includes a hosted control plane, GitHub application, agent-generated variant PRs, visual regression service, statistical result analysis, automated ramping/rollback, winner-promotion and cleanup PRs, experiment memory, and additional frameworks. These are not implemented in v0.1.

## Development and contribution

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm release:check
pnpm release:status
pnpm exec playwright install chromium
pnpm playwright test
```

`pnpm release:check` builds and packs every public package, installs the tarballs into a clean temporary consumer project, and verifies package contents, runtime imports, and TypeScript declarations. It does not publish anything.

Package changes use Changesets and independently version each public package. See [CONTRIBUTING.md](CONTRIBUTING.md), [releases.md](docs/releases.md), [SECURITY.md](SECURITY.md), and [agent-workflows.md](docs/agent-workflows.md). This project uses the [MIT license](LICENSE), has no telemetry, and creates no external resources.
