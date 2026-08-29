import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright";

const root = process.cwd();
const outDir = path.join(root, "captures/post5d-newer-827");
const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const outputNames = [
  "04-crown-after-tight-macro.png",
  "04-crown-after-tight-flat-owner-id.png",
  "04-crown-after-tight-isolated-normal.png",
  "04-crown-after-tight-closure-wireframe.png",
  "04-crown-closure-report-tight.json",
];
fs.mkdirSync(outDir, { recursive: true });
for (const name of outputNames) {
  const target = path.join(outDir, name);
  if (fs.existsSync(target)) throw new Error(`refusing to overwrite ${target}`);
}

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1540, height: 1342 }, deviceScaleFactor: 1 });
const browserErrors = [];
const requestFailures = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
page.on("requestfailed", (request) => requestFailures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 180_000 });
await page.waitForFunction(
  () => globalThis.__WATCH__?.exteriorReport?.()?.crownCapClosure?.capIsSoleEndClosure === true,
  { timeout: 180_000 },
);

const cdp = await page.context().newCDPSession(page);
await cdp.send("Runtime.evaluate", {
  expression: "import('/node_modules/.vite/deps/three.js').then(m => globalThis.__CROWN_EVIDENCE_THREE__ = m)",
  awaitPromise: true,
});
async function exposeObject(constructorExpression, selectFunction, globalName) {
  const prototype = await cdp.send("Runtime.evaluate", { expression: constructorExpression });
  const instances = await cdp.send("Runtime.queryObjects", { prototypeObjectId: prototype.result.objectId });
  await cdp.send("Runtime.callFunctionOn", {
    objectId: instances.objects.objectId,
    functionDeclaration: `function(){ globalThis.${globalName} = (${selectFunction})(this); }`,
  });
}
await exposeObject(
  "__CROWN_EVIDENCE_THREE__.Scene.prototype",
  "xs => xs.find(x => x.getObjectByName && x.getObjectByName('ext:crown-body'))",
  "__CROWN_EVIDENCE_SCENE__",
);
await exposeObject(
  "__CROWN_EVIDENCE_THREE__.PerspectiveCamera.prototype",
  "xs => xs.find(x => x.isPerspectiveCamera && x.near === 0.25 && x.far === 160)",
  "__CROWN_EVIDENCE_CAMERA__",
);
await exposeObject(
  "__CROWN_EVIDENCE_THREE__.WebGLRenderer.prototype",
  "xs => xs.find(x => x.domElement && x.domElement.parentElement)",
  "__CROWN_EVIDENCE_RENDERER__",
);

const setup = await page.evaluate(() => {
  const THREE = globalThis.__CROWN_EVIDENCE_THREE__;
  const scene = globalThis.__CROWN_EVIDENCE_SCENE__;
  const body = scene.getObjectByName("ext:crown-body");
  const cap = scene.getObjectByName("ext:crown-cap");
  const socket = scene.getObjectByName("ext:crown-socket");
  const collar = scene.getObjectByName("ext:crown-root-collar");
  if (!body || !cap || !socket || !collar) throw new Error("crown evidence owner missing");
  globalThis.__CROWN_EVIDENCE_OBJECTS__ = { body, cap, socket, collar };
  const pathOf = (object) => {
    const rows = [];
    for (let cursor = object; cursor; cursor = cursor.parent) rows.push(cursor.name || cursor.type);
    return rows.reverse().join("/");
  };
  globalThis.__CROWN_EVIDENCE_PATH__ = pathOf;
  const report = globalThis.__WATCH__.exteriorReport();
  const crown = report.crown;
  const camera = {
    position: [crown.bodyX1 + 12.5, 5.2, crown.axis.z + 5.0],
    target: [crown.caseX + 0.7, 0.15, crown.axis.z + 0.12],
    up: [0, 1, 0],
    fov: 30,
  };
  const boxOf = (object) => {
    const box = new THREE.Box3().setFromObject(object, true);
    return { min: box.min.toArray(), max: box.max.toArray() };
  };
  return {
    camera,
    owners: Object.fromEntries(
      Object.entries({ body, cap, socket, collar }).map(([key, object]) => [key, {
        name: object.name,
        path: pathOf(object),
        bounds: boxOf(object),
        finish: object.userData.finish ?? null,
      }]),
    ),
  };
});

