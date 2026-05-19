const fs = require("node:fs");
const path = require("node:path");

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const getVersionReport = (workspaceRoot = process.cwd()) => {
  const packageJson = readJson(path.join(workspaceRoot, "package.json"));
  const packageLock = readJson(path.join(workspaceRoot, "package-lock.json"));
  const pbivizJson = readJson(path.join(workspaceRoot, "pbiviz.json"));

  return {
    "package.json": packageJson.version,
    "package-lock.json": packageLock.version,
    "package-lock.json packages[\"\"]": packageLock.packages?.[""]?.version,
    "pbiviz.json visual.version": pbivizJson.visual?.version,
  };
};

const findVersionMismatches = (versionReport) => {
  const expectedVersion = versionReport["package.json"];
  return Object.entries(versionReport).filter(
    ([, version]) => version !== expectedVersion,
  );
};

const assertVersionsSynced = (workspaceRoot = process.cwd()) => {
  const versionReport = getVersionReport(workspaceRoot);
  const mismatches = findVersionMismatches(versionReport);
  if (mismatches.length === 0) {
    return versionReport;
  }

  const expectedVersion = versionReport["package.json"];
  const details = mismatches
    .map(([source, version]) => `${source}=${version ?? "<missing>"}`)
    .join(", ");
  throw new Error(
    `Version mismatch: expected ${expectedVersion} from package.json, found ${details}`,
  );
};

if (require.main === module) {
  try {
    const versionReport = assertVersionsSynced();
    console.log(`Version check passed: ${versionReport["package.json"]}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  assertVersionsSynced,
  findVersionMismatches,
  getVersionReport,
};
