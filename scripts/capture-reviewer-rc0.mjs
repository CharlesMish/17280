import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const root = process.cwd();
const outDir = path.join(root, "captures/reviewer-rc0");

if (fs.existsSync(outDir)) {
  throw new Error(`refusing to overwrite existing reviewer suite: ${outDir}`);
}
fs.mkdirSync(outDir, { recursive: true });

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });

const sourceFiles = [
  path.join(root, "index.html"),
  path.join(root, "package.json"),
  path.join(root, "package-lock.json"),
  path.join(root, "tsconfig.json"),
  path.join(root, "vite.config.ts"),
  ...walk(path.join(root, "src")),
].sort();
const sourceManifest = sourceFiles.map((absolute) => {
  const data = fs.readFileSync(absolute);
  const stat = fs.statSync(absolute);
  return {
    file: path.relative(root, absolute),
    bytes: data.byteLength,
    sha256: sha256(data),
    modifiedUtc: stat.mtime.toISOString(),
  };
});
const sourceAggregateSha256 = sha256(Buffer.from(
  sourceManifest.map(({ file, bytes, sha256: digest }) => `${file}\0${bytes}\0${digest}\n`).join(""),
));

const startedUtc = new Date().toISOString();
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);

const pageErrors = [];
const consoleErrors = [];
const requestFailures = [];
const httpErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("requestfailed", (request) => {
  requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" });
});
page.on("response", (response) => {
  if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() });
});

const requestedUrl = `${baseUrl}/?static=1&view=presentHero&t=0.104&readoutPose=1010&explode=0`;
const navigationResponse = await page.goto(requestedUrl, { waitUntil: "commit", timeout: 60000 });
await page.waitForFunction(
  () =>
    typeof globalThis.__WATCH__?.capture === "function" &&
    typeof globalThis.__WATCH__?.phase5dPresentationReport === "function" &&
    typeof globalThis.__WATCH__?.explodedAssemblyReport === "function",
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
    devicePixelRatio: devicePixelRatio,
    viewport: { innerWidth, innerHeight },
    canvas: canvas
      ? {
          pixelWidth: canvas.width,
          pixelHeight: canvas.height,
          cssWidth: canvas.clientWidth,
          cssHeight: canvas.clientHeight,
        }
      : null,
    webgl: gl
      ? {
          context: gl instanceof WebGL2RenderingContext ? "webgl2" : "webgl",
          vendor: gl.getParameter(gl.VENDOR),
          renderer: gl.getParameter(gl.RENDERER),
          version: gl.getParameter(gl.VERSION),
          shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
          unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
          unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
          maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        }
      : null,
  };
});

const suite = [
  { file: "01-final-hero.png", label: "Whole-watch hero", view: "presentHero", profile: "presentHero", explode: null },
  { file: "02-front-three-quarter.png", label: "Front three-quarter", view: "presentThreeQuarter", profile: "presentSettled", explode: null },
  { file: "03-clean-front.png", label: "Clean front", view: "extFront", profile: "presentSettled", explode: null },
  { file: "04-balance-macro.png", label: "Balance macro", view: "finishBalance", profile: "middle", explode: null },
  { file: "05-sapphire-oblique.png", label: "Sapphire oblique", view: "extHero", profile: "conservative", explode: null },
  { file: "06-rear-exhibition.png", label: "Rear exhibition", view: "extRear", profile: "rear", explode: null },
  { file: "07-assembled-reference.png", label: "Assembled reference", view: "presentExploded", profile: "presentSettled", explode: 0 },
  { file: "08-exploded-hero.png", label: "Exploded 100%", view: "presentExploded", profile: "presentSettled", explode: 1 },
  { file: "09-exploded-side-oblique.png", label: "Exploded side/oblique", view: "presentExplodedSide", profile: "presentSettled", explode: 1 },
  { file: "10-crown-macro.png", label: "Crown profile macro", view: "extCrownProfile", profile: "presentSettled", explode: null },
];

async function prepare({ view, profile, explode }) {
  await page.evaluate(({ view, profile, explode }) => {
    const watch = globalThis.__WATCH__;
    watch.setPhase5dB2FamilyId(false);
    watch.setPhase5dB2Diagnostic("product");
    watch.setView(view);
    watch.setReadoutPose("1010");
    watch.setTime(0.104);
    watch.setDebug(false);
    watch.setPhase5dCProfile(profile);
    if (explode !== null) watch.setExplode(explode);
  }, { view, profile, explode });
  await page.waitForTimeout(500);
}

