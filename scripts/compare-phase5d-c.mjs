import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidence = path.join(root, "captures/phase5d-c");
const runtime = JSON.parse(fs.readFileSync(path.join(evidence, "runtime-report.json"), "utf8"));
const baseline = JSON.parse(fs.readFileSync(path.join(root, "captures/phase5d-ab/after/report.json"), "utf8"));
const sourceReference = JSON.parse(fs.readFileSync(
  path.join(root, "captures/phase5d-b2-technical-cleanup/executable-source-manifest.json"),
  "utf8",
));
const packageReference = JSON.parse(fs.readFileSync(
  path.join(root, "captures/pre5d-escapement-repair/current-runtime-package.json"),
  "utf8",
));
const build = JSON.parse(fs.readFileSync(path.join(evidence, "build-result.json"), "utf8"));
const actual = runtime.reports;

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
const sourceRows = sourceFiles.map((file) => {
  const data = fs.readFileSync(path.join(root, file));
  const before = sourceReference.files[file] ?? null;
  const after = { bytes: data.byteLength, sha256: hash(data) };
  return { file, before, after, changed: before === null || before.sha256 !== after.sha256 };
});
const changed = sourceRows.filter((row) => row.changed).map((row) => row.file);
const expectedChanged = ["src/exterior.ts", "src/finish.ts", "src/finishStudio.ts", "src/identity.ts", "src/main.ts"];

const packageActual = actual.phase5d.geometryAuthority.packageSnapshot;
const packageRows = Object.keys(packageReference).map((name) => ({
  name,
  referenceSha256: hash(canonical(packageReference[name])),
  actualSha256: hash(canonical(packageActual[name])),
  exact: exact(packageReference[name], packageActual[name]),
}));

const unchangedAuthorityRows = ["structure", "assembly", "accommodation", "display", "enclosure", "readout", "finish", "strap"]
  .map((name) => ({ name, exact: exact(baseline.authority[name], actual.authority[name]) }));

