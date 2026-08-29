import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outPath = path.resolve(
  process.argv[2] || "captures/post5d-newer-827/regression/runtime-report.json",
);
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);

const pageErrors = [];
const consoleErrors = [];
const requestFailures = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("requestfailed", (request) => {
  requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" });
});

await page.goto(`${baseUrl}/?static=1&view=presentHero&t=0.104&readoutPose=1010&explode=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(
  () =>
    typeof globalThis.__WATCH__?.escapementRepairReport === "function" &&
    typeof globalThis.__WATCH__?.phase5dPresentationReport === "function" &&
    typeof globalThis.__WATCH__?.explodedAssemblyReport === "function" &&
    typeof globalThis.__WATCH__?.sceneDump === "function",
);
await page.waitForTimeout(1200);

await page.evaluate(() => {
  const watch = globalThis.__WATCH__;
  watch.setExplode(0);
  watch.setTime(0.104);
  watch.setReadoutPose("1010");
});
await page.waitForTimeout(250);

const runtime = await page.evaluate(() => {
  const watch = globalThis.__WATCH__;
  const apiNames = [
    "escapementRepairReport",
    "kinematicReport",
    "displayDriveReport",
    "phase5dPresentationReport",
    "explodedAssemblyReport",
    "fourthWheelSweepAuditReport",
    "barrelCenterAuditReport",
    "barrelFourthAuditReport",
    "structureReport",
    "assemblyReport",
    "accommodationReport",
    "displayReport",
    "enclosureReport",
    "exteriorReport",
    "readoutReport",
    "finishReport",
    "strapReport",
    "sceneDump",
  ];
  const scene = watch.sceneDump();
  const focusTokens = [
    "center-network",
    "crown",
    "fourth:wheel",
    "fourth:pinion",
    "escape:pinion",
    "escape:wheel",
    "third:wheel",
    "third:pinion",
    "trainBridge",
    "column:pallet",
  ];
  return {
    api: Object.fromEntries(apiNames.map((name) => [name, typeof watch[name]])),
    escapement: watch.escapementRepairReport(),
    goingTrain: watch.kinematicReport([0.104, 10.104, 60.104, 210.104]),
    phase4b: watch.displayDriveReport([0.104, 60.104]),
    phase5d: watch.phase5dPresentationReport(),
    annexExplodeZero: watch.explodedAssemblyReport(),
    fourthWheelSweep: watch.fourthWheelSweepAuditReport(),
    barrelCenter: watch.barrelCenterAuditReport([0.104, 10.104, 60.104]),
    barrelFourth: watch.barrelFourthAuditReport([0.104, 10.104, 60.104]),
    authority: {
      structure: watch.structureReport(),
      assembly: watch.assemblyReport(),
      accommodation: watch.accommodationReport(),
      display: watch.displayReport(),
      enclosure: watch.enclosureReport(),
      exterior: watch.exteriorReport(),
      readout: watch.readoutReport(),
      finish: watch.finishReport(),
      strap: watch.strapReport(),
    },
    sceneSummary: {
      totalRows: scene.length,
      focusRows: scene.filter((row) => focusTokens.some((token) => row.path.includes(token) || row.name.includes(token))),
    },
  };
});

await page.evaluate(() => globalThis.__WATCH__.clearReadoutPose());

const report = {
  schema: "post5d-newer-827-regression-runtime-v1",
  url: page.url(),
  ...runtime,
  runtimeDiagnostics: { pageErrors, consoleErrors, requestFailures },
};
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(`done ${path.relative(process.cwd(), outPath)}`);