async function capture(specification) {
  await prepare(specification);
  const result = await page.evaluate(() => {
    const watch = globalThis.__WATCH__;
    const dataUrl = watch.capture();
    const phase5d = watch.phase5dPresentationReport();
    const annexE1 = watch.explodedAssemblyReport();
    return {
      dataUrl,
      state: {
        camera: annexE1.currentCamera,
        lighting: phase5d.lighting,
        renderer: phase5d.renderer,
        explosion: {
          scalar: annexE1.scalar,
          presentationOnly: annexE1.presentationOnly,
          disposition: annexE1.disposition,
        },
      },
    };
  });
  const data = Buffer.from(result.dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(outDir, specification.file), data, { flag: "wx" });
  return {
    file: specification.file,
    label: specification.label,
    bytes: data.byteLength,
    sha256: sha256(data),
    png: { width: data.readUInt32BE(16), height: data.readUInt32BE(20) },
    requestedState: {
      view: specification.view,
      phase5dProfile: specification.profile,
      timeSeconds: 0.104,
      readoutPose: "10:10",
      readoutPoseParameter: "1010",
      explode: specification.explode,
      diagnostic: "product",
      debug: false,
      familyId: false,
    },
    runtimeState: result.state,
    visualInspection: null,
  };
}

const images = [];
for (const specification of suite) {
  images.push(await capture(specification));
  console.log("ok", specification.file);
}

await page.evaluate(() => {
  globalThis.__WATCH__.setView("presentHero");
  globalThis.__WATCH__.setReadoutPose("1010");
  globalThis.__WATCH__.setTime(0.104);
  globalThis.__WATCH__.setPhase5dCProfile("presentHero");
});
const authority = await page.evaluate(() => ({
  phase5d: globalThis.__WATCH__.phase5dPresentationReport(),
  annexE1AtAssembledState: globalThis.__WATCH__.explodedAssemblyReport(),
  escapement: globalThis.__WATCH__.escapementRepairReport(),
  goingTrain: globalThis.__WATCH__.kinematicReport([0.104, 60.104]),
  displayDrive: globalThis.__WATCH__.displayDriveReport([0.104, 60.104]),
}));

const captureScript = path.join(root, "scripts/capture-reviewer-rc0.mjs");
const playwrightPackage = JSON.parse(fs.readFileSync(path.join(root, "node_modules/playwright/package.json"), "utf8"));
const report = {
  schema: "watch-reviewer-rc0-capture-v1",
  disposition: "FRESH CURRENT-SOURCE REVIEWER SUITE CAPTURED — PRODUCT SOURCE UNTOUCHED",
  productSourceEditedByCapture: false,
  startedUtc,
  completedUtc: new Date().toISOString(),
  captureContract: {
    phase5dAuthority: "accepted Phase 5D-C cameras and per-view lighting profiles",
    explodedAuthority: "accepted Presentation Annex E1 cameras and scalar",
    fixedTimeSeconds: 0.104,
    fixedReadoutPose: "10:10",
    viewport: [1600, 1100],
    deviceScaleFactor: 1,
  },
  runtime: {
    requestedUrl,
    resolvedUrl: page.url(),
    navigationStatus: navigationResponse?.status() ?? null,
    browser: { engine: "chromium", version: browser.version(), headless: true },
    playwrightVersion: playwrightPackage.version,
    node: process.version,
    operatingSystem: { platform: process.platform, release: os.release(), arch: process.arch },
    launchArguments: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
    page: runtimeEnvironment,
  },
  source: {
    vcs: "unavailable: workspace .git metadata is not populated",
    aggregateSha256: sourceAggregateSha256,
    fileCount: sourceManifest.length,
    files: sourceManifest,
    captureScript: {
      file: path.relative(root, captureScript),
      sha256: sha256(fs.readFileSync(captureScript)),
    },
  },
  browserErrors: {
    pageErrors,
    consoleErrors,
    requestFailures,
    httpErrors,
    clean: pageErrors.length + consoleErrors.length + requestFailures.length + httpErrors.length === 0,
  },
  images,
  visualInspection: {
    completed: false,
    method: null,
    inspectedFiles: [],
    notes: [],
  },
  authority,
};
fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });

await page.evaluate(() => globalThis.__WATCH__.clearReadoutPose());
await browser.close();
console.log("done", path.relative(root, outDir));
