---
"@facet-smith/core": minor
"@facet-smith/react": minor
"@facet-smith/next": minor
"@facet-smith/cli": minor
---

Delegate variant assignment through public synchronous or asynchronous
`AssignmentResolver` adapters while retaining the existing FNV-1a resolver as
the default. FacetSmith now validates resolver output against source variants,
contains resolver failures and timeouts with stable diagnostics, preserves
override precedence, and suppresses exposure for unassigned defaults.

Existing definitions require no changes. To delegate assignment, pass a
resolver with a static `id` as the second factory argument; source allocation
may then be omitted. Start a new experiment iteration when migrating an active
experiment to a different resolver or vendor-key mapping. The CLI manifest is
now schema v2 and records `resolverId` with optional allocation.
