import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";

const outPath = path.resolve(
  process.argv[2] || "captures/post5d-overnight-audit/regression/stembar-balance-exact.json",
);
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
const movingKind = process.argv[4] || "balance";
const excludeMovingArbor = process.argv[5] === "exclude-arbor";
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.setDefaultTimeout(300000);
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
await page.goto(`${baseUrl}/?static=1&view=presentHero&t=0.104&readoutPose=1010&explode=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => typeof globalThis.__WATCH__?.sceneDump === "function");

const cdp = await page.context().newCDPSession(page);
await cdp.send("Runtime.evaluate", {
  expression: "import('/node_modules/.vite/deps/three.js').then(m => globalThis.__THREE_EXACT_OVERNIGHT__ = m)",
  awaitPromise: true,
});
const prototype = await cdp.send("Runtime.evaluate", { expression: "__THREE_EXACT_OVERNIGHT__.Scene.prototype" });
const instances = await cdp.send("Runtime.queryObjects", { prototypeObjectId: prototype.result.objectId });
await cdp.send("Runtime.callFunctionOn", {
  objectId: instances.objects.objectId,
  functionDeclaration: "function(){ globalThis.__EXACT_OVERNIGHT_SCENE__ = this.find(x => x.getObjectByName && x.getObjectByName('calibre')); }",
});

const geometry = await page.evaluate(({ movingKind, excludeMovingArbor }) => {
  const THREE = globalThis.__THREE_EXACT_OVERNIGHT__;
  const scene = globalThis.__EXACT_OVERNIGHT_SCENE__;
  scene.updateMatrixWorld(true);
  const stem = scene.getObjectByName("struct:escapeFinger:stemBar");
  const balanceGeom = scene.getObjectByName(`${movingKind}:geom`);
  const balanceMotion = scene.getObjectByName(`${movingKind}:motion`);
  if (!stem || !balanceGeom || !balanceMotion) throw new Error("exact balance witness participant missing");
  const objectPath = (object) => {
    const rows = [];
    for (let current = object; current; current = current.parent) {
      let label = current.name || current.type;
      if (!current.name && current.parent) label += `[${current.parent.children.indexOf(current)}]`;
      rows.push(label);
    }
    return rows.reverse().join("/");
  };
  const payload = (mesh, owner) => {
    const relative = owner
      ? owner.matrixWorld.clone().invert().multiply(mesh.matrixWorld)
      : mesh.matrixWorld.clone();
    const position = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.getIndex();
    return {
      path: objectPath(mesh),
      relativeMatrix: relative.toArray(),
      position: Array.from(position.array),
      itemSize: position.itemSize,
      index: index ? Array.from(index.array) : null,
    };
  };
  const balanceMeshes = [];
  balanceGeom.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    if (excludeMovingArbor && objectPath(object).includes(":arbor")) return;
    balanceMeshes.push(payload(object, balanceMotion));
  });
  const stationarySupportMeshes = [];
  scene.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    const path = objectPath(object);
    if (
      path.includes("/escapeFinger/") ||
      path.includes("/anchor:escape/") ||
      path.includes("/assembly:bearing:escape:upper/") ||
      path.includes("/assembly:bearing:pallet:upper/") ||
      path.includes("/assembly:anchor:escape:screw/")
    ) stationarySupportMeshes.push(payload(object, null));
  });
  return {
    stem: payload(stem, null),
    stemMetadata: stem.userData.junctionTenon,
    underpassMetadata: stem.userData.balanceUnderpass,
    balanceMeshes,
    stationarySupportMeshes,
    balanceMotion: {
      path: objectPath(balanceMotion),
      position: balanceMotion.position.toArray(),
      scale: balanceMotion.scale.toArray(),
      parentWorldMatrix: balanceMotion.parent.matrixWorld.toArray(),
    },
    layoutPositions: globalThis.__WATCH__.escapementRepairReport().layout.positions,
    escapeAnchor: globalThis.__WATCH__.structureReport().feet.find((row) => row.id === "anchor:escape").rendered,
    certifiedBeat: globalThis.__WATCH__.escapementRepairReport().completeBeat,
  };
}, { movingKind, excludeMovingArbor });
await browser.close();

const triangles = (payload) => {
  const relative = new THREE.Matrix4().fromArray(payload.relativeMatrix);
  const index = payload.index;
  const count = index ? index.length : payload.position.length / payload.itemSize;
  const read = (slot) => {
    const vertex = index ? index[slot] : slot;
    return new THREE.Vector3(
      payload.position[vertex * payload.itemSize],
      payload.position[vertex * payload.itemSize + 1],
      payload.position[vertex * payload.itemSize + 2],
    ).applyMatrix4(relative);
  };
  const rows = [];
  for (let slot = 0; slot < count; slot += 3) {
    const a = read(slot);
    const b = read(slot + 1);
    const c = read(slot + 2);
    rows.push({
      sourceTriangle: slot / 3,
      component: payload.path,
      a, b, c,
      box: new THREE.Box3().setFromPoints([a, b, c]),
    });
  }
  return rows;
};

const fixedTriangles = triangles(geometry.stem);
const movingTriangles = geometry.balanceMeshes.flatMap(triangles);

const unionBox = (rows) => {
  const result = new THREE.Box3();
  for (const row of rows) result.union(row.box);
  return result;
};
const boxDistance = (a, b) => {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.hypot(dx, dy, dz);
};
const buildTree = (rows, depth = 0) => {
  const box = unionBox(rows);
  if (rows.length <= 8) return { box, rows, left: null, right: null };
  const size = box.getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y" : "z";
  rows.sort((a, b) => a.box.getCenter(new THREE.Vector3())[axis] - b.box.getCenter(new THREE.Vector3())[axis]);
  const middle = Math.floor(rows.length / 2);
  return {
    box,
    rows: null,
    left: buildTree(rows.slice(0, middle), depth + 1),
    right: buildTree(rows.slice(middle), depth + 1),
  };
};
const fixedTree = buildTree([...fixedTriangles]);
const escapePosition = geometry.layoutPositions.escape;
const palletPosition = geometry.layoutPositions.pallet;
const mid = {
  x: (escapePosition.x + palletPosition.x) * 0.5,
  y: (escapePosition.y + palletPosition.y) * 0.5,
};
const join = {
  x: mid.x * 0.62 + geometry.escapeAnchor.x * 0.38,
  y: mid.y * 0.62 + geometry.escapeAnchor.y * 0.38,
};
const joinToEscape = {
  x: escapePosition.x - join.x,
  y: escapePosition.y - join.y,
};
const joinToEscapeLength = Math.hypot(joinToEscape.x, joinToEscape.y);
const tenonEnd = {
  x: join.x + (joinToEscape.x / joinToEscapeLength) * geometry.stemMetadata.length,
  y: join.y + (joinToEscape.y / joinToEscapeLength) * geometry.stemMetadata.length,
};
// This AABB intentionally overbounds the entire added wedge: it uses the old
// stem's 0.22 mm join half-width at both ends, although the new terminal is
// only 0.10 mm.  A second 0.10 mm expansion certifies the general gate.
const tenonEnvelope = new THREE.Box3(
  new THREE.Vector3(
    Math.min(join.x, tenonEnd.x) - 0.22,
    Math.min(join.y, tenonEnd.y) - 0.22,
    fixedTree.box.min.z,
  ),
  new THREE.Vector3(
    Math.max(join.x, tenonEnd.x) + 0.22,
    Math.max(join.y, tenonEnd.y) + 0.22,
    fixedTree.box.max.z,
  ),
);
const tenonGateEnvelope = tenonEnvelope.clone().expandByScalar(0.1);

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
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
  const a = a0.clone().addScaledVector(d1, s);
  const b = b0.clone().addScaledVector(d2, t);
  return { a, b, distance: a.distanceTo(b) };
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
function trianglePairDistance(a, b) {
  const aEdges = [[a.a, a.b], [a.b, a.c], [a.c, a.a]];
  const bEdges = [[b.a, b.b], [b.b, b.c], [b.c, b.a]];
  for (const edge of aEdges) {
    const point = segmentTriangle(edge[0], edge[1], b);
    if (point) return { distance: 0, a: point.clone(), b: point.clone(), intersection: true };
  }
  for (const edge of bEdges) {
    const point = segmentTriangle(edge[0], edge[1], a);
    if (point) return { distance: 0, a: point.clone(), b: point.clone(), intersection: true };
  }
  let best = { distance: Infinity, a: null, b: null, intersection: false };
  const ta = new THREE.Triangle(a.a, a.b, a.c);
  const tb = new THREE.Triangle(b.a, b.b, b.c);
  for (const point of [a.a, a.b, a.c]) {
    const other = tb.closestPointToPoint(point, new THREE.Vector3());
    const distance = point.distanceTo(other);
    if (distance < best.distance) best = { distance, a: point.clone(), b: other, intersection: false };
  }
  for (const point of [b.a, b.b, b.c]) {
    const other = ta.closestPointToPoint(point, new THREE.Vector3());
    const distance = point.distanceTo(other);
    if (distance < best.distance) best = { distance, a: other, b: point.clone(), intersection: false };
  }
  for (const ae of aEdges) for (const be of bEdges) {
    const row = segmentSegment(ae[0], ae[1], be[0], be[1]);
    if (row.distance < best.distance) best = { ...row, intersection: false };
  }
  return best;
}

const transformTriangle = (source, matrix) => {
  const a = source.a.clone().applyMatrix4(matrix);
  const b = source.b.clone().applyMatrix4(matrix);
  const c = source.c.clone().applyMatrix4(matrix);
  return { ...source, a, b, c, box: new THREE.Box3().setFromPoints([a, b, c]) };
};
const pointInProjectedTriangle = (point, triangle) => {
  const cross = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const signs = [
    cross(triangle.a, triangle.b, point),
    cross(triangle.b, triangle.c, point),
    cross(triangle.c, triangle.a, point),
  ];
  return !(signs.some((value) => value < -1e-12) && signs.some((value) => value > 1e-12));
};
const tenonSegmentA = new THREE.Vector3(join.x, join.y, 0);
const tenonSegmentB = new THREE.Vector3(tenonEnd.x, tenonEnd.y, 0);
const projectedSegmentTriangleDistance = (triangle) => {
  const projected = {
    a: new THREE.Vector3(triangle.a.x, triangle.a.y, 0),
    b: new THREE.Vector3(triangle.b.x, triangle.b.y, 0),
    c: new THREE.Vector3(triangle.c.x, triangle.c.y, 0),
  };
  if (pointInProjectedTriangle(tenonSegmentA, projected) || pointInProjectedTriangle(tenonSegmentB, projected)) return 0;
  return Math.min(...[[projected.a, projected.b], [projected.b, projected.c], [projected.c, projected.a]].map(
    ([a, b]) => segmentSegment(tenonSegmentA, tenonSegmentB, a, b).distance,
  ));
};
const intervalGap = (a0, a1, b0, b1) => a1 < b0 ? b0 - a1 : b1 < a0 ? a0 - b1 : 0;
const queryTree = (moving, node, state) => {
  if (boxDistance(moving.box, node.box) >= state.distance) return;
  if (node.rows) {
    for (const fixed of node.rows) {
      if (boxDistance(moving.box, fixed.box) >= state.distance) continue;
      const result = trianglePairDistance(moving, fixed);
      if (result.distance < state.distance || result.intersection) {
        Object.assign(state, {
          ...result,
          movingComponent: moving.component,
          movingTriangle: moving.sourceTriangle,
          fixedTriangle: fixed.sourceTriangle,
        });
        if (state.intersection) return;
      }
    }
    return;
  }
  const firstDistance = boxDistance(moving.box, node.left.box);
  const secondDistance = boxDistance(moving.box, node.right.box);
  if (firstDistance <= secondDistance) {
    queryTree(moving, node.left, state);
    if (!state.intersection) queryTree(moving, node.right, state);
  } else {
    queryTree(moving, node.right, state);
    if (!state.intersection) queryTree(moving, node.left, state);
  }
};
const tenonProjection = (point) => {
  const dx = tenonEnd.x - join.x;
  const dy = tenonEnd.y - join.y;
  const denominator = dx * dx + dy * dy;
  const rawT = ((point.x - join.x) * dx + (point.y - join.y) * dy) / denominator;
  const t = Math.max(0, Math.min(1, rawT));
  const x = join.x + dx * t;
  const y = join.y + dy * t;
  return { rawT, t, distance: Math.hypot(point.x - x, point.y - y), halfWidth: 0.22 * (1 - t) + 0.1 * t };
};
const pointInTenonVolume = (point) => {
  if (point.z < tenonEnvelope.min.z - 1e-9 || point.z > tenonEnvelope.max.z + 1e-9) return false;
  const projection = tenonProjection(point);
  return projection.rawT >= -1e-9 && projection.rawT <= 1 + 1e-9 && projection.distance <= projection.halfWidth + 1e-9;
};
const pairIntersectionPoints = (a, b) => {
  const points = [];
  for (const [p0, p1] of [[a.a, a.b], [a.b, a.c], [a.c, a.a]]) {
    const point = segmentTriangle(p0, p1, b);
    if (point) points.push(point);
  }
  for (const [p0, p1] of [[b.a, b.b], [b.b, b.c], [b.c, b.a]]) {
    const point = segmentTriangle(p0, p1, a);
    if (point) points.push(point);
  }
  return points;
};
const queryTenonSurfaceIntersection = (moving, node, state) => {
  if (state.tenonSurfaceIntersection) return;
  if (!node.box.intersectsBox(tenonEnvelope) || !moving.box.intersectsBox(node.box)) return;
  if (node.rows) {
    for (const fixed of node.rows) {
      if (!fixed.box.intersectsBox(tenonEnvelope) || !moving.box.intersectsBox(fixed.box)) continue;
      const point = pairIntersectionPoints(moving, fixed).find(pointInTenonVolume);
      if (point) {
        state.tenonSurfaceIntersection = {
          point: point.toArray(),
          movingComponent: moving.component,
          movingTriangle: moving.sourceTriangle,
          stationaryTriangle: fixed.sourceTriangle,
          projection: tenonProjection(point),
        };
        return;
      }
    }
    return;
  }
  queryTenonSurfaceIntersection(moving, node.left, state);
  queryTenonSurfaceIntersection(moving, node.right, state);
};

const parent = new THREE.Matrix4().fromArray(geometry.balanceMotion.parentWorldMatrix);
const position = new THREE.Vector3(...geometry.balanceMotion.position);
const scale = new THREE.Vector3(...geometry.balanceMotion.scale);
const matrixAt = (angle) => parent.clone().multiply(new THREE.Matrix4().compose(
  position,
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle),
  scale,
));
let exactEvaluations = 0;
let isolatedTenonWitness = null;
const exactAt = (angle) => {
  exactEvaluations += 1;
  const matrix = matrixAt(angle);
  const state = {
    distance: Infinity,
    intersection: false,
    a: null,
    b: null,
    movingComponent: null,
    movingTriangle: null,
    fixedTriangle: null,
    tenonGateIntersection: null,
    tenonSurfaceIntersection: null,
  };
  for (const source of movingTriangles) {
    const moving = transformTriangle(source, matrix);
    if (!state.tenonGateIntersection && tenonGateEnvelope.intersectsTriangle(
      new THREE.Triangle(moving.a, moving.b, moving.c),
    )) {
      state.tenonGateIntersection = {
        movingComponent: moving.component,
        movingTriangle: moving.sourceTriangle,
      };
    }
    queryTenonSurfaceIntersection(moving, fixedTree, state);
    const planar = projectedSegmentTriangleDistance(moving);
    const axial = intervalGap(
      Math.min(moving.a.z, moving.b.z, moving.c.z),
      Math.max(moving.a.z, moving.b.z, moving.c.z),
      tenonEnvelope.min.z,
      tenonEnvelope.max.z,
    );
    const conservativeDistance = Math.hypot(Math.max(0, planar - 0.22), axial);
    if (!isolatedTenonWitness || conservativeDistance < isolatedTenonWitness.distance) {
      isolatedTenonWitness = {
        distance: conservativeDistance,
        angle,
        movingComponent: moving.component,
        movingTriangle: moving.sourceTriangle,
        projectedCenterlineToTriangleMm: planar,
        axialFloorMm: axial,
      };
    }
    queryTree(moving, fixedTree, state);
  }
  return state;
};

const movingRangeDeg = movingKind === "pallet" ? [-5.5, 5.5] : [-132, 132];
const minAngle = THREE.MathUtils.degToRad(movingRangeDeg[0]);
const maxAngle = THREE.MathUtils.degToRad(movingRangeDeg[1]);
const coarseSamples = movingKind === "pallet" ? 1025 : 2113;
let witness = null;
let intersectingSamples = 0;
let tenonGateIntersectingSamples = 0;
let tenonGateWitness = null;
let tenonSurfaceIntersectingSamples = 0;
let tenonSurfaceWitness = null;
for (let index = 0; index < coarseSamples; index += 1) {
  const angle = minAngle + (index / (coarseSamples - 1)) * (maxAngle - minAngle);
  const result = exactAt(angle);
  if (result.intersection) intersectingSamples += 1;
  if (result.tenonGateIntersection) {
    tenonGateIntersectingSamples += 1;
    tenonGateWitness ??= { angle, ...result.tenonGateIntersection };
  }
  if (result.tenonSurfaceIntersection) {
    tenonSurfaceIntersectingSamples += 1;
    tenonSurfaceWitness ??= { angle, ...result.tenonSurfaceIntersection };
  }
  if (!witness || result.distance < witness.result.distance) witness = { angle, result };
}

let refinementSamples = 0;
let halfWidth = (maxAngle - minAngle) / (coarseSamples - 1);
for (const count of [257, 257]) {
  let local = witness;
  const low = Math.max(minAngle, witness.angle - halfWidth);
  const high = Math.min(maxAngle, witness.angle + halfWidth);
  for (let index = 0; index < count; index += 1) {
    const angle = low + (index / (count - 1)) * (high - low);
    const result = exactAt(angle);
    refinementSamples += 1;
    if (result.distance < local.result.distance) local = { angle, result };
  }
  witness = local;
  halfWidth = (high - low) / (count - 1);
}

const balanceAxis = new THREE.Vector3(0, 0, 0).applyMatrix4(matrixAt(0));
const pointSegmentDistance2D = (point, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator > 1e-18
    ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator))
    : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
};
const pointTriangleDistance2D = (point, triangle) => {
  if (pointInProjectedTriangle(point, triangle)) return 0;
  return Math.min(
    pointSegmentDistance2D(point, triangle.a, triangle.b),
    pointSegmentDistance2D(point, triangle.b, triangle.c),
    pointSegmentDistance2D(point, triangle.c, triangle.a),
  );
};
const balanceComponents = geometry.balanceMeshes.map((payload) => {
  const local = triangles(payload);
  const worldAtZero = local.map((row) => transformTriangle(row, matrixAt(0)));
  return {
    payload,
    local,
    maximumRadius: Math.max(...local.flatMap((row) => [row.a, row.b, row.c].map((point) => Math.hypot(point.x, point.y)))),
    worldBounds: unionBox(worldAtZero),
  };
});

const supportParticipants = (movingKind === "balance" ? geometry.stationarySupportMeshes : []).map((payload, ordinal) => {
  const fixed = triangles(payload);
  const tree = buildTree([...fixed]);
  const stationaryProjection = Math.min(...fixed.map((row) => pointTriangleDistance2D(balanceAxis, row)));
  const conservative = balanceComponents.map((component) => {
    const axial = intervalGap(
      tree.box.min.z,
      tree.box.max.z,
      component.worldBounds.min.z,
      component.worldBounds.max.z,
    );
    const radial = stationaryProjection - component.maximumRadius;
    return {
      moving: component.payload.path,
      radialFloorMm: radial,
      axialFloorMm: axial,
      clearanceFloorMm: Math.hypot(Math.max(0, radial), axial),
    };
  });
  return {
    ordinal,
    payload,
    fixed,
    tree,
    conservative,
    conservativeMinimum: Math.min(...conservative.map((row) => row.clearanceFloorMm)),
  };
});

const supportRows = [];
for (const participant of supportParticipants) {
  if (participant.conservativeMinimum >= 0.1) {
    supportRows.push({
      stationary: participant.payload.path,
      ordinal: participant.ordinal,
      stationaryTriangleCount: participant.fixed.length,
      method: "complete-rotation rendered radial/Z conservative floor",
      exactSweepRequired: false,
      minimumSurfaceDistanceMm: participant.conservativeMinimum,
      intersectingSamples: 0,
      accepted: true,
      conservativeComponents: participant.conservative,
    });
    continue;
  }
  let localWitness = null;
  let localIntersectingSamples = 0;
  for (let index = 0; index < coarseSamples; index += 1) {
    const angle = minAngle + (index / (coarseSamples - 1)) * (maxAngle - minAngle);
    const matrix = matrixAt(angle);
    const state = {
      distance: Infinity,
      intersection: false,
      a: null,
      b: null,
      movingComponent: null,
      movingTriangle: null,
      fixedTriangle: null,
    };
    for (const source of movingTriangles) {
      queryTree(transformTriangle(source, matrix), participant.tree, state);
      if (state.intersection) break;
    }
    if (state.intersection) localIntersectingSamples += 1;
    if (!localWitness || state.distance < localWitness.result.distance) localWitness = { angle, result: state };
  }
  supportRows.push({
    stationary: participant.payload.path,
    ordinal: participant.ordinal,
    stationaryTriangleCount: participant.fixed.length,
    method: "actual world-transformed BufferGeometry triangle/triangle sweep after conservative ambiguity",
    exactSweepRequired: true,
    balanceRangeDeg: movingRangeDeg,
    samples: coarseSamples,
    intersectingSamples: localIntersectingSamples,
    minimumSignedSurfaceDistanceMm: localWitness.result.intersection ? -0 : localWitness.result.distance,
    witnessBalanceAngleDeg: THREE.MathUtils.radToDeg(localWitness.angle),
    witness: {
      movingMesh: localWitness.result.movingComponent,
      movingTriangle: localWitness.result.movingTriangle,
      stationaryTriangle: localWitness.result.fixedTriangle,
      movingPointMm: localWitness.result.a?.toArray() ?? null,
      stationaryPointMm: localWitness.result.b?.toArray() ?? null,
    },
    beatStateCoverage: localIntersectingSamples === coarseSamples
      ? { classification: "intersection at every sampled balance angle; therefore present in all certified beat states", states: geometry.certifiedBeat.states }
      : { classification: "angle-sampled witness; contact state is not inferred from angle alone", states: geometry.certifiedBeat.states },
    accepted: localIntersectingSamples === 0 && localWitness.result.distance >= 0.1,
    conservativeComponents: participant.conservative,
  });
}

const report = {
  schema: "post5d-overnight-stembar-balance-exact-v1",
  disposition: !witness.result.intersection && intersectingSamples === 0 && witness.result.distance >= 0.1
    ? `PASS — ESCAPE-FINGER STEM/BAR CLEARS COMPLETE ${movingKind.toUpperCase()} SWEEP`
    : witness.result.intersection || intersectingSamples > 0
      ? `FAIL — EXACT STEM/BAR / ${movingKind.toUpperCase()} TRIANGLE INTERSECTION`
      : `STOP — POSITIVE BUT SUB-GATE STEM/BAR / ${movingKind.toUpperCase()} CLEARANCE`,
  accepted: !witness.result.intersection && intersectingSamples === 0 && witness.result.distance >= 0.1,
  pair: {
    stationary: geometry.stem.path,
    moving: geometry.balanceMotion.path,
    stationaryTriangleCount: fixedTriangles.length,
    movingTriangleCount: movingTriangles.length,
    movingComponentCount: geometry.balanceMeshes.length,
    stemMetadata: geometry.stemMetadata,
    underpassMetadata: geometry.underpassMetadata,
  },
  sweep: {
    movingKind,
    excludeMovingArbor,
    balanceRangeDeg: movingRangeDeg,
    coarseSamples,
    coarseStepDeg: (movingRangeDeg[1] - movingRangeDeg[0]) / (coarseSamples - 1),
    refinementSamples,
    exactEvaluations,
    intersectingCoarseSamples: intersectingSamples,
    method: "actual world-transformed BufferGeometry triangle/triangle intersection and distance with fixed-triangle AABB hierarchy; two local refinements",
    minimumSignedSurfaceDistanceMm: witness.result.intersection ? -0 : witness.result.distance,
    minimumBalanceAngleDeg: THREE.MathUtils.radToDeg(witness.angle),
    exactTrianglePair: {
      movingMesh: witness.result.movingComponent,
      movingTriangle: witness.result.movingTriangle,
      stationaryMesh: geometry.stem.path,
      stationaryTriangle: witness.result.fixedTriangle,
    },
    worldWitnessPointsMm: {
      moving: witness.result.a?.toArray() ?? null,
      stationary: witness.result.b?.toArray() ?? null,
    },
  },
  addedTenonIsolation: {
    derivation: "source-exact join/end centerline with conservative 0.22 mm half-width at both ends, full rendered stem Z, then 0.10 mm expansion in XYZ",
    joinMm: [join.x, join.y],
    tenonEndMm: [tenonEnd.x, tenonEnd.y],
    conservativeEnvelopeMm: { min: tenonEnvelope.min.toArray(), max: tenonEnvelope.max.toArray() },
    generalGateEnvelopeMm: { min: tenonGateEnvelope.min.toArray(), max: tenonGateEnvelope.max.toArray() },
    balanceRangeDeg: movingRangeDeg,
    samples: coarseSamples,
    intersectingGateEnvelopeSamples: tenonGateIntersectingSamples,
    witness: tenonGateWitness
      ? { ...tenonGateWitness, angleDeg: THREE.MathUtils.radToDeg(tenonGateWitness.angle) }
      : null,
    clearsAddedTenonByAtLeastMm: tenonGateIntersectingSamples === 0 ? 0.1 : null,
    conservativeCapsulePrism: {
      method: "triangle-exact XY distance to source-exact tenon centerline minus conservative 0.22 mm radius, combined with exact triangle/rendered-tenon Z interval separation",
      minimumSurfaceDistanceLowerBoundMm: isolatedTenonWitness.distance,
      minimumBalanceAngleDeg: THREE.MathUtils.radToDeg(isolatedTenonWitness.angle),
      movingMesh: isolatedTenonWitness.movingComponent,
      movingTriangle: isolatedTenonWitness.movingTriangle,
      projectedCenterlineToTriangleMm: isolatedTenonWitness.projectedCenterlineToTriangleMm,
      axialFloorMm: isolatedTenonWitness.axialFloorMm,
      clearsGeneralForeignGate: isolatedTenonWitness.distance >= 0.1,
    },
    exactCurrentSurfaceIntersection: {
      method: "actual balance/stemBar triangle intersections whose world witness point lies inside the source-exact tapered tenon prism",
      intersectingSamples: tenonSurfaceIntersectingSamples,
      witness: tenonSurfaceWitness
        ? { ...tenonSurfaceWitness, angleDeg: THREE.MathUtils.radToDeg(tenonSurfaceWitness.angle) }
        : null,
      penetration: tenonSurfaceIntersectingSamples > 0,
    },
    accepted: tenonSurfaceIntersectingSamples === 0 && isolatedTenonWitness.distance >= 0.1,
  },
  completeEscapeUpperSupportAudit: {
    scope: "every rendered mesh below escapeFinger, anchor:escape post, escape/pallet upper settings, and anchor:escape screw against complete balance motion",
    certifiedBeat: geometry.certifiedBeat,
    participants: supportRows,
    penetratingMeshes: supportRows.filter((row) => row.intersectingSamples > 0).map((row) => ({
      stationary: row.stationary,
      ordinal: row.ordinal,
      intersectingSamples: row.intersectingSamples,
      witnessBalanceAngleDeg: row.witnessBalanceAngleDeg,
      witness: row.witness,
    })),
    accepted: movingKind === "balance" && supportRows.every((row) => row.accepted),
  },
  pageErrors,
};
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ disposition: report.disposition, accepted: report.accepted, pair: report.pair, sweep: report.sweep }, null, 2));
