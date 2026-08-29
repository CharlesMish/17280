import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "captures/lug-body";
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  ["ext-hero.png", "extHero"],
  ["ext-offside.png", "extOffside"],
  ["ext-lug-product.png", "extLugProduct"],
  ["ext-crown-profile.png", "extCrownProfile"],
  ["ext-profile.png", "extProfile"],
  ["ext-lug-span.png", "extLugSpan"],
  ["ext-lug-section.png", "extLugSection"],
  ["ext-west-oblique.png", "extWestOblique"],
  ["ext-lug-root.png", "extLugRoot"],
  ["ext-lug-root-section.png", "extLugRootSection"],
  ["ext-lug-root-cut.png", "extLugRootCut"],
  ["ext-rear.png", "extRear"],
  ["ext-rear-grazing.png", "extRearGrazing"],
  ["ext-crown-product.png", "extCrownProduct"],
  ["ext-crown-upper.png", "extCrownUpper"],
  ["ext-crown-under.png", "extCrownUnder"],
  ["ext-crown-root.png", "extCrownRoot"],
  ["ext-crown-section.png", "extCrownSection"],
  ["ext-crown-id.png", "extCrownId"],
  ["ext-crown-id-under.png", "extCrownIdUnder"],
  ["ext-crown-keepout.png", "extCrownKeepout"],
  ["ext-crown-clear-section.png", "extCrownClearSection"],
];

const only = process.argv[3];
const selected = only ? shots.filter((s) => s[1] === only || s[0].includes(only)) : shots;

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});

async function shoot(outName, view) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(180000);
  page.on("pageerror", (err) => console.error("PAGEERROR", err));
  const q = new URLSearchParams(`static=1&view=${view}&t=0.104&readoutPose=1010`);
  await page.goto(`http://127.0.0.1:5173/?${q.toString()}`, { waitUntil: "commit", timeout: 60000 });
  await page.waitForFunction(() => window.__WATCH__ !== undefined, { timeout: 180000 });
  await page.waitForTimeout(800);
  await page.evaluate((v) => {
    window.__WATCH__.setReadoutPose("1010");
    window.__WATCH__.setView(v);
    window.__WATCH__.setTime(0.104);
    window.__WATCH__.setDebug(false);
  }, view);
  await page.waitForTimeout(300);
  if (view === "extHero" || view === "extLugSpan" || view === "extCrownProduct") {
    const report = await page.evaluate(() => window.__WATCH__.exteriorReport());
    fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
    const mesh = report?.hornMesh ?? [];
    console.log("crownJoin", report?.crownJoin);
    console.log("crownKeepout", report?.crownKeepout);
    console.log("crownBodyMesh", report?.crownBodyMesh);
    console.log("fluteNote", report?.fluteNote);
    console.log(
      "hornMesh",
      mesh.map((m) => ({
        name: m.name,
        components: m.components,
        boundary: m.boundaryEdges,
        nonManifold: m.nonManifoldEdges,
        selfX: m.profileSelfIntersects,
        clearance: Number(m.holeClearance?.toFixed?.(3) ?? m.holeClearance),
        outward: m.outwardOk,
        root: m.rootJoin,
      })),
    );
  }
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, outName), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", outName);
  await page.close();
}

for (const [name, view] of selected) {
  await shoot(name, view);
}

await browser.close();
console.log("done", outDir);
