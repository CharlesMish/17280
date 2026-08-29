import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const evidenceDir = path.join(root, "captures/post5d-newer-827");
const regressionDir = path.join(evidenceDir, "regression");
fs.mkdirSync(regressionDir, { recursive: true });

const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hashFile = (relative) => hash(fs.readFileSync(path.join(root, relative)));
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const canonical = (value) => JSON.stringify(stable(value));
const exact = (a, b) => canonical(a) === canonical(b);

const current = read("captures/post5d-newer-827/regression/runtime-report.json");
const acceptedRuntime = read("captures/post5d-overnight-audit/regression/runtime-report.json");
const acceptedFinal = read("captures/post5d-overnight-audit/final-regression-report.json");
const acceptedAnnex = read("captures/annex-e1-exploded/runtime-report.json");
const phase5dManifest = read("captures/phase5d-c/executable-source-manifest.json");
const fourthPalletExact = read(
  "captures/post5d-newer-827/regression/fourth-wheel-pallet-support-360/gear-cylinder-audit-report.json",
);
const escapePalletExact = read("captures/post5d-newer-827/05-escape-pallet-sweep-report.json");

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
fs.writeFileSync(path.join(regressionDir, "build-result.json"), `${JSON.stringify(build, null, 2)}\n`);

// Reconstruct the complete accepted overnight source manifest. Files not listed
// as changed in the overnight report remained byte-identical to the 5D-C manifest.
const acceptedSourceHashes = Object.fromEntries(
  Object.entries(phase5dManifest.files).map(([file, row]) => [file, row.sha256]),
);
for (const row of acceptedFinal.sourceScope.changedRows) acceptedSourceHashes[row.file] = row.currentSha256;

