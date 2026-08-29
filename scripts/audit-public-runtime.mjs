import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.resolve(process.argv[2] || path.join(root, "dist"));
const output = path.resolve(process.argv[3] || path.join(root, "captures/rc1/public-runtime-quality.json"));
const knownTangent = "THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)";

if (!fs.existsSync(path.join(siteRoot, "index.html"))) {
  throw new Error(`Missing built site: ${siteRoot}`);
}
if (fs.existsSync(output)) {
  throw new Error(`Refusing to overwrite runtime-quality authority: ${output}`);
}

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const listFiles = (directory) => {
  const rows = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) rows.push({
        file: path.relative(directory, file).split(path.sep).join("/"),
        bytes: fs.statSync(file).size,
        sha256: sha256(file),
      });
    }
  };
  visit(directory);
  return rows;
};
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
};
const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
]);
const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const file = path.resolve(siteRoot, pathname.replace(/^\/+/, ""));
  if (!file.startsWith(`${siteRoot}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": mime.get(path.extname(file)) || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Runtime audit server did not bind");
const origin = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const browserVersion = browser.version();
const scenarios = [
  { id: "desktop-dpr1", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { id: "mobile-dpr2", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
];
const results = [];

for (const scenario of scenarios) {
  const diagnostics = { pageErrors: [], consoleErrors: [], requestFailures: [], httpErrors: [], requests: [] };
  const context = await browser.newContext({
    viewport: scenario.viewport,
    deviceScaleFactor: scenario.deviceScaleFactor,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => diagnostics.pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => diagnostics.requestFailures.push({
    url: request.url(), error: request.failure()?.errorText ?? "unknown",
  }));
  page.on("request", (request) => diagnostics.requests.push(request.url()));
  page.on("response", (response) => {
    if (response.status() >= 400) diagnostics.httpErrors.push({ url: response.url(), status: response.status() });
  });
  const started = performance.now();
  const response = await page.goto(`${origin}/?view=r1FinalHero&t=0.104&readoutPose=1010&explode=0`, {
    waitUntil: "commit",
    timeout: 60000,
  });
  await page.waitForFunction(() => typeof globalThis.__WATCH__?.releasePresentationReport === "function", null, {
    timeout: 300000,
  });
  await page.evaluate(() => {
    globalThis.__WATCH__.setPlaybackPaused(true);
    globalThis.__WATCH__.setExplode(0);
    globalThis.__WATCH__.setView("r1FinalHero");
  });
  const apiReadyMs = performance.now() - started;
  const stableStarted = performance.now();
  const firstFrame = await page.evaluate(() => {
    const image = globalThis.__WATCH__.capture();
    const canvas = document.querySelector("canvas");
    if (!canvas) return { captureLength: image.length, pixels: null };
    const sample = document.createElement("canvas");
    sample.width = 96;
    sample.height = 64;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) return { captureLength: image.length, pixels: null };
    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const data = context.getImageData(0, 0, sample.width, sample.height).data;
    const corners = [
      [0, 0], [sample.width - 1, 0], [0, sample.height - 1], [sample.width - 1, sample.height - 1],
    ].map(([x, y]) => {
      const offset = (y * sample.width + x) * 4;
      return [data[offset], data[offset + 1], data[offset + 2]];
    });
    const background = [0, 1, 2].map((channel) =>
      Math.round(corners.reduce((sum, color) => sum + color[channel], 0) / corners.length));
    let nonBackgroundPixels = 0;
    let minX = sample.width;
    let minY = sample.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < sample.height; y++) {
      for (let x = 0; x < sample.width; x++) {
        const offset = (y * sample.width + x) * 4;
        const delta = Math.max(
          Math.abs(data[offset] - background[0]),
          Math.abs(data[offset + 1] - background[1]),
          Math.abs(data[offset + 2] - background[2]),
        );
        if (delta <= 12) continue;
        nonBackgroundPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    return {
      captureLength: image.length,
      pixels: {
        sample: [sample.width, sample.height],
        background,
        nonBackgroundPixels,
        fraction: nonBackgroundPixels / (sample.width * sample.height),
        bounds: nonBackgroundPixels ? [minX, minY, maxX, maxY] : null,
      },
    };
  });
  const firstCaptureLength = firstFrame.captureLength;
  const firstStableCaptureMs = performance.now() - stableStarted;
  await page.waitForTimeout(250);

  const frameIntervals = await page.evaluate(() => new Promise((resolve) => {
    const times = [];
    const sample = (stamp) => {
      times.push(stamp);
      if (times.length >= 181) resolve(times.slice(1).map((value, index) => value - times[index]));
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));

  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const cdpMetrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics
    .map(({ name, value }) => [name, value]));

  // Exercise both visibility states once before establishing the resource
  // baseline. WebGLRenderer uploads geometry lazily on first render, so an
  // assembled-only baseline otherwise mistakes the first exploded render's
  // one-time uploads for growth across repeated explode/assemble cycles.
  const warmup = await page.evaluate(async () => {
    const nextFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    globalThis.__WATCH__.setExplode(1);
    await nextFrames();
    const exploded = globalThis.__WATCH__.explodedAssemblyReport();
    globalThis.__WATCH__.setExplode(0);
    await nextFrames();
    const assembled = globalThis.__WATCH__.explodedAssemblyReport();
    return {
      exploded: exploded.scalar.value,
      assembled: assembled.scalar.value,
      exactAtZero: assembled.assembledEquivalence.exactAtZero,
    };
  });
  const beforeCycles = await page.evaluate(() => ({
    release: globalThis.__WATCH__.releasePresentationReport(),
    sceneRows: globalThis.__WATCH__.sceneDump().length,
    resources: performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
      duration: entry.duration,
    })),
  }));
  const beforePerformance = await cdpMetrics();
  const cycles = await page.evaluate(async () => {
    const rows = [];
    const nextFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (let index = 0; index < 10; index++) {
      globalThis.__WATCH__.setExplode(1);
      await nextFrames();
      const exploded = globalThis.__WATCH__.explodedAssemblyReport();
      globalThis.__WATCH__.setExplode(0);
      await nextFrames();
      const assembled = globalThis.__WATCH__.explodedAssemblyReport();
      const runtime = globalThis.__WATCH__.releasePresentationReport().runtime;
      rows.push({
        cycle: index + 1,
        exploded: exploded.scalar.value,
        assembled: assembled.scalar.value,
        exactAtZero: assembled.assembledEquivalence.exactAtZero,
        geometries: runtime.renderer.memory.geometries,
        textures: runtime.renderer.memory.textures,
        sceneObjects: runtime.scene.objects,
        sceneMeshes: runtime.scene.meshes,
      });
    }
    return rows;
  });
  const afterPerformance = await cdpMetrics();

  const gestureCameraBefore = await page.evaluate(() => {
    globalThis.__WATCH__.setExplode(0);
    globalThis.__WATCH__.setView("r1FinalHero");
    globalThis.__WATCH__.setPlaybackPaused(true);
    return globalThis.__WATCH__.releasePresentationReport().current.camera;
  });

  await page.setViewportSize({ width: Math.max(360, scenario.viewport.width - 120), height: Math.max(640, scenario.viewport.height - 80) });
  await page.mouse.move(180, 280);
  await page.mouse.down();
  await page.mouse.move(230, 320, { steps: 5 });
  await page.mouse.up();
  await page.mouse.wheel(0, -160);
  await page.waitForTimeout(150);
  const afterInteraction = await page.evaluate(() => ({
    captureLength: globalThis.__WATCH__.capture().length,
    release: globalThis.__WATCH__.releasePresentationReport(),
    exploded: globalThis.__WATCH__.explodedAssemblyReport().scalar.value,
    pixels: (() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return null;
      const sample = document.createElement("canvas");
      sample.width = 96;
      sample.height = 64;
      const context = sample.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(canvas, 0, 0, sample.width, sample.height);
      const data = context.getImageData(0, 0, sample.width, sample.height).data;
      const background = [data[0], data[1], data[2]];
      let nonBackgroundPixels = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (Math.max(
          Math.abs(data[index] - background[0]),
          Math.abs(data[index + 1] - background[1]),
          Math.abs(data[index + 2] - background[2]),
        ) > 12) nonBackgroundPixels += 1;
      }
      return { nonBackgroundPixels };
    })(),
  }));

  const unexpectedConsoleErrors = diagnostics.consoleErrors.filter((message) => message !== knownTangent);
  const externalRequests = diagnostics.requests.filter((url) => {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.origin !== origin;
  });
  const baselineResourceSignature = `${beforeCycles.release.runtime.renderer.memory.geometries}/${beforeCycles.release.runtime.renderer.memory.textures}/${beforeCycles.release.runtime.scene.objects}/${beforeCycles.release.runtime.scene.meshes}`;
  const memoryRows = [baselineResourceSignature, ...cycles.map((row) => `${row.geometries}/${row.textures}/${row.sceneObjects}/${row.sceneMeshes}`)];
  const stableResources = new Set(memoryRows).size === 1;
  const exactCycles = cycles.every((row) => row.exploded === 1 && row.assembled === 0 && row.exactAtZero === true);
  const beforeCamera = gestureCameraBefore;
  const afterCamera = afterInteraction.release.current?.camera;
  const vectorDelta = (a, b) => Array.isArray(a) && Array.isArray(b)
    ? Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0))
    : null;
  const cameraMotion = {
    positionDelta: vectorDelta(beforeCamera?.position, afterCamera?.position),
    targetDelta: vectorDelta(beforeCamera?.target, afterCamera?.target),
    fovDelta: Number.isFinite(beforeCamera?.fov) && Number.isFinite(afterCamera?.fov)
      ? Math.abs(beforeCamera.fov - afterCamera.fov)
      : null,
  };
  cameraMotion.changed = [cameraMotion.positionDelta, cameraMotion.targetDelta, cameraMotion.fovDelta]
    .some((value) => Number.isFinite(value) && value > 1e-6);
  const resizedCanvas = afterInteraction.release.runtime.renderer.canvas;
  const initialCanvas = beforeCycles.release.runtime.renderer.canvas;
  const resizeChanged = resizedCanvas.pixelWidth !== initialCanvas.pixelWidth
    || resizedCanvas.pixelHeight !== initialCanvas.pixelHeight;
  const expectedResize = {
    cssWidth: Math.max(360, scenario.viewport.width - 120),
    cssHeight: Math.max(640, scenario.viewport.height - 80),
  };
  expectedResize.pixelWidth = expectedResize.cssWidth * scenario.deviceScaleFactor;
  expectedResize.pixelHeight = expectedResize.cssHeight * scenario.deviceScaleFactor;
  const resizeExact =
    resizedCanvas.cssWidth === expectedResize.cssWidth
    && resizedCanvas.cssHeight === expectedResize.cssHeight
    && resizedCanvas.pixelWidth === expectedResize.pixelWidth
    && resizedCanvas.pixelHeight === expectedResize.pixelHeight;
  const visibleSubject = firstFrame.pixels
    && firstFrame.pixels.nonBackgroundPixels >= 200
    && firstFrame.pixels.bounds
    && firstFrame.pixels.bounds[2] - firstFrame.pixels.bounds[0] >= 12
    && firstFrame.pixels.bounds[3] - firstFrame.pixels.bounds[1] >= 12;
  results.push({
    scenario,
    httpStatus: response?.status() ?? null,
    timingsMs: {
      apiReady: apiReadyMs,
      firstStableCapture: firstStableCaptureMs,
      rafIntervalP50: percentile(frameIntervals, 0.5),
      rafIntervalP95: percentile(frameIntervals, 0.95),
      rafIntervalMax: Math.max(...frameIntervals),
      sampledFrames: frameIntervals.length,
    },
    firstCaptureLength,
    firstFrame,
    renderer: beforeCycles.release.runtime,
    resources: {
      count: beforeCycles.resources.length,
      transferBytes: beforeCycles.resources.reduce((sum, row) => sum + row.transferSize, 0),
      encodedBodyBytes: beforeCycles.resources.reduce((sum, row) => sum + row.encodedBodySize, 0),
      rows: beforeCycles.resources,
    },
    cycleAudit: {
      warmup,
      count: cycles.length,
      exactCycles,
      stableRendererAndSceneCounts: stableResources,
      rows: cycles,
      jsHeapUsedBefore: beforePerformance.JSHeapUsedSize ?? null,
      jsHeapUsedAfter: afterPerformance.JSHeapUsedSize ?? null,
    },
    interaction: { ...afterInteraction, cameraMotion, resizeChanged, resizeExact, expectedResize },
    diagnostics: { ...diagnostics, unexpectedConsoleErrors, externalRequests },
    performanceClassification: "informational-software-rendered-host",
    accepted:
      response?.status() === 200
      && firstCaptureLength > 10_000
      && visibleSubject
      && warmup.exploded === 1
      && warmup.assembled === 0
      && warmup.exactAtZero === true
      && exactCycles
      && stableResources
      && afterInteraction.captureLength > 10_000
      && afterInteraction.exploded === 0
      && cameraMotion.changed
      && resizeChanged
      && resizeExact
      && afterInteraction.pixels?.nonBackgroundPixels >= 200
      && diagnostics.pageErrors.length === 0
      && diagnostics.requestFailures.length === 0
      && diagnostics.httpErrors.length === 0
      && externalRequests.length === 0
      && unexpectedConsoleErrors.length === 0,
  });
  await context.close();
}

const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
const page = await context.newPage();
const contextDiagnostics = { pageErrors: [], console: [], requestFailures: [], httpErrors: [], requests: [] };
page.on("pageerror", (error) => contextDiagnostics.pageErrors.push(String(error)));
page.on("console", (message) => contextDiagnostics.console.push({ type: message.type(), text: message.text() }));
page.on("request", (request) => contextDiagnostics.requests.push(request.url()));
page.on("requestfailed", (request) => contextDiagnostics.requestFailures.push({
  url: request.url(), error: request.failure()?.errorText ?? "unknown",
}));
page.on("response", (response) => {
  if (response.status() >= 400) contextDiagnostics.httpErrors.push({ url: response.url(), status: response.status() });
});
await page.goto(`${origin}/?static=1&view=r1FinalHero&t=0.104&readoutPose=1010`, { waitUntil: "commit", timeout: 60000 });
await page.waitForFunction(() => typeof globalThis.__WATCH__?.capture === "function", null, { timeout: 300000 });
const contextLoss = await page.evaluate(async () => {
  const canvas = document.querySelector("canvas");
  const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
  const extension = gl?.getExtension("WEBGL_lose_context");
  if (!canvas || !gl || !extension) return { supported: false };
  let lost = false;
  let restored = false;
  canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); lost = true; }, { once: true });
  canvas.addEventListener("webglcontextrestored", () => { restored = true; }, { once: true });
  extension.loseContext();
  await new Promise((resolve) => setTimeout(resolve, 250));
  extension.restoreContext();
  for (let attempt = 0; attempt < 20 && !restored; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  let captureLength = 0;
  let subjectPixels = null;
  try {
    captureLength = globalThis.__WATCH__.capture().length;
    const sample = document.createElement("canvas");
    sample.width = 64;
    sample.height = 48;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (context) {
      context.drawImage(canvas, 0, 0, sample.width, sample.height);
      const data = context.getImageData(0, 0, sample.width, sample.height).data;
      const background = [data[0], data[1], data[2]];
      let count = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (Math.max(
          Math.abs(data[index] - background[0]),
          Math.abs(data[index + 1] - background[1]),
          Math.abs(data[index + 2] - background[2]),
        ) > 12) count += 1;
      }
      subjectPixels = count;
    }
  } catch {}
  return { supported: true, lost, restored, captureLength, subjectPixels };
});
const allowedContextMessages = new Set([
  knownTangent,
  "THREE.WebGLRenderer: Context Lost.",
  "THREE.WebGLRenderer: Context Restored.",
]);
const contextUnexpectedConsoleErrors = contextDiagnostics.console
  .filter((row) => row.type === "error" && !allowedContextMessages.has(row.text));
const contextExternalRequests = contextDiagnostics.requests.filter((url) => {
  const parsed = new URL(url);
  return ["http:", "https:"].includes(parsed.protocol) && parsed.origin !== origin;
});
await context.close();
await browser.close();
await new Promise((resolve) => server.close(resolve));

const report = {
  schema: "watch.rc1-public-runtime-quality.v1",
  generatedUtc: new Date().toISOString(),
  testedArtifact: {
    root: path.relative(root, siteRoot),
    indexSha256: sha256(path.join(siteRoot, "index.html")),
    files: listFiles(siteRoot),
  },
  environment: {
    node: process.version,
    browser: { engine: "chromium", version: browserVersion },
    rendering: "Playwright Chromium with ANGLE SwiftShader",
    note: "Timing numbers describe this software-rendered evidence host and are not hardware performance claims.",
  },
  acceptedConsoleDiagnostic: knownTangent,
  scenarios: results,
  contextLoss: {
    ...contextLoss,
    diagnostics: { ...contextDiagnostics, unexpectedConsoleErrors: contextUnexpectedConsoleErrors },
    externalRequests: contextExternalRequests,
    accepted:
      contextLoss.supported === true
      && contextLoss.lost
      && contextLoss.restored
      && contextLoss.captureLength > 10_000
      && contextLoss.subjectPixels >= 100
      && contextDiagnostics.pageErrors.length === 0
      && contextDiagnostics.requestFailures.length === 0
      && contextDiagnostics.httpErrors.length === 0
      && contextExternalRequests.length === 0
      && contextUnexpectedConsoleErrors.length === 0,
  },
  accepted:
    results.every((row) => row.accepted)
    && contextLoss.supported === true
    && contextLoss.lost
    && contextLoss.restored
    && contextLoss.captureLength > 10_000
    && contextLoss.subjectPixels >= 100
    && contextDiagnostics.pageErrors.length === 0
    && contextDiagnostics.requestFailures.length === 0
    && contextDiagnostics.httpErrors.length === 0
    && contextExternalRequests.length === 0
    && contextUnexpectedConsoleErrors.length === 0,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, output), accepted: report.accepted }, null, 2));
if (!report.accepted) process.exitCode = 1;
