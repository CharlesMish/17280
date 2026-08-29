import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "/tmp/watch-phase3a";
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  "acc-hero:accHero:0.104",
  "acc-top:accTop:0.104",
  "acc-back:accBack:0.104",
  "acc-flank:accFlank:0.104",
  "acc-section:accSection:0.104",
  "acc-holder:accHolder:0.104",
  "acc-crown:accCrown:0.104",
  "acc-authority:accAuthority:0.104",
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

await page.goto("http://127.0.0.1:5173/?static=1&view=accHero&t=0.104", { waitUntil: "load" });
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
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", name);
}

const report = await page.evaluate(() => window.__WATCH__.accommodationReport());
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log("report written");

await browser.close();
console.log("done", outDir);
