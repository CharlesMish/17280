import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "captures/phase4b-driven-display";
const baselinePath = process.argv[3] || "captures/pre5d-integrity/after/audit.json";
const phase5cPath = process.argv[4] || "captures/phase5c/report.json";
const authorityBaselinePath = process.argv[5] || "captures/pre5d-integrity/regression/report.json";
const currentPath = path.join(outDir, "report.json");
const outputPath = path.join(outDir, "comparison.json");

for (const input of [currentPath, baselinePath, phase5cPath, authorityBaselinePath]) {
  if (!fs.existsSync(input)) throw new Error(`Phase 4B comparison input missing: ${input}`);
}
if (fs.existsSync(outputPath)) throw new Error(`Refusing to overwrite Phase 4B comparison: ${outputPath}`);

const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const accepted5c = JSON.parse(fs.readFileSync(phase5cPath, "utf8"));
const authorityBaseline = JSON.parse(fs.readFileSync(authorityBaselinePath, "utf8"));

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, tolerance = 1e-6) =>
  typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
const radiansToDegrees = (value) => (value * 180) / Math.PI;
const motionNames = ["barrel", "center", "third", "fourth", "escape"];

const sampleAt = (kinematics, time) => {
  const sample = kinematics?.samples?.find((candidate) => near(candidate.time, time, 1e-9));
  if (!sample) throw new Error(`Kinematic sample ${time} missing`);
  return sample;
};

const motionDeltas = (kinematics, t0, t1) => {
  const start = sampleAt(kinematics, t0).rotations;
  const end = sampleAt(kinematics, t1).rotations;
  return Object.fromEntries(
    motionNames.map((name) => {
      if (typeof start?.[name] !== "number" || typeof end?.[name] !== "number") {
        throw new Error(`Kinematic rotation ${name} missing`);
      }
      const radians = end[name] - start[name];
      return [name, { radians, degrees: radiansToDegrees(radians) }];
    }),
  );
};

const T0 = 0.104;
const windows = [
  ["tenSeconds", T0 + 10],
  ["sixtySeconds", T0 + 60],
];
const goingTrain = Object.fromEntries(
  windows.map(([label, end]) => {
    const reference = motionDeltas(baseline.kinematics, T0, end);
    const measured = motionDeltas(current.kinematics, T0, end);
    const unchanged = Object.fromEntries(
      motionNames.map((name) => [name, near(reference[name].radians, measured[name].radians, 1e-12)]),
    );
    return [label, { t0: T0, t1: end, reference, measured, unchanged }];
  }),
);
const goingTrainRatesUnchanged = Object.values(goingTrain).every((window) =>
  Object.values(window.unchanged).every(Boolean),
);

const authorizedSamplingCardinalityPaths = {
  accommodation: [
    ["sweep", "meshCount"],
    ["sweep", "projectedVertices"],
    ["sweep", "uniqueProjected"],
    ["sweep", "verticesEvaluated"],
    ["corridor", "samples"],
  ],
  enclosure: [["rear", "clearance", "samples"]],
};
const valueAtPath = (object, fields) =>
  fields.reduce((value, field) => value?.[field], object);
const withoutAuthorizedSamplingCardinalities = (name, report) => {
  if (report === null || report === undefined) return report;
  const copy = JSON.parse(JSON.stringify(report));
  for (const fields of authorizedSamplingCardinalityPaths[name] ?? []) {
    const parent = fields
      .slice(0, -1)
      .reduce((value, field) => value?.[field], copy);
    if (parent && typeof parent === "object") delete parent[fields.at(-1)];
  }
  return copy;
};
const authorizedSamplingCardinalityDeltas = Object.fromEntries(
  Object.entries(authorizedSamplingCardinalityPaths).flatMap(([name, paths]) =>
    paths.map((fields) => {
      const reference = valueAtPath(authorityBaseline?.[name], fields);
      const measured = valueAtPath(current.authority?.[name], fields);
      return [
        [name, ...fields].join("."),
        {
          report: name,
          path: fields.join("."),
          units: "count",
          reference: reference ?? null,
          measured: measured ?? null,
          delta:
            typeof reference === "number" && typeof measured === "number"
              ? measured - reference
              : null,
          wellFormed:
            Number.isInteger(reference) &&
            reference >= 0 &&
            Number.isInteger(measured) &&
            measured >= 0,
          excludedFromPhysicalAuthorityEquality: true,
          reason:
            "authorized center-bore tessellation changes sampling cardinality; physical clearance and authority fields remain exact-gated",
        },
      ];
    }),
  ),
);
const authorizedSamplingCardinalitiesWellFormed = Object.values(
  authorizedSamplingCardinalityDeltas,
).every((row) => row.wellFormed);
const unaffectedNames = ["accommodation", "enclosure", "exterior", "finish", "strap"];
const unaffectedAuthorityReportsUnchanged = Object.fromEntries(
  unaffectedNames.map((name) => [
    name,
    same(
      withoutAuthorizedSamplingCardinalities(name, current.authority?.[name]),
      withoutAuthorizedSamplingCardinalities(name, authorityBaseline?.[name]),
    ),
  ]),
);

