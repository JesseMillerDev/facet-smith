import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const source = resolve(
  scriptDirectory,
  "../../../.agents/skills/facetsmith/SKILL.md",
);
const target = resolve(scriptDirectory, "../dist/skill/facetsmith/SKILL.md");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
