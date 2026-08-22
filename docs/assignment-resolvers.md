# Assignment resolvers

FacetSmith owns experiment identity, source-defined variants, override
precedence, and visibility-qualified exposure. An `AssignmentResolver` lets an
application or external flag platform own bucketing, targeting, ramping, and
kill switches without gaining authority to introduce runtime variants.

## Contract

```ts
interface AssignmentResolver {
  readonly id: string;
  resolve(
    request: AssignmentRequest,
  ): AssignmentResolverResult | PromiseLike<AssignmentResolverResult>;
}
```

FacetSmith invokes a resolver only when a stable subject exists and no valid
developer or QA override applies. The request contains the experiment ID,
iteration, declared variant IDs, optional source allocation, default variant,
subject ID, opaque targeting attributes, optional salt, and an `AbortSignal`.
The resolver returns either an exposure-eligible assignment or an ineligible
selection. Both carry a source-defined variant ID. An ineligible result must
also carry at least one stable diagnostic reason and renders without exposure:

```ts
type AssignmentResolverResult =
  | {
      decision: "assigned";
      variantId: string;
      bucket?: number;
      diagnostics?: readonly AssignmentDiagnostic[];
    }
  | {
      decision: "ineligible";
      variantId: string;
      diagnostics: readonly [AssignmentDiagnostic, ...AssignmentDiagnostic[]];
    };
```

Keep targeting and coverage reasons distinct when the vendor exposes them.
Both suppress exposure in v0.1, but they represent different populations for
debugging and future holdout analysis. The resolver does not choose assignment
source or resolver identity; FacetSmith adds those to the final result.

Resolver IDs are immutable assignment identities. Keep `id` a static URL-safe
string literal so `facetsmith manifest` can record it. Changing resolver,
eligibility, allocation, randomization unit, or the vendor key mapping requires
a new experiment iteration.

## Source authority and failures

`request.variantIds` is authoritative. If a resolver returns any other ID,
FacetSmith renders the source-defined default, suppresses exposure, and adds
the stable `FS200` diagnostic. Do not translate an unknown vendor value to a
known value inside an adapter; the mismatch should remain visible.

Resolvers are isolated from the host render path:

- A synchronous throw or asynchronous rejection produces `FS201`.
- An asynchronous resolver exceeding the assignment timeout produces `FS202`
  and aborts the request signal. JavaScript cannot preempt synchronous work.
- A runtime resolver that reports ineligible without the required reason gets
  the defensive `FS203` diagnostic.
- All three failures render the default and emit no exposure.
- Missing subjects bypass the resolver, render the default synchronously, and
  emit no exposure.
- An `ineligible` decision renders its declared source variant, preserves its
  diagnostics, and emits no exposure. Forced non-experiment values can
  therefore take effect without contaminating experiment observations.

Assignment itself never emits analytics. A successful resolver assignment is
reported only after its rendered source component becomes visible. Overrides
remain higher priority and retain their existing developer/QA assignment
sources.

## Synchronous and asynchronous use

A synchronous resolver keeps `resolveExperiment()` and the framework factory's
resolution path synchronous. An async resolver returns a promise only when it
is actually consulted. Overrides and missing-subject fallback remain
synchronous even when the configured resolver is async.

Next.js server experiments await resolution before selecting and rendering a
source component. This is the recommended vendor integration path. When a
server assignment crosses a client hydration seam, pass that
`AssignmentResult` through `initialAssignments` and configure the same
resolver on the client definition.

If an application deliberately resolves on the client, pass an explicit
`{ fallback: Component }` or `{ fallback: null }` as the third
`createClientExperiment` argument. FacetSmith never paints the default variant
implicitly while pending. Omitting the fallback renders nothing and warns in
development because it can introduce layout shift.

The default timeout is exported as `DEFAULT_ASSIGNMENT_TIMEOUT_MS`. Override it
with `timeoutMs` in core/Next resolve options or `assignmentTimeoutMs` on
`ExperimentProvider`.

## External service example

Keep the vendor client or endpoint in application code; `@facet-smith/core`
does not acquire its dependency.

```ts
import type { AssignmentResolver } from "@facet-smith/core";

export const applicationFlags = {
  id: "application-flags-v1",
  async resolve(request) {
    const response = await fetch("https://flags.example.com/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        flagKey: `${request.experimentId}.${request.iteration}`,
        subjectId: request.subjectId,
        attributes: request.attributes,
      }),
      signal: request.signal,
    });
    if (!response.ok)
      throw new Error(`Flag service returned ${response.status}`);
    const body = (await response.json()) as { variantId: string };
    return { decision: "assigned", variantId: body.variantId };
  },
} as const satisfies AssignmentResolver;
```

Configure it on either source factory. Allocation may be omitted because this
resolver owns it:

```ts
const Hero = createClientExperiment(
  {
    id: "pricing-hero",
    iteration: "external-flags-1",
    defaultVariant: "control",
    variants: {
      control: { revision: "1", component: Control },
      concise: { revision: "1", component: Concise },
    },
  },
  applicationFlags,
);
```

The same second argument is accepted by `createNextExperiment`. Pass targeting
data through `assignmentAttributes` on `ExperimentProvider` or `attributes` in
core/Next resolution options. FacetSmith treats attributes as opaque and does
not log, persist, or include them in exposure events.

See `examples/custom-resolver` for typechecked client and server usage.
For a production server adapter, see `@facet-smith/growthbook`.
