import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] || "captures/pre5d-barrel-fourth-audit";
const before = JSON.parse(fs.readFileSync(path.join(root, "before/report.json"), "utf8"));
const after = JSON.parse(fs.readFileSync(path.join(root, "after/report.json"), "utf8"));
const b = before.barrelFourth;
const a = after.barrelFourth;
const near = (x, y, tolerance = 1e-12) => Math.abs(x - y) <= tolerance;
const authority = Object.fromEntries(
  Object.keys(after.authority).map((name) => [
    name,
    JSON.stringify(after.authority[name]) === JSON.stringify(before.authority[name]),
  ]),
);
const required = [
  "normal-shaded.png",
  "flat-id.png",
  "isolated-participants.png",
  "side-section.png",
  "isolated-runtime-t000.png",
  "isolated-runtime-t060.png",
  "regression-front.png",
  "regression-front-three-quarter.png",
];
const evidence = Object.fromEntries(
  ["before", "after"].flatMap((state) =>
    required.map((file) => {
      const target = path.join(root, state, file);
      return [`${state}/${file}`, fs.existsSync(target) && fs.statSync(target).size > 0];
    }),
  ),
);
const differs = (file) =>
  !fs.readFileSync(path.join(root, "before", file)).equals(
    fs.readFileSync(path.join(root, "after", file)),
  );
const checks = {
  greenOwnerIdentified:
    b.highlightedGreenOwner.fourthWheel ===
    "calibre/fourth:pose/fourth:motion/fourth:geom/fourth:wheel",
  beforeDefectConfirmed:
    b.accepted === false &&
    b.unintendedCollisions.barrelDrumToFourthWheel === true &&
    b.pairs.barrelDrumToFourthWheel.radialOverlap > 0 &&
    b.pairs.barrelDrumToFourthWheel.axialOverlap > 0,
  afterBarrelClear:
    a.unintendedCollisions.barrelDrumToFourthWheel === false &&
    a.pairs.barrelDrumToFourthWheel.axialGap >= 0.037,
  afterNeighborClear:
    a.pairs.thirdPinionToFourthWheel.axialGap >= 0.037 &&
    a.pairs.centerWheelToFourthWheel.axialGap >= 0.114 &&
    a.pairs.centerWheelToEscapePinion.axialGap >= 0.047,
  intendedFourthEscapeMeshPreserved:
    a.intendedFourthEscapeMeshValid === true &&
    near(a.centerDistances.fourthToEscape, a.centerDistances.requiredFourthToEscape) &&
    a.pairs.fourthWheelToEscapePinion.axialOverlap >= 0.099,
  intendedThirdFourthMeshPreserved:
    a.intendedThirdFourthMeshValid === true &&
    a.pairs.thirdWheelToFourthPinion.axialOverlap > 0,
  noUnintendedCollisionAfter: Object.values(a.unintendedCollisions).every((value) => value === false),
  goingTrainRatesUnchanged: JSON.stringify(after.goingTrain) === JSON.stringify(before.goingTrain),
  phase4bStillClosed:
    after.phase4b.accepted === true &&
    after.phase4b.disposition === "PHASE 4B — CLOSED & FROZEN — REAL TWO-HAND DISPLAY DRIVE",
  phase5DNotStarted: a.phase5DStarted === false,
  afterAccepted: a.accepted === true,
};
const visualProof = {
  normalChanged: differs("normal-shaded.png"),
  isolatedChanged: differs("isolated-participants.png"),
  sideSectionChanged: differs("side-section.png"),
  sixtySecondRuntimeFramesDiffer:
    !fs.readFileSync(path.join(root, "after/isolated-runtime-t000.png")).equals(
      fs.readFileSync(path.join(root, "after/isolated-runtime-t060.png")),
    ),
};
const accepted =
  Object.values(checks).every(Boolean) &&
  Object.values(authority).every(Boolean) &&
  Object.values(evidence).every(Boolean) &&
  Object.values(visualProof).every(Boolean);
const comparison = {
  disposition: accepted
    ? "PRE-5D BARREL / FOURTH-WHEEL LOCAL REPAIR — CLOSED"
    : "PRE-5D BARREL / FOURTH-WHEEL LOCAL REPAIR — FAILED",
  classificationBefore: b.classification,
  classificationAfter: a.classification,
  measurements: {
    beforeBarrelIntersection: b.pairs.barrelDrumToFourthWheel,
    afterBarrelClearance: a.pairs.barrelDrumToFourthWheel,
    afterThirdPinionClearance: a.pairs.thirdPinionToFourthWheel,
    afterCenterWheelClearance: a.pairs.centerWheelToFourthWheel,
    afterCenterToEscapePinionClearance: a.pairs.centerWheelToEscapePinion,
    preservedFourthEscapeMesh: a.pairs.fourthWheelToEscapePinion,
    preservedThirdFourthMesh: a.pairs.thirdWheelToFourthPinion,
  },
  checks,
  frozenAuthorityReportsUnchanged: authority,
  evidence,
  visualProof,
  accepted,
};
fs.writeFileSync(path.join(root, "comparison.json"), JSON.stringify(comparison, null, 2));
console.log(JSON.stringify(comparison, null, 2));
if (!accepted) process.exitCode = 1;
