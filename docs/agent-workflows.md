# Safe agent workflows

Install the versioned repository skill with `npx @facet-smith/cli init`. It writes `.agents/skills/facetsmith/SKILL.md` and refuses to replace local changes unless `--force` is explicit. Commit the installed skill when the repository team wants every compatible coding agent to discover the same FacetSmith guidance.

A coding agent adding a variant must:

1. Inspect the existing component, tests, tokens, and design system.
2. State a falsifiable product hypothesis and intended success metric.
3. Preserve the experiment's public prop contract.
4. Create the variant in a separate source file so it remains independently reviewable.
5. Assign a new immutable revision identity.
6. Register the source component in the experiment definition without silently altering existing IDs.
7. Run type, accessibility, visual, and behavior checks at supported viewports.
8. Preview and exercise it through the non-production inspector.
9. Never change traffic allocation or production state without explicit human authorization.
10. Increment the revision after every traffic-bearing implementation change; never rewrite historical identity.

Agents should avoid generated remote markup, hidden runtime dependencies, or direct control-plane mutations. A change request should include the hypothesis, screenshots or visual evidence, test output, accessibility notes, and the exact definition/revision diff. Future agent-generated PR automation is roadmap work, not part of v0.1.
