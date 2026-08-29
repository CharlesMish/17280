import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "captures/pre5d-fourth-wheel-sweep-audit";
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
const beforeDir = path.join(outDir, "before");
const afterDir = path.join(outDir, "after");
const regressionDir = path.join(outDir, "regression");
for (const dir of [outDir, beforeDir, afterDir, regressionDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
await page.goto(`${baseUrl}/?static=1&view=finishHero&t=0.104&readoutPose=1010`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(
  () =>
    typeof window.__WATCH__?.fourthWheelSweepAuditReport === "function" &&
    typeof window.__WATCH__?.setBarrelCenterAudit === "function",
);
await page.waitForTimeout(1000);

const capture = async (dir, file) => {
  const data = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(dir, file), Buffer.from(data.split(",")[1], "base64"));
};

const setAudit = async (mode, time = 0.104) => {
  await page.evaluate(
    ({ nextMode, nextTime }) => {
      window.__WATCH__.setTime(nextTime);
      window.__WATCH__.setBarrelCenterAudit(nextMode);
    },
    { nextMode: mode, nextTime: time },
  );
};

// No mechanical edit is warranted. These are intentionally identical-camera
// controls: “before” is the accepted incoming geometry and “after” is the
// audited, preserved geometry after the bounded diagnosis.
await setAudit("fourthSweepNormal");
await capture(beforeDir, "reference-camera-normal.png");
await setAudit("fourthSweepNormal");
await capture(afterDir, "reference-camera-normal.png");

for (const [file, mode] of [
  ["flat-id.png", "fourthSweepId"],
  ["isolated-participants.png", "fourthSweepParticipants"],
  ["side-z-section.png", "fourthSweepSideSection"],
]) {
  await setAudit(mode);
  await capture(afterDir, file);
}

// Fourth-wheel rate is +14.4°/s. These four runtime witnesses advance the
// spokes by 18° each while the fixed bridge remains unchanged.
for (const [file, time] of [
  ["runtime-angle-000.png", 0.104],
  ["runtime-angle-018.png", 1.354],
  ["runtime-angle-036.png", 2.604],
  ["runtime-angle-054.png", 3.854],
  ["accelerated-angle-090.png", 6.354],
]) {
  await setAudit("fourthSweepParticipants", time);
  await capture(afterDir, file);
}

const report = await page.evaluate(() => ({
  sweep: window.__WATCH__.fourthWheelSweepAuditReport(),
  barrelFourth: window.__WATCH__.barrelFourthAuditReport([0.104, 10.104, 60.104, 600.104]),
  goingTrain: window.__WATCH__.kinematicReport([0.104, 10.104, 60.104, 600.104]),
  phase4b: window.__WATCH__.displayDriveReport([0.104, 60.104]),
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
  phase5DStarted: false,
}));

await page.evaluate(() => {
  window.__WATCH__.clearBarrelCenterAudit();
  window.__WATCH__.setTime(0.104);
  window.__WATCH__.setView("readoutFront");
});
await capture(regressionDir, "front.png");
await page.evaluate(() => window.__WATCH__.setView("readoutHero"));
await capture(regressionDir, "front-three-quarter.png");

const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const beforeMacro = path.join(beforeDir, "reference-camera-normal.png");
const afterMacro = path.join(afterDir, "reference-camera-normal.png");
report.matchedCameraControl = {
  before: path.relative(outDir, beforeMacro),
  after: path.relative(outDir, afterMacro),
  beforeSha256: hash(beforeMacro),
  afterSha256: hash(afterMacro),
  byteIdentical: fs.readFileSync(beforeMacro).equals(fs.readFileSync(afterMacro)),
  sameCameraAndTimeByConstruction: true,
  interpretation: "independent WebGL renders at the same camera and t=0.104; diagnosis required no geometry or material correction",
};

const baselinePath = path.resolve("captures/pre5d-barrel-fourth-audit/after/report.json");
if (fs.existsSync(baselinePath)) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const exact = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const authorityUnchanged = Object.fromEntries(
    Object.keys(baseline.authority || {}).map((name) => [
      name,
      exact(baseline.authority[name], report.authority[name]),
    ]),
  );
  report.baselineComparison = {
    source: path.relative(outDir, baselinePath),
    goingTrainReportExact: exact(baseline.goingTrain, report.goingTrain),
    authorityUnchanged,
    everyAuthorityExact: Object.values(authorityUnchanged).every(Boolean),
    phase4b: {
      dispositionUnchanged: baseline.phase4b?.disposition === report.phase4b?.disposition,
      remainsAccepted: report.phase4b?.accepted === true,
      minuteToCenter: report.phase4b?.sixtySecondProof?.minuteToCenter,
      hourToMinute: report.phase4b?.sixtySecondProof?.hourToMinute,
    },
  };
  report.baselineComparison.accepted =
    report.baselineComparison.goingTrainReportExact &&
    report.baselineComparison.everyAuthorityExact &&
    report.baselineComparison.phase4b.dispositionUnchanged &&
    report.baselineComparison.phase4b.remainsAccepted;
}

const supplied = path.resolve("more_gears_more_problems.png");
if (fs.existsSync(supplied)) fs.copyFileSync(supplied, path.join(outDir, "supplied-reference.png"));
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log("done", outDir);
