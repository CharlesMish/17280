import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const outDir = path.join(process.cwd(), "captures/post5d-gear-cylinder-witness");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
await page.goto(`${baseUrl}/?static=1&view=presentHero&t=0.104&readoutPose=1010&explode=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => globalThis.__WATCH__?.phase5dPresentationReport !== undefined);
await page.waitForTimeout(900);

const runtime = await page.evaluate(() => {
  const watch = globalThis.__WATCH__;
  const sceneRows = watch.sceneDump();
  const wanted = [
    "fourth:pose", "fourth:motion", "fourth:geom", "fourth:wheel", "fourth:pinion", "fourth:arbor:shaft",
    "third:wheel", "third:pinion", "center:wheel", "center:pinion", "escape:wheel", "escape:pinion",
    "pallet:pose", "pallet:motion", "pallet:crankedLever", "pallet:lowerBoss", "pallet:lowerLever",
    "pallet:verticalRiser", "pallet:forkHorn:left", "pallet:forkHorn:right", "pallet:forkBridge",
    "pallet:arbor:shaft", "pallet:arbor:lowerTip", "pallet:arbor:upperTip",
    "struct:column:pallet", "struct:column:pallet:lower", "struct:column:pallet:lowerLink",
    "struct:column:pallet:outboardPost", "struct:column:pallet:upperLink", "struct:column:pallet:upper",
    "struct:boss:pallet:lower", "struct:jewel:pallet:lower",
  ];
  const scene = Object.fromEntries(wanted.map((name) => [
    name,
    sceneRows.filter((row) => row.name === name),
  ]));
  return {
    mechanical: watch.escapementRepairReport(),
    goingTrain: watch.kinematicReport([0.104, 10.104, 60.104, 210.104]),
    phase4b: watch.displayDriveReport([0.104, 60.104]),
    phase5d: watch.phase5dPresentationReport(),
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
    scene,
  };
});

fs.writeFileSync(
  path.join(outDir, "pallet-support-reroute-runtime.json"),
  `${JSON.stringify({ ...runtime, browserErrors }, null, 2)}\n`,
);
await browser.close();
