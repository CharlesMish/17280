import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageName = "watch-going-train-core-center-web-preview";
const sourceFiles = ["escapementContact", "geometry", "materials", "movement", "spec", "centerWebExperiment"].map(name => `src/${name}.ts`);
const pairIds = ["barrel80-center12", "center64-third10", "third60-fourth8", "fourth56-escape7"];
const requiredChecks = ["onlyCenterWheelGeometryChanged", "pivotsUnchanged", "kinematicsUnchanged", "displayDriveUnchanged", "depthIntervalsUnchanged", "sweptClearanceAccepted", "baselineRestored"];
const hash = data => crypto.createHash("sha256").update(data).digest("hex");
const hashFile = file => hash(fs.readFileSync(file));
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
const json = (file, data) => write(file, `${JSON.stringify(data, null, 2)}\n`);
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message ?? `exit ${result.status}`}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return result.stdout;
};
const copy = (source, destination) => { fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination); };
const allFiles = directory => fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? allFiles(file) : entry.isFile() ? [file] : [];
});
const inventory = directory => allFiles(directory).map(file => ({ file: path.relative(directory, file).split(path.sep).join("/"), bytes: fs.statSync(file).size, sha256: hashFile(file) }));

const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const option = process.argv[i];
  if (!["--evidence", "--output"].includes(option) || !process.argv[i + 1] || options[option]) throw new Error("usage: node scripts/package-train-experiment.mjs --evidence <fresh-manifest.json> --output <new-output-directory>");
  options[option] = process.argv[i + 1];
}
if (!options["--evidence"] || !options["--output"]) throw new Error("both --evidence and --output are required; V1 release paths are never defaults");
const evidencePath = path.resolve(options["--evidence"]);
const evidenceDir = path.dirname(evidencePath);
const outputDir = path.resolve(options["--output"]);
// Resolve the deepest existing ancestor, so symlinks cannot route output into V1.
const physicalPath = file => {
  if (fs.existsSync(file)) return fs.realpathSync(file);
  return path.join(physicalPath(path.dirname(file)), path.basename(file));
};
const within = (file, directory) => file === directory || file.startsWith(`${directory}${path.sep}`);
for (const protectedDirectory of ["release", "handoff", "captures/rc1"]) {
  const directory = physicalPath(path.join(root, protectedDirectory));
  if (within(physicalPath(outputDir), directory)) throw new Error(`refusing to publish experimental files into protected ${protectedDirectory}`);
  if (within(physicalPath(evidencePath), directory)) throw new Error(`fresh experiment evidence must not come from ${protectedDirectory}`);
}
const archiveName = `${packageName}.zip`;
for (const name of [packageName, archiveName, `${archiveName}.sha256`]) {
  if (fs.existsSync(path.join(outputDir, name))) throw new Error(`refusing to overwrite existing preview artifact: ${name}`);
}

const evidence = read(evidencePath);
if (evidence.schema !== "watch.train-design-evidence.v1" || evidence.experiment !== "center-web" || evidence.accepted !== true) throw new Error("input must be accepted, fresh center-web experiment evidence");
if (!/^[0-9a-f]{7,40}$/.test(evidence.checkpointCommit ?? "")) throw new Error("evidence must identify the frozen checkpoint commit");
const checkpointCommit = run("git", ["rev-parse", `${evidence.checkpointCommit}^{commit}`]).trim();
if (!/^[0-9a-f]{64}$/.test(evidence.candidateGeometrySha256 ?? "")) throw new Error("missing SHA-256 for audited center-wheel geometry");
for (const name of requiredChecks) {
  if (evidence.checks?.[name] !== true) throw new Error(`required experiment check did not pass: ${name}`);
}
const verifyRow = (row, base) => {
  if (!row || typeof row.file !== "string" || !Number.isInteger(row.bytes) || !/^[0-9a-f]{64}$/.test(row.sha256 ?? "")) throw new Error("invalid evidence/source file inventory row");
  const file = path.resolve(base, row.file);
  if (!fs.existsSync(file) || fs.statSync(file).size !== row.bytes || hashFile(file) !== row.sha256) throw new Error(`stale or missing evidence/source: ${row.file}`);
  return file;
};
const sourceByFile = new Map((evidence.sourceFiles ?? []).map(row => [row.file, row]));
for (const file of sourceFiles) verifyRow(sourceByFile.get(file), root);
const currentSources = sourceFiles.map(file => sourceByFile.get(file));

