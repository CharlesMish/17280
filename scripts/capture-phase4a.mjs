import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "/tmp/watch-phase4a";
const only = process.argv[3] || "";
fs.mkdirSync(outDir, { recursive: true });

const allShots = [
  "readout-hero:readoutHero:1010",
  "readout-front:readoutFront:1010",
  "readout-front-hard:readoutFrontHard:105",
  "readout-three-quarter:readoutThreeQuarter:1010",
  "readout-crown:readoutCrown:1010",
  "readout-profile:readoutProfile:1010",
  "readout-hub-macro:readoutHubMacro:1010",
  "readout-chapter-macro:readoutChapterMacro:1010",
  "readout-sweep:readoutSweep:1010",
  "readout-chapter-contain:readoutChapterContain:1010",
  "readout-section:readoutSection:1010",
];
const shots = only ? allShots.filter((s) => s.startsWith(`${only}:`) || s.split(":")[0] === only) : allShots;

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

await page.goto("http://127.0.0.1:5173/?static=1&view=readoutHero&t=0.104&readoutPose=1010", {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => window.__WATCH__ !== undefined, { timeout: 180000 });
await page.waitForTimeout(800);

for (const spec of shots) {
  const [name, view, pose] = spec.split(":");
  await page.evaluate(
    ([v, p]) => {
      window.__WATCH__.setReadoutPose(p);
      window.__WATCH__.setView(v);
      window.__WATCH__.setTime(0.104);
      window.__WATCH__.setDebug(false);
    },
    [view, pose],
  );
  await page.waitForTimeout(450);
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", name);
}

if (!only || only === "report") {
  const report = await page.evaluate(() => ({
    readout: window.__WATCH__.readoutReport(),
    display: window.__WATCH__.displayReport()?.axis ?? null,
    exterior: window.__WATCH__.exteriorReport()?.concept ?? null,
  }));
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log("report written");
}

if (!only || only === "readout-off") {
  await page.goto("http://127.0.0.1:5173/?static=1&view=extHero&t=0.104&readout=0", {
    waitUntil: "commit",
    timeout: 60000,
  });
  await page.waitForFunction(() => window.__WATCH__ !== undefined, { timeout: 180000 });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    window.__WATCH__.setView("extHero");
    window.__WATCH__.setTime(0.104);
    window.__WATCH__.setDebug(false);
  });
  await page.waitForTimeout(400);
  const off = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, "readout-off.png"), Buffer.from(off.split(",")[1], "base64"));
  const offReport = await page.evaluate(() => ({
    readout: window.__WATCH__.readoutReport(),
    exterior: window.__WATCH__.exteriorReport()?.concept ?? null,
  }));
  fs.writeFileSync(path.join(outDir, "readout-off.json"), JSON.stringify(offReport, null, 2));
  console.log("ok readout-off", offReport.readout === null);
}

await browser.close();
console.log("done", outDir);
