# Custom assignment resolver example

This typechecked example uses one application-owned async resolver with both
the React client factory and the Next.js server factory. The source definitions
omit allocation because the external service owns bucketing and targeting.

The endpoint is intentionally illustrative and is not contacted by repository
tests or builds. See [`docs/assignment-resolvers.md`](../../docs/assignment-resolvers.md)
for the complete contract and failure semantics.
