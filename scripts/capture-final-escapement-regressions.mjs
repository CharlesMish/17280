import { chromium } from "playwright";
import fs from "node:fs";

const outPath = process.argv[2] || "captures/pre5d-escapement-repair/final/full-regression-report.json";
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.setDefaultTimeout(300000);
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
await page.goto(`${baseUrl}/?static=1&view=threeQuarter&t=0.104`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => globalThis.__WATCH__?.displayDriveReport !== undefined);
await page.waitForTimeout(900);
const report = await page.evaluate(() => ({
  mechanical: globalThis.__WATCH__.escapementRepairReport(),
  goingTrain: globalThis.__WATCH__.kinematicReport([0.104, 10.104, 60.104, 210.104]),
  phase4b: globalThis.__WATCH__.displayDriveReport([0.104, 60.104]),
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
}));
fs.writeFileSync(outPath, `${JSON.stringify({ ...report, browserErrors }, null, 2)}\n`);
await browser.close();
