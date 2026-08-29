import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const root = process.cwd();
const outDir = path.join(root, "captures/release-annex-r1/gate0-baseline");
const rc0ReportPath = path.join(root, "captures/reviewer-rc0/report.json");

if (fs.existsSync(outDir)) throw new Error(`refusing to overwrite Gate-0 evidence: ${outDir}`);
if (!fs.existsSync(rc0ReportPath)) throw new Error(`missing RC0 authority: ${rc0ReportPath}`);
fs.mkdirSync(outDir, { recursive: true });

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const rc0 = JSON.parse(fs.readFileSync(rc0ReportPath, "utf8"));
const sourceRows = rc0.source.files.map((reference) => {
  const absolute = path.join(root, reference.file);
  const data = fs.readFileSync(absolute);
  return {
    file: reference.file,
    referenceSha256: reference.sha256,
    currentSha256: sha256(data),
    exact: reference.sha256 === sha256(data) && reference.bytes === data.byteLength,
  };
});
const authorityExact = sourceRows.every((row) => row.exact);
if (!authorityExact) {
  fs.writeFileSync(
    path.join(outDir, "AUTHORITY_MISMATCH.json"),
    `${JSON.stringify({ authorityExact, mismatches: sourceRows.filter((row) => !row.exact) }, null, 2)}\n`,
  );
  throw new Error("Gate-0 authority mismatch; see AUTHORITY_MISMATCH.json");
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const diagnostics = { pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [] };

function attachDiagnostics(page) {
  page.on("pageerror", (error) => diagnostics.pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    diagnostics.requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) diagnostics.httpErrors.push({ url: response.url(), status: response.status() });
  });
}

async function openPage(deviceScaleFactor) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor });
  page.setDefaultTimeout(300000);
  attachDiagnostics(page);
  await page.goto(`${baseUrl}/?static=1&view=presentHero&t=0.104&readoutPose=1010&explode=0`, {
    waitUntil: "commit",
    timeout: 60000,
  });
  await page.waitForFunction(
    () =>
      typeof globalThis.__WATCH__?.capture === "function" &&
      typeof globalThis.__WATCH__?.phase5dPresentationReport === "function" &&
      typeof globalThis.__WATCH__?.explodedAssemblyReport === "function",
  );
  await page.waitForTimeout(1800);
  return page;
}

const suite = [
  { file: "B01-rear-authority.png", lane: "rear identity", view: "extRear", profile: "rear" },
  { file: "B02-rear-grazing.png", lane: "rear identity/raking diagnostic", view: "extRearGrazing", profile: "presentSettled" },
  { file: "B03-rear-bright-diagnostic.png", lane: "rear identity/light diagnostic", view: "extRear", b2Profile: "bright" },
  { file: "B04-rear-bump-only-diagnostic.png", lane: "rear identity/map diagnostic", view: "extRear", profile: "rear", diagnostic: "roughnessFlat" },
  { file: "B05-front-authority.png", lane: "front read", view: "extFront", profile: "presentSettled" },
  { file: "B06-readout-front.png", lane: "front read with full product visibility", view: "readoutFront", profile: "presentSettled" },
  { file: "B07-wearable-hero.png", lane: "wearability", view: "strapHero", profile: "presentSettled" },
  { file: "B08-wearable-front.png", lane: "wearability", view: "strapFront", profile: "presentSettled" },
  { file: "B09-wearable-junction.png", lane: "wearability junction", view: "strapMacro", profile: "presentSettled" },
  { file: "B10-sapphire-authority.png", lane: "sapphire", view: "extHero", profile: "conservative" },
  { file: "B11-sapphire-product-oblique.png", lane: "sapphire", view: "extProduct", profile: "middle" },
  { file: "B12-finish-balance.png", lane: "finish", view: "finishBalance", profile: "middle" },
  { file: "B13-finish-grazing.png", lane: "finish/raking", view: "finishGrazing", profile: "middle" },
  { file: "B14-e1-assembled.png", lane: "E1", view: "presentExploded", profile: "presentSettled", explode: 0 },
  { file: "B15-e1-exploded.png", lane: "E1", view: "presentExploded", profile: "presentSettled", explode: 1 },
  { file: "B16-e1-side.png", lane: "E1", view: "presentExplodedSide", profile: "middle", explode: 1 },
];

