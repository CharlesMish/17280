import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const template = path.join(root, "handoff/going-train-core");
const releaseDir = path.join(root, "release");
const packageName = "watch-going-train-core-v1";
const archiveName = `${packageName}.zip`;
const work = fs.mkdtempSync(path.join(os.tmpdir(), "watch-going-train-core-v1-"));
const stageRoot = path.join(work, "stage");
const packageRoot = path.join(stageRoot, packageName);
const extractRoot = path.join(work, "extract");
const fixedDate = new Date("2026-08-29T00:00:00.000Z");

const sourceFiles = [
  "src/escapementContact.ts",
  "src/geometry.ts",
  "src/materials.ts",
  "src/movement.ts",
  "src/spec.ts",
];
const evidenceFiles = [
  "captures/rc1/mechanical/consolidated-train-matrix.json",
  "captures/rc1/mechanical/a1-barrel80-center12-mesh-report.json",
  "captures/rc1/mechanical/center64-third10-mesh-report.json",
  "captures/rc1/mechanical/third60-fourth8-mesh-report.json",
  "captures/rc1/mechanical/a2-fourth56-escape7-mesh-report.json",
];

const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hashFile = (file) => hash(fs.readFileSync(file));
const write = (file, contents) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
};
const copy = (source, destination) => {
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`missing package input: ${path.relative(root, source)}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
};
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
  return result;
};
const allFiles = (directory) => {
  const rows = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) rows.push(file);
    }
  };
  visit(directory);
  return rows;
};
const payloadRows = (directory, exclusions = new Set()) => allFiles(directory)
  .map((file) => ({
    file: path.relative(directory, file).split(path.sep).join("/"),
    bytes: fs.statSync(file).size,
    sha256: hashFile(file),
  }))
  .filter((row) => !exclusions.has(row.file));

try {
  const authorityManifestPath = path.join(root, "captures/rc1/executable-source-manifest.json");
  const authorityManifest = JSON.parse(fs.readFileSync(authorityManifestPath, "utf8"));
  if (!authorityManifest.accepted) throw new Error("RC1 source authority is not accepted");
  const authorityByFile = new Map(authorityManifest.files.map((row) => [row.file, row]));

  const sourceAuthority = [];
  for (const relative of sourceFiles) {
    const row = authorityByFile.get(relative);
    if (!row) throw new Error(`RC1 manifest does not bind ${relative}`);
    const source = path.join(root, relative);
    const actualSha256 = hashFile(source);
    if (actualSha256 !== row.sha256 || fs.statSync(source).size !== row.bytes) {
      throw new Error(`current ${relative} does not match RC1 authority`);
    }
    sourceAuthority.push({
      packagedAs: `source/${path.basename(relative)}`,
      authorityPath: relative,
      bytes: row.bytes,
      sha256: row.sha256,
    });
  }

  const matrixPath = path.join(root, evidenceFiles[0]);
  const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  if (!matrix.accepted || matrix.pairRows?.length !== 4 || matrix.pairRows.some((row) => !row.accepted)) {
    throw new Error("RC1 consolidated going-train matrix is not fully accepted");
  }

  fs.mkdirSync(stageRoot, { recursive: true });
  fs.cpSync(template, packageRoot, { recursive: true, force: true });
  for (const relative of sourceFiles) {
    copy(path.join(root, relative), path.join(packageRoot, "source", path.basename(relative)));
  }
  for (const relative of evidenceFiles) {
    copy(path.join(root, relative), path.join(packageRoot, "evidence/mechanical", path.basename(relative)));
  }
  copy(path.join(root, "PROJECT_LICENSE.txt"), path.join(packageRoot, "PROJECT_RIGHTS.txt"));
  copy(path.join(root, "THIRD_PARTY_NOTICES.txt"), path.join(packageRoot, "THIRD_PARTY_NOTICES.txt"));

  write(path.join(packageRoot, "SOURCE_AUTHORITY.json"), `${JSON.stringify({
    schema: "watch.going-train-core-source-authority.v1",
    package: packageName,
    mechanicalAuthority: "RC1",
    rc1Manifest: {
      path: "captures/rc1/executable-source-manifest.json",
      sha256: hashFile(authorityManifestPath),
      aggregateSha256: authorityManifest.aggregateSha256,
    },
    exactRc1Files: sourceAuthority,
    addedHandoffFiles: ["source/goingTrainCore.ts", "source/index.ts"],
    note: "Added handoff helpers select exact RC1 objects; they are not themselves RC1 authority files.",
  }, null, 2)}\n`);

  const nodeModulesLink = path.join(packageRoot, "node_modules");
  fs.symlinkSync(path.join(root, "node_modules"), nodeModulesLink, "dir");
  const bundledExporter = path.join(packageRoot, ".export-glb.mjs");
  await build({
    entryPoints: [path.join(packageRoot, "tools/export-glb.ts")],
    outfile: bundledExporter,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    packages: "external",
    logLevel: "silent",
  });
  fs.mkdirSync(path.join(packageRoot, "assets"), { recursive: true });
  run("node", [
    bundledExporter,
    path.join(packageRoot, "assets/going-train-core.glb"),
    path.join(packageRoot, "assets/going-train-core-report.json"),
  ]);
  fs.unlinkSync(bundledExporter);

  const assetReport = JSON.parse(fs.readFileSync(path.join(packageRoot, "assets/going-train-core-report.json"), "utf8"));
  const partAxesMm = Object.fromEntries([
    ["barrel", matrix.pairRows[0].axes.primary],
    ["center", matrix.pairRows[0].axes.secondary],
    ["third", matrix.pairRows[1].axes.secondary],
    ["fourth", matrix.pairRows[2].axes.secondary],
    ["escape", matrix.pairRows[3].axes.secondary],
  ]);
  const pairRows = matrix.pairRows.map((row) => ({
    pairId: row.pairId,
    participants: [row.primary, row.secondary],
    toothCounts: row.toothCounts,
    moduleMm: row.moduleMm,
    axesMm: row.axes,
    centerDistanceMm: row.centerDistanceMm,
    requiredPitchSumMm: row.requiredPitchSumMm,
    axialOverlapMm: row.axialOverlapMm,
    ratio: row.ratio,
    localClockingDeg: row.localClockingDeg,
    fullCycle: {
      sampleCount: row.sampleCount,
      collisionSamples: row.collisionSamples,
      maximumIntersectionAreaMm2: row.maximumIntersectionAreaMm2,
      minimumPositiveClearanceMm: row.minimumPositiveClearanceMm,
    },
    localRefinement: row.localRefinement,
    accepted: row.accepted,
  }));
  write(path.join(packageRoot, "CORE_SPEC.json"), `${JSON.stringify({
    schema: "watch.going-train-core-spec.v1",
    package: packageName,
    authority: "RC1",
    coordinateSystem: {
      sourceUnit: "millimetre",
      plane: "XY",
      depthAxis: "+Z toward dial",
      axes: "+X = 3 o'clock; +Y = 12 o'clock",
    },
    includedCompoundArbors: ["barrel", "center", "third", "fourth", "escape"],
    excludedAssemblies: ["pallet", "balance", "hairspring", "plates", "bridges", "case", "display", "strap"],
    partAxesMm,
    pairs: pairRows,
    policy: matrix.policy,
    asset: assetReport,
  }, null, 2)}\n`);

  run(path.join(root, "node_modules/.bin/tsc"), ["--noEmit", "-p", path.join(packageRoot, "tsconfig.json")]);
  const validation = run("node", [path.join(packageRoot, "scripts/validate-glb.mjs")]);
  process.stdout.write(validation.stdout);
  fs.unlinkSync(nodeModulesLink);

  const preManifestRows = payloadRows(packageRoot, new Set(["MANIFEST.json", "SHA256SUMS.txt"]));
  write(path.join(packageRoot, "MANIFEST.json"), `${JSON.stringify({
    schema: "watch.going-train-core-package-manifest.v1",
    package: packageName,
    generatedUtc: fixedDate.toISOString(),
    authority: "RC1 going-train mechanical closure",
    fileCount: preManifestRows.length,
    files: preManifestRows,
  }, null, 2)}\n`);
  const checksumRows = payloadRows(packageRoot, new Set(["SHA256SUMS.txt"]));
  write(
    path.join(packageRoot, "SHA256SUMS.txt"),
    `${checksumRows.map((row) => `${row.sha256}  ${row.file}`).join("\n")}\n`,
  );

  for (const file of allFiles(packageRoot)) fs.utimesSync(file, fixedDate, fixedDate);
  const relativeFiles = allFiles(packageRoot).map((file) => path.relative(stageRoot, file));
  const firstArchive = path.join(work, archiveName);
  const secondArchive = path.join(work, `second-${archiveName}`);
  run("zip", ["-X", "-q", firstArchive, ...relativeFiles], { cwd: stageRoot });
  run("zip", ["-X", "-q", secondArchive, ...relativeFiles], { cwd: stageRoot });
  if (hashFile(firstArchive) !== hashFile(secondArchive)) throw new Error("going-train archive is not reproducible");

  fs.mkdirSync(extractRoot, { recursive: true });
  run("unzip", ["-q", firstArchive, "-d", extractRoot]);
  const extractedPackage = path.join(extractRoot, packageName);
  const checksumText = fs.readFileSync(path.join(extractedPackage, "SHA256SUMS.txt"), "utf8").trim();
  for (const line of checksumText.split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    if (!match) throw new Error(`invalid internal checksum row: ${line}`);
    const file = path.join(extractedPackage, match[2]);
    if (!fs.existsSync(file) || hashFile(file) !== match[1]) throw new Error(`extracted checksum mismatch: ${match[2]}`);
  }

  fs.mkdirSync(releaseDir, { recursive: true });
  const target = path.join(releaseDir, archiveName);
  const archiveSha256 = hashFile(firstArchive);
  if (fs.existsSync(target) && hashFile(target) !== archiveSha256) {
    throw new Error(`refusing to overwrite different existing ${archiveName}`);
  }
  if (!fs.existsSync(target)) fs.copyFileSync(firstArchive, target);
  const checksumTarget = path.join(releaseDir, `${archiveName}.sha256`);
  const publishedChecksum = `${archiveSha256}  ${archiveName}\n`;
  if (fs.existsSync(checksumTarget) && fs.readFileSync(checksumTarget, "utf8") !== publishedChecksum) {
    throw new Error(`refusing to overwrite different existing ${path.basename(checksumTarget)}`);
  }
  if (!fs.existsSync(checksumTarget)) fs.writeFileSync(checksumTarget, publishedChecksum);

  console.log(JSON.stringify({
    accepted: true,
    package: path.relative(root, target),
    bytes: fs.statSync(target).size,
    sha256: archiveSha256,
    checksum: path.relative(root, checksumTarget),
    exactRc1SourceFiles: sourceAuthority.length,
    certifiedMeshPairs: pairRows.length,
    asset: assetReport,
  }, null, 2));
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
