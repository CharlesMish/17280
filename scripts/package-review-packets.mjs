import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "review-packets");
const stagingDir = path.join(outputDir, `.staging-${process.pid}`);
const blindStage = path.join(stagingDir, "watch-audit-01-blind-visual-2026-08-27");
const contextStage = path.join(stagingDir, "watch-audit-02-context-template-2026-08-27");
const captureDir = path.join(root, "captures/reviewer-rc0");
const fixedDate = new Date("2026-08-27T00:00:00.000Z");

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const hashFile = (file) => sha256(fs.readFileSync(file));
const requireFile = (file) => {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Required review-packet input is missing: ${path.relative(root, file)}`);
  }
};
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
  return result;
};
const write = (file, contents, mode = 0o644) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  fs.chmodSync(file, mode);
};
const copy = (source, destination, mode = null) => {
  requireFile(source);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  if (mode !== null) fs.chmodSync(destination, mode);
};
const copyTree = (source, destination) => {
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`Required directory is missing: ${path.relative(root, source)}`);
  }
  fs.cpSync(source, destination, { recursive: true, force: true });
};
const allFiles = (directory) => {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  visit(directory);
  return files;
};
const normalizeTree = (directory) => {
  const paths = [];
  const visit = (current) => {
    paths.push(current);
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) paths.push(absolute);
    }
  };
  visit(directory);
  for (const file of paths.filter((item) => fs.statSync(item).isFile())) {
    fs.chmodSync(file, file.endsWith("serve-local.sh") ? 0o755 : 0o644);
    fs.utimesSync(file, fixedDate, fixedDate);
  }
  for (const dir of paths.filter((item) => fs.statSync(item).isDirectory()).reverse()) {
    fs.chmodSync(dir, 0o755);
    fs.utimesSync(dir, fixedDate, fixedDate);
  }
};
const addManifest = (directory, packet, purpose, acceptedRegressionReportSha256 = null) => {
  const rows = allFiles(directory)
    .filter((file) => path.basename(file) !== "PACKET_MANIFEST.json")
    .map((file) => ({
      file: path.relative(directory, file).split(path.sep).join("/"),
      bytes: fs.statSync(file).size,
      sha256: hashFile(file),
    }));
  write(path.join(directory, "PACKET_MANIFEST.json"), `${JSON.stringify({
    schema: "watch.review-packet.v1",
    packet,
    purpose,
    reviewCandidate: true,
    publicRelease: false,
    generatedOn: "2026-08-27",
    ...(acceptedRegressionReportSha256 ? { acceptedRegressionReportSha256 } : {}),
    manifestSelfExcluded: true,
    files: rows,
  }, null, 2)}\n`);
  const checksumRows = allFiles(directory)
    .filter((file) => path.basename(file) !== "MANIFEST.sha256")
    .map((file) => `${hashFile(file)}  ${path.relative(directory, file).split(path.sep).join("/")}`);
  write(path.join(directory, "MANIFEST.sha256"), `${checksumRows.join("\n")}\n`);
};
const zipStage = (stage, output) => {
  const temporaryOutput = `${output.slice(0, -4)}.tmp-${process.pid}.zip`;
  fs.rmSync(temporaryOutput, { force: true });
  normalizeTree(stage);
  const parent = path.dirname(stage);
  const entries = allFiles(stage)
    .map((file) => path.relative(parent, file).split(path.sep).join("/"))
    .sort();
  const result = spawnSync("zip", ["-X", "-q", "-9", temporaryOutput, ...entries], {
    cwd: parent,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, TZ: "UTC" },
  });
  if (result.status !== 0) throw new Error(`zip failed: ${result.stderr ?? result.stdout}`);
  fs.renameSync(temporaryOutput, output);
};

const finalReportPath = path.join(root, "captures/post5d-newer-827-followup/final-regression-report.json");
requireFile(finalReportPath);
const finalReportData = fs.readFileSync(finalReportPath);
const finalReport = JSON.parse(finalReportData);
if (finalReport.accepted !== true || !Object.values(finalReport.checks ?? {}).every((value) => value === true)) {
  throw new Error("Latest combined regression is not fully accepted");
}
const acceptedSourceRows = finalReport.sourceScope?.allRows ?? [];
const acceptedSourcePaths = acceptedSourceRows.map((row) => row.file).sort();
const currentSourcePaths = allFiles(path.join(root, "src"))
  .map((file) => path.relative(root, file).split(path.sep).join("/"))
  .sort();
if (JSON.stringify(currentSourcePaths) !== JSON.stringify(acceptedSourcePaths)) {
  throw new Error("Current src/ file set differs from the accepted 63-file authority");
}
for (const row of acceptedSourceRows) {
  const source = path.join(root, row.file);
  requireFile(source);
  const actual = hashFile(source);
  if (actual !== row.currentSha256) {
    throw new Error(`Current source no longer matches accepted regression: ${row.file}`);
  }
}
const acceptedRegressionReportSha256 = sha256(finalReportData);

const imageMap = [
  ["01-final-hero.png", "V01.png"],
  ["02-front-three-quarter.png", "V02.png"],
  ["03-clean-front.png", "V03.png"],
  ["04-balance-macro.png", "V04.png"],
  ["05-sapphire-oblique.png", "V05.png"],
  ["06-rear-exhibition.png", "V06.png"],
  ["07-assembled-reference.png", "V07.png"],
  ["08-exploded-hero.png", "V08.png"],
  ["09-exploded-side-oblique.png", "V09.png"],
  ["10-crown-macro.png", "V10.png"],
  ["11-explode-progression-strip.png", "V11.png"],
];
const blindImageMap = imageMap.filter(([, blindName]) => blindName !== "V11.png");
const expectedCaptureStates = new Map([
  ["01-final-hero.png", { view: "presentHero", profile: "presentHero", explode: null }],
  ["02-front-three-quarter.png", { view: "presentThreeQuarter", profile: "presentSettled", explode: null }],
  ["03-clean-front.png", { view: "extFront", profile: "presentSettled", explode: null }],
  ["04-balance-macro.png", { view: "finishBalance", profile: "middle", explode: null }],
  ["05-sapphire-oblique.png", { view: "extHero", profile: "conservative", explode: null }],
  ["06-rear-exhibition.png", { view: "extRear", profile: "rear", explode: null }],
  ["07-assembled-reference.png", { view: "presentExploded", profile: "presentSettled", explode: 0 }],
  ["08-exploded-hero.png", { view: "presentExploded", profile: "presentSettled", explode: 1 }],
  ["09-exploded-side-oblique.png", { view: "presentExplodedSide", profile: "presentSettled", explode: 1 }],
  ["10-crown-macro.png", { view: "extCrownProfile", profile: "presentSettled", explode: null }],
  ["11-explode-progression-strip.png", { view: "presentExploded", profile: "presentSettled", explode: [0, 0.25, 0.5, 0.75, 1] }],
]);
for (const [source] of imageMap) requireFile(path.join(captureDir, source));
requireFile(path.join(captureDir, "report.json"));
const captureReport = JSON.parse(fs.readFileSync(path.join(captureDir, "report.json"), "utf8"));
if (captureReport.productSourceEditedByCapture !== false || captureReport.visualInspection?.completed !== true) {
  throw new Error("Fresh review captures are not finalized and visually inspected");
}
const captureSourceHashes = new Map((captureReport.source?.files ?? []).map((row) => [row.file, row.sha256]));
for (const row of acceptedSourceRows) {
  if (captureSourceHashes.get(row.file) !== row.currentSha256) {
    throw new Error(`Capture source does not match accepted product authority: ${row.file}`);
  }
}
const captureImages = new Map((captureReport.images ?? []).map((row) => [row.file, row]));
for (const [source] of imageMap) {
  const row = captureImages.get(source);
  const file = path.join(captureDir, source);
  const expectedState = expectedCaptureStates.get(source);
  const requested = row?.requestedState;
  if (!row || row.sha256 !== hashFile(file) || row.png?.width !== 1600 || row.png?.height !== 1100) {
    throw new Error(`Capture report mismatch: ${source}`);
  }
  if (
    requested?.view !== expectedState.view
    || requested?.phase5dProfile !== expectedState.profile
    || requested?.timeSeconds !== 0.104
    || requested?.readoutPose !== "10:10"
    || requested?.readoutPoseParameter !== "1010"
    || requested?.diagnostic !== "product"
    || requested?.debug !== false
    || requested?.familyId !== false
    || JSON.stringify(requested?.explode) !== JSON.stringify(expectedState.explode)
  ) {
    throw new Error(`Capture state contract mismatch: ${source}`);
  }
}
const acceptedConsoleWarnings = new Set(finalReport.runtimeDiagnostics?.consoleErrors ?? []);
const browserErrors = captureReport.browserErrors ?? {};
if (captureReport.runtime?.navigationStatus !== 200) {
  throw new Error("Fresh review capture did not load with HTTP 200");
}
if ((browserErrors.pageErrors ?? []).length || (browserErrors.requestFailures ?? []).length || (browserErrors.httpErrors ?? []).length) {
  throw new Error("Fresh review capture has a page, request, or HTTP error");
}
for (const warning of browserErrors.consoleErrors ?? []) {
  if (!acceptedConsoleWarnings.has(warning)) {
    throw new Error(`Fresh review capture has a non-authoritative console diagnostic: ${warning}`);
  }
}

console.log("Building the current static review site...");
run("npm", ["run", "build"], { stdio: "inherit" });

fs.mkdirSync(outputDir, { recursive: true });
fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(blindStage, { recursive: true });
fs.mkdirSync(contextStage, { recursive: true });

copy(path.join(root, "review/BLIND_README.md"), path.join(blindStage, "00_READ_FIRST.md"));
copy(path.join(root, "review/BLIND_VISUAL_REVIEW_PROMPT.md"), path.join(blindStage, "01_PROMPT.md"));
copy(path.join(root, "review/SCORE_ANCHORS.md"), path.join(blindStage, "02_SCORE_ANCHORS.md"));
copy(path.join(root, "review/BLIND_RESPONSE_TEMPLATE.md"), path.join(blindStage, "03_RESPONSE_TEMPLATE.md"));
for (const [source, blindName] of blindImageMap) {
  copy(path.join(captureDir, source), path.join(blindStage, "images", blindName));
}
addManifest(
  blindStage,
  "watch-audit-01-blind-visual-2026-08-27",
  "Unanchored image-only product/perception review",
);

for (const [source, blindName] of imageMap) {
  copy(path.join(captureDir, source), path.join(contextStage, "images", blindName));
}
for (const [source, destination] of [
  ["review/CONTEXT_README.md", "00_READ_FIRST.md"],
  ["review/CONTEXT_REVIEW_PROMPT.md", "01_CONTEXT_PROMPT.md"],
  ["review/TECHNICAL_TRUTH.md", "02_PRODUCT_TRUTH.md"],
  ["review/KNOWN_OPEN_ITEMS.md", "03_KNOWN_OPEN_ITEMS.md"],
  ["review/SOURCE_INDEX.md", "04_SOURCE_MAP.md"],
  ["review/SCORE_ANCHORS.md", "05_SCORE_ANCHORS.md"],
  ["review/CONTEXT_RESPONSE_TEMPLATE.md", "06_RESPONSE_TEMPLATE.md"],
  ["review/IMAGE_INDEX.md", "images/VIEW_MAP.md"],
]) copy(path.join(root, source), path.join(contextStage, destination));
const packetPlan = fs.readFileSync(path.join(root, "POST5D_CLOSEOUT_PLAN.md"), "utf8")
  .replace(
    /\n## 2\. How to use the shared Grok critique[\s\S]*?(?=\n## 3\. Recommended sequence)/,
    `\n## 2. Independent-review boundary\n\nThe original reviewer prose is deliberately omitted from this packet. Judge the current images and source truth through your own sealed Stage-1 findings, then challenge the recommendations below on their evidence.\n`,
  )
  .replaceAll("**Grok / visual director:**", "**Independent visual reviewer:**")
  .replaceAll("use Grok as an art director again", "use independent visual review again")
  .replaceAll("suggested by Grok", "requiring independent visual adjudication")
  .replaceAll("from the two-picture critique", "from isolated screenshots")
  .replaceAll("Let the next Grok pass", "Let the next independent visual pass")
  .replaceAll(
    "[`captures/post5d-newer-827-followup/final-regression-report.json`](captures/post5d-newer-827-followup/final-regression-report.json)",
    "[`reports/current-final-regression-report.json`](reports/current-final-regression-report.json)",
  )
  .replaceAll(
    "[`captures/post5d-newer-827-followup/runtime-regression.json`](captures/post5d-newer-827-followup/runtime-regression.json)",
    "the full current runtime snapshot (deliberately omitted from this compact packet; use the combined report)",
  )
  .replaceAll(
    "[`captures/phase5d-c/comparison-report.json`](captures/phase5d-c/comparison-report.json)",
    "[`reports/phase5d-c-comparison-report.json`](reports/phase5d-c-comparison-report.json)",
  )
  .replaceAll(
    "[`captures/annex-e1-exploded/comparison-report.json`](captures/annex-e1-exploded/comparison-report.json)",
    "[`reports/annex-e1-comparison-report.json`](reports/annex-e1-comparison-report.json)",
  )
  .replaceAll(
    "[`README.md`](README.md), [`DEPLOYMENT.md`](DEPLOYMENT.md), and [`scripts/package-release.mjs`](scripts/package-release.mjs)",
    "the stale repository README/deployment prose (deliberately omitted) and [`source/scripts/package-release.mjs`](source/scripts/package-release.mjs)",
  );
