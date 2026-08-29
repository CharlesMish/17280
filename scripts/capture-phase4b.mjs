import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "captures/phase4b-driven-display";
const baseUrl = (process.argv[3] || "http://127.0.0.1:5173").replace(/\/$/, "");
const T0 = 0.104;
const T60 = T0 + 60;
const T600 = T0 + 600;
const REPORT_TIMES = [T0, T0 + 10, T60, T600];

if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
  throw new Error(`Refusing to overwrite nonempty Phase 4B evidence directory: ${outDir}`);
}
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});

const viewport = { width: 1600, height: 1000 };
const pageErrors = [];
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(240000);
page.on("pageerror", (error) => {
  const message = `${error}`;
  pageErrors.push({ page: "drive", message });
  console.error("PAGEERROR", message);
});

const writeCapture = async (targetPage, file) => {
  const dataUrl = await targetPage.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", file);
};

const clearReadoutOverride = async (targetPage = page) => {
  await targetPage.evaluate(() => {
    const watch = window.__WATCH__;
    if (typeof watch.clearReadoutPose === "function") watch.clearReadoutPose();
    else watch.setReadoutPose(null);
  });
};

const prepareNormalView = async (view, time) => {
  await page.evaluate(
    ({ nextView, nextTime }) => {
      const watch = window.__WATCH__;
      watch.clearDisplayDriveAudit();
      watch.setView(nextView);
      if (typeof watch.clearReadoutPose === "function") watch.clearReadoutPose();
      else watch.setReadoutPose(null);
      watch.setTime(nextTime);
      watch.setDebug(false);
    },
    { nextView: view, nextTime: time },
  );
  await page.waitForTimeout(350);
};

await page.goto(`${baseUrl}/?static=1&view=readoutFront&t=${T0}`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => {
  const watch = window.__WATCH__;
  return (
    watch !== undefined &&
    typeof watch.setDisplayDriveAudit === "function" &&
    typeof watch.clearDisplayDriveAudit === "function" &&
    typeof watch.setReadoutPose === "function" &&
    typeof watch.displayDriveReport === "function" &&
    typeof watch.kinematicReport === "function"
  );
});
await page.waitForTimeout(900);
await clearReadoutOverride();

const auditShots = [
  ["center-axis-side-section.png", "side"],
  ["isolated-rotating-owners.png", "rotating"],
  ["isolated-stationary-bearing.png", "stationary"],
  ["motion-works-oblique.png", "motionWorks"],
  ["flat-id-ownership.png", "flatId"],
  ["minute-drive-close-section.png", "minuteSection"],
  ["hour-minute-coaxial-section.png", "coaxialSection"],
];

let flatIdOwnership = [];
for (const [file, mode] of auditShots) {
  await page.evaluate(
    ({ nextMode, nextTime }) => {
      const watch = window.__WATCH__;
      watch.clearDisplayDriveAudit();
      if (typeof watch.clearReadoutPose === "function") watch.clearReadoutPose();
      else watch.setReadoutPose(null);
      watch.setTime(nextTime);
      watch.setDebug(false);
      watch.setDisplayDriveAudit(nextMode);
    },
    { nextMode: mode, nextTime: T0 },
  );
  await page.waitForTimeout(450);
  await writeCapture(page, file);
  if (mode === "flatId") {
    flatIdOwnership = await page.evaluate(() =>
      typeof window.__WATCH__.junctionOwnership === "function" ? window.__WATCH__.junctionOwnership() : [],
    );
  }
}

await page.evaluate(() => window.__WATCH__.clearDisplayDriveAudit());

const runtimeShots = [
  ["runtime-t000.png", T0],
  ["runtime-t060.png", T60],
  ["accelerated-t000.png", T0],
  ["accelerated-t600.png", T600],
];
for (const [file, time] of runtimeShots) {
  await prepareNormalView("readoutFront", time);
  await writeCapture(page, file);
}

await prepareNormalView("readoutFront", T0);
const overrideBefore = await page.evaluate((times) => window.__WATCH__.displayDriveReport(times), [T0]);

await page.evaluate(() => window.__WATCH__.setReadoutPose("1010"));
await page.waitForTimeout(300);
const overrideDuring = await page.evaluate((times) => window.__WATCH__.displayDriveReport(times), [T0]);
await page.evaluate(() => window.__WATCH__.setView("extFront"));
await page.waitForTimeout(300);
await writeCapture(page, "normal-front.png");
await clearReadoutOverride();

