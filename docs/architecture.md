# Architecture

FacetSmith follows one dependency direction: `core` is framework-free; `analytics` describes events; `react` consumes both; `next` and `inspector` integrate through React's public boundary and registry APIs. Production React rendering never imports the inspector.

## Resolution flow

Definitions are validated before use. Resolution checks a valid developer override, then a valid explicit QA override, then hashes the framed tuple `(experiment ID, subject ID, salt, iteration)` into a bucket in `[0, 1)`. Sorted variant IDs and normalized source allocations turn that bucket into a variant. Without a subject, resolution uses the default. Static source definitions fail fast in every environment; fallback behavior is reserved for external assignment adapters.

The hash is 32-bit FNV-1a over JavaScript UTF-16 code units with `Math.imul`. This deliberately small implementation has no runtime dependencies and has golden tests locking both hash and assignment vectors across Node and browsers.

## Assignment versus exposure

Assignment is a pure decision and has no side effects. A rendered experiment places a `display: contents` boundary around its output. It observes every top-level rendered element with `IntersectionObserver` and follows DOM changes for delayed content. Text-only output receives a non-layout sentinel; null-rendering variants remain unexposed. The provider deduplicates the `(experiment, iteration, variant, revision)` identity for its lifetime. The boundary carries `data-experiment-*` attributes only while the inspector is enabled.

## State ownership

Each provider owns its definition registry, inspector registrations, overrides, exposure set, and latest visibly exposed attribution per experiment. Conflicting definitions with the same ID fail loudly within that provider; there is no process-global registry, so Server Component requests cannot leak identity or assignments. Pre-resolved assignments enter through provider props and are accepted only when iteration, variant, and revision match the local definition. Applications can read the provider-lifetime attribution snapshot to enrich their existing analytics; FacetSmith does not persist it or intercept application events.

## Agent integrity

The CLI statically reads source object literals without importing application code. `facetsmith check --json` and `facetsmith manifest` share the core validation and fingerprint rules with runtime providers. Their stable diagnostics and source locations form the seam used by coding agents and CI.

## Trust boundaries

Overrides are URL-safe ID pairs, never executable structures. Parsing tolerates malformed input; definition-aware layers reject unknown experiment and variant IDs. The Next route handler is explicitly configured, defaults closed in production, sets an HttpOnly SameSite cookie, and accepts only known source-defined variants.
