import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = {
  gate0: "captures/rc1-gate0-independent/gate0-report.json",
  gate0Runtime: "captures/rc1-gate0-independent/executable-runtime-reference.json",
  final: "captures/rc1/final-regression-report.json",
  source: "captures/rc1/executable-source-manifest.json",
  runtime: "captures/rc1/executable-runtime-reference.json",
  runtimeQuality: "captures/rc1/public-runtime-quality.json",
  mechanical: "captures/rc1/mechanical/consolidated-train-matrix.json",
  presentation: "captures/release-annex-r1/report.json",
};

const schemas = {
  gate0: "watch.rc1-gate0-authority.final.v1",
  runtime: "post5d-newer-827-regression-runtime-v1",
  final: "watch.rc1-final-regression.v1",
  source: "watch.rc1-executable-source-manifest.v1",
  mechanical: "rc1-consolidated-going-train-mechanical-v1",
  presentation: "watch-release-annex-r1-v1",
  runtimeQuality: "watch.rc1-public-runtime-quality.v1",
};
const gate0AuthorityHashes = {
  report: "95c07e2652dedd3dfc03c900ca30490c367db003214d765327f571cb1dd297e0",
  runtime: "e9fef1072f79e44aa3480c0ee7cdf08388120518bbbc88d742db4cbcb5feeb04",
};
const expectedPairs = {
  "barrel80-center12": {
    report: "captures/rc1/mechanical/a1-barrel80-center12-mesh-report.json",
    primary: "barrel:wheel",
    secondary: "center:pinion",
    toothCounts: { primary: 80, secondary: 12 },
    ratio: "secondaryDelta = -primaryDelta * 80/12",
    axes: { primary: [-6.045072939534456, -2.818863805810464, 0], secondary: [0, 0, 1.24] },
    centerDistanceMm: 6.67,
    requiredPitchSumMm: 6.67,
    axialOverlapMm: 0.25999999791383743,
    localClockingDeg: { primary: 0, secondary: 0 },
    radial: { primary: [5.8, 5.6376, 5.930499999999999], secondary: [0.8699999999999999, 0.6887499999999999, 1.0294999999999999] },
  },
  "center64-third10": {
    report: "captures/rc1/mechanical/center64-third10-mesh-report.json",
    primary: "center:wheel",
    secondary: "third:pinion",
    toothCounts: { primary: 64, secondary: 10 },
    ratio: "secondaryDelta = -primaryDelta * 64/10",
    axes: { primary: [0, 0, 1.24], secondary: [4.549778035879225, 2.843016852611144, 1.66] },
    centerDistanceMm: 5.364999999999999,
    requiredPitchSumMm: 5.364999999999999,
    axialOverlapMm: 0.14499999210238457,
    localClockingDeg: { primary: 0, secondary: -9.2 },
    radial: { primary: [4.64, 4.4776, 4.770499999999999], secondary: [0.725, 0.54375, 0.8845] },
  },
  "third60-fourth8": {
    report: "captures/rc1/mechanical/third60-fourth8-mesh-report.json",
    primary: "third:wheel",
    secondary: "fourth:pinion",
    toothCounts: { primary: 60, secondary: 8 },
    ratio: "secondaryDelta = -primaryDelta * 60/8",
    axes: { primary: [4.549778035879225, 2.843016852611144, 1.66], secondary: [0.14362218235134794, 5.054507434644454, 1.003] },
    centerDistanceMm: 4.930000000000001,
    requiredPitchSumMm: 4.93,
    axialOverlapMm: 0.14499999210238457,
    localClockingDeg: { primary: 0, secondary: -12.05 },
    radial: { primary: [4.35, 4.1876, 4.480499999999999], secondary: [0.58, 0.39874999999999994, 0.7394999999999999] },
  },
  "fourth56-escape7": {
    report: "captures/rc1/mechanical/a2-fourth56-escape7-mesh-report.json",
    primary: "fourth:wheel",
    secondary: "escape:pinion",
    toothCounts: { primary: 56, secondary: 7 },
    ratio: "secondaryDelta = -primaryDelta * 56/7",
    axes: { primary: [0.14362218235134794, 5.054507434644454, 1.003], secondary: [-4.035822753424774, 3.2121458309370468, 2.08] },
    centerDistanceMm: 4.5675,
    requiredPitchSumMm: 4.5675,
    axialOverlapMm: 0.09999999776482582,
    localClockingDeg: { primary: 0, secondary: 17.78571428571428 },
    radial: { primary: [4.06, 3.8975999999999997, 4.190499999999999], secondary: [0.5075, 0.32624999999999993, 0.6669999999999999] },
  },
};
const requiredFinalChecks = [
  "gate0AuthorityPreviouslyAccepted",
  "buildAndTypecheckPass",
  "runtimeApisPresent",
  "runtimeHasNoUnexpectedErrors",
  "authorizedProductSourceScopeOnly",
  "releaseSourceManifestComplete",
  "goingTrainExact",
  "phase4bAcceptedAndPhysicalExact",
  "escapementAcceptedAndExactExceptImprovedClearances",
  "noForeignClearanceRegression",
  "packagePhysicalAuthorityExact",
  "packageTopBottomExact",
  "structureAndAssemblyExact",
  "accommodationDisplayEnclosurePhysicalExact",
  "exteriorGeometryExact",
  "finishReadoutStrapExact",
  "sapphireOwnershipExact",
  "identityAuthorityPreserved",
  "annexExplodeZeroObjectsExact",
  "mechanicalMatrixAccepted",
  "allFourMeshPairsFullCycleAccepted",
  "analyticRadiiExactAndNoGrowth",
  "meshAxesRatiosAndPitchExact",
  "releaseAnnexR1Accepted",
  "publicRuntimeQualityAccepted",
].sort();
const requiredGate0Checks = [
  "annexExplodeZeroExact",
  "buildAndTypecheckPassAtGate0",
  "escapementExact",
  "failingGearWitnessesExact",
  "finishIdentitySapphireExact",
  "goingTrainExact",
  "packageTopBottomExact",
  "packageZExact",
  "phase4bExact",
  "runtimeApisExact",
  "runtimeByteExact",
  "sourceAndRootManifestExactAtGate0",
  "warningFingerprintExact",
].sort();
const requiredMechanicalArtifacts = [
  "captures/rc1/mechanical/a1-barrel80-center12-mesh-report.json",
  "captures/rc1/mechanical/a1-runtime-regression.json",
  "captures/rc1/mechanical/a2-escape-pallet-sweep-report.json",
  "captures/rc1/mechanical/a2-fourth56-escape7-mesh-report.json",
  "captures/rc1/mechanical/a2-runtime-regression.json",
  "captures/rc1/mechanical/center64-third10-mesh-report.json",
  "captures/rc1/mechanical/consolidated-train-matrix.json",
  "captures/rc1/mechanical/third60-fourth8-mesh-report.json",
].sort();
const rootReleaseFiles = [
  ".gitignore",
  "index.html",
  "package-lock.json",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "README.md",
  "DEPLOYMENT.md",
  "POST5D_CLOSEOUT_PLAN_REVISED_2026-08-27.md",
  "PROJECT_LICENSE.txt",
  "THIRD_PARTY_NOTICES.txt",
  "SECURITY_AUDIT.md",
  "KNOWN_LIMITATIONS.md",
  "RELEASE_NOTES_RC1.md",
  "watch_pre_repair_frozen_package_reference.json",
].sort();
const authorizedChangedProductSource = [
  "src/geometry.ts",
  "src/identity.ts",
  "src/main.ts",
  "src/movement.ts",
  "src/releaseShell.ts",
  "src/style.css",
].sort();
const authorizedChangedReleaseRoot = ["index.html", "package-lock.json", "package.json"].sort();

