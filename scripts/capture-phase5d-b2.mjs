import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const skipCandidates = process.argv.includes("--skip-candidates");
const reportRefresh = process.argv.includes("--report-refresh");
const root = process.cwd();
const outDir = path.join(root, "captures/phase5d-b2-technical-cleanup");
const matchedDir = path.join(outDir, "matched");
const candidatesDir = path.join(outDir, "candidates");
fs.mkdirSync(matchedDir, { recursive: true });
fs.mkdirSync(candidatesDir, { recursive: true });

const b1 = path.join(root, "captures/phase5d-b1-diagnostic");
for (const [source, target] of [
  ["exterior-extWestOblique-finished.png", "exterior-extWestOblique-before.png"],
  ["exterior-extRear-finished.png", "exterior-extRear-before.png"],
]) {
  fs.copyFileSync(path.join(b1, source), path.join(matchedDir, target));
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
await page.goto(`${baseUrl}/?static=1&view=extHero&t=0.104`, { waitUntil: "commit", timeout: 60000 });
await page.waitForFunction(() => globalThis.__WATCH__?.setPhase5dB2Diagnostic !== undefined);
await page.waitForTimeout(1200);
const topologyPreflight = await page.evaluate(() => globalThis.__WATCH__.exteriorReport().opticalOwnership);
if (
  topologyPreflight?.bodies?.length !== 2 ||
  topologyPreflight.bodies.some((body) => body.removedInternalFaces <= 0)
) {
  throw new Error(`Optical topology preflight failed: ${JSON.stringify(topologyPreflight)}`);
}
await page.evaluate(() => { globalThis.__B2_BUFFERS__ = new Map(); });

if (reportRefresh) {
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
  const reportPath = path.join(outDir, "runtime-report.json");
  const prior = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  fs.writeFileSync(reportPath, `${JSON.stringify({ ...prior, browserErrors, reports }, null, 2)}\n`);
  await browser.close();
  console.log("PHASE 5D-B.2 report refreshed");
  process.exit(0);
}

async function prepare(view) {
  await page.evaluate((nextView) => {
    const watch = globalThis.__WATCH__;
    watch.setPhase5dB2FamilyId(false);
    watch.setPhase5dB2Diagnostic("product");
    watch.setView(nextView);
    watch.setTime(0.104);
    watch.setDebug(false);
    watch.clearReadoutPose();
    watch.setPhase5dB2Profile("authoritative", nextView === "finishBalance" ? "macro" : "hero");
  }, view);
  await page.waitForTimeout(350);
}

async function capture(file, key = file) {
  const dataUrl = await page.evaluate((bufferKey) => {
    const dataUrl = globalThis.__WATCH__.capture();
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const raw = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const row = canvas.width * 4;
    const pixels = new Uint8Array(raw.length);
    for (let y = 0; y < canvas.height; y++) {
      pixels.set(raw.subarray(y * row, (y + 1) * row), (canvas.height - 1 - y) * row);
    }
    globalThis.__B2_BUFFERS__.set(bufferKey, pixels);
    return dataUrl;
  }, key);
  fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(",")[1], "base64"));
}

for (const [view, label] of [
  ["extHero", "front-oblique"],
  ["finishBalance", "balance-macro"],
  ["extRear", "rear-oblique"],
]) {
  await prepare(view);
  await page.evaluate(() => globalThis.__WATCH__.setPhase5dB2Diagnostic("legacySapphire"));
  await capture(`matched/sapphire-${label}-legacy.png`, `${label}:legacy`);
  await page.evaluate(() => globalThis.__WATCH__.setPhase5dB2Diagnostic("product"));
  await capture(`matched/sapphire-${label}-corrected.png`, `${label}:corrected`);
  await page.evaluate(() => globalThis.__WATCH__.setPhase5dB2Diagnostic("flatSapphire"));
  await capture(`matched/sapphire-${label}-flat-no-refraction.png`, `${label}:flat`);
  await page.evaluate(() => globalThis.__WATCH__.setPhase5dB2Diagnostic("sapphireId"));
  await capture(`matched/sapphire-${label}-optical-owner-id.png`, `${label}:id`);
}

for (const view of ["extWestOblique", "extRear"]) {
  await prepare(view);
  await capture(`matched/exterior-${view}-after.png`, `${view}:finished`);
  await page.evaluate(() => globalThis.__WATCH__.setPhase5dB2Diagnostic("roughnessFlat"));
  await capture(`matched/exterior-${view}-roughness-flat.png`, `${view}:roughnessFlat`);
}

