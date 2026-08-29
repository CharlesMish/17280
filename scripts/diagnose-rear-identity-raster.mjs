import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "captures/release-annex-r1/b1-raster-evidence");
const reportPath = path.join(root, "captures/reviewer-rc0/report.json");
const minimumDecimalDiameterMm = 0.08;
if (fs.existsSync(outDir)) throw new Error(`refusing to overwrite: ${outDir}`);
fs.mkdirSync(outDir, { recursive: true });

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const rear = report.authority.phase5d.geometryAuthority.identity.rear;
const contours = report.authority.phase5d.geometryAuthority.packageSnapshot.exterior.contours;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
await page.setContent("<!doctype html><html><body></body></html>");
const diagnostic = await page.evaluate(({ rear, contours, minimumDecimalDiameterMm }) => {
  const size = 2048;
  const box = { min: rear.before.bounds.min, max: rear.before.bounds.max };
  const sx = box.max[0] - box.min[0];
  const sy = box.max[1] - box.min[1];
  const toPxX = (x) => ((x - box.min[0]) / sx) * size;
  const toPxY = (y) => size - ((y - box.min[1]) / sy) * size;
  const fontPx = (rear.letterHeightMm / sy) * size;
  const southIntersection = (poly, x) => {
    let y = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x) || Math.abs(b.x - a.x) < 1e-12) continue;
      const t = (x - a.x) / (b.x - a.x);
      y = Math.min(y, a.y + (b.y - a.y) * t);
    }
    if (!Number.isFinite(y)) throw new Error(`south miss ${x}`);
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
  const path = Array.from({ length: 1025 }, (_, i) => {
    const x = x1 + (x0 - x1) * (i / 1024);
    const y = pathY(x);
    const slope = (pathY(x + 0.005) - pathY(x - 0.005)) / 0.01;
    return { x: toPxX(x), y: toPxY(y), angle: Math.atan(slope), distance: 0 };
  });
  for (let i = 1; i < path.length; i++) {
    path[i].distance = path[i - 1].distance + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  const pathLength = path.at(-1).distance;
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
    const t = (distance - a.distance) / Math.max(1e-9, b.distance - a.distance);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: a.angle + (b.angle - a.angle) * t };
  };
  const makeCanvas = (gray) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
    ctx.fillRect(0, 0, size, size);
    return { canvas, ctx };
  };
  const makeRoughnessCanvas = () => {
    const rough = makeCanvas(49);
    const pixels = rough.ctx.createImageData(size, size);
    const cx = size * 0.5;
    const cy = size * 0.5;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const r = Math.hypot(x - cx, y - cy);
        const satin = Math.max(45, Math.min(53, 49 + Math.sin(r * 0.086) * 1.3 + Math.sin(r * 0.026 + 0.8) * 0.3));
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = satin;
        pixels.data[i + 3] = 255;
      }
    }
    rough.ctx.putImageData(pixels, 0, 0);
    return rough;
  };
  const bumpBefore = makeCanvas(128);
  const bumpAfter = makeCanvas(128);
  const roughBefore = makeRoughnessCanvas();
  const roughAfter = makeRoughnessCanvas();
  const glyphs = Array.from(rear.renderedCopy);
  bumpBefore.ctx.font = `500 ${fontPx}px Arial, Helvetica, sans-serif`;
  const widths = glyphs.map((glyph) => bumpBefore.ctx.measureText(glyph).width);
  const trackingPx = fontPx * rear.trackingEm;
  const natural = widths.reduce((a, b) => a + b, 0) + trackingPx * (glyphs.length - 1);
  const scaleX = Math.min(1, pathLength / natural);
  const placements = [];
  const draw = (ctx, floor, shoulder, record, reinforceDecimal) => {
    ctx.font = `500 ${fontPx}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.imageSmoothingEnabled = true;
    ctx.textRendering = "geometricPrecision";
    ctx.lineWidth = 0.8;
    ctx.lineJoin = "round";
    ctx.strokeStyle = shoulder;
    ctx.fillStyle = floor;
    let cursor = (pathLength - natural * scaleX) * 0.5;
    for (let i = 0; i < glyphs.length; i++) {
      const advance = widths[i] * scaleX;
      const point = atDistance(cursor + advance * 0.5);
      if (record) placements.push({ index: i, glyph: glyphs[i], center: [point.x, point.y], angle: point.angle, advance });
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(point.angle);
      ctx.scale(-scaleX, 1);
      ctx.strokeText(glyphs[i], 0, 0);
      ctx.fillText(glyphs[i], 0, 0);
      if (reinforceDecimal && glyphs[i] === ".") {
        const metric = ctx.measureText(glyphs[i]);
        const centerX = (metric.actualBoundingBoxRight - metric.actualBoundingBoxLeft) * 0.5;
        const centerY = (metric.actualBoundingBoxDescent - metric.actualBoundingBoxAscent) * 0.5;
        const radiusPx = (minimumDecimalDiameterMm / sy) * size * 0.5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();
      }
      ctx.restore();
      cursor += advance + trackingPx * scaleX;
    }
  };
  draw(bumpBefore.ctx, "rgb(184,184,184)", "rgb(154,154,154)", true, false);
  draw(roughBefore.ctx, "rgb(102,102,102)", "rgb(82,82,82)", false, false);
  draw(bumpAfter.ctx, "rgb(184,184,184)", "rgb(154,154,154)", false, true);
  draw(roughAfter.ctx, "rgb(102,102,102)", "rgb(82,82,82)", false, true);

  const sampleGlyph = (glyph, reinforceDecimal) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgb(128,128,128)";
    ctx.fillRect(0, 0, 128, 128);
    ctx.font = `500 ${fontPx}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "rgb(154,154,154)";
    ctx.fillStyle = "rgb(184,184,184)";
    ctx.strokeText(glyph, 64, 64);
    ctx.fillText(glyph, 64, 64);
    if (reinforceDecimal && glyph === ".") {
      const metric = ctx.measureText(glyph);
      const centerX = 64 + (metric.actualBoundingBoxRight - metric.actualBoundingBoxLeft) * 0.5;
      const centerY = 64 + (metric.actualBoundingBoxDescent - metric.actualBoundingBoxAscent) * 0.5;
      const radiusPx = (minimumDecimalDiameterMm / sy) * size * 0.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
    }
    const data = ctx.getImageData(0, 0, 128, 128).data;
    let count = 0;
    let minX = 128;
    let minY = 128;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      if (data[(y * 128 + x) * 4] === 128) continue;
      count++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const metric = ctx.measureText(glyph);
    return {
      glyph,
      advance: metric.width,
      changedPixels: count,
      rasterBounds: count ? { width: maxX - minX + 1, height: maxY - minY + 1, minX, minY, maxX, maxY } : null,
      actualBounds: {
        left: metric.actualBoundingBoxLeft,
        right: metric.actualBoundingBoxRight,
        ascent: metric.actualBoundingBoxAscent,
        descent: metric.actualBoundingBoxDescent,
      },
    };
  };
  const visible = placements.filter((row) => row.glyph.trim());
  const cropBox = {
    minX: Math.max(0, Math.floor(Math.min(...visible.map((row) => row.center[0])) - 40)),
    minY: Math.max(0, Math.floor(Math.min(...visible.map((row) => row.center[1])) - 50)),
    maxX: Math.min(size, Math.ceil(Math.max(...visible.map((row) => row.center[0])) + 40)),
    maxY: Math.min(size, Math.ceil(Math.max(...visible.map((row) => row.center[1])) + 50)),
  };
  const crop = (source) => {
    const canvas = document.createElement("canvas");
    canvas.width = (cropBox.maxX - cropBox.minX) * 4;
    canvas.height = (cropBox.maxY - cropBox.minY) * 4;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, cropBox.minX, cropBox.minY, cropBox.maxX - cropBox.minX, cropBox.maxY - cropBox.minY, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  };
  return {
    bumpBefore: bumpBefore.canvas.toDataURL("image/png"),
    roughBefore: roughBefore.canvas.toDataURL("image/png"),
    bumpAfter: bumpAfter.canvas.toDataURL("image/png"),
    roughAfter: roughAfter.canvas.toDataURL("image/png"),
    bumpBeforeCrop: crop(bumpBefore.canvas),
    roughBeforeCrop: crop(roughBefore.canvas),
    bumpAfterCrop: crop(bumpAfter.canvas),
    roughAfterCrop: crop(roughAfter.canvas),
    report: {
      renderedCopy: rear.renderedCopy,
      canonicalCopy: rear.canonicalCopy,
      mapSize: size,
      hostSpanMm: [sx, sy],
      texelsPerMm: [size / sx, size / sy],
      fontPx,
      trackingPx,
      scaleX,
      minimumDecimalDiameterMm,
      minimumDecimalDiameterTexels: (minimumDecimalDiameterMm / sy) * size,
      pathLength,
      natural,
      placements,
      glyphSamplesBefore: [".", "·", "2", "4", "H", "z"].map((glyph) => sampleGlyph(glyph, false)),
      glyphSamplesAfter: [".", "·", "2", "4", "H", "z"].map((glyph) => sampleGlyph(glyph, true)),
      cropBox,
      fontChecks: {
        arial: document.fonts.check(`500 ${fontPx}px Arial`),
        helvetica: document.fonts.check(`500 ${fontPx}px Helvetica`),
        sansSerif: document.fonts.check(`500 ${fontPx}px sans-serif`),
      },
    },
  };
}, { rear, contours, minimumDecimalDiameterMm });

for (const [file, dataUrl] of [
  ["before-bump-map.png", diagnostic.bumpBefore],
  ["before-roughness-map.png", diagnostic.roughBefore],
  ["after-bump-map.png", diagnostic.bumpAfter],
  ["after-roughness-map.png", diagnostic.roughAfter],
  ["before-bump-glyph-strip-4x.png", diagnostic.bumpBeforeCrop],
  ["before-roughness-glyph-strip-4x.png", diagnostic.roughBeforeCrop],
  ["after-bump-glyph-strip-4x.png", diagnostic.bumpAfterCrop],
  ["after-roughness-glyph-strip-4x.png", diagnostic.roughAfterCrop],
]) {
  fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(",")[1], "base64"), { flag: "wx" });
}
fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(diagnostic.report, null, 2)}\n`, { flag: "wx" });
await browser.close();
console.log("done", path.relative(root, outDir));
