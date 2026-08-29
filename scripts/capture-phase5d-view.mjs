import { chromium } from "playwright";
import fs from "node:fs";

const view = process.argv[2];
const output = process.argv[3];
const baseUrl = process.argv[4] || "http://127.0.0.1:5173";
if (!view || !output) {
  console.error("usage: capture-phase5d-view.mjs VIEW OUTPUT [baseUrl]");
  process.exit(1);
}
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
await page.goto(`${baseUrl}/?static=1&view=${encodeURIComponent(view)}&t=0.104`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => globalThis.__WATCH__?.capture !== undefined);
await page.waitForTimeout(900);
const dataUrl = await page.evaluate(() => globalThis.__WATCH__.capture());
fs.writeFileSync(output, Buffer.from(dataUrl.split(",")[1], "base64"));
await browser.close();