async function capture(page, specification, suffix = "") {
  await page.evaluate((specification) => {
    const watch = globalThis.__WATCH__;
    watch.setPhase5dB2FamilyId(false);
    watch.setPhase5dB2Diagnostic("product");
    watch.setView(specification.view);
    watch.setReadoutPose("1010");
    watch.setTime(0.104);
    watch.setDebug(false);
    watch.setPhase5dB2Diagnostic(specification.diagnostic ?? "product");
    if (specification.b2Profile) watch.setPhase5dB2Profile(specification.b2Profile, "macro");
    else watch.setPhase5dCProfile(specification.profile);
    watch.setExplode(specification.explode ?? 0);
  }, specification);
  await page.waitForTimeout(550);
  const result = await page.evaluate(() => {
    const watch = globalThis.__WATCH__;
    const phase5d = watch.phase5dPresentationReport();
    const e1 = watch.explodedAssemblyReport();
    return {
      dataUrl: watch.capture(),
      phase5d: {
        camera: phase5d.cameras.current,
        lighting: phase5d.lighting,
        renderer: phase5d.renderer,
        identity: phase5d.geometryAuthority.identity,
        sapphire: phase5d.sapphire,
      },
      e1: { scalar: e1.scalar, currentCamera: e1.currentCamera, disposition: e1.disposition },
    };
  });
  const data = Buffer.from(result.dataUrl.split(",")[1], "base64");
  const file = suffix ? specification.file.replace(/\.png$/, `${suffix}.png`) : specification.file;
  fs.writeFileSync(path.join(outDir, file), data, { flag: "wx" });
  return {
    file,
    lane: specification.lane,
    requested: specification,
    bytes: data.byteLength,
    sha256: sha256(data),
    png: { width: data.readUInt32BE(16), height: data.readUInt32BE(20) },
    runtime: result,
  };
}

const page = await openPage(1);
const images = [];
for (const specification of suite) {
  images.push(await capture(page, specification));
  console.log("ok", specification.file);
}

