import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "/tmp/watch-phase4a-dev";
fs.mkdirSync(outDir, { recursive: true });

const concepts = ["blade-baton", "open-lancet", "facet-block"];
const views = [
  ["front", "readoutFront", "1010", null],
  ["three-quarter", "readoutThreeQuarter", "1010", null],
  ["dark", "readoutThreeQuarter", "1010", 0.58],
  ["truth", "readoutSweep", "1010", null],
  ["pose-105", "readoutFront", "105", null],
  ["pose-630", "readoutFront", "630", null],
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

for (const concept of concepts) {
  await page.goto(
    `http://127.0.0.1:5173/?static=1&view=readoutFront&t=0.104&readoutPose=1010&readoutConcept=${concept}`,
    { waitUntil: "commit", timeout: 60000 },
  );
  await page.waitForFunction(() => window.__WATCH__ !== undefined, { timeout: 180000 });
  await page.waitForTimeout(600);
  for (const [label, view, pose, exposure] of views) {
    await page.evaluate(
      ([v, p, exp]) => {
        window.__WATCH__.setReadoutPose(p);
        window.__WATCH__.setView(v);
        window.__WATCH__.setTime(0.104);
        window.__WATCH__.setDebug(false);
        if (exp) window.__WATCH__.setTone("neutral", exp);
        else window.__WATCH__.setTone("neutral", 1.08);
      },
      [view, pose, exposure],
    );
    await page.waitForTimeout(400);
    const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
    const name = `${concept}-${label}`;
    fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
    console.log("ok", name);
  }
}

await browser.close();
console.log("done", outDir);