const capture = async (name, mode) => {
  const dataUrl = await page.evaluate(({ camera, mode }) => {
    const THREE = globalThis.__CROWN_EVIDENCE_THREE__;
    const scene = globalThis.__CROWN_EVIDENCE_SCENE__;
    const renderCamera = globalThis.__CROWN_EVIDENCE_CAMERA__;
    const renderer = globalThis.__CROWN_EVIDENCE_RENDERER__;
    const objects = globalThis.__CROWN_EVIDENCE_OBJECTS__;
    const generated = [];
    const originals = [];
    scene.traverse((object) => {
      if (!object.isMesh) return;
      originals.push({ object, material: object.material, visible: object.visible });
    });
    if (mode === "flat-id") {
      const dark = new THREE.MeshBasicMaterial({ color: 0x17191d, side: THREE.DoubleSide, toneMapped: false });
      const body = new THREE.MeshBasicMaterial({ color: 0x39ff75, side: THREE.DoubleSide, toneMapped: false });
      const cap = new THREE.MeshBasicMaterial({ color: 0xff3bbd, side: THREE.DoubleSide, toneMapped: false });
      generated.push(dark, body, cap);
      scene.traverse((object) => {
        if (!object.isMesh || !object.visible) return;
        object.material = object === objects.body ? body : object === objects.cap ? cap : dark;
      });
    } else if (mode === "isolated") {
      scene.traverse((object) => {
        if (object.isMesh) object.visible = object === objects.body || object === objects.cap;
      });
    } else if (mode === "wireframe") {
      const body = new THREE.MeshBasicMaterial({ color: 0xdde6ee, wireframe: true, side: THREE.DoubleSide, toneMapped: false });
      const cap = new THREE.MeshBasicMaterial({ color: 0xff3bbd, wireframe: true, side: THREE.DoubleSide, toneMapped: false });
      generated.push(body, cap);
      scene.traverse((object) => {
        if (!object.isMesh) return;
        object.visible = object === objects.body || object === objects.cap;
        if (object === objects.body) object.material = body;
        if (object === objects.cap) object.material = cap;
      });
    }
    renderCamera.position.set(...camera.position);
    renderCamera.up.set(...camera.up);
    renderCamera.fov = camera.fov;
    renderCamera.lookAt(new THREE.Vector3(...camera.target));
    renderCamera.updateProjectionMatrix();
    renderCamera.updateMatrixWorld(true);
    renderer.render(scene, renderCamera);
    const result = renderer.domElement.toDataURL("image/png");
    for (const row of originals) {
      row.object.material = row.material;
      row.object.visible = row.visible;
    }
    for (const material of generated) material.dispose();
    return result;
  }, { camera: setup.camera, mode });
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(outDir, name), bytes, { flag: "wx" });
  return { file: name, bytes: bytes.byteLength, sha256: sha256(bytes), mode };
};

await page.evaluate(() => {
  globalThis.__WATCH__.setDebug(false);
  globalThis.__WATCH__.setExplode(0);
  globalThis.__WATCH__.setPhase5dCProfile("presentSettled");
  globalThis.__WATCH__.setTime(0.104);
  globalThis.__WATCH__.capture();
});
const files = [];
files.push(await capture(outputNames[0], "normal"));
files.push(await capture(outputNames[1], "flat-id"));
files.push(await capture(outputNames[2], "isolated"));
files.push(await capture(outputNames[3], "wireframe"));

const geometry = await page.evaluate(() => {
  const THREE = globalThis.__CROWN_EVIDENCE_THREE__;
  const { body, cap } = globalThis.__CROWN_EVIDENCE_OBJECTS__;
  const report = globalThis.__WATCH__.exteriorReport();
  const expectedRadius = report.crownCapClosure.capRadius;
  const expectedX = report.crownCapClosure.bodyX1;
  const epsilon = 1e-4;
  const bodyPoints = [];
  const capPoints = [];
  const v = new THREE.Vector3();
  globalThis.__CROWN_EVIDENCE_SCENE__.updateMatrixWorld(true);
  const bodyPosition = body.geometry.attributes.position;
  for (let i = 0; i < bodyPosition.count; i++) {
    v.fromBufferAttribute(bodyPosition, i).applyMatrix4(body.matrixWorld);
    const radial = Math.hypot(v.y - report.crown.axis.y, v.z - report.crown.axis.z);
    if (Math.abs(radial - expectedRadius) <= epsilon && Math.abs(v.x - expectedX) <= epsilon) {
      bodyPoints.push(v.toArray());
    }
  }
  const capPosition = cap.geometry.attributes.position;
  for (let i = 0; i < capPosition.count; i++) {
    v.fromBufferAttribute(capPosition, i);
    if (Math.hypot(v.x, v.y) < expectedRadius * 0.99) continue;
    v.applyMatrix4(cap.matrixWorld);
    capPoints.push(v.toArray());
  }
  const nearest = (point, rows) => Math.min(...rows.map((row) => Math.hypot(
    point[0] - row[0], point[1] - row[1], point[2] - row[2],
  )));
  return {
    bodyBoundaryVertices: bodyPoints.length,
    capBoundaryVertices: capPoints.length,
    bodyToCapHausdorffMm: Math.max(...bodyPoints.map((point) => nearest(point, capPoints))),
    capToBodyHausdorffMm: Math.max(...capPoints.map((point) => nearest(point, bodyPoints))),
    bodyBoundaryX: [Math.min(...bodyPoints.map((point) => point[0])), Math.max(...bodyPoints.map((point) => point[0]))],
    capBoundaryX: [Math.min(...capPoints.map((point) => point[0])), Math.max(...capPoints.map((point) => point[0]))],
    bodyIndexCount: body.geometry.index?.count ?? null,
    capIndexCount: cap.geometry.index?.count ?? null,
  };
});

const exterior = await page.evaluate(() => globalThis.__WATCH__.exteriorReport());
const payload = {
  witness: {
    source: "watch_newer_827_4.png",
    sourceSha256: sha256(fs.readFileSync(path.join(root, "watch_newer_827_4.png"))),
    diagnosis: "former separately closed ext:crown-body plus 0.01 mm-proud ext:crown-cap created a stepped, double-face finish boundary",
  },
  camera: setup.camera,
  owners: setup.owners,
  closure: exterior.crownCapClosure,
  actualRenderedBoundary: geometry,
  invariants: {
    crownAxis: exterior.crown.axis,
    bodyR: exterior.crown.bodyR,
    bodyX1: exterior.crown.bodyX1,
    socketOperatingGap: exterior.crownJoin.operatingGap,
    socketRenderedClearance: exterior.crownKeepout.minClearance,
    rootCollar: exterior.crownRootCollar,
    identity: exterior.identity.crown,
    package: exterior.audit.package,
  },
  files,
  browserErrors,
  requestFailures,
};
fs.writeFileSync(path.join(outDir, outputNames[4]), `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx" });
await browser.close();
console.log(JSON.stringify({ report: path.relative(root, path.join(outDir, outputNames[4])), files, browserErrors, requestFailures }, null, 2));
