import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "captures/pre5d-escapement-repair/final";
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.setDefaultTimeout(240000);
await page.goto(`${baseUrl}/?static=1&view=structEscape&t=0.104&accommodation=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => globalThis.__WATCH__?.setEscapementAudit !== undefined);
await page.waitForTimeout(700);

const capture = async (file, mode, time) => {
  const dataUrl = await page.evaluate(({ mode, time }) => {
    globalThis.__WATCH__.setTime(time);
    globalThis.__WATCH__.setEscapementAudit(mode);
    return globalThis.__WATCH__.capture();
  }, { mode, time });
  fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", file);
};

await capture("focused-flat-owner-id.png", "idTop", 0);
await capture("focused-isolated-participants.png", "participantsTop", 0);
await capture("focused-side-z-section.png", "side", 0);
await capture("focused-opposite-bank.png", "participantsTop", 0.20833333333333334);
await page.evaluate(() => globalThis.__WATCH__.clearEscapementAudit());
await browser.close();