const fail = (message) => {
  throw new Error(`RC1 AUTHORITY FAILURE — ${message}`);
};
const resolveWithinRoot = (relative, label = "path") => {
  if (
    typeof relative !== "string" ||
    relative.length === 0 ||
    path.isAbsolute(relative) ||
    relative.includes("\\") ||
    path.posix.normalize(relative) !== relative ||
    relative === ".." ||
    relative.startsWith("../")
  ) {
    fail(`unsafe ${label} ${String(relative)}`);
  }
  const resolved = path.resolve(root, relative);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    fail(`unsafe ${label} ${relative}`);
  }
  return resolved;
};
const absolute = (relative) => resolveWithinRoot(relative);
const requireFile = (relative) => {
  const file = absolute(relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`missing ${relative}`);
  return file;
};
const read = (relative) => JSON.parse(fs.readFileSync(requireFile(relative), "utf8"));
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const allFiles = (directory) => {
  const rows = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) rows.push(target);
    }
  };
  visit(directory);
  return rows;
};
const exactStringSet = (actual, expected) =>
  JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());

const final = read(paths.final);
const source = read(paths.source);
const gate0 = read(paths.gate0);
const gate0Runtime = read(paths.gate0Runtime);
const runtimeFile = requireFile(paths.runtime);
const runtime = read(paths.runtime);
const mechanical = read(paths.mechanical);
const presentation = read(paths.presentation);
const runtimeQuality = read(paths.runtimeQuality);

