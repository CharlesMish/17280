import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const [base = "http://127.0.0.1:5197", output = "/tmp/watch-refinement-tests", stage = "final"] = process.argv.slice(2);
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const report = { browser: browser.version(), softwareRendering: true, errors: [], checks: [], scenarios: [] };
const check = (name, condition) => {
  report.checks.push({ name, passed: Boolean(condition) });
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
  assert.ok(condition, name);
};
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 760 }, reducedMotion: "reduce" });
  page.setDefaultTimeout(180000);
  page.on("pageerror", e => report.errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && m.text() !== "THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)") report.errors.push(m.text()); });
  await page.goto(`${base}/?view=r1FinalHero&t=0.104&readoutPose=1010`, { waitUntil: "commit" });
  await page.waitForFunction(() => typeof window.__WATCH__?.physicalPresentationSnapshot === "function");
  const physical = await page.evaluate(stage => {
    const w = window.__WATCH__;
    w.setRefinement("baseline"); w.capture();
    const before = JSON.stringify(w.physicalPresentationSnapshot());
    const driveBefore = JSON.stringify(w.displayDriveReport([0, 0.104, 0.208]));
    const originalMaterials = JSON.stringify(w.releasePresentationReport().refinement.materials);
    w.setRefinement(stage); w.capture();
    const candidateMaterials = JSON.stringify(w.releasePresentationReport().refinement.materials);
    w.setRefinement("baseline");
    const restored = originalMaterials === JSON.stringify(w.releasePresentationReport().refinement.materials);
    w.setRefinement(stage);
    const repeatable = candidateMaterials === JSON.stringify(w.releasePresentationReport().refinement.materials);
    return { unchanged: before === JSON.stringify(w.physicalPresentationSnapshot()),
      restored, repeatable,
      driveUnchanged: driveBefore === JSON.stringify(w.displayDriveReport([0, 0.104, 0.208])) };
  }, stage);
  check("Authored material values restore exactly", physical.restored);
  check("Candidate material values repeat exactly", physical.repeatable);
  check("All mesh attributes, topology, transforms and material references unchanged", physical.unchanged);
  check("Display drive and sampled kinematics unchanged", physical.driveUnchanged);
  await page.getByRole("button", { name: "Exploded", exact: true }).click();
  await page.locator(".release-shell__layers-summary").click();
  const ids = await page.locator("li[data-layer]").evaluateAll(items => items.map(item => item.dataset.layer));
  check("Eight assembly layers", ids.length === 8);
  const unselected = await page.evaluate(() => JSON.stringify(window.__WATCH__.physicalPresentationSnapshot()));
  for (const id of ids) {
    const button = page.locator(`li[data-layer="${id}"] button`);
    await button.click();
    check(`${id} selected`, await button.getAttribute("aria-pressed") === "true");
    check(`${id} API agrees`, await page.evaluate(() => window.__WATCH__.releasePresentationReport().selectedLayer) === id);
    if (id === "front-sapphire" || id === "display") await page.screenshot({ path: path.join(output, `${id}-highlight.png`) });
    await button.click();
    check(`${id} restores every material reference and physical transform`, await page.evaluate(() => JSON.stringify(window.__WATCH__.physicalPresentationSnapshot())) === unselected);
  }
  const first = page.locator("li[data-layer='front-sapphire'] button");
  await first.focus(); await page.keyboard.press("Space");
  check("Native Space activates layer without toggling playback", await first.getAttribute("aria-pressed") === "true" && await page.evaluate(() => window.__WATCH__.releasePresentationReport().current.playbackPaused));
  await page.keyboard.press("Escape");
  check("Escape clears selection", await first.getAttribute("aria-pressed") === "false");
  await first.focus(); await page.keyboard.press("Enter");
  check("Enter activates layer", await first.getAttribute("aria-pressed") === "true");
  await page.evaluate(() => window.__WATCH__.setCaptureCamera([52, -38, 50], [-0.5, 0.5, 1.5]));
  check("Orbit preserves selection", await first.getAttribute("aria-pressed") === "true");
  await page.getByRole("button", { name: "Assembled", exact: true }).click();
  check("Assembly clears selection and restores exact hierarchy", await page.evaluate(() => window.__WATCH__.releasePresentationReport().selectedLayer === null && window.__WATCH__.explodedAssemblyReport().assembledEquivalence.exactAtZero));
  for (const action of ["Front", "Reset view"]) {
    await page.getByRole("button", { name: "Exploded", exact: true }).click();
    await page.evaluate(() => window.__WATCH__.selectLayer("display"));
    await page.getByRole("button", { name: action, exact: true }).click();
    check(`${action} clears selection`, await page.evaluate(() => window.__WATCH__.releasePresentationReport().selectedLayer === null));
  }
  for (const viewport of [{ width: 960, height: 760 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const size = viewport.width === 390 ? "phone" : "desktop";
    for (const view of ["Hero", "Front", "Wearable", "Rear"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await page.evaluate(() => { window.__WATCH__.setReadoutPose("1010"); window.__WATCH__.capture(); });
      await page.screenshot({ path: path.join(output, `${size}-${view.toLowerCase()}.png`) });
      report.scenarios.push({ size, view, presentation: await page.evaluate(() => window.__WATCH__.releasePresentationReport().current) });
    }
  }
  check("No unexpected browser errors", report.errors.length === 0);
  console.log(`Passed ${report.checks.length} checks`);
} finally {
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
