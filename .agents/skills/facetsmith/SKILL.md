---
name: facetsmith
description: Add, modify, review, or debug source-native A/B/N experiments with the @facet-smith packages in React or Next.js. Use for FacetSmith definitions, assignment, exposure analytics, inspector overrides, revisions, or integration work; do not use for statistical inference or remote feature-flag control planes.
---

# FacetSmith

Implement experiments as typed, statically imported source components. Preserve the host application's architecture, design system, tests, and authorization boundaries.

## Choose the smallest package surface

- Use `@facet-smith/core` for framework-neutral definitions, assignment resolver contracts, default deterministic resolution, validation, and override serialization.
- Use `@facet-smith/analytics` for the exposure event contract and adapters.
- Use `@facet-smith/react` for client-rendered React experiments and `ExperimentProvider`.
- Use `@facet-smith/next/server` for Next.js App Router Server Component experiments and `readExperimentOptions()`.
- Use `@facet-smith/next/client` for `NextExperimentProvider`, which includes the server-override refresh bridge.
- Use `@facet-smith/next/proxy` to create or compose stable anonymous subject handling.
- Use `@facet-smith/inspector` only as an optional, non-production development dependency (`--save-dev`).

Do not add packages the application does not need. Do not introduce a FacetSmith network service, database, remote markup, or runtime code evaluation.

## Preserve experiment identity

- Keep experiment IDs and variant IDs stable once they have received traffic.
- Treat `(experiment ID, iteration, variant ID, revision)` as an immutable analytics identity.
- Start a new immutable iteration when allocation, salt, eligibility, randomization unit, resolver, or resolver-to-vendor key mapping changes.
- Increment a variant revision after every behavior-bearing change to a traffic-exposed implementation. Never rewrite the meaning of a historical revision.
- Keep default-resolver allocations explicit, non-negative, and totaling one. Allocation may be absent only when a statically identified non-default resolver owns it. Do not change allocation or production experiment state without explicit human authorization.
- Keep each new variant independently reviewable, preferably in a separate source file, while preserving the experiment's shared prop contract.

## Resolve identity safely

- Use a stable, opaque application user, account, or long-lived anonymous ID as `subjectId`. In anonymous Next.js applications, prefer `createExperimentProxy()` or `withExperimentSubject()` over hand-rolled cookie/header code.
- Never use `Math.random()`, an ephemeral render-time ID, an email address, or other analytics-facing personal data for assignment.
- Pass the same subject and compatible pre-resolved assignment through server rendering and hydration.
- When no stable subject exists, accept the default variant. Do not invent a client-only assignment that changes hydrated output.
- Treat overrides as selection among known source-defined variants, never as executable input.

## Delegate assignment safely

- Pass an `AssignmentResolver` as the second argument to `createClientExperiment()` or `createNextExperiment()` when the application or flag platform owns assignment.
- Keep `resolver.id` a static URL-safe string literal so the integrity manifest records assignment identity.
- Treat source variant IDs as authoritative. A resolver-returned unknown ID, failure, or timeout renders the unexposed default with a stable diagnostic.
- Preserve the synchronous path for synchronous resolvers. Await server resolution; let the React factory manage async client fallback.
- Pass targeting data through resolver attributes as opaque application data. Keep vendor SDKs in application adapters, not FacetSmith packages.
- Map experiment iteration into the vendor key or context. Changing that mapping or resolver requires a new iteration.

## Use the correct rendering boundary

For client React components, prefer the explicit shared prop contract `createClientExperiment<Props>()(...)` or its `createExperiment` alias in a client module and render it beneath `ExperimentProvider`. Pass a custom resolver as the factory's second argument.

For Next.js Server Components, prefer `createNextExperiment<Props>()(...)` and use `readExperimentOptions({ searchParams })` from `@facet-smith/next/server`. Await potentially async custom resolution, render with the same options, then pass the same options and initial assignment to `NextExperimentProvider`. A server override requires the validated route handler; the Next provider already mounts the refresh bridge. Do not simulate the switch with client-only state.

## Use the agent integrity interface

Run `facetsmith check --json` before and after changing experiments. Read `facetsmith manifest` when locating definitions or coordinating multiple variants. Keep identity, revisions, resolver IDs, and any source allocation as static literals so the CLI can inspect them without executing application code. Resolve every `FS100`, `FS101`, `FS102`, and `FS103` diagnostic before completion.

Reading subject or override cookies makes personalized Next.js routes request-time rendered. Never place subject-specific HTML in a shared full-page cache. Cache invariant data outside the personalized boundary.

## Report exposure correctly

Assignment is a pure decision; it is not evidence that a user saw a variant. Missing-subject and resolver-failure defaults never emit exposure. Send analytics through an `ExperimentAnalyticsAdapter` and preserve FacetSmith's visible-render exposure semantics and provider-lifetime deduplication. Use `useExposedExperiments()` at an application's analytics boundary to attach visible experiment identities to its existing events; do not invent a FacetSmith-specific event vocabulary or treat unexposed assignments as attribution. The host application remains responsible for consent, transport, retries, conversion definitions, bot policy, sample-ratio checks, and statistical analysis.

Do not infer or declare a winner from exposure events alone.

## Keep the inspector out of production

Load `@facet-smith/inspector` behind a build-time condition so production bundles can omit it. Keep the override endpoint closed in production and do not set `allowInProduction` for normal deployments. Use that escape hatch only when the user explicitly authorizes isolated, access-controlled preview infrastructure.

## Complete changes with evidence

Before changing an experiment, inspect its manifest entry, definition, variants, tests, design tokens, analytics adapter, and server/client seam. State the hypothesis and intended success metric when adding a variant. In inspector-enabled browser tests, use `experimentMarkerSelector()` and `EXPERIMENT_MARKER_ATTRIBUTES` rather than private marker strings. Afterward, run the integrity, type, behavior, accessibility, and supported-viewport checks. Report the exact experiment/iteration/variant/revision change and call out any caching, identity, analytics, or production-safety implications.
