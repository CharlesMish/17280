import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const provisionalPath = path.resolve(
  process.argv[2] || "captures/rc1-gate0/gate0-report.json",
);
const outDir = path.resolve(process.argv[3] || "captures/rc1-gate0-independent");
const runtimePath = path.join(root, "captures/rc1-gate0/executable-runtime-reference.json");
const witnessPath = path.join(root, "captures/rc1-gate0/train-mesh-witness-report.json");
const sha = (data) => crypto.createHash("sha256").update(data).digest("hex");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const provisional = read(provisionalPath);
const approvedFirstPackagingDelta = new Map([
  [
    "package.json",
    {
      gate0Bytes: 565,
      gate0Sha256: "5be14795176180e6eeebfb095dc727f165e89e8789bcbfb8f8e3ded9be04edc2",
      firstPostGate0Bytes: 621,
      firstPostGate0Sha256: "066b2eabb2090c3cc476ce445104d429e65587dff52ab396d9ed0d09b9b2e96a",
      authority: "Lane E — supported Node engine metadata",
    },
  ],
  [
    "package-lock.json",
    {
      gate0Bytes: 39675,
      gate0Sha256: "fc8ed453e23da97b62722d6af6777e476cbd243e40fe8a6b0f779760ee0e9329",
      firstPostGate0Bytes: 39743,
      firstPostGate0Sha256: "13cf9b7ca73541669d5e231c09fa0df2642129db325ee86f3195bd5372ca273f",
      authority: "Lane E — lockfile mirror of supported Node engine metadata",
    },
  ],
]);

const mismatchRows = provisional.source.mismatches;
const firstPackagingDeltaExact =
  mismatchRows.length === approvedFirstPackagingDelta.size &&
  mismatchRows.every((row) => {
    const approved = approvedFirstPackagingDelta.get(row.file);
    return Boolean(
      approved &&
      row.expectedBytes === approved.gate0Bytes &&
      row.expectedSha256 === approved.gate0Sha256 &&
      row.bytes === approved.firstPostGate0Bytes &&
      row.sha256 === approved.firstPostGate0Sha256,
    );
  });
const productSourceExactAtGate0 = provisional.source.rows
  .filter((row) => row.file.startsWith("src/"))
  .every((row) => !mismatchRows.some((mismatch) => mismatch.file === row.file));
const otherRootFilesExactAtGate0 = provisional.source.rows
  .filter((row) => !row.file.startsWith("src/") && !approvedFirstPackagingDelta.has(row.file))
  .every((row) => !mismatchRows.some((mismatch) => mismatch.file === row.file));

const gate0Rows = provisional.source.rows.map((row) => {
  const mismatch = mismatchRows.find((candidate) => candidate.file === row.file);
  return mismatch
    ? { file: row.file, bytes: mismatch.expectedBytes, sha256: mismatch.expectedSha256 }
    : row;
});
const manifestText = gate0Rows.map((row) => `${row.sha256}  ${row.file}\n`).join("");
const checks = {
  sourceAndRootManifestExactAtGate0:
    productSourceExactAtGate0 && otherRootFilesExactAtGate0 && firstPackagingDeltaExact,
  buildAndTypecheckPassAtGate0: provisional.build.passed,
  runtimeByteExact: provisional.checks.runtimeByteExact,
  runtimeApisExact: provisional.checks.runtimeApisExact,
  warningFingerprintExact: provisional.checks.warningFingerprintExact,
  packageTopBottomExact: provisional.checks.packageTopBottomExact,
  packageZExact: provisional.checks.packageZExact,
  goingTrainExact: provisional.checks.goingTrainExact,
  phase4bExact: provisional.checks.phase4bExact,
  escapementExact: provisional.checks.escapementExact,
  finishIdentitySapphireExact: provisional.checks.finishIdentitySapphireExact,
  annexExplodeZeroExact: provisional.checks.annexExplodeZeroExact,
  failingGearWitnessesExact: provisional.checks.failingGearWitnessesExact,
};
const accepted = Object.values(checks).every(Boolean);
const report = {
  schema: "watch.rc1-gate0-authority.final.v1",
  disposition: accepted
    ? "GATE 0 PASSED — CURRENT ACCEPTED AUTHORITY REPRODUCED"
    : "STOP — GATE 0 AUTHORITY MISMATCH",
  accepted,
  timingBoundary: {
    gate0: "product/runtime/root authority reproduced before authorized RC1 edits",
    firstObservedPostGate0Change:
      "Lane-E engine metadata landed after Gate 0 and before this independent report was serialized",
  },
  checks,
  source: {
    fileCount: gate0Rows.length,
    aggregateSha256: sha(manifestText),
    rows: gate0Rows,
  },
  executableRuntime: provisional.runtime,
  packageZ: provisional.packageZ,
  failingGearWitnesses: provisional.failingGearWitnesses,
  build: provisional.build,
  expectedPostGate0LaneEDeltas: {
    firstObserved: mismatchRows.map((row) => ({
      ...row,
      authority: approvedFirstPackagingDelta.get(row.file)?.authority,
    })),
    subsequentlyAuthorizedNotPartOfGate0: [
      "package.json sbom script",
      "scripts/generate-sbom.mjs",
      "PROJECT_LICENSE.txt",
      "THIRD_PARTY_NOTICES.txt",
    ],
    classification: "packaging/release-shell only; never rebase product or executable runtime authority",
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "gate0-source-manifest.json"), `${JSON.stringify(report.source, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, "SHA256SUMS.txt"), manifestText);
fs.copyFileSync(runtimePath, path.join(outDir, "executable-runtime-reference.json"));
fs.copyFileSync(witnessPath, path.join(outDir, "train-mesh-witness-report.json"));
fs.writeFileSync(path.join(outDir, "gate0-report.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log(`${report.disposition}: ${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} gates`);
if (!accepted) process.exitCode = 1;
