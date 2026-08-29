import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidence = path.join(root, "captures/annex-e1-exploded");
const runtime = JSON.parse(fs.readFileSync(path.join(evidence, "runtime-report.json"), "utf8"));
const baseline = JSON.parse(fs.readFileSync(
  path.join(root, "captures/post5dc-rear-engraving/runtime-report.json"),
  "utf8",
));
const phase5dCSource = JSON.parse(fs.readFileSync(
  path.join(root, "captures/phase5d-c/executable-source-manifest.json"),
  "utf8",
));
const build = JSON.parse(fs.readFileSync(path.join(evidence, "build-result.json"), "utf8"));

const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const canonical = (value) => JSON.stringify(stable(value));
const exact = (a, b) => canonical(a) === canonical(b);

const sourceFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else sourceFiles.push(path.relative(root, full));
  }
};
walk(path.join(root, "src"));
sourceFiles.sort();
const sourceRows = sourceFiles.map((file) => {
  const data = fs.readFileSync(path.join(root, file));
  const before = phase5dCSource.files[file] ?? null;
  const after = { bytes: data.byteLength, sha256: hash(data) };
  return { file, before, after, changed: before === null || before.sha256 !== after.sha256 };
});
const changed = sourceRows.filter((row) => row.changed).map((row) => row.file);
const expectedChangedSince5dC = ["src/explodedStudy.ts", "src/main.ts"];
const annexChanged = ["src/explodedStudy.ts", "src/main.ts"];

const actual = runtime.reports;
const frozen = baseline.reports;
const authorityRows = Object.keys(frozen.authority).map((name) => ({
  name,
  exact: exact(frozen.authority[name], actual.authority[name]),
  frozenSha256: hash(canonical(frozen.authority[name])),
  actualSha256: hash(canonical(actual.authority[name])),
}));
const stablePhase5d = (report) => ({
  ...report,
  lighting: { ...report.lighting, profile: "<active-presentation-mode>", lights: "<active-presentation-mode>" },
  cameras: { ...report.cameras, current: "<active-presentation-view>" },
});
const frozenReportRows = ["escapement", "phase4b", "goingTrain"].map((name) => ({
  name,
  exact: exact(frozen[name], actual[name]),
  frozenSha256: hash(canonical(frozen[name])),
  actualSha256: hash(canonical(actual[name])),
}));
frozenReportRows.push({
  name: "phase5dStaticAuthority",
  exact: exact(stablePhase5d(frozen.phase5d), stablePhase5d(actual.phase5d)),
  frozenSha256: hash(canonical(stablePhase5d(frozen.phase5d))),
  actualSha256: hash(canonical(stablePhase5d(actual.phase5d))),
});

const requiredImages = [
  "assembled-reference.png",
  "exploded-025.png",
  "exploded-050.png",
  "exploded-075.png",
  "exploded-100.png",
  "final-exploded-hero.png",
  "exploded-side-oblique.png",
];
const imageRows = requiredImages.map((file) => {
  const data = fs.readFileSync(path.join(evidence, file));
  return {
    file,
    bytes: data.byteLength,
    sha256: hash(data),
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
});
const progression = imageRows.slice(0, 5);

const expectedValues = [0, 0.25, 0.5, 0.75, 1];
const transformRows = runtime.transformSamples.map((sample, index) => {
  const value = expectedValues[index];
  const eased = value * value * (3 - 2 * value);
  return {
    value,
    reportedValue: sample.scalar.value,
    eased,
    deterministicOffsets: sample.objects.every((row) =>
      Math.abs(row.currentOffsetZ - row.canonicalOffsetZ * eased) < 1e-12),
    localTransformsUnchanged: sample.objects.every((row) => row.localTransformUnchanged),
    geometryUnchanged: sample.objects.every((row) => row.geometryUnchanged),
    noScaleOrDeformation: sample.objects.every((row) => row.localTransformUnchanged && row.geometryUnchanged),
  };
});

const zero = runtime.zeroReport;
const active = runtime.activeReport;
const gates = {
  buildAndTypecheckPass: build.passed === true && build.typecheck === "passed" && build.viteProductionBuild === "passed",
  noBrowserErrors: runtime.browserErrors.length === 0,
  sourceScopeExact: exact(changed, expectedChangedSince5dC),
  annexSourceLimitedToPresentationFiles: annexChanged.every((file) => sourceFiles.includes(file)) &&
    sourceRows.filter((row) => row.changed && row.file !== "src/identity.ts").every((row) => annexChanged.includes(row.file)),
  frozenProductReportsExact: frozenReportRows.every((row) => row.exact),
  frozenAuthorityReportsExact: authorityRows.every((row) => row.exact),
  exactAssembledRestoration: zero.scalar.value === 0 && zero.assembledEquivalence.exactAtZero === true &&
    zero.assembledEquivalence.carriersAbsentFromProductPathsAtZero === true,
  presentationOnlyNoMutations: active.presentationOnly === true && active.assembledEquivalence.geometryMutated === false &&
    active.assembledEquivalence.materialMutated === false && active.assembledEquivalence.localKinematicsMutated === false,
  allOwnersInvariant: active.objects.every((row) => row.localTransformUnchanged && row.geometryUnchanged),
  deterministicSmoothInterpolation: transformRows.every((row) => row.reportedValue === row.value && row.deterministicOffsets),
  monotonicLayerSeparation: active.layers.every((layer) => layer.canonicalOffsetZ !== 0) &&
    transformRows.every((row) => row.noScaleOrDeformation),
  completeLayerAuthority: active.layers.length === 8 && active.objects.length === 32,
  stageTwoFeasibilityDocumented: active.stageTwoFeasibility.feasible === true &&
    active.stageTwoFeasibility.keepRigid.length >= 5,
  evidenceComplete: imageRows.every((row) => row.bytes > 0 && row.width === 1600 && row.height === 1100),
  visualProgressionChanges: progression.every((row, index) => index === 0 || row.sha256 !== progression[index - 1].sha256),
  sideProofDistinct: imageRows.at(-1).sha256 !== imageRows[4].sha256,
  closedDisposition: runtime.disposition === "PRESENTATION ANNEX E1 — EXPLODED ASSEMBLY CLOSED" &&
    active.disposition === "PRESENTATION ANNEX E1 — EXPLODED ASSEMBLY CLOSED",
};
const passed = Object.values(gates).every(Boolean);
const report = {
  annex: "E1",
  disposition: passed
    ? "PRESENTATION ANNEX E1 — EXPLODED ASSEMBLY CLOSED"
    : "STOP — EXPLOSION OWNERSHIP BLOCKER",
  passed,
  gates,
  sourceDiff: {
    reference: "Phase 5D-C executable manifest; src/identity.ts is the already-frozen rear-engraving micro-pass",
    annexChanged,
    changedSince5dC: changed,
    rows: sourceRows.filter((row) => row.changed),
  },
  frozenReportRows,
  authorityRows,
  transformRows,
  ownerTransformTable: active.objects,
  layerTable: active.layers,
  stageTwoFeasibility: active.stageTwoFeasibility,
  imageRows,
};
fs.writeFileSync(path.join(evidence, "comparison-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(report.disposition);
for (const [name, value] of Object.entries(gates)) console.log(`${value ? "PASS" : "FAIL"} ${name}`);
if (!passed) process.exitCode = 1;
