import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scanExperimentSources } from "./integrity";

export * from "./integrity";

export const SKILL_RELATIVE_PATH = join(
  ".agents",
  "skills",
  "facetsmith",
  "SKILL.md",
);

export type InstallStatus =
  | "installed"
  | "updated"
  | "unchanged"
  | "missing"
  | "outdated"
  | "conflict";

export interface InstallOptions {
  readonly cwd?: string;
  readonly force?: boolean;
  readonly check?: boolean;
  readonly sourcePath?: string;
}

export interface InstallResult {
  readonly status: InstallStatus;
  readonly projectDirectory: string;
  readonly targetPath: string;
}

interface Output {
  log(message: string): void;
  error(message: string): void;
}

interface ParsedArguments {
  readonly kind: "help" | "init" | "check" | "manifest" | "error";
  readonly cwd?: string;
  readonly force?: boolean;
  readonly check?: boolean;
  readonly manifestPath?: string;
  readonly json?: boolean;
  readonly message?: string;
}

const help = `FacetSmith CLI

Usage:
  facetsmith init [--cwd <path>] [--check] [--force]
  facetsmith check [--cwd <path>] [--json]
  facetsmith manifest [--cwd <path>] [--check <manifest.json>]

Options:
  --cwd <path>  Install relative to this project directory
  --check       Verify the packaged skill, or compare a committed manifest
  --force       Replace a locally modified FacetSmith skill
  --json        Emit stable machine-readable diagnostics
  --help        Show this help
`;

function packagedSkillPath(): string {
  const bundled = fileURLToPath(
    new URL("./skill/facetsmith/SKILL.md", import.meta.url),
  );
  if (existsSync(bundled)) return bundled;

  const repositorySource = fileURLToPath(
    new URL("../../../.agents/skills/facetsmith/SKILL.md", import.meta.url),
  );
  if (existsSync(repositorySource)) return repositorySource;

  throw new Error("The packaged FacetSmith skill could not be found.");
}

export function installSkill(options: InstallOptions = {}): InstallResult {
  const projectDirectory = resolve(options.cwd ?? process.cwd());
  if (
    !existsSync(projectDirectory) ||
    !statSync(projectDirectory).isDirectory()
  ) {
    throw new Error(`Project directory does not exist: ${projectDirectory}`);
  }

  const targetPath = join(projectDirectory, SKILL_RELATIVE_PATH);
  const source = readFileSync(
    options.sourcePath ?? packagedSkillPath(),
    "utf8",
  );

  if (existsSync(targetPath)) {
    const current = readFileSync(targetPath, "utf8");
    if (current === source) {
      return { status: "unchanged", projectDirectory, targetPath };
    }
    if (options.check) {
      return { status: "outdated", projectDirectory, targetPath };
    }
    if (!options.force) {
      return { status: "conflict", projectDirectory, targetPath };
    }

    writeFileSync(targetPath, source);
    return { status: "updated", projectDirectory, targetPath };
  }

  if (options.check) {
    return { status: "missing", projectDirectory, targetPath };
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, source, { flag: "wx" });
  return { status: "installed", projectDirectory, targetPath };
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  if (argv.length === 0 || argv.includes("--help")) return { kind: "help" };
  const command = argv[0];
  if (command !== "init" && command !== "check" && command !== "manifest") {
    return { kind: "error", message: `Unknown command: ${argv[0]}` };
  }

  let cwd: string | undefined;
  let force = false;
  let check = false;
  let manifestPath: string | undefined;
  let json = false;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force") {
      if (command !== "init") {
        return { kind: "error", message: `Unknown option: ${argument}` };
      }
      force = true;
    } else if (argument === "--check") {
      if (command === "manifest") {
        manifestPath = argv[index + 1];
        if (!manifestPath || manifestPath.startsWith("--")) {
          return {
            kind: "error",
            message: "manifest --check requires a JSON path",
          };
        }
        index += 1;
      } else if (command !== "init") {
        return { kind: "error", message: `Unknown option: ${argument}` };
      } else {
        check = true;
      }
    } else if (argument === "--json") {
      if (command !== "check") {
        return { kind: "error", message: `Unknown option: ${argument}` };
      }
      json = true;
    } else if (argument === "--cwd") {
      cwd = argv[index + 1];
      if (!cwd || cwd.startsWith("--")) {
        return { kind: "error", message: "--cwd requires a path" };
      }
      index += 1;
    } else {
      return { kind: "error", message: `Unknown option: ${argument}` };
    }
  }

  if (force && check) {
    return { kind: "error", message: "--force and --check cannot be combined" };
  }

  return {
    kind: command,
    ...(cwd ? { cwd } : {}),
    ...(force ? { force: true } : {}),
    ...(check ? { check: true } : {}),
    ...(manifestPath ? { manifestPath } : {}),
    ...(json ? { json: true } : {}),
  };
}

