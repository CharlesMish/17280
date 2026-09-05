import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import * as THREE from "three";
import ts from "typescript";

const [base = "http://127.0.0.1:5200", output = "/tmp/watch-case-diagnosis"] = process.argv.slice(2);
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const report = { browser: browser.version(), softwareRendering: true, diagnosticCamerasOnly: true, captures: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 760 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000);
  page.on("pageerror", error => report.errors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error" && message.text() !== "THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)") report.errors.push(message.text());
  });
  await page.goto(`${base}/?static=1&view=r1SapphireOblique&t=0.104&readoutPose=1010&refinement=graphite-finish`, { waitUntil: "commit" });
  await page.waitForFunction(() => typeof window.__WATCH__?.exteriorReport === "function");
  for (const part of ["crown", "lug"]) {
    const result = await page.evaluate(part => {
      const w = window.__WATCH__;
      const exterior = w.exteriorReport();
      const c = exterior.crown, l = exterior.lugs;
      const target = part === "crown" ? [(c.bodyX0 + c.bodyX1) / 2, c.axis.y, c.axis.z]
        : [l.strapWidth / 2 + 0.7, l.sides[0].yRoot + 0.35, 1.1];
      const offset = part === "crown" ? [16, -14, 10] : [12, 9, 10];
      w.setCaptureCamera(target.map((v, i) => v + offset[i]), target);
      return { image: w.capture(), exterior, presentation: w.releasePresentationReport() };
    }, part);
    const { image, ...metadata } = result;
    fs.writeFileSync(path.join(output, `${part}.png`), Buffer.from(image.split(",")[1], "base64"));
    report.captures.push({ part, ...metadata });
    console.log(`${part}.png`);
  }
  // Reproduce the authored crown in memory to diagnose its UV seam. The live
  // model stays untouched. Fail explicitly if the inspected source is moved.
  const source = fs.readFileSync(new URL("../src/exteriorGeometry.ts", import.meta.url), "utf8");
  const extract = (from, to) => {
    const start = source.indexOf(from), end = source.indexOf(to, start);
    if (start < 0 || end < 0) throw new Error(`Missing inspected source: ${from}`);
    return source.slice(start, end);
  };
  const code = extract("function assignNormalGroups(", "function assignLugFinishGroups(")
    + extract("function assignCrownBodyGroups(", "function innerPoly(")
    + extract("  const bodySegments = 36;", "  lathe.computeVertexNormals();");
  const geometry = new Function("THREE", "c", ts.transpile(code) + "\nreturn lathe;")(THREE, report.captures[0].exterior.crown);
  const seam = () => {
    const n = geometry.getAttribute("normal"), p = geometry.getAttribute("position"), rows = n.count / 37;
    return Array.from({ length: rows }, (_, j) => ({
      profileRow: j,
      normalAngleDegrees: new THREE.Vector3().fromBufferAttribute(n, j).angleTo(new THREE.Vector3().fromBufferAttribute(n, 36 * rows + j)) * 180 / Math.PI,
      positionGap: new THREE.Vector3().fromBufferAttribute(p, j).distanceTo(new THREE.Vector3().fromBufferAttribute(p, 36 * rows + j)),
    }));
  };
  const generatedNormals = seam();
  geometry.computeVertexNormals();
  fs.writeFileSync(path.join(output, "crown-normal-seam.json"), JSON.stringify({
    method: "In-memory reproduction of current crown construction and material grouping; live model unchanged",
    generatedNormals, recomputedNormals: seam(),
  }, null, 2));
  geometry.dispose();
  if (report.errors.length) throw new Error(JSON.stringify(report.errors));
} finally {
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
