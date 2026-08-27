---
"@facet-smith/cli": patch
---

Resolve project `tsconfig.json` path aliases when hashing variants, and limit hashes to each component declaration plus its transitive local dependencies so unrelated file edits do not create drift while helper changes remain detectable.
