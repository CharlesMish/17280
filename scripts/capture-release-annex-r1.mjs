import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const root = process.cwd();
const outDir = path.join(root, "captures/release-annex-r1");
const reportPath = path.join(outDir, "report.json");
const fixedTime = 0.104;
const fixedPose = "1010";
const viewport = { width: 1600, height: 1100 };

if (fs.existsSync(reportPath)) throw new Error(`refusing to overwrite release report: ${reportPath}`);
fs.mkdirSync(outDir, { recursive: true });

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const exact = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const absolute = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(absolute) : [absolute];
});
const runtimeFiles = () => [
  path.join(root, "index.html"),
  path.join(root, "package.json"),
  path.join(root, "package-lock.json"),
  path.join(root, "tsconfig.json"),
  path.join(root, "vite.config.ts"),
  ...walk(path.join(root, "src")),
].sort();
const sourceSnapshot = () => {
  const files = runtimeFiles().map((absolute) => {
    const data = fs.readFileSync(absolute);
    return { file: path.relative(root, absolute), bytes: data.byteLength, sha256: sha256(data) };
  });
  return {
    files,
    aggregateSha256: sha256(Buffer.from(files.map((row) => `${row.file}\0${row.bytes}\0${row.sha256}\n`).join(""))),
  };
};

const buildRun = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8" });
const build = {
  command: "npm run build",
  exitCode: buildRun.status,
  passed: buildRun.status === 0,
  stdout: buildRun.stdout,
  stderr: buildRun.stderr,
};
if (!build.passed) throw new Error(`release build failed\n${build.stderr}`);

const sourceAtStart = sourceSnapshot();
const startedUtc = new Date().toISOString();
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const browserVersion = browser.version();
const diagnostics = { pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [] };
const attachDiagnostics = (page) => {
  page.on("pageerror", (error) => diagnostics.pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => diagnostics.requestFailures.push({
    url: request.url(),
    error: request.failure()?.errorText ?? "unknown",
  }));
  page.on("response", (response) => {
    if (response.status() >= 400) diagnostics.httpErrors.push({ url: response.url(), status: response.status() });
  });
};

const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
attachDiagnostics(page);
const requestedUrl = `${baseUrl}/?static=1&shell=0&view=r1FinalHero&t=${fixedTime}&readoutPose=${fixedPose}&explode=0`;
const navigationResponse = await page.goto(requestedUrl, { waitUntil: "commit", timeout: 60000 });
await page.waitForFunction(() =>
  typeof globalThis.__WATCH__?.capture === "function" &&
  typeof globalThis.__WATCH__?.releasePresentationReport === "function" &&
  typeof globalThis.__WATCH__?.explodedAssemblyReport === "function"
);
await page.waitForTimeout(1800);

const runtimeEnvironment = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
  const debugInfo = gl?.getExtension("WEBGL_debug_renderer_info");
  return {
    url: location.href,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGiB: navigator.deviceMemory ?? null,
    devicePixelRatio,
    viewport: { innerWidth, innerHeight },
    canvas: canvas ? {
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      role: canvas.getAttribute("role"),
      label: canvas.getAttribute("aria-label"),
      tabIndex: canvas.tabIndex,
    } : null,
    webgl: gl ? {
      context: gl instanceof WebGL2RenderingContext ? "webgl2" : "webgl",
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
      unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    } : null,
    staticShellAbsent: document.querySelector(".release-shell") === null,
  };
});

const authoritySnapshot = () => page.evaluate(() => {
  const watch = globalThis.__WATCH__;
  const phase5d = watch.phase5dPresentationReport();
  return {
    geometryAuthority: phase5d.geometryAuthority,
    sapphire: phase5d.sapphire,
    escapement: watch.escapementRepairReport(),
    goingTrain: watch.kinematicReport([0.104, 60.104]),
    displayDrive: watch.displayDriveReport([0.104, 60.104]),
    e1: watch.explodedAssemblyReport(),
  };
});

const authorityBefore = await authoritySnapshot();
const images = [];
const progressionDataUrls = [];

const prepare = async (specification) => {
  await page.evaluate(({ specification, fixedTime, fixedPose }) => {
    const watch = globalThis.__WATCH__;
    watch.setPhase5dB2FamilyId(false);
    watch.setPhase5dB2Diagnostic("product");
    watch.setView(specification.view);
    watch.setReadoutPose(fixedPose);
    watch.setTime(fixedTime);
    watch.setDebug(false);
    watch.setPhase5dCProfile(specification.profile);
    if (specification.explode !== undefined) watch.setExplode(specification.explode);
  }, { specification, fixedTime, fixedPose });
  await page.waitForTimeout(550);
};

