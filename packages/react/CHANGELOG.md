# @facet-smith/react

## 0.4.0

### Minor Changes

- a349f2c: Make experiment iteration part of assignment and exposure identity, enforce safe shared prop contracts, observe multi-root and text-only variants correctly, reject conflicting definitions, and add agent-readable source manifests with stable integrity diagnostics.

### Patch Changes

- Updated dependencies [a349f2c]
  - @facet-smith/core@0.2.0
  - @facet-smith/analytics@0.3.0

## 0.3.0

### Minor Changes

- 10e3974: Expose visibility-qualified experiment attribution for existing application
  analytics without imposing event names, transports, persistence, or metric
  semantics. Add neutral attribution types and an assignment helper, the
  `useExposedExperiments()` React hook, documentation, tests, and refreshed agent
  guidance.

### Patch Changes

- Updated dependencies [10e3974]
  - @facet-smith/analytics@0.2.0

## 0.2.1

### Patch Changes

- 0633d0b: Expose inspector DOM marker helpers through a dual ESM/CommonJS `@facet-smith/react/markers` entry point so Playwright tests can import them in CommonJS application repositories.

## 0.2.0

### Minor Changes

- f07adac: Reduce Next.js setup to composable proxy, request-option, and provider helpers; make published ESM imports work in native-node test runners; and expose supported inspector marker utilities for browser tests.