write(path.join(contextStage, "90_CURRENT_CLOSEOUT_PLAN.md"), packetPlan);
write(path.join(contextStage, "prior-response/ADD_ONLY_THIS_REVIEWERS_STAGE1_RESPONSE_HERE.txt"), `Do not place another reviewer's response in this directory.\n`);

const reportMap = [
  ["captures/post5d-newer-827-followup/final-regression-report.json", "current-final-regression-report.json"],
  ["captures/phase5d-c/comparison-report.json", "phase5d-c-comparison-report.json"],
  ["captures/annex-e1-exploded/comparison-report.json", "annex-e1-comparison-report.json"],
  ["captures/post5d-junction-escape/junction-report.json", "current-junction-report.json"],
  ["captures/post5d-newer-827-correction/05-center-third-final-mesh-report.json", "center-third-mesh-report.json"],
  ["captures/post5d-newer-827-correction/06-third-fourth-final-mesh-report.json", "third-fourth-mesh-report.json"],
  ["captures/post5d-newer-827/05-escape-pallet-sweep-report.json", "escape-pallet-sweep-report.json"],
];
for (const [source, destination] of reportMap) {
  copy(path.join(root, source), path.join(contextStage, "reports", destination));
}
write(path.join(contextStage, "reports/review-capture-report.json"), `${JSON.stringify({
  schema: "watch.review-capture-summary.v1",
  completedUtc: captureReport.completedUtc,
  disposition: captureReport.disposition,
  productSourceEditedByCapture: captureReport.productSourceEditedByCapture,
  captureContract: captureReport.captureContract,
  source: {
    captureAggregateSha256: captureReport.source?.aggregateSha256,
    captureFileCount: captureReport.source?.fileCount,
    acceptedProductSourceFileCount: acceptedSourceRows.length,
    acceptedProductSourceHashesExact: true,
    note: "Review-only documents and package scripts may postdate capture; all accepted src/ hashes are exact.",
  },
  browserErrors: captureReport.browserErrors,
  visualInspection: captureReport.visualInspection,
  images: (captureReport.images ?? []).map((row) => ({
    file: row.file,
    label: row.label,
    bytes: row.bytes,
    sha256: row.sha256,
    png: row.png,
    requestedState: row.requestedState,
    camera: row.runtimeState?.camera,
    lightingProfile: row.runtimeState?.lighting?.profile,
    exposure: row.runtimeState?.renderer?.exposure,
    explode: row.runtimeState?.explosion?.scalar?.value,
  })),
}, null, 2)}\n`);