if (
  gate0.schema !== schemas.gate0 ||
  gate0.accepted !== true ||
  !exactStringSet(Object.keys(gate0.checks ?? {}), requiredGate0Checks) ||
  requiredGate0Checks.some((key) => gate0.checks[key] !== true)
) {
  fail("Gate-0 authority is not accepted");
}
if (
  hash(requireFile(paths.gate0)) !== gate0AuthorityHashes.report ||
  hash(requireFile(paths.gate0Runtime)) !== gate0AuthorityHashes.runtime
) {
  fail("Gate-0 immutable authority hash mismatch");
}
if (gate0Runtime.schema !== schemas.runtime || runtime.schema !== schemas.runtime) {
  fail("runtime-reference schema is incomplete or unexpected");
}
if (final.schema !== schemas.final) fail(`unexpected final-regression schema ${final.schema}`);
if (source.schema !== schemas.source) fail(`unexpected source-manifest schema ${source.schema}`);
if (mechanical.schema !== schemas.mechanical) fail(`unexpected mechanical-matrix schema ${mechanical.schema}`);
if (presentation.schema !== schemas.presentation) fail(`unexpected presentation schema ${presentation.schema}`);
if (runtimeQuality.schema !== schemas.runtimeQuality) fail(`unexpected runtime-quality schema ${runtimeQuality.schema}`);
const requiredRuntimeApis = [
  "escapementRepairReport",
  "kinematicReport",
  "displayDriveReport",
  "phase5dPresentationReport",
  "explodedAssemblyReport",
  "fourthWheelSweepAuditReport",
  "barrelCenterAuditReport",
  "barrelFourthAuditReport",
  "structureReport",
  "assemblyReport",
  "accommodationReport",
  "displayReport",
  "enclosureReport",
  "exteriorReport",
  "readoutReport",
  "finishReport",
  "strapReport",
  "sceneDump",
].sort();
if (
  !exactStringSet(Object.keys(runtime.api ?? {}), requiredRuntimeApis) ||
  requiredRuntimeApis.some((key) => runtime.api[key] !== "function")
) {
  fail("runtime reference API surface is incomplete or unexpected");
}
const finalCheckKeys = Object.keys(final.checks ?? {}).sort();
if (!exactStringSet(finalCheckKeys, requiredFinalChecks)) fail("final regression check-key set is incomplete or unexpected");
if (final.accepted !== true || requiredFinalChecks.some((key) => final.checks[key] !== true)) {
  fail("final regression is not fully accepted");
}
if (source.accepted !== true) fail("source manifest is not accepted");
if (mechanical.accepted !== true) fail("consolidated train matrix is not accepted");
if (presentation.accepted !== true) fail("Release Annex R1 is not accepted");
if (presentation.passed !== true) fail("Release Annex R1 did not pass its capture gates");
const requiredPresentationGates = [
  "buildPasses",
  "runtimeSourceUnchangedDuringCapture",
  "noUnexpectedBrowserErrors",
  "stableImageSetComplete",
  "primaryFramesAre1600x1100",
  "staticShellSuppressed",
  "semanticCanvas",
  "b1CopyExact",
  "b1DecimalMinimumReported",
  "productAuthorityInvariantAcrossPresentation",
  "e1ExactAtZero",
  "e1ProgressionDeterministic",
  "publicShellControlsPresent",
  "publicTouchTargets44Px",
  "publicReducedMotionStartsPaused",
  "publicExplodedLayerCommunication",
  "publicControlReturnsExactAssembled",
].sort();
if (
  !exactStringSet(Object.keys(presentation.gates ?? {}), requiredPresentationGates) ||
  requiredPresentationGates.some((key) => presentation.gates[key] !== true)
) {
  fail("Release Annex R1 gate set is incomplete, unexpected, or not fully accepted");
}
if (
  presentation.contract?.fixedTimeSeconds !== 0.104 ||
  presentation.contract?.fixedReadoutPose !== "10:10" ||
  JSON.stringify(presentation.contract?.viewport) !== JSON.stringify([1600, 1100]) ||
  presentation.contract?.deviceScaleFactor !== 1
) {
  fail("Release Annex R1 capture contract differs from authority");
}
if (presentation.visualInspection?.completed !== true || presentation.visualInspection?.accepted !== true) {
  fail("Release Annex R1 has no accepted signed visual inspection");
}
if (presentation.visualInspection?.independentRearTranscription !== "2.4 Hz · 17 280 · TWO HANDS") {
  fail("rear identity was not independently transcribed exactly");
}
if (presentation.visualInspection?.front320Read?.hands !== "10:10" || presentation.visualInspection?.front320Read?.marker12Distinct !== true) {
  fail("320px time/12-marker visual gate is not signed");
}
if (runtimeQuality.accepted !== true) fail("public runtime-quality audit is not accepted");
const runtimeScenarioIds = ["desktop-dpr1", "mobile-dpr2"];
const runtimeScenarioAuthority = {
  "desktop-dpr1": { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, resized: { cssWidth: 1320, cssHeight: 820, pixelWidth: 1320, pixelHeight: 820 } },
  "mobile-dpr2": { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, resized: { cssWidth: 360, cssHeight: 764, pixelWidth: 720, pixelHeight: 1528 } },
};
const runtimeScenarios = runtimeQuality.scenarios;
if (
  !Array.isArray(runtimeScenarios) ||
  runtimeScenarios.length !== runtimeScenarioIds.length ||
  !exactStringSet(runtimeScenarios.map((row) => row.scenario?.id), runtimeScenarioIds)
) {
  fail("runtime-quality scenario set is incomplete or unexpected");
}
for (const row of runtimeScenarios) {
  const diagnostics = row.diagnostics ?? {};
  const expectedScenario = runtimeScenarioAuthority[row.scenario?.id];
  const memorySignatures = [
    `${row.renderer?.renderer?.memory?.geometries}/${row.renderer?.renderer?.memory?.textures}/${row.renderer?.scene?.objects}/${row.renderer?.scene?.meshes}`,
    ...(row.cycleAudit?.rows ?? []).map(
      (cycle) => `${cycle.geometries}/${cycle.textures}/${cycle.sceneObjects}/${cycle.sceneMeshes}`,
    ),
  ];
  const cameraDeltas = [
    row.interaction?.cameraMotion?.positionDelta,
    row.interaction?.cameraMotion?.targetDelta,
    row.interaction?.cameraMotion?.fovDelta,
  ];
  const resizedCanvas = row.interaction?.release?.runtime?.renderer?.canvas;
  if (
    row.accepted !== true ||
    row.httpStatus !== 200 ||
    row.firstCaptureLength <= 10_000 ||
    row.firstFrame?.pixels?.nonBackgroundPixels < 200 ||
    row.cycleAudit?.warmup?.exploded !== 1 ||
    row.cycleAudit?.warmup?.assembled !== 0 ||
    row.cycleAudit?.warmup?.exactAtZero !== true ||
    row.cycleAudit?.count !== 10 ||
    row.cycleAudit?.exactCycles !== true ||
    row.cycleAudit?.stableRendererAndSceneCounts !== true ||
    !Array.isArray(row.cycleAudit?.rows) ||
    row.cycleAudit.rows.length !== 10 ||
    row.cycleAudit.rows.some((cycle) => cycle.exploded !== 1 || cycle.assembled !== 0 || cycle.exactAtZero !== true) ||
    new Set(memorySignatures).size !== 1 ||
    !expectedScenario ||
    JSON.stringify(row.scenario.viewport) !== JSON.stringify(expectedScenario.viewport) ||
    row.scenario.deviceScaleFactor !== expectedScenario.deviceScaleFactor ||
    row.interaction?.exploded !== 0 ||
    row.interaction?.cameraMotion?.changed !== true ||
    !cameraDeltas.some((value) => Number.isFinite(value) && value > 1e-6) ||
    row.interaction?.resizeChanged !== true ||
    row.interaction?.resizeExact !== true ||
    JSON.stringify(row.interaction?.expectedResize) !== JSON.stringify(expectedScenario.resized) ||
    resizedCanvas?.cssWidth !== expectedScenario.resized.cssWidth ||
    resizedCanvas?.cssHeight !== expectedScenario.resized.cssHeight ||
    resizedCanvas?.pixelWidth !== expectedScenario.resized.pixelWidth ||
    resizedCanvas?.pixelHeight !== expectedScenario.resized.pixelHeight ||
    row.interaction?.pixels?.nonBackgroundPixels < 200 ||
    diagnostics.pageErrors?.length !== 0 ||
    diagnostics.requestFailures?.length !== 0 ||
    diagnostics.httpErrors?.length !== 0 ||
    diagnostics.unexpectedConsoleErrors?.length !== 0 ||
    diagnostics.externalRequests?.length !== 0
  ) {
    fail(`runtime-quality scenario does not satisfy its gates: ${row.scenario?.id}`);
  }
}
const contextLoss = runtimeQuality.contextLoss;
if (
  contextLoss?.supported !== true ||
  contextLoss.accepted !== true ||
  contextLoss.lost !== true ||
  contextLoss.restored !== true ||
  contextLoss.captureLength <= 10_000 ||
  contextLoss.subjectPixels < 100 ||
  contextLoss.externalRequests?.length !== 0 ||
  contextLoss.diagnostics?.pageErrors?.length !== 0 ||
  contextLoss.diagnostics?.requestFailures?.length !== 0 ||
  contextLoss.diagnostics?.httpErrors?.length !== 0 ||
  contextLoss.diagnostics?.unexpectedConsoleErrors?.length !== 0
) {
  fail("runtime-quality WebGL context-loss/restoration gate is incomplete");
}
const testedDistRows = runtimeQuality.testedArtifact?.files;
if (runtimeQuality.testedArtifact?.root !== "dist") fail("runtime-quality audit did not test dist/");
if (!Array.isArray(testedDistRows) || testedDistRows.length === 0) fail("runtime-quality audit has no tested dist manifest");
const distRoot = absolute("dist");
if (!fs.existsSync(path.join(distRoot, "index.html"))) fail("current dist is missing");
const currentDistRows = allFiles(distRoot).map((file) => ({
  file: path.relative(distRoot, file).split(path.sep).join("/"),
  bytes: fs.statSync(file).size,
  sha256: hash(file),
}));
if (JSON.stringify(currentDistRows) !== JSON.stringify(testedDistRows)) fail("current dist differs from runtime-tested bytes");

