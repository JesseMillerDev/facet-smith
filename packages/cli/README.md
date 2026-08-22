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
```

`check` statically scans TypeScript and TSX without importing application code. It detects definitions created by `defineExperiment`, `createExperiment`, `createClientExperiment`, and `createNextExperiment`, including their explicit-prop curried forms. It reports stable diagnostics for non-static identity (`FS100`), invalid definitions (`FS101`), and duplicate or conflicting experiment IDs (`FS102`).

`manifest` emits a deterministic JSON catalog containing each experiment's iteration, variants, revisions, allocation, and source location. Test, build, coverage, and dependency directories are excluded from discovery.
