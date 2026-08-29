import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2] ?? "captures/pre5d-surface-artifact-audit";
const before = JSON.parse(await readFile(path.join(root, "before/report.json"), "utf8"));
const after = JSON.parse(await readFile(path.join(root, "after/report.json"), "utf8"));
const authority = JSON.parse(await readFile(path.join(root, "after/authority.json"), "utf8"));
const phase4b = JSON.parse(await readFile("captures/phase4b-driven-display/report.json", "utf8"));

const authorityNames = [
  "structure",
  "assembly",
  "finish",
  "accommodation",
  "display",
  "enclosure",
  "exterior",
  "readout",
  "strap",
];
const authorityEquality = Object.fromEntries(
  authorityNames.map((name) => [name, JSON.stringify(authority[name]) === JSON.stringify(phase4b.authority[name])]),
);

const keyedRows = (report) => new Map(report.rows.map((row) => [row.path, row]));
const beforeRows = keyedRows(before);
const afterRows = keyedRows(after);
const boundsUnchanged = [];
for (const [meshPath, beforeRow] of beforeRows) {
  const afterRow = afterRows.get(meshPath);
  if (!afterRow) continue;
  boundsUnchanged.push({
    path: meshPath,
    unchanged: JSON.stringify(beforeRow.bounds) === JSON.stringify(afterRow.bounds),
  });
}

const lugRows = (report) => report.rows.filter((row) => /^ext:lug-(north|south)-(east|west)$/.test(row.name));
const beforeLugs = lugRows(before);
const afterLugs = lugRows(after);
const centerSupport = (report) => report.rows.find((row) => row.name === "struct:trainBridge:centerSupport");
const boss = after.rows.find((row) => row.name === "struct:boss:center:upper");
const bossFace = boss?.materials?.[0];
const maxAnisotropy = (row) => Math.max(0, ...row.materials.map((material) => material.anisotropy ?? 0));
const benignDegenerateOwners = new Set([
  "phase4b:minuteDrive:continuousTubeStem",
  "ext:mid",
  "ext:waist",
  "ext:caseback",
  "ext:waist-bevel",
  "ext:caseback-step",
]);

const evidenceFiles = [
  "before/bridge-finished.png",
  "after/bridge-finished.png",
  "before/bridge-macro.png",
  "after/bridge-macro.png",
  "before/bridge-flat-id.png",
  "after/bridge-flat-id.png",
  "before/bridge-baseline.png",
  "before/bridge-body-only.png",
  "before/bridge-boss-only.png",
  "before/bridge-wireframe.png",
  "before/bridge-normals.png",
  "before/bridge-grazing.png",
  "after/bridge-grazing.png",
  "before/lug-finished.png",
  "after/lug-finished.png",
  "before/lug-root-macro.png",
  "after/lug-root-macro.png",
  "before/lug-flat-id.png",
  "before/lug-no-roughness.png",
  "before/lug-no-anisotropy.png",
  "before/lug-wireframe.png",
  "before/lug-normals.png",
  "after/normal-front.png",
  "after/normal-front-three-quarter.png",
];
const evidence = [];
for (const relative of evidenceFiles) {
  const info = await stat(path.join(root, relative));
  evidence.push({ file: relative, bytes: info.size, present: info.size > 0 });
}

const drive = authority.drive;
const checks = {
  finishIsMaterialReplacementNotOverlayGeometry:
    after.finishImplementation === "material replacement on existing meshes; no duplicate finish geometry",
  shadowsDisabled: before.renderer.shadowMapEnabled === false && after.renderer.shadowMapEnabled === false,
  fourteenCoplanarOwnershipPairsMeasured:
    before.coplanarPairs.length === 14 && after.coplanarPairs.length === 14,
  geometryBoundsUnchanged: boundsUnchanged.length > 0 && boundsUnchanged.every((row) => row.unchanged),
  noDegenerateGeometryTrianglesOnAffectedOwners:
    before.rows.every((row) => row.degenerateTriangles === 0) &&
    [...afterLugs, centerSupport(after), boss]
      .filter(Boolean)
      .every((row) => row.degenerateTriangles === 0),
  fullScanHasNoInvalidAnisotropicTangents:
    after.rows.every((row) => maxAnisotropy(row) === 0 || row.invalidTangents === 0),
  remainingZeroAreaSeamsAreKnownNonRasterizingOwners:
    after.rows
      .filter((row) => row.degenerateTriangles > 0)
      .every((row) => benignDegenerateOwners.has(row.name)),
  bossDepthOwnershipCorrected:
    bossFace?.polygonOffset === true &&
    bossFace?.polygonOffsetFactor === -1 &&
    bossFace?.polygonOffsetUnits === -1 &&
    bossFace?.transparent === false &&
    bossFace?.depthTest === true &&
    bossFace?.depthWrite === true,
  lugUvDegeneracyRepaired:
    beforeLugs.length === 4 &&
    beforeLugs.every((row) => row.degenerateUvTriangles > 0) &&
    afterLugs.length === 4 &&
    afterLugs.every((row) => row.degenerateUvTriangles === 0),
  centerPendantTangentBasisRepaired:
    centerSupport(before)?.tangentMismatchVertices > 0 &&
    centerSupport(after)?.tangentMismatchVertices === 0 &&
    centerSupport(after)?.degenerateUvTriangles === 0,
  allFrozenAuthorityReportsExact: Object.values(authorityEquality).every(Boolean),
  phase4bStillClosed:
    drive.disposition === "PHASE 4B — CLOSED & FROZEN — REAL TWO-HAND DISPLAY DRIVE" &&
    drive.accepted === true &&
    drive.axis.drift === 0 &&
    Math.abs(drive.sixtySecondProof.minuteToCenter - 1) < 1e-12 &&
    Math.abs(drive.sixtySecondProof.hourToMinute - 1 / 12) < 1e-12 &&
    drive.sixtySecondProof.displayedDirectionsAgree === true &&
    drive.clearances.sapphireRemaining >= 0.86 &&
    drive.phase5DStarted === false,
  evidenceComplete: evidence.every((row) => row.present),
};

