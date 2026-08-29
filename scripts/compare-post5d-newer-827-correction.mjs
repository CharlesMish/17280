import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const evidence = path.join(root, "captures/post5d-newer-827-correction");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const sha = (data) => crypto.createHash("sha256").update(data).digest("hex");
const fileSha = (relative) => sha(fs.readFileSync(path.join(root, relative)));
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const canonical = (value) => JSON.stringify(stable(value));
const exact = (a, b) => canonical(a) === canonical(b);

const current = read("captures/post5d-newer-827-correction/runtime-regression.json");
const baseline = read("captures/post5d-newer-827/regression/runtime-report.json");
const baselineFinal = read("captures/post5d-newer-827/final-regression-report.json");
const junction = read("captures/post5d-newer-827-correction/junction3-runtime-regression.json");
const junctionTopology = read("captures/post5d-newer-827-correction/junction3-topology-report.json");
const centerThird = read("captures/post5d-newer-827-correction/05-center-third-final-mesh-report.json");
const escapePallet = read("captures/post5d-newer-827/05-escape-pallet-sweep-report.json");
const fourthPallet = read(
  "captures/post5d-newer-827/regression/fourth-wheel-pallet-support-360/gear-cylinder-audit-report.json",
);

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

const baselineHashes = Object.fromEntries(
  baselineFinal.sourceScope.allRows.map((row) => [row.file, row.currentSha256]),
);
const sourceFiles = fs.readdirSync(path.join(root, "src"), { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => `src/${entry.name}`)
  .sort();
const sourceRows = sourceFiles.map((file) => ({
  file,
  baselineSha256: baselineHashes[file] ?? null,
  currentSha256: fileSha(file),
  changed: baselineHashes[file] !== fileSha(file),
}));
const changedRows = sourceRows.filter((row) => row.changed);
const expectedChanged = new Set([
  "src/escapementAudit.ts",
  "src/geometry.ts",
  "src/movement.ts",
  "src/structure.ts",
]);

const normalizePhase4b = (source) => {
  const row = structuredClone(source);
  delete row.centerPassage?.bridgeExteriorBounds;
  delete row.collision?.calibreSweepClearance?.hour?.samplesInDisk;
  delete row.collision?.calibreSweepClearance?.minute?.samplesInDisk;
  return row;
};
const normalizePackage = (source) => {
  const row = structuredClone(source);
  delete row.accommodation?.sweep?.meshCount;
  delete row.accommodation?.sweep?.projectedVertices;
  delete row.accommodation?.sweep?.uniqueProjected;
  return row;
};
const normalizeEscapement = (source) => {
  const row = structuredClone(source);
  delete row.structure;
  delete row.bridgeContinuity;
  delete row.supportGraph;
  delete row.assembly;
  // The authorized center-wheel tooth slabs no longer use the generic
  // 0.016 mm outward bevel. Its two foreign-arbor radial clearances therefore
  // improve by that amount; preserve every other field and gate exactly.
  for (const pair of row.generalForeignSolids ?? []) {
    if (pair.a === "center wheel" && ["fourth arbor", "escape arbor"].includes(pair.b)) {
      delete pair.minimumClearance;
    }
  }
  return row;
};
const normalizeAuthority = (name, source) => {
  const row = structuredClone(source);
  if (name === "accommodation") {
    delete row.sweep?.meshCount;
    delete row.sweep?.projectedVertices;
    delete row.sweep?.uniqueProjected;
    delete row.sweep?.verticesEvaluated;
    delete row.corridor?.samples;
  }
  if (name === "display") {
    delete row.hourClearance?.samplesInDisk;
    delete row.minuteClearance?.samplesInDisk;
  }
  if (name === "enclosure") delete row.rear?.clearance?.samples;
  return row;
};
const normalizeAnnex = (source) => {
  const row = structuredClone(source);
  for (const object of row.objects ?? []) delete object.geometryMeshes;
  return row;
};

const focus = (report, name) => report.sceneSummary.focusRows.find((row) => row.name === name);
const unchangedGearNames = [
  "third:wheel",
  "fourth:wheel",
  "fourth:pinion",
  "escape:wheel",
  "escape:pinion",
];
const unchangedGearRows = unchangedGearNames.map((name) => ({
  name,
  exact: exact(focus(current, name), focus(baseline, name)),
  baseline: focus(baseline, name),
  current: focus(current, name),
}));
const centerBefore = baseline.barrelCenter.stackedProjection.centerWheelBounds;
const centerAfter = current.barrelCenter.stackedProjection.centerWheelBounds;
const thirdPinionBefore = baseline.barrelFourth.planes.rendered.thirdPinion;
const thirdPinionAfter = current.barrelFourth.planes.rendered.thirdPinion;
const zAuthority = {
  centerWheel: {
    before: [centerBefore.minZ, centerBefore.maxZ],
    after: [centerAfter.minZ, centerAfter.maxZ],
    exact: centerBefore.minZ === centerAfter.minZ && centerBefore.maxZ === centerAfter.maxZ,
  },
  thirdPinion: {
    before: [thirdPinionBefore.minZ, thirdPinionBefore.maxZ],
    after: [thirdPinionAfter.minZ, thirdPinionAfter.maxZ],
    exact:
      thirdPinionBefore.minZ === thirdPinionAfter.minZ &&
      thirdPinionBefore.maxZ === thirdPinionAfter.maxZ,
  },
};

const packageCurrent = normalizePackage(current.phase5d.geometryAuthority.packageSnapshot);
const packageBaseline = normalizePackage(baseline.phase5d.geometryAuthority.packageSnapshot);
const packageRows = Object.keys(packageBaseline).map((name) => ({
  name,
  exact: exact(packageCurrent[name], packageBaseline[name]),
  baselineSha256: sha(canonical(packageBaseline[name])),
  currentSha256: sha(canonical(packageCurrent[name])),
}));
const authorityNames = ["assembly", "accommodation", "display", "enclosure", "exterior", "readout", "finish", "strap"];
const authorityRows = authorityNames.map((name) => ({
  name,
  exact: exact(
    normalizeAuthority(name, current.authority[name]),
    normalizeAuthority(name, baseline.authority[name]),
  ),
}));
const knownWarning = (message) => message.includes("computeTangents() failed");
const clearanceFor = (report, other) => report.escapement.generalForeignSolids.find(
  (row) => row.a === "center wheel" && row.b === other,
)?.minimumClearance;
const supportRows = (report) => report.sceneSummary.focusRows
  .filter((row) => row.path.includes("column:pallet"))
  .sort((a, b) => a.path.localeCompare(b.path));

const checks = {
  buildAndTypecheckPass: build.passed,
  runtimeApisPresent: Object.values(current.api).every((value) => value === "function"),
  runtimeClean:
    current.runtimeDiagnostics.pageErrors.length === 0 &&
    current.runtimeDiagnostics.requestFailures.length === 0 &&
    current.runtimeDiagnostics.consoleErrors.every(knownWarning),
  sourceScopeExact:
    changedRows.length === expectedChanged.size &&
    changedRows.every((row) => expectedChanged.has(row.file)) &&
    sourceRows.every((row) => row.baselineSha256 !== null),
  targetCenterThirdSweepPass:
    centerThird.classification === "VALID — CENTER WHEEL / THIRD PINION POSITIVE CLEARANCE" &&
    centerThird.result.sampleCount === 8193 &&
    centerThird.result.collisionSamples === 0 &&
    centerThird.result.maximumIntersectionAreaMm2 === 0 &&
    centerThird.result.minimumPositiveClearanceMm > 0,
  targetCenterThirdAuthority:
    centerThird.geometry.centerDistanceMm === centerThird.geometry.requiredPitchSumMm &&
    centerThird.invariance.toothCounts.center === 64 &&
    centerThird.invariance.toothCounts.thirdPinion === 10 &&
    centerThird.invariance.moduleMm === 0.145 &&
    centerThird.invariance.thirdWheelLocalRotationUnchanged === 0 &&
    centerThird.geometry.profile.thirdPinionLocalClockingDeg === -9.2 &&
    centerThird.geometry.profile.totalPitchCircleBacklashMm === 0.02,
  targetRenderedGearPlanesExact: zAuthority.centerWheel.exact && zAuthority.thirdPinion.exact,
  untouchedGearRowsExact: unchangedGearRows.every((row) => row.exact),
  goingTrainExact: exact(current.goingTrain, baseline.goingTrain),
  escapementStillCertified:
    current.escapement.accepted === true &&
    current.escapement.disposition === "PRE-5D ESCAPEMENT REPAIR — CLOSED & MECHANICALLY CERTIFIED",
  escapementFunctionalAuthorityExact: exact(
    normalizeEscapement(current.escapement),
    normalizeEscapement(baseline.escapement),
  ),
  targetCenterWheelForeignClearancesNonDegraded:
    clearanceFor(current, "fourth arbor") >= clearanceFor(baseline, "fourth arbor") &&
    clearanceFor(current, "escape arbor") >= clearanceFor(baseline, "escape arbor"),
  phase4bAcceptedAndExact:
    current.phase4b.accepted === true &&
    exact(normalizePhase4b(current.phase4b), normalizePhase4b(baseline.phase4b)),
  junctionProductTopologyPass:
    junction.accepted === true &&
    junction.runtime.sceneOwnership.renderedStubOwnerCount === 0 &&
    junctionTopology.newClosedVolumes === 1 &&
    junctionTopology.newTopology.degenerateTriangles === 0 &&
    junctionTopology.newTopology.boundaryEdges === 0 &&
    junctionTopology.newTopology.nonManifoldEdges === 0 &&
    junctionTopology.maximumBoundsDelta === 0,
  junctionStructureAndEscapementPass:
    junction.runtime.escapement.accepted === true &&
    junction.runtime.escapement.forkStub.actualRenderedMinimum >= 0.1 &&
    junction.runtime.escapement.bridgeContinuity.projectedUnionGap === 0 &&
    junction.runtime.escapement.bridgeContinuity.footDelta === 0 &&
    junction.runtime.escapement.bridgeContinuity.seatToBridgeGap === 0,
  packagePhysicalAuthorityExact: packageRows.every((row) => row.exact),
  packageTopBottomExact:
    current.authority.exterior.z.packageTop === 7.4616000001162295 &&
    current.authority.exterior.z.packageBottom === -2.596000005245209,
  immutableAuthorityReportsExact: authorityRows.every((row) => row.exact),
  annexExplodeZeroExactAfterOwnerCountNormalization: exact(
    normalizeAnnex(current.annexExplodeZero),
    normalizeAnnex(baseline.annexExplodeZero),
  ),
  phase5dStillClosed: current.phase5d.disposition === "PHASE 5D-C — FINAL PRESENTATION CLOSED",
  priorEscapePalletRepairStillAccepted:
    escapePallet.accepted === true &&
    escapePallet.postRepair.every((row) => row.collisionSamples === 0),
  priorFourthPalletSupportStillAccepted:
    fourthPallet.sweep.penetration === false &&
    fourthPallet.sweep.intersectingCoarseSamples === 0 &&
    fourthPallet.sweep.minimumSignedSurfaceDistanceMm >= 0.05,
  priorPalletSupportRenderedOwnersExact: exact(supportRows(current), supportRows(baseline)),
};

const accepted = Object.values(checks).every(Boolean);
const report = {
  schema: "post5d-newer-827-corrected-witnesses-final-regression/v1",
  disposition: accepted
    ? "PASS — CORRECTED #3/#5 TARGET REPAIRS REGRESSION CLOSED"
    : "STOP — CORRECTED #3/#5 REGRESSION BLOCKER",
  accepted,
  checks,
  build,
  sourceScope: {
    baseline: "captures/post5d-newer-827/final-regression-report.json",
    expectedChanged: [...expectedChanged].sort(),
    changedRows,
    unexpectedRows: changedRows.filter((row) => !expectedChanged.has(row.file)),
    unchangedCount: sourceRows.length - changedRows.length,
  },
  correctedTargets: {
    junction3: {
      participants: junctionTopology.beforeOwners,
      finalProductOwner: junctionTopology.afterProductOwner,
      topology: junctionTopology.newTopology,
      maximumBoundsDelta: junctionTopology.maximumBoundsDelta,
      planarOverlapRemovedMm2: junctionTopology.planarOverlapArea,
      forkStubMinimumMm: junction.runtime.escapement.forkStub.actualRenderedMinimum,
    },
    gear5: {
      participants: centerThird.participants,
      geometry: centerThird.geometry,
      result: centerThird.result,
      zAuthority,
    },
  },
  frozenRegression: {
    packageRows,
    authorityRows,
    unchangedGearRows,
    packageZ: current.authority.exterior.z,
    goingTrainExact: checks.goingTrainExact,
    phase4bExact: checks.phase4bAcceptedAndExact,
    escapementExact: checks.escapementFunctionalAuthorityExact,
  },
  readOnlyLatentGearMeshFindings: {
    classification: "pre-existing generic decorative-profile/expanding-bevel penetrations; not edited in this bounded correction",
    rows: centerThird.otherPairScreens.map((row) => ({
      id: row.id,
      collisionSamples: row.collisionSamples,
      sampleCount: row.sampleCount,
      maximumIntersectionAreaMm2: row.maximumIntersectionAreaMm2,
      classification: row.classification,
    })),
  },
  runtimeDiagnostics: current.runtimeDiagnostics,
};

fs.mkdirSync(evidence, { recursive: true });
fs.writeFileSync(path.join(evidence, "final-regression-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.disposition}: ${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} gates`);
if (!accepted) {
  for (const [name, value] of Object.entries(checks)) if (!value) console.error(`FAIL ${name}`);
  process.exitCode = 1;
}
