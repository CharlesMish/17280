import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const [base = "http://127.0.0.1:5197", output = "/tmp/watch-refinement", requested = "hero,front,rear,wearable,sapphire,exploded", stages = "baseline,materials,final", ior = "auto", thickness = "0", specular = "0.4"] = process.argv.slice(2);
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
fs.mkdirSync(output, { recursive: true });
const views = { hero: "r1FinalHero", front: "r1FrontElevation", rear: "r1RearExhibition", wearable: "r1WearableProof", sapphire: "r1SapphireOblique", exploded: "r1E1Hero" };
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const report = { commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  diff: execFileSync("git", ["diff", "--stat"], { encoding: "utf8" }), browser: browser.version(),
  viewport: { width: 960, height: 760 }, deviceScaleFactor: 1, softwareRendering: true, captures: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000);
  page.on("pageerror", e => report.errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && m.text() !== "THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)") report.errors.push(m.text()); });
  await page.goto(`${base}/?static=1&view=r1FinalHero&t=0.104&readoutPose=1010&refinement=baseline${ior === "auto" ? "" : `&sapphireIor=${ior}`}&sapphireThickness=${thickness}&sapphireSpecular=${specular}`, { waitUntil: "commit" });
  await page.waitForFunction(() => typeof window.__WATCH__?.setRefinement === "function");
  for (const view of requested.split(",")) {
    for (const stage of stages.split(",")) {
      const capture = await page.evaluate(({ stage, name, exploded }) => {
        const w = window.__WATCH__;
        w.setRefinement(stage);
        w.setView(name);
        w.setReadoutPose("1010");
        w.setTime(0.104);
        if (exploded) w.setExplode(1);
        const r = w.releasePresentationReport();
        const camera = r.views[name];
        w.setCaptureCamera(camera.position, camera.target);
        const image = w.capture();
        return { image, presentation: w.releasePresentationReport(), optics: w.phase5dPresentationReport().sapphire };
      }, { stage, name: views[view], exploded: view === "exploded" });
      const file = `${view}-${stage}.png`;
      const bytes = Buffer.from(capture.image.split(",")[1], "base64");
      fs.writeFileSync(path.join(output, file), bytes);
      report.captures.push({ view, stage, file, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), presentation: capture.presentation, optics: capture.optics });
      fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
      console.log(file);
    }
  }
  const rows = requested.split(",").map(view => `<section><h2>${view}</h2><div>${report.captures.filter(c => c.view === view).map(c => `<figure><img src="${c.file}"><figcaption>${c.stage}</figcaption></figure>`).join("")}</div></section>`).join("");
  fs.writeFileSync(path.join(output, "comparison.html"), `<!doctype html><meta charset="utf-8"><title>17280 refinement comparison</title><style>body{margin:24px;background:#17191d;color:#dde4ec;font:16px system-ui}div{display:flex}figure{margin:4px;flex:1;min-width:0}img{width:100%}h2{font-size:18px}figcaption{text-align:center}</style><h1>17280 — matched refinement comparisons</h1><p>Commit ${report.commit}; 10:10; t=0.104; ${report.browser}; software WebGL.</p>${rows}`);
  if (report.errors.length) throw new Error(JSON.stringify(report.errors));
} finally { await browser.close(); }