// Recreate the actual current caseback-map algorithm in the same Chromium
// environment. This is a diagnostic witness only; the product source and live
// material bindings remain untouched.
const identityDiagnostic = await page.evaluate(() => {
  const report = globalThis.__WATCH__.phase5dPresentationReport();
  const identity = report.geometryAuthority.identity.rear;
  const contours = report.geometryAuthority.packageSnapshot.exterior.contours;
  const box = { min: identity.before.bounds.min, max: identity.before.bounds.max };
  const size = 2048;
  const letterHeightMm = identity.letterHeightMm;
  const trackingEm = identity.trackingEm;
  const sx = box.max[0] - box.min[0];
  const sy = box.max[1] - box.min[1];
  const toPxX = (x) => ((x - box.min[0]) / sx) * size;
  const toPxY = (y) => size - ((y - box.min[1]) / sy) * size;
  const fontPx = (letterHeightMm / sy) * size;
  const southIntersection = (poly, x) => {
    let y = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x) || Math.abs(b.x - a.x) < 1e-12) continue;
      const t = (x - a.x) / (b.x - a.x);
      y = Math.min(y, a.y + (b.y - a.y) * t);
    }
    if (!Number.isFinite(y)) throw new Error(`No south contour intersection at x=${x}`);
    return y;
  };
  const range = (poly) => ({ min: Math.min(...poly.map((p) => p.x)), max: Math.max(...poly.map((p) => p.x)) });
  const outerRange = range(contours.casebackOuter);
  const innerRange = range(contours.casebackInner);
  const x0 = Math.max(0.2, outerRange.min + 0.02, innerRange.min + 0.02);
  const x1 = Math.min(10.8, outerRange.max - 0.02, innerRange.max - 0.02);
  const pathY = (x) => {
    const outer = southIntersection(contours.casebackOuter, x);
    const inner = southIntersection(contours.casebackInner, x);
    const nominal = inner + (outer - inner) * 0.46;
    return Math.max(outer + 0.25, Math.min(inner - 0.25, nominal));
  };
  const pathSamples = 1025;
  const path = Array.from({ length: pathSamples }, (_, i) => {
    const t = i / (pathSamples - 1);
    const x = x1 + (x0 - x1) * t;
    const y = pathY(x);
    const slope = (pathY(x + 0.005) - pathY(x - 0.005)) / 0.01;
    return { x: toPxX(x), y: toPxY(y), angle: Math.atan(slope), distance: 0 };
  });
  for (let i = 1; i < path.length; i++) {
    path[i].distance = path[i - 1].distance + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  const pathLength = path[path.length - 1].distance;
  const atDistance = (distance) => {
    let lo = 0;
    let hi = path.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (path[mid].distance < distance) lo = mid;
      else hi = mid;
    }
    const a = path[lo];
    const b = path[hi];
    const span = Math.max(1e-9, b.distance - a.distance);
    const t = (distance - a.distance) / span;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      angle: a.angle + (b.angle - a.angle) * t,
    };
  };

  const makeCanvas = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    return { canvas, ctx: canvas.getContext("2d") };
  };
  const rough = makeCanvas();
  const bump = makeCanvas();
  bump.ctx.fillStyle = "rgb(128,128,128)";
  bump.ctx.fillRect(0, 0, size, size);
  const roughPixels = rough.ctx.createImageData(size, size);
  const cx = size * 0.5;
  const cy = size * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = Math.hypot(x - cx, y - cy);
      const satin = Math.max(45, Math.min(53, 49 + Math.sin(r * 0.086) * 1.3 + Math.sin(r * 0.026 + 0.8) * 0.3));
      roughPixels.data[i] = roughPixels.data[i + 1] = roughPixels.data[i + 2] = satin;
      roughPixels.data[i + 3] = 255;
    }
  }
  rough.ctx.putImageData(roughPixels, 0, 0);

  const glyphs = Array.from(identity.renderedCopy);
  rough.ctx.font = `500 ${fontPx}px Arial, Helvetica, sans-serif`;
  const widths = glyphs.map((glyph) => rough.ctx.measureText(glyph).width);
  const trackingPx = fontPx * trackingEm;
  const natural = widths.reduce((a, b) => a + b, 0) + trackingPx * (glyphs.length - 1);
  const scaleX = Math.min(1, pathLength / natural);
  const placements = [];
  const drawGlyphs = (ctx, floor, shoulder, record) => {
    ctx.font = `500 ${fontPx}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.imageSmoothingEnabled = true;
    ctx.textRendering = "geometricPrecision";
    ctx.lineWidth = 0.8;
    ctx.lineJoin = "round";
    ctx.strokeStyle = shoulder;
    ctx.fillStyle = floor;
    const drawnLength = natural * scaleX;
    let cursor = (pathLength - drawnLength) * 0.5;
    for (let i = 0; i < glyphs.length; i++) {
      const advance = widths[i] * scaleX;
      const point = atDistance(cursor + advance * 0.5);
      if (record) placements.push({ index: i, glyph: glyphs[i], advance, center: [point.x, point.y], angle: point.angle });
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(point.angle);
      ctx.scale(-scaleX, 1);
      ctx.strokeText(glyphs[i], 0, 0);
      ctx.fillText(glyphs[i], 0, 0);
      ctx.restore();
      cursor += advance + trackingPx * scaleX;
    }
  };
  drawGlyphs(rough.ctx, "rgb(102,102,102)", "rgb(82,82,82)", true);
  drawGlyphs(bump.ctx, "rgb(184,184,184)", "rgb(154,154,154)", false);

  const glyphRaster = (glyph) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgb(128,128,128)";
    ctx.fillRect(0, 0, 128, 128);
    ctx.font = `500 ${fontPx}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 0.8;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgb(154,154,154)";
    ctx.fillStyle = "rgb(184,184,184)";
    ctx.strokeText(glyph, 64, 64);
    ctx.fillText(glyph, 64, 64);
    const data = ctx.getImageData(0, 0, 128, 128).data;
    let count = 0;
    let minX = 128;
    let minY = 128;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        if (data[(y * 128 + x) * 4] === 128) continue;
        count++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const metric = ctx.measureText(glyph);
    return {
      glyph,
      advance: metric.width,
      actualBounds: {
        left: metric.actualBoundingBoxLeft,
        right: metric.actualBoundingBoxRight,
        ascent: metric.actualBoundingBoxAscent,
        descent: metric.actualBoundingBoxDescent,
      },
      changedPixels: count,
      rasterBounds: count ? { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
    };
  };

  const visiblePlacements = placements.filter((row) => row.glyph.trim().length > 0);
  const minX = Math.floor(Math.min(...visiblePlacements.map((row) => row.center[0])) - 40);
  const minY = Math.floor(Math.min(...visiblePlacements.map((row) => row.center[1])) - 50);
  const maxX = Math.ceil(Math.max(...visiblePlacements.map((row) => row.center[0])) + 40);
  const maxY = Math.ceil(Math.max(...visiblePlacements.map((row) => row.center[1])) + 50);
  const crop = (source) => {
    const canvas = document.createElement("canvas");
    canvas.width = (maxX - minX) * 4;
    canvas.height = (maxY - minY) * 4;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, minX, minY, maxX - minX, maxY - minY, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  };
  return {
    roughDataUrl: rough.canvas.toDataURL("image/png"),
    bumpDataUrl: bump.canvas.toDataURL("image/png"),
    roughStripDataUrl: crop(rough.canvas),
    bumpStripDataUrl: crop(bump.canvas),
    metrics: {
      renderedCopy: identity.renderedCopy,
      canonicalCopy: identity.canonicalCopy,
      mapSize: size,
      hostSpanMm: [sx, sy],
      texelsPerMm: [size / sx, size / sy],
      fontPx,
      trackingPx,
      scaleX,
      pathLengthPx: pathLength,
      naturalTextLengthPx: natural,
      placements,
      rasterSamples: [".", "·", "2", "4", "H"].map(glyphRaster),
      crop: { minX, minY, maxX, maxY, scale: 4 },
      fontChecks: {
        arial: document.fonts.check(`500 ${fontPx}px Arial`),
        helvetica: document.fonts.check(`500 ${fontPx}px Helvetica`),
        sansSerif: document.fonts.check(`500 ${fontPx}px sans-serif`),
      },
    },
  };
});

