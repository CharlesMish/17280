import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const stage = process.argv[2];
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
if (stage !== "before" && stage !== "after") {
  console.error("usage: capture-phase5d-ab.mjs before|after [baseUrl]");
  process.exit(1);
}
const outDir = `captures/phase5d-ab/${stage}`;
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
const comparison = stage === "before" ? "&phase5dBaseline=1" : "";
await page.goto(`${baseUrl}/?static=1&view=extFront&t=0.104${comparison}`, { waitUntil: "commit", timeout: 60000 });
await page.waitForFunction(() => globalThis.__WATCH__?.capture !== undefined);
await page.waitForTimeout(900);

const shots = [
  ["front.png", "extFront"],
  ["front-three-quarter.png", "extProduct"],
  ["opposite-three-quarter.png", "extWestOblique"],
  ["edge-profile.png", "extProfile"],
  ["sapphire-oblique.png", "extHero"],
  ["balance-escapement-macro.png", "finishBalance"],
  ["rear-exhibition.png", "extRear"],
];
for (const [file, view] of shots) {
  await page.evaluate((nextView) => {
    globalThis.__WATCH__.setView(nextView);
    globalThis.__WATCH__.setTime(0.104);
    globalThis.__WATCH__.setDebug(false);
    globalThis.__WATCH__.clearReadoutPose();
  }, view);
  await page.waitForTimeout(300);
  const dataUrl = await page.evaluate(() => globalThis.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", stage, file);
}

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
  phase5d: globalThis.__WATCH__.phase5dPresentationReport?.() ?? null,
}));
fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify({ ...report, browserErrors }, null, 2)}\n`);
if (stage === "after") {
  fs.copyFileSync(path.join(outDir, "front-three-quarter.png"), path.join(outDir, "final-hero.png"));
}
await browser.close();