if (!Array.isArray(evidence.meshReports) || evidence.meshReports.length !== 4) throw new Error("all four fresh mesh sweep reports are required");
const meshInputs = evidence.meshReports.map(row => {
  const file = verifyRow(row, evidenceDir);
  const report = read(file);
  if (!pairIds.includes(report.pairId)) throw new Error(`unexpected mesh pair in ${row.file}`);
  const actual = report.experimentEvidence?.actual ?? report.experiment;
  if (report.experimentEvidence?.requested !== "center-web" || actual?.name !== "center-web") throw new Error(`report did not audit the active center-web experiment: ${row.file}`);
  const centerHash = report.experimentEvidence?.renderedGeometry?.center?.geometrySha256 ?? report.candidateGeometrySha256;
  if (centerHash !== evidence.candidateGeometrySha256) throw new Error(`report audited different center-wheel geometry: ${row.file}`);
  const reportSources = new Map((report.experimentEvidence?.sourceFiles ?? []).map(source => [source.file, source.sha256]));
  for (const source of currentSources) {
    if (reportSources.get(source.file) !== source.sha256) throw new Error(`mesh report is not bound to current ${source.file}: ${row.file}`);
  }
  for (const [name, minimumSamples] of [["result", 8193], ["localRefinement", 2049]]) {
    const result = report[name];
    if (!(result?.sampleCount >= minimumSamples && result.collisionSamples === 0 && result.maximumIntersectionAreaMm2 === 0 && result.minimumPositiveClearanceMm > 0)) throw new Error(`mesh sweep failed or incomplete ${name}: ${row.file}`);
  }
  if (!(report.geometry?.axialOverlapMm > 0) || Math.abs(report.geometry.centerDistanceMm - report.geometry.requiredPitchSumMm) > 1e-9 || report.invariance?.moduleMm !== 0.145 || report.phaseOverrideDeg !== 0) throw new Error(`mesh datums differ from the frozen train: ${row.file}`);
  return { row, file, report };
});
if (new Set(meshInputs.map(input => input.report.pairId)).size !== 4) throw new Error("duplicate mesh reports cannot substitute for missing pairs");
if (!evidence.supportingReports?.length) throw new Error("fresh invariant and swept-clearance supporting reports are required");
const supportingInputs = evidence.supportingReports.map(row => ({ row, file: verifyRow(row, evidenceDir) }));
const clearanceReports = supportingInputs.map(input => read(input.file)).filter(report => report.schema === "watch.train-design-clearance.v1");
if (clearanceReports.length !== 1) throw new Error("one fresh foreign-solid/invariant report must support the package");
const clearance = clearanceReports[0];
if (clearance.experiment !== "center-web" || clearance.accepted !== true || clearance.candidateGeometrySha256 !== evidence.candidateGeometrySha256) throw new Error("foreign-solid evidence does not accept the packaged center-web geometry");
for (const name of requiredChecks) {
  if (clearance.checks?.[name] !== true) throw new Error(`foreign-solid/invariant report did not pass: ${name}`);
}
const clearanceSources = new Map((clearance.sourceFiles ?? []).map(source => [source.file, source.sha256]));
for (const source of currentSources) {
  if (clearanceSources.get(source.file) !== source.sha256) throw new Error(`foreign-solid evidence is not bound to current ${source.file}`);
}
if (!clearance.rows?.length || clearance.rows.some(row => row.accepted !== true) || clearance.checks.changedWebClearsThirdPinion !== true) throw new Error("foreign-solid evidence contains a failed or missing moving-clearance check");

const baselineSources = sourceFiles.filter(file => file !== "src/centerWebExperiment.ts").map(file => {
  const before = run("git", ["show", `${checkpointCommit}:${file}`]);
  const current = fs.readFileSync(path.join(root, file), "utf8");
  if (before !== current && file !== "src/geometry.ts") throw new Error(`unexpected procedural change outside center-web geometry: ${file}`);
  return { file, checkpointSha256: hash(before), currentSha256: hash(current), changed: before !== current };
});
const v1ChecksumPath = path.join(root, "release/watch-going-train-core-v1.zip.sha256");
const v1ArchivePath = path.join(root, "release/watch-going-train-core-v1.zip");
const v1ChecksumBefore = fs.readFileSync(v1ChecksumPath, "utf8");
const v1ArchiveBefore = hashFile(v1ArchivePath);
if (!v1ChecksumBefore.startsWith(`${v1ArchiveBefore}  `)) throw new Error("existing V1 archive/checksum mismatch");
const checkpointRecord = JSON.parse(run("git", ["show", `${checkpointCommit}:review/checkpoints/graphite-sapphire/checkpoint.json`]));
if (checkpointRecord.coreV1Sha256 !== v1ArchiveBefore) throw new Error("V1 archive differs from the frozen GitHub checkpoint");

