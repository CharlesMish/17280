import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const root = process.cwd();
const outDir = path.join(root, "captures/post5dc-rear-engraving");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
await page.goto(`${baseUrl}/?static=1&view=extRear&t=0.104&readoutPose=1010`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => globalThis.__WATCH__?.phase5dPresentationReport !== undefined);
await page.evaluate(() => {
  const watch = globalThis.__WATCH__;
  watch.setPhase5dB2FamilyId(false);
  watch.setPhase5dB2Diagnostic("product");
  watch.setView("extRear");
  watch.setReadoutPose("1010");
  watch.setTime(0.104);
  watch.setDebug(false);
  watch.setPhase5dCProfile("rear");
});
await page.waitForTimeout(900);

const dataUrl = await page.evaluate(() => globalThis.__WATCH__.capture());
const image = Buffer.from(dataUrl.split(",")[1], "base64");
const imagePath = path.join(outDir, "rear-exhibition-after.png");
fs.writeFileSync(imagePath, image);

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
  phase: "POST-5D-C rear engraving refinement",
  browserErrors,
  afterImage: {
    file: "rear-exhibition-after.png",
    bytes: image.byteLength,
    sha256: crypto.createHash("sha256").update(image).digest("hex"),
  },
  reports,
}, null, 2)}\n`);
await browser.close();
console.log("POST-5D-C rear engraving capture complete");
