import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const framingOnly = process.argv.includes("--framing-only");
const rearOnly = process.argv.includes("--rear-only");
const reportOnly = process.argv.includes("--report-only");
const root = process.cwd();
const outDir = path.join(root, "captures/phase5d-c");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
await page.goto(`${baseUrl}/?static=1&view=presentHero&t=0.104&readoutPose=1010`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => globalThis.__WATCH__?.setPhase5dCProfile !== undefined);
await page.waitForTimeout(1800);

async function prepare(view, profile) {
  await page.evaluate(({ view, profile }) => {
    const watch = globalThis.__WATCH__;
    watch.setPhase5dB2FamilyId(false);
    watch.setPhase5dB2Diagnostic("product");
    watch.setView(view);
    watch.setReadoutPose("1010");
    watch.setTime(0.104);
    watch.setDebug(false);
    watch.setPhase5dCProfile(profile);
  }, { view, profile });
  await page.waitForTimeout(450);
}

async function capture(file) {
  const dataUrl = await page.evaluate(() => globalThis.__WATCH__.capture());
  const data = Buffer.from(dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(outDir, file), data);
  return { file, bytes: data.byteLength, sha256: crypto.createHash("sha256").update(data).digest("hex") };
}

const suite = [
  ["final-hero.png", "presentHero", "presentHero"],
  ["front-three-quarter.png", "presentThreeQuarter", "presentSettled"],
  ["balance-macro.png", "finishBalance", "middle"],
  ["sapphire-oblique.png", "extHero", "conservative"],
  ["rear-exhibition.png", "extRear", "rear"],
];
const images = [];
const selectedSuite = reportOnly ? [] : rearOnly ? [suite[4]] : framingOnly ? [suite[0], suite[1], suite[4]] : suite;
for (const [file, view, profile] of selectedSuite) {
  await prepare(view, profile);
  images.push(await capture(file));
}

if (!framingOnly && !rearOnly && !reportOnly) {
  await prepare("extCrownProfile", "presentSettled");
  images.push(await capture("identity-crown-cap.png"));
}

const priorRuntime = fs.existsSync(path.join(outDir, "runtime-report.json"))
  ? JSON.parse(fs.readFileSync(path.join(outDir, "runtime-report.json"), "utf8"))
  : null;
const frameMetrics = rearOnly || reportOnly ? priorRuntime?.frameMetrics ?? [] : [];
for (const [view, profile] of (rearOnly || reportOnly ? [] : [["presentHero", "presentHero"], ["presentThreeQuarter", "presentSettled"]])) {
  await prepare(view, profile);
  await page.evaluate(() => globalThis.__WATCH__.setPhase5dB2FamilyId(true));
  const metric = await page.evaluate((view) => {
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const raw = new Uint8Array(canvas.width * canvas.height * 4);
    globalThis.__WATCH__.capture();
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        // Phase-5D family ID assigns the complete exterior/crown/lugs to
        // #ff355e. Measuring that owner excludes the intentionally cropped
        // charcoal strap heads from whole-watch breathing-room statistics.
        if (Math.abs(raw[i] - 255) > 3 || Math.abs(raw[i + 1] - 53) > 3 || Math.abs(raw[i + 2] - 94) > 3) continue;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y); count++;
      }
    }
    const top = canvas.height - 1 - maxY;
    const bottom = minY;
    return {
      view,
      canvas: [canvas.width, canvas.height],
      subjectPixels: count,
      bounds: { minX, maxX, minY: top, maxY: canvas.height - 1 - bottom },
      breathingFraction: {
        left: minX / canvas.width,
        right: (canvas.width - 1 - maxX) / canvas.width,
        top: top / canvas.height,
        bottom: bottom / canvas.height,
      },
    };
  }, view);
  frameMetrics.push(metric);
  await page.evaluate(() => globalThis.__WATCH__.setPhase5dB2FamilyId(false));
}

for (const file of [...suite.map((row) => row[0]), "identity-crown-cap.png"]) {
  if (images.some((row) => row.file === file)) continue;
  const data = fs.readFileSync(path.join(outDir, file));
  images.push({ file, bytes: data.byteLength, sha256: crypto.createHash("sha256").update(data).digest("hex") });
}

await prepare("presentHero", "presentHero");
await page.evaluate(() => globalThis.__WATCH__.clearReadoutPose());
const reports = await page.evaluate(() => ({
  escapement: globalThis.__WATCH__.escapementRepairReport(),
  phase4b: globalThis.__WATCH__.displayDriveReport([0.104, 60.104]),
  goingTrain: globalThis.__WATCH__.kinematicReport([0.104, 60.104]),
  authority: {
    structure: globalThis.__WATCH__.structureReport(),
    assembly: globalThis.__WATCH__.assemblyReport(),
    accommodation: globalThis.__WATCH__.accommodationReport(),
    display: globalThis.__WATCH__.displayReport(),
    enclosure: globalThis.__WATCH__.enclosureReport(),
    exterior: globalThis.__WATCH__.exteriorReport(),
    readout: globalThis.__WATCH__.readoutReport(),
    finish: globalThis.__WATCH__.finishReport(),
    strap: globalThis.__WATCH__.strapReport(),
  },
  phase5d: globalThis.__WATCH__.phase5dPresentationReport(),
}));

fs.writeFileSync(path.join(outDir, "runtime-report.json"), `${JSON.stringify({
  phase: "5D-C",
  browserErrors,
  images,
  frameMetrics,
  reports,
}, null, 2)}\n`);
await browser.close();
console.log("PHASE 5D-C captures complete");
