import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const stage = process.argv[2];
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
if (stage !== "before" && stage !== "after") {
  console.error("usage: capture-phase5d-report.mjs before|after [baseUrl]");
  process.exit(1);
}
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
const comparison = stage === "before" ? "&phase5dBaseline=1" : "";
await page.goto(`${baseUrl}/?static=1&view=extFront&t=0.104${comparison}`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => globalThis.__WATCH__?.phase5dPresentationReport !== undefined);
await page.waitForTimeout(900);
const report = await page.evaluate(() => ({
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
const out = path.join(`captures/phase5d-ab/${stage}`, "report.json");
fs.writeFileSync(out, `${JSON.stringify({ ...report, browserErrors }, null, 2)}\n`);
await browser.close();
