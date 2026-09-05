import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";

const [output = "captures/graphite-2026-09-05"] = process.argv.slice(2);
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
const inputs = {
  comparisons: "/tmp/watch-graphite-accepted",
  optics: "/tmp/watch-graphite-optics",
  interaction: "/tmp/watch-graphite-tests",
  touch: "/tmp/watch-graphite-touch",
  public: "/tmp/watch-graphite-public",
  orbit: "/tmp/watch-graphite-orbit",
};
const read = folder => JSON.parse(fs.readFileSync(path.join(folder, "report.json"), "utf8"));
const interaction = read(inputs.interaction);
const touch = read(inputs.touch);
const publicViews = read(inputs.public);
if (interaction.checks.length !== 37 || interaction.checks.some(c => !c.passed) || interaction.errors.length) throw new Error("Interaction gate failed");
if (!touch.passed || touch.layers.length !== 8 || touch.errors.length) throw new Error("Touch gate failed");
if (publicViews.views.length !== 10 || publicViews.poses.length !== 28 || publicViews.errors.length) throw new Error("Public capture gate failed");
for (const name of ["comparisons", "optics"]) {
  const report = read(inputs[name]);
  if (report.errors.length || !report.exactCameraAlignmentVerified || report.captures.length !== (name === "optics" ? 40 : 18)) throw new Error(`${name} gate failed`);
}
if (!fs.existsSync(path.join(inputs.orbit, "comparison.mp4"))) throw new Error("Orbit missing");
const orbit = read(inputs.orbit);
if (orbit.before !== "final" || orbit.after !== "graphite" || orbit.frames !== 24 || orbit.errors.length) throw new Error("Orbit gate failed");
const comparisons = read(inputs.comparisons).captures;
for (const view of ["hero", "sapphire", "exploded", "front", "rear", "wearable"]) {
  const previous = comparisons.find(c => c.view === view && c.stage === "final").presentation;
  const candidate = comparisons.find(c => c.view === view && c.stage === "graphite").presentation;
  assert.deepEqual(candidate.views, previous.views, "Authored cameras changed");
  assert.deepEqual(candidate.profiles, previous.profiles, "Intensity profiles changed");
  assert.equal(candidate.current.profile, previous.current.profile);
  const material = (r, name) => r.refinement.materials.find(m => m.name === name);
  for (const name of ["readout.hourFace", "readout.minuteFace", "holder.pad"]) {
    assert.ok(material(candidate, name), `Missing ${name}`);
    assert.deepEqual(material(candidate, name), material(previous, name), `${name} readability changed`);
  }
  assert.equal(material(candidate, "exterior.bezelSatin").color, "74787a");
  assert.equal(material(candidate, "finish.bridgeFace").color, "929593");
  assert.equal(material(candidate, "finish.cockFace").color, "a5a49f");
  for (const name of ["exterior.sapphire", "enclosure.sapphire"]) {
    const sapphire = material(candidate, name);
    assert.equal(sapphire.ior, 1.77);
    assert.equal(sapphire.thickness, 0);
    assert.equal(sapphire.specularIntensity, 0.4);
  }
}
fs.mkdirSync(output, { recursive: true });
for (const [name, source] of Object.entries(inputs)) fs.cpSync(source, path.join(output, name), { recursive: true, errorOnExist: true });
fs.copyFileSync("GRAPHITE_REFINEMENT.md", path.join(output, "GRAPHITE_REFINEMENT.md"));
const figures = ["hero", "sapphire", "exploded", "front", "rear", "wearable"].map(view => `<h2>${view}</h2><section>${["final", "graphite-materials", "graphite"].map(stage => `<figure><img loading="lazy" src="comparisons/${view}-${stage}.png"><figcaption>${stage}</figcaption></figure>`).join("")}</section>`).join("");
fs.writeFileSync(path.join(output, "index.html"), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>17280 graphite refinement</title><style>body{background:#17191d;color:#ddd;font:16px system-ui;margin:24px}a{color:#83b9ef}section{display:flex}figure{margin:4px;flex:1;min-width:0}img{width:100%}video{width:100%;max-width:1280px}@media(max-width:700px){section{display:block}}</style><h1>17280 — graphite refinement</h1><p>Left: previous final. Middle: material-only treatment. Right: accepted graphite and reflections. Cameras, time and hand pose matched.</p><p><a href="GRAPHITE_REFINEMENT.md">Change notes</a> · <a href="optics/index.html">Optical calibration</a> · <a href="interaction/report.json">37 checks</a> · <a href="touch/report.json">Touch checks</a></p>${figures}<h2>Matched orbit: final → graphite</h2><video controls loop src="orbit/comparison.mp4"></video><h2>Phone</h2><section><figure><img src="public/phone-hero.png"><figcaption>Hero</figcaption></figure><figure><img src="public/phone-exploded.png"><figcaption>Exploded with crystal selected</figcaption></figure></section>`);
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const files = walk(output).map(file => ({ file: path.relative(output, file), sha256: hash(file) }));
const source = [...walk("src"), ...walk("scripts"), "README.md", "WATCH_REFINEMENT.md", "GRAPHITE_REFINEMENT.md", "package.json", "package-lock.json"].map(file => ({ file, sha256: hash(file) }));
const build = walk("dist").map(file => ({ file, sha256: hash(file) }));
fs.writeFileSync(path.join(output, "manifest.json"), JSON.stringify({ baseline: "Previous final preserved at ?refinement=final", softwareRendering: true, files, source, build }, null, 2));
console.log(`Packaged ${files.length} artifacts at ${output}`);
