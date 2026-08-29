import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "captures/pre5d-center-residual/before";
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
const scope = process.argv[4] || "all";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
page.on("pageerror", (error) => console.error("PAGEERROR", error));

await page.goto(`${baseUrl}/?static=1&view=structRearGrazing&t=0.104&accommodation=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => window.__WATCH__?.setCenterResidualAudit !== undefined, {
  timeout: 240000,
});
await page.waitForTimeout(900);

const modes = [
  ["same-grazing.png", "grazing"],
  ["flat-id-same-camera.png", "flatId"],
  ["isolated-same-camera.png", "isolated"],
  ["unlit-single-color.png", "unlit"],
  ["section-through-void.png", "section"],
].filter(([, mode]) => scope === "all" || scope === mode);

const report = {
  viewport: { width: 1400, height: 1000 },
  modes: {},
  ownership: [],
  voidPixels: null,
  probes: {},
};
for (const [file, mode] of modes) {
  await page.evaluate((nextMode) => {
    window.__WATCH__.setTime(0.104);
    window.__WATCH__.setDebug(false);
    window.__WATCH__.setCenterResidualAudit(nextMode);
  }, mode);
  await page.waitForTimeout(450);
  const dataUrl = await page.evaluate(() => window.__WATCH__.capture());
  fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(",")[1], "base64"));
  report.modes[mode] = { file };
  if (mode === "flatId") {
    report.ownership = await page.evaluate(() => window.__WATCH__.junctionOwnership());
  }
  console.log("ok", file);
}

await page.evaluate(() => window.__WATCH__.setCenterResidualAudit("flatId"));
await page.waitForTimeout(300);
report.ownership = await page.evaluate(() => window.__WATCH__.junctionOwnership());
report.voidPixels = await page.evaluate(async () => {
  const dataUrl = window.__WATCH__.capture();
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const pixel = (x, y) => {
    const i = (y * image.width + x) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
  };
  const background = pixel(image.width - 1, image.height - 1);
  const isExactBackground = (x, y) => {
    const rgba = pixel(x, y);
    return rgba.every((value, i) => value === background[i]);
  };
  const isBody = (x, y) => {
    const [r, g, b] = pixel(x, y);
    return r > 225 && g < 90 && b > 125 && b < 190;
  };
  const isBoss = (x, y) => {
    const [r, g, b] = pixel(x, y);
    return r < 55 && g > 95 && g < 150 && b > 215;
  };
  const rows = [];
  let totalExactBackground = 0;
  for (let y = 620; y <= 740; y += 1) {
    let bodyMax = -1;
    let bossMin = image.width;
    for (let x = 120; x <= 420; x += 1) {
      if (isBody(x, y)) bodyMax = Math.max(bodyMax, x);
      if (isBoss(x, y)) bossMin = Math.min(bossMin, x);
    }
    if (bodyMax < 0 || bossMin >= image.width || bodyMax >= bossMin) continue;
    const exact = [];
    for (let x = bodyMax + 1; x < bossMin; x += 1) {
      if (isExactBackground(x, y)) exact.push(x);
    }
    if (!exact.length) continue;
    totalExactBackground += exact.length;
    rows.push({
      y,
      bodyLastSolidPixel: bodyMax,
      bossFirstSolidPixel: bossMin,
      exactBackgroundFirst: exact[0],
      exactBackgroundLast: exact[exact.length - 1],
      exactBackgroundCount: exact.length,
    });
  }
  return {
    backgroundRgba: background,
    totalExactBackground,
    bounds: rows.length
      ? {
          minX: Math.min(...rows.map((row) => row.exactBackgroundFirst)),
          maxX: Math.max(...rows.map((row) => row.exactBackgroundLast)),
          minY: rows[0].y,
          maxY: rows[rows.length - 1].y,
        }
      : null,
    rows,
  };
});

const probePixels = [
  [255, 700],
  [258, 700],
  [260, 700],
  [218, 710],
  [245, 710],
  [272, 710],
];
for (const [x, y] of probePixels) {
  report.probes[`${x},${y}`] = await page.evaluate(
    ([pixelX, pixelY]) => window.__WATCH__.centerResidualRayReport(pixelX, pixelY),
    [x, y],
  );
}

fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
await browser.close();
console.log("done", outDir);
