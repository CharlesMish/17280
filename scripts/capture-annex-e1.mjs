import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const resume = process.argv.includes("--resume");
const root = process.cwd();
const outDir = path.join(root, "captures/annex-e1-exploded");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
await page.goto(`${baseUrl}/?static=1&view=presentExploded&t=0.104&readoutPose=1010`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => globalThis.__WATCH__?.explodedAssemblyReport !== undefined);
await page.waitForTimeout(1600);

async function prepare(view, explode) {
  await page.evaluate(({ view, explode }) => {
    const watch = globalThis.__WATCH__;
    watch.setPhase5dB2FamilyId(false);
    watch.setPhase5dB2Diagnostic("product");
    watch.setView(view);
    watch.setReadoutPose("1010");
    watch.setTime(0.104);
    watch.setDebug(false);
    watch.setPhase5dCProfile("presentSettled");
    watch.setExplode(explode);
  }, { view, explode });
  await page.waitForTimeout(420);
}

async function capture(file) {
  const dataUrl = await page.evaluate(() => globalThis.__WATCH__.capture());
  const data = Buffer.from(dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(outDir, file), data);
  return {
    file,
    bytes: data.byteLength,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

function existing(file) {
  const data = fs.readFileSync(path.join(outDir, file));
  return {
    file,
    bytes: data.byteLength,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

const samples = [
  [0, "assembled-reference.png"],
  [0.25, "exploded-025.png"],
  [0.5, "exploded-050.png"],
  [0.75, "exploded-075.png"],
  [1, "exploded-100.png"],
];
const images = [];
const transformSamples = [];
for (const [value, file] of samples) {
  await prepare("presentExploded", value);
  images.push(resume ? existing(file) : await capture(file));
  transformSamples.push(await page.evaluate(() => globalThis.__WATCH__.explodedAssemblyReport()));
}

await prepare("presentExploded", 1);
images.push(resume ? existing("final-exploded-hero.png") : await capture("final-exploded-hero.png"));
const activeReport = await page.evaluate(() => globalThis.__WATCH__.explodedAssemblyReport());

await prepare("presentExplodedSide", 1);
images.push(await capture("exploded-side-oblique.png"));
const sideReport = await page.evaluate(() => globalThis.__WATCH__.explodedAssemblyReport());

await prepare("presentExploded", 0);
const zeroReport = await page.evaluate(() => globalThis.__WATCH__.explodedAssemblyReport());
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
  annex: "E1",
  disposition: "PRESENTATION ANNEX E1 — EXPLODED ASSEMBLY CLOSED",
  browserErrors,
  images,
  transformSamples,
  activeReport,
  sideReport,
  zeroReport,
  reports,
}, null, 2)}\n`);

await browser.close();
console.log("PRESENTATION ANNEX E1 captures complete");
