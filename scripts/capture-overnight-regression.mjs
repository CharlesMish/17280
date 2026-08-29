import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outPath = path.resolve(
  process.argv[2] || "captures/post5d-overnight-audit/regression/runtime-report.json",
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
    typeof globalThis.__WATCH__?.fourthWheelSweepAuditReport === "function",
);
await page.waitForTimeout(900);

const runtime = await page.evaluate(() => {
  const watch = globalThis.__WATCH__;
  const palletSupportNames = [
    "struct:column:pallet",
    "struct:column:pallet:lower",
    "struct:column:pallet:lowerLink",
    "struct:column:pallet:outboardPost",
    "struct:column:pallet:upperLink",
    "struct:column:pallet:upper",
    "struct:boss:pallet:lower",
    "struct:jewel:pallet:lower",
  ];
  const sceneRows = watch.sceneDump();
  const underpassNames = [
    "struct:escapeFinger:stemBar",
    "anchor:escape:shoulder",
    "struct:boss:escape:upper",
    "struct:boss:pallet:upper",
    "assembly:anchor:escape:screw:seat",
    "assembly:anchor:escape:screw:head",
    "assembly:bearing:escape:upper:setting",
    "assembly:bearing:pallet:upper:setting",
  ];
  return {
    api: Object.fromEntries([
      "escapementRepairReport",
      "kinematicReport",
      "displayDriveReport",
      "phase5dPresentationReport",
      "fourthWheelSweepAuditReport",
      "barrelCenterAuditReport",
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
    ].map((name) => [name, typeof watch[name]])),
    mechanical: watch.escapementRepairReport(),
    goingTrain: watch.kinematicReport([0.104, 10.104, 60.104, 210.104]),
    phase4b: watch.displayDriveReport([0.104, 60.104]),
    phase5d: watch.phase5dPresentationReport(),
    fourthWheelSweep: watch.fourthWheelSweepAuditReport(),
    barrelCenter: watch.barrelCenterAuditReport([0.104, 10.104, 60.104]),
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
    palletSupportScene: Object.fromEntries(
      palletSupportNames.map((name) => [name, sceneRows.filter((row) => row.name === name)]),
    ),
    underpassScene: Object.fromEntries(
      underpassNames.map((name) => [name, sceneRows.filter((row) => row.name === name)]),
    ),
  };
});

fs.writeFileSync(
  outPath,
  `${JSON.stringify({
    schema: "post5d-overnight-regression-runtime-v1",
    url: page.url(),
    ...runtime,
    runtimeDiagnostics: { pageErrors, consoleErrors, requestFailures },
  }, null, 2)}\n`,
);
await browser.close();
console.log(`done ${path.relative(process.cwd(), outPath)}`);
