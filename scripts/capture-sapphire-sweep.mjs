import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [base = "http://127.0.0.1:5200", output = "/tmp/watch-sapphire-sweep"] = process.argv.slice(2);
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const report = { browser: browser.version(), softwareRendering: true, captures: [], checks: [], errors: [] };
const save = () => fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
const check = (name, passed) => {
  report.checks.push({ name, passed }); save(); assert.ok(passed, name);
};
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 506 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000);
  page.on("pageerror", error => report.errors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error" && message.text() !== "THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)") report.errors.push(message.text());
  });
  await page.goto(`${base}/?static=1&view=r1SapphireOblique&t=0.104&readoutPose=1010`, { waitUntil: "commit" });
  await page.waitForFunction(() => typeof window.__WATCH__?.setRefinement === "function");
  const scope = await page.evaluate(() => {
    const w = window.__WATCH__;
    w.setTime(0.104); w.setReadoutPose("1010");
    const initial = w.releasePresentationReport();
    const physical = JSON.stringify(w.physicalPresentationSnapshot());
    w.setRefinement("graphite-sapphire");
    const candidate = w.releasePresentationReport();
    const unchanged = physical === JSON.stringify(w.physicalPresentationSnapshot());
    w.setRefinement("graphite-finish");
    const restored = w.releasePresentationReport();
    return { initial, candidate, unchanged, restored };
  });
  check("Public default remains graphite-finish", scope.initial.refinement.stage === "graphite-finish");
  check("Physical geometry and material assignments match frozen base", scope.unchanged);
  check("Base materials restore exactly", JSON.stringify(scope.initial.refinement.materials) === JSON.stringify(scope.restored.refinement.materials));
  check("Authored cameras and light profiles remain fixed", JSON.stringify(scope.initial.views) === JSON.stringify(scope.candidate.views) && JSON.stringify(scope.initial.profiles) === JSON.stringify(scope.candidate.profiles));
  const opticalNames = new Set(["exterior.sapphire", "enclosure.sapphire"]);
  const before = scope.initial.refinement.materials;
  const after = scope.candidate.refinement.materials;
  assert.equal(before.length, after.length);
  check("Only sapphire specular color and intensity differ", before.every((a, i) => {
    const b = after[i];
    if (!opticalNames.has(a.name)) return JSON.stringify(a) === JSON.stringify(b);
    return Object.keys(a).every(key => ["specularIntensity", "specularColorLinear"].includes(key) || JSON.stringify(a[key]) === JSON.stringify(b[key]));
  }));
  check("Both sapphire slots preserve normal-incidence reflectance", before.filter(a => opticalNames.has(a.name)).every(a => {
    const b = after.find(row => row.name === a.name);
    return a.specularColorLinear.every((value, i) => Math.abs(value * a.specularIntensity - b.specularColorLinear[i] * b.specularIntensity) < 1e-12) && b.specularIntensity === 1;
  }));
  for (const degrees of [-12, -6, 0, 6, 12]) {
    for (const stage of ["graphite-finish", "graphite-sapphire"]) {
      const capture = await page.evaluate(({ stage, degrees }) => {
        const w = window.__WATCH__;
        w.setRefinement(stage); w.setView("r1SapphireOblique");
        w.setTime(0.104); w.setReadoutPose("1010");
        const camera = w.releasePresentationReport().views.r1SapphireOblique;
        const [x, y, z] = camera.position.map((v, i) => v - camera.target[i]);
        const angle = degrees * Math.PI / 180;
        const position = [x * Math.cos(angle) + z * Math.sin(angle) + camera.target[0], y + camera.target[1], -x * Math.sin(angle) + z * Math.cos(angle) + camera.target[2]];
        w.setCaptureCamera(position, camera.target);
        return { image: w.capture(), position, target: camera.target, presentation: w.releasePresentationReport() };
      }, { stage, degrees });
      const file = `sapphire-${degrees}-${stage}.png`;
      fs.writeFileSync(path.join(output, file), Buffer.from(capture.image.split(",")[1], "base64"));
      const { image, ...metadata } = capture;
      report.captures.push({ file, stage, degrees, ...metadata }); save();
      console.log(file);
    }
  }
  check("Sweep cameras match requested positions", report.captures.every(row => row.position.every((v, i) => Math.abs(v - row.presentation.current.camera.position[i]) < 1e-7)));
  check("No unexpected browser errors", report.errors.length === 0);
} finally { save(); await browser.close(); }
