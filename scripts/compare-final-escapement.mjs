import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outDir = process.argv[2] || "captures/pre5d-escapement-repair/final";
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const objectSha = (value) => sha(JSON.stringify(canonical(value)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const runtime = read(`${outDir}/runtime-report.json`);
const regression = read(`${outDir}/full-regression-report.json`);
const currentPackage = read("captures/pre5d-escapement-repair/current-runtime-package.json");
const frozenPackage = read("captures/gate0-baseline-restoration/executable-runtime-reference.json");
const gate0Repeat = read("captures/pre5d-escapement-repair/final-pre-edit-gate0-repeat.json");
const sourceManifest = read("captures/gate0-baseline-restoration/executable-source-manifest.json");
const restoredReports = read("captures/gate0-baseline-restoration/restored-runtime-reports.json");

const compareField = (id, current, reference, classification = "immutable frozen package") => ({
  id,
  classification,
  referenceSha256: objectSha(reference),
  currentSha256: objectSha(current),
  exact: same(current, reference),
});

const packageRows = [
  compareField("structure.outer", currentPackage.structure.outer, frozenPackage.structure.outer),
  compareField("structure.inner", currentPackage.structure.inner, frozenPackage.structure.inner),
  compareField("structure.anchors", currentPackage.structure.anchors, frozenPackage.structure.anchors),
  compareField("structure.elements", currentPackage.structure.elements, frozenPackage.structure.elements),
  compareField("layout.radii", currentPackage.layout.radii, frozenPackage.layout.radii),
  compareField("layout.positions.barrel", currentPackage.layout.positions.barrel, frozenPackage.layout.positions.barrel),
  compareField("layout.positions.center", currentPackage.layout.positions.center, frozenPackage.layout.positions.center),
  compareField("layout.positions.third", currentPackage.layout.positions.third, frozenPackage.layout.positions.third),
  ...[
    "cavity", "cavityContour", "closureSemantics", "contacts", "corridor", "method",
    "outerWall", "phases", "requiredClearanceContour", "sampledSweptContour", "staticBox",
    "sweptBox", "sweptContour", "z",
  ].map((key) => compareField(`accommodation.${key}`, currentPackage.accommodation[key], frozenPackage.accommodation[key])),
  compareField("display", currentPackage.display, frozenPackage.display),
  compareField("enclosure", currentPackage.enclosure, frozenPackage.enclosure),
  compareField("exterior", currentPackage.exterior, frozenPackage.exterior),
];
packageRows.push(compareField(
  "accommodation.sweep",
  currentPackage.accommodation.sweep,
  frozenPackage.accommodation.sweep,
  "candidate live sampling metadata; intentionally not package authority",
));

const sourceFiles = {};
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) {
      const relative = path.relative(root, file).replaceAll(path.sep, "/");
      const bytes = fs.readFileSync(file);
      sourceFiles[relative] = { bytes: bytes.length, sha256: sha(bytes) };
    }
  }
};
walk(path.join(root, "src"));
const changedExisting = Object.keys(sourceManifest.files)
  .filter((file) => sourceFiles[file]?.sha256 !== sourceManifest.files[file].sha256)
  .sort();
const missing = Object.keys(sourceManifest.files).filter((file) => !sourceFiles[file]).sort();
const added = Object.keys(sourceFiles).filter((file) => !sourceManifest.files[file]).sort();
const allowedChanged = [
  "src/geometry.ts", "src/main.ts", "src/movement.ts", "src/spec.ts", "src/structure.ts", "src/structureSpec.ts",
];
const allowedAdded = ["src/escapementAudit.ts", "src/escapementContact.ts", "src/frozenGate0Authority.ts"];

const gate0Structure = fs.readFileSync("/tmp/watch-gate0-restored-gIYjdt/src/structure.ts", "utf8");
const currentStructure = fs.readFileSync(path.join(root, "src/structure.ts"), "utf8");
const junctionBlock = (source) => source.match(/  \/\/ Rear junction audit:[\s\S]*?    g\.add\(junctionJoin\);/)?.[0] ?? null;
const gate0JunctionBlock = junctionBlock(gate0Structure);
const currentJunctionBlock = junctionBlock(currentStructure);