const work = fs.mkdtempSync(path.join(os.tmpdir(), "watch-train-preview-"));
try {
  const stage = path.join(work, "stage");
  const packageRoot = path.join(stage, packageName);
  const template = path.join(root, "handoff/going-train-core-v1");
  const overlay = path.join(root, "experiment-package");
  for (const relative of ["tsconfig.json", "scripts/validate-glb.mjs"]) copy(path.join(template, relative), path.join(packageRoot, relative));
  for (const relative of ["source/index.ts", "source/goingTrainPreview.ts", "tools/export-glb.ts"]) copy(path.join(overlay, relative), path.join(packageRoot, relative));
  for (const file of sourceFiles) copy(path.join(root, file), path.join(packageRoot, "source", path.basename(file)));
  copy(path.join(root, "PROJECT_LICENSE.txt"), path.join(packageRoot, "PROJECT_RIGHTS.txt"));
  copy(path.join(root, "THIRD_PARTY_NOTICES.txt"), path.join(packageRoot, "THIRD_PARTY_NOTICES.txt"));
  const packageJson = read(path.join(template, "package.json"));
  packageJson.name = packageName;
  packageJson.version = "0.1.0-preview";
  json(path.join(packageRoot, "package.json"), packageJson);

  const evidenceRows = [];
  for (const [i, input] of [...meshInputs, ...supportingInputs].entries()) {
    const relative = `evidence/${String(i + 1).padStart(2, "0")}-${path.basename(input.file)}`;
    copy(input.file, path.join(packageRoot, relative));
    evidenceRows.push({ ...input.row, packagedAs: relative });
  }
  copy(evidencePath, path.join(packageRoot, "evidence/input-manifest.json"));
  json(path.join(packageRoot, "SOURCE_PROVENANCE.json"), {
    schema: "watch.going-train-core-preview-provenance.v1", package: packageName,
    status: "experimental preview; changed bytes are not RC1 authority", checkpointCommit,
    sourceFiles: currentSources.map(row => ({ ...row, packagedAs: `source/${path.basename(row.file)}` })),
    inputManifestSha256: hashFile(evidencePath), candidateGeometrySha256: evidence.candidateGeometrySha256,
    frozenV1: { archive: path.basename(v1ArchivePath), sha256: v1ArchiveBefore },
    baselineSources, evidenceFiles: evidenceRows,
  });
  const diff = run("git", ["diff", "--no-ext-diff", "--no-color", checkpointCommit, "--", "src/geometry.ts"]);
  const helper = fs.readFileSync(path.join(root, "src/centerWebExperiment.ts"), "utf8").trimEnd().split("\n");
  write(path.join(packageRoot, "integration/center-web.patch"), `${diff}diff --git a/src/centerWebExperiment.ts b/src/centerWebExperiment.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/centerWebExperiment.ts\n@@ -0,0 +1,${helper.length} @@\n${helper.map(line => `+${line}`).join("\n")}\n`);
  const patchCheckRoot = path.join(work, "patch-check");
  write(path.join(patchCheckRoot, "src/geometry.ts"), run("git", ["show", `${checkpointCommit}:src/geometry.ts`]));
  run("git", ["apply", "--check", path.join(packageRoot, "integration/center-web.patch")], { cwd: patchCheckRoot });
  copy(path.join(overlay, "INTEGRATION.md"), path.join(packageRoot, "INTEGRATION.md"));
  copy(path.join(overlay, "PACKAGE_README.md"), path.join(packageRoot, "README.md"));

  fs.symlinkSync(path.join(root, "node_modules"), path.join(packageRoot, "node_modules"), "dir");
  const exporter = path.join(packageRoot, ".export-glb.mjs");
  await build({ entryPoints: [path.join(packageRoot, "tools/export-glb.ts")], outfile: exporter, bundle: true, platform: "node", format: "esm", target: "node22", packages: "external", logLevel: "silent" });
  fs.mkdirSync(path.join(packageRoot, "assets"), { recursive: true });
  run("node", [exporter, path.join(packageRoot, "assets/going-train-core.glb"), path.join(packageRoot, "assets/going-train-core-report.json"), evidence.candidateGeometrySha256]);
  fs.unlinkSync(exporter);
  const asset = read(path.join(packageRoot, "assets/going-train-core-report.json"));
  json(path.join(packageRoot, "PIVOTS.json"), { schema: "watch.going-train-pivots.v1", sourceUnit: "millimetre", assetWorldUnit: "metre", rootScale: 0.001, pivots: asset.pivots });
  json(path.join(packageRoot, "CORE_SPEC.json"), {
    schema: "watch.going-train-core-preview-spec.v1", package: packageName,
    status: "experimental preview; fresh center-web evidence; not RC1", checkpointCommit,
    coordinateSystem: { sourceUnit: "millimetre", plane: "XY", depthAxis: "+Z toward dial", axes: "+X = 3 o'clock; +Y = 12 o'clock" },
    changedSolid: "center:wheel interior web/windows only", candidateGeometrySha256: evidence.candidateGeometrySha256,
    includedCompoundArbors: ["barrel", "center", "third", "fourth", "escape"],
    excludedAssemblies: ["pallet", "balance", "hairspring", "plates", "bridges", "case", "display", "strap"],
    pivots: asset.pivots, experimentReport: asset.experimentReport, checks: evidence.checks,
    pairs: pairIds.map(id => {
      const { report } = meshInputs.find(input => input.report.pairId === id);
      return { pairId: id, participants: { primary: report.participants.primary.name, secondary: report.participants.secondary.name }, ...report.invariance, geometry: report.geometry, fullCycle: report.result, localRefinement: report.localRefinement };
    }),
    asset,
  });
  run(path.join(root, "node_modules/.bin/tsc"), ["--noEmit", "-p", path.join(packageRoot, "tsconfig.json")]);
  const assetValidation = JSON.parse(run("node", [path.join(packageRoot, "scripts/validate-glb.mjs")]));
  json(path.join(packageRoot, "VALIDATION.json"), { accepted: true, sourceTypecheck: true, assetValidation, focusedPatchAppliesToCheckpoint: true, candidateGeometryMatchesFreshEvidence: asset.candidateGeometrySha256 === evidence.candidateGeometrySha256 });
  fs.unlinkSync(path.join(packageRoot, "node_modules"));
  json(path.join(packageRoot, "MANIFEST.json"), { schema: "watch.going-train-core-preview-manifest.v1", package: packageName, authority: "experimental preview only", files: inventory(packageRoot) });
  write(path.join(packageRoot, "SHA256SUMS.txt"), `${inventory(packageRoot).map(row => `${row.sha256}  ${row.file}`).join("\n")}\n`);

  const fixedDate = new Date("2026-09-05T00:00:00.000Z");
  for (const file of allFiles(packageRoot)) fs.utimesSync(file, fixedDate, fixedDate);
  const paths = allFiles(packageRoot).map(file => path.relative(stage, file));
  const archive = path.join(work, archiveName);
  const secondArchive = path.join(work, `second-${archiveName}`);
  run("zip", ["-X", "-q", archive, ...paths], { cwd: stage });
  run("zip", ["-X", "-q", secondArchive, ...paths], { cwd: stage });
  if (hashFile(archive) !== hashFile(secondArchive)) throw new Error("preview archive is not reproducible");
  const extractRoot = path.join(work, "extract");
  fs.mkdirSync(extractRoot);
  run("unzip", ["-q", archive, "-d", extractRoot]);
  const extracted = path.join(extractRoot, packageName);
  for (const line of fs.readFileSync(path.join(extracted, "SHA256SUMS.txt"), "utf8").trim().split("\n")) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!match || hashFile(path.join(extracted, match[2])) !== match[1]) throw new Error("extracted package checksum failure");
  }
  if (hashFile(v1ArchivePath) !== v1ArchiveBefore || fs.readFileSync(v1ChecksumPath, "utf8") !== v1ChecksumBefore) throw new Error("V1 archive changed during packaging");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.cpSync(packageRoot, path.join(outputDir, packageName), { recursive: true, errorOnExist: true, force: false });
  copy(archive, path.join(outputDir, archiveName));
  const sha256 = hashFile(archive);
  write(path.join(outputDir, `${archiveName}.sha256`), `${sha256}  ${archiveName}\n`);
  console.log(JSON.stringify({ accepted: true, authority: "experimental preview only", directory: path.join(outputDir, packageName), archive: path.join(outputDir, archiveName), sha256, candidateGeometrySha256: evidence.candidateGeometrySha256, meshPairs: meshInputs.length, v1ArchiveUnchanged: true }, null, 2));
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
