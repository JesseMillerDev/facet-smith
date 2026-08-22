import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  installSkill,
  runCli,
  scanExperimentSources,
  SKILL_RELATIVE_PATH,
} from "../src/index";

const temporaryDirectories: string[] = [];

function temporaryProject(): string {
  const directory = mkdtempSync(join(tmpdir(), "facetsmith-cli-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("FacetSmith skill installer", () => {
  it("installs the repository skill and is idempotent", () => {
    const projectDirectory = temporaryProject();

    const installed = installSkill({ cwd: projectDirectory });
    expect(installed.status).toBe("installed");
    expect(readFileSync(installed.targetPath, "utf8")).toContain(
      "name: facetsmith",
    );

    const unchanged = installSkill({ cwd: projectDirectory });
    expect(unchanged.status).toBe("unchanged");
    expect(unchanged.targetPath).toBe(
      join(projectDirectory, SKILL_RELATIVE_PATH),
    );
  });

  it("preserves local changes unless force is explicit", () => {
    const projectDirectory = temporaryProject();
    const installed = installSkill({ cwd: projectDirectory });
    writeFileSync(installed.targetPath, "local instructions\n");

    expect(installSkill({ cwd: projectDirectory }).status).toBe("conflict");
    expect(readFileSync(installed.targetPath, "utf8")).toBe(
      "local instructions\n",
    );

    expect(installSkill({ cwd: projectDirectory, force: true }).status).toBe(
      "updated",
    );
    expect(readFileSync(installed.targetPath, "utf8")).toContain(
      "name: facetsmith",
    );
  });

  it("checks missing and outdated installations without writing", () => {
    const projectDirectory = temporaryProject();
    expect(installSkill({ cwd: projectDirectory, check: true }).status).toBe(
      "missing",
    );

    const installed = installSkill({ cwd: projectDirectory });
    writeFileSync(installed.targetPath, "old skill\n");
    expect(installSkill({ cwd: projectDirectory, check: true }).status).toBe(
      "outdated",
    );
    expect(readFileSync(installed.targetPath, "utf8")).toBe("old skill\n");
  });
});

describe("FacetSmith integrity commands", () => {
  it("builds a deterministic manifest from source definitions", () => {
    const projectDirectory = temporaryProject();
    const sourceDirectory = join(projectDirectory, "src");
    mkdirSync(sourceDirectory);
    writeFileSync(
      join(sourceDirectory, "hero.tsx"),
      `
        import { createClientExperiment } from "@facet-smith/react";
        const Hero = createClientExperiment<{ name: string }>()({
          id: "hero",
          iteration: "launch-1",
          defaultVariant: "control",
          variants: {
            control: { revision: "1", component: () => null },
            concise: { revision: "1", component: () => null },
          },
          allocation: { control: 0.5, concise: 0.5 },
        });
      `,
    );

    const result = scanExperimentSources(projectDirectory);
    expect(result.valid).toBe(true);
    expect(result.manifest.experiments).toEqual([
      expect.objectContaining({
        id: "hero",
        iteration: "launch-1",
        source: expect.objectContaining({ file: "src/hero.tsx" }),
      }),
    ]);
  });

  it("emits stable JSON diagnostics for conflicting IDs", () => {
    const projectDirectory = temporaryProject();
    const sourceDirectory = join(projectDirectory, "src");
    mkdirSync(sourceDirectory);
    const definition = (iteration: string) => `
      import { defineExperiment } from "@facet-smith/core";
      defineExperiment({
        id: "hero",
        iteration: "${iteration}",
        defaultVariant: "control",
        variants: { control: { revision: "1" } },
        allocation: { control: 1 },
      });
    `;
    writeFileSync(join(sourceDirectory, "first.ts"), definition("launch-1"));
    writeFileSync(join(sourceDirectory, "second.ts"), definition("launch-2"));
    writeFileSync(join(sourceDirectory, "third.ts"), definition("launch-1"));
    const logs: string[] = [];
    const errors: string[] = [];

    const exitCode = runCli(["check", "--cwd", projectDirectory, "--json"], {
      log: (message) => logs.push(message),
      error: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors).toEqual([]);
    const result = JSON.parse(logs.join("")) as {
      valid: boolean;
      diagnostics: Array<{ code: string; experimentId?: string }>;
    };
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "FS102", experimentId: "hero" }),
    );
    expect(
      result.diagnostics.filter(({ code }) => code === "FS102"),
    ).toHaveLength(2);
  });

  it("resolves supported aliases and namespaces without matching unrelated factories", () => {
    const projectDirectory = temporaryProject();
    const sourceDirectory = join(projectDirectory, "src");
    mkdirSync(sourceDirectory);
    writeFileSync(
      join(sourceDirectory, "experiments.tsx"),
      `
        import { createClientExperiment as makeExperiment } from "@facet-smith/react";
        import * as Core from "@facet-smith/core";
        import { createExperiment as unrelatedImport } from "another-package";

        makeExperiment({
          id: "aliased",
          iteration: "launch-1",
          defaultVariant: "control",
          variants: { control: { revision: "1", component: () => null } },
          allocation: { control: 1 },
        });
        Core.defineExperiment({
          id: "namespaced",
          iteration: "launch-1",
          defaultVariant: "control",
          variants: { control: { revision: "1" } },
          allocation: { control: 1 },
        });
        unrelatedImport(dynamicDefinition);
        function localScope(createClientExperiment: (value: unknown) => unknown) {
          createClientExperiment(dynamicDefinition);
        }
      `,
    );

    const result = scanExperimentSources(projectDirectory);
    expect(result.valid).toBe(true);
    expect(result.manifest.experiments.map(({ id }) => id)).toEqual([
      "aliased",
      "namespaced",
    ]);
  });

  it("follows local barrel exports and renamed re-exports", () => {
    const projectDirectory = temporaryProject();
    const sourceDirectory = join(projectDirectory, "src");
    mkdirSync(sourceDirectory);
    writeFileSync(
      join(sourceDirectory, "experiment-api.ts"),
      `
        export { createClientExperiment } from "@facet-smith/react";
        export { defineExperiment as defineFacet } from "@facet-smith/core";
      `,
    );
    writeFileSync(
      join(sourceDirectory, "experiments.tsx"),
      `
        import { createClientExperiment } from "./experiment-api";
        import { defineFacet as defineRenamed } from "./experiment-api";

        createClientExperiment({
          id: "barrel-client",
          iteration: "launch-1",
          defaultVariant: "control",
          variants: { control: { revision: "1", component: () => null } },
          allocation: { control: 1 },
        });
        defineRenamed({
          id: "barrel-core",
          iteration: "launch-1",
          defaultVariant: "control",
          variants: { control: { revision: "1" } },
          allocation: { control: 1 },
        });
      `,
    );

    const result = scanExperimentSources(projectDirectory);
    expect(result.valid).toBe(true);
    expect(result.manifest.experiments.map(({ id }) => id)).toEqual([
      "barrel-client",
      "barrel-core",
    ]);
  });

  it("skips generated, build, dependency, and vendor directories", () => {
    const projectDirectory = temporaryProject();
    for (const directory of [
      ".pnpm-store",
      ".turbo",
      "build",
      "node_modules",
      "out",
      "vendor",
    ]) {
      const ignoredDirectory = join(projectDirectory, directory);
      mkdirSync(ignoredDirectory);
      writeFileSync(
        join(ignoredDirectory, "generated.ts"),
        `
          import { defineExperiment } from "@facet-smith/core";
          defineExperiment(dynamicDefinition);
        `,
      );
    }

    expect(scanExperimentSources(projectDirectory)).toMatchObject({
      valid: true,
      manifest: { experiments: [] },
      diagnostics: [],
    });
  });
});