const strap = current.authority?.strap;
const finish = current.authority?.finish;
const exterior = current.authority?.exterior;
const accepted5cScalarChecks = {
  baselineClosedAndFrozen: accepted5c.status === "CLOSED & FROZEN",
  strapThesis: accepted5c.thesis === strap?.thesis,
  finishThesis: accepted5c.answers?.["5A"] === finish?.thesis,
  exteriorThesis: accepted5c.answers?.["5B"] === exterior?.finish?.thesis,
  gap: accepted5c.proportions?.gap === strap?.proportions?.gap,
  headWidth: accepted5c.proportions?.headWidth === strap?.proportions?.headWidth,
  headThick: accepted5c.proportions?.headThick === strap?.proportions?.headThick,
  freeThick: accepted5c.proportions?.freeThick === strap?.proportions?.freeThick,
  barDiameter: accepted5c.audit?.barDiameter === strap?.frozen?.springBarDiameter,
  barZ: near(accepted5c.audit?.barZ, strap?.frozen?.barZ),
  northBarY: near(accepted5c.audit?.northBarY, strap?.frozen?.northBarY, 1e-3),
  southBarY: near(accepted5c.audit?.southBarY, strap?.frozen?.southBarY, 1e-3),
  minLugInnerClearance: near(accepted5c.audit?.minLugInnerClearance, strap?.poses?.bent?.minLugInnerClearance),
  bentCaseIntersections: accepted5c.audit?.bentCaseIntersections === strap?.poses?.bent?.caseIntersections,
  crownKeepout:
    accepted5c.audit?.keepoutUnchanged?.anyIntersection === exterior?.crownKeepout?.anyIntersection &&
    near(accepted5c.audit?.keepoutUnchanged?.minClearance, exterior?.crownKeepout?.minClearance),
};

const captureProof = {
  driveReportPresent: current.drive !== null && current.drive !== undefined,
  overrideRestored: current.overrideRestoration?.restored === true,
  readoutOffAbsent: current.readoutOff?.absent === true,
  noPageErrors: Array.isArray(current.pageErrors) && current.pageErrors.length === 0,
  phase5DNotStarted: current.phase5DStarted === false,
};