await page.evaluate(() => {
  window.__WATCH__.setView("readoutThreeQuarter");
  window.__WATCH__.setReadoutPose("1010");
});
await page.waitForTimeout(300);
await writeCapture(page, "normal-front-three-quarter.png");
await clearReadoutOverride();

await prepareNormalView("readoutFront", T0);
const overrideAfter = await page.evaluate((times) => window.__WATCH__.displayDriveReport(times), [T0]);
const overrideRestoration = {
  requested: "1010",
  before: overrideBefore,
  during: overrideDuring,
  after: overrideAfter,
  restored: JSON.stringify(overrideBefore) === JSON.stringify(overrideAfter),
};

await prepareNormalView("readoutFront", T0);
const report = await page.evaluate(
  ({ times }) => ({
    phase: "4B",
    drive: window.__WATCH__.displayDriveReport(times),
    kinematics: window.__WATCH__.kinematicReport(times),
    center: window.__WATCH__.centerIntegrityReport(),
    authority: {
      structure: window.__WATCH__.structureReport(),
      assembly: window.__WATCH__.assemblyReport(),
      accommodation: window.__WATCH__.accommodationReport(),
      display: window.__WATCH__.displayReport(),
      enclosure: window.__WATCH__.enclosureReport(),
      exterior: window.__WATCH__.exteriorReport(),
      readout: window.__WATCH__.readoutReport(),
      finish: window.__WATCH__.finishReport(),
      strap: window.__WATCH__.strapReport(),
    },
  }),
  { times: REPORT_TIMES },
);

const relevantSceneRows = await page.evaluate(() => {
  const needles = [
    "cannon",
    "minuteDrive",
    "motionWork",
    "hourPipe",
    "hourWheel",
    "minuteWheel",
    "HourHandMount",
    "MinuteHandMount",
    "readout:hub",
  ];
  return window.__WATCH__.sceneDump().filter((row) =>
    needles.some((needle) => `${row.name}/${row.parent}`.toLowerCase().includes(needle.toLowerCase())),
  );
});

// A frozen page still owns an active renderer loop. Release it before opening
// the readout-disabled regression so two software-WebGL contexts cannot starve
// one another during their first shader compilation.
await context.close();

const offContext = await browser.newContext({ viewport, deviceScaleFactor: 1 });
const offPage = await offContext.newPage();
offPage.setDefaultTimeout(240000);
offPage.on("pageerror", (error) => {
  const message = `${error}`;
  pageErrors.push({ page: "readout-off", message });
  console.error("PAGEERROR readout-off", message);
});
await offPage.goto(`${baseUrl}/?static=1&view=extFront&t=${T0}&readout=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await offPage.waitForFunction(() => window.__WATCH__ !== undefined);
await offPage.waitForTimeout(800);
await offPage.evaluate((time) => {
  window.__WATCH__.setView("extFront");
  window.__WATCH__.setTime(time);
  window.__WATCH__.setDebug(false);
}, T0);
await offPage.waitForTimeout(350);
await writeCapture(offPage, "readout-off.png");
const readoutOff = await offPage.evaluate(() => ({
  report: window.__WATCH__.readoutReport(),
  absent: window.__WATCH__.readoutReport() === null,
}));
await offContext.close();

const ownership = {
  auditMode: "flatId",
  rows: flatIdOwnership,
  drive: report.drive?.ownership ?? report.drive ?? null,
  scene: relevantSceneRows,
};

const evidence = auditShots.map(([file]) => file).concat(
  runtimeShots.map(([file]) => file),
  ["normal-front.png", "normal-front-three-quarter.png", "readout-off.png", "ownership.json", "report.json"],
);
const finalReport = {
  ...report,
  scope: "Phase 4B driven two-hand display closure",
  sampleTimesSeconds: REPORT_TIMES,
  capture: {
    baseUrl,
    viewport,
    noRuntimeReadoutOverride: true,
    acceleratedDeltaSeconds: 600,
    evidence,
  },
  overrideRestoration,
  readoutOff,
  pageErrors,
  phase5DStarted: false,
};

fs.writeFileSync(path.join(outDir, "ownership.json"), JSON.stringify(ownership, null, 2));
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(finalReport, null, 2));
console.log("report written", path.join(outDir, "report.json"));

await browser.close();

if (!overrideRestoration.restored || !readoutOff.absent || pageErrors.length > 0) {
  process.exitCode = 1;
  console.error(
    "Phase 4B capture proof failed",
    JSON.stringify(
      {
        overrideRestored: overrideRestoration.restored,
        readoutOffAbsent: readoutOff.absent,
        pageErrors,
      },
      null,
      2,
    ),
  );
} else {
  console.log("done", outDir);
}