const presentationImageFiles = [
  "final-hero.png",
  "front-elevation.png",
  "front-three-quarter.png",
  "wearable-proof.png",
  "wearable-junction.png",
  "balance-finish-macro.png",
  "sapphire-oblique.png",
  "rear-exhibition.png",
  "rear-identity-proof.png",
  "finish-rake-before.png",
  "finish-rake-after.png",
  "exploded-side.png",
  "e1-000.png",
  "e1-025.png",
  "e1-050.png",
  "e1-075.png",
  "exploded-hero.png",
  "explode-progression.png",
].sort();
const requiredPresentationImages = new Set(presentationImageFiles);
const presentationRoot = path.dirname(requireFile(paths.presentation));
const presentationRows = presentation.images;
if (!Array.isArray(presentationRows)) fail("Release Annex R1 has no image manifest");
if (presentationRows.length !== requiredPresentationImages.size) fail("Release Annex R1 image-manifest cardinality is wrong");
const presentationSeen = new Set();
for (const row of presentationRows) {
  if (!row.file || !row.sha256 || !Number.isFinite(row.bytes)) fail("malformed presentation image row");
  if (row.png?.width !== 1600 || row.png?.height !== 1100) fail(`wrong presentation dimensions ${row.file}`);
  if (presentationSeen.has(row.file)) fail(`duplicate presentation image row ${row.file}`);
  presentationSeen.add(row.file);
  const file = path.resolve(presentationRoot, row.file);
  if (file !== presentationRoot && !file.startsWith(`${presentationRoot}${path.sep}`)) fail(`unsafe presentation path ${row.file}`);
  if (!fs.existsSync(file) || fs.statSync(file).size !== row.bytes || hash(file) !== row.sha256) {
    fail(`presentation image mismatch ${row.file}`);
  }
  requiredPresentationImages.delete(row.file);
}
if (requiredPresentationImages.size) fail(`missing presentation images: ${[...requiredPresentationImages].join(", ")}`);
const inspectedFileRows = presentation.visualInspection.inspectedFiles;
if (
  !Array.isArray(inspectedFileRows) ||
  inspectedFileRows.length !== presentationImageFiles.length ||
  new Set(inspectedFileRows).size !== presentationImageFiles.length ||
  !exactStringSet(inspectedFileRows, presentationImageFiles)
) {
  fail("signed visual inspection file set is incomplete or unexpected");
}