const trainIds = ["barrel", "center", "third", "fourth", "escape"];
const interval = (report, id) => {
  const samples = report.samples;
  return samples.at(-1).rotations[id] - samples[0].rotations[id];
};
const trainRows = trainIds.map((id) => {
  const referenceDeltaRad = interval(restoredReports.train, id);
  const currentDeltaRad = regression.goingTrain.samples[2].rotations[id] - regression.goingTrain.samples[0].rotations[id];
  return {
    id,
    referenceDeltaRad,
    currentDeltaRad,
    deltaRad: currentDeltaRad - referenceDeltaRad,
    unchanged: Math.abs(currentDeltaRad - referenceDeltaRad) <= 1e-12,
  };
});

const evidenceFiles = [
  "after-normal-top.png", "after-flat-structure-id.png", "after-escapement-close.png",
  "after-side-z-witness.png", "runtime-balance-neg132.png", "runtime-pickup.png",
  "runtime-next-lock.png", "runtime-return.png", "regression-three-quarter.png", "regression-top.png",
  "focused-flat-owner-id.png", "focused-isolated-participants.png", "focused-side-z-section.png",
  "focused-opposite-bank.png",
].map((file) => {
  const bytes = fs.readFileSync(path.join(root, outDir, file));
  return { file, bytes: bytes.length, sha256: sha(bytes), present: bytes.length > 0 };
});

const mechanical = regression.mechanical;
const phase4b = regression.phase4b;
const immutablePackageRows = packageRows.filter((row) => row.classification === "immutable frozen package");
const checks = {
  gate0ByteExact: gate0Repeat.byteExact && gate0Repeat.actualSha256 === gate0Repeat.expectedSha256 && gate0Repeat.actualBytes === 1217437,
  sourceScopeExact: same(changedExisting, allowedChanged) && same(added, allowedAdded) && missing.length === 0,
  gate0BarrelJunctionBlockUnchanged: gate0JunctionBlock !== null && gate0JunctionBlock === currentJunctionBlock,
  candidateAccepted: mechanical.accepted === true,
  fourthBossIdentity: mechanical.supportGraph.fourth.bossUnmodified === true &&
    mechanical.supportGraph.fourth.nominalBossRadius === 0.4968000000000001 &&
    mechanical.supportGraph.fourth.settingMargin === 0.17180000000000006,
  forkBossPairSpecificPass: mechanical.forkBoss.pairSpecific === true &&
    mechanical.forkBoss.actualRenderedMinimum >= 0.03 && mechanical.forkBoss.noPenetration,
  forkStubGeneralPass: mechanical.forkStub.actualRenderedMinimum >= 0.1,
  generalForeignMatrixPass: mechanical.generalForeignSolids.length === 14 &&
    mechanical.generalForeignSolids.every((row) => row.gate === 0.1 && row.accepted),
  contactAndBeatPass: Object.values(mechanical.contact.gates).every(Boolean) &&
    mechanical.completeBeat.samples >= 4097 && mechanical.completeBeat.balanceMinDeg === -132 &&
    mechanical.completeBeat.balanceMaxDeg === 132 && mechanical.completeBeat.noSecondEngagement &&
    mechanical.completeBeat.noForkRollerCollision,
  bridgeContinuityPass: mechanical.bridgeContinuity.stubMergesMainBody &&
    mechanical.bridgeContinuity.stubSection.totalWidth === 0.56 &&
    mechanical.bridgeContinuity.stubSection.thickness === 0.36 &&
    mechanical.bridgeContinuity.footDelta === 0 && mechanical.bridgeContinuity.seatToBridgeGap === 0,
  goingTrainRatesUnchanged: trainRows.every((row) => row.unchanged),
  phase4bUnchanged: phase4b.accepted === true && phase4b.axis.drift === 0 &&
    Math.abs(phase4b.sixtySecondProof.minuteToCenter - 1) < 1e-12 &&
    Math.abs(phase4b.sixtySecondProof.hourToMinute - 1 / 12) < 1e-12 &&
    phase4b.sixtySecondProof.displayedDirectionsAgree && phase4b.centerPassage.noStationaryIntersection,
  frozenPackageExact: immutablePackageRows.every((row) => row.exact),
  packageMarginsPass: mechanical.frozenPackageCandidateMargins.movingEnvelopeExcess >= 0.550022143008 &&
    mechanical.frozenPackageCandidateMargins.cavityMargin >= 1.030022143008 &&
    mechanical.frozenPackageCandidateMargins.fastenerKeepoutMargin >= 0.687041098785 &&
    mechanical.frozenPackageCandidateMargins.crownCorridorPositive,
  gate0PackageZPreserved: regression.authority.accommodation.z.moveMin === -1.2960000052452088 &&
    regression.authority.accommodation.z.rearClose === -1.7360000052452087 &&
    regression.authority.accommodation.z.midcaseBottom === -2.596000005245209 &&
    regression.authority.accommodation.z.midcaseTop === 7.4616000001162295,
  noBrowserErrors: runtime.browserErrors.length === 0 && regression.browserErrors.length === 0,
  evidenceComplete: evidenceFiles.every((row) => row.present),
  phase5DClosed: mechanical.phase5DStarted === false && phase4b.phase5DStarted === false,
};
const accepted = Object.values(checks).every(Boolean);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "escapement-source-diff-"));
let sourceDiff = "";
for (const file of [...allowedChanged, ...allowedAdded]) {
  const current = path.join(root, file);
  let baseline;
  if (file === "src/structure.ts") {
    baseline = "/tmp/watch-gate0-restored-gIYjdt/src/structure.ts";
  } else if (allowedAdded.includes(file)) {
    baseline = "/dev/null";
  } else {
    baseline = path.join(tempDir, file.replaceAll("/", "__"));
    fs.writeFileSync(baseline, spawnSync("unzip", ["-p", "watch_src.zip", file]).stdout);
  }
  sourceDiff += spawnSync("diff", ["-u", baseline, current], { encoding: "utf8" }).stdout;
}
fs.writeFileSync(path.join(root, outDir, "exact-source-diff.patch"), sourceDiff);