const sourceFiles = fs.readdirSync(path.join(root, "src"), { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => `src/${entry.name}`)
  .sort();
const sourceRows = sourceFiles.map((file) => ({
  file,
  acceptedSha256: acceptedSourceHashes[file] ?? null,
  currentSha256: hashFile(file),
  changedFromAcceptedOvernight: acceptedSourceHashes[file] !== hashFile(file),
}));
const changedSourceRows = sourceRows.filter((row) => row.changedFromAcceptedOvernight);
const sourceText = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const sourceSliceHash = (relative, startToken, endToken) => {
  const source = sourceText(relative);
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  if (start < 0 || end < 0) return null;
  return hash(source.slice(start, end));
};
const gearProfileSourceSha256 = sourceSliceHash(
  "src/geometry.ts",
  "export function createSpurOutline",
  "\nfunction roundedWindow",
);
const restPhaseSourceSha256 = (() => {
  const source = sourceText("src/movement.ts");
  const start = source.indexOf("function computeRestPhases");
  const end = source.indexOf("\n}", start) + 2;
  return start >= 0 && end > start ? hash(source.slice(start, end)) : null;
})();
const permittedLocalSourceScope = new Set([
  "src/exterior.ts",
  "src/exteriorGeometry.ts",
  "src/geometry.ts",
  "src/structure.ts",
  "src/structureGeometry.ts",
]);

const normalizedPhase4b = (report) => {
  const row = structuredClone(report);
  delete row.collision?.calibreSweepClearance?.hour?.samplesInDisk;
  delete row.collision?.calibreSweepClearance?.minute?.samplesInDisk;
  return row;
};
const normalizedPackage = (report) => {
  const row = structuredClone(report);
  delete row.accommodation?.sweep?.meshCount;
  delete row.accommodation?.sweep?.projectedVertices;
  delete row.accommodation?.sweep?.uniqueProjected;
  return row;
};
const normalizedEscapement = (report) => {
  const row = structuredClone(report);
  // Local support topology may change report bookkeeping, but none of the solved
  // escapement law, layout, gearing, contact or complete-beat authority may move.
  delete row.structure;
  delete row.bridgeContinuity;
  delete row.supportGraph;
  delete row.assembly;
  return row;
};
const frozenExterior = (report) => ({
  concept: report.concept,
  bands: report.bands,
  finish: report.finish,
  lugs: report.lugs,
  opticalOwnership: report.opticalOwnership,
  rejected: report.rejected,
  sapphire: report.sapphire,
  thesis: report.thesis,
  z: report.z,
});
const immutableAuthorityNames = [
  "assembly",
  "accommodation",
  "display",
  "enclosure",
  "readout",
  "finish",
  "strap",
];
const normalizedAuthority = (name, report) => {
  const row = structuredClone(report);
  if (name === "accommodation") {
    delete row.sweep?.projectedVertices;
    delete row.sweep?.uniqueProjected;
    delete row.sweep?.verticesEvaluated;
    delete row.corridor?.samples;
  }
  if (name === "display") {
    delete row.hourClearance?.samplesInDisk;
    delete row.minuteClearance?.samplesInDisk;
  }
  if (name === "enclosure") {
    delete row.front?.clearance?.samples;
    delete row.rear?.clearance?.samples;
  }
  return row;
};
const authorityRows = immutableAuthorityNames.map((name) => ({
  name,
  exact: exact(
    normalizedAuthority(name, current.authority[name]),
    normalizedAuthority(name, acceptedRuntime.authority[name]),
  ),
  rawExact: exact(current.authority[name], acceptedRuntime.authority[name]),
  acceptedSha256: hash(canonical(normalizedAuthority(name, acceptedRuntime.authority[name]))),
  currentSha256: hash(canonical(normalizedAuthority(name, current.authority[name]))),
}));

const currentPackage = normalizedPackage(current.phase5d.geometryAuthority.packageSnapshot);
const acceptedPackage = normalizedPackage(acceptedRuntime.phase5d.geometryAuthority.packageSnapshot);
const packageRows = Object.keys(acceptedPackage).map((name) => ({
  name,
  exact: exact(currentPackage[name], acceptedPackage[name]),
  acceptedSha256: hash(canonical(acceptedPackage[name])),
  currentSha256: hash(canonical(currentPackage[name])),
}));

const explosion = current.annexExplodeZero;
const acceptedExplosion = acceptedAnnex.zeroReport;
const explosionOwnerChecks = explosion.objects.map((row) => ({
  id: row.id,
  localTransformUnchanged: row.localTransformUnchanged,
  geometryUnchanged: row.geometryUnchanged,
}));

const knownWarning = (message) => message.includes("computeTangents() failed");
const acceptedLayout = acceptedRuntime.mechanical.layout;
const currentLayout = current.escapement.layout;
const packageZ = current.authority.exterior.z;
const escapePalletSteel = escapePalletExact.postRepair.filter((row) => !row.name.includes(":stone:"));
const escapePalletRubies = escapePalletExact.postRepair.filter((row) => row.name.includes(":stone:"));
const checks = {
  buildAndTypecheckPass: build.passed,
  runtimeApisPresent: Object.values(current.api).every((value) => value === "function"),
  noPageOrRequestErrors:
    current.runtimeDiagnostics.pageErrors.length === 0 &&
    current.runtimeDiagnostics.requestFailures.length === 0,
  noUnexpectedConsoleErrors: current.runtimeDiagnostics.consoleErrors.every(knownWarning),
  sourceScopeBounded:
    changedSourceRows.length > 0 &&
    changedSourceRows.every((row) => permittedLocalSourceScope.has(row.file)) &&
    sourceRows.every((row) => row.acceptedSha256 !== null),
  frozenSpecAndMovementSourceExact:
    sourceRows.find((row) => row.file === "src/spec.ts")?.changedFromAcceptedOvernight === false &&
    sourceRows.find((row) => row.file === "src/movement.ts")?.changedFromAcceptedOvernight === false,
  gearToothProfileGeneratorExact:
    gearProfileSourceSha256 === "55c8e92950595a64190ea9a418213ea959a7a4a2bbabdce06baa012bcea34dad",
  restPhaseConstructionExact:
    restPhaseSourceSha256 === "0d085e65ab05da2b69aa5e0107beb5881c646e2bf7df6b8c52e625e583c872ef",
  allTrainAxesExact: exact(currentLayout.positions, acceptedLayout.positions),
  allTrainDistancesAndAnglesExact:
    exact(currentLayout.distances, acceptedLayout.distances) &&
    exact(currentLayout.anglesDeg, acceptedLayout.anglesDeg),
  gearRadiiAndPairAuthorityExact:
    exact(currentPackage.layout, acceptedPackage.layout),
  packageTopBottomExact:
    packageZ.packageTop === 7.4616000001162295 &&
    packageZ.packageBottom === -2.596000005245209,
  goingTrainExact: exact(current.goingTrain, acceptedRuntime.goingTrain),
  escapementCertified:
    current.escapement.accepted === true &&
    current.escapement.disposition === "PRE-5D ESCAPEMENT REPAIR — CLOSED & MECHANICALLY CERTIFIED",
  escapementFunctionalAuthorityExact:
    exact(normalizedEscapement(current.escapement), normalizedEscapement(acceptedRuntime.mechanical)),
  phase4bAcceptedAndPhysicalExact:
    current.phase4b.accepted === true &&
    exact(normalizedPhase4b(current.phase4b), normalizedPhase4b(acceptedRuntime.phase4b)),
  packagePhysicalAuthorityExact: packageRows.every((row) => row.exact),
  immutableAuthorityReportsExact: authorityRows.every((row) => row.exact),
  exteriorFinishAndOpticsExact:
    exact(frozenExterior(current.authority.exterior), frozenExterior(acceptedRuntime.authority.exterior)),
  structurePackageBoundsExact:
    exact(currentPackage.structure, acceptedPackage.structure),
  structureStillConnected:
    current.authority.structure.maxFootDelta === 0 &&
    current.authority.structure.maxSeatToBridgeGap <= 0 &&
    current.authority.structure.maxBodyToShoulderGap <= 0,
  identitySemanticsHostsAndBoundsExact:
    current.authority.exterior.identity.crown.host === "ext:crown-cap" &&
    current.authority.exterior.identity.crown.geometryUnchanged === true &&
    exact(
      current.authority.exterior.identity.crown.before.bounds,
      acceptedRuntime.authority.exterior.identity.crown.before.bounds,
    ) &&
    exact(
      current.authority.exterior.identity.crown.after.bounds,
      acceptedRuntime.authority.exterior.identity.crown.after.bounds,
    ) &&
    exact(
      Object.fromEntries(Object.entries(current.authority.exterior.identity.crown).filter(([key]) => !["before", "after"].includes(key))),
      Object.fromEntries(Object.entries(acceptedRuntime.authority.exterior.identity.crown).filter(([key]) => !["before", "after"].includes(key))),
    ) &&
    current.authority.exterior.identity.rear.host === "ext:caseback" &&
    current.authority.exterior.identity.rear.stepUnmarked === true &&
    current.authority.exterior.identity.rear.canonicalCopy === "2.4 Hz · 17 280 · TWO HANDS" &&
    exact(current.authority.exterior.identity.rear, acceptedRuntime.authority.exterior.identity.rear) &&
    current.authority.exterior.identity.colorContribution === acceptedRuntime.authority.exterior.identity.colorContribution &&
    current.authority.exterior.identity.proudGeometry === acceptedRuntime.authority.exterior.identity.proudGeometry,
  sapphireOpticalOwnershipExact:
    exact(current.authority.exterior.opticalOwnership, acceptedRuntime.authority.exterior.opticalOwnership),
  annexExplodeZero:
    explosion.scalar.value === 0 &&
    explosion.assembledEquivalence.exactAtZero === true &&
    explosion.assembledEquivalence.carriersAbsentFromProductPathsAtZero === true &&
    explosion.presentationOnly === true &&
    explosion.assembledEquivalence.geometryMutated === false &&
    explosion.assembledEquivalence.materialMutated === false &&
    explosion.assembledEquivalence.localKinematicsMutated === false &&
    explosionOwnerChecks.every((row) => row.localTransformUnchanged && row.geometryUnchanged),
  annexLayerAndCameraAuthorityExact:
    exact(explosion.layers, acceptedExplosion.layers) &&
    exact(explosion.cameraAuthority, acceptedExplosion.cameraAuthority),
  phase5dStillClosed: current.phase5d.disposition === "PHASE 5D-C — FINAL PRESENTATION CLOSED",
  certifiedFourthPalletSupportStillClear:
    fourthPalletExact.sweep.penetration === false &&
    fourthPalletExact.sweep.intersectingCoarseSamples === 0 &&
    fourthPalletExact.sweep.minimumSignedSurfaceDistanceMm >= 0.05,
  fourthWheelFrozenAuthorityExact:
    exact(current.fourthWheelSweep.ownership.rotatingWheel, acceptedRuntime.fourthWheelSweep.ownership.rotatingWheel) &&
    exact(current.fourthWheelSweep.wheel, acceptedRuntime.fourthWheelSweep.wheel),
  barrelCenterMeshStillAccepted:
    current.barrelCenter.accepted === true && current.barrelCenter.mesh.valid === true,
  intendedTrainMeshesStillValid:
    current.barrelFourth.accepted === true &&
    current.barrelFourth.intendedFourthEscapeMeshValid === true &&
    current.barrelFourth.intendedThirdFourthMeshValid === true &&
    Object.values(current.barrelFourth.unintendedCollisions).every((value) => value === false),
  escapePalletExactCompleteBeatSweepPass:
    escapePalletExact.schema === "post5d-newer-827-escape-pallet-rendered-sweep-v1" &&
    escapePalletExact.accepted === true &&
    escapePalletExact.sampleCount === 2049 &&
    escapePalletExact.postRepair.every((row) =>
      row.collisionSamples === 0 && row.maximumPairOverlapArea === 0 && row.minimum >= 0
    ),
  escapePalletSteelPositiveClearance:
    escapePalletSteel.length === 5 &&
    escapePalletSteel.every((row) => row.minimum >= 0.02),
  escapePalletIntendedRubyContactsValid:
    escapePalletRubies.length === 2 &&
    escapePalletRubies.every((row) =>
      row.collisionSamples === 0 && row.maximumPairOverlapArea === 0 && row.minimum < 1e-6
    ),
  escapePalletFunctionalAuthorityExact:
    escapePalletExact.invariance.rubyFacesExact === true &&
    escapePalletExact.invariance.contactSequenceExact === true &&
    exact(escapePalletExact.invariance.axes, currentLayout.positions) &&
    escapePalletExact.invariance.gearing.unchanged === true,
  escapePalletAuditRuntimeClean:
    escapePalletExact.browserDiagnostics.pageErrors.length === 0 &&
    escapePalletExact.browserDiagnostics.requestFailures.length === 0 &&
    escapePalletExact.browserDiagnostics.consoleErrors.every(knownWarning),
};
const accepted = Object.values(checks).every(Boolean);
const report = {
  schema: "post5d-newer-827-final-regression-v1",
  disposition: accepted
    ? "PASS — FIVE-WITNESS CLEANUP REGRESSION CLOSED"
    : "STOP — FIVE-WITNESS CLEANUP REGRESSION BLOCKER",
  accepted,
  checks,
  commands: [
    "node scripts/capture-post5d-newer-827-regression.mjs captures/post5d-newer-827/regression/runtime-report.json http://127.0.0.1:5173",
    "node scripts/compare-post5d-newer-827-regression.mjs",
  ],
  build,
  sourceScope: {
    baseline: "reconstructed exact accepted post5d-overnight source manifest",
    permittedLocalSourceScope: [...permittedLocalSourceScope].sort(),
    allRows: sourceRows,
    changedRows: changedSourceRows,
    unchangedCount: sourceRows.length - changedSourceRows.length,
    changedCount: changedSourceRows.length,
    unexpectedRows: changedSourceRows.filter((row) => !permittedLocalSourceScope.has(row.file)),
    frozenFunctionalSource: {
      specSha256: sourceRows.find((row) => row.file === "src/spec.ts"),
      movementSha256: sourceRows.find((row) => row.file === "src/movement.ts"),
      gearToothProfileGeneratorSha256: gearProfileSourceSha256,
      restPhaseConstructionSha256: restPhaseSourceSha256,
    },
  },
  mechanical: {
    escapementDisposition: current.escapement.disposition,
    escapementAccepted: current.escapement.accepted,
    minimumGeneralClearanceMm: current.escapement.minimumGeneralClearance,
    goingTrainExact: checks.goingTrainExact,
    phase4bAccepted: current.phase4b.accepted,
    fourthWheelFrozenAuthority: current.fourthWheelSweep.wheel,
    fourthPalletSupport: fourthPalletExact.sweep,
    barrelCenter: current.barrelCenter,
    barrelFourth: current.barrelFourth,
    escapePalletExactRenderedSweep: escapePalletExact,
    exactLayout: currentLayout,
    packageZ,
  },
  frozenAuthority: {
    packageRows,
    authorityRows,
    exteriorFinishAndOpticsExact: checks.exteriorFinishAndOpticsExact,
    identitySemanticsHostsAndBoundsExact: checks.identitySemanticsHostsAndBoundsExact,
    identityRawExact: exact(current.authority.exterior.identity, acceptedRuntime.authority.exterior.identity),
    identityFingerprintDelta: {
      acceptedCrown: acceptedRuntime.authority.exterior.identity.crown,
      currentCrown: current.authority.exterior.identity.crown,
      classification: "authorized local crown-cap tessellation change; host, map treatment, silhouette bounds, and rear identity remain exact",
    },
    sapphireOpticalOwnershipExact: checks.sapphireOpticalOwnershipExact,
  },
  annexExplodeZero: {
    scalar: explosion.scalar,
    assembledEquivalence: explosion.assembledEquivalence,
    presentationOnly: explosion.presentationOnly,
    ownerChecks: explosionOwnerChecks,
    layerAndCameraAuthorityExact: checks.annexLayerAndCameraAuthorityExact,
  },
  runtimeDiagnostics: current.runtimeDiagnostics,
};
const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
fs.writeFileSync(path.join(evidenceDir, "final-regression-report.json"), serializedReport);
fs.writeFileSync(path.join(evidenceDir, "final-regression.json"), serializedReport);
console.log(report.disposition);
for (const [name, value] of Object.entries(checks)) console.log(`${value ? "PASS" : "FAIL"} ${name}`);
if (!accepted) process.exitCode = 1;
