import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outDir = path.join(root, "captures/post5d-newer-827-followup");
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

const current = read("captures/post5d-newer-827-followup/runtime-regression.json");
const baseline = read("captures/post5d-newer-827-correction/runtime-regression.json");
const overnightFinal = read("captures/post5d-newer-827/final-regression-report.json");
const priorFinal = read("captures/post5d-newer-827-correction/final-regression-report.json");
const gear = read("captures/post5d-newer-827-correction/06-third-fourth-final-mesh-report.json");
const junction = read("captures/post5d-junction-escape/junction-report.json");
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

// Reconstruct the immediate accepted source authority: start from the complete
// overnight inventory, then overlay the four accepted #3/#5 correction hashes.
const immediateBaselineHashes = Object.fromEntries(
  overnightFinal.sourceScope.allRows.map((row) => [row.file, row.currentSha256]),
);
for (const row of priorFinal.sourceScope.changedRows) immediateBaselineHashes[row.file] = row.currentSha256;
const sourceFiles = fs.readdirSync(path.join(root, "src"), { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => `src/${entry.name}`)
  .sort();
const sourceRows = sourceFiles.map((file) => ({
  file,
  baselineSha256: immediateBaselineHashes[file] ?? null,
  currentSha256: fileSha(file),
  changed: immediateBaselineHashes[file] !== fileSha(file),
}));
const changedRows = sourceRows.filter((row) => row.changed);
const expectedChanged = new Set(["src/movement.ts", "src/structure.ts"]);

// These counts are transparent consequences of replacing two independently
// rendered plate ribbons with one product owner. No measured physical value is
// removed here.
const normalizeSamplingCounts = (name, source) => {
  const row = structuredClone(source);
  if (name === "phase4b") {
    delete row.collision?.calibreSweepClearance?.hour?.samplesInDisk;
    delete row.collision?.calibreSweepClearance?.minute?.samplesInDisk;
  }
  if (name === "package") {
    delete row.accommodation?.sweep?.meshCount;
    delete row.accommodation?.sweep?.projectedVertices;
    delete row.accommodation?.sweep?.uniqueProjected;
  }
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
  if (name === "annex") {
    for (const object of row.objects ?? []) delete object.geometryMeshes;
  }
  return row;
};

const targetClearancePairs = new Set([
  "third wheel|escape arbor",
  "third wheel|balance lower pivot tip",
  "third wheel|fourth shaft",
]);
const clearanceRows = (report) => Object.fromEntries(
  (report.escapement.generalForeignSolids ?? []).map((row) => [`${row.a}|${row.b}`, row.minimumClearance]),
);
const currentClearances = clearanceRows(current);
const baselineClearances = clearanceRows(baseline);
const targetClearanceDeltas = [...targetClearancePairs].map((pair) => ({
  pair,
  baselineMm: baselineClearances[pair],
  currentMm: currentClearances[pair],
  deltaMm: currentClearances[pair] - baselineClearances[pair],
  nonDegraded: currentClearances[pair] >= baselineClearances[pair],
}));
const normalizeAuthorizedTargetClearances = (source) => {
  const row = structuredClone(source);
  for (const pair of row.generalForeignSolids ?? []) {
    if (targetClearancePairs.has(`${pair.a}|${pair.b}`)) delete pair.minimumClearance;
  }
  return row;
};

const focus = (report, name) => report.sceneSummary.focusRows.find((row) => row.name === name);
const exactFocusNames = [
  "barrel:wheel",
  "center:wheel",
  "center:pinion",
  "third:pinion",
  "fourth:wheel",
  "escape:wheel",
  "escape:pinion",
];
const exactFocusRows = exactFocusNames.map((name) => ({
  name,
  exact: exact(focus(current, name), focus(baseline, name)),
  baseline: focus(baseline, name),
  current: focus(current, name),
}));
const zBounds = (row) => ({
  world: [row.minZ, row.maxZ],
});
const targetRuntimeRows = ["third:wheel", "fourth:pinion"].map((name) => ({
  name,
  baselineZ: zBounds(focus(baseline, name)),
  currentZ: zBounds(focus(current, name)),
  zExact: exact(zBounds(focus(current, name)), zBounds(focus(baseline, name))),
  baselinePath: focus(baseline, name).path,
  currentPath: focus(current, name).path,
  pathExact: focus(baseline, name).path === focus(current, name).path,
}));

const packageCurrent = normalizeSamplingCounts(
  "package",
  current.phase5d.geometryAuthority.packageSnapshot,
);
const packageBaseline = normalizeSamplingCounts(
  "package",
  baseline.phase5d.geometryAuthority.packageSnapshot,
);
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
    normalizeSamplingCounts(name, current.authority[name]),
    normalizeSamplingCounts(name, baseline.authority[name]),
  ),
}));
const knownWarning = (message) => message.includes("computeTangents() failed");
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
    sourceRows.length === Object.keys(immediateBaselineHashes).length &&
    sourceRows.every((row) => row.baselineSha256 !== null) &&
    changedRows.length === expectedChanged.size &&
    changedRows.every((row) => expectedChanged.has(row.file)),
  geometryAndEscapementAuditSourceUnchanged:
    sourceRows.find((row) => row.file === "src/geometry.ts")?.changed === false &&
    sourceRows.find((row) => row.file === "src/escapementAudit.ts")?.changed === false,
  targetThirdFourthSweepPass:
    gear.classification === "VALID — THIRD WHEEL / FOURTH PINION POSITIVE CLEARANCE" &&
    gear.result.sampleCount === 8193 &&
    gear.result.collisionSamples === 0 &&
    gear.result.maximumIntersectionAreaMm2 === 0 &&
    gear.result.minimumPositiveClearanceMm > 0,
  targetThirdFourthAuthority:
    Math.abs(gear.geometry.centerDistanceMm - gear.geometry.requiredPitchSumMm) <= 1e-12 &&
    gear.invariance.toothCounts.primary === 60 &&
    gear.invariance.toothCounts.secondary === 8 &&
    gear.invariance.moduleMm === 0.145 &&
    gear.geometry.profile.secondaryLocalClockingDeg === -12.05 &&
    gear.geometry.profile.totalPitchCircleBacklashMm === 0.02 &&
    gear.invariance.ratio === "secondaryDelta = -primaryDelta * 60/8",
  targetThirdFourthAxesExact:
    exact(gear.invariance.axes.primary, [4.549778035879225, 2.843016852611144, 1.66]) &&
    exact(gear.invariance.axes.secondary, [0.14362218235134794, 5.054507434644454, 1.003]),
  targetRenderedZAndOwnershipExact: targetRuntimeRows.every((row) => row.zExact && row.pathExact),
  unrelatedGearRowsExact: exactFocusRows.every((row) => row.exact),
  goingTrainExact: exact(current.goingTrain, baseline.goingTrain),
  phase4bAcceptedAndExact:
    current.phase4b.accepted === true &&
    exact(
      normalizeSamplingCounts("phase4b", current.phase4b),
      normalizeSamplingCounts("phase4b", baseline.phase4b),
    ),
  escapementStillCertified:
    current.escapement.accepted === true &&
    current.escapement.disposition === "PRE-5D ESCAPEMENT REPAIR — CLOSED & MECHANICALLY CERTIFIED",
  escapementExactExceptAuthorizedClearanceImprovements: exact(
    normalizeAuthorizedTargetClearances(current.escapement),
    normalizeAuthorizedTargetClearances(baseline.escapement),
  ),
  targetProfileClearancesNonDegraded: targetClearanceDeltas.every((row) => row.nonDegraded),
  junctionClosedAndCorrectOwners:
    junction.status === "closed" &&
    junction.participants.oldProductOwners.length === 2 &&
    junction.repair.productRenderOwnerAfter.endsWith("struct:plate:spoke:center-network") &&
    junction.repair.logicalOwnerRetained === "struct:plate:spoke:escape-pallet" &&
    junction.repair.logicalOwnerInProductScene === false,
  junctionTopologyClosed:
    junction.topologyAfter.degenerateTriangleCount === 0 &&
    junction.topologyAfter.boundaryEdgeCount === 0 &&
    junction.topologyAfter.nonManifoldEdgeCount === 0 &&
    junction.topologyAfter.exposedInternalCapCountAtJoin === 0 &&
    junction.topologyAfter.coplanarDuplicateProductOwnerCountAtJoin === 0,
  junctionPhysicalAuthorityExact:
    junction.repair.physicalAuthority.escapeAxisChanged === false &&
    junction.repair.physicalAuthority.palletAxisChanged === false &&
    junction.repair.physicalAuthority.columnOrBearingChanged === false &&
    junction.repair.physicalAuthority.plateGaugeOrZChanged === false &&
    junction.repair.physicalAuthority.packageGrowthMm === 0 &&
    junction.ownershipAndBoundsMm.afterVersusOldCombined.zAuthorityExact === true,
  structureAndBearingReportExact: exact(current.authority.structure, baseline.authority.structure),
  priorPalletSupportRenderedOwnersExact: exact(supportRows(current), supportRows(baseline)),
  packagePhysicalAuthorityExact: packageRows.every((row) => row.exact),
  packageTopBottomExact:
    current.authority.exterior.z.packageTop === 7.4616000001162295 &&
    current.authority.exterior.z.packageBottom === -2.596000005245209,
  immutableAuthorityReportsExact: authorityRows.every((row) => row.exact),
  annexExplodeZeroExactAfterSamplingCountNormalization: exact(
    normalizeSamplingCounts("annex", current.annexExplodeZero),
    normalizeSamplingCounts("annex", baseline.annexExplodeZero),
  ),
  phase5dStillClosed: current.phase5d.disposition === "PHASE 5D-C — FINAL PRESENTATION CLOSED",
  finishIdentitySapphireExact:
    exact(current.authority.finish, baseline.authority.finish) &&
    exact(current.authority.exterior.identity, baseline.authority.exterior.identity) &&
    exact(current.phase5d.sapphireOwnership, baseline.phase5d.sapphireOwnership),
  priorCenterThirdRepairStillAccepted:
    centerThird.classification === "VALID — CENTER WHEEL / THIRD PINION POSITIVE CLEARANCE" &&
    centerThird.result.sampleCount === 8193 &&
    centerThird.result.collisionSamples === 0,
  priorEscapePalletRepairStillAccepted:
    escapePallet.accepted === true &&
    escapePallet.postRepair.every((row) => row.collisionSamples === 0),
  priorFourthPalletSupportStillAccepted:
    fourthPallet.sweep.penetration === false &&
    fourthPallet.sweep.intersectingCoarseSamples === 0 &&
    fourthPallet.sweep.minimumSignedSurfaceDistanceMm >= 0.05,
};