const sourceRows = source.files;
if (!Array.isArray(sourceRows) || sourceRows.length === 0) fail("source manifest has no files");
const manifestPaths = new Set();
const sourceRowsByPath = new Map();
for (const row of sourceRows) {
  if (!row.file || !row.sha256 || !Number.isFinite(row.bytes)) fail("malformed source manifest row");
  if (manifestPaths.has(row.file)) fail(`duplicate source-manifest row ${row.file}`);
  resolveWithinRoot(row.file, "source-manifest path");
  manifestPaths.add(row.file);
  sourceRowsByPath.set(row.file, row);
  const file = requireFile(row.file);
  if (fs.statSync(file).size !== row.bytes) fail(`byte-count mismatch ${row.file}`);
  if (hash(file) !== row.sha256) fail(`hash mismatch ${row.file}`);
}

const actualSrc = allFiles(path.join(root, "src"))
  .map((file) => path.relative(root, file).split(path.sep).join("/"))
  .sort();
const manifestSrc = [...manifestPaths].filter((file) => file.startsWith("src/")).sort();
if (JSON.stringify(actualSrc) !== JSON.stringify(manifestSrc)) fail("src/ file-set mismatch");
const actualScripts = allFiles(path.join(root, "scripts"))
  .map((file) => path.relative(root, file).split(path.sep).join("/"))
  .sort();
