import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "captures/pre5d-integrity/before";
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
const scope = process.argv[4] || "all";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
page.on("pageerror", (error) => console.error("PAGEERROR", error));

await page.goto(`${baseUrl}/?static=1&view=structRearGrazing&t=0.104&accommodation=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => window.__WATCH__ !== undefined, { timeout: 240000 });
await page.waitForTimeout(900);

const writeCapture = async (file) => {
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", file);
};

const ownership = {};
const centerShots = [
  ["issue-a-normal.png", "normal"],
  ["issue-a-flat-id.png", "id"],
  ["issue-a-grazing.png", "grazing"],
  ["issue-a-side-section.png", "side"],
] .filter(([, view]) => scope === "all" || scope === "issue-a" || scope === view);
for (const [file, view] of centerShots) {
  await page.evaluate((nextView) => {
    window.__WATCH__.setTime(0.104);
    window.__WATCH__.setDebug(false);
    window.__WATCH__.setJunctionAudit("CENTER", nextView);
  }, view);
  await page.waitForTimeout(450);
  if (view === "id") ownership.center = await page.evaluate(() => window.__WATCH__.junctionOwnership());
  await writeCapture(file);
}

const barrelShots = scope === "all"
  ? [
      ["issue-b-barrel-t000.png", 0.104],
      ["issue-b-barrel-t210.png", 210.104],
    ]
  : [];
for (const [file, time] of barrelShots) {
  await page.evaluate((nextTime) => {
    window.__WATCH__.setView("barrel");
    window.__WATCH__.setTime(nextTime);
    window.__WATCH__.setDebug(false);
  }, time);
  await page.waitForTimeout(300);
  await writeCapture(file);
}

const report = await page.evaluate(() => ({
  center: window.__WATCH__.centerIntegrityReport(),
  kinematics: window.__WATCH__.kinematicReport([0.104, 10.104, 60.104, 210.104]),
  authority: {
    structure: window.__WATCH__.structureReport(),
    assembly: window.__WATCH__.assemblyReport(),
    accommodation: window.__WATCH__.accommodationReport(),
    display: window.__WATCH__.displayReport(),
    enclosure: window.__WATCH__.enclosureReport(),
    exterior: window.__WATCH__.exteriorReport(),
    readout: window.__WATCH__.readoutReport(),
    finish: window.__WATCH__.finishReport(),
    strap: window.__WATCH__.strapReport(),
  },
}));
fs.writeFileSync(path.join(outDir, "audit.json"), JSON.stringify({ ownership, ...report }, null, 2));

await browser.close();
console.log("done", outDir);