const accepted = Object.values(checks).every(Boolean);
const report = {
  schema: "post5d-newer-827-followup-final-regression/v1",
  disposition: accepted
    ? "PASS — FOLLOW-UP GEAR/JUNCTION REGRESSION CLOSED"
    : "STOP — FOLLOW-UP GEAR/JUNCTION REGRESSION BLOCKER",
  accepted,
  checks,
  build,
  runtimeDiagnostics: current.runtimeDiagnostics,
  sourceScope: {
    baseline: "captures/post5d-newer-827-correction/final-regression-report.json plus its complete inherited source inventory",
    expectedChanged: [...expectedChanged].sort(),
    changedRows,
    unexpectedRows: changedRows.filter((row) => !expectedChanged.has(row.file)),
    unchangedCount: sourceRows.length - changedRows.length,
    allRows: sourceRows,
  },
  correctedTargets: {
    thirdWheelFourthPinion: {
      pairId: gear.pairId,
      classification: gear.classification,
      participants: gear.participants,
      geometry: gear.geometry,
      result: gear.result,
      axes: gear.invariance.axes,
      ratio: gear.invariance.ratio,
      runtimeZAndOwnership: targetRuntimeRows,
    },
    visiblePerlageJunction: {
      classification: junction.classification,
      participants: junction.participants,
      repair: junction.repair,
      ownershipAndBoundsMm: junction.ownershipAndBoundsMm,
      topologyAfter: junction.topologyAfter,
      clearanceRegressionMm: junction.clearanceRegressionMm,
      structuralRegression: junction.structuralRegression,
    },
  },
  frozenRegression: {
    packageRows,
    authorityRows,
    exactFocusRows,
    targetClearanceDeltas,
    packageZ: current.authority.exterior.z,
    goingTrainExact: checks.goingTrainExact,
    phase4bExact: checks.phase4bAcceptedAndExact,
    escapementExactExceptAuthorizedClearanceImprovements:
      checks.escapementExactExceptAuthorizedClearanceImprovements,
  },
  readOnlyLatentGearMeshFindings: {
    classification: "pre-existing generic decorative-profile/expanding-bevel penetrations; not edited in this bounded follow-up",
    rows: gear.otherPairScreens
      .filter((row) => row.id !== "third60-fourth8")
      .map((row) => ({
        id: row.id,
        collisionSamples: row.collisionSamples,
        sampleCount: row.sampleCount,
        maximumIntersectionAreaMm2: row.maximumIntersectionAreaMm2,
        classification: row.classification,
      })),
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "final-regression-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.disposition}: ${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} gates`);
if (!accepted) {
  for (const [name, value] of Object.entries(checks)) if (!value) console.error(`FAIL ${name}`);
  process.exitCode = 1;
}