const manifestScripts = [...manifestPaths].filter((file) => file.startsWith("scripts/")).sort();
if (JSON.stringify(actualScripts) !== JSON.stringify(manifestScripts)) fail("scripts/ file-set mismatch");
const expectedManifestPaths = [...rootReleaseFiles, ...actualSrc, ...actualScripts].sort();
if (!exactStringSet(manifestPaths, expectedManifestPaths)) fail("source manifest has a missing or unexpected file");
for (const file of rootReleaseFiles) {
  if (sourceRowsByPath.get(file)?.category !== "release-root") fail(`wrong source-manifest category ${file}`);
}
for (const file of actualSrc) {
  if (sourceRowsByPath.get(file)?.category !== "product-source") fail(`wrong source-manifest category ${file}`);
}
for (const file of actualScripts) {
  if (sourceRowsByPath.get(file)?.category !== "release/audit-script") fail(`wrong source-manifest category ${file}`);
}
if (
  source.fileCount !== sourceRows.length ||
  source.srcFileCount !== actualSrc.length ||
  source.scriptFileCount !== actualScripts.length
) {
  fail("source-manifest counts do not match the verified file sets");
}
const sourceAggregateText = [...sourceRows]
  .sort((a, b) => a.file.localeCompare(b.file))
  .map((row) => `${row.sha256}  ${row.file}\n`)
  .join("");
const sourceAggregateSha256 = crypto.createHash("sha256").update(sourceAggregateText).digest("hex");
if (source.aggregateSha256 !== sourceAggregateSha256) fail("source-manifest aggregate hash mismatch");
const gate0Rows = new Map(gate0.source?.rows?.map((row) => [row.file, row]) ?? []);
const actualChangedProductSource = actualSrc
  .filter((file) => gate0Rows.get(file)?.sha256 !== sourceRowsByPath.get(file)?.sha256)
  .sort();
if (!exactStringSet(actualChangedProductSource, authorizedChangedProductSource)) {
  fail("product-source delta from Gate-0 is incomplete or unauthorized");
}
const gate0RootFiles = [...gate0Rows.keys()].filter((file) => !file.startsWith("src/")).sort();
const actualChangedReleaseRoot = gate0RootFiles
  .filter((file) => gate0Rows.get(file)?.sha256 !== sourceRowsByPath.get(file)?.sha256)
  .sort();
if (!exactStringSet(actualChangedReleaseRoot, authorizedChangedReleaseRoot)) {
  fail("release-root delta from Gate-0 is incomplete or unauthorized");
}
if (
  !exactStringSet(source.authorityBoundary?.productSourceChanges ?? [], authorizedChangedProductSource) ||
  !exactStringSet(source.authorityBoundary?.releaseRootChanges ?? [], authorizedChangedReleaseRoot) ||
  !exactStringSet((source.changedProductSourceRows ?? []).map((row) => row.file), authorizedChangedProductSource) ||
  !exactStringSet((source.changedReleaseRootRows ?? []).map((row) => row.file), authorizedChangedReleaseRoot)
) {
  fail("source manifest does not record the authorized Gate-0 delta exactly");
}

