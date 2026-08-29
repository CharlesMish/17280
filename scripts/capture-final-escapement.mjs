import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "captures/pre5d-escapement-repair/final";
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));

await page.goto(`${baseUrl}/?static=1&view=structTop&t=0.104&accommodation=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => globalThis.__WATCH__?.escapementRepairReport !== undefined);
await page.waitForTimeout(900);

const capture = async (file, view, time, audit = false) => {
  await page.evaluate(({ view, time, audit }) => {
    globalThis.__WATCH__.setAudit(audit);
    globalThis.__WATCH__.setView(view);
    globalThis.__WATCH__.setTime(time);
    globalThis.__WATCH__.setDebug(false);
  }, { view, time, audit });
  await page.waitForTimeout(250);
  const dataUrl = await page.evaluate(() => globalThis.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", file);
};

await capture("after-normal-top.png", "structTop", 0.104);
await capture("after-flat-structure-id.png", "structTop", 0.104, true);
await capture("after-escapement-close.png", "structEscape", 0.104);
await capture("after-side-z-witness.png", "structProfile", 0.104);
await capture("runtime-balance-neg132.png", "structEscape", 0);
await capture("runtime-pickup.png", "structEscape", 0.10416666666666667);
await capture("runtime-next-lock.png", "structEscape", 0.20833333333333334);
await capture("runtime-return.png", "structEscape", 0.3125);
await capture("regression-three-quarter.png", "threeQuarter", 0.104);
await capture("regression-top.png", "top", 0.104);

await page.evaluate(() => globalThis.__WATCH__.setAudit(false));
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
fs.writeFileSync(
  path.join(outDir, "runtime-report.json"),
  `${JSON.stringify({ ...report, browserErrors }, null, 2)}\n`,
);

await browser.close();
console.log("done", outDir);
