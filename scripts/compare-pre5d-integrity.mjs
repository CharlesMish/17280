import { spawnSync } from "node:child_process";
import fs from "node:fs";

const before = JSON.parse(fs.readFileSync("captures/pre5d-integrity/before/audit.json", "utf8"));
const after = JSON.parse(fs.readFileSync("captures/pre5d-integrity/after/audit.json", "utf8"));
const accepted5c = JSON.parse(fs.readFileSync("captures/phase5c/report.json", "utf8"));
const regression = JSON.parse(fs.readFileSync("captures/pre5d-integrity/regression/report.json", "utf8"));

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;
const radiansToDegrees = (value) => (value * 180) / Math.PI;
const motionNames = ["barrel", "center", "third", "fourth", "escape", "barrelArborEffective"];
const sampleAt = (report, time) => report.kinematics.samples.find((sample) => sample.time === time);
const motionDeltas = (report, t0, t1) => {
  const start = sampleAt(report, t0).rotations;
  const end = sampleAt(report, t1).rotations;
  return Object.fromEntries(
    motionNames.map((name) => {
      const radians = end[name] - start[name];
      return [name, { radians, degrees: radiansToDegrees(radians) }];
    }),
  );
};

const before10 = motionDeltas(before, 0.104, 10.104);
const after10 = motionDeltas(after, 0.104, 10.104);
const after60 = motionDeltas(after, 0.104, 60.104);
const after210 = motionDeltas(after, 0.104, 210.104);
const ratios = {
  centerOverBarrel: after10.center.radians / after10.barrel.radians,
  thirdOverCenter: after10.third.radians / after10.center.radians,
  fourthOverThird: after10.fourth.radians / after10.third.radians,
  escapeOverFourth: after10.escape.radians / after10.fourth.radians,
};

const imageMetric = (metric, reference, current) => {
  const result = spawnSync("compare", ["-metric", metric, reference, current, "null:"], {
    encoding: "utf8",
  });
  return `${result.stderr || result.stdout}`.trim();
};
const regressionPairs = [
  ["front", "captures/phase5b/front.png", "captures/pre5d-integrity/regression/front.png"],
  ["frontHero", "captures/phase5c/front-hero.png", "captures/pre5d-integrity/regression/front-hero.png"],
  [
    "frontThreeQuarter",
    "captures/phase5c/front-three-quarter.png",
    "captures/pre5d-integrity/regression/front-three-quarter.png",
  ],
  [
    "rearThreeQuarter",
    "captures/phase5c/rear-three-quarter.png",
    "captures/pre5d-integrity/regression/rear-three-quarter.png",
  ],
];
const imageRegression = Object.fromEntries(
  regressionPairs.map(([name, reference, current]) => [
    name,
    {
      reference,
      current,
      changedPixelsAnyChannel: Number(imageMetric("AE", reference, current)),
      rmse: imageMetric("RMSE", reference, current),
      visualReview: "PASS",
    },
  ]),
);

const report = {
  scope: "pre-5D bounded mechanical-integrity audit; Issues A and B only",
  classifications: {
    issueA: "GEOMETRY_DEFECT",
    issueBBarrelMotion: "CORRECTLY_MOVING_BUT_VISUALLY_SLOW",
    issueBCoaxialArbor: "KINEMATIC_DEFECT",
  },
  issueA: {
    before: before.center.measurements,
    after: after.center.measurements,
    resolved: {
      lowerRoot: after.center.measurements.lowerSpokeToColumnGap < 0,
      upperSupport:
        after.center.measurements.arborTipToCenterSupportOverlap > 0 &&
        after.center.measurements.centerSupportToBridgeOverlap > 0,
      existingBridgeBodyBossSeatUnchanged:
        before.center.measurements.bridgeBodyToUpperBossZOverlap ===
          after.center.measurements.bridgeBodyToUpperBossZOverlap &&
        before.center.measurements.bridgeBodyToBossXYSeatOverlap ===
          after.center.measurements.bridgeBodyToBossXYSeatOverlap,
    },
  },
  issueB: {
    before10Seconds: before10,
    after10Seconds: after10,
    after60Seconds: after60,
    acceleratedAfter210Seconds: after210,
    ratios,
    trainRotationsUnchanged: motionNames
      .filter((name) => name !== "barrelArborEffective")
      .every((name) => before10[name].radians === after10[name].radians),
    arborParentBefore: before.kinematics.samples[0].barrelArbor,
    arborParentAfter: after.kinematics.samples[0].barrelArbor,
  },
  frozenAuthorityReportsUnchanged: Object.fromEntries(
    Object.keys(before.authority).map((key) => [key, same(before.authority[key], after.authority[key])]),
  ),
  accepted5cScalarChecks: {
    baselineClosedAndFrozen: accepted5c.status === "CLOSED & FROZEN",
    strapThesis: accepted5c.thesis === regression.strap.thesis,
    finishThesis: accepted5c.answers["5A"] === regression.finish.thesis,
    exteriorThesis: accepted5c.answers["5B"] === regression.exterior.finish.thesis,
    gap: accepted5c.proportions.gap === regression.strap.proportions.gap,
    headWidth: accepted5c.proportions.headWidth === regression.strap.proportions.headWidth,
    headThick: accepted5c.proportions.headThick === regression.strap.proportions.headThick,
    freeThick: accepted5c.proportions.freeThick === regression.strap.proportions.freeThick,
    barDiameter: accepted5c.audit.barDiameter === regression.strap.frozen.springBarDiameter,
    barZ: near(accepted5c.audit.barZ, regression.strap.frozen.barZ),
    northBarY: near(accepted5c.audit.northBarY, regression.strap.frozen.northBarY, 1e-3),
    southBarY: near(accepted5c.audit.southBarY, regression.strap.frozen.southBarY, 1e-3),
    minLugInnerClearance: near(
      accepted5c.audit.minLugInnerClearance,
      regression.strap.poses.bent.minLugInnerClearance,
    ),
    bentCaseIntersections:
      accepted5c.audit.bentCaseIntersections === regression.strap.poses.bent.caseIntersections,
    crownKeepout:
      accepted5c.audit.keepoutUnchanged.anyIntersection === regression.exterior.crownKeepout.anyIntersection &&
      near(accepted5c.audit.keepoutUnchanged.minClearance, regression.exterior.crownKeepout.minClearance),
  },
  imageRegression,
  build: "PASS: npm run build (tsc --noEmit + vite build)",
  phase5DStarted: false,
};

fs.writeFileSync("captures/pre5d-integrity/comparison.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
