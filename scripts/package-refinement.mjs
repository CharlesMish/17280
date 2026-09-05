import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const output = path.resolve(process.argv[2] || "captures/refinement-2026-09-05");
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
const inputs = {
  comparisons: "/tmp/watch-refinement-matched",
  interaction: "/tmp/watch-refinement-validation-layout",
  "optics-unit": "/tmp/watch-refinement-optics-unit",
  "optics-sapphire": "/tmp/watch-refinement-optics-sapphire",
  orbit: "/tmp/watch-refinement-orbit-final",
  touch: "/tmp/watch-refinement-touch",
  "phone-public": "/tmp/watch-refinement-phone-final",
};
const runtimePath = "/tmp/watch-refinement-public-runtime-final.json";
const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
const interaction = JSON.parse(fs.readFileSync(path.join(inputs.interaction, "report.json"), "utf8"));
const touch = JSON.parse(fs.readFileSync(path.join(inputs.touch, "report.json"), "utf8"));
if (!touch.passed) throw new Error("Touch checks have not passed");
const publicCaptures = JSON.parse(fs.readFileSync(path.join(inputs["phone-public"], "report.json"), "utf8"));
if (publicCaptures.views.length !== 10 || publicCaptures.poses.length !== 28) throw new Error("Public capture matrix incomplete");
if (!runtime.accepted || interaction.errors.length || interaction.scenarios.length !== 8 || !interaction.checks.every(row => row.passed) || interaction.checks.length < 35) {
  throw new Error("Evidence gates have not passed");
}
for (const directory of [inputs.comparisons, inputs["optics-unit"], inputs["optics-sapphire"]]) {
  const report = JSON.parse(fs.readFileSync(path.join(directory, "report.json"), "utf8"));
  if (report.errors.length) throw new Error(`Capture errors in ${directory}`);
}
if (!fs.existsSync(path.join(inputs.orbit, "comparison.mp4"))) throw new Error("Missing orbit video");
const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
fs.mkdirSync(output, { recursive: true });
for (const [name, directory] of Object.entries(inputs)) fs.cpSync(directory, path.join(output, name), { recursive: true });
fs.copyFileSync(runtimePath, path.join(output, "runtime.json"));
fs.writeFileSync(path.join(output, "WATCH_REFINEMENT.md"), fs.readFileSync("WATCH_REFINEMENT.md", "utf8")
  .replace("(captures/refinement-2026-09-05/index.html)", "(index.html)"));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const sourceFiles = ["index.html", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json", ...walk("src"),
  "scripts/capture-refinement.mjs", "scripts/capture-refinement-orbit.mjs", "scripts/capture-refinement-phone.mjs", "scripts/test-refinement.mjs", "scripts/test-refinement-touch.mjs", "scripts/audit-public-runtime.mjs", "scripts/package-refinement.mjs"];
const manifest = {
  baselineCommit: "e32469d319e57ba78aaaefebb72ee865b79aa0e7",
  currentCommit,
  generatedAt: new Date().toISOString(),
  source: sourceFiles.sort().map(file => ({ file, sha256: hash(file) })),
  build: walk("dist").sort().map(file => ({ file, sha256: hash(file) })),
  checks: { build: "npm run build passed", interaction: interaction.checks, touchPassed: touch.passed, runtimeAccepted: runtime.accepted },
  limits: ["Chromium/ANGLE SwiftShader; hardware GPUs and physical phones untested", "24-frame informational timing sample; all runtime functional checks retained", "No new full-cycle collision certification"],
};
const imageLink = (file, label) => `<figure><a href="${file}"><img loading="lazy" src="${file}" alt="${label}"></a><figcaption>${label}</figcaption></figure>`;
const comparisons = ["hero", "front", "rear", "wearable", "sapphire", "exploded"].map(view =>
  `<h2>${view}</h2><div class="three">${["baseline", "materials", "final"].map(stage => imageLink(`comparisons/${view}-${stage}.png`, stage)).join("")}</div>`).join("");
const optics = ["front", "sapphire", "exploded"].map(view => `<h3>${view}</h3><div class="three">${imageLink(`optics-unit/${view}-final.png`, "IOR 1.0")}${imageLink(`comparisons/${view}-final.png`, "Selected: IOR 1.46")}${imageLink(`optics-sapphire/${view}-final.png`, "IOR 1.77")}</div>`).join("");
const publicViews = ["desktop", "phone"].map(size => `<h3>${size}</h3><div class="four">${["hero", "front", "wearable", "rear"].map(view => imageLink(`phone-public/${size}-${view}.png`, view)).join("")}</div>`).join("");
const poses = ["desktop", "phone"].map(size => `<h3>${size}</h3>${["r1FinalHero", "r1FrontElevation"].map(view => `<div class="four">${["1010", "300", "630", "840", "945", "105", "1200"].map(pose => imageLink(`phone-public/${size}-${view}-${pose}.png`, `${view} · ${pose}`)).join("")}</div>`).join("")}`).join("");
fs.writeFileSync(path.join(output, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>17280 refinement review</title><style>body{background:#17191d;color:#dee7ef;font:16px system-ui;margin:24px auto;padding:0 20px;max-width:1600px}a{color:#a8deef}h1{font-size:28px}h2{margin-top:40px;text-transform:capitalize}h3{text-transform:capitalize}p{max-width:80ch;line-height:1.5}figure{margin:4px;min-width:0}img{width:100%}figcaption{text-align:center;padding:8px}video{width:100%}.three,.four{display:grid;grid-template-columns:repeat(3,1fr)}.four{grid-template-columns:repeat(4,1fr)}@media(max-width:700px){.three,.four{grid-template-columns:1fr 1fr}}</style><h1>17280 — refinement review</h1><p>Soft satin response, clearer blue hands, subdued holder pads, restrained sapphire, and selectable exploded layers. Product geometry and driven-hand behavior preserved. Click any image for full size.</p><p><a href="WATCH_REFINEMENT.md">Implementation notes</a> · <a href="manifest.json">Source and validation manifest</a> · <a href="runtime.json">Runtime report</a></p><h2>Matched comparisons</h2><p>Baseline → materials and lighting → selected result with dial hierarchy. Identical cameras, movement time and pose; original R1 proof framing retained.</p>${comparisons}<h2>Optical isolation</h2>${optics}<h2>Public desktop and phone layouts</h2>${publicViews}<h2>Layer selection</h2><div class="three">${imageLink("interaction/front-sapphire-highlight.png", "Front sapphire selected")}${imageLink("interaction/display-highlight.png", "Hands and dial selected")}</div><h2>Matched orbit</h2><p>12-second sampled comparison under a fixed hero lighting profile. This is not a frame-rate demonstration.</p><video controls loop preload="metadata" src="orbit/comparison.mp4"></video><h2>Readability poses</h2>${poses}<h2>Validation limits</h2><p>Browser evidence uses Chromium/ANGLE SwiftShader. Physical phones and hardware GPU rendering remain untested. Historical collision certificates were not regenerated.</p></html>`);
manifest.artifacts = walk(output).sort().map(file => ({ file: path.relative(output, file), sha256: hash(file) }));
fs.writeFileSync(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(path.join(output, "index.html"));