const pairRows = mechanical.pairRows;
if (!Array.isArray(pairRows) || pairRows.length !== 4) fail("mechanical matrix must contain exactly four pair rows");
const requiredPairs = new Set([
  "barrel80-center12",
  "center64-third10",
  "third60-fourth8",
  "fourth56-escape7",
]);
const currentMechanicalSourceHashes = {
  movement: hash(requireFile("src/movement.ts")),
  geometry: hash(requireFile("src/geometry.ts")),
  spec: hash(requireFile("src/spec.ts")),
  escapementContact: hash(requireFile("src/escapementContact.ts")),
};
if (JSON.stringify(mechanical.sourceHashes) !== JSON.stringify(currentMechanicalSourceHashes)) {
  fail("mechanical matrix source hashes do not match current source");
}
for (const row of pairRows) {
  const id = row.pairId;
  if (!requiredPairs.has(id)) fail(`unexpected or duplicate gear pair ${String(id)}`);
  const expected = expectedPairs[id];
  const refinement = row.localRefinement;
  const radialMembers = [row.radialEnvelope?.primary, row.radialEnvelope?.secondary];
  const radialAccepted = radialMembers.every(
    (member) =>
      member &&
      Number.isFinite(member.tipRadiusMm) &&
      Number.isFinite(member.currentRenderedMaxRadiusMm) &&
      Math.abs(member.currentRenderedMaxRadiusMm - member.tipRadiusMm) <= 5e-7 &&
      member.noRenderedGrowth === true,
  );
  if (
    row.accepted !== true ||
    !Number.isInteger(row.sampleCount) ||
    row.sampleCount < 8193 ||
    row.collisionSamples !== 0 ||
    row.maximumIntersectionAreaMm2 !== 0 ||
    !Number.isFinite(row.minimumPositiveClearanceMm) ||
    !(row.minimumPositiveClearanceMm > 0) ||
    !refinement ||
    !Number.isInteger(refinement.sampleCount) ||
    refinement.sampleCount < 2049 ||
    refinement.collisionSamples !== 0 ||
    refinement.maximumIntersectionAreaMm2 !== 0 ||
    !Number.isFinite(refinement.minimumPositiveClearanceMm) ||
    !(refinement.minimumPositiveClearanceMm > 0) ||
    row.sourceExact !== true ||
    row.moduleMm !== 0.145 ||
    !Number.isFinite(row.centerDistanceMm) ||
    !Number.isFinite(row.requiredPitchSumMm) ||
    Math.abs(row.centerDistanceMm - row.requiredPitchSumMm) > 2e-15 ||
    row.ratio !== expected.ratio ||
    !radialAccepted ||
    row.primary !== expected.primary ||
    row.secondary !== expected.secondary ||
    JSON.stringify(row.toothCounts) !== JSON.stringify(expected.toothCounts) ||
    JSON.stringify(row.axes) !== JSON.stringify(expected.axes) ||
    row.centerDistanceMm !== expected.centerDistanceMm ||
    row.requiredPitchSumMm !== expected.requiredPitchSumMm ||
    row.axialOverlapMm !== expected.axialOverlapMm ||
    JSON.stringify(row.localClockingDeg) !== JSON.stringify(expected.localClockingDeg) ||
    JSON.stringify([
      row.radialEnvelope.primary.pitchRadiusMm,
      row.radialEnvelope.primary.rootRadiusMm,
      row.radialEnvelope.primary.tipRadiusMm,
    ]) !== JSON.stringify(expected.radial.primary) ||
    JSON.stringify([
      row.radialEnvelope.secondary.pitchRadiusMm,
      row.radialEnvelope.secondary.rootRadiusMm,
      row.radialEnvelope.secondary.tipRadiusMm,
    ]) !== JSON.stringify(expected.radial.secondary) ||
    JSON.stringify(row.sourceHashes) !== JSON.stringify({
      movement: currentMechanicalSourceHashes.movement,
      geometry: currentMechanicalSourceHashes.geometry,
      spec: currentMechanicalSourceHashes.spec,
    }) ||
    row.report?.path !== expected.report ||
    row.report?.sha256 !== hash(requireFile(expected.report))
  ) {
    fail(`gear pair does not satisfy full-cycle authority: ${id}`);
  }
  requiredPairs.delete(id);
}
if (requiredPairs.size) fail(`missing gear pairs: ${[...requiredPairs].join(", ")}`);
const escapeSweep = mechanical.escapement?.escapePalletSweep;
const expectedEscapeSweep = "captures/rc1/mechanical/a2-escape-pallet-sweep-report.json";
const expectedEscapeCollisionOwners = [
  "pallet:bankingLug",
  "pallet:lowerArm:entry",
  "pallet:lowerArm:exit",
  "pallet:lowerBoss",
  "pallet:lowerLever",
  "pallet:stone:entry",
  "pallet:stone:exit",
].sort();
if (
  escapeSweep?.accepted !== true ||
  !Number.isInteger(escapeSweep.sampleCount) ||
  escapeSweep.sampleCount < 2049 ||
  !exactStringSet(Object.keys(escapeSweep.collisionSamples ?? {}), expectedEscapeCollisionOwners) ||
  Object.values(escapeSweep.collisionSamples ?? {}).some((value) => typeof value !== "number" || value !== 0) ||
  escapeSweep.report?.path !== expectedEscapeSweep ||
  escapeSweep.report?.sha256 !== hash(requireFile(expectedEscapeSweep)) ||
  escapeSweep.rubyFacesHash?.accepted !== escapeSweep.rubyFacesHash?.current ||
  escapeSweep.contactSequenceHash?.accepted !== escapeSweep.contactSequenceHash?.current
) {
  fail("escape-wheel/pallet full-beat evidence is incomplete or changed");
}

