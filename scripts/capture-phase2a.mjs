import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "/tmp/watch-phase2a";
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  "struct-hero:structHero:0.104",
  "struct-top:structTop:0.104",
  "struct-train:structTrain:0.104",
  "struct-escape:structEscape:0.104",
  "struct-cock:structCock:0.104",
  "struct-profile:structProfile:0.104",
  "silhouette:silhouette:0.104",
  "struct-audit:structAudit:0.104",
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

await page.goto("http://127.0.0.1:5173/?static=1&view=structHero&t=0.104", {
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
  await page.waitForTimeout(450);
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(outDir, `${name}.png`), buf);
  console.log("ok", name);
}

await browser.close();
console.log("done", outDir);
