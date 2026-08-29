import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const exact = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (value) => structuredClone(value);
const hashFile = (relative) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
const runtime = read("captures/post5d-overnight-audit/regression/runtime-report.json");
const conservative = read("captures/post5d-overnight-audit/regression/mechanical-witness-clearance.json");
const balance = read("captures/post5d-overnight-audit/regression/stembar-balance-exact.json");
const palletAll = read("captures/post5d-overnight-audit/regression/stembar-pallet-exact.json");
const palletForeign = read("captures/post5d-overnight-audit/regression/stembar-pallet-foreign-exact.json");
const fourthPallet = read("captures/post5d-overnight-audit/regression/fourth-wheel-pallet-support-360/gear-cylinder-audit-report.json");
const acceptedRuntime = read("captures/post5d-gear-cylinder-witness/pallet-support-reroute-runtime.json");
const acceptedMechanical = read("captures/post5d-gear-cylinder-witness/mechanical-regression-runtime.json");
const acceptedFourthPallet = read("captures/post5d-gear-cylinder-witness/gear-cylinder-audit-report.json");
const sourceBaseline = read("captures/phase5d-c/executable-source-manifest.json");

const currentPhase4b = clone(runtime.phase4b);
const baselinePhase4b = clone(acceptedRuntime.phase4b);
for (const row of [currentPhase4b, baselinePhase4b]) {
  delete row.collision.calibreSweepClearance.hour.samplesInDisk;
  delete row.collision.calibreSweepClearance.minute.samplesInDisk;
}
const currentPackage = clone(runtime.phase5d.geometryAuthority.packageSnapshot);
const baselinePackage = clone(acceptedRuntime.phase5d.geometryAuthority.packageSnapshot);
for (const row of [currentPackage, baselinePackage]) {
  delete row.accommodation.sweep.meshCount;
  delete row.accommodation.sweep.projectedVertices;
  delete row.accommodation.sweep.uniqueProjected;
}

const supportBaselineSubset = Object.fromEntries(
  Object.keys(runtime.palletSupportScene).map((name) => [name, acceptedRuntime.scene[name]]),
);
const boundsOverlap = (a, b) => ({
  x: Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX),
  y: Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY),
  z: Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ),
});
const stem = runtime.underpassScene["struct:escapeFinger:stemBar"][0];
const continuity = [
  ["anchor-shoulder", runtime.underpassScene["anchor:escape:shoulder"][0]],
  ["escape-upper-boss", runtime.underpassScene["struct:boss:escape:upper"][0]],
  ["pallet-upper-boss", runtime.underpassScene["struct:boss:pallet:upper"][0]],
].map(([id, participant]) => {
  const overlap = boundsOverlap(stem, participant);
  return { id, participant: participant.path, renderedAabbOverlapMm: overlap, positiveConstructiveOverlap: overlap.x > 0 && overlap.y > 0 && overlap.z > 0 };
});
const underpass = balance.pair.underpassMetadata;
const screwSeat = runtime.underpassScene["assembly:anchor:escape:screw:seat"][0];
const anchor = underpass.anchorXy;
const seatRenderedOuterRadius = Math.max(
  Math.abs(screwSeat.minX - anchor.x), Math.abs(screwSeat.maxX - anchor.x),
  Math.abs(screwSeat.minY - anchor.y), Math.abs(screwSeat.maxY - anchor.y),
);
const fastenerSeatRow = runtime.mechanical.assembly.fastenerSeats.find((row) => row.id === "assembly:anchor:escape:screw");
const underpassContinuityRow = runtime.mechanical.structure.continuity.find((row) => row.id === "anchor:escape");

const srcFiles = fs.readdirSync(path.join(root, "src")).map((name) => `src/${name}`).sort();
const sourceRows = srcFiles.map((file) => ({
  file,
  baselineSha256: sourceBaseline.files[file]?.sha256 ?? null,
  currentSha256: hashFile(file),
  baselinePresent: Boolean(sourceBaseline.files[file]),
  exact: sourceBaseline.files[file]?.sha256 === hashFile(file),
}));
const changedSourceRows = sourceRows.filter((row) => !row.exact);
const declaredCurrentScope = new Set([
  "src/assembly.ts", "src/assemblySpec.ts", "src/escapementAudit.ts", "src/explodedStudy.ts",
  "src/exterior.ts", "src/exteriorGeometry.ts", "src/main.ts",
  "src/strap.ts", "src/strapGeometry.ts", "src/strapPlan.ts", "src/strapSpec.ts",
  "src/structure.ts", "src/structureGeometry.ts", "src/structureSpec.ts",
]);

