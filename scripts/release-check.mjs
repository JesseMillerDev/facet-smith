import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  {
    name: "@facet-smith/core",
    directory: "packages/core",
    archive: "core.tgz",
  },
  {
    name: "@facet-smith/analytics",
    directory: "packages/analytics",
    archive: "analytics.tgz",
  },
  {
    name: "@facet-smith/react",
    directory: "packages/react",
    archive: "react.tgz",
  },
  {
    name: "@facet-smith/next",
    directory: "packages/next",
    archive: "next.tgz",
  },
  {
    name: "@facet-smith/inspector",
    directory: "packages/inspector",
    archive: "inspector.tgz",
  },
  {
    name: "@facet-smith/cli",
    directory: "packages/cli",
    archive: "cli.tgz",
  },
];
const expectedRuntimeExports = {
  "@facet-smith/core": ["defineExperiment", "resolveExperiment", "stableHash"],
  "@facet-smith/analytics": [
    "InMemoryAnalyticsAdapter",
    "createConsoleAnalyticsAdapter",
    "noopAnalyticsAdapter",
    "toExperimentAttribution",
  ],
  "@facet-smith/react": [
    "ExperimentProvider",
    "createClientExperiment",
    "createExperiment",
    "experimentMarkerSelector",
    "useExposedExperiments",
  ],
  "@facet-smith/react/markers": [
    "EXPERIMENT_MARKER_ATTRIBUTES",
    "experimentMarkerSelector",
  ],
  "@facet-smith/next": [
    "EXPERIMENT_OVERRIDE_COOKIE",
    "EXPERIMENT_SUBJECT_COOKIE",
    "EXPERIMENT_SUBJECT_HEADER",
  ],
  "@facet-smith/next/server": ["createNextExperiment", "readExperimentOptions"],
  "@facet-smith/next/proxy": ["createExperimentProxy", "withExperimentSubject"],
  "@facet-smith/inspector": ["ExperimentInspector"],
};

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with ${result.status}`,
    );
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function findNpmCli() {
  const executableDirectory = dirname(process.execPath);
  const candidates = [
    join(executableDirectory, "node_modules", "npm", "bin", "npm-cli.js"),
    resolve(
      executableDirectory,
      "..",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    ),
  ];
  const npmCli = candidates.find(existsSync);
  assert(npmCli, `Could not find npm CLI. Checked: ${candidates.join(", ")}`);
  return npmCli;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function exportTargets(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(exportTargets);
}

function inspectInstalledPackage(consumerDirectory, spec, workspaceVersions) {
  const packageDirectory = join(
    consumerDirectory,
    "node_modules",
    ...spec.name.split("/"),
  );
  const manifestPath = join(packageDirectory, "package.json");
  assert(existsSync(manifestPath), `${spec.name} was not installed`);

  const manifest = readJson(manifestPath);
  assert(
    manifest.name === spec.name,
    `${spec.name} has the wrong package name`,
  );
  assert(
    manifest.license === "MIT",
    `${spec.name} must declare the MIT license`,
  );
  assert(
    existsSync(join(packageDirectory, "README.md")),
    `${spec.name} is missing README.md`,
  );
  assert(
    existsSync(join(packageDirectory, "LICENSE")),
    `${spec.name} is missing LICENSE`,
  );
  assert(
    existsSync(join(packageDirectory, "dist")),
    `${spec.name} is missing dist`,
  );

  for (const forbidden of ["src", "tests", "tsconfig.json"]) {
    assert(
      !existsSync(join(packageDirectory, forbidden)),
      `${spec.name} unexpectedly contains ${forbidden}`,
    );
  }

  for (const target of exportTargets(manifest.exports)) {
    assert(
      target.startsWith("./"),
      `${spec.name} has an invalid export: ${target}`,
    );
    assert(
      existsSync(join(packageDirectory, target)),
      `${spec.name} export target does not exist: ${target}`,
    );
  }

  const binTargets =
    typeof manifest.bin === "string"
      ? [manifest.bin]
      : Object.values(manifest.bin ?? {});
  for (const target of binTargets) {
    assert(
      existsSync(join(packageDirectory, String(target))),
      `${spec.name} bin target does not exist: ${target}`,
    );
  }

  for (const dependencyGroup of [
    manifest.dependencies,
    manifest.optionalDependencies,
    manifest.peerDependencies,
  ]) {
    for (const [dependency, range] of Object.entries(dependencyGroup ?? {})) {
      assert(
        !String(range).startsWith("workspace:"),
        `${spec.name} leaked a workspace protocol for ${dependency}`,
      );
      if (workspaceVersions.has(dependency)) {
        assert(
          range === workspaceVersions.get(dependency),
          `${spec.name} expected ${dependency}@${workspaceVersions.get(dependency)}, received ${range}`,
        );
      }
    }
  }
}

const temporaryRoot = mkdtempSync(join(tmpdir(), "facetsmith-release-check-"));
const consumerDirectory = join(temporaryRoot, "consumer");
const keepArtifacts = process.env.FACETSMITH_KEEP_RELEASE_ARTIFACTS === "1";
const pnpmCli = process.env.npm_execpath;
assert(
  pnpmCli && existsSync(pnpmCli),
  "Run this check through pnpm release:check",
);
const npmCli = findNpmCli();

try {
  const workspaceVersions = new Map(
    packages.map((spec) => {
      const manifest = readJson(join(repoRoot, spec.directory, "package.json"));
      return [manifest.name, manifest.version];
    }),
  );

  console.log("Packing publishable packages...");
  for (const spec of packages) {
    run(
      process.execPath,
      [pnpmCli, "pack", "--out", join(temporaryRoot, spec.archive)],
      join(repoRoot, spec.directory),
    );
  }

  mkdirSync(consumerDirectory);
  const localDependencies = Object.fromEntries(
    packages.map((spec) => [spec.name, `file:../${spec.archive}`]),
  );
  writeFileSync(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "facetsmith-release-smoke-test",
        version: "0.0.0",
        private: true,
        type: "module",
        dependencies: {
          ...localDependencies,
          "@types/node": "24.10.1",
          "@types/react": "19.2.7",
          "@types/react-dom": "19.2.3",
          next: "16.3.1",
          react: "19.2.8",
          "react-dom": "19.2.8",
          typescript: "5.9.3",
        },
      },
      null,
      2,
    )}\n`,
  );

  console.log("Installing tarballs in a clean consumer project...");
  run(
    process.execPath,
    [
      npmCli,
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
    ],
    consumerDirectory,
  );

  console.log("Inspecting installed package contents and manifests...");
  for (const spec of packages) {
    inspectInstalledPackage(consumerDirectory, spec, workspaceVersions);
  }

  const cliDirectory = join(
    consumerDirectory,
    "node_modules",
    "@facet-smith",
    "cli",
  );
  const cliPath = join(cliDirectory, "dist", "cli.js");
  const packagedSkillPath = join(
    cliDirectory,
    "dist",
    "skill",
    "facetsmith",
    "SKILL.md",
  );
  assert(
    readFileSync(cliPath, "utf8").startsWith("#!/usr/bin/env node"),
    "@facet-smith/cli is missing its executable shebang",
  );
  const agentProject = join(temporaryRoot, "agent-project");
  mkdirSync(agentProject);
  run(
    process.execPath,
    [npmCli, "exec", "--", "facetsmith", "init", "--cwd", agentProject],
    consumerDirectory,
  );
  run(
    process.execPath,
    [
      npmCli,
      "exec",
      "--",
      "facetsmith",
      "init",
      "--check",
      "--cwd",
      agentProject,
    ],
    consumerDirectory,
  );
  const installedSkillPath = join(
    agentProject,
    ".agents",
    "skills",
    "facetsmith",
    "SKILL.md",
  );
  assert(
    readFileSync(installedSkillPath, "utf8") ===
      readFileSync(packagedSkillPath, "utf8"),
    "@facet-smith/cli did not install the packaged skill exactly",
  );

  writeFileSync(
    join(consumerDirectory, "runtime-smoke.mjs"),
    `const contracts = ${JSON.stringify(expectedRuntimeExports, null, 2)};

for (const [specifier, expected] of Object.entries(contracts)) {
  const module = await import(specifier);
  for (const name of expected) {
    if (!(name in module)) throw new Error(\`\${specifier} is missing runtime export \${name}\`);
  }
}

console.log("Runtime imports passed.");
`,
  );
  run(process.execPath, ["runtime-smoke.mjs"], consumerDirectory);

  writeFileSync(
    join(consumerDirectory, "runtime-smoke.cjs"),
    `const markers = require("@facet-smith/react/markers");

if (typeof markers.experimentMarkerSelector !== "function") {
  throw new Error("CommonJS marker helper import failed");
}

console.log("CommonJS marker import passed.");
`,
  );
  run(process.execPath, ["runtime-smoke.cjs"], consumerDirectory);

  writeFileSync(
    join(consumerDirectory, "type-smoke.ts"),
    `import { defineExperiment, resolveExperiment, stableHash } from "@facet-smith/core";
import { InMemoryAnalyticsAdapter, toExperimentAttribution, type ExperimentAttribution } from "@facet-smith/analytics";
import { ExperimentProvider, createClientExperiment, useExposedExperiments } from "@facet-smith/react";
import { experimentMarkerSelector } from "@facet-smith/react/markers";
import { EXPERIMENT_OVERRIDE_COOKIE } from "@facet-smith/next";
import { createNextExperiment, readExperimentOptions, readExperimentRequest } from "@facet-smith/next/server";
import { NextExperimentProvider, NextExperimentRefresh } from "@facet-smith/next/client";
import { createExperimentProxy } from "@facet-smith/next/proxy";
import { ExperimentInspector } from "@facet-smith/inspector";

void [
  defineExperiment,
  resolveExperiment,
  stableHash,
  InMemoryAnalyticsAdapter,
  toExperimentAttribution,
  ExperimentProvider,
  createClientExperiment,
  useExposedExperiments,
  experimentMarkerSelector,
  EXPERIMENT_OVERRIDE_COOKIE,
  createNextExperiment,
  readExperimentOptions,
  readExperimentRequest,
  NextExperimentProvider,
  NextExperimentRefresh,
  createExperimentProxy,
  ExperimentInspector,
];

const attribution: ExperimentAttribution = {
  experimentId: "release-check",
  variantId: "control",
  variantRevision: "1",
  assignmentSource: "default",
};
void attribution;
`,
  );
  writeFileSync(
    join(consumerDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: "ES2022",
        },
        include: ["type-smoke.ts", "proxy.ts"],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(consumerDirectory, "proxy.ts"),
    `import { createExperimentProxy } from "@facet-smith/next/proxy";

export const proxy = createExperimentProxy();
`,
  );
  run(
    process.execPath,
    [
      join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      "tsconfig.json",
    ],
    consumerDirectory,
  );

  const appDirectory = join(consumerDirectory, "app");
  mkdirSync(appDirectory);
  writeFileSync(
    join(appDirectory, "layout.tsx"),
    `import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return <html><body>{children}</body></html>;
}
`,
  );
  writeFileSync(
    join(appDirectory, "client-check.tsx"),
    `"use client";

import { ExperimentInspector } from "@facet-smith/inspector";
import { NextExperimentProvider } from "@facet-smith/next/client";

export function ClientCheck() {
  return (
    <NextExperimentProvider
      inspector={{
        component: ExperimentInspector,
        enabled: true,
        environment: "release-check",
      }}
    >
      <span>FacetSmith ready</span>
    </NextExperimentProvider>
  );
}
`,
  );
  writeFileSync(
    join(appDirectory, "page.tsx"),
    `import { createNextExperiment } from "@facet-smith/next/server";
import { ClientCheck } from "./client-check.js";

export default function Page() {
  void createNextExperiment;
  return <ClientCheck />;
}
`,
  );
  console.log("Building a Next.js consumer from the packed packages...");
  run(
    process.execPath,
    [
      join(consumerDirectory, "node_modules", "next", "dist", "bin", "next"),
      "build",
    ],
    consumerDirectory,
  );

  console.log(`Release check passed for ${packages.length} packages.`);
} finally {
  if (keepArtifacts) {
    console.log(`Release artifacts retained at ${temporaryRoot}`);
  } else {
    const expectedPrefix = join(tmpdir(), "facetsmith-release-check-");
    assert(
      temporaryRoot.startsWith(expectedPrefix),
      `Refusing to remove unexpected path: ${temporaryRoot}`,
    );
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}
