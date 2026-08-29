import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const root = process.cwd();
const outDir = path.join(root, "captures/reviewer-rc0");
const reportPath = path.join(outDir, "report.json");
const outputPath = path.join(outDir, "11-explode-progression-strip.png");
const replace = process.argv.includes("--replace");
if (!fs.existsSync(reportPath)) throw new Error(`missing primary reviewer report: ${reportPath}`);
if (fs.existsSync(outputPath) && !replace) throw new Error(`refusing to overwrite: ${outputPath}`);

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const toDataUrl = (data) => `data:image/png;base64,${data.toString("base64")}`;
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

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

await page.goto(`${baseUrl}/?static=1&view=presentExploded&t=0.104&readoutPose=1010&explode=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(
  () =>
    typeof globalThis.__WATCH__?.capture === "function" &&
    typeof globalThis.__WATCH__?.phase5dPresentationReport === "function" &&
    typeof globalThis.__WATCH__?.explodedAssemblyReport === "function",
);
await page.waitForTimeout(1600);

async function renderIntermediate(value) {
  await page.evaluate((value) => {
    const watch = globalThis.__WATCH__;
    watch.setPhase5dB2FamilyId(false);
    watch.setPhase5dB2Diagnostic("product");
    // The first call synchronizes OrbitControls' spherical cache after the
    // URL-seeded camera; the second reapplies the accepted authority exactly.
    watch.setView("presentExploded");
    watch.setView("presentExploded");
    watch.setReadoutPose("1010");
    watch.setTime(0.104);
    watch.setDebug(false);
    watch.setPhase5dCProfile("presentSettled");
    watch.setExplode(value);
  }, value);
  // Match the accepted Annex E1 capture cadence and allow OrbitControls to
  // settle before the render and exact-camera witness are sampled.
  await page.waitForTimeout(500);
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
  console.log("ok", value);
  return {
    value,
    data,
    bytes: data.byteLength,
    sha256: sha256(data),
    state: result.state,
  };
}

const endpointZero = fs.readFileSync(path.join(outDir, "07-assembled-reference.png"));
const endpointOne = fs.readFileSync(path.join(outDir, "08-exploded-hero.png"));
// Discard one first render: Chromium's URL-seeded OrbitControls cache is only
// fully normalized after that render. The retained 0.25 frame below then uses
// the same exact runtime camera transform as the later panels and endpoints.
await renderIntermediate(0.25);
const intermediate025 = await renderIntermediate(0.25);
const intermediate050 = await renderIntermediate(0.5);
const intermediate075 = await renderIntermediate(0.75);
const panels = [
  { value: 0, data: endpointZero },
  { value: 0.25, data: intermediate025.data },
  { value: 0.5, data: intermediate050.data },
  { value: 0.75, data: intermediate075.data },
  { value: 1, data: endpointOne },
];

const tilePositions = [
  { x: 30, y: 88 },
  { x: 550, y: 88 },
  { x: 1070, y: 88 },
  { x: 290, y: 590 },
  { x: 810, y: 590 },
];
const compositeDataUrl = await page.evaluate(async ({ sources, positions }) => {
  const load = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
  const images = await Promise.all(sources.map((source) => load(source.dataUrl)));
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1100;
  const context = canvas.getContext("2d");
  context.fillStyle = "#17191d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#e5e8ec";
  context.font = "600 24px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("ASSEMBLY EXPLOSION PROGRESSION — FIXED ANNEX E1 CAMERA", 800, 42);
  const tileWidth = 500;
  const tileHeight = 343.75;
  images.forEach((image, index) => {
    const { x, y } = positions[index];
    context.drawImage(image, x, y, tileWidth, tileHeight);
    context.strokeStyle = "#626872";
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, tileWidth - 1, tileHeight - 1);
    context.fillStyle = "#f0f2f4";
    context.font = "600 21px system-ui, sans-serif";
    context.fillText(`EXPLODE ${sources[index].label}`, x + tileWidth / 2, y + tileHeight + 32);
  });
  context.fillStyle = "#aeb4bc";
  context.font = "16px system-ui, sans-serif";
  context.fillText("presentExploded · t = 0.104 s · hands = 10:10 · settled Phase 5D-C light", 800, 1063);
  return canvas.toDataURL("image/png");
}, {
  sources: panels.map((panel) => ({ dataUrl: toDataUrl(panel.data), label: panel.value.toFixed(2) })),
  positions: tilePositions,
});
const composite = Buffer.from(compositeDataUrl.split(",")[1], "base64");
fs.writeFileSync(outputPath, composite, { flag: replace ? "w" : "wx" });

const endpointRow = (file) => report.images.find((row) => row.file === file);
const mapping = [
  { panel: 1, explode: 0, source: "07-assembled-reference.png", reusedFreshEndpoint: true, state: endpointRow("07-assembled-reference.png").runtimeState },
  { panel: 2, explode: 0.25, source: "fresh in-memory current-source render", reusedFreshEndpoint: false, bytes: intermediate025.bytes, sha256: intermediate025.sha256, state: intermediate025.state },
  { panel: 3, explode: 0.5, source: "fresh in-memory current-source render", reusedFreshEndpoint: false, bytes: intermediate050.bytes, sha256: intermediate050.sha256, state: intermediate050.state },
  { panel: 4, explode: 0.75, source: "fresh in-memory current-source render", reusedFreshEndpoint: false, bytes: intermediate075.bytes, sha256: intermediate075.sha256, state: intermediate075.state },
  { panel: 5, explode: 1, source: "08-exploded-hero.png", reusedFreshEndpoint: true, state: endpointRow("08-exploded-hero.png").runtimeState },
].map((row, index) => ({ ...row, tile: { ...tilePositions[index], width: 500, height: 343.75 } }));

report.images = report.images.filter((row) => row.file !== "11-explode-progression-strip.png");
report.images.push({
  file: "11-explode-progression-strip.png",
  label: "Five-state fixed-camera explosion progression",
  bytes: composite.byteLength,
  sha256: sha256(composite),
  png: { width: composite.readUInt32BE(16), height: composite.readUInt32BE(20) },
  requestedState: {
    view: "presentExploded",
    phase5dProfile: "presentSettled",
    timeSeconds: 0.104,
    readoutPose: "10:10",
    readoutPoseParameter: "1010",
    explode: [0, 0.25, 0.5, 0.75, 1],
    diagnostic: "product",
    debug: false,
    familyId: false,
  },
  panelMapping: mapping,
  montage: {
    canvas: [1600, 1100],
    layout: "three equal-aspect panels on row one; two equal-aspect centered on row two",
    sourceAspectPreserved: true,
    sourceResolution: [1600, 1100],
    tileResolution: [500, 343.75],
  },
  visualInspection: null,
});
report.progression = {
  file: "11-explode-progression-strip.png",
  fixedCameraAuthority: "Presentation Annex E1 presentExploded",
  fixedLightingAuthority: "Phase 5D-C presentSettled",
  mapping,
  browserErrors: { pageErrors, consoleErrors, requestFailures, httpErrors },
};
report.browserErrors.pageErrors = [...new Set([...report.browserErrors.pageErrors, ...pageErrors])];
report.browserErrors.consoleErrors = [...new Set([...report.browserErrors.consoleErrors, ...consoleErrors])];
report.browserErrors.requestFailures = [
  ...new Map(
    [...report.browserErrors.requestFailures, ...requestFailures].map((row) => [`${row.url}\0${row.error}`, row]),
  ).values(),
];
report.browserErrors.httpErrors = [
  ...new Map(
    [...report.browserErrors.httpErrors, ...httpErrors].map((row) => [`${row.url}\0${row.status}`, row]),
  ).values(),
];
report.browserErrors.clean =
  report.browserErrors.pageErrors.length +
    report.browserErrors.consoleErrors.length +
    report.browserErrors.requestFailures.length +
    report.browserErrors.httpErrors.length === 0;
report.source.progressionScript = {
  file: "scripts/capture-reviewer-rc0-progression.mjs",
  sha256: sha256(fs.readFileSync(path.join(root, "scripts/capture-reviewer-rc0-progression.mjs"))),
};
report.completedUtc = new Date().toISOString();
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
await page.evaluate(() => globalThis.__WATCH__.clearReadoutPose());
await browser.close();
console.log("done", path.relative(root, outputPath));