const capture = async (specification) => {
  await prepare(specification);
  const result = await page.evaluate(() => {
    const watch = globalThis.__WATCH__;
    return {
      dataUrl: watch.capture(),
      phase5d: watch.phase5dPresentationReport(),
      e1: watch.explodedAssemblyReport(),
      r1: watch.releasePresentationReport(),
    };
  });
  const data = Buffer.from(result.dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(outDir, specification.file), data, { flag: "wx" });
  const row = {
    file: specification.file,
    label: specification.label,
    bytes: data.byteLength,
    sha256: sha256(data),
    png: { width: data.readUInt32BE(16), height: data.readUInt32BE(20) },
    requested: specification,
    runtime: {
      camera: result.phase5d.cameras.current,
      lighting: result.phase5d.lighting,
      identity: result.phase5d.geometryAuthority.identity,
      sapphire: result.phase5d.sapphire,
      explosion: result.e1.scalar,
      r1: result.r1.current,
    },
  };
  images.push(row);
  console.log("ok", specification.file);
  return { row, dataUrl: result.dataUrl };
};

const primarySuite = [
  { file: "final-hero.png", label: "Final whole-watch hero", view: "r1FinalHero", profile: "presentHero" },
  { file: "front-elevation.png", label: "Long-working-distance front elevation", view: "r1FrontElevation", profile: "r1FrontRead" },
  { file: "front-three-quarter.png", label: "Final front three-quarter", view: "r1FrontThreeQuarter", profile: "presentSettled" },
  { file: "wearable-proof.png", label: "Whole wearable proof with buckle and keepers", view: "r1WearableProof", profile: "r1Wearable" },
  { file: "wearable-junction.png", label: "Horn, spring-bar and strap junction", view: "r1WearableJunction", profile: "r1Wearable" },
  { file: "balance-finish-macro.png", label: "Balance and finish macro under neutral profile", view: "r1BalanceFinishMacro", profile: "middle" },
  { file: "sapphire-oblique.png", label: "Assembled planar sapphire oblique", view: "r1SapphireOblique", profile: "r1Sapphire" },
  { file: "rear-exhibition.png", label: "Rear exhibition and complete identity", view: "r1RearExhibition", profile: "r1Rear" },
  { file: "rear-identity-proof.png", label: "Rear identity transcription proof", view: "r1RearIdentity", profile: "r1Rear" },
  { file: "finish-rake-before.png", label: "Finish matched baseline", view: "r1FinishRake", profile: "middle" },
  { file: "finish-rake-after.png", label: "Finish matched raking profile", view: "r1FinishRake", profile: "r1Raking" },
  { file: "exploded-side.png", label: "E1 side communication", view: "r1E1Side", profile: "middle", explode: 1 },
];
for (const specification of primarySuite) await capture(specification);

const progression = [
  { value: 0, file: "e1-000.png", label: "Assembled" },
  { value: 0.25, file: "e1-025.png", label: "Transition" },
  { value: 0.5, file: "e1-050.png", label: "Transition" },
  { value: 0.75, file: "e1-075.png", label: "Transition" },
  { value: 1, file: "exploded-hero.png", label: "Exploded" },
];
const progressionReports = [];
for (const step of progression) {
  const captured = await capture({
    file: step.file,
    label: `E1 ${step.label}`,
    view: "r1E1Hero",
    profile: "presentSettled",
    explode: step.value,
  });
  progressionDataUrls.push({ label: step.label, value: step.value, dataUrl: captured.dataUrl });
  progressionReports.push(await page.evaluate(() => globalThis.__WATCH__.explodedAssemblyReport()));
}

const progressionDataUrl = await page.evaluate(async (frames) => {
  const loaded = await Promise.all(frames.map(({ dataUrl }) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  })));
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1100;
  const context = canvas.getContext("2d");
  context.fillStyle = "#17191d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = "600 24px system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "top";
  const cells = [
    [20, 80], [543, 80], [1066, 80], [281, 625], [804, 625],
  ];
  for (let i = 0; i < loaded.length; i++) {
    const [x, y] = cells[i];
    context.fillStyle = "#24282e";
    context.fillRect(x, y, 513, 395);
    context.drawImage(loaded[i], x, y + 42, 513, 353);
    context.fillStyle = "#eef1f4";
    context.fillText(`${frames[i].label} · ${Math.round(frames[i].value * 100)}%`, x + 16, y + 10);
  }
  return canvas.toDataURL("image/png");
}, progressionDataUrls);
const progressionPng = Buffer.from(progressionDataUrl.split(",")[1], "base64");
fs.writeFileSync(path.join(outDir, "explode-progression.png"), progressionPng, { flag: "wx" });
images.push({
  file: "explode-progression.png",
  label: "E1 assembled-to-exploded progression",
  bytes: progressionPng.byteLength,
  sha256: sha256(progressionPng),
  png: { width: progressionPng.readUInt32BE(16), height: progressionPng.readUInt32BE(20) },
  requested: { compositeOf: progression.map(({ file, value }) => ({ file, value })) },
});

