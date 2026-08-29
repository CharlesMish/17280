import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "/tmp/watch-phase2c";
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  "finish-hero:finishHero:0.104",
  "finish-top:finishTop:0.104",
  "finish-grazing:finishGrazing:0.104",
  "finish-ruby:finishRuby:0.104",
  "finish-screw:finishScrew:0.104",
  "finish-barrel:finishBarrel:0.104",
  "finish-balance:finishBalance:0.104",
  "finish-truth:finishTruth:0.104",
  "finish-underside:finishUnderside:0.104",
  "finish-underside-oblique:finishUndersideOblique:0.104",
  "finish-lower-flank:finishLowerFlank:0.104",
];

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
page.setDefaultTimeout(25000);
page.on("pageerror", (err) => console.error("PAGEERROR", err));

await page.goto("http://127.0.0.1:5173/?static=1&view=finishHero&t=0.104", {
  waitUntil: "load",
});
await page.waitForFunction(() => window.__WATCH__ !== undefined);
await page.waitForTimeout(1000);

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
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(outDir, `${name}.png`), buf);
  console.log("ok", name);
}

await browser.close();
console.log("done", outDir);
