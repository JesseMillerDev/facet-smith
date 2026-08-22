# Safe agent workflows

Install the versioned repository skill with `npx @facet-smith/cli init`. It writes `.agents/skills/facetsmith/SKILL.md` and refuses to replace local changes unless `--force` is explicit. Commit the installed skill when the repository team wants every compatible coding agent to discover the same FacetSmith guidance.

Before editing, run `npx @facet-smith/cli check --json` and read `npx @facet-smith/cli manifest`. These provide the machine-readable experiment topology, immutable identities, and exact source locations without executing application code. Run the check again after editing; completion requires an error-free manifest plus the host application's type, behavior, accessibility, and viewport checks.

A coding agent adding a variant must:

1. Inspect the existing component, tests, tokens, and design system.
2. State a falsifiable product hypothesis and intended success metric.
3. Preserve the explicit shared prop contract (`createClientExperiment<Props>()` or `createNextExperiment<Props>()`).
4. Create the variant in a separate source file so it remains independently reviewable.
5. Assign a new immutable revision identity.
6. Register the source component in the experiment definition without silently altering existing IDs.
7. Run type, accessibility, visual, and behavior checks at supported viewports.
8. Preview and exercise it through the non-production inspector.
9. Never change traffic allocation or production state without explicit human authorization.
10. Increment the revision after every traffic-bearing implementation change; never rewrite historical identity.
11. Start a new immutable iteration when allocation, salt, eligibility, randomization unit, or assignment provider changes.

Agents should keep variants as static source, dependencies explicit, and production traffic changes human-authorized. A change request should include the hypothesis, screenshots or visual evidence, test output, accessibility notes, and the exact definition/iteration/revision diff. Automated variant generation, preview matrices, and lifecycle mutations can build on the integrity manifest without bypassing these approval points.