for (const [file, dataUrl] of [
  ["identity-roughness-map.png", identityDiagnostic.roughDataUrl],
  ["identity-bump-map.png", identityDiagnostic.bumpDataUrl],
  ["identity-roughness-glyph-strip-4x.png", identityDiagnostic.roughStripDataUrl],
  ["identity-bump-glyph-strip-4x.png", identityDiagnostic.bumpStripDataUrl],
]) {
  fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(",")[1], "base64"), { flag: "wx" });
}
delete identityDiagnostic.roughDataUrl;
delete identityDiagnostic.bumpDataUrl;
delete identityDiagnostic.roughStripDataUrl;
delete identityDiagnostic.bumpStripDataUrl;

const page2x = await openPage(2);
images.push(await capture(page2x, { file: "B01-rear-authority.png", lane: "rear identity resolution diagnostic", view: "extRear", profile: "rear" }, "-2x"));
await page2x.close();

await page.evaluate(() => globalThis.__WATCH__.clearReadoutPose());
await page.close();
await browser.close();

const uniqueConsole = [...new Set(diagnostics.consoleErrors)];
const report = {
  schema: "presentation-r1-gate0-baseline-v1",
  disposition: "GATE-0 DIAGNOSTIC ONLY — PRODUCT SOURCE UNTOUCHED",
  sourceAuthority: {
    reference: "captures/reviewer-rc0/report.json",
    referenceAggregateSha256: rc0.source.aggregateSha256,
    fileCount: sourceRows.length,
    exact: authorityExact,
    mismatches: sourceRows.filter((row) => !row.exact),
  },
  captureContract: { viewportCss: [1600, 1100], timeSeconds: 0.104, readoutPose: "10:10", productSourceEdited: false },
  browserDiagnostics: {
    ...diagnostics,
    uniqueConsoleErrors: uniqueConsole,
    onlyKnownAcceptedComputeTangentsWarning:
      diagnostics.pageErrors.length === 0 &&
      diagnostics.requestFailures.length === 0 &&
      diagnostics.httpErrors.length === 0 &&
      uniqueConsole.length === 1 &&
      uniqueConsole[0].includes("computeTangents() failed"),
  },
  images,
  identityDiagnostic: identityDiagnostic.metrics,
};
fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
console.log("done", path.relative(root, outDir));
