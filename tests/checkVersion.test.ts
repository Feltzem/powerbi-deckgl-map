import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  assertVersionsSynced,
  findVersionMismatches,
  getVersionReport,
} = require("../scripts/check-version.cjs") as {
  assertVersionsSynced: (workspaceRoot?: string) => Record<string, string>;
  findVersionMismatches: (
    versionReport: Record<string, string | undefined>,
  ) => Array<[string, string | undefined]>;
  getVersionReport: (workspaceRoot?: string) => Record<string, string>;
};

const writeJson = (filePath: string, value: unknown) => {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const createVersionWorkspace = (version: string): string => {
  const root = path.join(
    process.cwd(),
    ".tmp",
    "tests",
    `version-${Date.now()}-${randomUUID()}`,
  );
  mkdirSync(root, { recursive: true });
  writeJson(path.join(root, "package.json"), { version });
  writeJson(path.join(root, "package-lock.json"), {
    version,
    packages: { "": { version } },
  });
  writeJson(path.join(root, "pbiviz.json"), { visual: { version } });
  return root;
};

test("version checker passes for the current workspace", () => {
  assert.deepEqual(findVersionMismatches(getVersionReport()), []);
});

test("version checker detects package, lockfile, and pbiviz mismatches", () => {
  const root = createVersionWorkspace("1.2.3.4");
  assert.doesNotThrow(() => assertVersionsSynced(root));

  writeJson(path.join(root, "pbiviz.json"), { visual: { version: "1.2.3.5" } });
  assert.throws(() => assertVersionsSynced(root), /Version mismatch/);
});
