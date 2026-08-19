import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installSkill, SKILL_RELATIVE_PATH } from "../src/index";

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