const drive = current.drive;
const sixty = drive?.sixtySecondProof;
const meshRows = Array.isArray(drive?.meshes) ? drive.meshes : [];
const gearRows = Array.isArray(drive?.gears) ? drive.gears : [];
const claimRows = Array.isArray(drive?.ownership?.claims) ? drive.ownership.claims : [];
// Half a micron admits only the 0.000422537 mm exterior-AABB sampling shift
// introduced when the authorized circular bore changed bridge tessellation.
// It is 1/164 of the 0.082 mm running bore and does not relax any clearance.
const BORE_PARTICIPANT_AABB_TOLERANCE_MM = 0.0005;
const aabbFields = ["minX", "maxX", "minY", "maxY", "minZ", "maxZ"];
const boreParticipantSources = {
  bridgeBody: {
    reference: baseline.center?.participants?.bridgeBody,
    measured: drive?.centerPassage?.bridgeExteriorBounds,
  },
  upperBoss: {
    reference: baseline.center?.participants?.upperBoss,
    measured: drive?.centerPassage?.bossExteriorBounds,
  },
  centerSupport: {
    reference: baseline.center?.participants?.centerSupport,
    measured: drive?.centerPassage?.supportExteriorBounds,
  },
  upperJewel: {
    reference: baseline.center?.participants?.upperJewel,
    measured: drive?.centerPassage?.upperJewelBounds,
  },
};
const authorizedBoreParticipantBounds = Object.fromEntries(
  Object.entries(boreParticipantSources).map(([name, { reference, measured }]) => {
    const axes = Object.fromEntries(
      aabbFields.map((field) => {
        const referenceValue = reference?.[field];
        const measuredValue = measured?.[field];
        return [
          field,
          {
            reference: referenceValue ?? null,
            measured: measuredValue ?? null,
            delta:
              typeof referenceValue === "number" && typeof measuredValue === "number"
                ? measuredValue - referenceValue
                : null,
            tolerance: BORE_PARTICIPANT_AABB_TOLERANCE_MM,
            toleranceMicrometres: BORE_PARTICIPANT_AABB_TOLERANCE_MM * 1000,
            unchanged: near(
              measuredValue,
              referenceValue,
              BORE_PARTICIPANT_AABB_TOLERANCE_MM,
            ),
          },
        ];
      }),
    );
    return [
      name,
      {
        units: "mm",
        referencePath: reference?.path ?? null,
        measuredPath: measured?.path ?? null,
        axes,
        unchanged: Object.values(axes).every((axis) => axis.unchanged),
      },
    ];
  }),
);
const authorizedBoreExteriorBoundsUnchanged = Object.values(
  authorizedBoreParticipantBounds,
).every((participant) => participant.unchanged);
const requiredRoles = [
  ["hourHandMount", "hour"],
  ["hourCollar", "hour"],
  ["minuteHandMount", "minute"],
  ["minuteCollar", "minute"],
  ["centerStem", "minute"],
  ["cap", "minute"],
];
const evidenceFiles = Array.isArray(current.capture?.evidence) ? current.capture.evidence : [];
const evidencePresent = Object.fromEntries(
  evidenceFiles.map((file) => {
    const target = path.join(outDir, file);
    return [file, fs.existsSync(target) && fs.statSync(target).size > 0];
  }),
);
const motionFramePairs = {
  runtimeSixtySeconds: {
    from: "runtime-t000.png",
    to: "runtime-t060.png",
  },
  acceleratedSixHundredSeconds: {
    from: "accelerated-t000.png",
    to: "accelerated-t600.png",
  },
};
const motionFrameDifferences = Object.fromEntries(
  Object.entries(motionFramePairs).map(([name, pair]) => {
    const fromPath = path.join(outDir, pair.from);
    const toPath = path.join(outDir, pair.to);
    const fromPresent = fs.existsSync(fromPath) && fs.statSync(fromPath).size > 0;
    const toPresent = fs.existsSync(toPath) && fs.statSync(toPath).size > 0;
    const fromBuffer = fromPresent ? fs.readFileSync(fromPath) : null;
    const toBuffer = toPresent ? fs.readFileSync(toPath) : null;
    const byteIdentical =
      fromBuffer !== null && toBuffer !== null ? fromBuffer.equals(toBuffer) : null;
    return [
      name,
      {
        from: pair.from,
        to: pair.to,
        fromPresent,
        toPresent,
        fromBytes: fromBuffer?.length ?? null,
        toBytes: toBuffer?.length ?? null,
        byteIdentical,
        changed: fromPresent && toPresent && byteIdentical === false,
      },
    ];
  }),
);
const mechanicalClosure = {
  accepted: drive?.accepted === true,
  closedDisposition:
    drive?.disposition === "PHASE 4B — CLOSED & FROZEN — REAL TWO-HAND DISPLAY DRIVE",
  centerAxisFrozen: drive?.axis?.drift === 0 && drive?.centerPassage?.axisDrift === 0,
  authorizedBoreExteriorBoundsUnchanged,
  stationaryPassageClear:
    drive?.centerPassage?.noStationaryIntersection === true &&
    drive?.centerPassage?.continuousCenterOwnedPath === true,
  minuteSixtySeconds:
    near(sixty?.centerDeltaDeg, 18, 1e-9) &&
    near(sixty?.minuteDriveDeltaDeg, 18, 1e-9) &&
    near(sixty?.minuteHandDeltaDeg, 18, 1e-9) &&
    near(sixty?.minuteToCenter, 1, 1e-12),
  hourSixtySeconds:
    near(sixty?.hourWheelDeltaDeg, 1.5, 1e-9) &&
    near(sixty?.hourPipeDeltaDeg, 1.5, 1e-9) &&
    near(sixty?.hourHandDeltaDeg, 1.5, 1e-9) &&
    near(sixty?.hourToMinute, 1 / 12, 1e-12) &&
    sixty?.displayedDirectionsAgree === true,
  intermediateSixtySeconds:
    near(sixty?.minuteWheelDeltaDeg, -9, 1e-9) &&
    near(sixty?.minutePinionDeltaDeg, -9, 1e-9),
  traversedRatio:
    near(drive?.derivation?.minuteFromSource, 1, 1e-12) &&
    near(drive?.derivation?.netFromTraversedMeshes, 1 / 12, 1e-12),
  twoActualMeshes:
    meshRows.length === 2 &&
    meshRows.every(
      (row) =>
        Number.isInteger(row.driverTeeth) &&
        Number.isInteger(row.drivenTeeth) &&
        row.driverTeeth > 0 &&
        row.drivenTeeth > 0 &&
        row.driverPitchR > 0 &&
        row.drivenPitchR > 0 &&
        near(row.measuredCenterDistance, row.expectedCenterDistance, 1e-12) &&
        near(row.centerDistanceError, 0, 1e-12) &&
        row.signedRatio < 0,
    ),
  fourModeledGears:
    gearRows.length === 4 &&
    gearRows.every(
      (row) =>
        Number.isInteger(row.teeth) &&
        row.teeth > 0 &&
        row.pitchR > 0 &&
        row.rootR > 0 &&
        row.outerR > row.pitchR &&
        row.z1 > row.z0 &&
        row.measured?.boreR > 0 &&
        row.measured?.outerR > 0 &&
        row.measured?.face > 0,
    ),
  distinctMechanicalOwnership:
    requiredRoles.every(([role, owner]) =>
      claimRows.some((row) => row.role === role && row.owner === owner),
    ) && drive?.ownership?.minute !== drive?.ownership?.hour,
  packageContained:
    drive?.containment &&
    Object.values(drive.containment)
      .filter((value) => typeof value === "boolean")
      .every(Boolean),
  collisionFree:
    drive?.collision?.collisionFree === true &&
    drive?.collision?.representativePoses?.every((pose) => pose.noCollision === true) === true,
  physicalHubOwnership:
    drive?.physicalOwnership?.ownershipComplete === true &&
    drive?.physicalOwnership?.physicalHubConnections === true &&
    drive?.physicalOwnership?.mountBoresClear === true &&
    drive?.physicalOwnership?.placeholderMinuteStemRemoved === true,
  renderedBoresClear:
    drive?.centerPassage?.stationaryBores?.every(
      (row) =>
        row.clear === true &&
        typeof row.measuredMinimumBoreRadius === "number" &&
        row.measuredMinimumBoreRadius > row.rotatingRadius,
    ) === true,
  sapphireClearance:
    typeof drive?.displayPackage?.sapphireRemaining === "number" &&
    drive.displayPackage.sapphireRemaining >= 0.86 - 1e-9,
  overrideInactive: drive?.presentationOverride?.active === false,
  phase5DNotStarted: drive?.phase5DStarted === false,
};

