import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [base = "http://127.0.0.1:5198", output = "/tmp/watch-refinement-touch"] = process.argv.slice(2);
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const report = { browser: browser.version(), viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, layers: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  page.setDefaultTimeout(180000);
  page.on("pageerror", error => report.errors.push(String(error)));
  await page.goto(`${base}/?t=0.104&readoutPose=1010`, { waitUntil: "commit" });
  await page.waitForFunction(() => typeof window.__WATCH__?.selectLayer === "function");
  await page.getByRole("button", { name: "Exploded", exact: true }).tap();
  await page.locator(".release-shell__layers-summary").tap();
  for (const id of await page.locator("li[data-layer]").evaluateAll(rows => rows.map(row => row.dataset.layer))) {
    const button = page.locator(`li[data-layer="${id}"] button`);
    await button.tap();
    assert.equal(await button.getAttribute("aria-pressed"), "true");
    assert.equal(await page.evaluate(() => window.__WATCH__.releasePresentationReport().selectedLayer), id);
    if (id === "front-sapphire") await page.screenshot({ path: path.join(output, "phone-sapphire-selected.png") });
    await button.tap();
    assert.equal(await page.evaluate(() => window.__WATCH__.releasePresentationReport().selectedLayer), null);
    report.layers.push(id);
    console.log(`PASS touch ${id}`);
  }
  assert.equal(report.layers.length, 8);
  assert.equal(report.errors.length, 0);
  report.passed = true;
} finally {
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
