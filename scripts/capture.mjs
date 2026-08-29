import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const outDir = process.argv[2] || "/tmp/watch-inspect";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});

page.on("pageerror", (err) => console.error("PAGEERROR", err));
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("CONSOLE", msg.text());
});

const views = ["threeQuarter", "top", "escape", "profile", "barrel"];

for (const view of views) {
  const url = `http://127.0.0.1:5173/?static=1&view=${view}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__WATCH__ !== undefined);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, `${view}.png`) });
  await page.evaluate(() => window.__WATCH__.setDebug(true));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, `${view}-debug.png`) });
  console.log("captured", view);
}

await browser.close();
console.log("done");
