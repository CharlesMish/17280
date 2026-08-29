import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "/tmp/watch-plate-evidence";
fs.mkdirSync(outDir, { recursive: true });

const only = process.argv[3] || "";
const allShots = [
  "rear-truth:finishUnderside:0.104",
  "rear-oblique:finishUndersideOblique:0.104",
  "rear-grazing:structRearGrazing:0.104",
  "front-top:finishTop:0.104",
  "packaging-overlay:accAuthority:0.104",
  "enc-rear:encRear:0.104",
  "enc-front:encFront:0.104",
];
const shots = only ? allShots.filter((s) => s.startsWith(`${only}:`)) : allShots;

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
page.setDefaultTimeout(180000);
page.on("pageerror", (err) => console.error("PAGEERROR", err));

await page.goto("http://127.0.0.1:5173/?static=1&view=finishUnderside&t=0.104", {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => window.__WATCH__ !== undefined, { timeout: 180000 });
await page.waitForTimeout(800);

for (const spec of shots) {
  const [name, view, t] = spec.split(":");
  await page.evaluate(
    ([v, time]) => {
      window.__WATCH__.setView(v);
      window.__WATCH__.setTime(Number(time));
      window.__WATCH__.setDebug(false);
    },
    [view, t],
  );
  await page.waitForTimeout(400);
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", name);
}

if (process.argv.includes("--reports")) {
  const reports = await page.evaluate(() => ({
    structure: window.__WATCH__.structureReport(),
    assembly: window.__WATCH__.assemblyReport(),
    accommodation: window.__WATCH__.accommodationReport(),
    display: window.__WATCH__.displayReport(),
    enclosure: window.__WATCH__.enclosureReport(),
  }));
  fs.writeFileSync(path.join(outDir, "reports.json"), JSON.stringify(reports, null, 2));
  console.log("reports written");
}

await browser.close();
console.log("done", outDir);