copyTree(path.join(root, "src"), path.join(contextStage, "source/src"));
for (const file of [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
]) copy(path.join(root, file), path.join(contextStage, "source", file));
for (const file of [
  "package-release.mjs",
]) copy(path.join(root, "scripts", file), path.join(contextStage, "source/scripts", file));
write(path.join(contextStage, "source/README_PACKET.md"), `# Source subset in this review packet

This is the exact current buildable product source plus selected configuration.
Supported commands in the extracted packet are:

\`\`\`sh
npm ci
npm run build
npm run dev
\`\`\`

The repository convenience scripts \`npm run package\` and
\`npm run package:review\` reference evidence inputs intentionally omitted from
this compact review packet. They are included in package metadata for source
fidelity, not advertised as runnable here.
`);

const sourceRows = allFiles(path.join(contextStage, "source"))
  .filter((file) => path.basename(file) !== "source-manifest.json")
  .map((file) => ({
    file: path.relative(path.join(contextStage, "source"), file).split(path.sep).join("/"),
    bytes: fs.statSync(file).size,
    sha256: hashFile(file),
  }));
write(path.join(contextStage, "source/source-manifest.json"), `${JSON.stringify({
  schema: "watch.review-source-manifest.v1",
  generatedOn: "2026-08-27",
  acceptedRegressionReportSha256,
  files: sourceRows,
}, null, 2)}\n`);

