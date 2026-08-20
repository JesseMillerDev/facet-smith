# Changesets

Package-facing changes need a changeset. Run `pnpm changeset`, select every
affected `@facet-smith/*` package, choose the appropriate semantic version
bump, and write a concise consumer-facing summary.

Documentation, tests, examples, and repository-only tooling do not need a
changeset unless they alter published package behavior.

See [docs/releases.md](../docs/releases.md) for the complete contributor and
maintainer release flow.
