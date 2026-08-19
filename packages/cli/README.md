# `@facet-smith/cli`

Installs the versioned [FacetSmith](https://github.com/JesseMillerDev/facet-smith) agent skill into a repository.

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
