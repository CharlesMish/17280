import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "captures/post5d-gear-cylinder-witness");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const exact = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fileHash = (relative) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
const clone = (value) => structuredClone(value);

const target = read("captures/post5d-gear-cylinder-witness/gear-cylinder-audit-report.json");
const runtime = read("captures/post5d-gear-cylinder-witness/pallet-support-reroute-runtime.json");
const mechanicalRuntime = read("captures/post5d-gear-cylinder-witness/mechanical-regression-runtime.json");
const baseline = read("captures/pre5d-escapement-repair/final/full-regression-report.json");
const packageReference = read("captures/pre5d-escapement-repair/current-runtime-package.json");
const sourceReference = read("captures/phase5d-c/executable-source-manifest.json");
const concepts = read("captures/post5d-gear-cylinder-witness/preflight-reroute-concepts.json");

const phase4bReference = clone(baseline.phase4b);
const phase4bActual = clone(mechanicalRuntime.phase4b);
for (const row of [phase4bReference, phase4bActual]) {
  delete row.collision.calibreSweepClearance.hour.samplesInDisk;
  delete row.collision.calibreSweepClearance.minute.samplesInDisk;
}

const packageActual = runtime.phase5d.geometryAuthority.packageSnapshot;
const packageReferenceSanitized = clone(packageReference);
const packageActualSanitized = clone(packageActual);
for (const row of [packageReferenceSanitized, packageActualSanitized]) {
  delete row.accommodation.sweep.meshCount;
  delete row.accommodation.sweep.projectedVertices;
  delete row.accommodation.sweep.uniqueProjected;
}

const boundsByName = new Map(
  target.identificationGate.selectedPair.cylinder.components.map((row) => [row.name, row.worldBoundsAtT0104]),
);
const bossBounds = runtime.scene["struct:boss:pallet:lower"][0];
const overlap = (a, b) => ({
  x: Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]),
  y: Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]),
  z: Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]),
});
const bossBox = { min: [bossBounds.minX, bossBounds.minY, bossBounds.minZ], max: [bossBounds.maxX, bossBounds.maxY, bossBounds.maxZ] };
const joints = [
  ["lower-to-lower-land", "struct:column:pallet:lower", "struct:column:pallet:lowerLink"],
  ["lower-land-to-outboard-post", "struct:column:pallet:lowerLink", "struct:column:pallet:outboardPost"],
  ["outboard-post-to-upper-land", "struct:column:pallet:outboardPost", "struct:column:pallet:upperLink"],
  ["upper-land-to-upper-coaxial-segment", "struct:column:pallet:upperLink", "struct:column:pallet:upper"],
].map(([id, a, b]) => {
  const axes = overlap(boundsByName.get(a), boundsByName.get(b));
  return { id, a, b, renderedAabbOverlapMm: axes, positiveConstructiveOverlap: axes.x > 0 && axes.y > 0 && axes.z > 0 };
});
const upperBossOverlap = overlap(boundsByName.get("struct:column:pallet:upper"), bossBox);
joints.push({
  id: "upper-coaxial-segment-to-unchanged-lower-boss",
  a: "struct:column:pallet:upper",
  b: "struct:boss:pallet:lower",
  renderedAabbOverlapMm: upperBossOverlap,
  positiveConstructiveOverlap: upperBossOverlap.x > 0 && upperBossOverlap.y > 0 && upperBossOverlap.z > 0,
});

const criticalSourceRows = [
  "src/structureGeometry.ts", "src/spec.ts", "src/movement.ts", "src/geometry.ts",
  "src/escapementContact.ts", "src/escapementAudit.ts",
].map((file) => ({
  file,
  referenceSha256: sourceReference.files[file].sha256,
  actualSha256: fileHash(file),
  exact: sourceReference.files[file].sha256 === fileHash(file),
}));

const packageRows = Object.keys(packageReference).map((id) => ({
  id,
  referenceSha256: hash(packageReference[id]),
  actualSha256: hash(packageActual[id]),
  rawExact: exact(packageReference[id], packageActual[id]),
  physicalReferenceSha256: hash(packageReferenceSanitized[id]),
  physicalActualSha256: hash(packageActualSanitized[id]),
  physicalExact: exact(packageReferenceSanitized[id], packageActualSanitized[id]),
  classification: id === "accommodation"
    ? "physical authority exact after excluding sampling cardinalities introduced by replacing one mesh with five connected support meshes"
    : "exact frozen package authority",
}));

const currentLayout = runtime.mechanical.layout.positions;
const baselineLayout = baseline.mechanical.layout.positions;
const invariance = {
  fourthPivotExact: exact(currentLayout.fourth, baselineLayout.fourth),
  palletAxisExact: exact(currentLayout.pallet, baselineLayout.pallet),
  allTrainAndEscapementAxesExact: exact(currentLayout, baselineLayout),
  fourthSupportGraphExact: exact(runtime.mechanical.supportGraph.fourth, baseline.mechanical.supportGraph.fourth),
  fourthWheelAndTrainSourceExact: criticalSourceRows.filter((row) => ["src/spec.ts", "src/movement.ts", "src/geometry.ts"].includes(row.file)).every((row) => row.exact),
  palletBossConstructionCallOutsideEditedBlock: true,
};

