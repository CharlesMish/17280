import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "captures/pre5d-integrity/regression";
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  ["front", "extFront"],
  ["front-hero", "strapHero"],
  ["front-three-quarter", "strapProduct"],
  ["rear-three-quarter", "strapRear"],
];

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
page.on("pageerror", (error) => console.error("PAGEERROR", error));

await page.goto(`${baseUrl}/?static=1&view=strapHero&t=0.104&readoutPose=1010`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => window.__WATCH__ !== undefined, { timeout: 240000 });
await page.waitForTimeout(700);

for (const [file, view] of shots) {
  await page.evaluate((nextView) => {
    window.__WATCH__.setReadoutPose("1010");
    window.__WATCH__.setView(nextView);
    window.__WATCH__.setTime(0.104);
    window.__WATCH__.setDebug(false);
  }, view);
  await page.waitForTimeout(300);
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, `${file}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", file);
}

const report = await page.evaluate(() => ({
  structure: window.__WATCH__.structureReport(),
  assembly: window.__WATCH__.assemblyReport(),
  accommodation: window.__WATCH__.accommodationReport(),
  display: window.__WATCH__.displayReport(),
  enclosure: window.__WATCH__.enclosureReport(),
  exterior: window.__WATCH__.exteriorReport(),
  readout: window.__WATCH__.readoutReport(),
  finish: window.__WATCH__.finishReport(),
  strap: window.__WATCH__.strapReport(),
}));
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

await browser.close();
console.log("done", outDir);
