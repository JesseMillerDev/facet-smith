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

  it("checks a committed manifest and reports identity drift", () => {
    const projectDirectory = temporaryProject();
    const sourceDirectory = join(projectDirectory, "src");
    mkdirSync(sourceDirectory);
    const sourcePath = join(sourceDirectory, "hero.ts");
    writeFileSync(
      sourcePath,
      `
        import { defineExperiment } from "@facet-smith/core";
        defineExperiment({
          id: "hero",
          iteration: "launch-1",
          defaultVariant: "control",
          variants: { control: { revision: "1" } },
          allocation: { control: 1 },
        });
      `,
    );
    const manifestPath = join(projectDirectory, "facetsmith.manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify(scanExperimentSources(projectDirectory).manifest, null, 2),
    );
    const logs: string[] = [];
    const errors: string[] = [];

    expect(
      runCli(["manifest", "--cwd", projectDirectory, "--check", manifestPath], {
        log: (message) => logs.push(message),
        error: (message) => errors.push(message),
      }),
    ).toBe(0);
    expect(logs.join("\n")).toContain("manifest check passed");
    expect(errors).toEqual([]);

    writeFileSync(
      sourcePath,
      readFileSync(sourcePath, "utf8").replace("launch-1", "launch-2"),
    );
    expect(
      runCli(["manifest", "--cwd", projectDirectory, "--check", manifestPath], {
        log: (message) => logs.push(message),
        error: (message) => errors.push(message),
      }),
    ).toBe(1);
    expect(errors.at(-1)).toContain("manifest drift detected");
  });

  it("reports drift when an imported variant implementation changes without a revision bump", () => {
    const projectDirectory = temporaryProject();
    const sourceDirectory = join(projectDirectory, "src");
    mkdirSync(sourceDirectory);
    const variantPath = join(sourceDirectory, "control.tsx");
    writeFileSync(
      variantPath,
      `export function Control() { return <button>Get it now</button>; }`,
    );
    writeFileSync(
      join(sourceDirectory, "experiment.tsx"),
      `
        import { createClientExperiment } from "@facet-smith/react";
        import { Control } from "./control";
        createClientExperiment({
          id: "checkout-copy",
          iteration: "launch-1",
          defaultVariant: "control",
          variants: { control: { revision: "1", component: Control } },
          allocation: { control: 1 },
        });
      `,
    );
    const manifestPath = join(projectDirectory, "facetsmith.manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify(scanExperimentSources(projectDirectory).manifest, null, 2),
    );
    const errors: string[] = [];

    writeFileSync(
      variantPath,
      `export function Control() { return <button>Get it today</button>; }`,
    );

    expect(
      runCli(["manifest", "--cwd", projectDirectory, "--check", manifestPath], {
        log: () => undefined,
        error: (message) => errors.push(message),
      }),
    ).toBe(1);
    expect(errors).toEqual([
      expect.stringContaining("manifest drift detected"),
    ]);
  });

  it("hashes variant implementations imported through tsconfig path aliases", () => {
    const projectDirectory = temporaryProject();
    const sourceDirectory = join(projectDirectory, "src");
    const componentDirectory = join(sourceDirectory, "components");
    mkdirSync(sourceDirectory);
    mkdirSync(componentDirectory);
    writeFileSync(
      join(projectDirectory, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          jsx: "preserve",
          module: "esnext",
          moduleResolution: "bundler",
          paths: { "@/*": ["src/*"] },
        },
        include: ["src"],
      }),
    );
    const variantPath = join(componentDirectory, "hero.tsx");
    writeFileSync(
      variantPath,
      `export function Hero() { return <h1>Original hero</h1>; }`,
    );
    writeFileSync(
      join(sourceDirectory, "experiment.tsx"),
      `
        import { createClientExperiment } from "@facet-smith/react";
        import { Hero } from "@/components/hero";
        createClientExperiment({
          id: "aliased-hero",
          iteration: "launch-1",
          defaultVariant: "control",
          variants: { control: { revision: "1", component: Hero } },
          allocation: { control: 1 },
        });
      `,
    );
    const originalHash =
      scanExperimentSources(projectDirectory).manifest.experiments[0]?.variants
        .control?.implementationHash;

    writeFileSync(
      variantPath,
      `export function Hero() { return <h1>Replacement hero</h1>; }`,
    );

    expect(
      scanExperimentSources(projectDirectory).manifest.experiments[0]?.variants
        .control?.implementationHash,
    ).not.toBe(originalHash);
  });

  it("does not hash unrelated contents of a relative variant module", () => {
    const projectDirectory = temporaryProject();
    const sourceDirectory = join(projectDirectory, "src");
    mkdirSync(sourceDirectory);
    const variantPath = join(sourceDirectory, "control.tsx");
    const variantSource = `export function Control() { return <button>Buy now</button>; }`;
    writeFileSync(variantPath, variantSource);
    writeFileSync(
      join(sourceDirectory, "experiment.tsx"),
      `
        import { createClientExperiment } from "@facet-smith/react";
        import { Control } from "./control";
        createClientExperiment({
          id: "checkout-copy",
          iteration: "launch-1",
          defaultVariant: "control",
          variants: { control: { revision: "1", component: Control } },
          allocation: { control: 1 },
        });
      `,
    );
    const originalHash =
      scanExperimentSources(projectDirectory).manifest.experiments[0]?.variants
        .control?.implementationHash;

    writeFileSync(
      variantPath,
      `${variantSource}\n// Unrelated module comment.\n`,
    );

    expect(
      scanExperimentSources(projectDirectory).manifest.experiments[0]?.variants
        .control?.implementationHash,
    ).toBe(originalHash);
  });

  it("hashes transitive same-file dependencies of a variant", () => {
    const projectDirectory = temporaryProject();
    const sourceDirectory = join(projectDirectory, "src");
    mkdirSync(sourceDirectory);
    const experimentPath = join(sourceDirectory, "experiment.tsx");
    const experimentSource = (label: string) => `
      import { createClientExperiment } from "@facet-smith/react";
      function buttonLabel() { return "${label}"; }
      function Control() { return <button>{buttonLabel()}</button>; }
      createClientExperiment({
        id: "checkout-copy",
        iteration: "launch-1",
        defaultVariant: "control",
        variants: { control: { revision: "1", component: Control } },
        allocation: { control: 1 },
      });
    `;
    writeFileSync(experimentPath, experimentSource("Buy now"));
    const originalHash =
      scanExperimentSources(projectDirectory).manifest.experiments[0]?.variants
        .control?.implementationHash;

    writeFileSync(experimentPath, experimentSource("Buy today"));

    expect(
      scanExperimentSources(projectDirectory).manifest.experiments[0]?.variants
        .control?.implementationHash,
    ).not.toBe(originalHash);
  });

  it("gives a targeted migration message for a schema-v1 manifest", () => {
    const projectDirectory = temporaryProject();
    const manifestPath = join(projectDirectory, "facetsmith.manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({ schemaVersion: 1, experiments: [] }),
    );
    const errors: string[] = [];

    expect(
      runCli(["manifest", "--cwd", projectDirectory, "--check", manifestPath], {
        log: () => undefined,
        error: (message) => errors.push(message),
      }),
    ).toBe(1);
    expect(errors).toEqual([expect.stringContaining("schema v1")]);
  });

  it("records a custom resolver and permits resolver-owned allocation", () => {
    const projectDirectory = temporaryProject();
    const sourceDirectory = join(projectDirectory, "src");
    mkdirSync(sourceDirectory);
    writeFileSync(
      join(sourceDirectory, "custom.tsx"),
      `
        import { createClientExperiment } from "@facet-smith/react";
        const resolver = {
          id: "application-flags",
          resolve: () => ({ decision: "assigned", variantId: "control" }),
        } as const;
        createClientExperiment({
          id: "custom-hero",
          iteration: "launch-1",
          defaultVariant: "control",
          variants: {
            control: { revision: "1", component: () => null },
            concise: { revision: "1", component: () => null },
          },
        }, resolver);
      `,
    );

    const result = scanExperimentSources(projectDirectory);
    expect(result).toMatchObject({
      schemaVersion: 2,
      valid: true,
      manifest: {
        schemaVersion: 2,
        experiments: [
          {
            id: "custom-hero",
            resolverId: "application-flags",
          },
        ],
      },
    });
    expect(result.manifest.experiments[0]).not.toHaveProperty("allocation");
  });

  it("diagnoses missing default allocation and non-static resolver IDs", () => {
    const projectDirectory = temporaryProject();
    const sourceDirectory = join(projectDirectory, "src");
    mkdirSync(sourceDirectory);
    writeFileSync(
      join(sourceDirectory, "invalid.tsx"),
      `
        import { createClientExperiment } from "@facet-smith/react";
        createClientExperiment({
          id: "missing-allocation",
          iteration: "launch-1",
          defaultVariant: "control",
          variants: { control: { revision: "1", component: () => null } },
        });
        const dynamicId: string = process.env.RESOLVER_ID ?? "flags";
        createClientExperiment({
          id: "dynamic-resolver",
          iteration: "launch-1",
          defaultVariant: "control",
          variants: { control: { revision: "1", component: () => null } },
        }, { id: dynamicId, resolve: () => ({ decision: "assigned", variantId: "control" }) });
      `,
    );

    const result = scanExperimentSources(projectDirectory);
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "FS101",
          experimentId: "missing-allocation",
          path: "allocation",
        }),
        expect.objectContaining({ code: "FS103", path: "resolver.id" }),
      ]),
    );
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