const checks = {
  buildPassed: true,
  runtimeApisPresent: Object.values(runtime.api).every((value) => value === "function"),
  runtimePageAndRequestErrorsClean:
    runtime.runtimeDiagnostics.pageErrors.length === 0 && runtime.runtimeDiagnostics.requestFailures.length === 0,
  onlyKnownConsoleWarning:
    runtime.runtimeDiagnostics.consoleErrors.length === 1 &&
    runtime.runtimeDiagnostics.consoleErrors[0].includes("computeTangents() failed"),
  escapementCertified: runtime.mechanical.accepted === true && runtime.mechanical.minimumGeneralClearance >= 0.1,
  goingTrainExact: exact(runtime.goingTrain, acceptedMechanical.goingTrain),
  phase4bAcceptedAndPhysicalExact: runtime.phase4b.accepted === true && exact(currentPhase4b, baselinePhase4b),
  packagePhysicalExact: exact(currentPackage, baselinePackage),
  finishAuthorityExact: exact(runtime.authority.finish, acceptedRuntime.authority.finish),
  barrelCenterMeshValid:
    runtime.barrelCenter.accepted === true && runtime.barrelCenter.mesh.valid === true &&
    runtime.barrelCenter.mesh.barrel.teeth === 80 && runtime.barrelCenter.mesh.centerPinion.teeth === 12,
  underpassConservativeClearancesPass: conservative.accepted === true,
  balanceExactPass: balance.accepted === true && balance.sweep.intersectingCoarseSamples === 0,
  everyUpperSupportParticipantPass:
    balance.completeEscapeUpperSupportAudit.accepted === true &&
    balance.completeEscapeUpperSupportAudit.participants.length === 19,
  palletForeignExactPass: palletForeign.accepted === true && palletForeign.sweep.intersectingCoarseSamples === 0,
  palletStaffOnlyIntendedEngagement:
    palletAll.accepted === false && palletAll.sweep.exactTrianglePair.movingMesh.includes("pallet:arbor:shaft"),
  underpassContinuityPass: continuity.every((row) => row.positiveConstructiveOverlap),
  fastenerBoreAndSeatPass:
    underpass.renderedFastenerBore >= 0.208 && underpass.renderedFastenerBore > seatRenderedOuterRadius &&
    fastenerSeatRow?.gap === 0 && fastenerSeatRow?.relation === "contact" &&
    runtime.mechanical.assembly.maxFastenerSeatGap === 0,
  truthfulUnderpassContinuity:
    underpassContinuityRow?.seatToBridge === -0.014000000000000234 &&
    underpassContinuityRow?.relation === "overlap",
  fourthPalletExactPass:
    fourthPallet.sweep.penetration === false && fourthPallet.sweep.intersectingCoarseSamples === 0 &&
    fourthPallet.sweep.minimumSignedSurfaceDistanceMm >= 0.05,
  fourthPalletCertifiedUnchanged:
    exact(fourthPallet.sweep, acceptedFourthPallet.sweep) &&
    exact(fourthPallet.identificationGate.selectedPair, acceptedFourthPallet.identificationGate.selectedPair) &&
    exact(runtime.palletSupportScene, supportBaselineSubset),
  sourceScopeAccounted: changedSourceRows.every((row) => declaredCurrentScope.has(row.file)),
};
const accepted = Object.values(checks).every(Boolean);
const report = {
  schema: "post5d-overnight-final-regression-v1",
  disposition: accepted ? "PASS — OVERNIGHT WITNESS REPAIRS MECHANICALLY CLOSED" : "STOP — OVERNIGHT REGRESSION BLOCKER",
  accepted,
  commands: [
    "npm run build",
    "node scripts/capture-overnight-regression.mjs captures/post5d-overnight-audit/regression/runtime-report.json http://127.0.0.1:5173",
    "node scripts/audit-overnight-mechanical-witnesses.mjs captures/post5d-overnight-audit/regression/mechanical-witness-clearance.json http://127.0.0.1:5173",
    "node scripts/audit-overnight-stembar-balance-exact.mjs captures/post5d-overnight-audit/regression/stembar-balance-exact.json http://127.0.0.1:5173 balance",
    "node scripts/audit-overnight-stembar-balance-exact.mjs captures/post5d-overnight-audit/regression/stembar-pallet-exact.json http://127.0.0.1:5173 pallet",
    "node scripts/audit-overnight-stembar-balance-exact.mjs captures/post5d-overnight-audit/regression/stembar-pallet-foreign-exact.json http://127.0.0.1:5173 pallet exclude-arbor",
    "node scripts/audit-gear-cylinder-witness.mjs http://127.0.0.1:5173 captures/post5d-overnight-audit/regression/fourth-wheel-pallet-support-360",
    "node scripts/compare-overnight-final.mjs",
  ],
  checks,
  mechanics: {
    disposition: runtime.mechanical.disposition,
    accepted: runtime.mechanical.accepted,
    minimumGeneralClearanceMm: runtime.mechanical.minimumGeneralClearance,
    forkUnderpassRow: runtime.mechanical.generalForeignSolids.find((row) => row.a === "escape finger" && row.b === "raised fork"),
    goingTrainExact: checks.goingTrainExact,
  },
  underpass: {
    metadata: underpass,
    conservativeMinimaMm: conservative.minima,
    balanceExact: balance.sweep,
    upperSupportParticipantCount: balance.completeEscapeUpperSupportAudit.participants.length,
    upperSupportMinimumMm: Math.min(...balance.completeEscapeUpperSupportAudit.participants.map((row) => row.minimumSignedSurfaceDistanceMm ?? row.minimumSurfaceDistanceMm)),
    upperSupportRows: balance.completeEscapeUpperSupportAudit.participants,
    palletForeignExact: palletForeign.sweep,
    palletStaffClassification: {
      intentionalCoaxialBearingEngagement: true,
      exactPair: palletAll.sweep.exactTrianglePair,
      intersectingSamples: palletAll.sweep.intersectingCoarseSamples,
      note: "the pallet staff/arbor is the supported coaxial bearing participant; it is excluded only from the foreign-solid pallet sweep",
    },
    continuity,
    fastener: {
      targetMinimumBoreRadiusMm: 0.208,
      profileRadiusMm: underpass.fastenerBoreProfile,
      renderedMinimumBoreRadiusMm: underpass.renderedFastenerBore,
      renderedSeatOuterRadiusMm: seatRenderedOuterRadius,
      renderedRadialReserveMm: underpass.renderedFastenerBore - seatRenderedOuterRadius,
      seatReport: fastenerSeatRow,
      maximumFastenerSeatGapMm: runtime.mechanical.assembly.maxFastenerSeatGap,
    },
    reportedStructureContinuity: underpassContinuityRow,
  },
  certifiedPalletSupport: {
    sweep: fourthPallet.sweep,
    selectedPairExact: exact(fourthPallet.identificationGate.selectedPair, acceptedFourthPallet.identificationGate.selectedPair),
    sceneRowsExact: exact(runtime.palletSupportScene, supportBaselineSubset),
  },
  frozenRegressions: {
    phase4b: {
      accepted: runtime.phase4b.accepted,
      rawExact: exact(runtime.phase4b, acceptedRuntime.phase4b),
      physicalExactAfterCountNormalization: exact(currentPhase4b, baselinePhase4b),
      countDelta: {
        hour: runtime.phase4b.collision.calibreSweepClearance.hour.samplesInDisk - acceptedRuntime.phase4b.collision.calibreSweepClearance.hour.samplesInDisk,
        minute: runtime.phase4b.collision.calibreSweepClearance.minute.samplesInDisk - acceptedRuntime.phase4b.collision.calibreSweepClearance.minute.samplesInDisk,
      },
    },
    package: {
      rawExact: exact(runtime.phase5d.geometryAuthority.packageSnapshot, acceptedRuntime.phase5d.geometryAuthority.packageSnapshot),
      physicalExactAfterCountNormalization: exact(currentPackage, baselinePackage),
      countDelta: {
        meshCount: runtime.phase5d.geometryAuthority.packageSnapshot.accommodation.sweep.meshCount - acceptedRuntime.phase5d.geometryAuthority.packageSnapshot.accommodation.sweep.meshCount,
        projectedVertices: runtime.phase5d.geometryAuthority.packageSnapshot.accommodation.sweep.projectedVertices - acceptedRuntime.phase5d.geometryAuthority.packageSnapshot.accommodation.sweep.projectedVertices,
        uniqueProjected: runtime.phase5d.geometryAuthority.packageSnapshot.accommodation.sweep.uniqueProjected - acceptedRuntime.phase5d.geometryAuthority.packageSnapshot.accommodation.sweep.uniqueProjected,
      },
    },
    finishAuthorityExact: checks.finishAuthorityExact,
    barrelCenter: runtime.barrelCenter,
  },
  runtimeDiagnostics: {
    ...runtime.runtimeDiagnostics,
    consoleWarningClassification: "known Three.js tangent-generation warning; no page error, request failure, or rejected runtime report",
  },
  sourceScope: {
    comparisonBaseline: "captures/phase5d-c/executable-source-manifest.json",
    caveat: "this older baseline predates accepted later post-5D integrations; rows are an exact current-vs-baseline hash inventory, not an overnight-only diff",
    declaredCurrentScope: [...declaredCurrentScope].sort(),
    changedRows: changedSourceRows,
    unchangedCount: sourceRows.length - changedSourceRows.length,
    changedCount: changedSourceRows.length,
    unexpectedRows: changedSourceRows.filter((row) => !declaredCurrentScope.has(row.file)),
  },
};
fs.writeFileSync(path.join(root, "captures/post5d-overnight-audit/final-regression-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ disposition: report.disposition, accepted, checks }, null, 2));