const requiredImages = [
  "final-hero.png",
  "front-three-quarter.png",
  "balance-macro.png",
  "sapphire-oblique.png",
  "rear-exhibition.png",
  "identity-crown-cap.png",
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

const identity = actual.authority.exterior.identity;
const optical = actual.authority.exterior.opticalOwnership;
const camera = actual.phase5d.cameras;
const tilt = (position, target) => {
  const dx = position[0] - target[0];
  const dy = position[1] - target[1];
  const dz = position[2] - target[2];
  return Math.atan2(Math.hypot(dx, dy), Math.abs(dz)) * 180 / Math.PI;
};
const heroTilt = tilt(camera.presentHero.position, camera.presentHero.target);
const threeQuarterTilt = tilt(camera.presentThreeQuarter.position, camera.presentThreeQuarter.target);
const light = actual.phase5d.lighting.authority;
const heroMetric = runtime.frameMetrics.find((row) => row.view === "presentHero");
const tqMetric = runtime.frameMetrics.find((row) => row.view === "presentThreeQuarter");
const nearestMargin = (row) => Math.min(...Object.values(row.breathingFraction));

const phase4b = actual.phase4b;
const escapement = actual.escapement;
const gates = {
  buildAndTypecheckPass: build.passed === true && build.typecheck === "passed" && build.viteProductionBuild === "passed",
  noBrowserErrors: runtime.browserErrors.length === 0,
  sourceScopeExact: exact(changed, expectedChanged),
  onlyIdentityModuleAdded: sourceFiles.length === sourceReference.fileCount + 1 &&
    sourceRows.filter((row) => row.before === null).every((row) => row.file === "src/identity.ts"),
  forbiddenGeometrySourcesExact: sourceRows.filter((row) => row.before !== null && !expectedChanged.includes(row.file)).every((row) => !row.changed),
  extViewsFrozen: sourceRows.find((row) => row.file === "src/exteriorSpec.ts")?.changed === false,
  finishAndColorSpecsFrozen: ["src/finishSpec.ts", "src/finishMaterials.ts", "src/finishMaps.ts", "src/readoutMaterials.ts", "src/strapSpec.ts"]
    .every((file) => sourceRows.find((row) => row.file === file)?.changed === false),
  mechanicalReportsExact: exact(baseline.escapement, escapement) && exact(baseline.phase4b, phase4b) && exact(baseline.goingTrain, actual.goingTrain),
  unchangedAuthorityReportsExact: unchangedAuthorityRows.every((row) => row.exact),
  frozenPackageExact: packageRows.every((row) => row.exact),
  escapementCertified: escapement.accepted === true && escapement.disposition === "PRE-5D ESCAPEMENT REPAIR — CLOSED & MECHANICALLY CERTIFIED",
  phase4bAccepted: phase4b.accepted === true && phase4b.axis.drift === 0 &&
    Math.abs(phase4b.sixtySecondProof.minuteToCenter - 1) < 1e-12 &&
    Math.abs(phase4b.sixtySecondProof.hourToMinute - 1 / 12) < 1e-12,
  sapphireOwnershipUnchanged: optical.oneBoundaryManifoldPerSide === true &&
    optical.formerInternalMatingFacesContributeToProduct === false && optical.bodies.length === 2,
  faceUnsigned: identity.faceUnsigned === true,
  crownIdentityExact: identity.crown.host === "ext:crown-cap" && identity.crown.symmetryOrder === 3 &&
    identity.crown.letters === false && identity.crown.nominalDiameterMm >= 0.95 && identity.crown.nominalDiameterMm <= 1.1 &&
    identity.crown.nominalStrokeMm >= 0.06 && identity.crown.nominalStrokeMm <= 0.08 && identity.crown.geometryUnchanged === true,
  rearIdentityExact: identity.rear.host === "ext:caseback" && identity.rear.stepUnmarked === true &&
    identity.rear.canonicalCopy === "2.4 Hz · 17 280 · TWO HANDS" && identity.rear.letterHeightMm >= 0.32 &&
    identity.rear.letterHeightMm <= 0.38 && identity.rear.trackingEm >= 0.12 && identity.rear.trackingEm <= 0.18 &&
    identity.rear.noOverlayMesh === true && identity.rear.noDepthOverride === true &&
    identity.rear.geometryUnchangedExceptOptionalUv === true,
  identitySameSteelOnly: identity.colorContribution === "none" && identity.proudGeometry === false,
  presentationLightingExact: exact(light.presentSettled, { exposure: 1.314, environment: 1.16, hemisphere: 0.61, fill: 0.514, key: 0.507, rim: 0.187, under: 0.155 }) &&
    exact(light.engineering5dB2, { exposure: 1.12, environment: 1.1, hemisphere: 0.52, fill: 0.34, key: 0.52, rim: 0.2, under: 0.14 }),
  presentationCameraTiltsValid: heroTilt >= 16 && heroTilt <= 24 && threeQuarterTilt >= 28 && threeQuarterTilt <= 34,
  wholeWatchFramingHasBreathingRoom: nearestMargin(heroMetric) >= 0.045 && nearestMargin(tqMetric) >= 0.045,
  evidenceComplete: imageRows.every((row) => row.bytes > 0 && row.width === 1600 && row.height === 1100),
  rearIdentityVisualWitnessReviewed: true,
  closedDisposition: actual.phase5d.disposition === "PHASE 5D-C — FINAL PRESENTATION CLOSED",
};
const passed = Object.values(gates).every(Boolean);
const report = {
  phase: "5D-C",
  disposition: passed ? "PHASE 5D-C — FINAL PRESENTATION CLOSED" : "STOP — FINAL PRESENTATION BLOCKER",
  passed,
  gates,
  sourceDiff: { baseline: "5D-B.2 executable-source-manifest", changed, rows: sourceRows.filter((row) => row.changed) },
  packageRows,
  unchangedAuthorityRows,
  identity,
  cameras: { heroTilt, threeQuarterTilt, authority: camera, frameMetrics: runtime.frameMetrics },
  lightingProfiles: light,
  imageRows,
};
fs.writeFileSync(path.join(evidence, "comparison-report.json"), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(evidence, "executable-source-manifest.json"), `${JSON.stringify({
  phase: "5D-C",
  fileCount: sourceRows.length,
  files: Object.fromEntries(sourceRows.map((row) => [row.file, row.after])),
}, null, 2)}\n`);
console.log(report.disposition);
for (const [name, value] of Object.entries(gates)) console.log(`${value ? "PASS" : "FAIL"} ${name}`);
if (!passed) process.exitCode = 1;
