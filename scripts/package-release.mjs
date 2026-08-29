import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(root, "release");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "watch-release-rc1-"));
const stageRoot = path.join(work, "stage");
const extractRoot = path.join(work, "extract");
const staticStage = path.join(stageRoot, "watch-static-site-rc1");
const sourceStage = path.join(stageRoot, "watch-source-handoff-rc1");
const evidenceStage = path.join(stageRoot, "watch-release-evidence-rc1");
const fixedDate = new Date("2026-08-28T00:00:00.000Z");

if (process.env.WATCH_SKIP_CLEANROOM === "1") {
  throw new Error("RC1 publishing cannot skip the clean-room source verification");
}

const authorityPaths = {
  final: "captures/rc1/final-regression-report.json",
  source: "captures/rc1/executable-source-manifest.json",
  runtime: "captures/rc1/executable-runtime-reference.json",
  runtimeQuality: "captures/rc1/public-runtime-quality.json",
  mechanical: "captures/rc1/mechanical/consolidated-train-matrix.json",
  presentation: "captures/release-annex-r1/report.json",
  poster: "captures/release-annex-r1/final-hero.png",
};

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hashFile = (file) => sha256(fs.readFileSync(file));
const requireFile = (relative) => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Required release input is missing: ${relative}`);
  }
  return file;
};
const requireDirectory = (relative) => {
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error(`Required release directory is missing: ${relative}`);
  }
  return directory;
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
const releaseToolchain = {
  node: process.version,
  npm: run("npm", ["--version"]).stdout.trim(),
  zip: run("zip", ["-v"]).stdout.split(/\r?\n/).find((line) => /This is Zip/i.test(line))?.trim() ?? "unknown",
  unzip: run("unzip", ["-v"]).stdout.split(/\r?\n/, 1)[0].trim(),
};
const requiredBrowserMatrix = ["chromium", "firefox", "webkit"];
const write = (file, contents, mode = 0o644) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  fs.chmodSync(file, mode);
};
const copyFile = (relative, destination, mode = null) => {
  const source = requireFile(relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  if (mode !== null) fs.chmodSync(destination, mode);
};
const copyTree = (relative, destination) => {
  const source = requireDirectory(relative);
  fs.cpSync(source, destination, { recursive: true, force: true });
};
const copyPresentationEvidence = (destination) => {
  const reportRelative = authorityPaths.presentation;
  const report = JSON.parse(fs.readFileSync(requireFile(reportRelative), "utf8"));
  copyFile(reportRelative, path.join(destination, "report.json"));
  for (const row of report.images ?? []) {
    if (!row.file || path.isAbsolute(row.file) || row.file.split(/[\\/]/).includes("..")) {
      throw new Error(`Unsafe Release Annex R1 image path: ${row.file}`);
    }
    copyFile(`captures/release-annex-r1/${row.file}`, path.join(destination, row.file));
  }
  const rasterFiles = [
    "after-bump-glyph-strip-4x.png",
    "after-bump-map.png",
    "after-roughness-glyph-strip-4x.png",
    "after-roughness-map.png",
    "before-bump-glyph-strip-4x.png",
    "before-bump-map.png",
    "before-roughness-glyph-strip-4x.png",
    "before-roughness-map.png",
    "report.json",
  ];
  for (const file of rasterFiles) {
    copyFile(
      `captures/release-annex-r1/b1-raster-evidence/${file}`,
      path.join(destination, "b1-raster-evidence", file),
    );
  }
};
const copyBoundRc1Evidence = (destinationRoot) => {
  const finalReport = JSON.parse(fs.readFileSync(requireFile(authorityPaths.final), "utf8"));
  const bound = finalReport.boundArtifactHashes;
  if (!bound || Object.keys(bound).length === 0) throw new Error("Final report binds no RC1 evidence");
  const allowed = new Set([authorityPaths.final]);
  for (const relative of Object.keys(bound)) {
    if (relative.startsWith("captures/rc1/") || relative.startsWith("captures/rc1-gate0-independent/")) {
      allowed.add(relative);
    }
  }
  for (const relative of [...allowed].sort()) {
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) {
      throw new Error(`Unsafe bound RC1 evidence path: ${relative}`);
    }
    copyFile(relative, path.join(destinationRoot, relative));
  }
};
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
const normalizeTree = (directory) => {
  const entries = [];
  const visit = (current) => {
    entries.push(current);
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) entries.push(target);
    }
  };
  visit(directory);
  for (const file of entries.filter((entry) => fs.statSync(entry).isFile())) {
    fs.chmodSync(file, file.endsWith(".sh") ? 0o755 : 0o644);
    fs.utimesSync(file, fixedDate, fixedDate);
  }
  for (const directoryEntry of entries.filter((entry) => fs.statSync(entry).isDirectory()).reverse()) {
    fs.chmodSync(directoryEntry, 0o755);
    fs.utimesSync(directoryEntry, fixedDate, fixedDate);
  }
};
const addStageManifest = (directory, kind, authority) => {
  const rows = allFiles(directory)
    .filter((file) => !["release-manifest.json", "SHA256SUMS.txt"].includes(path.basename(file)))
    .map((file) => ({
      file: path.relative(directory, file).split(path.sep).join("/"),
      bytes: fs.statSync(file).size,
      sha256: hashFile(file),
    }));
  const artifactAggregateSha256 = sha256(rows.map((row) => `${row.sha256}  ${row.file}\n`).join(""));
  write(path.join(directory, "release-manifest.json"), `${JSON.stringify({
    schema: "watch.release-manifest.v1",
    release: "RC1",
    kind,
    generatedUtc: "2026-08-28T00:00:00.000Z",
    sourceDateEpoch: Math.floor(fixedDate.getTime() / 1000),
    nodeRange: "^20.19.0 || >=22.12.0",
    toolchain: releaseToolchain,
    requiredBrowserMatrix,
    artifactAggregateSha256,
    authority,
    evidenceReferences: {
      finalRegression: authorityPaths.final,
      runtimeReference: authorityPaths.runtime,
      runtimeQuality: authorityPaths.runtimeQuality,
      mechanicalMatrix: authorityPaths.mechanical,
      presentationReport: authorityPaths.presentation,
    },
    manifestSelfExcluded: true,
    files: rows,
  }, null, 2)}\n`);
  const checksums = allFiles(directory)
    .filter((file) => path.basename(file) !== "SHA256SUMS.txt")
    .map((file) => `${hashFile(file)}  ${path.relative(directory, file).split(path.sep).join("/")}`);
  write(path.join(directory, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`);
};
const zipOnce = (stage, output) => {
  normalizeTree(stage);
  const parent = path.dirname(stage);
  const entries = allFiles(stage)
    .map((file) => path.relative(parent, file).split(path.sep).join("/"))
    .sort();
  const result = spawnSync("zip", ["-X", "-q", "-9", output, ...entries], {
    cwd: parent,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, TZ: "UTC", SOURCE_DATE_EPOCH: String(Math.floor(fixedDate.getTime() / 1000)) },
  });
  if (result.status !== 0) throw new Error(`zip failed: ${result.stderr ?? result.stdout}`);
};
const verifyArchiveEntries = (archive) => {
  run("unzip", ["-tqq", archive]);
  const listed = run("unzip", ["-Z1", archive]).stdout.trim().split(/\r?\n/).filter(Boolean);
  for (const entry of listed) {
    const normalized = entry.replaceAll("\\", "/");
    if (normalized.startsWith("/") || normalized.split("/").includes("..")) {
      throw new Error(`Unsafe archive entry: ${entry}`);
    }
  }
};
const verifyExtractedManifest = (directory) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "release-manifest.json"), "utf8"));
  if (manifest.schema !== "watch.release-manifest.v1" || manifest.release !== "RC1") {
    throw new Error(`Unexpected extracted release-manifest schema: ${directory}`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error(`Extracted release manifest has no files: ${directory}`);
  }
  const expectedFiles = new Set(["release-manifest.json", "SHA256SUMS.txt"]);
  for (const row of manifest.files) {
    if (!row.file || expectedFiles.has(row.file) || !Number.isFinite(row.bytes) || !/^[0-9a-f]{64}$/.test(row.sha256 ?? "")) {
      throw new Error(`Malformed or duplicate extracted manifest row: ${String(row.file)}`);
    }
    expectedFiles.add(row.file);
    const file = path.resolve(directory, row.file);
    if (file !== directory && !file.startsWith(`${directory}${path.sep}`)) throw new Error(`Unsafe manifest path ${row.file}`);
    if (!fs.existsSync(file) || fs.statSync(file).size !== row.bytes || hashFile(file) !== row.sha256) {
      throw new Error(`Extracted manifest mismatch: ${row.file}`);
    }
  }
  const actualFiles = allFiles(directory).map((file) => path.relative(directory, file).split(path.sep).join("/"));
  if (actualFiles.some((file) => !expectedFiles.has(file)) || expectedFiles.size !== actualFiles.length) {
    throw new Error(`Extracted archive file-set mismatch: ${directory}`);
  }
  const checksumFile = path.join(directory, "SHA256SUMS.txt");
  if (!fs.existsSync(checksumFile)) throw new Error(`Extracted archive lacks SHA256SUMS.txt: ${directory}`);
  const checksumRows = fs.readFileSync(checksumFile, "utf8").trim().split(/\r?\n/).filter(Boolean);
  const checksumPaths = new Set();
  for (const line of checksumRows) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`Malformed internal checksum row: ${line}`);
    if (checksumPaths.has(match[2])) throw new Error(`Duplicate internal checksum row: ${match[2]}`);
    checksumPaths.add(match[2]);
    const file = path.resolve(directory, match[2]);
    if (file !== directory && !file.startsWith(`${directory}${path.sep}`)) throw new Error(`Unsafe checksum path ${match[2]}`);
    if (!fs.existsSync(file) || hashFile(file) !== match[1]) throw new Error(`Internal checksum mismatch: ${match[2]}`);
  }
  const expectedChecksumPaths = actualFiles.filter((file) => file !== "SHA256SUMS.txt");
  if (checksumPaths.size !== expectedChecksumPaths.length || expectedChecksumPaths.some((file) => !checksumPaths.has(file))) {
    throw new Error(`Internal checksum file-set mismatch: ${directory}`);
  }
  const aggregate = manifest.files.map((row) => `${row.sha256}  ${row.file}\n`).join("");
  if (manifest.artifactAggregateSha256 !== sha256(aggregate)) {
    throw new Error(`Extracted artifact aggregate mismatch: ${directory}`);
  }
};
const reproducibleArchive = (stage, baseName) => {
  const first = path.join(work, `${baseName}.first.zip`);
  const second = path.join(work, `${baseName}.second.zip`);
  zipOnce(stage, first);
  zipOnce(stage, second);
  if (hashFile(first) !== hashFile(second)) throw new Error(`Archive is not reproducible: ${baseName}`);
  verifyArchiveEntries(first);
  return first;
};
const publishWithoutOverwrite = (source, filename) => {
  fs.mkdirSync(releaseDir, { recursive: true });
  const target = path.join(releaseDir, filename);
  if (fs.existsSync(target)) {
    if (hashFile(target) !== hashFile(source)) {
      throw new Error(`Refusing to overwrite a different existing RC1 artifact: ${filename}`);
    }
    return target;
  }
  const temporary = path.join(releaseDir, `.${filename}.tmp-${process.pid}`);
  fs.copyFileSync(source, temporary);
  fs.renameSync(temporary, target);
  return target;
};

