import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "/tmp/watch-phase3b";
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  "disp-stack:dispStack:0.104",
  "disp-top:dispTop:0.104",
  "disp-section:dispSection:0.104",
  "disp-sweep:dispSweep:0.104",
  "disp-chapter:dispChapter:0.104",
  "disp-envelope:dispEnvelope:0.104",
  "disp-hero:dispHero:0.104",
];

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
page.setDefaultTimeout(120000);
page.on("pageerror", (err) => console.error("PAGEERROR", err));

await page.goto("http://127.0.0.1:5173/?static=1&view=dispTop&t=0.104", { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.__WATCH__ !== undefined, { timeout: 120000 });
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
  await page.waitForTimeout(500);
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", name);
}

const report = await page.evaluate(() => window.__WATCH__.displayReport());
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log("report written");

await browser.close();
console.log("done", outDir);
