import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const outDir = process.argv[3] || "/tmp/watch-r1-presentation-preflight";
if (fs.existsSync(outDir)) throw new Error(`refusing to overwrite preflight directory: ${outDir}`);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
page.on("pageerror", (error) => console.error("PAGEERROR", error));
await page.goto(`${baseUrl}/?static=1&shell=0&view=r1FrontElevation&t=0.104&readoutPose=1010`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() =>
  typeof globalThis.__WATCH__?.capture === "function" &&
  typeof globalThis.__WATCH__?.setPhase5dCProfile === "function"
);
await page.waitForTimeout(800);

const requested = new Set(process.argv.slice(4));
const captures = [
  ["front-elevation.png", "r1FrontElevation", "r1FrontRead"],
  ["rear-exhibition.png", "r1RearExhibition", "r1Rear"],
  ["rear-identity-proof.png", "r1RearIdentity", "r1Rear"],
  ["finish-rake-before.png", "r1FinishRake", "middle"],
  ["finish-rake-after.png", "r1FinishRake", "r1Raking"],
].filter(([file]) => requested.size === 0 || requested.has(file));

for (const [file, view, profile] of captures) {
  await page.evaluate(([nextView, nextProfile]) => {
    globalThis.__WATCH__.setReadoutPose("1010");
    globalThis.__WATCH__.setView(nextView);
    globalThis.__WATCH__.setPhase5dCProfile(nextProfile);
    globalThis.__WATCH__.setTime(0.104);
    globalThis.__WATCH__.setDebug(false);
  }, [view, profile]);
  await page.waitForTimeout(400);
  const dataUrl = await page.evaluate(() => globalThis.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(",")[1], "base64"), { flag: "wx" });
  console.log("ok", file);
}

await browser.close();
console.log("done", outDir);
