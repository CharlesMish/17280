import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [base = "http://127.0.0.1:5198", output = "/tmp/watch-graphite-optics"] = process.argv.slice(2);
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const report = { browser: browser.version(), softwareRendering: true, captures: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 760 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000);
  page.on("pageerror", error => report.errors.push(String(error)));
  page.on("console", m => { if (m.type() === "error" && !m.text().startsWith("THREE.BufferGeometry: .computeTangents() failed.")) report.errors.push(m.text()); });
  await page.goto(`${base}/?static=1&view=r1FinalHero&t=0.104&readoutPose=1010&refinement=graphite`, { waitUntil: "commit" });
  await page.waitForFunction(() => typeof window.__WATCH__?.setRefinement === "function");
  for (const [view, name] of Object.entries({ hero: "r1FinalHero", sapphire: "r1SapphireOblique", exploded: "r1E1Hero", front: "r1FrontElevation", rear: "r1RearExhibition" })) {
    // Full factorial: each optical variable can be judged independently.
    for (const ior of [1.46, 1.77]) for (const thickness of [0, 0.35]) for (const specularIntensity of [0.2, 0.4]) {
      const optics = { ior, thickness, specularIntensity };
      const capture = await page.evaluate(({ name, optics }) => {
        const w = window.__WATCH__;
        w.setRefinement("graphite", optics); w.setView(name);
        w.setReadoutPose("1010"); w.setTime(0.104);
        if (name === "r1E1Hero") w.setExplode(1);
        const camera = w.releasePresentationReport().views[name];
        w.setCaptureCamera(camera.position, camera.target);
        return { image: w.capture(), presentation: w.releasePresentationReport() };
      }, { name, optics });
      const file = `${view}-ior${ior}-t${thickness}-s${specularIntensity}.png`;
      fs.writeFileSync(path.join(output, file), Buffer.from(capture.image.split(",")[1], "base64"));
      report.captures.push({ view, file, optics, presentation: capture.presentation });
      console.log(file);
    }
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  }
  fs.writeFileSync(path.join(output, "index.html"), `<!doctype html><meta charset="utf-8"><title>17280 optical calibration</title><style>body{background:#17191d;color:#ddd;font:15px system-ui}main{display:grid;grid-template-columns:repeat(4,1fr)}figure{margin:4px}img{width:100%}</style><h1>Graphite optical calibration</h1><p>Matched cameras, pose and environment. IOR × shader thickness × specular intensity.</p><main>${report.captures.map(c => `<figure><img src="${c.file}"><figcaption>${c.file}</figcaption></figure>`).join("")}</main>`);
  if (report.errors.length) throw new Error(JSON.stringify(report.errors));
} finally {
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
