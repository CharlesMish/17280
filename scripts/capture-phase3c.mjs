import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "/tmp/watch-phase3c";
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  "enc-hero:encHero:0.104",
  "enc-front:encFront:0.104",
  "enc-front-clear:encFrontClear:0.104",
  "enc-rear:encRear:0.104",
  "enc-rear-clear:encRearClear:0.104",
  "enc-section:encSection:0.104",
  "enc-seat:encSeat:0.104",
  "enc-retention:encRetention:0.104",
  "enc-crown:encCrown:0.104",
];

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

await page.goto("http://127.0.0.1:5173/?static=1&view=encHero&t=0.104", { waitUntil: "load", timeout: 180000 });
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
  await page.waitForTimeout(500);
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", name);
}

const report = await page.evaluate(() => window.__WATCH__.enclosureReport());
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log("report written");

await browser.close();
console.log("done", outDir);
