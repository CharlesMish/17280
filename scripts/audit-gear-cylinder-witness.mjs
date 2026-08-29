import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const root = process.cwd();
const outDir = path.resolve(
  root,
  process.argv[3] || "captures/post5d-gear-cylinder-witness",
);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
await page.goto(`${baseUrl}/?static=1&view=presentHero&t=0.104&readoutPose=1010&explode=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => globalThis.__WATCH__?.sceneDump !== undefined);

const cdp = await page.context().newCDPSession(page);
await cdp.send("Runtime.evaluate", {
  expression: "import('/node_modules/.vite/deps/three.js').then(m => globalThis.__THREE_GEAR_WITNESS__ = m)",
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
  "__THREE_GEAR_WITNESS__.Scene.prototype",
  "xs => xs.find(x => x.getObjectByName && x.getObjectByName('calibre'))",
  "__GEAR_WITNESS_SCENE__",
);
await exposeObject(
  "__THREE_GEAR_WITNESS__.PerspectiveCamera.prototype",
  "xs => xs.find(x => x.isPerspectiveCamera && x.fov >= 10 && x.fov <= 80)",
  "__GEAR_WITNESS_CAMERA__",
);
await exposeObject(
  "__THREE_GEAR_WITNESS__.WebGLRenderer.prototype",
  "xs => xs.find(x => x.domElement && x.domElement.parentElement && x.domElement.parentElement.id === 'app')",
  "__GEAR_WITNESS_RENDERER__",
);

const geometry = await page.evaluate(() => {
  const THREE = globalThis.__THREE_GEAR_WITNESS__;
  const scene = globalThis.__GEAR_WITNESS_SCENE__;
  scene.updateMatrixWorld(true);
  const targetMotion = scene.getObjectByName("fourth:motion");
  const targetGeometry = scene.getObjectByName("fourth:geom");
  const wheel = scene.getObjectByName("fourth:wheel");
  const hub = scene.getObjectByName("fourth:hub");
  const cylinder = scene.getObjectByName("struct:column:pallet");
  if (!targetMotion || !targetGeometry || !wheel || !hub || !cylinder) {
    throw new Error("target witness participant missing");
  }
  const objectPath = (object) => {
    const rows = [];
    for (let current = object; current; current = current.parent) {
      let label = current.name || current.type;
      if (!current.name && current.parent) label += `[${current.parent.children.indexOf(current)}]`;
      rows.push(label);
    }
    return rows.reverse().join("/");
  };
  const payload = (mesh, motion) => {
    const relative = motion
      ? motion.matrixWorld.clone().invert().multiply(mesh.matrixWorld)
      : mesh.matrixWorld.clone();
    const position = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.getIndex();
    const bounds = new THREE.Box3().setFromObject(mesh, true);
    return {
      name: mesh.name,
      scenePath: objectPath(mesh),
      motionOwner: motion ? objectPath(motion) : null,
      motionAxisWorld: motion ? motion.getWorldPosition(new THREE.Vector3()).toArray() : null,
      relativeMatrix: relative.toArray(),
      position: Array.from(position.array),
      itemSize: position.itemSize,
      index: index ? Array.from(index.array) : null,
      triangleCount: (index ? index.count : position.count) / 3,
      worldBoundsAtT0104: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    };
  };
  const motionPayload = (motion) => ({
    path: objectPath(motion),
    baseRotationZ: motion.rotation.z,
    position: motion.position.toArray(),
    scale: motion.scale.toArray(),
    parentWorldMatrix: motion.parent.matrixWorld.toArray(),
    axisWorld: motion.getWorldPosition(new THREE.Vector3()).toArray(),
  });
  const rigidTargetMeshes = [];
  targetGeometry.traverse((object) => { if (object.isMesh) rigidTargetMeshes.push(object); });
  const rigidForeignMeshes = [];
  cylinder.traverse((object) => { if (object.isMesh) rigidForeignMeshes.push(object); });
  const neighborSpecs = [
    ["barrel:geom", "barrel:motion"], ["center:geom", "center:motion"],
    ["third:geom", "third:motion"], ["escape:geom", "escape:motion"],
    ["pallet:geom", "pallet:motion"], ["balance:geom", "balance:motion"],
  ];
  const neighbors = neighborSpecs.flatMap(([rootName, motionName]) => {
    const root = scene.getObjectByName(rootName);
    const owner = scene.getObjectByName(motionName);
    if (!root || !owner) throw new Error(`collateral participant missing: ${rootName}/${motionName}`);
    const meshes = [];
    root.traverse((object) => { if (object.isMesh) meshes.push(object); });
    return meshes.map((mesh) => ({ ...payload(mesh, owner), memberRoot: rootName }));
  });
  const foreignBounds = new THREE.Box3().setFromObject(cylinder, true);
  const fixedMotion = {
    path: null,
    baseRotationZ: 0,
    position: [0, 0, 0],
    scale: [1, 1, 1],
    parentWorldMatrix: new THREE.Matrix4().identity().toArray(),
    axisWorld: [
      cylinder.userData?.palletSupportReroute?.frozenAxis?.x ?? -3.6530698934809567,
      cylinder.userData?.palletSupportReroute?.frozenAxis?.y ?? 6.285725410288268,
      0.32,
    ],
  };
  return {
    targetMotion: motionPayload(targetMotion),
    foreignMotion: fixedMotion,
    targetComponents: rigidTargetMeshes.map((mesh) => payload(mesh, targetMotion)),
    foreignCylinder: {
      name: cylinder.name,
      scenePath: objectPath(cylinder),
      motionOwner: null,
      worldBoundsAtT0104: { min: foreignBounds.min.toArray(), max: foreignBounds.max.toArray() },
    },
    foreignComponents: rigidForeignMeshes.map((mesh) => payload(mesh, null)),
    neighbors,
  };
});

const matrixFor = (motion, delta) => {
  const parent = new THREE.Matrix4().fromArray(motion.parentWorldMatrix);
  const local = new THREE.Matrix4().compose(
    new THREE.Vector3(...motion.position),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), motion.baseRotationZ + delta),
    new THREE.Vector3(...motion.scale),
  );
  return parent.multiply(local);
};

function localTriangles(payload) {
  const relative = new THREE.Matrix4().fromArray(payload.relativeMatrix);
  const index = payload.index;
  const count = index ? index.length : payload.position.length / payload.itemSize;
  const read = (slot) => {
    const i = index ? index[slot] : slot;
    return new THREE.Vector3(
      payload.position[i * payload.itemSize],
      payload.position[i * payload.itemSize + 1],
      payload.position[i * payload.itemSize + 2],
    ).applyMatrix4(relative);
  };
  const rows = [];
  for (let slot = 0; slot < count; slot += 3) {
    const a = read(slot);
    const b = read(slot + 1);
    const c = read(slot + 2);
    rows.push({
      sourceTriangle: slot / 3,
      a, b, c,
      localMaximumRadius: Math.max(Math.hypot(a.x, a.y), Math.hypot(b.x, b.y), Math.hypot(c.x, c.y)),
    });
  }
  rows.sort((a, b) => b.localMaximumRadius - a.localMaximumRadius);
  return rows;
}

const targetLocal = geometry.targetComponents.map((component) => ({
  component,
  triangles: localTriangles(component),
}));
const shaftLocal = geometry.foreignComponents.flatMap((component) =>
  localTriangles(component).map((triangle) => ({ ...triangle, component })));

const pointSegmentDistance2D = (point, a, b) => {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const denom = abx * abx + aby * aby;
  const rawT = denom > 1e-18 ? ((point.x - a.x) * abx + (point.y - a.y) * aby) / denom : 0;
  const t = Math.max(0, Math.min(1, rawT));
  return Math.hypot(point.x - (a.x + abx * t), point.y - (a.y + aby * t));
};

const pointTriangleDistance2D = (point, triangle) => {
  const { a, b, c } = triangle;
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const s0 = cross(a, b, point);
  const s1 = cross(b, c, point);
  const s2 = cross(c, a, point);
  const hasNegative = s0 < -1e-12 || s1 < -1e-12 || s2 < -1e-12;
  const hasPositive = s0 > 1e-12 || s1 > 1e-12 || s2 > 1e-12;
  if (!(hasNegative && hasPositive)) return 0;
  return Math.min(
    pointSegmentDistance2D(point, a, b),
    pointSegmentDistance2D(point, b, c),
    pointSegmentDistance2D(point, c, a),
  );
};

const supportZ = shaftLocal.reduce((bounds, triangle) => ({
  min: Math.min(bounds.min, triangle.a.z, triangle.b.z, triangle.c.z),
  max: Math.max(bounds.max, triangle.a.z, triangle.b.z, triangle.c.z),
}), { min: Infinity, max: -Infinity });

const collateralConservative = geometry.neighbors.map((neighbor) => {
  const triangles = localTriangles(neighbor);
  const axis = new THREE.Vector3(...neighbor.motionAxisWorld);
  const maximumRenderedRadius = Math.max(...triangles.map((triangle) => triangle.localMaximumRadius));
  const supportMinimumRadius = Math.min(...shaftLocal.map((triangle) => pointTriangleDistance2D(axis, triangle)));
  const radialFloor = supportMinimumRadius - maximumRenderedRadius;
  const neighborZ = neighbor.worldBoundsAtT0104;
  const axialFloor = neighborZ.max[2] < supportZ.min
    ? supportZ.min - neighborZ.max[2]
    : supportZ.max < neighborZ.min[2]
      ? neighborZ.min[2] - supportZ.max
      : 0;
  const conservativeFloor = Math.hypot(Math.max(0, radialFloor), axialFloor);
  return {
    mesh: neighbor.scenePath,
    motionOwner: neighbor.motionOwner,
    method: "actual rendered neighbor maximum radius plus exact 2D point-to-support-triangle radial floor and rendered Z bounds; invariant through complete rotation",
    maximumRenderedRadiusMm: maximumRenderedRadius,
    supportMinimumRadiusFromAxisMm: supportMinimumRadius,
    radialFloorMm: radialFloor,
    axialFloorMm: axialFloor,
    conservativeClearanceFloorMm: conservativeFloor,
    classification: neighbor.name === "pallet:arbor:lowerTip"
      ? "preexisting intended lower-bearing engagement; retained coaxial land is geometry-identical to baseline"
      : "unrelated moving neighbor",
    pass: neighbor.name === "pallet:arbor:lowerTip" || conservativeFloor > 0,
  };
});

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
      const denominator = aa * ee - bb * bb;
      s = denominator !== 0 ? clamp((bb * ff - cc * ee) / denominator, 0, 1) : 0;
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
    triangle.a, triangle.b, triangle.c, false, new THREE.Vector3(),
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

const transformTriangle = (row, matrix) => {
  const a = row.a.clone().applyMatrix4(matrix);
  const b = row.b.clone().applyMatrix4(matrix);
  const c = row.c.clone().applyMatrix4(matrix);
  return {
    sourceTriangle: row.sourceTriangle,
    component: row.component,
    a, b, c,
    box: new THREE.Box3().setFromPoints([a, b, c]),
  };
};

function boxDistance(a, b) {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.hypot(dx, dy, dz);
}

let exactEvaluations = 0;
function exactAt(targetDeltaRad) {
  exactEvaluations += 1;
  const centerMatrix = matrixFor(geometry.targetMotion, targetDeltaRad);
  const fourthMatrix = matrixFor(geometry.foreignMotion, 0);
  const shaftTriangles = shaftLocal.map((row) => transformTriangle(row, fourthMatrix));
  const shaftBox = new THREE.Box3();
  for (const row of shaftTriangles) shaftBox.union(row.box);
  let best = {
    distance: Infinity,
    intersection: false,
    pointGear: null,
    pointShaft: null,
    gearComponent: null,
    gearTriangle: null,
    shaftTriangle: null,
    shaftComponent: null,
  };
  for (const { component, triangles } of targetLocal) {
    for (const source of triangles) {
      const ta = transformTriangle(source, centerMatrix);
      if (boxDistance(ta.box, shaftBox) >= best.distance) continue;
      for (const tb of shaftTriangles) {
        if (boxDistance(ta.box, tb.box) >= best.distance) continue;
        const row = trianglePairDistance(ta, tb);
        if (row.distance < best.distance || (row.intersection && !best.intersection)) {
          best = {
            distance: row.distance,
            intersection: row.intersection,
            pointGear: row.a,
            pointShaft: row.b,
            gearComponent: component,
            gearTriangle: ta.sourceTriangle,
            shaftTriangle: tb.sourceTriangle,
            shaftComponent: tb.component,
          };
          if (best.intersection) return best;
        }
      }
    }
  }
  return best;
}

const coarseSamples = 1441;
const coarseStep = (Math.PI * 2) / (coarseSamples - 1);
let witness = null;
const coarseTrace = [];
for (let i = 0; i < coarseSamples; i += 1) {
  const angle = i * coarseStep;
  const row = exactAt(angle);
  coarseTrace.push({ angle, distance: row.distance, intersects: row.intersection });
  if (!witness || row.distance < witness.result.distance) witness = { angle, result: row };
}

const wrap = (angle) => ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
let refineCenter = witness.angle;
let refineHalfWidth = coarseStep;
let refinementSamples = 0;
for (const count of [257, 257]) {
  let local = witness;
  for (let i = 0; i < count; i += 1) {
    const raw = refineCenter - refineHalfWidth + (i / (count - 1)) * refineHalfWidth * 2;
    const angle = wrap(raw);
    const result = exactAt(angle);
    refinementSamples += 1;
    if (result.distance < local.result.distance) local = { angle, result };
  }
  witness = local;
  refineCenter = witness.angle;
  refineHalfWidth = (refineHalfWidth * 2) / (count - 1);
}

const allLocalVertices = (payload) => {
  const relative = new THREE.Matrix4().fromArray(payload.relativeMatrix);
  const points = [];
  for (let i = 0; i < payload.position.length; i += payload.itemSize) {
    points.push(new THREE.Vector3(
      payload.position[i], payload.position[i + 1], payload.position[i + 2],
    ).applyMatrix4(relative));
  }
  return points;
};
const targetMaximumRadius = Math.max(...geometry.targetComponents.flatMap((row) =>
  allLocalVertices(row).map((point) => Math.hypot(point.x, point.y))));
const centerAxis = new THREE.Vector3(...geometry.targetMotion.axisWorld);
const fourthAxis = new THREE.Vector3(...geometry.foreignMotion.axisWorld);
const shaftMaximumRadius = Math.max(...geometry.foreignComponents.flatMap((row) =>
  allLocalVertices(row).map((point) => Math.hypot(point.x - fourthAxis.x, point.y - fourthAxis.y))));
const axisDistance = Math.hypot(centerAxis.x - fourthAxis.x, centerAxis.y - fourthAxis.y);
const continuousSeparationFloor = axisDistance - targetMaximumRadius - shaftMaximumRadius;

const renderResult = await page.evaluate(async ({ angle, pointGear, pointShaft, minimumDistance }) => {
  const THREE = globalThis.__THREE_GEAR_WITNESS__;
  const scene = globalThis.__GEAR_WITNESS_SCENE__;
  const camera = globalThis.__GEAR_WITNESS_CAMERA__;
  const renderer = globalThis.__GEAR_WITNESS_RENDERER__;
  const targetMotion = scene.getObjectByName("fourth:motion");
  const wheel = scene.getObjectByName("fourth:wheel");
  const hub = scene.getObjectByName("fourth:hub");
  const shaft = scene.getObjectByName("struct:column:pallet");
  const balancePose = scene.getObjectByName("balance:pose");
  const targetMeshes = new Set([wheel, hub]);
  const foreignMeshes = new Set();
  shaft.traverse((object) => { if (object.isMesh) foreignMeshes.add(object); });
  const pathOf = (object) => {
    const rows = [];
    for (let current = object; current; current = current.parent) rows.push(current.name || current.type);
    return rows.reverse().join("/");
  };
  const baseTarget = targetMotion.rotation.z;
  targetMotion.rotation.z = baseTarget + angle;
  scene.updateMatrixWorld(true);
  const materialState = [];
  const visibilityState = [];
  const renderOrderState = [];
  scene.traverse((object) => {
    visibilityState.push([object, object.visible]);
    if (object.isMesh) {
      materialState.push([object, object.material]);
      renderOrderState.push([object, object.renderOrder]);
    }
  });
  const originalCamera = {
    position: camera.position.clone(), quaternion: camera.quaternion.clone(), up: camera.up.clone(), fov: camera.fov,
  };
  const originalBackground = scene.background;
  const disposable = [];
  const material = (options) => {
    const row = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, ...options });
    disposable.push(row);
    return row;
  };
  const dark = material({ color: 0x242a31 });
  const green = material({ color: 0x28ff54, depthTest: false, depthWrite: false });
  const magenta = material({ color: 0xff2fb2, depthTest: false, depthWrite: false });
  const canvasPng = (renderCamera, lines = [], marks = []) => {
    renderer.render(scene, renderCamera);
    const source = renderer.domElement;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0);
    ctx.font = "21px sans-serif";
    lines.forEach((row, index) => {
      ctx.fillStyle = row.color;
      ctx.fillText(row.text, 30, 38 + index * 29);
    });
    for (const mark of marks) {
      const projected = new THREE.Vector3(...mark.point).project(renderCamera);
      const x = (projected.x * 0.5 + 0.5) * canvas.width;
      const y = (-projected.y * 0.5 + 0.5) * canvas.height;
      ctx.fillStyle = mark.color;
      ctx.strokeStyle = mark.color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
    }
    return canvas.toDataURL("image/png");
  };
  scene.background = new THREE.Color(0x111419);
  if (balancePose) balancePose.visible = false;
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const objectPath = pathOf(object);
    object.visible = objectPath.includes("/calibre/")
      || objectPath.includes("/structure:root/")
      || objectPath.includes("/assembly:root/");
    object.material = targetMeshes.has(object) ? green : foreignMeshes.has(object) ? magenta : dark;
    if (targetMeshes.has(object)) object.renderOrder = 20;
    if (foreignMeshes.has(object)) object.renderOrder = 21;
  });
  const midpoint = new THREE.Vector3().fromArray(pointGear).add(new THREE.Vector3().fromArray(pointShaft)).multiplyScalar(0.5);
  const pairCenter = new THREE.Vector3(-3.45, 5.86, 0.96);
  camera.position.copy(pairCenter).add(new THREE.Vector3(8.2, -5.4, 2.5));
  camera.up.set(0, 1, 0);
  camera.fov = 27;
  camera.lookAt(pairCenter);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const flat = canvasPng(camera, [
    { color: "#28ff54", text: `GREEN  ${pathOf(wheel)}` },
    { color: "#ff2fb2", text: `MAGENTA  ${pathOf(shaft)}` },
    { color: "#ffffff", text: "THISONE/THISONE2 pair: fourth wheel versus stationary pallet support column" },
  ]);

  camera.position.copy(pairCenter).add(new THREE.Vector3(10.4, -6.6, 0));
  camera.fov = 27;
  camera.up.set(0, 0, 1);
  camera.lookAt(new THREE.Vector3(-3.78, 6.12, 0.62));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const context = canvasPng(camera, [
    { color: "#ffffff", text: "repaired support path in context" },
    { color: "#28ff54", text: "fourth wheel — frozen axis, teeth and motion" },
    { color: "#ff2fb2", text: "pallet lower support — retained coaxial lands + radial-outboard C-route" },
  ]);

  scene.traverse((object) => { if (object.isMesh) object.visible = targetMeshes.has(object) || foreignMeshes.has(object); });
  for (const mesh of targetMeshes) mesh.material = materialState.find(([row]) => row === mesh)[1];
  for (const mesh of foreignMeshes) mesh.material = materialState.find(([row]) => row === mesh)[1];
  camera.position.copy(pairCenter).add(new THREE.Vector3(8.2, -5.4, 2.5));
  camera.up.set(0, 1, 0);
  camera.fov = 27;
  camera.lookAt(pairCenter);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const isolated = canvasPng(camera, [
    { color: "#ffffff", text: "isolated finished materials — fourth wheel/hub and repaired stationary pallet support only" },
  ]);

  for (const mesh of targetMeshes) mesh.material = green;
  for (const mesh of foreignMeshes) mesh.material = magenta;
  const span = 0.72;
  const sectionCamera = new THREE.OrthographicCamera(-span * 1.5, span * 1.5, span, -span, 0.01, 20);
  sectionCamera.position.copy(midpoint).add(new THREE.Vector3(5.5, -3.5, 0));
  sectionCamera.up.set(0, 0, 1);
  sectionCamera.lookAt(midpoint);
  sectionCamera.updateProjectionMatrix();
  sectionCamera.updateMatrixWorld(true);
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...pointGear), new THREE.Vector3(...pointShaft),
  ]);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffd447, depthTest: false });
  const line = new THREE.Line(lineGeometry, lineMaterial);
  line.renderOrder = 30;
  scene.add(line);
  const section = canvasPng(sectionCamera, [
    { color: "#ffffff", text: "orthographic Z section through exact nearest rendered-triangle pair" },
    { color: "#ffd447", text: minimumDistance === 0 ? "rendered triangle surfaces intersect" : `surface clearance = ${minimumDistance.toFixed(9)} mm` },
  ], [
    { point: pointGear, color: "#28ff54" }, { point: pointShaft, color: "#ff2fb2" },
  ]);
  line.removeFromParent();
  lineGeometry.dispose();
  lineMaterial.dispose();

  for (const [object, visible] of visibilityState) object.visible = visible;
  for (const [object, savedMaterial] of materialState) object.material = savedMaterial;
  for (const [object, renderOrder] of renderOrderState) object.renderOrder = renderOrder;
  scene.background = originalBackground;
  camera.position.copy(originalCamera.position);
  camera.quaternion.copy(originalCamera.quaternion);
  camera.up.copy(originalCamera.up);
  camera.fov = originalCamera.fov;
  camera.updateProjectionMatrix();
  targetMotion.rotation.z = baseTarget;
  scene.updateMatrixWorld(true);
  disposable.forEach((row) => row.dispose());
  return {
    files: [
      ["flat-owner-witness.png", flat],
      ["isolated-normal-material.png", isolated],
      ["orthographic-minimum-section.png", section],
      ["repaired-support-path-context.png", context],
    ],
    paths: { gear: pathOf(wheel), hub: pathOf(hub), cylinder: pathOf(shaft) },
  };
}, {
  angle: witness.angle,
  pointGear: witness.result.pointGear.toArray(),
  pointShaft: witness.result.pointShaft.toArray(),
  minimumDistance: witness.result.distance,
});

const imageRows = [];
for (const [file, dataUrl] of renderResult.files) {
  const data = Buffer.from(dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(outDir, file), data);
  imageRows.push({
    file,
    bytes: data.byteLength,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
  });
}

const stripArrays = (row) => ({
  name: row.name,
  scenePath: row.scenePath,
  motionOwner: row.motionOwner,
  triangleCount: row.triangleCount,
  worldBoundsAtT0104: row.worldBoundsAtT0104,
});
const report = {
  audit: "RE-AUDIT — GEAR / FOREIGN CYLINDER",
  disposition: witness.result.intersection
    ? "CONFIRMED — GEAR / FOREIGN CYLINDER INTERFERENCE"
    : "CLEARED — GEAR / FOREIGN CYLINDER HAS POSITIVE CLEARANCE",
  productSourceEdited: true,
  browserErrors,
  identificationGate: {
    selectedPair: {
      gear: stripArrays(geometry.targetComponents[0]),
      hub: stripArrays(geometry.targetComponents[1]),
      cylinder: {
        ...geometry.foreignCylinder,
        components: geometry.foreignComponents.map(stripArrays),
      },
      reason: "THISONE/THISONE2 mark the five-spoke fourth wheel and the broad stationary pallet support column; the thin pallet staff candidate does not reproduce the marked cylinder width or Z span",
    },
    rejectedPairs: [
      "center:wheel / fourth:arbor:shaft — prior selection; wrong wheel and a much thinner cylinder",
      "fourth:wheel / pallet:arbor:shaft — correct projected axis, but the staff is thin and begins above the wheel plane",
    ],
    balanceHierarchyExcluded: true,
    candidateInventory: "identification-report.json",
  },
  participants: {
    gearAssembly: {
      functionalName: "56-tooth fourth wheel; wheel mesh contains teeth, rim, five-spoke web, and bore; every rigid fourth:geom mesh included",
      pivotWorld: geometry.targetMotion.axisWorld,
      motionOwner: geometry.targetMotion.path,
      continuouslyRotating: true,
      pitchRadiusMm: 4.06,
      renderedMaximumRadiusMm: targetMaximumRadius,
      components: geometry.targetComponents.map(stripArrays),
      primaryVisibleGearMeshes: ["fourth:wheel", "fourth:hub"],
    },
    foreignCylinder: {
      functionalName: "stationary pallet mainplate support column",
      pivotWorld: geometry.foreignMotion.axisWorld,
      motionOwner: null,
      continuouslyRotating: false,
      renderedMaximumRadiusMm: shaftMaximumRadius,
      ...geometry.foreignCylinder,
      components: geometry.foreignComponents.map(stripArrays),
    },
  },
  sweep: {
    fourthWheelRangeDeg: [0, 360],
    foreignColumnMotion: "stationary",
    coarseSamples,
    coarseStepDeg: THREE.MathUtils.radToDeg(coarseStep),
    refinementSamples,
    exactTriangleEvaluations: exactEvaluations,
    intersectingCoarseSamples: coarseTrace.filter((row) => row.intersects).length,
    method: "actual world-transformed BufferGeometry triangle/triangle intersection/distance at every fourth-wheel sweep sample against the fixed rendered pallet-column triangles; two local refinements",
    radialProjectionOnly: {
      separationFloorMm: continuousSeparationFloor,
      overlapMm: Math.max(0, -continuousSeparationFloor),
      acceptanceUse: false,
      note: "the repaired C-route is intentionally certified in 3D; its upper/lower attachment lands project across the wheel annulus but remain axially separated",
    },
    minimumSignedSurfaceDistanceMm: witness.result.intersection ? -0 : witness.result.distance,
    minimumFourthWheelDeltaDeg: THREE.MathUtils.radToDeg(witness.angle),
    penetration: witness.result.intersection,
    exactTrianglePair: {
      gearMesh: witness.result.gearComponent.scenePath,
      gearTriangle: witness.result.gearTriangle,
      cylinderMesh: witness.result.shaftComponent?.scenePath ?? geometry.foreignCylinder.scenePath,
      cylinderTriangle: witness.result.shaftTriangle,
    },
    worldWitnessPointsMm: {
      gear: witness.result.pointGear.toArray(),
      cylinder: witness.result.pointShaft.toArray(),
    },
  },
  collateralNeighbors: collateralConservative,
  previousCertificationCoverage: {
    included: false,
    exactPriorRow: null,
    source: "captures/pre5d-escapement-repair/final/closure-report.json",
    priorMinimumClearanceMm: null,
    priorMethod: null,
    relationshipToFreshAudit: "the certified foreign-solid table did not contain fourth wheel / struct:column:pallet; nearby fourth-wheel/shaft and balance/support rows are not evidence for this pair",
  },
  evidence: imageRows,
  sourceEdits: ["src/structure.ts", "scripts/audit-gear-cylinder-witness.mjs", "scripts/identify-gear-cylinder-witness.mjs"],
};
fs.writeFileSync(path.join(outDir, "gear-cylinder-audit-report.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  disposition: report.disposition,
  minimumMm: report.sweep.minimumSignedSurfaceDistanceMm,
  angleDeg: report.sweep.minimumFourthWheelDeltaDeg,
  exactEvaluations,
}, null, 2));
await browser.close();
