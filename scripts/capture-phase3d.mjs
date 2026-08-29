import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "/tmp/watch-phase3d";
const only = process.argv[3] || "";
fs.mkdirSync(outDir, { recursive: true });

const allShots = [
  "ext-hero:extHero:0.104",
  "ext-front:extFront:0.104",
  "ext-crown-profile:extCrownProfile:0.104",
  "ext-offside:extOffside:0.104",
  "ext-rear:extRear:0.104",
  "ext-profile:extProfile:0.104",
  "ext-underside:extUnderside:0.104",
  "ext-lug-product:extLugProduct:0.104",
  "ext-lug-truth:extLugTruth:0.104",
  "ext-lug-south:extLugSouth:0.104",
  "ext-crown-truth:extCrownTruth:0.104",
  "ext-kernel:extKernel:0.104",
  "ext-seat-macro:extSeatMacro:0.104",
  "ext-waist:extWaist:0.104",
  "enc-front-regression:encFront:0.104",
];
const shots = only ? allShots.filter((s) => s.startsWith(`${only}:`)) : allShots;

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

await page.goto("http://127.0.0.1:5173/?static=1&view=extHero&t=0.104", {
  waitUntil: "commit",
  timeout: 60000,
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
  await page.waitForTimeout(450);
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", name);
}

if (!only || only === "report") {
  const report = await page.evaluate(() => ({
    exterior: window.__WATCH__.exteriorReport(),
    enclosure: window.__WATCH__.enclosureReport(),
  }));
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log("report written");
}

await browser.close();
console.log("done", outDir);
