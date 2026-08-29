import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "/tmp/watch-enc-regression";
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  "disp-top:dispTop:0.104",
  "disp-hero:dispHero:0.104",
  "disp-section:dispSection:0.104",
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

await page.goto("http://127.0.0.1:5173/?static=1&enclosure=0&view=dispTop&t=0.104", {
  waitUntil: "load",
  timeout: 180000,
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
  await page.waitForTimeout(500);
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", name);
}

await browser.close();
console.log("done", outDir);