for (const view of ["extProduct", "finishBalance"]) {
  await prepare(view);
  await capture(`matched/readability-${view}-finished.png`, `${view}:readabilityNormal`);
  await page.evaluate(() => globalThis.__WATCH__.setPhase5dB2FamilyId(true));
  await capture(`matched/readability-${view}-family-id.png`, `${view}:readabilityId`);
  await page.evaluate(() => globalThis.__WATCH__.setPhase5dB2FamilyId(false));
}

const profiles = ["conservative", "middle", "bright"];
if (!skipCandidates) {
  for (const profile of profiles) {
    await prepare("extProduct");
    await page.evaluate((nextProfile) => globalThis.__WATCH__.setPhase5dB2Profile(nextProfile, "hero"), profile);
    await capture(`candidates/hero-${profile}.png`, `hero:${profile}`);
    await prepare("finishBalance");
    await page.evaluate((nextProfile) => globalThis.__WATCH__.setPhase5dB2Profile(nextProfile, "macro"), profile);
    await capture(`candidates/macro-${profile}.png`, `macro:${profile}`);
  }
}

await prepare("extProduct");
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

const metrics = await page.evaluate(() => {
  const buffers = globalThis.__B2_BUFFERS__;
  const linear = (value) => {
    value /= 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (pixels, i) =>
    0.2126 * linear(pixels[i]) + 0.7152 * linear(pixels[i + 1]) + 0.0722 * linear(pixels[i + 2]);
  const difference = (aKey, bKey) => {
    const a = buffers.get(aKey);
    const b = buffers.get(bKey);
    let count = 0;
    let sum = 0;
    let sum2 = 0;
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      const delta = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
      sum += delta;
      sum2 += delta * delta;
      if (delta > 2) changed++;
      count++;
    }
    return { pixels: count, mae8bit: sum / count, rmse8bit: Math.sqrt(sum2 / count), fractionChangedGt2: changed / count };
  };
  const palette = {
    case: [255, 53, 94], barrel: [255, 176, 0], train: [0, 208, 132], rubies: [255, 0, 255],
    hourHand: [0, 168, 255], minuteHand: [0, 80, 255], chapter: [255, 255, 255], bridge: [154, 114, 255],
    hairspring: [0, 255, 255], balance: [255, 255, 0], other: [22, 22, 22],
  };
  const quantiles = (values) => {
    values.sort((a, b) => a - b);
    const q = (p) => values[Math.min(values.length - 1, Math.floor(p * (values.length - 1)))] ?? 0;
    return { pixels: values.length, median: q(0.5), p90: q(0.9), fractionAtOrBelow005: values.filter((v) => v <= 0.05).length / Math.max(1, values.length) };
  };
  const readability = (view) => {
    const normal = buffers.get(`${view}:readabilityNormal`);
    const id = buffers.get(`${view}:readabilityId`);
    const families = Object.fromEntries(Object.keys(palette).map((key) => [key, []]));
    const subject = [];
    for (let i = 0; i < id.length; i += 4) {
      let owner = null;
      for (const [name, rgb] of Object.entries(palette)) {
        if (Math.abs(id[i] - rgb[0]) <= 2 && Math.abs(id[i + 1] - rgb[1]) <= 2 && Math.abs(id[i + 2] - rgb[2]) <= 2) {
          owner = name;
          break;
        }
      }
      if (!owner) continue;
      const value = luminance(normal, i);
      families[owner].push(value);
      subject.push(value);
    }
    return {
      view,
      subject: quantiles(subject),
      families: Object.fromEntries(Object.entries(families).map(([name, values]) => [name, quantiles(values)])),
    };
  };
  return {
    sapphire: ["front-oblique", "balance-macro", "rear-oblique"].map((label) => ({
      view: label,
      legacyToCorrected: difference(`${label}:legacy`, `${label}:corrected`),
      correctedToFlat: difference(`${label}:corrected`, `${label}:flat`),
    })),
    finish: ["extWestOblique", "extRear"].map((view) => ({
      view,
      finishedToRoughnessFlat: difference(`${view}:finished`, `${view}:roughnessFlat`),
    })),
    readability: [readability("extProduct"), readability("finishBalance")],
  };
});

fs.writeFileSync(
  path.join(outDir, "runtime-report.json"),
  `${JSON.stringify({ phase: "5D-B.2", browserErrors, reports, metrics }, null, 2)}\n`,
);
await browser.close();
console.log("PHASE 5D-B.2 captures complete");
