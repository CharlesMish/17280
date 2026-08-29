import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "captures/rc1");
const paths = {
  gate0: "captures/rc1-gate0-independent/gate0-report.json",
  gate0Runtime: "captures/rc1-gate0-independent/executable-runtime-reference.json",
  runtime: "captures/rc1/executable-runtime-reference.json",
  runtimeQuality: "captures/rc1/public-runtime-quality.json",
  mechanical: "captures/rc1/mechanical/consolidated-train-matrix.json",
  presentation: "captures/release-annex-r1/report.json",
  sourceManifest: "captures/rc1/executable-source-manifest.json",
  final: "captures/rc1/final-regression-report.json",
};
const gate0AuthorityHashes = {
  report: "95c07e2652dedd3dfc03c900ca30490c367db003214d765327f571cb1dd297e0",
  runtime: "e9fef1072f79e44aa3480c0ee7cdf08388120518bbbc88d742db4cbcb5feeb04",
};

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const absolute = (relative) => path.join(root, relative);
const requireFile = (relative) => {
  const file = absolute(relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Missing required RC1 input: ${relative}`);
  }
  return file;
};
const read = (relative) => JSON.parse(fs.readFileSync(requireFile(relative), "utf8"));
const hashFile = (relative) => sha256(fs.readFileSync(requireFile(relative)));
const fileRow = (relative, category) => {
  const file = requireFile(relative);
  return {
    file: relative,
    category,
    bytes: fs.statSync(file).size,
    sha256: hashFile(relative),
  };
};
const listFiles = (relativeDirectory) => {
  const directory = absolute(relativeDirectory);
  const rows = [];
  const visit = (current) => {
    for (const entry of fs
      .readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) rows.push(path.relative(root, target).split(path.sep).join("/"));
    }
  };
  visit(directory);
  return rows;
};
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const canonical = (value) => JSON.stringify(stable(value));
const exact = (a, b) => canonical(a) === canonical(b);

const normalizeSampling = (name, source) => {
  const row = structuredClone(source);
  if (name === "phase4b") {
    delete row.collision?.calibreSweepClearance?.hour?.samplesInDisk;
    delete row.collision?.calibreSweepClearance?.minute?.samplesInDisk;
  }
  if (name === "package") {
    delete row.accommodation?.sweep?.projectedVertices;
    delete row.accommodation?.sweep?.uniqueProjected;
  }
  if (name === "accommodation") {
    delete row.sweep?.projectedVertices;
    delete row.sweep?.uniqueProjected;
    delete row.sweep?.verticesEvaluated;
    delete row.corridor?.samples;
  }
  if (name === "display") {
    delete row.hourClearance?.samplesInDisk;
    delete row.minuteClearance?.samplesInDisk;
  }
  if (name === "enclosure") delete row.rear?.clearance?.samples;
  return row;
};

const normalizeIdentityRefinement = (source) => {
  const row = structuredClone(source);
  delete row.rear?.refinement?.decimalMinimumDiameterMm;
  delete row.rear?.refinement?.decimalRaster;
  return row;
};

const normalizeAnnexZero = (source) => {
  const row = structuredClone(source);
  // Release Annex R1 adds presentation cameras only. The assembled-object
  // transforms and all product geometry remain the E1 authority checked here.
  delete row.currentCamera;
  delete row.cameraAuthority?.r1E1Hero;
  delete row.cameraAuthority?.r1E1Side;
  return row;
};

const normalizeEscapementClearances = (source) => {
  const row = structuredClone(source);
  for (const pair of row.generalForeignSolids ?? []) delete pair.minimumClearance;
  return row;
};

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
];
const sourceFiles = listFiles("src");
const scriptFiles = listFiles("scripts");
const manifestRows = [
  ...rootReleaseFiles.map((file) => fileRow(file, "release-root")),
  ...sourceFiles.map((file) => fileRow(file, "product-source")),
  ...scriptFiles.map((file) => fileRow(file, "release/audit-script")),
].sort((a, b) => a.file.localeCompare(b.file));
const manifestText = manifestRows.map((row) => `${row.sha256}  ${row.file}\n`).join("");

const gate0 = read(paths.gate0);
const baseline = read(paths.gate0Runtime);
const runtime = read(paths.runtime);
const mechanical = read(paths.mechanical);
const presentation = read(paths.presentation);
const runtimeQuality = read(paths.runtimeQuality);

const gate0SourceRows = new Map(
  gate0.source.rows.filter((row) => row.file.startsWith("src/")).map((row) => [row.file, row]),
);
const gate0RootRows = new Map(
  gate0.source.rows.filter((row) => !row.file.startsWith("src/")).map((row) => [row.file, row]),
);
const currentSourceRows = sourceFiles.map((file) => fileRow(file, "product-source"));
const changedSourceRows = currentSourceRows
  .filter((row) => gate0SourceRows.get(row.file)?.sha256 !== row.sha256)
  .map((row) => ({
    ...row,
    gate0Bytes: gate0SourceRows.get(row.file)?.bytes ?? null,
    gate0Sha256: gate0SourceRows.get(row.file)?.sha256 ?? null,
  }));
const gate0TrackedRootFiles = [...gate0RootRows.keys()].sort();
const currentGate0RootRows = gate0TrackedRootFiles.map((file) => fileRow(file, "release-root"));
const changedReleaseRootRows = currentGate0RootRows
  .filter((row) => gate0RootRows.get(row.file)?.sha256 !== row.sha256)
  .map((row) => ({
    ...row,
    gate0Bytes: gate0RootRows.get(row.file)?.bytes ?? null,
    gate0Sha256: gate0RootRows.get(row.file)?.sha256 ?? null,
  }));
const authorizedChangedReleaseRootFiles = new Set(["index.html", "package-lock.json", "package.json"]);
const authorizedSourceFiles = new Set([
  "src/geometry.ts",
  "src/identity.ts",
  "src/main.ts",
  "src/movement.ts",
  "src/releaseShell.ts",
  "src/style.css",
]);
const authorizedNewSourceFiles = new Set(["src/releaseShell.ts"]);

const buildRun = spawnSync("npm", ["run", "build"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
const build = {
  command: "npm run build",
  passed: buildRun.status === 0,
  exitCode: buildRun.status,
  stdout: buildRun.stdout,
  stderr: buildRun.stderr,
};
const rebuiltDistRows = build.passed
  ? listFiles("dist").map((relative) => ({
      file: path.relative(absolute("dist"), absolute(relative)).split(path.sep).join("/"),
      bytes: fs.statSync(absolute(relative)).size,
      sha256: hashFile(relative),
    }))
  : [];

const baselineClearances = new Map(
  (baseline.escapement.generalForeignSolids ?? []).map((row) => [
    `${row.a}|${row.b}`,
    row.minimumClearance,
  ]),
);
const foreignClearanceRows = (runtime.escapement.generalForeignSolids ?? []).map((row) => {
  const id = `${row.a}|${row.b}`;
  const before = baselineClearances.get(id);
  return {
    id,
    gate0Mm: before,
    rc1Mm: row.minimumClearance,
    deltaMm: row.minimumClearance - before,
    nonDegraded: Number.isFinite(before) && row.minimumClearance >= before,
  };
});

const expectedPairIds = new Set([
  "barrel80-center12",
  "center64-third10",
  "third60-fourth8",
  "fourth56-escape7",
]);
const pairRows = mechanical.pairRows ?? [];
const actualPairIds = new Set(pairRows.map((row) => row.pairId));
const analyticToleranceMm = 5e-7;
const allPairRowsAccepted =
  pairRows.length === expectedPairIds.size &&
  [...expectedPairIds].every((id) => actualPairIds.has(id)) &&
  pairRows.every(
    (row) =>
      row.accepted === true &&
      row.sampleCount >= 8193 &&
      row.collisionSamples === 0 &&
      row.maximumIntersectionAreaMm2 === 0 &&
      row.minimumPositiveClearanceMm > 0 &&
      row.localRefinement?.sampleCount >= 2049 &&
      row.localRefinement?.collisionSamples === 0,
  );
const analyticRadiiExactAndNoGrowth = pairRows.every((row) =>
  [row.radialEnvelope?.primary, row.radialEnvelope?.secondary].every(
    (member) =>
      member &&
      Math.abs(member.currentRenderedMaxRadiusMm - member.tipRadiusMm) <= analyticToleranceMm &&
      member.noRenderedGrowth === true,
  ),
);
const meshAxesRatiosAndPitchExact = pairRows.every(
  (row) =>
    row.moduleMm === 0.145 &&
    Math.abs(row.centerDistanceMm - row.requiredPitchSumMm) <= 2e-15 &&
    row.sourceExact === true &&
    typeof row.ratio === "string",
);

const baselinePackage = normalizeSampling(
  "package",
  baseline.phase5d.geometryAuthority.packageSnapshot,
);
const currentPackage = normalizeSampling(
  "package",
  runtime.phase5d.geometryAuthority.packageSnapshot,
);
const baselineExteriorWithoutIdentity = structuredClone(baseline.authority.exterior);
const currentExteriorWithoutIdentity = structuredClone(runtime.authority.exterior);
delete baselineExteriorWithoutIdentity.identity;
delete currentExteriorWithoutIdentity.identity;

const identity = runtime.authority.exterior.identity;
const identityAuthorityPreserved =
  identity.system === "Identity System 1" &&
  identity.faceUnsigned === true &&
  identity.crown?.host === "ext:crown-cap" &&
  identity.crown?.letters === false &&
  identity.crown?.geometryUnchanged === true &&
  identity.rear?.host === "ext:caseback" &&
  identity.rear?.canonicalCopy === "2.4 Hz · 17 280 · TWO HANDS" &&
  identity.rear?.stepUnmarked === true &&
  identity.rear?.noOverlayMesh === true &&
  identity.rear?.noDepthOverride === true &&
  identity.rear?.geometryUnchangedExceptOptionalUv === true &&
  identity.colorContribution === "none" &&
  identity.proudGeometry === false &&
  exact(normalizeIdentityRefinement(identity), normalizeIdentityRefinement(baseline.authority.exterior.identity));

const requiredRuntimeScenarioIds = ["desktop-dpr1", "mobile-dpr2"];
const requiredRuntimeScenarios = {
  "desktop-dpr1": { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, resized: { cssWidth: 1320, cssHeight: 820, pixelWidth: 1320, pixelHeight: 820 } },
  "mobile-dpr2": { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, resized: { cssWidth: 360, cssHeight: 764, pixelWidth: 720, pixelHeight: 1528 } },
};
const runtimeScenarios = runtimeQuality.scenarios ?? [];
const runtimeScenarioEvidenceAccepted = runtimeScenarios.every((row) => {
  const expected = requiredRuntimeScenarios[row.scenario?.id];
  const canvas = row.interaction?.release?.runtime?.renderer?.canvas;
  const signatures = [
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
  return Boolean(
    expected &&
    row.accepted === true &&
    row.httpStatus === 200 &&
    exact(row.scenario.viewport, expected.viewport) &&
    row.scenario.deviceScaleFactor === expected.deviceScaleFactor &&
    row.firstFrame?.pixels?.nonBackgroundPixels >= 200 &&
    row.cycleAudit?.warmup?.exploded === 1 &&
    row.cycleAudit?.warmup?.assembled === 0 &&
    row.cycleAudit?.warmup?.exactAtZero === true &&
    row.cycleAudit?.count === 10 &&
    row.cycleAudit?.exactCycles === true &&
    row.cycleAudit?.stableRendererAndSceneCounts === true &&
    row.cycleAudit?.rows?.length === 10 &&
    new Set(signatures).size === 1 &&
    cameraDeltas.some((value) => Number.isFinite(value) && value > 1e-6) &&
    row.interaction?.resizeExact === true &&
    exact(row.interaction?.expectedResize, expected.resized) &&
    canvas?.cssWidth === expected.resized.cssWidth &&
    canvas?.cssHeight === expected.resized.cssHeight &&
    canvas?.pixelWidth === expected.resized.pixelWidth &&
    canvas?.pixelHeight === expected.resized.pixelHeight &&
    row.interaction?.pixels?.nonBackgroundPixels >= 200 &&
    row.diagnostics?.pageErrors?.length === 0 &&
    row.diagnostics?.requestFailures?.length === 0 &&
    row.diagnostics?.httpErrors?.length === 0 &&
    row.diagnostics?.unexpectedConsoleErrors?.length === 0 &&
    row.diagnostics?.externalRequests?.length === 0
  );
});
const runtimeQualityEvidenceAccepted =
  runtimeScenarios.length === requiredRuntimeScenarioIds.length &&
  requiredRuntimeScenarioIds.every((id) => runtimeScenarios.some((row) => row.scenario?.id === id)) &&
  runtimeScenarioEvidenceAccepted &&
  runtimeQuality.contextLoss?.accepted === true &&
  runtimeQuality.contextLoss?.supported === true &&
  runtimeQuality.contextLoss?.lost === true &&
  runtimeQuality.contextLoss?.restored === true &&
  runtimeQuality.contextLoss?.subjectPixels >= 100 &&
  runtimeQuality.contextLoss?.externalRequests?.length === 0 &&
  runtimeQuality.contextLoss?.diagnostics?.pageErrors?.length === 0 &&
  runtimeQuality.contextLoss?.diagnostics?.requestFailures?.length === 0 &&
  runtimeQuality.contextLoss?.diagnostics?.httpErrors?.length === 0 &&
  runtimeQuality.contextLoss?.diagnostics?.unexpectedConsoleErrors?.length === 0;

const knownWarning = (message) =>
  message === "THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)";
const checks = {
  gate0AuthorityPreviouslyAccepted:
    gate0.schema === "watch.rc1-gate0-authority.final.v1" &&
    gate0.accepted === true &&
    hashFile(paths.gate0) === gate0AuthorityHashes.report &&
    hashFile(paths.gate0Runtime) === gate0AuthorityHashes.runtime,
  buildAndTypecheckPass: build.passed,
  runtimeApisPresent:
    exact(runtime.api, baseline.api) &&
    Object.keys(runtime.api ?? {}).length > 0 &&
    Object.values(runtime.api).every((value) => value === "function"),
  runtimeHasNoUnexpectedErrors:
    runtime.runtimeDiagnostics.pageErrors.length === 0 &&
    runtime.runtimeDiagnostics.requestFailures.length === 0 &&
    runtime.runtimeDiagnostics.consoleErrors.every(knownWarning),
  authorizedProductSourceScopeOnly:
    currentSourceRows.length === gate0SourceRows.size + authorizedNewSourceFiles.size &&
    currentSourceRows.every(
      (row) => gate0SourceRows.has(row.file) || authorizedNewSourceFiles.has(row.file),
    ) &&
    changedSourceRows.length === authorizedSourceFiles.size &&
    changedSourceRows.every((row) => authorizedSourceFiles.has(row.file)) &&
    changedReleaseRootRows.length === authorizedChangedReleaseRootFiles.size &&
    changedReleaseRootRows.every((row) => authorizedChangedReleaseRootFiles.has(row.file)) &&
    currentGate0RootRows.every(
      (row) =>
        authorizedChangedReleaseRootFiles.has(row.file) ||
        row.sha256 === gate0RootRows.get(row.file)?.sha256,
    ),
  releaseSourceManifestComplete:
    manifestRows.length === rootReleaseFiles.length + sourceFiles.length + scriptFiles.length,
  goingTrainExact: exact(runtime.goingTrain, baseline.goingTrain),
  phase4bAcceptedAndPhysicalExact:
    runtime.phase4b.accepted === true &&
    exact(normalizeSampling("phase4b", runtime.phase4b), normalizeSampling("phase4b", baseline.phase4b)),
  escapementAcceptedAndExactExceptImprovedClearances:
    runtime.escapement.accepted === true &&
    exact(
      normalizeEscapementClearances(runtime.escapement),
      normalizeEscapementClearances(baseline.escapement),
    ),
  noForeignClearanceRegression: foreignClearanceRows.every((row) => row.nonDegraded),
  packagePhysicalAuthorityExact: exact(currentPackage, baselinePackage),
  packageTopBottomExact:
    runtime.authority.exterior.z.packageTop === baseline.authority.exterior.z.packageTop &&
    runtime.authority.exterior.z.packageBottom === baseline.authority.exterior.z.packageBottom,
  structureAndAssemblyExact:
    exact(runtime.authority.structure, baseline.authority.structure) &&
    exact(runtime.authority.assembly, baseline.authority.assembly),
  accommodationDisplayEnclosurePhysicalExact:
    exact(
      normalizeSampling("accommodation", runtime.authority.accommodation),
      normalizeSampling("accommodation", baseline.authority.accommodation),
    ) &&
    exact(
      normalizeSampling("display", runtime.authority.display),
      normalizeSampling("display", baseline.authority.display),
    ) &&
    exact(
      normalizeSampling("enclosure", runtime.authority.enclosure),
      normalizeSampling("enclosure", baseline.authority.enclosure),
    ),
  exteriorGeometryExact: exact(currentExteriorWithoutIdentity, baselineExteriorWithoutIdentity),
  finishReadoutStrapExact:
    exact(runtime.authority.finish, baseline.authority.finish) &&
    exact(runtime.authority.readout, baseline.authority.readout) &&
    exact(runtime.authority.strap, baseline.authority.strap),
  sapphireOwnershipExact: exact(runtime.phase5d.sapphire, baseline.phase5d.sapphire),
  identityAuthorityPreserved,
  annexExplodeZeroObjectsExact: exact(
    normalizeAnnexZero(runtime.annexExplodeZero),
    normalizeAnnexZero(baseline.annexExplodeZero),
  ),
  mechanicalMatrixAccepted:
    mechanical.schema === "rc1-consolidated-going-train-mechanical-v1" &&
    mechanical.accepted === true,
  allFourMeshPairsFullCycleAccepted: allPairRowsAccepted,
  analyticRadiiExactAndNoGrowth,
  meshAxesRatiosAndPitchExact,
  releaseAnnexR1Accepted:
    presentation.schema === "watch-release-annex-r1-v1" &&
    presentation.accepted === true &&
    presentation.passed === true &&
    presentation.visualInspection?.completed === true &&
    presentation.visualInspection?.accepted === true &&
    presentation.visualInspection?.independentRearTranscription === "2.4 Hz · 17 280 · TWO HANDS" &&
    presentation.visualInspection?.front320Read?.hands === "10:10" &&
    presentation.visualInspection?.front320Read?.marker12Distinct === true,
  publicRuntimeQualityAccepted:
    runtimeQuality.schema === "watch.rc1-public-runtime-quality.v1" &&
    runtimeQuality.accepted === true &&
    runtimeQualityEvidenceAccepted &&
    runtimeQuality.testedArtifact?.root === "dist" &&
    Array.isArray(runtimeQuality.testedArtifact?.files) &&
    runtimeQuality.testedArtifact.files.length > 0 &&
    exact(rebuiltDistRows, runtimeQuality.testedArtifact.files),
};
const accepted = Object.values(checks).every(Boolean);

const sourceManifest = {
  schema: "watch.rc1-executable-source-manifest.v1",
  accepted: checks.authorizedProductSourceScopeOnly && checks.releaseSourceManifestComplete,
  release: "RC1",
  authorityBoundary: {
    gate0: paths.gate0,
    productSourceChanges: [...authorizedSourceFiles].sort(),
    releaseShell: "authorized post-Gate0 presentation-only runtime source; no product geometry, material-family, package, or kinematic authority rebase",
    releaseRootChanges: [...authorizedChangedReleaseRootFiles].sort(),
  },
  fileCount: manifestRows.length,
  srcFileCount: sourceFiles.length,
  scriptFileCount: scriptFiles.length,
  aggregateSha256: sha256(manifestText),
  files: manifestRows,
  changedProductSourceRows: changedSourceRows,
  changedReleaseRootRows,
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(absolute(paths.sourceManifest), `${JSON.stringify(sourceManifest, null, 2)}\n`);

const mechanicalArtifacts = listFiles("captures/rc1/mechanical");
const boundArtifactHashes = Object.fromEntries(
  [
    paths.gate0,
    paths.gate0Runtime,
    paths.sourceManifest,
    paths.runtime,
    paths.runtimeQuality,
    paths.mechanical,
    paths.presentation,
    ...mechanicalArtifacts,
  ].map((relative) => [relative, hashFile(relative)]),
);
const report = {
  schema: "watch.rc1-final-regression.v1",
  disposition: accepted ? "RC1 — FINAL AUTHORITY ACCEPTED" : "STOP — RC1 FINAL REGRESSION BLOCKER",
  accepted,
  checks,
  provenance: {
    gate0Report: paths.gate0,
    gate0Runtime: {
      path: paths.gate0Runtime,
      bytes: fs.statSync(requireFile(paths.gate0Runtime)).size,
      sha256: hashFile(paths.gate0Runtime),
    },
    finalRuntime: {
      path: paths.runtime,
      bytes: fs.statSync(requireFile(paths.runtime)).size,
      sha256: hashFile(paths.runtime),
    },
  },
  runtimeSha256: hashFile(paths.runtime),
  source: {
    manifest: paths.sourceManifest,
    manifestSha256: hashFile(paths.sourceManifest),
    changedProductSourceRows: changedSourceRows,
    changedReleaseRootRows,
  },
  mechanics: {
    matrix: paths.mechanical,
    pairRows,
    foreignClearanceRows,
    renderedEnvelopePolicy:
      "analytic pitch/root/tip radii are frozen; negative rendered deltas remove legacy expanding-bevel overshoot and are accepted as no-growth",
  },
  presentation: {
    report: paths.presentation,
    runtimeQuality: paths.runtimeQuality,
    rebuiltDistFiles: rebuiltDistRows,
    authorizedRuntimeMetadata: [
      "release-annex cameras and named lighting profiles",
      "rear decimal same-steel raster refinement metadata",
      "read-only renderer/runtime quality metrics",
    ],
  },
  packageZ: runtime.authority.exterior.z,
  runtimeDiagnostics: runtime.runtimeDiagnostics,
  build,
  boundArtifactHashes,
};
fs.writeFileSync(absolute(paths.final), `${JSON.stringify(report, null, 2)}\n`);

console.log(`${report.disposition}: ${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length} gates`);
console.log(`runtime ${report.provenance.finalRuntime.bytes} bytes ${report.runtimeSha256}`);
console.log(`source manifest ${sourceManifest.fileCount} files ${sourceManifest.aggregateSha256}`);
if (!accepted) {
  for (const [name, value] of Object.entries(checks)) if (!value) console.error(`FAIL ${name}`);
  process.exitCode = 1;
}
