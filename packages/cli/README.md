# `@facet-smith/cli`

Provides the machine-readable experiment integrity interface and installs the versioned [FacetSmith](https://github.com/JesseMillerDev/facet-smith) agent skill into a repository.

## Usage

Run from the repository root:

```bash
npx @facet-smith/cli init
```

The command writes `.agents/skills/facetsmith/SKILL.md`, a repository-scoped location used by agents that support the open Agent Skills format. It is safe to run repeatedly: an identical skill is left unchanged, while a locally modified skill is never overwritten unless you pass `--force` explicitly.

```bash
npx @facet-smith/cli init --check
npx @facet-smith/cli init --force
npx @facet-smith/cli init --cwd ./path/to/project
```

`--check` exits unsuccessfully when the skill is missing or differs from the packaged version, which makes it suitable for CI. This command does not modify `AGENTS.md`, application source, dependencies, or global agent configuration.

## Agent and CI integrity

```bash
npx @facet-smith/cli check
npx @facet-smith/cli check --json
npx @facet-smith/cli manifest
npx @facet-smith/cli manifest --check facetsmith.manifest.json
```

`check` statically scans TypeScript and TSX without importing application code. It detects definitions created by `defineExperiment`, `createExperiment`, `createClientExperiment`, and `createNextExperiment`, including their explicit-prop curried forms. It reports stable diagnostics for non-static definition identity (`FS100`), invalid definitions (`FS101`), duplicate or conflicting experiment IDs (`FS102`), and non-static resolver identity (`FS103`).

`manifest` emits a deterministic schema-v2 JSON catalog containing each experiment's iteration, variants, revisions, resolver ID, optional allocation, implementation hashes, and source location. Variant hashes cover the specific component declaration and its transitive local source dependencies, using the project's `tsconfig.json` to resolve imports. A traffic-bearing implementation edit therefore produces reviewable drift even when its revision was not bumped, while unrelated module contents do not create false drift. Test, build, coverage, and dependency directories are excluded from discovery.

Commit the emitted JSON when cross-release drift detection is useful, then run `manifest --check <path>` in CI. The comparison is structural, reports identity drift without rewriting the file, and gives a targeted migration message for schema-v1 manifests.