const evidenceProof = {
  expectedCount: evidenceFiles.length >= 15,
  allPresentAndNonempty:
    evidenceFiles.length > 0 && Object.values(evidencePresent).every(Boolean),
  runtimeSixtySecondFramesDiffer:
    motionFrameDifferences.runtimeSixtySeconds.changed === true,
  acceleratedFramesDiffer:
    motionFrameDifferences.acceleratedSixHundredSeconds.changed === true,
  ownershipRows:
    fs.existsSync(path.join(outDir, "ownership.json")) &&
    JSON.parse(fs.readFileSync(path.join(outDir, "ownership.json"), "utf8"))?.rows?.length >= 5,
};

const checks = {
  goingTrainRatesUnchanged,
  unaffectedAuthorityReportsUnchanged: Object.values(unaffectedAuthorityReportsUnchanged).every(Boolean),
  authorizedSamplingCardinalitiesWellFormed,
  accepted5cScalarsUnchanged: Object.values(accepted5cScalarChecks).every(Boolean),
  captureProof: Object.values(captureProof).every(Boolean),
  mechanicalClosure: Object.values(mechanicalClosure).every(Boolean),
  evidenceProof: Object.values(evidenceProof).every(Boolean),
};
const passed = Object.values(checks).every(Boolean);

const report = {
  phase: "4B",
  scope: "driven-display closure comparison against accepted pre-5D / Phase-5C authority",
  status: passed ? "PASS" : "FAIL",
  inputs: {
    current: currentPath,
    goingTrainBaseline: baselinePath,
    unaffectedAuthorityBaseline: authorityBaselinePath,
    phase5c: phase5cPath,
  },
  goingTrain,
  goingTrainRatesUnchanged,
  unaffectedAuthorityReportsUnchanged,
  authorizedSamplingCardinalityDeltas,
  authorizedSamplingCardinalitiesWellFormed,
  accepted5cScalarChecks,
  captureProof,
  mechanicalClosure,
  authorizedBoreParticipantBounds,
  evidencePresent,
  motionFrameDifferences,
  evidenceProof,
  checks,
  phase5DStarted: false,
};

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 1;
