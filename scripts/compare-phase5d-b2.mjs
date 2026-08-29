import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidence = path.join(root, "captures/phase5d-b2-technical-cleanup");
const runtime = JSON.parse(fs.readFileSync(path.join(evidence, "runtime-report.json"), "utf8"));
const buildResult = JSON.parse(fs.readFileSync(path.join(evidence, "build-result.json"), "utf8"));
const baseline = JSON.parse(fs.readFileSync(path.join(root, "captures/phase5d-ab/after/report.json"), "utf8"));
const packageReference = JSON.parse(
  fs.readFileSync(path.join(root, "captures/pre5d-escapement-repair/current-runtime-package.json"), "utf8"),
);
const preB2Root = "/tmp/watch-5db1-diag.hxOfrl/src";
const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const canonical = (value) => JSON.stringify(stable(value));
const exact = (a, b) => canonical(a) === canonical(b);
const clone = (value) => JSON.parse(JSON.stringify(value));

const sourceFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else sourceFiles.push(path.relative(root, full));
  }
};
walk(path.join(root, "src"));
sourceFiles.sort();
const baselineSourceFiles = [];
const walkBaseline = (dir, prefix = "src") => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) walkBaseline(full, relative);
    else baselineSourceFiles.push(relative);
  }
};
walkBaseline(preB2Root);
baselineSourceFiles.sort();
const stripDiagnosticHook = (text) => text.replace(
  /\n\/\/ Disposable Phase 5D-B\.1 runtime diagnostic hook\.[\s\S]*$/,
  "\n",
);
const sourceRows = sourceFiles.map((file) => {
  const currentData = fs.readFileSync(path.join(root, file));
  const relative = file.replace(/^src\//, "");
  let beforeData = fs.readFileSync(path.join(preB2Root, relative), "utf8");
  if (file === "src/main.ts") beforeData = stripDiagnosticHook(beforeData);
  const before = { bytes: Buffer.byteLength(beforeData), sha256: hash(beforeData) };
  const after = { bytes: currentData.byteLength, sha256: hash(currentData) };
  return { file, before, after, changed: before.sha256 !== after.sha256 };
});
const changedSourceFiles = sourceRows.filter((row) => row.changed).map((row) => row.file);
const allowedSourceFiles = [
  "src/exterior.ts",
  "src/exteriorGeometry.ts",
  "src/exteriorMaterials.ts",
  "src/main.ts",
];

const actual = runtime.reports;
const exteriorBaseline = clone(baseline.authority.exterior);
const exteriorActual = clone(actual.authority.exterior);
delete exteriorActual.opticalOwnership;
delete exteriorActual.finish?.renderHygiene;
const authorityRows = Object.keys(baseline.authority).map((name) => ({
  name,
  exact: name === "exterior"
    ? exact(exteriorBaseline, exteriorActual)
    : exact(baseline.authority[name], actual.authority[name]),
}));
const packageActual = actual.phase5d.geometryAuthority.packageSnapshot;
const packageRows = Object.keys(packageReference).map((name) => ({
  name,
  referenceSha256: hash(canonical(packageReference[name])),
  actualSha256: hash(canonical(packageActual[name])),
  exact: exact(packageReference[name], packageActual[name]),
}));

const optical = actual.authority.exterior.opticalOwnership;
const owners = actual.phase5d.sapphire.owners;
const visibleFinalOwners = owners.filter((row) => row.visible && row.finalProductOpticalOwner);
const visibleEngineeringOwners = owners.filter((row) => row.visible && !row.finalProductOpticalOwner);
const acceptedOpticalMaterialsUnchanged = exact(
  baseline.phase5d.sapphire.innerMaterial,
  actual.phase5d.sapphire.innerMaterial,
) && exact(
  baseline.phase5d.sapphire.outerMaterial,
  actual.phase5d.sapphire.outerMaterial,
);

const requiredImages = [
  ...["front-oblique", "balance-macro", "rear-oblique"].flatMap((view) => [
    `matched/sapphire-${view}-legacy.png`,
    `matched/sapphire-${view}-corrected.png`,
    `matched/sapphire-${view}-flat-no-refraction.png`,
    `matched/sapphire-${view}-optical-owner-id.png`,
  ]),
  ...["extWestOblique", "extRear"].flatMap((view) => [
    `matched/exterior-${view}-before.png`,
    `matched/exterior-${view}-after.png`,
    `matched/exterior-${view}-roughness-flat.png`,
  ]),
  ...["extProduct", "finishBalance"].flatMap((view) => [
    `matched/readability-${view}-finished.png`,
    `matched/readability-${view}-family-id.png`,
  ]),
  ...["conservative", "middle", "bright"].flatMap((profile) => [
    `candidates/hero-${profile}.png`,
    `candidates/macro-${profile}.png`,
  ]),
];
const imageRows = requiredImages.map((file) => {
  const data = fs.readFileSync(path.join(evidence, file));
  return {
    file,
    bytes: data.byteLength,
    sha256: hash(data),
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
});
const matchedPairs = [
  ["matched/sapphire-front-oblique-legacy.png", "matched/sapphire-front-oblique-corrected.png"],
  ["matched/sapphire-balance-macro-legacy.png", "matched/sapphire-balance-macro-corrected.png"],
  ["matched/sapphire-rear-oblique-legacy.png", "matched/sapphire-rear-oblique-corrected.png"],
  ["matched/exterior-extWestOblique-before.png", "matched/exterior-extWestOblique-after.png"],
  ["matched/exterior-extRear-before.png", "matched/exterior-extRear-after.png"],
].map(([before, after]) => {
  const a = imageRows.find((row) => row.file === before);
  const b = imageRows.find((row) => row.file === after);
  return {
    before,
    after,
    dimensionsMatch: a.width === b.width && a.height === b.height,
    pixelsDiffer: a.sha256 !== b.sha256,
  };
});

const phase4b = actual.phase4b;
const escapement = actual.escapement;
const finishMetrics = runtime.metrics.finish;
const gates = {
  buildPassed: buildResult.passed === true && buildResult.typecheck === "passed" &&
    buildResult.viteProductionBuild === "passed",
  noBrowserErrors: runtime.browserErrors.length === 0,
  sourceScopeBounded: exact(changedSourceFiles, allowedSourceFiles),
  noSourceFilesAddedOrRemoved: exact(sourceFiles, baselineSourceFiles),
  mechanicalReportsExact: exact(baseline.escapement, escapement) &&
    exact(baseline.phase4b, phase4b) && exact(baseline.goingTrain, actual.goingTrain),
  authorityGeometryAndOwnershipExact: authorityRows.every((row) => row.exact),
  frozenPackageExact: packageRows.every((row) => row.exact),
  escapementCertified: escapement.accepted === true &&
    escapement.disposition === "PRE-5D ESCAPEMENT REPAIR — CLOSED & MECHANICALLY CERTIFIED",
  phase4bAccepted: phase4b.accepted === true && phase4b.axis.drift === 0 &&
    Math.abs(phase4b.sixtySecondProof.minuteToCenter - 1) < 1e-12 &&
    Math.abs(phase4b.sixtySecondProof.hourToMinute - 1 / 12) < 1e-12,
  oneOpticalBoundaryOwnerPerSide: optical.oneBoundaryManifoldPerSide === true &&
    optical.bodies.length === 2 && visibleFinalOwners.length === 2,
  engineeringSapphireMeshesRetainedAndHiddenInProduct: optical.authoritativeEngineeringMeshesRetained === true &&
    owners.filter((row) => !row.finalProductOpticalOwner).length === 6 && visibleEngineeringOwners.length === 0,
  internalMatingFacesRemoved: optical.formerInternalMatingFacesContributeToProduct === false &&
    optical.bodies.every((body) => body.removedInternalFaces > 0 && body.shoulderTriangles > 0),
  acceptedSapphireMaterialsUnchanged: acceptedOpticalMaterialsUnchanged,
  finishMapsRemainActive: finishMetrics.length === 2 &&
    finishMetrics.every((row) => row.finishedToRoughnessFlat.fractionChangedGt2 > 0.2),
  namedGrazingCamerasDistinct: finishMetrics[0].finishedToRoughnessFlat.mae8bit !==
    finishMetrics[1].finishedToRoughnessFlat.mae8bit,
  evidenceComplete: imageRows.every((row) => row.bytes > 0 && row.width === 1600 && row.height === 1100),
  matchedFramesValid: matchedPairs.every((row) => row.dimensionsMatch && row.pixelsDiffer),
  presentationProfilesRemainNonAuthoritative: actual.phase5d.renderer.exposure === 1.12 &&
    actual.phase5d.lighting.environment.intensity === 1.1,
  noTypographyOrBranding: actual.phase5d.hygiene.typographyOrBrandingStarted === false,
  closedDisposition: actual.phase5d.disposition === "PHASE 5D-B.2 — TECHNICAL PRESENTATION CLEANUP CLOSED",
};
const passed = Object.values(gates).every(Boolean);
const report = {
  phase: "5D-B.2",
  disposition: passed
    ? "PHASE 5D-B.2 — TECHNICAL PRESENTATION CLEANUP CLOSED"
    : "STOP — PRESENTATION TOPOLOGY BLOCKER",
  passed,
  gates,
  sourceAuthority: {
    preB2AggregateSha256: "628aad6d9b5095338e627dc1cbb6a3eab15392323af1dd2d15f3da3f3c4c8c98",
    fileCount: sourceRows.length,
    changedSourceFiles,
    rows: sourceRows.filter((row) => row.changed),
  },
  topology: {
    optical,
    visibleFinalOwners,
    visibleEngineeringOwners,
    acceptedOpticalMaterialsUnchanged,
  },
  authorityRows,
  packageRows,
  matchedPairs,
  imageRows,
  readability: runtime.metrics.readability,
  finishMetrics,
  sapphireMetrics: runtime.metrics.sapphire,
};
fs.writeFileSync(path.join(evidence, "comparison-report.json"), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(
  path.join(evidence, "executable-source-manifest.json"),
  `${JSON.stringify({ phase: "5D-B.2", fileCount: sourceRows.length, files: Object.fromEntries(sourceRows.map((row) => [row.file, row.after])) }, null, 2)}\n`,
);
console.log(report.disposition);
for (const [gate, value] of Object.entries(gates)) console.log(`${value ? "PASS" : "FAIL"} ${gate}`);
if (!passed) process.exitCode = 1;
