import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright";

// Replaces only this harness's generated, misaligned captures; never source or
// authored camera definitions. Useful for evidence captured before orbit drain.
const [base, ...folders] = process.argv.slice(2);
if (!base || !folders.length) throw new Error("Usage: verify-refinement-cameras.mjs URL capture-folder [...]");
const near = (a, b) => a.length === b.length && a.every((n, i) => Math.abs(n - b[i]) < 1e-7);
const aligned = row => {
  const current = row.presentation.current;
  const wanted = row.presentation.views[current.view];
  return near(current.camera.position, wanted.position) && near(current.camera.target, wanted.target) && Math.abs(current.camera.fov - wanted.fov) < 1e-7;
};
let browser;
let page;
const errors = [];
try {
  for (const folder of folders) {
    const reportFile = path.join(folder, "report.json");
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    for (const row of report.captures) {
      if (aligned(row)) continue;
      if (path.basename(row.file) !== row.file || !row.file.endsWith(".png")) throw new Error("Invalid capture filename");
      if (!page) {
        browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
        page = await browser.newPage({ viewport: { width: 960, height: 760 }, deviceScaleFactor: 1 });
        page.setDefaultTimeout(180000);
        page.on("pageerror", error => errors.push(String(error)));
        page.on("console", message => {
          if (message.type() === "error" && message.text() !== "THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)") errors.push(message.text());
        });
        await page.goto(`${base}/?static=1&view=r1FinalHero&t=0.104&readoutPose=1010`, { waitUntil: "commit" });
        await page.waitForFunction(() => typeof window.__WATCH__?.setCaptureCamera === "function");
      }
      const capture = await page.evaluate(row => {
        const w = window.__WATCH__;
        const material = row.presentation.refinement.materials.find(m => m.name === "exterior.sapphire");
        w.setRefinement(row.stage ?? "graphite", { ior: material.ior, thickness: material.thickness, specularIntensity: material.specularIntensity });
        const name = row.presentation.current.view;
        w.setView(name); w.setReadoutPose("1010"); w.setTime(0.104);
        if (name === "r1E1Hero") w.setExplode(1);
        const camera = w.releasePresentationReport().views[name];
        w.setCaptureCamera(camera.position, camera.target);
        return { image: w.capture(), presentation: w.releasePresentationReport() };
      }, row);
      if (errors.length) throw new Error(JSON.stringify(errors));
      if (!aligned(capture)) throw new Error("Camera remains misaligned");
      const bytes = Buffer.from(capture.image.split(",")[1], "base64");
      fs.writeFileSync(path.join(folder, row.file), bytes);
      row.presentation = capture.presentation;
      row.sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      row.cameraRecaptured = true;
      console.log(`Realigned ${folder}/${row.file}`);
    }
    if (!report.captures.every(aligned)) throw new Error("Camera verification failed");
    report.exactCameraAlignmentVerified = true;
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`Verified ${report.captures.length} authored camera poses in ${folder}`);
  }
} finally { await browser?.close(); }
