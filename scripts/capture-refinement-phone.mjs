import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [base = "http://127.0.0.1:5198", output = "/tmp/watch-refinement-phone-final"] = process.argv.slice(2);
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 760 }, deviceScaleFactor: 1, hasTouch: true, reducedMotion: "reduce" });
  page.setDefaultTimeout(180000);
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error" && message.text() !== "THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)") errors.push(message.text());
  });
  await page.goto(`${base}/?t=0.104&readoutPose=1010`, { waitUntil: "commit" });
  await page.waitForFunction(() => typeof window.__WATCH__?.selectLayer === "function");
  const views = [];
  const poses = [];
  for (const size of ["desktop", "phone"]) {
    await page.setViewportSize(size === "desktop" ? { width: 960, height: 760 } : { width: 390, height: 844 });
    for (const view of ["Hero", "Front", "Wearable", "Rear", "Exploded"]) {
      await page.getByRole("button", { name: view, exact: true }).tap();
      if (view === "Exploded") {
        await page.locator(".release-shell__layers-summary").tap();
        await page.locator("li[data-layer='front-sapphire'] button").tap();
      }
      await page.evaluate(() => { window.__WATCH__.setReadoutPose("1010"); window.__WATCH__.capture(); });
      await page.screenshot({ path: path.join(output, `${size}-${view.toLowerCase()}.png`) });
      views.push({ size, view, report: await page.evaluate(() => window.__WATCH__.releasePresentationReport().current) });
      console.log(`${size} ${view}`);
    }
    const captures = await page.evaluate(() => {
      const rows = [];
      for (const pose of ["1010", "300", "630", "840", "945", "105", "1200"]) {
        for (const view of ["r1FinalHero", "r1FrontElevation"]) {
          const w = window.__WATCH__;
          w.setView(view); w.setReadoutPose(pose);
          const image = w.capture();
          const current = w.releasePresentationReport().current;
          if (current.publicView !== (view === "r1FinalHero" ? "hero" : "front")) throw new Error("Camera control state mismatch");
          rows.push({ pose, view, image, current });
        }
      }
      return rows;
    });
    for (const capture of captures) {
      const file = `${size}-${capture.view}-${capture.pose}.png`;
      fs.writeFileSync(path.join(output, file), Buffer.from(capture.image.split(",")[1], "base64"));
      poses.push({ size, file, pose: capture.pose, view: capture.view, current: capture.current, canvasOnly: true });
    }
    console.log(`${size} 14 matched pose captures`);
  }
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ browser: browser.version(), deviceScaleFactor: 1, views, poses, errors }, null, 2));
  if (errors.length) throw new Error(JSON.stringify(errors));
} finally { await browser.close(); }
