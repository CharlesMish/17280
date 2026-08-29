import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "captures/phase5c";
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  ["front-hero", "strapHero"],
  ["front-three-quarter", "strapProduct"],
  ["crown-side-three-quarter", "strapCrown"],
  ["opposite-three-quarter", "strapWest"],
  ["side-profile", "strapProfile"],
  ["rear-three-quarter", "strapRear"],
  ["underside", "strapUnderside"],
  ["lug-junction-macro", "strapMacro"],
  ["finish-id", "strapId"],
  ["articulated", "strapBent"],
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

await page.goto("http://127.0.0.1:5173/?static=1&view=strapHero&t=0.104&readoutPose=1010", {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => window.__WATCH__ !== undefined, { timeout: 180000 });
await page.waitForTimeout(600);

for (const [name, view] of shots) {
  console.log("capturing", name);
  await page.evaluate((v) => {
    window.__WATCH__.setReadoutPose("1010");
    window.__WATCH__.setView(v);
    window.__WATCH__.setTime(0.104);
    window.__WATCH__.setDebug(false);
  }, view);
  await page.waitForTimeout(250);
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture(), { timeout: 120000 });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", name);
}

const report = await page.evaluate(() => ({
  strap: window.__WATCH__.strapReport(),
  finish: window.__WATCH__.finishReport(),
  exterior: window.__WATCH__.exteriorReport()?.finish ?? null,
  keepout: window.__WATCH__.exteriorReport()?.crownKeepout
    ? {
        anyIntersection: window.__WATCH__.exteriorReport().crownKeepout.anyIntersection,
        minClearance: window.__WATCH__.exteriorReport().crownKeepout.minClearance,
      }
    : null,
}));
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log("report written");
await browser.close();
