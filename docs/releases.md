# Releases

FacetSmith uses Changesets with independent versions for its public packages.
That keeps changes to the CLI or inspector from forcing unrelated runtime
packages to publish, while Changesets still updates internal dependency ranges
when a dependency changes.

## Contributor flow

For a pull request that changes a published package:

1. Run `pnpm changeset`.
2. Select every affected `@facet-smith/*` package.
3. Choose the semantic version impact and write a concise, consumer-facing
   summary.
4. Commit the generated Markdown file under `.changeset/` with the change.

Documentation, tests, examples, and repository-only tooling do not require a
changeset unless they alter published behavior. Use `pnpm release:status` to
preview the pending release plan.

## Maintainer flow

Every push to `main` runs the Release workflow. When changesets are present,
the workflow creates or updates a `chore: version packages` pull request. That
pull request consumes the changesets, updates package versions and changelogs,
and updates internal dependency ranges.

To publish:

1. Review and merge the version pull request after CI passes.
2. Open **Actions → Release → Run workflow**, select `main`, and run it.
3. Approve the `npm` deployment environment if protection rules are enabled.

The publish job runs the complete package artifact check, publishes every new
version to npm, pushes package tags, and creates GitHub releases. Publishing is
manual by design; ordinary pushes to `main` can only manage the version pull
request.

The workflow uses npm trusted publishing. Each npm package must trust this
exact identity:

- GitHub owner: `JesseMillerDev`
- Repository: `facet-smith`
- Workflow filename: `release.yml`
- Environment: `npm`
- Allowed action: `npm publish`

The publish job grants `id-token: write`, runs on a GitHub-hosted runner, and
pins an OIDC-capable npm CLI. Do not add `NPM_TOKEN` or `NODE_AUTH_TOKEN` to the
job after trusted publishing is configured.

## One-time v0.1.0 bootstrap

npm trusted publishers are configured from an existing package's settings, so
the initial package versions must be published once with maintainer
credentials. Do not manually dispatch the Release workflow before completing
this bootstrap.

From a clean `main` checkout, while logged in as an npm owner:

```bash
npm whoami
pnpm install --frozen-lockfile
pnpm release:publish
git push origin --tags
```

`pnpm release:publish` runs `pnpm release:check` before publishing. For the
initial release it publishes the six currently-unpublished `0.1.0` packages
and creates their local package tags. After pushing the tags, create the
matching GitHub releases, configure the trusted publisher above on all six npm
package settings pages, and use only the manual Release workflow for future
publishes.
