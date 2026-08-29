import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runtimePath = path.resolve(process.argv[2] || "/tmp/gate0-runtime.json");
const witnessPath = path.resolve(
  process.argv[3] || "captures/gate0-current-authority/train-mesh-witness-report.json",
);
const outDir = path.resolve(process.argv[4] || "captures/rc1-gate0");
const acceptedRuntimePath = path.join(
  root,
  "captures/post5d-newer-827-followup/runtime-regression.json",
);
const acceptedFinalPath = path.join(
  root,
  "captures/post5d-newer-827-followup/final-regression-report.json",
);
const reviewerAuthorityPath = path.join(root, "captures/reviewer-rc0/report.json");

const sha = (data) => crypto.createHash("sha256").update(data).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileRow = (file) => {
  const absolute = path.join(root, file);
  const data = fs.readFileSync(absolute);
  return { file, bytes: data.length, sha256: sha(data) };
};
const exactJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const acceptedFinal = readJson(acceptedFinalPath);
const reviewerAuthority = readJson(reviewerAuthorityPath);
const runtimeBytes = fs.readFileSync(runtimePath);
const acceptedRuntimeBytes = fs.readFileSync(acceptedRuntimePath);
const runtime = JSON.parse(runtimeBytes.toString("utf8"));
const acceptedRuntime = JSON.parse(acceptedRuntimeBytes.toString("utf8"));
const witness = readJson(witnessPath);

const rootFiles = ["index.html", "package-lock.json", "package.json", "tsconfig.json", "vite.config.ts"];
const sourceFiles = fs.readdirSync(path.join(root, "src"), { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => `src/${entry.name}`)
  .sort();
const files = [...rootFiles, ...sourceFiles];
const expectedRows = new Map(
  reviewerAuthority.source.files
    .filter((row) => rootFiles.includes(row.file) || row.file.startsWith("src/"))
    .map((row) => [row.file, row]),
);
const manifestRows = files.map(fileRow);
const manifestMismatches = manifestRows
  .map((row) => ({
    ...row,
    expectedBytes: expectedRows.get(row.file)?.bytes ?? null,
    expectedSha256: expectedRows.get(row.file)?.sha256 ?? null,
  }))
  .filter((row) => row.bytes !== row.expectedBytes || row.sha256 !== row.expectedSha256);
const missingFiles = [...expectedRows.keys()].filter((file) => !files.includes(file));
const unexpectedFiles = files.filter((file) => !expectedRows.has(file));
const manifestText = manifestRows.map((row) => `${row.sha256}  ${row.file}\n`).join("");

const acceptedWitnessRows = acceptedFinal.readOnlyLatentGearMeshFindings.rows;
const witnessRows = witness.otherPairScreens
  .filter((row) => acceptedWitnessRows.some((accepted) => accepted.id === row.id))
  .map((row) => ({
    id: row.id,
    collisionSamples: row.collisionSamples,
    sampleCount: row.sampleCount,
    maximumIntersectionAreaMm2: row.maximumIntersectionAreaMm2,
    classification: row.classification,
  }));

const buildRun = spawnSync("npm", ["run", "build"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
const build = {
  command: "npm run build",
  passed: buildRun.status === 0,
  exitCode: buildRun.status,
  stdout: buildRun.stdout,
  stderr: buildRun.stderr,
};

const expectedPackageZ = acceptedFinal.frozenRegression.packageZ;
const packageZ = runtime.authority.exterior.z;
const checks = {
  sourceAndRootManifestExact:
    manifestRows.length === expectedRows.size &&
    manifestMismatches.length === 0 &&
    missingFiles.length === 0 &&
    unexpectedFiles.length === 0,
  buildAndTypecheckPass: build.passed,
  runtimeByteExact: runtimeBytes.equals(acceptedRuntimeBytes),
  runtimeApisExact: exactJson(runtime.api, acceptedRuntime.api),
  warningFingerprintExact: exactJson(runtime.runtimeDiagnostics, acceptedRuntime.runtimeDiagnostics),
  packageTopBottomExact:
    packageZ.packageTop === expectedPackageZ.packageTop &&
    packageZ.packageBottom === expectedPackageZ.packageBottom,
  packageZExact: exactJson(packageZ, expectedPackageZ),
  goingTrainExact: exactJson(runtime.goingTrain, acceptedRuntime.goingTrain),
  phase4bExact: exactJson(runtime.phase4b, acceptedRuntime.phase4b),
  escapementExact: exactJson(runtime.escapement, acceptedRuntime.escapement),
  finishIdentitySapphireExact:
    exactJson(runtime.authority.finish, acceptedRuntime.authority.finish) &&
    exactJson(runtime.authority.exterior.identity, acceptedRuntime.authority.exterior.identity) &&
    exactJson(runtime.phase5d.sapphireOwnership, acceptedRuntime.phase5d.sapphireOwnership),
  annexExplodeZeroExact: exactJson(runtime.annexExplodeZero, acceptedRuntime.annexExplodeZero),
  failingGearWitnessesExact: exactJson(witnessRows, acceptedWitnessRows),
};
const accepted = Object.values(checks).every(Boolean);

const report = {
  schema: "watch.rc1-gate0-authority.v1",
  disposition: accepted
    ? "GATE 0 PASSED — CURRENT ACCEPTED AUTHORITY REPRODUCED"
    : "STOP — GATE 0 AUTHORITY MISMATCH",
  accepted,
  baseline: {
    finalReport: path.relative(root, acceptedFinalPath),
    runtimeReport: path.relative(root, acceptedRuntimePath),
    sourceAuthority: path.relative(root, reviewerAuthorityPath),
  },
  checks,
  source: {
    fileCount: manifestRows.length,
    aggregateSha256: sha(manifestText),
    rows: manifestRows,
    mismatches: manifestMismatches,
    missingFiles,
    unexpectedFiles,
  },
  runtime: {
    bytes: runtimeBytes.length,
    sha256: sha(runtimeBytes),
    expectedBytes: acceptedRuntimeBytes.length,
    expectedSha256: sha(acceptedRuntimeBytes),
    diagnostics: runtime.runtimeDiagnostics,
    api: runtime.api,
  },
  packageZ,
  failingGearWitnesses: witnessRows,
  build,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "source-manifest.json"), `${JSON.stringify(report.source, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, "SHA256SUMS.txt"), manifestText);
fs.copyFileSync(runtimePath, path.join(outDir, "executable-runtime-reference.json"));
fs.copyFileSync(witnessPath, path.join(outDir, "train-mesh-witness-report.json"));
fs.writeFileSync(path.join(outDir, "gate0-report.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log(`${report.disposition}: ${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} gates`);
if (!accepted) {
  for (const [name, value] of Object.entries(checks)) if (!value) console.error(`FAIL ${name}`);
  process.exitCode = 1;
}