const boundHashes = final.boundArtifactHashes ?? final.artifactHashes ?? {};
if (!boundHashes || Object.keys(boundHashes).length === 0) fail("final regression binds no authority artifacts");
const expectedBoundPaths = new Set([
  paths.gate0,
  paths.gate0Runtime,
  paths.source,
  paths.runtime,
  paths.runtimeQuality,
  paths.presentation,
  ...requiredMechanicalArtifacts,
]);
if (!exactStringSet(Object.keys(boundHashes), expectedBoundPaths)) {
  fail("final regression bound-artifact set is incomplete or unexpected");
}
for (const [relative, expected] of Object.entries(boundHashes)) {
  if (typeof relative !== "string" || typeof expected !== "string" || !/^[0-9a-f]{64}$/.test(expected)) {
    fail(`malformed bound-artifact row ${relative}`);
  }
  resolveWithinRoot(relative, "bound-artifact path");
  if (hash(requireFile(relative)) !== expected) fail(`bound-artifact hash mismatch ${relative}`);
}
for (const relative of Object.values(paths)) {
  if (relative === paths.final) continue;
  if (!boundHashes[relative]) fail(`final regression does not bind ${relative}`);
}
const actualMechanicalArtifacts = allFiles(absolute("captures/rc1/mechanical"))
  .map((file) => path.relative(root, file).split(path.sep).join("/"))
  .sort();
if (!exactStringSet(actualMechanicalArtifacts, requiredMechanicalArtifacts)) {
  fail("mechanical evidence file set is incomplete or unexpected");
}
for (const relative of requiredMechanicalArtifacts) {
  if (!boundHashes[relative]) fail(`final regression does not bind mechanical evidence ${relative}`);
}

const runtimeSha256 = hash(runtimeFile);
if (final.runtimeSha256 !== runtimeSha256) fail("runtime-reference hash mismatch");
if (
  final.source?.manifest !== paths.source ||
  final.source?.manifestSha256 !== hash(requireFile(paths.source)) ||
  final.provenance?.gate0Report !== paths.gate0 ||
  final.provenance?.gate0Runtime?.path !== paths.gate0Runtime ||
  final.provenance?.gate0Runtime?.sha256 !== hash(requireFile(paths.gate0Runtime)) ||
  final.provenance?.finalRuntime?.path !== paths.runtime ||
  final.provenance?.finalRuntime?.sha256 !== runtimeSha256 ||
  final.provenance?.finalRuntime?.bytes !== fs.statSync(runtimeFile).size
) {
  fail("final regression provenance fields do not match bound artifacts");
}

const summary = {
  schema: "watch.rc1-authority-verification.v1",
  accepted: true,
  sourceFiles: sourceRows.length,
  srcFiles: actualSrc.length,
  runtimeSha256,
  runtimeQualitySha256: hash(requireFile(paths.runtimeQuality)),
  finalRegressionSha256: hash(requireFile(paths.final)),
  mechanicalMatrixSha256: hash(requireFile(paths.mechanical)),
  presentationReportSha256: hash(requireFile(paths.presentation)),
};
console.log(JSON.stringify(summary, null, 2));
