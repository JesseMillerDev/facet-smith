# Contributing

Use Node.js 22 and pnpm 10. Run `pnpm install`, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm release:check`, and `pnpm playwright test` before opening a change. The release check builds every publishable package, packs the npm artifacts, installs them into a clean consumer project, and verifies their files, runtime exports, and TypeScript declarations.

Add tests for behavior changes. Changes to published package behavior must include a Changesets entry created with `pnpm changeset`; documentation, tests, examples, and repository-only tooling do not need one unless they alter published behavior. Package changes must include accurate package-level README guidance and pass `pnpm release:check`. See `docs/releases.md` for versioning and publishing details. Variant implementations that have received traffic must receive a new revision rather than reusing an existing analytics identity.

The canonical FacetSmith agent skill lives at `.agents/skills/facetsmith/SKILL.md`. Changes to it must also pass the skill validator and the packaged CLI installation check included in `pnpm release:check`.

Please keep core framework-neutral, avoid telemetry and network dependencies, and discuss breaking public API changes before implementation.