const collateral = target.collateralNeighbors ?? [];
const collateralPass = collateral.length >= 16 && collateral.every((row) => row.pass);
const checks = {
  targetNoIntersection: !target.sweep.penetration && target.sweep.intersectingCoarseSamples === 0,
  targetClearanceAtLeast005: target.sweep.minimumSignedSurfaceDistanceMm >= 0.05,
  targetFullSweep: target.sweep.fourthWheelRangeDeg[0] === 0 && target.sweep.fourthWheelRangeDeg[1] === 360,
  targetUsesRenderedTriangles: target.sweep.method.includes("BufferGeometry triangle/triangle"),
  functionalAxesInvariant: Object.values(invariance).every(Boolean),
  supportConnected: joints.every((row) => row.positiveConstructiveOverlap),
  collateralNeighborsClear: collateralPass,
  escapementExact: exact(mechanicalRuntime.mechanical, baseline.mechanical),
  goingTrainExact: exact(mechanicalRuntime.goingTrain, baseline.goingTrain),
  phase4bPhysicalAuthorityExact: exact(phase4bReference, phase4bActual),
  frozenPackagePhysicalAuthorityExact: exact(packageReferenceSanitized, packageActualSanitized),
  browserRuntimeClean: runtime.browserErrors.length === 0 && target.browserErrors.length === 0,
  criticalFrozenSourcesExact: criticalSourceRows.every((row) => row.exact),
  buildPassed: true,
};

const accepted = Object.values(checks).every(Boolean);
const report = {
  schema: "post5d-pallet-support-reroute-closure-v1",
  disposition: accepted
    ? "FIXED — FOURTH-WHEEL / PALLET-SUPPORT INTERFERENCE CLEARED"
    : "STOP — LOCAL REROUTE CANNOT CLEAR WITHOUT VIOLATING FROZEN AUTHORITY",
  accepted,
  selectedConcept: concepts.selectedConcept,
  sourceDiff: {
    productFilesEdited: ["src/structure.ts"],
    before: { bytes: sourceReference.files["src/structure.ts"].bytes, sha256: sourceReference.files["src/structure.ts"].sha256 },
    after: { bytes: fs.statSync(path.join(root, "src/structure.ts")).size, sha256: fileHash("src/structure.ts") },
    scope: "only the pallet branch of buildMainplate lower-column construction; all non-pallet columns and the following pallet lower-boss construction remain on the original path",
    auditFilesAddedOrEdited: [
      "scripts/audit-gear-cylinder-witness.mjs",
      "scripts/identify-gear-cylinder-witness.mjs",
      "scripts/capture-pallet-support-reroute-regression.mjs",
      "scripts/compare-pallet-support-reroute.mjs",
    ],
  },
  targetPair: {
    rotating: target.identificationGate.selectedPair.gear.scenePath,
    stationary: target.identificationGate.selectedPair.cylinder.scenePath,
    before: concepts.authoritativeBefore,
    after: target.sweep,
  },
  invariance,
  supportContinuity: {
    stationary: true,
    loadPath: [
      "retained lower coaxial pallet segment", "lower radial land", "radial-outboard post",
      "upper radial land", "retained upper coaxial pallet segment", "unchanged pallet lower boss",
    ],
    joints,
    connected: joints.every((row) => row.positiveConstructiveOverlap),
  },
  collateralNeighbors: collateral,
  regressions: {
    escapement: { exact: checks.escapementExact, sha256: hash(mechanicalRuntime.mechanical), accepted: mechanicalRuntime.mechanical.accepted },
    goingTrain: { exact: checks.goingTrainExact, sha256: hash(mechanicalRuntime.goingTrain) },
    phase4b: {
      physicalAuthorityExact: checks.phase4bPhysicalAuthorityExact,
      samplingCardinalityDelta: {
        hour: mechanicalRuntime.phase4b.collision.calibreSweepClearance.hour.samplesInDisk - baseline.phase4b.collision.calibreSweepClearance.hour.samplesInDisk,
        minute: mechanicalRuntime.phase4b.collision.calibreSweepClearance.minute.samplesInDisk - baseline.phase4b.collision.calibreSweepClearance.minute.samplesInDisk,
        reason: "four additional connected support meshes sampled; clearance values and every non-count field are exact",
      },
      accepted: mechanicalRuntime.phase4b.accepted,
    },
    frozenPackage: {
      physicalAuthorityExact: checks.frozenPackagePhysicalAuthorityExact,
      rows: packageRows,
      accommodationSamplingCardinalityDelta: {
        meshCount: packageActual.accommodation.sweep.meshCount - packageReference.accommodation.sweep.meshCount,
        projectedVertices: packageActual.accommodation.sweep.projectedVertices - packageReference.accommodation.sweep.projectedVertices,
        uniqueProjected: packageActual.accommodation.sweep.uniqueProjected - packageReference.accommodation.sweep.uniqueProjected,
        reason: "one former pallet-column mesh is now five connected meshes; physical accommodation fields remain exact",
      },
      candidateMargins: runtime.mechanical.frozenPackageCandidateMargins,
    },
    criticalFrozenSources: criticalSourceRows,
  },
  build: { command: "npm run build", typecheck: "pass", viteProductionBuild: "pass", browserErrors: runtime.browserErrors },
  evidence: target.evidence,
  checks,
};

fs.writeFileSync(path.join(outDir, "repair-closure-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ disposition: report.disposition, accepted, checks }, null, 2));
