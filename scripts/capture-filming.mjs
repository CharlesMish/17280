import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const SHOT_IDS = ["balance", "hands", "crown", "sapphire", "strap", "rear"];
const ALLOWED_CONSOLE_ERROR = "THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)";
const usage = `Usage: node scripts/capture-filming.mjs [base] [output] [all|balance,hands,crown,sapphire,strap,rear]
  --preview-only  --width=960  --height=540  --fps=24  --duration=4  --optics=translucent
Exports sampled PNG previews and MP4 clips. Duration is in seconds, at most 6.
The output directory must not already exist.`;

function options(argv) {
  const positional = [];
  const flags = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [name, ...values] = arg.slice(2).split("=");
    if (!["preview-only", "width", "height", "fps", "duration", "optics"].includes(name)) throw new Error(`Unknown option: ${arg}`);
    if (flags.has(name)) throw new Error(`Repeated option: --${name}`);
    if (name === "preview-only" ? values.length !== 0 : values.length !== 1 || values[0] === "") {
      throw new Error(`Invalid option: ${arg}`);
    }
    flags.set(name, name === "preview-only" ? true : values[0]);
  }
  if (positional.length > 3) throw new Error("Expected at most three positional arguments");
  const base = new URL(positional[0] ?? "http://127.0.0.1:5173");
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("Base URL must use HTTP or HTTPS");
  if (base.username || base.password) throw new Error("Base URL must not include credentials");
  const width = Number(flags.get("width") ?? 960);
  const height = Number(flags.get("height") ?? 540);
  const fps = Number(flags.get("fps") ?? 24);
  const duration = Number(flags.get("duration") ?? 4);
  const optics = flags.get("optics") ?? "translucent";
  if (!["translucent", "opaque", "hidden"].includes(optics)) throw new Error("optics must be translucent, opaque or hidden");
  for (const [name, value, max] of [["width", width, 3840], ["height", height, 2160]]) {
    if (!Number.isInteger(value) || value < 64 || value > max || value % 2) throw new Error(`${name} must be an even integer between 64 and ${max}`);
  }
  if (!Number.isInteger(fps) || fps < 1 || fps > 120) throw new Error("fps must be an integer between 1 and 120");
  if (!Number.isFinite(duration) || duration <= 0 || duration > 6) throw new Error("duration must be greater than 0 and at most 6 seconds");
  const frames = Math.round(fps * duration);
  if (frames < 2 || Math.abs(frames - fps * duration) > 1e-8) throw new Error("duration × fps must be a whole number of at least two frames");
  const requested = positional[2] ?? "all";
  const shots = requested === "all" ? [...SHOT_IDS] : requested.split(",");
  if (shots.some(id => !SHOT_IDS.includes(id)) || new Set(shots).size !== shots.length) {
    throw new Error(`Choose all or unique shot IDs: ${SHOT_IDS.join(",")}`);
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = path.resolve(positional[1] ?? `captures/filming-${timestamp}`);
  if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
  base.search = "";
  base.hash = "";
  base.searchParams.set("film", shots[0]);
  base.searchParams.set("static", "1");
  base.searchParams.set("readoutPose", "1010");
  base.searchParams.set("optics", optics);
  return { url: base.href, output, shots, width, height, fps, duration, frames, optics, previewOnly: flags.has("preview-only") };
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

function gallery(report) {
  const { parameters: p } = report;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>17280 — close-up films</title>
<style>body{max-width:1280px;margin:32px auto;padding:0 20px;background:#17191d;color:#e0e6ee;font:16px/1.5 system-ui}h1{font-weight:500}h2{margin-top:40px}p{max-width:850px}a{color:#a8d5ef}video{display:block;width:100%;max-width:960px;background:#111}section{border-top:1px solid #353a40;margin-top:32px}.previews{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:16px 0}img{display:block;width:100%}figcaption{color:#aeb8c5;font-size:14px}@media(max-width:620px){.previews{grid-template-columns:1fr}}</style>
<h1>17280 — close-up films</h1><p>${escapeHtml(p.width)} × ${escapeHtml(p.height)} · ${escapeHtml(p.fps)} fps · ${escapeHtml(p.duration)} seconds per shot · ${p.previewOnly ? "preview images" : "H.264 MP4"}. Deterministic camera and movement samples rendered in software WebGL. Blue hands are posed at 10:10.</p><p>Status: ${escapeHtml(report.status)} · <a href="report.json">Capture report</a></p>
${report.shots.map(shot => `<section><h2>${escapeHtml(shot.label)}</h2><p>${escapeHtml(shot.description)}</p>${shot.video ? `<video controls loop playsinline preload="metadata" poster="${escapeHtml(shot.previews[0]?.file ?? "")}" src="${escapeHtml(shot.video)}"></video><p><a href="${escapeHtml(shot.video)}" download>Download MP4</a></p>` : ""}<div class="previews">${shot.previews.map(preview => `<figure><a href="${escapeHtml(preview.file)}"><img src="${escapeHtml(preview.file)}" alt="${escapeHtml(`${shot.label}, ${preview.label}`)}" loading="lazy"></a><figcaption>${escapeHtml(preview.label)} · ${escapeHtml(preview.seconds.toFixed(3))} s</figcaption></figure>`).join("")}</div><p>${escapeHtml(shot.status)}</p></section>`).join("\n")}
</html>`;
}

function encoder(file, config) {
  const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-n", "-f", "image2pipe", "-framerate", String(config.fps), "-vcodec", "png", "-i", "pipe:0", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", file], { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  let error = null;
  child.stderr.on("data", bytes => { stderr = (stderr + bytes.toString()).slice(-24000); });
  child.stdin.on("error", () => {});
  child.on("error", cause => { error = cause; });
  const done = new Promise(resolve => child.once("close", (code, signal) => resolve({ code, signal, error, stderr })));
  return { child, done, write: bytes => new Promise((resolve, reject) => {
    child.stdin.write(bytes, cause => cause ? reject(new Error(`ffmpeg input failed: ${cause.message}${stderr ? `\n${stderr}` : ""}`)) : resolve());
  }) };
}

async function run(config) {
  fs.mkdirSync(config.output, { recursive: true });
  const report = {
    startedAt: new Date().toISOString(),
    status: "running",
    source: config.url,
    parameters: { width: config.width, height: config.height, fps: config.fps, duration: config.duration, framesPerShot: config.frames, previewOnly: config.previewOnly, optics: config.optics },
    softwareRendering: true,
    browser: null,
    shots: [],
    errors: [],
  };
  const save = () => {
    fs.writeFileSync(path.join(config.output, "report.json"), JSON.stringify(report, null, 2) + "\n");
    fs.writeFileSync(path.join(config.output, "index.html"), gallery(report));
  };
  let browser;
  let activeEncoder;
  let interrupted = false;
  const onSignal = () => {
    interrupted = true;
    activeEncoder?.child.kill("SIGTERM");
    void browser?.close().catch(() => {});
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  save();
  try {
    browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
    report.browser = browser.version();
    const page = await browser.newPage({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(180000);
    page.on("pageerror", error => report.errors.push(`page: ${error.message}`));
    page.on("console", message => {
      if (message.type() === "error" && message.text() !== ALLOWED_CONSOLE_ERROR) report.errors.push(`console: ${message.text()}`);
    });
    page.on("requestfailed", request => report.errors.push(`request: ${request.url()} — ${request.failure()?.errorText ?? "failed"}`));
    page.on("response", response => {
      if (response.status() >= 400) report.errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    await page.goto(config.url, { waitUntil: "commit" });
    await page.waitForFunction(() => typeof window.__WATCH_FILM__?.setFrame === "function" && typeof window.__WATCH__?.capture === "function");
    const available = await page.evaluate(() => {
      window.__WATCH_FILM__.pause();
      return window.__WATCH_FILM__.shots;
    });
    for (const id of config.shots) {
      const shot = available.find(candidate => candidate.id === id);
      if (!shot || !Number.isFinite(shot.duration) || config.duration > shot.duration) throw new Error(`Shot ${id} does not support requested duration ${config.duration}`);
    }
    if (report.errors.length) throw new Error("Browser reported errors before capture; see report.json");
    const previewFrames = [{ label: "Start", frame: 0 }, { label: "Middle", frame: Math.floor(config.frames / 2) }, { label: "End", frame: config.frames - 1 }];
    for (const id of config.shots) {
      const definition = available.find(candidate => candidate.id === id);
      const shot = { id, label: definition.label, description: definition.description, authoredDuration: definition.duration, status: "rendering", framesRendered: 0, video: null, previews: [] };
      report.shots.push(shot);
      save();
      console.log(`${id}: ${config.previewOnly ? "previews" : `${config.frames} frames`}`);
      if (!config.previewOnly) activeEncoder = encoder(path.join(config.output, `${id}.mp4`), config);
      const frames = config.previewOnly ? [...new Set(previewFrames.map(preview => preview.frame))] : Array.from({ length: config.frames }, (_, frame) => frame);
      for (const frame of frames) {
        if (interrupted) throw new Error("Capture interrupted");
        const seconds = frame / config.fps;
        const previews = previewFrames.filter(candidate => candidate.frame === frame);
        const { dataUrl, presentation } = await page.evaluate(({ id, seconds, includePresentation }) => {
          window.__WATCH_FILM__.setFrame(id, seconds);
          const dataUrl = window.__WATCH__.capture();
          const report = includePresentation ? window.__WATCH__.releasePresentationReport() : null;
          return { dataUrl, presentation: report ? { current: report.current, refinement: { stage: report.refinement.stage } } : null };
        }, { id, seconds, includePresentation: previews.length > 0 });
        if (frame === 0) {
          const current = presentation?.current;
          const failures = [];
          if (typeof current?.view !== "string" || !current.view.startsWith("r1")) failures.push(`expected an R1 product view, received ${JSON.stringify(current?.view)}`);
          if (current?.exploded !== 0) failures.push(`expected exploded=0, received ${JSON.stringify(current?.exploded)}`);
          if (!current || current.shellEnabled) failures.push(`expected shellEnabled=false, received ${JSON.stringify(current?.shellEnabled)}`);
          if (presentation?.refinement.stage !== "graphite-finish") failures.push(`expected graphite-finish, received ${JSON.stringify(presentation?.refinement.stage)}`);
          if (failures.length) throw new Error(`${id}: initial presentation check failed: ${failures.join("; ")}`);
        }
        if (!dataUrl.startsWith("data:image/png;base64,")) throw new Error(`${id}: capture did not return a PNG`);
        const bytes = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
        if (bytes.length < 24 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a" || bytes.readUInt32BE(16) !== config.width || bytes.readUInt32BE(20) !== config.height) {
          throw new Error(`${id}: captured PNG dimensions do not match ${config.width} × ${config.height}`);
        }
        if (report.errors.length) throw new Error("Browser reported errors during capture; see report.json");
        for (const preview of previews) {
          const file = `${id}-${preview.label.toLowerCase()}.png`;
          fs.writeFileSync(path.join(config.output, file), bytes);
          shot.previews.push({ label: preview.label, file, frame, seconds, ...presentation });
        }
        if (activeEncoder) await activeEncoder.write(bytes);
        shot.framesRendered++;
        if (frame % config.fps === 0 || frame === frames.at(-1)) {
          save();
          console.log(`${id}: ${shot.framesRendered}/${frames.length}`);
        }
      }
      if (activeEncoder) {
        activeEncoder.child.stdin.end();
        const result = await activeEncoder.done;
        activeEncoder = undefined;
        if (result.code !== 0 || result.error) throw new Error(`ffmpeg failed: ${result.error?.message ?? result.signal ?? result.code}${result.stderr ? `\n${result.stderr}` : ""}`);
        shot.video = `${id}.mp4`;
      }
      shot.status = config.previewOnly ? "previews complete" : "complete";
      save();
    }
    report.status = "complete";
  } catch (error) {
    report.status = interrupted ? "interrupted" : "failed";
    report.errors.push(error instanceof Error ? error.message : String(error));
    const current = report.shots.at(-1);
    if (current?.status === "rendering") current.status = report.status;
    throw error;
  } finally {
    if (activeEncoder) {
      activeEncoder.child.stdin.destroy();
      activeEncoder.child.kill("SIGKILL");
      await activeEncoder.done;
    }
    await browser?.close().catch(() => {});
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    report.finishedAt = new Date().toISOString();
    save();
    console.log(`Capture ${report.status}: ${path.join(config.output, "index.html")}`);
  }
}

if (process.argv.slice(2).includes("--help")) {
  console.log(usage);
} else {
  try {
    await run(options(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
