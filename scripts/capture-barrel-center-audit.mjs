import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "captures/pre5d-barrel-center-audit";
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
const viewport = { width: 1600, height: 1000 };
const T0 = 0.104;
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
page.on("pageerror", (error) => console.error("PAGEERROR", error));

await page.goto(`${baseUrl}/?static=1&view=barrel&t=${T0}&readoutPose=1010`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(
  () =>
    typeof window.__WATCH__?.setBarrelCenterAudit === "function" &&
    typeof window.__WATCH__?.barrelCenterAuditReport === "function",
  { timeout: 240000 },
);
await page.waitForTimeout(900);

const capture = async (file) => {
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("ok", file);
};

const normalAt = async (file, time) => {
  await page.evaluate(
    ({ nextTime }) => {
      window.__WATCH__.clearBarrelCenterAudit();
      window.__WATCH__.setView("barrel");
      window.__WATCH__.setTime(nextTime);
      window.__WATCH__.setDebug(false);
      window.__WATCH__.setBarrelCenterAudit("normal");
    },
    { nextTime: time },
  );
  await page.waitForTimeout(180);
  await capture(file);
};

await normalAt("normal-shaded-before.png", T0);

for (const [file, mode] of [
  ["flat-id-ownership.png", "id"],
  ["isolated-participants.png", "participants"],
  ["mesh-line-side-section.png", "sideSection"],
]) {
  await page.evaluate(
    ({ nextMode, nextTime }) => {
      window.__WATCH__.setTime(nextTime);
      window.__WATCH__.setBarrelCenterAudit(nextMode);
    },
    { nextMode: mode, nextTime: T0 },
  );
  await page.waitForTimeout(180);
  await capture(file);
}

for (const [file, time] of [
  ["runtime-t000.png", T0],
  ["runtime-t010.png", T0 + 10],
  ["runtime-t060.png", T0 + 60],
  ["accelerated-t600.png", T0 + 600],
]) {
  await normalAt(file, time);
}

for (const [file, time] of [
  ["isolated-runtime-t000.png", T0],
  ["isolated-runtime-t600.png", T0 + 600],
]) {
  await page.evaluate(
    ({ nextTime }) => {
      window.__WATCH__.setTime(nextTime);
      window.__WATCH__.setBarrelCenterAudit("participants");
    },
    { nextTime: time },
  );
  await page.waitForTimeout(180);
  await capture(file);
}

await normalAt("normal-shaded-after.png", T0);
for (const [file, view] of [
  ["regression-front.png", "readoutFront"],
  ["regression-front-three-quarter.png", "readoutHero"],
]) {
  await page.evaluate(
    ({ nextView, nextTime }) => {
      window.__WATCH__.clearBarrelCenterAudit();
      window.__WATCH__.setTime(nextTime);
      window.__WATCH__.setView(nextView);
    },
    { nextView: view, nextTime: T0 },
  );
  await page.waitForTimeout(180);
  await capture(file);
}

const current = await page.evaluate(() => ({
  barrelCenter: window.__WATCH__.barrelCenterAuditReport([0.104, 10.104, 60.104, 600.104]),
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
}));

const historyPath = "captures/pre5d-integrity/comparison.json";
const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
fs.writeFileSync(
  path.join(outDir, "report.json"),
  JSON.stringify(
    {
      scope: "bounded barrel / center-train audit only; Phase 5D not started",
      current,
      history: {
        source: historyPath,
        classifications: history.classifications,
        issueB: history.issueB,
      },
      evidence: {
        normalBefore: "normal-shaded-before.png",
        normalAfter: "normal-shaded-after.png",
        flatId: "flat-id-ownership.png",
        participants: "isolated-participants.png",
        sideSection: "mesh-line-side-section.png",
        runtime: ["runtime-t000.png", "runtime-t010.png", "runtime-t060.png"],
        accelerated: ["accelerated-t600.png", "isolated-runtime-t000.png", "isolated-runtime-t600.png"],
        regressions: ["regression-front.png", "regression-front-three-quarter.png"],
        historicalBefore: "captures/pre5d-integrity/before/issue-b-barrel-t000.png",
        historicalAfter: "captures/pre5d-integrity/after/issue-b-barrel-t000.png",
      },
    },
    null,
    2,
  ),
);

await browser.close();
console.log("done", outDir);
