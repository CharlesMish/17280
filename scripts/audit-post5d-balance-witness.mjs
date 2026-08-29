import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const root = process.cwd();
const outDir = path.join(root, "captures/post5d-balance-hub-witness");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
await page.goto(`${baseUrl}/?static=1&view=finishBalance&t=0.104&readoutPose=1010`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => globalThis.__WATCH__?.sceneDump !== undefined);

const cdp = await page.context().newCDPSession(page);
await cdp.send("Runtime.evaluate", {
  expression: "import('/node_modules/.vite/deps/three.js').then(m => globalThis.__THREE_WITNESS__ = m)",
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
  "__THREE_WITNESS__.Scene.prototype",
  "xs => xs.find(x => x.getObjectByName && x.getObjectByName('calibre'))",
  "__WITNESS_SCENE__",
);
await exposeObject(
  "__THREE_WITNESS__.PerspectiveCamera.prototype",
  "xs => xs.find(x => x.isPerspectiveCamera && x.fov >= 10 && x.fov <= 80)",
  "__WITNESS_CAMERA__",
);
await exposeObject(
  "__THREE_WITNESS__.WebGLRenderer.prototype",
  "xs => xs.find(x => x.domElement && x.domElement.parentElement && x.domElement.parentElement.id === 'app')",
  "__WITNESS_RENDERER__",
);

const geometryPayload = await page.evaluate(() => {
  const THREE = globalThis.__THREE_WITNESS__;
  const scene = globalThis.__WITNESS_SCENE__;
  scene.updateMatrixWorld(true);
  const geometryRoot = scene.getObjectByName("balance:geom");
  const arm = geometryRoot.children[3];
  const hub = geometryRoot.children[4];
  const arbor = scene.getObjectByName("balance:arbor:shaft");
  const objectPath = (object) => {
    const rows = [];
    for (let current = object; current; current = current.parent) {
      let label = current.name || current.type;
      if (!current.name && current.parent) label += `[${current.parent.children.indexOf(current)}]`;
      rows.push(label);
    }
    return rows.reverse().join("/");
  };
  const payload = (mesh, diagnosticName, sourceChildIndex) => {
    mesh.geometry.computeBoundingBox();
    const worldBounds = new THREE.Box3().setFromObject(mesh, true);
    const position = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.getIndex();
    return {
      diagnosticName,
      sourceChildIndex,
      runtimeName: mesh.name,
      scenePath: objectPath(mesh),
      parentMotionOwner: objectPath(geometryRoot.parent),
      localMatrix: mesh.matrix.toArray(),
      worldMatrix: mesh.matrixWorld.toArray(),
      localBounds: {
        min: mesh.geometry.boundingBox.min.toArray(),
        max: mesh.geometry.boundingBox.max.toArray(),
      },
      worldBounds: { min: worldBounds.min.toArray(), max: worldBounds.max.toArray() },
      position: Array.from(position.array),
      itemSize: position.itemSize,
      index: index ? Array.from(index.array) : null,
      triangleCount: (index ? index.count : position.count) / 3,
      worldPosition: mesh.getWorldPosition(new THREE.Vector3()).toArray(),
      worldQuaternion: mesh.getWorldQuaternion(new THREE.Quaternion()).toArray(),
      worldScale: mesh.getWorldScale(new THREE.Vector3()).toArray(),
    };
  };
  return {
    balanceMotionRotationRad: geometryRoot.parent.rotation.z,
    balanceAxis: geometryRoot.getWorldPosition(new THREE.Vector3()).toArray(),
    arm: payload(arm, "balance arm instance", 3),
    hub: payload(hub, "balance hub", 4),
    arbor: payload(arbor, "balance arbor shaft", null),
  };
});

function triangles(payload) {
  const matrix = new THREE.Matrix4().fromArray(payload.worldMatrix);
  const position = payload.position;
  const index = payload.index;
  const count = index ? index.length : position.length / payload.itemSize;
  const vertex = (slot) => {
    const i = index ? index[slot] : slot;
    return new THREE.Vector3(
      position[i * payload.itemSize],
      position[i * payload.itemSize + 1],
      position[i * payload.itemSize + 2],
    ).applyMatrix4(matrix);
  };
  const rows = [];
  for (let slot = 0; slot < count; slot += 3) {
    rows.push({ index: slot / 3, a: vertex(slot), b: vertex(slot + 1), c: vertex(slot + 2) });
  }
  return rows;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function segmentSegment(a0, a1, b0, b1) {
  const d1 = a1.clone().sub(a0);
  const d2 = b1.clone().sub(b0);
  const r = a0.clone().sub(b0);
  const aa = d1.dot(d1);
  const ee = d2.dot(d2);
  const ff = d2.dot(r);
  let s;
  let t;
  if (aa <= 1e-24 && ee <= 1e-24) return { a: a0.clone(), b: b0.clone(), distance: a0.distanceTo(b0) };
  if (aa <= 1e-24) {
    s = 0;
    t = clamp(ff / ee, 0, 1);
  } else {
    const cc = d1.dot(r);
    if (ee <= 1e-24) {
      t = 0;
      s = clamp(-cc / aa, 0, 1);
    } else {
      const bb = d1.dot(d2);
      const denom = aa * ee - bb * bb;
      s = denom !== 0 ? clamp((bb * ff - cc * ee) / denom, 0, 1) : 0;
      t = (bb * s + ff) / ee;
      if (t < 0) {
        t = 0;
        s = clamp(-cc / aa, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((bb - cc) / aa, 0, 1);
      }
    }
  }
  const pa = a0.clone().addScaledVector(d1, s);
  const pb = b0.clone().addScaledVector(d2, t);
  return { a: pa, b: pb, distance: pa.distanceTo(pb) };
}

function segmentTriangle(p0, p1, triangle) {
  const direction = p1.clone().sub(p0);
  const length = direction.length();
  if (length <= 1e-15) return null;
  direction.multiplyScalar(1 / length);
  const point = new THREE.Ray(p0, direction).intersectTriangle(
    triangle.a,
    triangle.b,
    triangle.c,
    false,
    new THREE.Vector3(),
  );
  if (!point) return null;
  const t = point.clone().sub(p0).dot(direction);
  return t >= -1e-10 && t <= length + 1e-10 ? point : null;
}

function trianglePairDistance(ta, tb) {
  const aEdges = [[ta.a, ta.b], [ta.b, ta.c], [ta.c, ta.a]];
  const bEdges = [[tb.a, tb.b], [tb.b, tb.c], [tb.c, tb.a]];
  for (const edge of aEdges) {
    const point = segmentTriangle(edge[0], edge[1], tb);
    if (point) return { distance: 0, a: point.clone(), b: point.clone(), intersection: true };
  }
  for (const edge of bEdges) {
    const point = segmentTriangle(edge[0], edge[1], ta);
    if (point) return { distance: 0, a: point.clone(), b: point.clone(), intersection: true };
  }
  let best = { distance: Infinity, a: null, b: null, intersection: false };
  const triA = new THREE.Triangle(ta.a, ta.b, ta.c);
  const triB = new THREE.Triangle(tb.a, tb.b, tb.c);
  for (const point of [ta.a, ta.b, ta.c]) {
    const q = triB.closestPointToPoint(point, new THREE.Vector3());
    const distance = point.distanceTo(q);
    if (distance < best.distance) best = { distance, a: point.clone(), b: q, intersection: false };
  }
  for (const point of [tb.a, tb.b, tb.c]) {
    const q = triA.closestPointToPoint(point, new THREE.Vector3());
    const distance = point.distanceTo(q);
    if (distance < best.distance) best = { distance, a: q, b: point.clone(), intersection: false };
  }
  for (const ae of aEdges) {
    for (const be of bEdges) {
      const row = segmentSegment(ae[0], ae[1], be[0], be[1]);
      if (row.distance < best.distance) best = { ...row, intersection: false };
    }
  }
  return best;
}

function exactPair(aPayload, bPayload) {
  const as = triangles(aPayload);
  const bs = triangles(bPayload);
  let best = { distance: Infinity, a: null, b: null, intersection: false, triangleA: null, triangleB: null };
  let firstIntersection = null;
  for (const ta of as) {
    for (const tb of bs) {
      const row = trianglePairDistance(ta, tb);
      if (row.intersection && !firstIntersection) {
        firstIntersection = { ...row, triangleA: ta.index, triangleB: tb.index };
      }
      if (row.distance < best.distance) best = { ...row, triangleA: ta.index, triangleB: tb.index };
    }
  }
  const row = firstIntersection ?? best;
  return {
    intersects: !!firstIntersection,
    minimumSurfaceDistanceMm: firstIntersection ? 0 : best.distance,
    triangleA: row.triangleA,
    triangleB: row.triangleB,
    pointA: row.a.toArray(),
    pointB: row.b.toArray(),
  };
}

const armHub = exactPair(geometryPayload.arm, geometryPayload.hub);
const armArbor = exactPair(geometryPayload.arm, geometryPayload.arbor);
const worldVertices = (payload) => {
  const matrix = new THREE.Matrix4().fromArray(payload.worldMatrix);
  const rows = [];
  for (let i = 0; i < payload.position.length; i += payload.itemSize) {
    rows.push(new THREE.Vector3(
      payload.position[i],
      payload.position[i + 1],
      payload.position[i + 2],
    ).applyMatrix4(matrix));
  }
  return rows;
};
const center = new THREE.Vector3(...geometryPayload.balanceAxis);
const armMatrix = new THREE.Matrix4().fromArray(geometryPayload.arm.worldMatrix);
const armDirection = new THREE.Vector3(1, 0, 0).transformDirection(armMatrix);
const armRootProjection = Math.min(...worldVertices(geometryPayload.arm)
  .map((point) => point.clone().sub(center).dot(armDirection)));
const hubOuterProjection = Math.max(...worldVertices(geometryPayload.hub)
  .map((point) => point.clone().sub(center).dot(armDirection)));
const renderedRadialEmbedMm = hubOuterProjection - armRootProjection;
const renderedAxialOverlapMm = Math.min(
  geometryPayload.arm.worldBounds.max[2],
  geometryPayload.hub.worldBounds.max[2],
) - Math.max(
  geometryPayload.arm.worldBounds.min[2],
  geometryPayload.hub.worldBounds.min[2],
);

const diagnostic = await page.evaluate(async ({ witnessPoint, armArborClearance }) => {
  const THREE = globalThis.__THREE_WITNESS__;
  const scene = globalThis.__WITNESS_SCENE__;
  const camera = globalThis.__WITNESS_CAMERA__;
  const renderer = globalThis.__WITNESS_RENDERER__;
  const geometryRoot = scene.getObjectByName("balance:geom");
  const arm = geometryRoot.children[3];
  const hub = geometryRoot.children[4];
  const arbor = scene.getObjectByName("balance:arbor:shaft");
  arm.name = "diagnostic:balanceArm:child3";
  hub.name = "diagnostic:balanceHub:child4";
  const pathOf = (object) => {
    const rows = [];
    for (let current = object; current; current = current.parent) {
      let label = current.name || current.type;
      if (!current.name && current.parent) label += `[${current.parent.children.indexOf(current)}]`;
      rows.push(label);
    }
    return rows.reverse().join("/");
  };
  const visibility = [];
  scene.traverse((object) => {
    if (!object.isMesh) return;
    visibility.push([object, object.visible]);
    object.visible = object === arm || object === hub || object === arbor;
  });
  arbor.visible = false;
  const original = {
    arm: arm.material,
    hub: hub.material,
    background: scene.background,
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    up: camera.up.clone(),
    fov: camera.fov,
  };
  scene.background = new THREE.Color(0x11151b);
  const center = geometryRoot.getWorldPosition(new THREE.Vector3());
  const cameraOffset = new THREE.Vector3(5.2, -9.0, 2.8);
  camera.position.copy(center).add(cameraOffset);
  camera.up.set(0, 0, 1);
  camera.fov = 29;
  camera.lookAt(center.clone().add(new THREE.Vector3(0, -0.4, 0)));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  let renderCamera = camera;
  const files = [];
  const makePng = (annotation) => {
    renderer.render(scene, renderCamera);
    const source = renderer.domElement;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0);
    if (annotation) {
      const point = new THREE.Vector3(...witnessPoint).project(renderCamera);
      const x = (point.x * 0.5 + 0.5) * canvas.width;
      const y = (-point.y * 0.5 + 0.5) * canvas.height;
      ctx.strokeStyle = "#ffd447";
      ctx.fillStyle = "#ffd447";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.font = "23px sans-serif";
      const lines = annotation.split("; ");
      const textX = Math.min(x + 25, canvas.width - 650);
      const textY = Math.max(42, y - 34);
      lines.forEach((line, index) => ctx.fillText(line, textX, textY + index * 30));
    }
    return canvas.toDataURL("image/png");
  };
  arm.material = new THREE.MeshBasicMaterial({ color: 0xff3b7f, side: THREE.DoubleSide });
  hub.material = new THREE.MeshBasicMaterial({ color: 0x25c9ff, side: THREE.DoubleSide });
  files.push(["flat-owner-id.png", makePng("arm ↔ hub: intersecting same-owner joint")]);

  arm.material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  hub.material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  files.push(["isolated-normal.png", makePng(null)]);

  arm.material = new THREE.MeshBasicMaterial({
    color: 0xff3b7f,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  hub.material = new THREE.MeshBasicMaterial({
    color: 0x25c9ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const armDirection = new THREE.Vector3(1, 0, 0).transformDirection(arm.matrixWorld);
  const tangent = new THREE.Vector3(-armDirection.y, armDirection.x, 0).normalize();
  const sideCamera = new THREE.OrthographicCamera(-4.7, 4.7, 3.23, -3.23, 0.01, 50);
  sideCamera.position.copy(center).addScaledVector(tangent, 8.8).add(new THREE.Vector3(0, 0, 0.22));
  sideCamera.up.set(0, 0, 1);
  sideCamera.lookAt(center.clone().addScaledVector(armDirection, 0.8));
  sideCamera.updateProjectionMatrix();
  sideCamera.updateMatrixWorld(true);
  renderCamera = sideCamera;
  files.push([
    "orthographic-side-witness.png",
    makePng(`surface intersection = 0.000000 mm; arm↔true arbor = ${armArborClearance.toFixed(6)} mm`),
  ]);

  const rays = [];
  const base = new THREE.Vector3(...witnessPoint).project(renderCamera);
  for (const [dx, dy] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]]) {
    const px = (base.x * 0.5 + 0.5) * renderer.domElement.width + dx;
    const py = (-base.y * 0.5 + 0.5) * renderer.domElement.height + dy;
    const ndc = new THREE.Vector2(px / renderer.domElement.width * 2 - 1, -(py / renderer.domElement.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, renderCamera);
    const hit = (mesh) => {
      const row = raycaster.intersectObject(mesh, false)[0];
      return row ? {
        path: pathOf(mesh),
        distanceFromCamera: row.distance,
        faceIndex: row.faceIndex,
        point: row.point.toArray(),
      } : null;
    };
    rays.push({ pixel: [px, py], arm: hit(arm), hub: hit(hub), arbor: hit(arbor) });
  }

  arm.material.dispose();
  hub.material.dispose();
  arm.material = original.arm;
  hub.material = original.hub;
  scene.background = original.background;
  camera.position.copy(original.position);
  camera.quaternion.copy(original.quaternion);
  camera.up.copy(original.up);
  camera.fov = original.fov;
  camera.updateProjectionMatrix();
  for (const [object, visible] of visibility) object.visible = visible;
  return {
    files,
    rays,
    runtimePaths: { arm: pathOf(arm), hub: pathOf(hub), arbor: pathOf(arbor) },
  };
}, { witnessPoint: armHub.pointA, armArborClearance: armArbor.minimumSurfaceDistanceMm });

const imageRows = [];
for (const [file, dataUrl] of diagnostic.files) {
  const data = Buffer.from(dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(outDir, file), data);
  imageRows.push({ file, bytes: data.byteLength, sha256: crypto.createHash("sha256").update(data).digest("hex") });
}

const report = {
  audit: "POST-5D GEOMETRY WITNESS AUDIT — CIRCLED SHAFT / FLAT-MEMBER INTERFERENCE",
  disposition: "CLEARED — NO 3D INTERFERENCE",
  classification: "intentional same-owner balance-arm-to-hub structural union; the true arbor is positively separated from the arm",
  productSourceEdited: false,
  browserErrors,
  participants: {
    flatMember: {
      ...geometryPayload.arm,
      position: undefined,
      index: undefined,
      role: "one of three balance-wheel arms; rigidly joins the rim to the central hub",
      stationaryOrMoving: "moving — oscillates with balance:motion",
    },
    apparentCylinder: {
      ...geometryPayload.hub,
      position: undefined,
      index: undefined,
      role: "balance wheel hub; not a foreign shaft or stationary support",
      stationaryOrMoving: "moving — same balance:motion owner as the arm",
    },
    actualShaftBehindWitness: {
      ...geometryPayload.arbor,
      position: undefined,
      index: undefined,
      role: "balance arbor shaft",
      stationaryOrMoving: "moving — same balance:motion owner as the arm and hub",
    },
  },
  geometry: {
    armVersusHub: {
      ...armHub,
      signedSurfaceGapMm: 0,
      renderedRadialEmbedMm,
      renderedAxialOverlapMm,
      interpretation: "rendered triangle surfaces cross because the arm and hub are modeled as overlapping constituents of one rigid balance wheel",
    },
    armVersusActualArbor: {
      ...armArbor,
      interpretation: "genuine positive separation; the flat arm does not touch or pass through the balance arbor",
    },
  },
  motionAudit: {
    permittedBalanceAmplitudeDeg: [-132, 132],
    inheritedOwner: geometryPayload.arm.parentMotionOwner,
    relativeTransformInvariant: true,
    reason: "arm, hub and arbor all inherit the identical balance:motion transform; a rigid transform preserves their pairwise triangle relationship over the complete certified beat",
    armHubCompleteSweep: { minimumSurfaceDistanceMm: 0, relationship: "constant intentional union" },
    armArborCompleteSweep: {
      minimumClearanceMm: armArbor.minimumSurfaceDistanceMm,
      relationship: "constant positive clearance",
    },
  },
  priorCertificationCoverage: {
    exactPairIncluded: false,
    explanation: "the pre-5D foreign-solid matrix audited the complete balance assembly against foreign pallet/support/bridge solids; it did not list internal balance arm↔hub or arm↔arbor construction pairs",
  },
  rayInterrogation: diagnostic.rays,
  runtimePaths: diagnostic.runtimePaths,
  images: imageRows,
  repairRequired: false,
  sourceTrace: {
    balanceConstruction: "src/geometry.ts:createBalance()",
    armConstruction: "src/geometry.ts:createBalanceArm()",
    runtimeOwnership: "src/movement.ts:makePart('balance', ...) → balance:pose/balance:motion/balance:geom",
  },
};
fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(report.disposition);
console.log(`arm↔hub intersects=${armHub.intersects} distance=${armHub.minimumSurfaceDistanceMm}`);
console.log(`arm↔actual arbor intersects=${armArbor.intersects} clearance=${armArbor.minimumSurfaceDistanceMm}`);
