# @facet-smith/core

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

## 0.2.0

### Minor Changes

- a349f2c: Make experiment iteration part of assignment and exposure identity, enforce safe shared prop contracts, observe multi-root and text-only variants correctly, reject conflicting definitions, and add agent-readable source manifests with stable integrity diagnostics.
