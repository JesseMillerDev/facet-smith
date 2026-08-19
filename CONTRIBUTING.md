# Contributing

Use Node.js 22 and pnpm 10. Run `pnpm install`, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm playwright test` before opening a change. Add tests for behavior changes and a changeset-style summary in the pull request. Variant implementations that have received traffic must receive a new revision rather than reusing an existing analytics identity.

Please keep core framework-neutral, avoid telemetry and network dependencies, and discuss breaking public API changes before implementation.
