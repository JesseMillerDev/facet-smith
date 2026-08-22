# @facet-smith/cli

## 0.3.0

### Minor Changes

- 030bcac: Delegate variant assignment through public synchronous or asynchronous
  `AssignmentResolver` adapters while retaining the existing FNV-1a resolver as
  the default. FacetSmith now validates resolver output against source variants,
  contains resolver failures and timeouts with stable diagnostics, preserves
  override precedence, and suppresses exposure for unassigned defaults.

  Existing definitions require no changes. To delegate assignment, pass a
  resolver with a static `id` as the second factory argument; source allocation
  may then be omitted. Start a new experiment iteration when migrating an active
  experiment to a different resolver or vendor-key mapping. The CLI manifest is
  now schema v2 and records `resolverId` with optional allocation.

### Patch Changes

- Updated dependencies [030bcac]
  - @facet-smith/core@0.3.0

## 0.2.0

### Minor Changes

- a349f2c: Make experiment iteration part of assignment and exposure identity, enforce safe shared prop contracts, observe multi-root and text-only variants correctly, reject conflicting definitions, and add agent-readable source manifests with stable integrity diagnostics.

### Patch Changes

- Updated dependencies [a349f2c]
  - @facet-smith/core@0.2.0

## 0.1.2

### Patch Changes

- 10e3974: Expose visibility-qualified experiment attribution for existing application
  analytics without imposing event names, transports, persistence, or metric
  semantics. Add neutral attribution types and an assignment helper, the
  `useExposedExperiments()` React hook, documentation, tests, and refreshed agent
  guidance.

## 0.1.1

### Patch Changes

- f07adac: Reduce Next.js setup to composable proxy, request-option, and provider helpers; make published ESM imports work in native-node test runners; and expose supported inspector marker utilities for browser tests.