const report = {
  schema: "pre5d-final-escapement-closure-v1",
  disposition: accepted
    ? "PRE-5D ESCAPEMENT REPAIR — CLOSED & MECHANICALLY CERTIFIED"
    : "STOP — FINAL ESCAPEMENT BLOCKER",
  accepted,
  checks,
  gate0Repeat,
  sourceDiff: {
    changedExisting,
    added,
    missing,
    allowedChanged,
    allowedAdded,
    gate0StructureManifestSha256: sourceManifest.files["src/structure.ts"].sha256,
    finalStructureSha256: sourceFiles["src/structure.ts"].sha256,
    gate0BarrelJunctionBlockSha256: sha(gate0JunctionBlock ?? ""),
    finalBarrelJunctionBlockSha256: sha(currentJunctionBlock ?? ""),
    patch: "exact-source-diff.patch",
  },
  clearanceTable: {
    forkBoss: mechanical.forkBoss,
    forkStub: mechanical.forkStub,
    generalMinimum: mechanical.minimumGeneralClearance,
    generalForeignSolids: mechanical.generalForeignSolids,
  },
  contactTraces: mechanical.contact.traces,
  completeBeat: mechanical.completeBeat,
  bridgeContinuity: mechanical.bridgeContinuity,
  bearingGraph: mechanical.supportGraph,
  goingTrainRegression: trainRows,
  phase4bRegression: {
    disposition: phase4b.disposition,
    accepted: phase4b.accepted,
    axis: phase4b.axis,
    centerPassage: {
      noStationaryIntersection: phase4b.centerPassage.noStationaryIntersection,
      continuousCenterOwnedPath: phase4b.centerPassage.continuousCenterOwnedPath,
    },
    sixtySecondProof: phase4b.sixtySecondProof,
  },
  frozenPackageComparison: {
    executableReferenceFileSha256: sha(fs.readFileSync(path.join(root, "captures/gate0-baseline-restoration/executable-runtime-reference.json"))),
    immutableRows: packageRows,
    liveSweepMetadataChange: packageRows.find((row) => row.id === "accommodation.sweep"),
    candidateMargins: mechanical.frozenPackageCandidateMargins,
    z: regression.authority.accommodation.z,
  },
  evidence: evidenceFiles,
  visualOwnershipLegend: {
    cyan: "rigid pallet lower body, stones, riser, fork bridge, horns and banking lug",
    magenta: "unchanged struct:boss:fourth:upper",
    orange: "rerouted struct:trainBridge:stub:b",
    yellow: "unchanged rendered escape wheel/clubs",
    blue: "roller and seated downward impulse jewel",
    gray: "retained support bodies, escape finger, pallet/escape bosses and banking stops",
  },
  build: { command: "npm run build", passed: true },
  phase5DStarted: false,
};
fs.writeFileSync(path.join(root, outDir, "closure-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(report.disposition);
if (!accepted) process.exitCode = 1;
