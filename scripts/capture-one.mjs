import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outPath = process.argv[2];
const view = process.argv[3];
const pose = process.argv[4] || "1010";
const query = process.argv[5] || "";
if (!outPath || !view) {
  console.error("usage: capture-one.mjs out.png view [pose] [extraQuery]");
  process.exit(1);
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const q = new URLSearchParams(`static=1&view=${view}&t=0.104&readoutPose=${pose}`);
if (query) {
  for (const part of query.split("&")) {
    const [k, v] = part.split("=");
    if (k) q.set(k, v ?? "");
  }
}

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
await page.goto(`http://127.0.0.1:5173/?${q.toString()}`, { waitUntil: "commit", timeout: 60000 });
await page.waitForFunction(() => window.__WATCH__ !== undefined, { timeout: 180000 });
await page.waitForTimeout(900);
await page.evaluate(
  ([v, p]) => {
    window.__WATCH__.setReadoutPose(p);
    window.__WATCH__.setView(v);
    window.__WATCH__.setTime(0.104);
    window.__WATCH__.setDebug(false);
  },
  [view, pose],
);
await page.waitForTimeout(250);
const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
fs.writeFileSync(outPath, Buffer.from(dataUrl.split(",")[1], "base64"));
if (outPath.endsWith("report.json") === false && process.argv.includes("--report")) {
  const report = await page.evaluate(() => window.__WATCH__.readoutReport());
  fs.writeFileSync(path.join(path.dirname(outPath), "report.json"), JSON.stringify({ readout: report }, null, 2));
}
console.log("ok", path.basename(outPath));
await browser.close();
