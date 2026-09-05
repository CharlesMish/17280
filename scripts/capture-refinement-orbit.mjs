import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const [base = "http://127.0.0.1:5198", output = "/tmp/watch-refinement-orbit", before = "baseline", after = "final"] = process.argv.slice(2);
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000);
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error" && message.text() !== "THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)") errors.push(message.text());
  });
  await page.goto(`${base}/?static=1&view=r1FinalHero&t=0.104&readoutPose=1010`, { waitUntil: "commit" });
  await page.waitForFunction(() => typeof window.__WATCH__?.setCaptureCamera === "function", null, { timeout: 180000 });
  for (let frame = 0; frame < 24; frame++) {
    const pair = await page.evaluate(async ({ frame, before, after }) => {
      const w = window.__WATCH__;
      const angle = frame / 24 * Math.PI * 2;
      const images = [];
      for (const stage of [before, after]) {
        w.setRefinement(stage);
        w.setView("r1FinalHero");
        w.setCaptureCamera([Math.sin(angle) * 78 - 0.9, 13.4, Math.cos(angle) * 78 + 1.6], [-0.9, 0.55, 1.6]);
        const image = new Image(); image.src = w.capture(); await image.decode(); images.push(image);
      }
      const canvas = document.createElement("canvas"); canvas.width = 1280; canvas.height = 512;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#17191d"; ctx.fillRect(0, 0, 1280, 512);
      images.forEach((image, i) => ctx.drawImage(image, i * 640, 0));
      ctx.fillStyle = "#e0e6ee"; ctx.font = "18px system-ui"; ctx.textAlign = "center";
      ctx.fillText(before, 320, 501); ctx.fillText(after, 960, 501);
      return canvas.toDataURL("image/png");
    }, { frame, before, after });
    fs.writeFileSync(path.join(output, `${String(frame).padStart(3, "0")}.png`), Buffer.from(pair.split(",")[1], "base64"));
    console.log(`orbit ${frame + 1}/24`);
  }
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ before, after, frames: 24, softwareRendering: true, errors }, null, 2));
  if (errors.length) throw new Error(JSON.stringify(errors));
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-framerate", "2", "-i", path.join(output, "%03d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(output, "comparison.mp4")]);
  fs.writeFileSync(path.join(output, "index.html"), '<!doctype html><meta charset="utf-8"><title>17280 matched orbit</title><style>body{background:#17191d;color:#e0e6ee;font:16px system-ui;margin:24px}video{width:100%;max-width:1280px}</style><h1>17280 — matched orbit</h1><p>12-second sampled orbit; identical camera positions and movement pose. Software-rendered comparison, not a frame-rate demonstration.</p><video controls loop src="comparison.mp4"></video>');
} finally { await browser.close(); }