export function runCli(
  argv: readonly string[],
  output: Output = console,
): number {
  const parsed = parseArguments(argv);
  if (parsed.kind === "help") {
    output.log(help);
    return 0;
  }
  if (parsed.kind === "error") {
    output.error(parsed.message ?? "Invalid arguments");
    output.error(help);
    return 1;
  }

  try {
    if (parsed.kind === "check" || parsed.kind === "manifest") {
      const result = scanExperimentSources(parsed.cwd);
      if (parsed.kind === "manifest") {
        if (!result.valid) {
          output.error(JSON.stringify(result, null, 2));
          return 1;
        }
        if (!parsed.manifestPath) {
          output.log(JSON.stringify(result.manifest, null, 2));
          return 0;
        }

        const projectDirectory = resolve(parsed.cwd ?? process.cwd());
        const manifestPath = resolve(projectDirectory, parsed.manifestPath);
        if (!existsSync(manifestPath)) {
          output.error(
            `Committed FacetSmith manifest is missing: ${manifestPath}`,
          );
          return 1;
        }
        let committed: unknown;
        try {
          committed = JSON.parse(readFileSync(manifestPath, "utf8"));
        } catch (error) {
          output.error(
            `Could not read committed FacetSmith manifest: ${error instanceof Error ? error.message : String(error)}`,
          );
          return 1;
        }
        const schemaVersion =
          committed && typeof committed === "object"
            ? (committed as { readonly schemaVersion?: unknown }).schemaVersion
            : undefined;
        if (schemaVersion === 1) {
          output.error(
            "Committed FacetSmith manifest uses schema v1. Regenerate it with `facetsmith manifest`; schema v2 records resolver identity.",
          );
          return 1;
        }
        if (schemaVersion !== 2) {
          output.error(
            `Committed FacetSmith manifest has unsupported schema version ${String(schemaVersion)}; expected 2.`,
          );
          return 1;
        }
        if (JSON.stringify(committed) !== JSON.stringify(result.manifest)) {
          output.error(
            `FacetSmith manifest drift detected: ${manifestPath}. Regenerate it with \`facetsmith manifest\` and review the identity changes.`,
          );
          return 1;
        }
        output.log(`FacetSmith manifest check passed: ${manifestPath}`);
        return 0;
      }
      if (parsed.json) {
        output.log(JSON.stringify(result));
      } else if (result.valid) {
        output.log(
          `FacetSmith check passed: ${result.manifest.experiments.length} experiment definition(s).`,
        );
      } else {
        for (const diagnostic of result.diagnostics) {
          output.error(
            `${diagnostic.source.file}:${diagnostic.source.line}:${diagnostic.source.column} ${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`,
          );
        }
      }
      return result.valid ? 0 : 1;
    }

    const result = installSkill({
      ...(parsed.cwd ? { cwd: parsed.cwd } : {}),
      ...(parsed.force ? { force: true } : {}),
      ...(parsed.check ? { check: true } : {}),
    });
    const displayPath = relative(result.projectDirectory, result.targetPath);

    if (result.status === "conflict") {
      output.error(
        `${displayPath} has local changes; rerun with --force to replace it.`,
      );
      return 1;
    }
    if (result.status === "missing" || result.status === "outdated") {
      output.error(
        `FacetSmith skill check failed: ${result.status} ${displayPath}`,
      );
      return 1;
    }

    output.log(`FacetSmith skill ${result.status}: ${displayPath}`);
    return 0;
  } catch (error) {
    output.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
