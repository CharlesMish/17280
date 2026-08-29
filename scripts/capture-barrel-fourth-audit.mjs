import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "captures/pre5d-barrel-fourth-audit/before";
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
await page.goto(`${baseUrl}/?static=1&view=finishBarrel&t=0.104&readoutPose=1010`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(
  () =>
    typeof window.__WATCH__?.barrelFourthAuditReport === "function" &&
    typeof window.__WATCH__?.setBarrelCenterAudit === "function",
);
await page.waitForTimeout(900);

const capture = async (file) => {
  const data = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, file), Buffer.from(data.split(",")[1], "base64"));
};

await page.evaluate(() => {
  window.__WATCH__.setTime(0.104);
  window.__WATCH__.setView("finishBarrel");
});
await capture("normal-shaded.png");
for (const [file, mode] of [
  ["flat-id.png", "fourthId"],
  ["isolated-participants.png", "fourthParticipants"],
  ["side-section.png", "fourthSideSection"],
]) {
  await page.evaluate(
    ({ nextMode }) => {
      window.__WATCH__.setTime(0.104);
      window.__WATCH__.setBarrelCenterAudit(nextMode);
    },
    { nextMode: mode },
  );
  await capture(file);
}

for (const [file, time] of [
  ["isolated-runtime-t000.png", 0.104],
  ["isolated-runtime-t060.png", 60.104],
]) {
  await page.evaluate(
    ({ nextTime }) => {
      window.__WATCH__.setTime(nextTime);
      window.__WATCH__.setBarrelCenterAudit("fourthParticipants");
    },
    { nextTime: time },
  );
  await capture(file);
}

const report = await page.evaluate(() => ({
  barrelFourth: window.__WATCH__.barrelFourthAuditReport([0.104, 10.104, 60.104]),
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
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

await page.evaluate(() => {
  window.__WATCH__.clearBarrelCenterAudit();
  window.__WATCH__.setTime(0.104);
  window.__WATCH__.setView("readoutFront");
});
await capture("regression-front.png");
await page.evaluate(() => window.__WATCH__.setView("readoutHero"));
await capture("regression-front-three-quarter.png");
await browser.close();
console.log("done", outDir);