const report = {
  phase: "PRE-5D SURFACE-ARTIFACT AUDIT",
  disposition: Object.values(checks).every(Boolean)
    ? "CLOSED — BOUNDED RENDER-SURFACE CORRECTION"
    : "FAILED — AUDIT CHECK",
  classification: {
    bridgeBosses:
      "z-fighting from separately owned boss/foot caps exactly coplanar with bridge/cock faces",
    centerPendant:
      "invalid anisotropic tangent basis caused by planar finish UV remap on a turned annular support",
    lugNoise:
      "anisotropic BRDF instability from a collapsed Y/X UV projection on horn side/cap triangles; not roughness-map noise",
  },
  owners: {
    bridgeBodies: [
      "struct:trainBridge:body",
      "struct:trainBridge:stub:a",
      "struct:trainBridge:stub:b",
      "struct:escapeFinger:stemBar (unified former stem + bar owners)",
      "balanceCock/(unnamed body and heel bar)",
    ],
    circularLands: [
      "struct:boss:*:upper",
      "struct:foot:anchor:train:*",
      "struct:escapeFinger:stemBar (includes anchor:escape foot land)",
      "struct:foot:anchor:cock:*",
    ],
    centerPendant: ["struct:trainBridge:centerSupport"],
    lugMeshes: afterLugs.map((row) => ({ name: row.name, finishSlots: row.finishSlots })),
  },
  correction: [
    "bossFace material polygonOffset=-1/-1 gives the legitimate circular land deterministic depth ownership",
    "center support retains its turned/circular finish instead of a planar anisotropic cotes projection",
    "lug UVs use dominant-face projection and tangents are rebuilt after remapping",
  ],
  measurements: {
    coplanarPairs: after.coplanarPairs,
    lugUvDegenerateTrianglesBefore: Object.fromEntries(beforeLugs.map((row) => [row.name, row.degenerateUvTriangles])),
    lugUvDegenerateTrianglesAfter: Object.fromEntries(afterLugs.map((row) => [row.name, row.degenerateUvTriangles])),
    centerPendantTangentMismatchBefore: centerSupport(before)?.tangentMismatchVertices,
    centerPendantTangentMismatchAfter: centerSupport(after)?.tangentMismatchVertices,
    fullScan: {
      meshes: after.rows.length,
      invalidTangentsOnAnisotropicMaterials: after.rows
        .filter((row) => maxAnisotropy(row) > 0 && row.invalidTangents > 0)
        .map((row) => ({ name: row.name, invalidTangents: row.invalidTangents })),
      nonRasterizingZeroAreaSeams: after.rows
        .filter((row) => row.degenerateTriangles > 0)
        .map((row) => ({ name: row.name, degenerateTriangles: row.degenerateTriangles })),
    },
    surfaceBounds: boundsUnchanged,
  },
  frozenAuthority: {
    exactReportEquality: authorityEquality,
    phase4b: {
      disposition: drive.disposition,
      accepted: drive.accepted,
      axisDrift: drive.axis.drift,
      minuteToCenter: drive.sixtySecondProof.minuteToCenter,
      hourToMinute: drive.sixtySecondProof.hourToMinute,
      displayedDirectionsAgree: drive.sixtySecondProof.displayedDirectionsAgree,
      sapphireRemaining: drive.clearances.sapphireRemaining,
      phase5DStarted: drive.phase5DStarted,
    },
  },
  evidence,
  checks,
};

await writeFile(path.join(root, "report.json"), JSON.stringify(report, null, 2));
console.log(report.disposition);
if (!Object.values(checks).every(Boolean)) {
  console.error(checks);
  process.exitCode = 1;
}
