import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "captures/final-junction-audit/before";
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  ["region-a-normal.png", "A", "normal"],
  ["region-a-flat-id.png", "A", "id"],
  ["region-a-grazing.png", "A", "grazing"],
  ["region-a-side.png", "A", "side"],
  ["region-b-normal.png", "B", "normal"],
  ["region-b-flat-id.png", "B", "id"],
  ["region-b-grazing.png", "B", "grazing"],
  ["region-b-side.png", "B", "side"],
];

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({
  viewport: { width: 1400, height: 1000 },
  deviceScaleFactor: 1,
});
page.setDefaultTimeout(240000);
page.on("pageerror", (error) => console.error("PAGEERROR", error));

// The audit page intentionally omits post-movement packaging. The supplied
// product screenshot remains the framing reference; removing crystals/case
// makes ownership and grazing evidence unambiguous and keeps helpers non-authoritative.
await page.goto("http://127.0.0.1:5173/?static=1&view=structRearGrazing&t=0.104&accommodation=0", {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => window.__WATCH__ !== undefined, { timeout: 240000 });
await page.waitForTimeout(900);

const ownership = {};
for (const [file, region, view] of shots) {
  await page.evaluate(
    ([r, v]) => {
      window.__WATCH__.setTime(0.104);
      window.__WATCH__.setDebug(false);
      window.__WATCH__.setJunctionAudit(r, v);
    },
    [region, view],
  );
  await page.waitForTimeout(450);
  if (view === "id") ownership[region] = await page.evaluate(() => window.__WATCH__.junctionOwnership());
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", file);
}

const reports = await page.evaluate(() => ({
  structure: window.__WATCH__.structureReport(),
  assembly: window.__WATCH__.assemblyReport(),
  accommodation: window.__WATCH__.accommodationReport(),
  display: window.__WATCH__.displayReport(),
  enclosure: window.__WATCH__.enclosureReport(),
  exterior: window.__WATCH__.exteriorReport(),
  readout: window.__WATCH__.readoutReport(),
}));
fs.writeFileSync(path.join(outDir, "audit.json"), JSON.stringify({ ownership, reports }, null, 2));

await browser.close();
console.log("done", outDir);
