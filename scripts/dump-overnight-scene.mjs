import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2] || "captures/post5d-overnight-audit/scene-dump.json";
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
fs.mkdirSync(path.dirname(out), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.setDefaultTimeout(300000);
await page.goto(`${baseUrl}/?static=1&view=presentExploded&explode=1&t=0.104&readoutPose=1010`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => globalThis.__WATCH__?.sceneDump !== undefined);
await page.waitForTimeout(1200);
const data = await page.evaluate(() => {
  const watch = globalThis.__WATCH__;
  watch.setView("presentExploded");
  watch.setExplode(1);
  watch.setTime(0.104);
  return {
    exploded: watch.explodedAssemblyReport(),
    scene: watch.sceneDump(),
    authority: {
      structure: watch.structureReport(),
      exterior: watch.exteriorReport(),
      strap: watch.strapReport(),
    },
  };
});
fs.writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
await browser.close();
console.log(`wrote ${out}`);