await prepare({ view: "r1E1Hero", profile: "presentSettled", explode: 0 });
const authorityAfter = await authoritySnapshot();

await page.close();
const publicPage = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
publicPage.setDefaultTimeout(300000);
attachDiagnostics(publicPage);
await publicPage.emulateMedia({ reducedMotion: "reduce" });
await publicPage.goto(`${baseUrl}/?view=r1FinalHero&t=${fixedTime}&readoutPose=${fixedPose}&explode=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await publicPage.waitForFunction(() =>
  typeof globalThis.__WATCH__?.releasePresentationReport === "function" &&
  document.querySelectorAll(".release-shell button").length === 4
);
await publicPage.waitForTimeout(1000);
const publicInitial = await publicPage.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const buttons = [...document.querySelectorAll(".release-shell button")];
  return {
    shellPresent: document.querySelector(".release-shell") !== null,
    buttonLabels: buttons.map((button) => button.textContent),
    touchTargets: buttons.map((button) => {
      const bounds = button.getBoundingClientRect();
      return { label: button.textContent, width: bounds.width, height: bounds.height };
    }),
    canvas: canvas ? {
      role: canvas.getAttribute("role"),
      label: canvas.getAttribute("aria-label"),
      describedBy: canvas.getAttribute("aria-describedby"),
      tabIndex: canvas.tabIndex,
    } : null,
    fallbackPresent: document.querySelector("#webgl-fallback") !== null,
    noscriptPresent: document.querySelector("noscript") !== null,
    report: globalThis.__WATCH__.releasePresentationReport(),
  };
});
await publicPage.getByRole("button", { name: "Exploded" }).click();
await publicPage.waitForFunction(() => globalThis.__WATCH__.explodedAssemblyReport().scalar.value === 1);
const publicExploded = await publicPage.evaluate(() => ({
  e1: globalThis.__WATCH__.explodedAssemblyReport(),
  layerItems: document.querySelectorAll(".release-shell__layers li").length,
  layerPanelVisible: !document.querySelector(".release-shell__layers")?.hidden,
}));
await publicPage.getByRole("button", { name: "Assembled" }).click();
await publicPage.waitForFunction(() => globalThis.__WATCH__.explodedAssemblyReport().scalar.value === 0);
const publicAssembled = await publicPage.evaluate(() => ({
  e1: globalThis.__WATCH__.explodedAssemblyReport(),
  report: globalThis.__WATCH__.releasePresentationReport(),
}));
await publicPage.close();
await browser.close();

const sourceAtEnd = sourceSnapshot();
const knownConsolePattern = /^THREE\.BufferGeometry: \.computeTangents\(\) failed/;
const unexpectedConsoleErrors = diagnostics.consoleErrors.filter((message) => !knownConsolePattern.test(message));
const stableRequired = [
  "final-hero.png",
  "front-elevation.png",
  "front-three-quarter.png",
  "wearable-proof.png",
  "balance-finish-macro.png",
  "sapphire-oblique.png",
  "rear-exhibition.png",
  "exploded-hero.png",
  "explode-progression.png",
];
const identity = authorityAfter.geometryAuthority.identity;
const e1Zero = authorityAfter.e1;
const gates = {
  buildPasses: build.passed,
  runtimeSourceUnchangedDuringCapture: sourceAtStart.aggregateSha256 === sourceAtEnd.aggregateSha256,
  noUnexpectedBrowserErrors:
    diagnostics.pageErrors.length === 0 &&
    unexpectedConsoleErrors.length === 0 &&
    diagnostics.requestFailures.length === 0 &&
    diagnostics.httpErrors.length === 0,
  stableImageSetComplete: stableRequired.every((file) => images.some((row) => row.file === file && row.bytes > 0)),
  primaryFramesAre1600x1100: images.filter((row) => row.file !== "explode-progression.png")
    .every((row) => row.png.width === 1600 && row.png.height === 1100),
  staticShellSuppressed: runtimeEnvironment.staticShellAbsent,
  semanticCanvas: runtimeEnvironment.canvas?.role === "img" && Boolean(runtimeEnvironment.canvas?.label) && runtimeEnvironment.canvas?.tabIndex === 0,
  b1CopyExact:
    identity?.rear?.canonicalCopy === "2.4 Hz · 17 280 · TWO HANDS" &&
    identity?.rear?.renderedCopy === "2.4 Hz · 17\u2009280 · TWO HANDS",
  b1DecimalMinimumReported: identity?.rear?.refinement?.decimalMinimumDiameterMm === 0.08,
  productAuthorityInvariantAcrossPresentation:
    exact(authorityBefore.geometryAuthority, authorityAfter.geometryAuthority) &&
    exact(authorityBefore.sapphire, authorityAfter.sapphire) &&
    exact(authorityBefore.escapement, authorityAfter.escapement) &&
    exact(authorityBefore.goingTrain, authorityAfter.goingTrain) &&
    exact(authorityBefore.displayDrive, authorityAfter.displayDrive),
  e1ExactAtZero:
    e1Zero.scalar.value === 0 &&
    e1Zero.assembledEquivalence.exactAtZero === true &&
    e1Zero.assembledEquivalence.carriersAbsentFromProductPathsAtZero === true,
  e1ProgressionDeterministic: progressionReports.every((sample, index) => {
    const value = progression[index].value;
    const eased = value * value * (3 - 2 * value);
    return sample.scalar.value === value && sample.objects.every((row) =>
      Math.abs(row.currentOffsetZ - row.canonicalOffsetZ * eased) < 1e-12 &&
      row.localTransformUnchanged && row.geometryUnchanged
    );
  }),
  publicShellControlsPresent:
    publicInitial.shellPresent &&
    ["Assembled", "Exploded", "Resume", "Reset view"].every((label) => publicInitial.buttonLabels.includes(label)),
  publicTouchTargets44Px: publicInitial.touchTargets.every((row) => row.height >= 44 && row.width >= 44),
  publicReducedMotionStartsPaused: publicInitial.report.current.reducedMotion === true && publicInitial.report.current.playbackPaused === true,
  publicExplodedLayerCommunication:
    publicExploded.e1.scalar.value === 1 && publicExploded.layerItems === 8 && publicExploded.layerPanelVisible === true,
  publicControlReturnsExactAssembled:
    publicAssembled.e1.scalar.value === 0 && publicAssembled.e1.assembledEquivalence.exactAtZero === true,
};
const passed = Object.values(gates).every(Boolean);
const captureScript = path.join(root, "scripts/capture-release-annex-r1.mjs");
const b1EvidencePath = path.join(outDir, "b1-raster-evidence/report.json");
const report = {
  schema: "watch-release-annex-r1-v1",
  annex: "R1",
  disposition: passed ? "RELEASE ANNEX R1 — PRESENTATION AND SHELL GATES PASS" : "STOP — RELEASE ANNEX R1 GATE FAILURE",
  accepted: passed,
  passed,
  startedUtc,
  completedUtc: new Date().toISOString(),
  contract: {
    fixedTimeSeconds: fixedTime,
    fixedReadoutPose: "10:10",
    viewport: [viewport.width, viewport.height],
    deviceScaleFactor: 1,
    productSourceEditedByCapture: false,
    accepted5dCCamerasAndProfilesRetained: true,
    e1ScalarAndOwnersRetained: true,
  },
  gates,
  build,
  source: {
    start: sourceAtStart,
    end: sourceAtEnd,
    captureScript: { file: path.relative(root, captureScript), sha256: sha256(fs.readFileSync(captureScript)) },
  },
  runtime: {
    requestedUrl,
    navigationStatus: navigationResponse?.status() ?? null,
    browser: { engine: "chromium", version: browserVersion, headless: true },
    playwrightVersion: JSON.parse(fs.readFileSync(path.join(root, "node_modules/playwright/package.json"), "utf8")).version,
    node: process.version,
    operatingSystem: { platform: process.platform, release: os.release(), arch: process.arch },
    page: runtimeEnvironment,
  },
  diagnostics: { ...diagnostics, unexpectedConsoleErrors },
  images,
  progression: progressionReports,
  authority: { before: authorityBefore, after: authorityAfter },
  publicShell: { initial: publicInitial, exploded: publicExploded, assembled: publicAssembled },
  b1RasterEvidence: fs.existsSync(b1EvidencePath)
    ? JSON.parse(fs.readFileSync(b1EvidencePath, "utf8"))
    : null,
  visualInspection: {
    completed: false,
    inspectedFiles: [],
    requiredHumanChecks: [
      "rear identity independently transcribes as 2.4 Hz · 17 280 · TWO HANDS",
      "wearable proof includes the buckle and at least one keeper with clear strap/background separation",
      "front elevation preserves full-loop bezel read, 12-marker hierarchy and 10:10 hand read at 320 px",
      "sapphire oblique reads as transparent planar volume without implying a dome",
      "raking after frame reveals perlage, cotes and polished anglage more clearly than the matched baseline",
    ],
  },
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
console.log(report.disposition);
for (const [name, value] of Object.entries(gates)) console.log(`${value ? "PASS" : "FAIL"} ${name}`);
if (!passed) process.exitCode = 1;
