import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const outDir = process.argv[2] || "captures/pre5d-barrel-center-audit";
const report = JSON.parse(fs.readFileSync(path.join(outDir, "report.json"), "utf8"));
const phase4bBaseline = JSON.parse(
  fs.readFileSync("captures/phase4b-driven-display/report.json", "utf8"),
);
const current = report.current;
const barrel = current.barrelCenter;
const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;
const interval = (seconds) => barrel.kinematics.intervals.find((row) => near(row.seconds, seconds, 1e-6));
const rows = {
  currentReportAccepted: barrel.accepted === true,
  currentRepairNotRequired: barrel.classification.currentRepairRequired === false,
  phase5DNotStarted:
    barrel.classification.phase5DStarted === false && current.phase4b.phase5DStarted === false,
  visibleGoldMembersDriven: barrel.kinematics.allGoldMembersTrackBarrelOwner === true,
  barrelArborStationary: barrel.kinematics.stationaryArborDeltaZero === true,
  tenSecondBarrelDelta: near(interval(10).degrees.barrelWheel, -0.45, 1e-9),
  sixtySecondBarrelDelta: near(interval(60).degrees.barrelWheel, -2.7, 1e-9),
  acceleratedBarrelDelta: near(interval(600).degrees.barrelWheel, -27, 1e-9),
  exactTrainRatio: near(interval(60).barrelToCenterRatio, -12 / 80, 1e-12),
  centerDistanceExact: near(barrel.mesh.centerDistance.error, 0, 1e-12),
  axialOverlapPositive: barrel.mesh.axialAlignment.overlap > 0 && barrel.mesh.axialAlignment.valid,
  radialEngagementValid: barrel.mesh.radialEngagement.valid === true,
  toothPhaseLocked: barrel.mesh.toothPhase.valid === true,
  steelCenterWheelNotMeshMember:
    barrel.stackedProjection.centerWheelIsActualBarrelMeshMember === false &&
    barrel.stackedProjection.barrelWheelToCenterWheelAxialOverlap < 0,
  issuePreexistedRecentFinishing:
    report.history.classifications.issueBBarrelMotion === "CORRECTLY_MOVING_BUT_VISUALLY_SLOW" &&
    near(report.history.issueB.after10Seconds.barrel.degrees, interval(10).degrees.barrelWheel, 1e-12),
  priorArborRepairStillPresent:
    report.history.issueB.arborParentAfter.path === barrel.owners.stationaryBarrelArbor.path &&
    barrel.owners.stationaryBarrelArbor.inheritsBarrelRuntime === false,
  goingTrainUnchangedFromPhase4b:
    JSON.stringify(current.goingTrain) === JSON.stringify(phase4bBaseline.kinematics),
  phase4bStillClosed:
    current.phase4b.accepted === true &&
    current.phase4b.disposition === "PHASE 4B — CLOSED & FROZEN — REAL TWO-HAND DISPLAY DRIVE",
};

const authorityNames = [
  "structure",
  "assembly",
  "accommodation",
  "display",
  "enclosure",
  "exterior",
  "readout",
  "finish",
  "strap",
];
const authority = Object.fromEntries(
  authorityNames.map((name) => {
    const reference = phase4bBaseline.authority?.[name] ?? phase4bBaseline[name];
    return [name, JSON.stringify(current.authority[name]) === JSON.stringify(reference)];
  }),
);

const evidenceFiles = [
  "normal-shaded-before.png",
  "normal-shaded-after.png",
  "flat-id-ownership.png",
  "isolated-participants.png",
  "mesh-line-side-section.png",
  "runtime-t000.png",
  "runtime-t010.png",
  "runtime-t060.png",
  "accelerated-t600.png",
  "isolated-runtime-t000.png",
  "isolated-runtime-t600.png",
  "regression-front.png",
  "regression-front-three-quarter.png",
];
const evidence = Object.fromEntries(
  evidenceFiles.map((name) => {
    const file = path.join(outDir, name);
    return [name, fs.existsSync(file) && fs.statSync(file).size > 0];
  }),
);
const bytes = (name) => fs.readFileSync(path.join(outDir, name));
const rmse = (a, b) => {
  const result = spawnSync(
    "compare",
    ["-metric", "RMSE", path.join(outDir, a), path.join(outDir, b), "null:"],
    { encoding: "utf8" },
  );
  const match = `${result.stderr || ""}${result.stdout || ""}`.match(/\(([^)]+)\)/);
  return match ? Number(match[1]) : null;
};
const restoreRmse = rmse("normal-shaded-before.png", "normal-shaded-after.png");
const imageProof = {
  auditRestoreNormalizedRmse: restoreRmse,
  auditRestoresSameNormalFrame: restoreRmse !== null && restoreRmse <= 0.006,
  tenSecondFrameChanges: !bytes("runtime-t000.png").equals(bytes("runtime-t010.png")),
  sixtySecondFrameChanges: !bytes("runtime-t000.png").equals(bytes("runtime-t060.png")),
  acceleratedFrameChanges: !bytes("isolated-runtime-t000.png").equals(bytes("isolated-runtime-t600.png")),
};

const accepted =
  Object.values(rows).every(Boolean) &&
  Object.values(authority).every(Boolean) &&
  Object.values(evidence).every(Boolean) &&
  Object.values(imageProof).every(Boolean);
const comparison = {
  disposition: accepted
    ? "PRE-5D BARREL / CENTER-TRAIN AUDIT — CLOSED — NO CURRENT REPAIR REQUIRED"
    : "PRE-5D BARREL / CENTER-TRAIN AUDIT — FAILED",
  classification: barrel.classification,
  checks: rows,
  frozenAuthorityReportsUnchangedFromPhase4b: authority,
  evidence,
  imageProof,
  accepted,
};
fs.writeFileSync(path.join(outDir, "comparison.json"), JSON.stringify(comparison, null, 2));
console.log(JSON.stringify(comparison, null, 2));
if (!accepted) process.exitCode = 1;
