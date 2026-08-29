import { chromium } from "playwright";
import fs from "node:fs";

const outDir = "captures/joint-audit";
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  ["finish-hero.png", "finishHero"],
  ["finish-top.png", "finishTop"],
  ["readout-front.png", "readoutFront"],
  ["readout-three-quarter.png", "readoutThreeQuarter"],
  ["asm-joint-id.png", "asmJointId"],
  ["asm-joint-close.png", "asmJointClose"],
];

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
  await page.waitForTimeout(350);
  if (view === "finishHero" || view === "asmJointId") {
    const dump = await page.evaluate(() => window.__WATCH__.sceneDump());
    const asm = await page.evaluate(() => window.__WATCH__.assemblyReport());
    fs.writeFileSync(pathJoin(outDir, `${view}-dump.json`), JSON.stringify({ dump, asm }, null, 2));
    const markers = dump.filter((m) => /bore|marker/i.test(m.name) || /bore|marker/i.test(m.parent));
    const lower = dump.filter((m) => m.name.includes(":lower") || m.parent.includes(":lower"));
    const bosses = dump.filter((m) => m.name.startsWith("struct:boss") || m.name.startsWith("struct:foot"));
    console.log(view, "boreMarkers", markers.length, "lowerVisible", lower.filter((m) => m.visible).length, "bosses", bosses.length);
  }
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(`${outDir}/${outName}`, Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", outName);
  await page.close();
}

function pathJoin(a, b) {
  return `${a.replace(/\/$/, "")}/${b}`;
}

for (const [name, view] of shots) {
  await shoot(name, view);
}
await browser.close();
console.log("done", outDir);