try {
  for (const relative of Object.values(authorityPaths)) requireFile(relative);
  const finalReport = JSON.parse(fs.readFileSync(requireFile(authorityPaths.final), "utf8"));
  const finalCheckValues = Object.values(finalReport.checks ?? {});
  if (
    finalReport.schema !== "watch.rc1-final-regression.v1" ||
    finalReport.accepted !== true ||
    finalCheckValues.length !== 25 ||
    !finalCheckValues.every((value) => value === true)
  ) {
    throw new Error("RC1 final regression is not fully accepted");
  }
  const authority = {
    finalRegressionSha256: hashFile(requireFile(authorityPaths.final)),
    sourceManifestSha256: hashFile(requireFile(authorityPaths.source)),
    runtimeReferenceSha256: hashFile(requireFile(authorityPaths.runtime)),
    runtimeQualitySha256: hashFile(requireFile(authorityPaths.runtimeQuality)),
    mechanicalMatrixSha256: hashFile(requireFile(authorityPaths.mechanical)),
    presentationReportSha256: hashFile(requireFile(authorityPaths.presentation)),
  };

  console.log("Verifying RC1 authority...");
  run("node", ["scripts/verify-rc1-authority.mjs"], { stdio: "inherit" });
  console.log("Building production site...");
  run("npm", ["run", "build"], { stdio: "inherit" });
  const runtimeQuality = JSON.parse(fs.readFileSync(requireFile(authorityPaths.runtimeQuality), "utf8"));
  const testedDistRows = runtimeQuality.testedArtifact?.files;
  if (!Array.isArray(testedDistRows) || testedDistRows.length === 0) {
    throw new Error("Runtime-quality report has no tested dist manifest");
  }
  const currentDistRows = allFiles(path.join(root, "dist")).map((file) => ({
    file: path.relative(path.join(root, "dist"), file).split(path.sep).join("/"),
    bytes: fs.statSync(file).size,
    sha256: hashFile(file),
  }));
  if (JSON.stringify(currentDistRows) !== JSON.stringify(testedDistRows)) {
    throw new Error("Current production build is not byte-identical to the runtime-tested dist");
  }
  run("node", ["scripts/generate-sbom.mjs", path.join(work, "watch-sbom.cdx.json")], { stdio: "inherit" });

  fs.mkdirSync(staticStage, { recursive: true });
  fs.cpSync(path.join(root, "dist"), staticStage, { recursive: true, force: true });
  copyFile(authorityPaths.poster, path.join(staticStage, "watch-poster.png"));
  const staticIndexPath = path.join(staticStage, "index.html");
  const staticIndex = fs.readFileSync(staticIndexPath, "utf8");
  const fallbackNeedle = "<p>The three-dimensional view needs WebGL. Try a current browser with hardware acceleration enabled.</p>";
  if (!staticIndex.includes(fallbackNeedle)) throw new Error("Could not bind the RC1 static poster fallback");
  fs.writeFileSync(
    staticIndexPath,
    staticIndex
      .replace("</head>", `    <link rel="stylesheet" href="./fallback.css" />\n  </head>`)
      .replace(
        fallbackNeedle,
        `${fallbackNeedle}\n        <img class="webgl-fallback__poster" src="./watch-poster.png" alt="Static front three-quarter view of the finished skeleton watch" width="1600" height="1100" />`,
      ),
  );
  write(path.join(staticStage, "fallback.css"), `.webgl-fallback__poster { display: block; width: min(54rem, 90vw); height: auto; margin: 1rem auto 0; border-radius: .5rem; }\n`);
  for (const relative of ["PROJECT_LICENSE.txt", "THIRD_PARTY_NOTICES.txt", "SECURITY_AUDIT.md", "KNOWN_LIMITATIONS.md", "RELEASE_NOTES_RC1.md"]) {
    copyFile(relative, path.join(staticStage, path.basename(relative)));
  }
  fs.copyFileSync(path.join(work, "watch-sbom.cdx.json"), path.join(staticStage, "watch-sbom.cdx.json"));
  write(path.join(staticStage, ".nojekyll"), "");
  write(path.join(staticStage, "_headers"), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/watch/assets/*
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache

/watch/index.html
  Cache-Control: no-cache
`);
  write(path.join(staticStage, "headers.json"), `${JSON.stringify({
    "/*": {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    },
    "/assets/*": { "Cache-Control": "public, max-age=31536000, immutable" },
    "/watch/assets/*": { "Cache-Control": "public, max-age=31536000, immutable" },
    "/index.html": { "Cache-Control": "no-cache" },
    "/watch/index.html": { "Cache-Control": "no-cache" },
  }, null, 2)}\n`);
  write(path.join(staticStage, "serve-local.sh"), `#!/bin/sh\ncd "$(dirname "$0")" || exit 1\necho "Open http://127.0.0.1:8080/"\npython3 -m http.server 8080 --bind 127.0.0.1\n`, 0o755);
  write(path.join(staticStage, "serve-local.bat"), `@echo off\r\ncd /d "%~dp0"\r\necho Open http://127.0.0.1:8080/\r\npy -m http.server 8080 --bind 127.0.0.1\r\n`);
  write(path.join(staticStage, "README.txt"), `INTERACTIVE SKELETON WATCH — RC1 STATIC SITE\n\nUpload this directory's contents to a static host, or use a local launcher.\nDo not open index.html directly through file://. No server application, secret,\nor external asset service is required.\n`);
  addStageManifest(staticStage, "static-site", authority);

  fs.mkdirSync(sourceStage, { recursive: true });
  for (const relative of [
    "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "index.html", ".gitignore",
    "README.md", "DEPLOYMENT.md", "POST5D_CLOSEOUT_PLAN_REVISED_2026-08-27.md",
    "POST5D_CLOSEOUT_PLAN.md",
    "PROJECT_LICENSE.txt", "THIRD_PARTY_NOTICES.txt", "SECURITY_AUDIT.md", "KNOWN_LIMITATIONS.md", "RELEASE_NOTES_RC1.md",
    "watch_pre_repair_frozen_package_reference.json",
  ]) copyFile(relative, path.join(sourceStage, relative));
  for (const file of [
    "ROGUE_RD1.md",
    "ROGUE_RD2.md",
    "SHAMAN_RD1.md",
    "SHAMAN_RD2.md",
    "CLAUDE_01_BLIND_VISUAL_AUDIT.md",
    "CLAUDE_02_CONTEXT_RECONCILIATION.md",
  ]) {
    copyFile(`review-packets/results/${file}`, path.join(sourceStage, "review-packets/results", file));
  }
  for (const relative of ["src", "scripts"]) {
    copyTree(relative, path.join(sourceStage, relative));
  }
  copyBoundRc1Evidence(sourceStage);
  copyPresentationEvidence(path.join(sourceStage, "captures/release-annex-r1"));
  for (const relative of [
    "captures/phase5d-c/comparison-report.json",
    "captures/annex-e1-exploded/comparison-report.json",
    "captures/post5d-newer-827-followup/final-regression-report.json",
    "captures/post5d-newer-827-followup/runtime-regression.json",
  ]) copyFile(relative, path.join(sourceStage, relative));
  fs.copyFileSync(path.join(work, "watch-sbom.cdx.json"), path.join(sourceStage, "watch-sbom.cdx.json"));
  write(path.join(sourceStage, "HANDOFF.md"), `# RC1 source handoff\n\nValidated commands:\n\n\`\`\`sh\nnpm ci\nnpm run build\nnpm run verify:authority\n\`\`\`\n\nThe full historical capture archive and review packets are intentionally omitted.\nThe included RC1 and Release Annex R1 evidence are the executable release authority.\n`);
  addStageManifest(sourceStage, "source-handoff", authority);

  fs.mkdirSync(evidenceStage, { recursive: true });
  copyBoundRc1Evidence(evidenceStage);
  copyPresentationEvidence(path.join(evidenceStage, "captures/release-annex-r1"));
  for (const relative of [
    "captures/post5d-newer-827-followup/final-regression-report.json",
    "captures/post5d-newer-827-followup/runtime-regression.json",
  ]) copyFile(relative, path.join(evidenceStage, relative));
  for (const relative of ["PROJECT_LICENSE.txt", "THIRD_PARTY_NOTICES.txt", "KNOWN_LIMITATIONS.md", "RELEASE_NOTES_RC1.md"]) {
    copyFile(relative, path.join(evidenceStage, relative));
  }
  copyFile("SECURITY_AUDIT.md", path.join(evidenceStage, "SECURITY_AUDIT.md"));
  fs.copyFileSync(path.join(work, "watch-sbom.cdx.json"), path.join(evidenceStage, "watch-sbom.cdx.json"));
  write(path.join(evidenceStage, "README.md"), `# RC1 selected evidence\n\nThis archive contains the current release-candidate mechanical/runtime authority and matched Release Annex R1 presentation evidence. Historical working captures are deliberately omitted.\n`);
  addStageManifest(evidenceStage, "selected-evidence", authority);

  const archives = [
    ["watch-static-site-rc1.zip", staticStage],
    ["watch-source-handoff-rc1.zip", sourceStage],
    ["watch-release-evidence-rc1.zip", evidenceStage],
  ];
  const built = [];
  for (const [filename, stage] of archives) {
    const archive = reproducibleArchive(stage, filename.slice(0, -4));
    const extract = path.join(extractRoot, filename.slice(0, -4));
    fs.mkdirSync(extract, { recursive: true });
    run("unzip", ["-q", archive, "-d", extract]);
    const extractedRoot = path.join(extract, path.basename(stage));
    verifyExtractedManifest(extractedRoot);
    built.push({ filename, archive, extractedRoot });
  }

  const staticExtract = built.find((row) => row.filename.startsWith("watch-static"));
  const sourceExtract = built.find((row) => row.filename.startsWith("watch-source"));
  const staticSmokePath = path.join(work, "STATIC-SMOKE-RC1.json");
  run("node", ["scripts/smoke-static-artifact.mjs", staticExtract.extractedRoot, staticSmokePath], {
    stdio: "inherit",
    env: { ...process.env, WATCH_BROWSERS: requiredBrowserMatrix.join(",") },
  });
  const staticSmoke = JSON.parse(fs.readFileSync(staticSmokePath, "utf8"));
  staticSmoke.testedArchive = {
    file: "watch-static-site-rc1.zip",
    bytes: fs.statSync(staticExtract.archive).size,
    sha256: hashFile(staticExtract.archive),
    releaseManifestSha256: hashFile(path.join(staticExtract.extractedRoot, "release-manifest.json")),
    internalChecksumsSha256: hashFile(path.join(staticExtract.extractedRoot, "SHA256SUMS.txt")),
  };
  write(staticSmokePath, `${JSON.stringify(staticSmoke, null, 2)}\n`);
  const cleanroomPath = path.join(work, "CLEANROOM-RC1.json");
  const cleanroom = {
    schema: "watch.rc1-cleanroom-verification.v1",
    sourceArchiveSha256: hashFile(sourceExtract.archive),
    node: process.version,
    npm: run("npm", ["--version"]).stdout.trim(),
    skipped: false,
    commands: [],
    accepted: false,
  };
  for (const args of [["ci"], ["run", "build"], ["run", "verify:authority"]]) {
    const result = run("npm", args, { cwd: sourceExtract.extractedRoot, stdio: "inherit" });
    cleanroom.commands.push({ command: `npm ${args.join(" ")}`, exitCode: result.status });
  }
  cleanroom.accepted = true;
  write(cleanroomPath, `${JSON.stringify(cleanroom, null, 2)}\n`);

  const publicationRows = [
    ...built.map((row) => ({ source: row.archive, filename: row.filename })),
    { source: staticSmokePath, filename: "STATIC-SMOKE-RC1.json" },
    { source: cleanroomPath, filename: "CLEANROOM-RC1.json" },
  ];
  const checksumText = `${publicationRows.map((row) => `${hashFile(row.source)}  ${row.filename}`).join("\n")}\n`;
  const checksumTarget = path.join(releaseDir, "SHA256SUMS-RC1.txt");
  const checksumSource = path.join(work, "SHA256SUMS-RC1.txt");
  write(checksumSource, checksumText);
  for (const row of publicationRows) {
    const target = path.join(releaseDir, row.filename);
    if (fs.existsSync(target) && hashFile(target) !== hashFile(row.source)) {
      throw new Error(`Refusing partial publication: existing ${row.filename} differs`);
    }
  }
  if (fs.existsSync(checksumTarget) && fs.readFileSync(checksumTarget, "utf8") !== checksumText) {
    throw new Error("Refusing partial publication: existing SHA256SUMS-RC1.txt differs");
  }
  const published = publicationRows.map((row) => publishWithoutOverwrite(row.source, row.filename));
  const publishedChecksum = publishWithoutOverwrite(checksumSource, "SHA256SUMS-RC1.txt");

  console.log("RC1 release packages complete:");
  for (const file of published) console.log(`  ${path.relative(root, file)}  ${hashFile(file)}`);
  console.log(`  ${path.relative(root, publishedChecksum)}  ${hashFile(publishedChecksum)}`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
