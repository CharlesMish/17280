import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.resolve(process.argv[2] || path.join(projectRoot, "dist"));
const siteRootLabel = path.basename(siteRoot);
const output = process.argv[3] ? path.resolve(process.argv[3]) : null;
const requestedBrowsers = (process.env.WATCH_BROWSERS || "chromium,firefox,webkit")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const acceptedConsoleDiagnostic =
  "THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)";

const classifyConsoleErrors = (messages) => ({
  acceptedBaseline: messages.filter((message) => message === acceptedConsoleDiagnostic),
  unexpected: messages.filter((message) => message !== acceptedConsoleDiagnostic),
});
const hashFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const artifactFiles = (directory) => {
  const rows = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) rows.push({
        file: path.relative(directory, file).split(path.sep).join("/"),
        bytes: fs.statSync(file).size,
        sha256: hashFile(file),
      });
    }
  };
  visit(directory);
  return rows;
};

if (!fs.existsSync(path.join(siteRoot, "index.html"))) {
  throw new Error(`Static artifact has no index.html: ${siteRoot}`);
}

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
]);

const server = http.createServer((request, response) => {
  try {
    const parsed = new URL(request.url || "/", "http://127.0.0.1");
    let pathname = decodeURIComponent(parsed.pathname);
    if (pathname === "/watch") pathname = "/watch/";
    if (pathname.startsWith("/watch/")) pathname = pathname.slice("/watch".length);
    if (pathname === "/") pathname = "/index.html";
    const relative = pathname.replace(/^\/+/, "");
    const file = path.resolve(siteRoot, relative);
    if (file !== siteRoot && !file.startsWith(`${siteRoot}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": mime.get(path.extname(file)) || "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    fs.createReadStream(file).pipe(response);
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Static smoke server has no TCP address");
const origin = `http://127.0.0.1:${address.port}`;
const normalizeRecordedUrl = (value) => {
  try {
    const parsed = new URL(value, origin);
    return parsed.origin === origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.href;
  } catch {
    return String(value);
  }
};
const isExternalRecordedUrl = (value) => /^https?:\/\//i.test(value) && new URL(value).origin !== origin;

const browserTypes = { chromium, firefox, webkit };
const results = [];
for (const name of requestedBrowsers) {
  const browserType = browserTypes[name];
  if (!browserType) {
    results.push({ browser: name, status: "unsupported-name", accepted: false });
    continue;
  }
  let browser;
  try {
    browser = await browserType.launch({
      headless: true,
      ...(name === "chromium"
        ? { args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] }
        : {}),
    });
  } catch (error) {
    results.push({ browser: name, status: "browser-not-installed", accepted: null, error: String(error) });
    continue;
  }
  const browserVersion = browser.version();
  try {
    const perBase = [];
    for (const base of ["/", "/watch/"]) {
      const pageErrors = [];
      const requestFailures = [];
      const consoleErrors = [];
      const httpErrors = [];
      const requests = [];
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      page.on("pageerror", (error) => pageErrors.push(String(error)));
      page.on("requestfailed", (request) => requestFailures.push({ url: normalizeRecordedUrl(request.url()), error: request.failure()?.errorText ?? "unknown" }));
      page.on("request", (request) => requests.push(normalizeRecordedUrl(request.url())));
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("response", (response) => {
        if (response.status() >= 400) httpErrors.push({ url: normalizeRecordedUrl(response.url()), status: response.status() });
      });
      const response = await page.goto(`${origin}${base}?view=r1FinalHero&t=0.104&readoutPose=1010&explode=0`, {
        waitUntil: "commit",
        timeout: 60000,
      });
      await page.waitForFunction(() => typeof globalThis.__WATCH__?.capture === "function", null, { timeout: 300000 });
      await page.evaluate(() => {
        globalThis.__WATCH__.setPlaybackPaused(true);
        globalThis.__WATCH__.setExplode(0);
        globalThis.__WATCH__.setView("r1FinalHero");
      });
      await page.waitForTimeout(500);
      const initial = await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        const watch = globalThis.__WATCH__;
        const image = watch.capture();
        const sample = document.createElement("canvas");
        sample.width = 96;
        sample.height = 64;
        const sampleContext = sample.getContext("2d", { willReadFrequently: true });
        let pixels = null;
        if (canvas && sampleContext) {
          sampleContext.drawImage(canvas, 0, 0, sample.width, sample.height);
          const data = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
          const corners = [[0, 0], [95, 0], [0, 63], [95, 63]].map(([x, y]) => {
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
          pixels = {
            sample: [sample.width, sample.height],
            background,
            nonBackgroundPixels,
            bounds: nonBackgroundPixels ? [minX, minY, maxX, maxY] : null,
          };
        }
        const release = watch.releasePresentationReport?.();
        const fallback = document.querySelector("#webgl-fallback");
        return {
          title: document.title,
          canvas: canvas ? { width: canvas.width, height: canvas.height, label: canvas.getAttribute("aria-label") } : null,
          captureLength: image.length,
          pixels,
          explodeZero: watch.explodedAssemblyReport?.().scalar?.value ?? watch.explodedAssemblyReport?.().value ?? null,
          camera: release?.current?.camera ?? null,
          shellEnabled: release?.current?.shellEnabled ?? null,
          fallbackHidden: fallback ? getComputedStyle(fallback).display === "none" : false,
          controls: [...document.querySelectorAll(".release-shell button")].map((button) => ({
            text: button.textContent?.trim() ?? "",
            minHeight: getComputedStyle(button).minHeight,
          })),
        };
      });
      await page.evaluate(() => {
        globalThis.__WATCH__.setExplode(1);
        globalThis.__WATCH__.setExplode(0);
        globalThis.__WATCH__.setView("r1FinalHero");
      });
      await page.getByRole("button", { name: "Resume" }).click();
      const resumedByButton = await page.evaluate(() => !globalThis.__WATCH__.releasePresentationReport().current.playbackPaused);
      await page.getByRole("button", { name: "Pause" }).click();
      const pausedByButton = await page.evaluate(() => globalThis.__WATCH__.releasePresentationReport().current.playbackPaused);
      await page.evaluate(() => globalThis.__WATCH__.setExplode(1));
      await page.getByRole("button", { name: "Reset view" }).click();
      const resetByButton = await page.evaluate(() => ({
        explode: globalThis.__WATCH__.explodedAssemblyReport().scalar.value,
        view: globalThis.__WATCH__.releasePresentationReport().current.view,
        canvasFocused: document.activeElement === document.querySelector("canvas"),
      }));
      await page.locator("canvas").focus();
      await page.keyboard.press("e");
      await page.waitForFunction(
        () => globalThis.__WATCH__.explodedAssemblyReport().scalar.value === 1,
        null,
        { timeout: 300000 },
      );
      const keyboardExploded = await page.evaluate(() => globalThis.__WATCH__.explodedAssemblyReport().scalar.value);
      await page.keyboard.press("e");
      await page.waitForFunction(
        () => globalThis.__WATCH__.explodedAssemblyReport().scalar.value === 0,
        null,
        { timeout: 300000 },
      );
      const keyboardAssembled = await page.evaluate(() => globalThis.__WATCH__.explodedAssemblyReport().scalar.value);
      await page.keyboard.press("Space");
      const keyboardResumed = await page.evaluate(() => !globalThis.__WATCH__.releasePresentationReport().current.playbackPaused);
      await page.keyboard.press("Space");
      const keyboardPaused = await page.evaluate(() => globalThis.__WATCH__.releasePresentationReport().current.playbackPaused);
      await page.keyboard.press("Home");
      const keyboardHome = await page.evaluate(() => ({
        explode: globalThis.__WATCH__.explodedAssemblyReport().scalar.value,
        view: globalThis.__WATCH__.releasePresentationReport().current.view,
        canvasFocused: document.activeElement === document.querySelector("canvas"),
      }));
      const gestureCameraBefore = await page.evaluate(() => {
        globalThis.__WATCH__.setPlaybackPaused(true);
        return globalThis.__WATCH__.releasePresentationReport().current.camera;
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.mouse.move(190, 420);
      await page.mouse.down();
      await page.mouse.move(225, 445, { steps: 4 });
      await page.mouse.up();
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(150);
      const afterInteraction = await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        const release = globalThis.__WATCH__.releasePresentationReport?.();
        let nonBackgroundPixels = null;
        if (canvas) {
          const sample = document.createElement("canvas");
          sample.width = 96;
          sample.height = 64;
          const context = sample.getContext("2d", { willReadFrequently: true });
          if (context) {
            context.drawImage(canvas, 0, 0, sample.width, sample.height);
            const data = context.getImageData(0, 0, sample.width, sample.height).data;
            const background = [data[0], data[1], data[2]];
            nonBackgroundPixels = 0;
            for (let index = 0; index < data.length; index += 4) {
              if (Math.max(
                Math.abs(data[index] - background[0]),
                Math.abs(data[index + 1] - background[1]),
                Math.abs(data[index + 2] - background[2]),
              ) > 12) nonBackgroundPixels += 1;
            }
          }
        }
        return {
          canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
          camera: release?.current?.camera ?? null,
          explodeZero: globalThis.__WATCH__.explodedAssemblyReport?.().scalar?.value ?? null,
          nonBackgroundPixels,
        };
      });
      const vectorDelta = (a, b) => Array.isArray(a) && Array.isArray(b)
        ? Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0))
        : null;
      const cameraMotion = {
        positionDelta: vectorDelta(gestureCameraBefore?.position, afterInteraction.camera?.position),
        targetDelta: vectorDelta(gestureCameraBefore?.target, afterInteraction.camera?.target),
        fovDelta: Number.isFinite(gestureCameraBefore?.fov) && Number.isFinite(afterInteraction.camera?.fov)
          ? Math.abs(gestureCameraBefore.fov - afterInteraction.camera.fov)
          : null,
      };
      cameraMotion.changed = [cameraMotion.positionDelta, cameraMotion.targetDelta, cameraMotion.fovDelta]
        .some((value) => Number.isFinite(value) && value > 1e-6);
      const resized = afterInteraction.canvas;
      const resizeChanged = Boolean(
        resized && initial.canvas && (resized.width !== initial.canvas.width || resized.height !== initial.canvas.height),
      );
      const resizeExact = Boolean(resized && resized.width === 390 && resized.height === 844);
      const subjectVisible = Boolean(
        initial.pixels
        && initial.pixels.nonBackgroundPixels >= 200
        && initial.pixels.bounds
        && initial.pixels.bounds[2] - initial.pixels.bounds[0] >= 12
        && initial.pixels.bounds[3] - initial.pixels.bounds[1] >= 12,
      );
      const externalRequests = requests.filter(isExternalRecordedUrl);
      const controlLabels = initial.controls.map((row) => row.text);
      const consoleClassification = classifyConsoleErrors(consoleErrors);
      perBase.push({
        base,
        httpStatus: response?.status() ?? null,
        initial,
        resized,
        interaction: {
          cameraMotion,
          resizeChanged,
          resizeExact,
          nonBackgroundPixels: afterInteraction.nonBackgroundPixels,
          explodeZero: afterInteraction.explodeZero,
          controls: {
            pausedByButton,
            resumedByButton,
            resetByButton,
            keyboardExploded,
            keyboardAssembled,
            keyboardPaused,
            keyboardResumed,
            keyboardHome,
          },
        },
        pageErrors,
        requestFailures,
        httpErrors,
        requests,
        externalRequests,
        consoleErrors,
        consoleClassification,
        accepted:
          response?.status() === 200
          && Boolean(initial.canvas)
          && typeof initial.canvas.label === "string"
          && initial.canvas.label.length > 0
          && initial.captureLength > 10_000
          && subjectVisible
          && initial.explodeZero === 0
          && initial.shellEnabled === true
          && initial.fallbackHidden === true
          && ["Assembled", "Exploded", "Resume", "Reset view"].every((label) => controlLabels.includes(label))
          && initial.controls.every((row) => Number.parseFloat(row.minHeight) >= 44)
          && resizeChanged
          && resizeExact
          && afterInteraction.nonBackgroundPixels >= 200
          && cameraMotion.changed
          && afterInteraction.explodeZero === 0
          && pausedByButton === true
          && resumedByButton === true
          && resetByButton.explode === 0
          && resetByButton.view === "r1FinalHero"
          && resetByButton.canvasFocused === true
          && keyboardExploded === 1
          && keyboardAssembled === 0
          && keyboardPaused === true
          && keyboardResumed === true
          && keyboardHome.explode === 0
          && keyboardHome.view === "r1FinalHero"
          && keyboardHome.canvasFocused === true
          && pageErrors.length === 0
          && requestFailures.length === 0
          && httpErrors.length === 0
          && externalRequests.length === 0
          && consoleClassification.unexpected.length === 0,
      });
      await context.close();
    }

    const reducedContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const reducedPage = await reducedContext.newPage();
    const reducedErrors = [];
    const reducedRequestFailures = [];
    const reducedHttpErrors = [];
    const reducedConsoleErrors = [];
    const reducedRequests = [];
    reducedPage.on("pageerror", (error) => reducedErrors.push(String(error)));
    reducedPage.on("requestfailed", (request) => reducedRequestFailures.push({
      url: normalizeRecordedUrl(request.url()), error: request.failure()?.errorText ?? "unknown",
    }));
    reducedPage.on("request", (request) => reducedRequests.push(normalizeRecordedUrl(request.url())));
    reducedPage.on("response", (response) => {
      if (response.status() >= 400) reducedHttpErrors.push({ url: normalizeRecordedUrl(response.url()), status: response.status() });
    });
    reducedPage.on("console", (message) => {
      if (message.type() === "error") reducedConsoleErrors.push(message.text());
    });
    await reducedPage.goto(`${origin}/?readoutPose=1010`, { waitUntil: "commit", timeout: 60000 });
    await reducedPage.waitForFunction(() => typeof globalThis.__WATCH__?.capture === "function", null, { timeout: 300000 });
    const reducedInitial = await reducedPage.evaluate(() => {
      const report = globalThis.__WATCH__.releasePresentationReport?.();
      return {
        mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
        reported: report?.current?.reducedMotion ?? null,
        playbackPaused: report?.current?.playbackPaused ?? null,
        shellEnabled: report?.current?.shellEnabled ?? null,
        view: report?.current?.view ?? null,
        explode: globalThis.__WATCH__.explodedAssemblyReport().scalar.value,
      };
    });
    await reducedPage.getByRole("button", { name: "Exploded" }).click();
    const reducedExploded = await reducedPage.evaluate(() => globalThis.__WATCH__.explodedAssemblyReport().scalar.value);
    await reducedPage.getByRole("button", { name: "Assembled" }).click();
    const reducedAssembled = await reducedPage.evaluate(() => globalThis.__WATCH__.explodedAssemblyReport().scalar.value);
    const reducedMotion = await reducedPage.evaluate(() => {
      const report = globalThis.__WATCH__.releasePresentationReport?.();
      return {
        mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
        reported: report?.current?.reducedMotion ?? null,
        playbackPaused: report?.current?.playbackPaused ?? null,
        shellEnabled: report?.current?.shellEnabled ?? null,
        view: report?.current?.view ?? null,
      };
    });
    const reducedConsoleClassification = classifyConsoleErrors(reducedConsoleErrors);
    const reducedExternalRequests = reducedRequests.filter(isExternalRecordedUrl);
    await reducedContext.close();
    const fallbackBases = [];
    for (const base of ["/", "/watch/"]) {
      const fallbackContext = await browser.newContext({
        viewport: { width: 900, height: 700 },
        javaScriptEnabled: false,
      });
      const fallbackPage = await fallbackContext.newPage();
      const fallbackDiagnostics = { pageErrors: [], requestFailures: [], httpErrors: [], requests: [] };
      fallbackPage.on("pageerror", (error) => fallbackDiagnostics.pageErrors.push(String(error)));
      fallbackPage.on("request", (request) => fallbackDiagnostics.requests.push(normalizeRecordedUrl(request.url())));
      fallbackPage.on("requestfailed", (request) => fallbackDiagnostics.requestFailures.push({
        url: normalizeRecordedUrl(request.url()), error: request.failure()?.errorText ?? "unknown",
      }));
      fallbackPage.on("response", (response) => {
        if (response.status() >= 400) fallbackDiagnostics.httpErrors.push({ url: normalizeRecordedUrl(response.url()), status: response.status() });
      });
      const fallbackResponse = await fallbackPage.goto(`${origin}${base}`, { waitUntil: "load", timeout: 60000 });
      const fallback = {
        base,
        httpStatus: fallbackResponse?.status() ?? null,
        headingVisible: await fallbackPage.getByRole("heading", { name: "Interactive skeleton watch" }).isVisible(),
        textVisible: await fallbackPage.locator("#webgl-fallback p").isVisible(),
        posterVisible: await fallbackPage.locator("img.webgl-fallback__poster").isVisible(),
        posterSource: await fallbackPage.locator("img.webgl-fallback__poster").getAttribute("src"),
        diagnostics: fallbackDiagnostics,
      };
      const fallbackExternalRequests = fallbackDiagnostics.requests.filter(isExternalRecordedUrl);
      fallback.externalRequests = fallbackExternalRequests;
      fallback.accepted =
        fallback.httpStatus === 200
        && fallback.headingVisible
        && fallback.textVisible
        && fallback.posterVisible
        && fallback.posterSource === "./watch-poster.png"
        && fallbackDiagnostics.pageErrors.length === 0
        && fallbackDiagnostics.requestFailures.length === 0
        && fallbackDiagnostics.httpErrors.length === 0
        && fallbackExternalRequests.length === 0;
      fallbackBases.push(fallback);
      await fallbackContext.close();
    }
    results.push({
      browser: name,
      version: browserVersion,
      status: "tested",
      bases: perBase,
      reducedMotion,
      reducedErrors,
      reducedRequestFailures,
      reducedHttpErrors,
      reducedConsoleErrors,
      reducedConsoleClassification,
      reducedRequests,
      reducedExternalRequests,
      reducedControlAudit: { initial: reducedInitial, exploded: reducedExploded, assembled: reducedAssembled },
      javascriptDisabledFallback: fallbackBases,
      accepted:
        perBase.every((row) => row.accepted)
        && fallbackBases.every((row) => row.accepted)
        && reducedErrors.length === 0
        && reducedRequestFailures.length === 0
        && reducedHttpErrors.length === 0
        && reducedExternalRequests.length === 0
        && reducedConsoleClassification.unexpected.length === 0
        && reducedInitial.mediaMatches
        && reducedInitial.reported === true
        && reducedInitial.playbackPaused === true
        && reducedInitial.shellEnabled === true
        && reducedInitial.view === "r1FinalHero"
        && reducedInitial.explode === 0
        && reducedMotion.mediaMatches === true
        && reducedMotion.reported === true
        && reducedMotion.playbackPaused === true
        && reducedMotion.shellEnabled === true
        && reducedMotion.view === "r1E1Hero"
        && reducedExploded === 1
        && reducedAssembled === 0,
    });
  } finally {
    await browser.close();
  }
}

await new Promise((resolve) => server.close(resolve));
const tested = results.filter((row) => row.status === "tested");
const report = {
  schema: "watch.static-artifact-smoke.v1",
  testedArtifact: { root: siteRootLabel, files: artifactFiles(siteRoot) },
  requestedBrowsers,
  acceptedConsoleDiagnostic,
  results,
  accepted:
    results.length === requestedBrowsers.length
    && results.every((row) => row.status === "tested" && row.accepted === true)
    && results.some((row) => row.browser === "chromium"),
};
if (output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (!report.accepted) process.exitCode = 1;