copyTree(path.join(root, "dist"), path.join(contextStage, "preview"));
write(path.join(contextStage, "preview/serve-local.sh"), `#!/bin/sh
cd "$(dirname "$0")" || exit 1
echo "Open http://127.0.0.1:8080/"
python3 -m http.server 8080 --bind 127.0.0.1
`, 0o755);
write(path.join(contextStage, "preview/serve-local.bat"), `@echo off\r
cd /d "%~dp0"\r
echo Open http://127.0.0.1:8080/\r
py -m http.server 8080 --bind 127.0.0.1\r
`);
write(path.join(contextStage, "preview/REVIEW_BUILD.txt"), `WATCH REVIEW-CANDIDATE INTERACTIVE BUILD

This is a current-source review artifact, not a final public release.
Do not open index.html directly using file://. Use one of the local launchers.
`);

addManifest(
  contextStage,
  "watch-audit-02-context-template-2026-08-27",
  "Second-stage source-truth, roadmap, report, and interactive review",
  acceptedRegressionReportSha256,
);

const blindZip = path.join(outputDir, "watch-audit-01-blind-visual-2026-08-27.zip");
const contextZip = path.join(outputDir, "watch-audit-02-context-template-2026-08-27.zip");
zipStage(blindStage, blindZip);
zipStage(contextStage, contextZip);
for (const archive of [blindZip, contextZip]) {
  run("unzip", ["-tqq", archive]);
}

const checksumRows = [blindZip, contextZip].map((file) => `${hashFile(file)}  ${path.basename(file)}`);
write(path.join(outputDir, "SHA256SUMS.txt"), `${checksumRows.join("\n")}\n`);
copy(path.join(root, "review/REVIEW_SEQUENCE.md"), path.join(outputDir, "README.md"));
fs.rmSync(stagingDir, { recursive: true, force: true });

console.log("Review packets complete:");
for (const file of [blindZip, contextZip]) {
  console.log(`  ${path.relative(root, file)} (${(fs.statSync(file).size / 1024 / 1024).toFixed(2)} MiB)`);
}
console.log(`  ${path.relative(root, path.join(outputDir, "SHA256SUMS.txt"))}`);
