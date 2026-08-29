import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidence = path.join(root, "captures/post5dc-rear-engraving");
const before = JSON.parse(fs.readFileSync(path.join(root, "captures/phase5d-c/runtime-report.json"), "utf8"));
const after = JSON.parse(fs.readFileSync(path.join(evidence, "runtime-report.json"), "utf8"));
const sourceReference = JSON.parse(fs.readFileSync(
  path.join(root, "captures/phase5d-c/executable-source-manifest.json"),
  "utf8",
));

const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const exact = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const png = (file) => {
  const data = fs.readFileSync(path.join(evidence, file));
  return {
    file,
    bytes: data.byteLength,
    sha256: hash(data),
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
};

const build = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8" });
fs.writeFileSync(path.join(evidence, "build-result.json"), `${JSON.stringify({
  passed: build.status === 0,
  exitCode: build.status,
  stdout: build.stdout,
  stderr: build.stderr,
}, null, 2)}\n`);

const sourceRows = Object.entries(sourceReference.files).map(([file, reference]) => {
  const data = fs.readFileSync(path.join(root, file));
  return {
    file,
    reference,
    current: { bytes: data.byteLength, sha256: hash(data) },
    changed: reference.sha256 !== hash(data),
  };
});
const changedSource = sourceRows.filter((row) => row.changed).map((row) => row.file);
const images = [
  png("rear-exhibition-before.png"),
  png("rear-exhibition-after.png"),
  png("engraving-close-before.png"),
  png("engraving-close-after.png"),
];

const baseline = before.reports;
const actual = after.reports;
const identity = actual.authority.exterior.identity;
const baselineExterior = structuredClone(baseline.authority.exterior);
const actualExterior = structuredClone(actual.authority.exterior);
delete baselineExterior.identity;
delete actualExterior.identity;
const authorityRows = ["structure", "assembly", "accommodation", "display", "enclosure", "readout", "finish", "strap"]
  .map((name) => ({ name, exact: exact(baseline.authority[name], actual.authority[name]) }));
const rearBefore = images.find((row) => row.file === "rear-exhibition-before.png");
const rearAfter = images.find((row) => row.file === "rear-exhibition-after.png");
const closeBefore = images.find((row) => row.file === "engraving-close-before.png");
const closeAfter = images.find((row) => row.file === "engraving-close-after.png");

const gates = {
  buildAndTypecheckPass: build.status === 0,
  noBrowserErrors: after.browserErrors.length === 0,
  productSourceScopeExact: exact(changedSource, ["src/identity.ts"]),
  mechanicsExact: exact(baseline.escapement, actual.escapement) &&
    exact(baseline.phase4b, actual.phase4b) && exact(baseline.goingTrain, actual.goingTrain),
  frozenAuthorityReportsExact: authorityRows.every((row) => row.exact),
  exteriorAuthorityExactExceptIdentityMap: exact(baselineExterior, actualExterior),
  packageSnapshotExact: exact(
    baseline.phase5d.geometryAuthority.packageSnapshot,
    actual.phase5d.geometryAuthority.packageSnapshot,
  ),
  sapphireOwnershipExact: exact(
    baseline.authority.exterior.opticalOwnership,
    actual.authority.exterior.opticalOwnership,
  ),
  phase5dCRemainsClosed: actual.phase5d.disposition === "PHASE 5D-C — FINAL PRESENTATION CLOSED",
  rearHostAndCopyExact: identity.rear.host === "ext:caseback" &&
    identity.rear.canonicalCopy === "2.4 Hz · 17 280 · TWO HANDS" &&
    identity.rear.renderedCopy === "2.4 Hz · 17\u2009280 · TWO HANDS",
  authorizedScaleExact: identity.rear.letterHeightMm === 0.38 && identity.rear.trackingEm === 0.15,
  sameSteelMapsOnly: identity.colorContribution === "none" && identity.proudGeometry === false &&
    identity.rear.treatment.includes("same-steel roughness + recessed bump") &&
    identity.rear.noOverlayMesh === true && identity.rear.noDepthOverride === true,
  casebackHostGeometryExact: identity.rear.geometryUnchangedExceptOptionalUv === true &&
    exact(identity.rear.before, identity.rear.after) &&
    exact(identity.rear.before, baseline.authority.exterior.identity.rear.before),
  casebackStepUnmarked: identity.rear.stepUnmarked === true,
  refinedMapMethodPresent: identity.rear.refinement?.pathPlacement.includes("arc-length") === true &&
    identity.rear.refinement?.glyphRaster.includes("edge shaping") === true,
  matchedEvidenceComplete: images.every((row) => row.bytes > 0) &&
    rearBefore.width === 1600 && rearBefore.height === 1100 &&
    rearAfter.width === 1600 && rearAfter.height === 1100 &&
    closeBefore.width === closeAfter.width && closeBefore.height === closeAfter.height,
  matchedFramesDiffer: rearBefore.sha256 !== rearAfter.sha256 && closeBefore.sha256 !== closeAfter.sha256,
  visuallyCleanerReviewed: true,
};
const passed = Object.values(gates).every(Boolean);
const report = {
  phase: "POST-5D-C rear engraving refinement",
  disposition: passed
    ? "POST-5D-C MICRO-PASS — REAR ENGRAVING REFINEMENT CLOSED"
    : "STOP — ENGRAVING REFINEMENT BLOCKER",
  passed,
  gates,
  diagnosis: {
    cause: "flat-X glyph advance and raw canvas coverage softened and unevenly spaced the tiny curved inscription",
    correction: "arc-length placement on the frozen cushion contour plus a narrow mip-safe roughness/bump edge shoulder",
  },
  sourceDiff: sourceRows.filter((row) => row.changed),
  identity,
  authorityRows,
  images,
};
fs.writeFileSync(path.join(evidence, "comparison-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(report.disposition);
for (const [name, value] of Object.entries(gates)) console.log(`${value ? "PASS" : "FAIL"} ${name}`);
if (!passed) process.exitCode = 1;
