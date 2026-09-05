import { chromium } from "playwright";
import * as THREE from "three";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Fresh candidate evidence only. These reports never replace RC1 authority.
const experiment = process.env.EXPERIMENT;
if (!["train-bridge", "center-web"].includes(experiment)) throw new Error("Set EXPERIMENT=train-bridge or EXPERIMENT=center-web");
const output = path.resolve(process.argv[2] || `/tmp/train-design-evidence/${experiment}`);
if (output.includes(`${path.sep}captures${path.sep}rc1`)) throw new Error("Use a new output directory outside RC1 evidence");
const base = process.argv[3] || "http://127.0.0.1:5174";
const changedName = experiment === "center-web" ? "center:wheel" : "struct:trainBridge:body";
const sampleCount = Number(process.env.FOREIGN_SAMPLES || 1441);
if (!Number.isInteger(sampleCount) || sampleCount < 145) throw new Error("FOREIGN_SAMPLES must be an integer >=145");
fs.mkdirSync(output, { recursive: true });
const digest = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileRow = (file) => ({ file: path.resolve(file), bytes: fs.statSync(file).size, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") });
let sourceFiles = fs.readdirSync("src").filter((name) => name.endsWith(".ts")).sort().map((name) => ({ ...fileRow(`src/${name}`), file: `src/${name}` }));
const checkpointResult = spawnSync("git", ["rev-parse", "--verify", `${process.env.CHECKPOINT_COMMIT || "checkpoint/graphite-sapphire"}^{commit}`], { encoding: "utf8" });
if (checkpointResult.status !== 0) throw new Error("Frozen checkpoint missing; set CHECKPOINT_COMMIT explicitly");
const checkpointCommit = checkpointResult.stdout.trim();
const snapshotPath = path.join(output, "geometry-snapshots.json");
let baseline, candidate, restored, browserErrors = [];
if (process.env.REUSE_SNAPSHOT === "1") {
  const cached = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  if (cached.experiment !== experiment || cached.checkpointCommit !== checkpointCommit) throw new Error("Snapshot identity mismatch");
  ({ baseline, candidate, restored, sourceFiles, browserErrors } = cached);
} else {
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 320, height: 240 }, deviceScaleFactor: 1 });
// Numerical geometry evidence does not need continuously rendered animation.
// capture() still invokes the real renderer/kinematic update at each fixed pose.
await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
page.setDefaultTimeout(300000);
page.on("pageerror", (error) => browserErrors.push(String(error)));
const url = new URL(base);
for (const [key, value] of Object.entries({ static: "1", t: "0", explode: "0", experiment: "none", refinement: "graphite-finish" })) url.searchParams.set(key, value);
try {
  await page.goto(url.href, { waitUntil: "commit", timeout: 60000 });
  await page.waitForFunction(() => typeof globalThis.__WATCH__?.setExperiment === "function", null, { polling: 100 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Runtime.evaluate", { expression: "import('/node_modules/.vite/deps/three.js').then(m=>globalThis.__TRAIN_AUDIT_THREE=m)", awaitPromise: true });
  await cdp.send("Runtime.evaluate", { expression: "import('/src/spec.ts').then(m=>globalThis.__TRAIN_AUDIT_SPEC=m)", awaitPromise: true });
  const proto = await cdp.send("Runtime.evaluate", { expression: "__TRAIN_AUDIT_THREE.Scene.prototype" });
  const instances = await cdp.send("Runtime.queryObjects", { prototypeObjectId: proto.result.objectId });
  await cdp.send("Runtime.callFunctionOn", { objectId: instances.objects.objectId, functionDeclaration: "function(){globalThis.__TRAIN_AUDIT_SCENE=this.find(x=>x.getObjectByName&&x.getObjectByName('calibre'))}" });
  const snapshot = (name, full) => page.evaluate(async ({ name, full, changedName }) => {
    const W = globalThis.__WATCH__, S = globalThis.__TRAIN_AUDIT_SCENE, T = globalThis.__TRAIN_AUDIT_THREE, spec = globalThis.__TRAIN_AUDIT_SPEC;
    W.setExperiment(name); W.setExplode(0); W.setTime(0); W.capture(); S.updateMatrixWorld(true);
    const actual = W.experimentReport();
    if (actual.name !== name) throw new Error(`Expected ${name}, got ${actual.name}`);
    const kinematics = W.kinematicReport([0, 10, 60]);
    const displayDrive = W.displayDriveReport([0, 10, 60]);
    W.setTime(0); W.capture(); S.updateMatrixWorld(true);
    const objectPath = (o) => { const parts = []; for (let p = o; p; p = p.parent) parts.push(p.name || p.type); return parts.reverse().join("/"); };
    const hash = async (text) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).map((x) => x.toString(16).padStart(2, "0")).join("");
    const objects = [];
    S.traverse((o) => {
      if (!o.isMesh || !o.geometry || o.userData.engineeringAuditOnly) return;
      const p = objectPath(o);
      if (/debug|Helper|sapphireReflection|studioCard/i.test(p)) return;
      // Product roots only; never include diagnostic proxies or studio meshes.
      if (!/calibre|structure:root|assembly:root|accommodation|phase4b|enclosure|exterior|strap|readout|display/.test(p)) return;
      objects.push(o);
    });
    const rows = [];
    for (const o of objects) {
      let owner = null;
      for (let p = o; p; p = p.parent) if (/^(barrel|center|third|fourth|escape|pallet|balance):motion$/.test(p.name)) { owner = p; break; }
      const a = o.geometry.getAttribute("position"), n = o.geometry.getAttribute("normal"), i = o.geometry.getIndex();
      const positions = Array.from(a.array), index = i ? Array.from(i.array) : null;
      const bounds = new T.Box3().setFromObject(o, true);
      const axis = owner?.getWorldPosition(new T.Vector3());
      const shape = o.name === "center:wheel" ? o.geometry.parameters?.shapes : null;
      const contours = shape?.extractPoints(o.geometry.parameters.options?.curveSegments ?? 12);
      rows.push({
        name: o.name, path: objectPath(o), owner: owner?.name ?? null, axis: axis?.toArray() ?? null,
        sweepRange: owner?.name === "pallet:motion" ? [-spec.MOTION.palletAmplitude - owner.rotation.z, spec.MOTION.palletAmplitude - owner.rotation.z]
          : owner?.name === "balance:motion" ? [-spec.MOTION.balanceAmplitude - owner.rotation.z, spec.MOTION.balanceAmplitude - owner.rotation.z] : [0, Math.PI * 2],
        matrix: o.matrixWorld.toArray(), localMatrix: o.matrix.toArray(),
        geometrySha256: await hash(JSON.stringify({ positions, index })),
        normalsSha256: await hash(JSON.stringify(n ? Array.from(n.array) : null)),
        positionCount: a.count, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
        ...(contours ? { extrusionContours: { shape: contours.shape.map((p) => p.toArray()), holes: contours.holes.map((hole) => hole.map((p) => p.toArray())), bevelEnabled: o.geometry.parameters.options?.bevelEnabled !== false } } : {}),
        ...(full || o.name === changedName ? { positions, index } : {}),
      });
    }
    return { experiment: actual, kinematics, displayDrive, meshes: rows };
  }, { name, full, changedName });
  console.log("extracting frozen geometry");
  baseline = await snapshot("none", false);
  console.log("extracting candidate geometry");
  candidate = await snapshot(experiment, true);
  console.log("checking frozen restoration");
  restored = await snapshot("none", false);
} finally {
  await browser.close();
}
fs.writeFileSync(snapshotPath, JSON.stringify({ experiment, checkpointCommit, sourceFiles, browserErrors, baseline, candidate, restored }));
console.log(`browser closed; reusable geometry snapshot: ${snapshotPath}`);
}

const pathSequenceUnchanged = JSON.stringify(candidate.meshes.map((row) => row.path)) === JSON.stringify(baseline.meshes.map((row) => row.path))
  && JSON.stringify(restored.meshes.map((row) => row.path)) === JSON.stringify(baseline.meshes.map((row) => row.path));
for (const snapshot of [baseline, candidate, restored]) {
  const counts = new Map(), occurrences = new Map();
  for (const row of snapshot.meshes) counts.set(row.path, (counts.get(row.path) ?? 0) + 1);
  for (const row of snapshot.meshes) if (counts.get(row.path) > 1) {
    const occurrence = occurrences.get(row.path) ?? 0; occurrences.set(row.path, occurrence + 1);
    row.originalScenePath = row.path; row.path += `/same-path-mesh[${occurrence}]`;
  }
  // Every snapshot is explicitly t=0, when the contact law puts the pallet
  // motion at its negative bank. Its pose's neutral rotation is already in
  // the world matrix. Normalize old cached delta ranges without rendering.
  for (const row of snapshot.meshes) if (row.owner === "pallet:motion") {
    row.sweepRange = [0, row.sweepRange[1] - row.sweepRange[0]];
  }
}
const baselineByPath = new Map(baseline.meshes.map((row) => [row.path, row]));
const restoredByPath = new Map(restored.meshes.map((row) => [row.path, row]));
const changed = candidate.meshes.filter((row) => row.geometrySha256 !== baselineByPath.get(row.path)?.geometrySha256);
const target = candidate.meshes.find((row) => row.name === changedName);
const original = baseline.meshes.find((row) => row.name === changedName);
if (!target || !original) throw new Error(`Actual product mesh missing: ${changedName}`);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const unchangedPlacement = (row, before) => before && equal(row.matrix, before.matrix) && equal(row.axis, before.axis) && row.owner === before.owner;
const checks = {
  requestedExperimentActive: candidate.experiment.name === experiment,
  meshMembershipOrderUnchanged: pathSequenceUnchanged,
  onlyExpectedGeometryChanged: changed.length === 1 && changed[0].name === changedName && candidate.meshes.length === baseline.meshes.length,
  ...(experiment === "center-web" ? { onlyCenterWheelGeometryChanged: changed.length === 1 && changed[0].name === "center:wheel" } : {}),
  pivotsUnchanged: candidate.meshes.every((row) => unchangedPlacement(row, baselineByPath.get(row.path))),
  kinematicsUnchanged: equal(candidate.kinematics, baseline.kinematics),
  displayDriveUnchanged: equal(candidate.displayDrive, baseline.displayDrive),
  depthIntervalsUnchanged: Math.abs(target.bounds.min[2] - original.bounds.min[2]) < 1e-7 && Math.abs(target.bounds.max[2] - original.bounds.max[2]) < 1e-7,
  baselineRestored: restored.meshes.length === baseline.meshes.length && baseline.meshes.every((row) => {
    const after = restoredByPath.get(row.path);
    return after && after.geometrySha256 === row.geometrySha256 && after.normalsSha256 === row.normalsSha256 && unchangedPlacement(after, row);
  }),
  browserErrorsClean: browserErrors.length === 0,
};

// Exact geometric helpers are used only after a conservative bound is ambiguous.
const worldPoints = (row) => {
  const matrix = new THREE.Matrix4().fromArray(row.matrix), points = [];
  for (let i = 0; i < row.positions.length; i += 3) points.push(new THREE.Vector3(row.positions[i], row.positions[i + 1], row.positions[i + 2]).applyMatrix4(matrix));
  return points;
};
const triangles = (row) => {
  const points = worldPoints(row), indices = row.index ?? Array.from({ length: points.length }, (_, i) => i), rows = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = points[indices[i]], b = points[indices[i + 1]], c = points[indices[i + 2]];
    const triangle = new THREE.Triangle(a, b, c);
    if (triangle.getArea() < 1e-16) continue;
    rows.push({ a, b, c, triangle, box: new THREE.Box3().setFromPoints([a, b, c]) });
  }
  return rows;
};
const triCache = new Map();
const tris = (row) => { if (!triCache.has(row)) triCache.set(row, triangles(row)); return triCache.get(row); };
const boxGap = (a, b) => Math.hypot(Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x), Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y), Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z));
const tree = (rows) => {
  const box = new THREE.Box3(); for (const row of rows) box.union(row.box);
  if (rows.length <= 12) return { box, rows };
  const size = box.getSize(new THREE.Vector3()), axis = size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y" : "z";
  const sorted = [...rows].sort((a, b) => a.box.min[axis] + a.box.max[axis] - b.box.min[axis] - b.box.max[axis]);
  const middle = Math.floor(sorted.length / 2);
  return { box, left: tree(sorted.slice(0, middle)), right: tree(sorted.slice(middle)) };
};
const segmentDistance = (p1, q1, p2, q2) => {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.lengthSq(), e = d2.lengthSq(), f = d2.dot(r), clamp = (v) => Math.max(0, Math.min(1, v));
  let s = 0, t = 0;
  if (a <= 1e-24 && e <= 1e-24) return p1.distanceTo(p2);
  if (a <= 1e-24) t = clamp(f / e);
  else {
    const c = d1.dot(r);
    if (e <= 1e-24) s = clamp(-c / a);
    else {
      const b = d1.dot(d2), denominator = a * e - b * b;
      s = Math.abs(denominator) > 1e-24 ? clamp((b * f - c * e) / denominator) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a); } else if (t > 1) { t = 1; s = clamp((b - c) / a); }
    }
  }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t));
};
const edgeHits = (a, b, tri) => {
  const length = a.distanceTo(b); if (length < 1e-12) return false;
  const ray = new THREE.Ray(a, b.clone().sub(a).divideScalar(length));
  const hit = ray.intersectTriangle(tri.a, tri.b, tri.c, false, new THREE.Vector3());
  return hit !== null && a.distanceTo(hit) <= length + 1e-10;
};
const triDistance = (a, b) => {
  const ae = [[a.a, a.b], [a.b, a.c], [a.c, a.a]], be = [[b.a, b.b], [b.b, b.c], [b.c, b.a]];
  if (ae.some(([p, q]) => edgeHits(p, q, b)) || be.some(([p, q]) => edgeHits(p, q, a))) return 0;
  let minimum = Infinity;
  for (const p of [a.a, a.b, a.c]) minimum = Math.min(minimum, p.distanceTo(b.triangle.closestPointToPoint(p, new THREE.Vector3())));
  for (const p of [b.a, b.b, b.c]) minimum = Math.min(minimum, p.distanceTo(a.triangle.closestPointToPoint(p, new THREE.Vector3())));
  for (const [p, q] of ae) for (const [r, s] of be) minimum = Math.min(minimum, segmentDistance(p, q, r, s));
  return minimum;
};
const nearest = (tri, node, best) => {
  if (boxGap(tri.box, node.box) >= best) return best;
  if (node.rows) { for (const other of node.rows) if (boxGap(tri.box, other.box) < best) best = Math.min(best, triDistance(tri, other)); return best; }
  const children = [node.left, node.right].sort((a, b) => boxGap(tri.box, a.box) - boxGap(tri.box, b.box));
  for (const child of children) best = nearest(tri, child, best);
  return best;
};
const inside = (point, node) => {
  const ray = new THREE.Ray(point, new THREE.Vector3(0.81231, 0.41723, 0.40917).normalize()), hits = [];
  const visit = (part) => {
    if (!ray.intersectsBox(part.box)) return;
    if (part.rows) {
      for (const tri of part.rows) { const hit = ray.intersectTriangle(tri.a, tri.b, tri.c, false, new THREE.Vector3()); if (hit) hits.push(hit.distanceTo(point)); }
    } else { visit(part.left); visit(part.right); }
  };
  visit(node); hits.sort((a, b) => a - b);
  return hits.filter((v, i) => v > 1e-9 && (!i || Math.abs(v - hits[i - 1]) > 1e-8)).length % 2 === 1;
};
const rotateTris = (rows, axis, angle) => {
  const c = Math.cos(angle), s = Math.sin(angle);
  const rotate = (p) => new THREE.Vector3(axis[0] + c * (p.x - axis[0]) - s * (p.y - axis[1]), axis[1] + s * (p.x - axis[0]) + c * (p.y - axis[1]), p.z);
  return rows.map((t) => { const a = rotate(t.a), b = rotate(t.b), c = rotate(t.c); return { a, b, c, triangle: new THREE.Triangle(a, b, c), box: new THREE.Box3().setFromPoints([a, b, c]) }; });
};
const componentRepresentatives = (rows) => {
  const parents = rows.map((_, i) => i), owners = new Map();
  const root = (i) => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  rows.forEach((row, i) => {
    for (const point of [row.a, row.b, row.c]) {
      const key = point.toArray().map((v) => v.toFixed(9)).join(",");
      if (owners.has(key)) parents[root(i)] = root(owners.get(key)); else owners.set(key, i);
    }
  });
  return [...new Set(rows.map((_, i) => root(i)))];
};
const radius = (row) => Math.max(...worldPoints(row).map((p) => Math.hypot(p.x - row.axis[0], p.y - row.axis[1])));
const axialGap = (a, b) => Math.max(0, a.bounds.min[2] - b.bounds.max[2], b.bounds.min[2] - a.bounds.max[2]);
const projectedPointTriangleDistance = (point, triangle) => {
  const p = { x: point[0], y: point[1] }, cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const { a, b, c } = triangle;
  if (Math.abs(cross(a, b, c)) > 1e-12) {
    const signs = [cross(a, b, p), cross(b, c, p), cross(c, a, p)];
    if (signs.every((v) => v >= 0) || signs.every((v) => v <= 0)) return 0;
  }
  return Math.min(...[[a, b], [b, c], [c, a]].map(([a, b]) => {
    const x = b.x - a.x, y = b.y - a.y, denominator = x * x + y * y;
    const t = denominator > 1e-24 ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y) / denominator)) : 0;
    return Math.hypot(p.x - a.x - t * x, p.y - a.y - t * y);
  }));
};
const conservative = (a, b) => {
  if (!a.owner && !b.owner) return { minimumMm: boxGap(new THREE.Box3(new THREE.Vector3(...a.bounds.min), new THREE.Vector3(...a.bounds.max)), new THREE.Box3(new THREE.Vector3(...b.bounds.min), new THREE.Vector3(...b.bounds.max))), method: "actual fixed component world AABBs" };
  const axial = axialGap(a, b);
  if (axial >= 0.1) return { minimumMm: axial, method: "actual component Z slabs, valid for every rotation" };
  let radial = 0;
  if (a.owner && b.owner) radial = Math.max(0, Math.hypot(a.axis[0] - b.axis[0], a.axis[1] - b.axis[1]) - radius(a) - radius(b));
  else {
    const moving = a.owner ? a : b, fixed = a.owner ? b : a;
    radial = Math.max(0, Math.min(...tris(fixed).map((tri) => projectedPointTriangleDistance(moving.axis, tri))) - radius(moving));
  }
  return { minimumMm: Math.hypot(radial, axial), method: "actual triangle projection against full rotational radius and Z slabs" };
};
const exactSweep = (moving, fixed) => {
  if (fixed.owner) return { accepted: false, reason: "ambiguous pair has two moving owners; requires a dedicated ratio-linked sweep" };
  const rotating = tris(moving), fixedRows = tris(fixed), fixedTree = tree(fixedRows);
  const movingComponents = componentRepresentatives(rotating), fixedComponents = componentRepresentatives(fixedRows);
  let minimum = Infinity, witness = 0, collisionSamples = 0, evaluatedSamples = 0;
  const samples = moving.owner ? sampleCount : 1;
  const [start, end] = moving.owner ? moving.sweepRange : [0, 0], step = moving.owner ? (end - start) / (samples - 1) : 0;
  const sample = (angle) => {
    evaluatedSamples++;
    const transformed = moving.owner ? rotateTris(rotating, moving.axis, angle) : rotating;
    let distance = Infinity;
    for (const tri of transformed) { distance = nearest(tri, fixedTree, distance); if (distance <= 1e-9) break; }
    if (distance > 1e-9 && movingComponents.some((index) => inside(transformed[index].a, fixedTree))) distance = 0;
    if (distance > 1e-9) {
      const transformedTree = tree(transformed);
      if (fixedComponents.some((index) => inside(fixedRows[index].a, transformedTree))) distance = 0;
    }
    if (distance <= 1e-9) collisionSamples++;
    if (distance < minimum) { minimum = distance; witness = angle; }
  };
  for (let i = 0; i < samples; i++) { sample(start + i * step); if (collisionSamples) break; }
  if (moving.owner && !collisionSamples) for (const width of [step, step / 128]) { const center = witness; for (let i = 0; i < 257; i++) sample(Math.max(start, Math.min(end, center - width + i * 2 * width / 256))); }
  const motionBound = moving.owner ? 2 * radius(moving) * Math.sin(step / 4) : 0;
  return { minimumMm: minimum, continuousLowerBoundMm: Math.max(0, minimum - motionBound), collisionSamples, accepted: collisionSamples === 0 && minimum > motionBound, witnessDegrees: witness * 180 / Math.PI, rangeDegrees: [start, end].map((v) => v * 180 / Math.PI), sampleCount: Math.min(evaluatedSamples, samples), refinementSamples: Math.max(0, evaluatedSamples - samples), stoppedOnFirstCollision: collisionSamples > 0 && evaluatedSamples < samples, zeroDistanceInterpretation: "surface contact, intersection, or containment; zero distance alone is not a penetration-depth claim", method: "actual triangle distance/intersection and solid containment; complete rotation or specified oscillation; nearest-sample rotation bound certifies positive separation; a first collision stops a failed sweep early" };
};

const rows = [], exclusions = [];
const baselineTarget = { ...original, positions: original.positions, index: original.index };
let centerWebRegionProof = null;
if (experiment === "center-web") {
  const before = original.extrusionContours, after = target.extrusionContours;
  const pinion = candidate.meshes.find((row) => row.name === "third:pinion");
  const matrix = new THREE.Matrix4().fromArray(target.matrix);
  const windowPoints = [...before.holes.slice(1), ...after.holes.slice(1)].flat();
  const changedRegionRadius = Math.max(...windowPoints.map(([x, y]) => {
    const p = new THREE.Vector3(x, y, 0).applyMatrix4(matrix);
    return Math.hypot(p.x - target.axis[0], p.y - target.axis[1]);
  })) + 0.000001;
  const windowPolygons = [...before.holes.slice(1), ...after.holes.slice(1)].map((polygon) => polygon.map(([x, y]) => {
    const p = new THREE.Vector3(x, y, 0).applyMatrix4(matrix);
    return new THREE.Vector2(p.x - target.axis[0], p.y - target.axis[1]);
  }));
  const polygonInnerRadius = (polygon) => {
    let containsAxis = false, minimum = Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      if ((a.y > 0) !== (b.y > 0) && 0 < a.x + (b.x - a.x) * (-a.y) / (b.y - a.y)) containsAxis = !containsAxis;
      const direction = b.clone().sub(a), length2 = direction.lengthSq();
      const t = length2 > 0 ? Math.max(0, Math.min(1, -a.dot(direction) / length2)) : 0;
      minimum = Math.min(minimum, a.clone().addScaledVector(direction, t).length());
    }
    return containsAxis ? 0 : minimum;
  };
  const changedRegionInnerRadius = Math.max(0, Math.min(...windowPolygons.map(polygonInnerRadius)) - 0.000001);
  const pinionEnvelopeRadius = radius(pinion);
  const centerDistance = Math.hypot(target.axis[0] - pinion.axis[0], target.axis[1] - pinion.axis[1]);
  centerWebRegionProof = {
    outerContourUnchanged: equal(before.shape, after.shape), boreUnchanged: equal(before.holes[0], after.holes[0]), unBeveledExtrusions: before.bevelEnabled === false && after.bevelEnabled === false,
    changedRegionInnerRadiusMm: changedRegionInnerRadius, changedRegionRadiusMm: changedRegionRadius, thirdPinionEnvelopeRadiusMm: pinionEnvelopeRadius,
    centerDistanceMm: centerDistance, minimumRadialClearanceMm: centerDistance - changedRegionRadius - pinionEnvelopeRadius,
    method: "Actual extrusion polygons: unchanged outer contour and bore confine all web changes to the union of old/new window polygons; their maximum vertex radius bounds every linear polygon segment and interior. Compare that full-turn region to the pinion full-turn radius.",
  };
  checks.changedWebClearsThirdPinion = centerWebRegionProof.outerContourUnchanged && centerWebRegionProof.boreUnchanged && centerWebRegionProof.unBeveledExtrusions && centerWebRegionProof.minimumRadialClearanceMm > 0.1;
}
const changedWebBound = (other) => {
  const proof = centerWebRegionProof, axial = Math.max(0, axialGap(target, other) - 0.000001);
  if (axial >= 0.1) return { minimumMm: axial, method: "changed window-union extrusion Z slab; entire other component axially separated", scope: "changed material only" };
  let low, high;
  if (other.owner) {
    const distance = Math.hypot(target.axis[0] - other.axis[0], target.axis[1] - other.axis[1]);
    low = Math.max(0, distance - radius(other)); high = distance + radius(other);
  } else {
    low = Math.min(...tris(other).map((tri) => projectedPointTriangleDistance(target.axis, tri)));
    high = Math.max(...worldPoints(other).map((p) => Math.hypot(p.x - target.axis[0], p.y - target.axis[1])));
  }
  const radial = Math.max(0, low - proof.changedRegionRadiusMm, proof.changedRegionInnerRadiusMm - high);
  return { minimumMm: Math.hypot(radial, axial), method: "full-turn changed-material annulus versus actual fixed triangle projection or full-turn foreign-component envelope", scope: "changed material only", otherRadialIntervalMm: [low, high] };
};
for (const other of candidate.meshes) {
  if (other === target) continue;
  if (experiment === "train-bridge" && other.path.includes("/CoarseMidcasePose/acc:midcase/")) {
    exclusions.push({ pair: [target.path, other.path], reason: "superseded coarse accommodation midcase; src/exterior.ts applyKernelPresentation('product') hides this owner in favor of final exterior case geometry" }); continue;
  }
  if (experiment === "train-bridge" && other.name === "anchor:train:b:shoulder") {
    exclusions.push({ pair: [target.path, other.path], reason: "explicit stationary anchor-B shoulder/bridge support joint at the unchanged stub-B endpoint (src/structure.ts); intended structural contact" }); continue;
  }
  if (experiment === "train-bridge" && !other.owner && (other.path.includes("/trainBridge/") || /\/assembly:bearing:(center|third|fourth):upper\//.test(other.path))) {
    exclusions.push({ pair: [target.path, other.path], reason: "explicit stationary train-bridge construction or one of its three upper-bearing attachment assemblies; protected lands/bore and partner geometry unchanged" }); continue;
  }
  if (target.owner && other.owner === target.owner) { exclusions.push({ pair: [target.path, other.path], reason: "same rigid compound arbor; geometry/placement of partner unchanged" }); continue; }
  if (experiment === "center-web" && other.name === "third:pinion") { exclusions.push({ pair: [target.path, other.path], reason: "Only unchanged outer tooth engagement is delegated to the fresh 64T/10T tooth-cycle report; changed web region separately clears the pinion full-turn envelope", changedWebRegionAccepted: checks.changedWebClearsThirdPinion }); continue; }
  const beforeOther = baselineByPath.get(other.path);
  if (!beforeOther || beforeOther.geometrySha256 !== other.geometrySha256) { rows.push({ pair: [target.path, other.path], accepted: false, reason: "unexpected second changed mesh" }); continue; }
  const baselineOther = { ...other, matrix: beforeOther.matrix, axis: beforeOther.axis, bounds: beforeOther.bounds };
  if (experiment === "center-web" && checks.changedWebClearsThirdPinion) {
    const delta = changedWebBound(other);
    if (delta.minimumMm >= 0.1) { rows.push({ pair: [target.path, other.path], accepted: true, candidate: delta, clearsPointOneMm: true }); continue; }
  }
  const bound = conservative(target, other), oldBound = conservative(baselineTarget, baselineOther);
  // Compare certified positive lower bounds; this is not exact-gap preservation.
  const gate = Math.min(0.1, oldBound.minimumMm);
  if (bound.minimumMm > 1e-7 && bound.minimumMm + 1e-7 >= gate) {
    rows.push({ pair: [target.path, other.path], accepted: true, gateMm: gate, baseline: oldBound, candidate: bound }); continue;
  }
  console.log(`exact clearance: ${target.name} / ${other.name || other.path}; bounds candidate=${bound.minimumMm}, baseline=${oldBound.minimumMm}`);
  if (process.env.EXACT_MODE === "defer") { rows.push({ pair: [target.path, other.path], accepted: false, needsExact: true, candidate: bound, baseline: oldBound, otherBounds: other.bounds, otherAxis: other.axis, otherOwner: other.owner }); continue; }
  const moving = target.owner ? target : other, fixed = target.owner ? other : target;
  const oldMoving = target.owner ? baselineTarget : baselineOther, oldFixed = target.owner ? baselineOther : baselineTarget;
  const exact = exactSweep(moving, fixed), oldExact = exactSweep(oldMoving, oldFixed);
  const exactGate = Math.min(0.1, oldExact.continuousLowerBoundMm ?? 0);
  rows.push({ pair: [target.path, other.path], gateMm: exactGate, baseline: oldExact, candidate: exact, accepted: exact.accepted && oldExact.accepted && exact.continuousLowerBoundMm + 1e-7 >= exactGate });
}
checks.sweptClearanceAccepted = rows.length > 0 && rows.every((row) => row.accepted);
if (experiment === "center-web") checks.changedMaterialMarginAccepted = rows.filter((row) => row.candidate?.scope === "changed material only").every((row) => row.candidate.minimumMm >= 0.1) && centerWebRegionProof.minimumRadialClearanceMm >= 0.1;
const applicability = (key) => experiment === "center-web" || key !== "onlyCenterWheelGeometryChanged";
const accepted = Object.entries(checks).filter(([key]) => applicability(key)).every(([, value]) => value);
const inheritedZeroDistanceFindings = rows.filter((row) => row.baseline?.minimumMm === 0 && row.candidate?.minimumMm === 0).map((row) => ({ pair: row.pair, baselineWitnessDegrees: row.baseline.witnessDegrees, candidateWitnessDegrees: row.candidate.witnessDegrees, classification: "zero-distance condition exists in both frozen baseline and candidate; positive clearance is not established and a new penetration is not inferred" }));
const newlyFailedPreviouslyClearPairs = rows.filter((row) => row.baseline?.accepted === true && row.candidate?.accepted === false).map((row) => row.pair);
const report = { schema: "watch.train-design-clearance.v1", experiment, accepted, checkpointCommit, sourceFiles, checks, browserErrors, baselineExperiment: baseline.experiment, candidateExperiment: candidate.experiment, changedMeshes: changed.map(({ positions, index, ...row }) => row), candidateGeometrySha256: target.geometrySha256, baselineGeometrySha256: original.geometrySha256, centerWebRegionProof, inheritedZeroDistanceFindings, newlyFailedPreviouslyClearPairs, rows, exclusions, limitations: ["Explicit stationary support unions and bearing attachments are recorded separately from foreign parts.", "Bounds certify positive separation; conservative-bound comparison does not prove preservation of the exact inherited gap. Center-web rows may cover changed material only; unchanged working teeth have separate full-cycle evidence.", "Ambiguous moving/moving pairs require dedicated ratio-linked evidence.", "No physical tolerance, torque, or fabrication certification is claimed."] };
const reportPath = path.join(output, "foreign-solids-and-invariants.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ file: reportPath, accepted, checks, pairs: rows.length, exactPairs: rows.filter((row) => row.candidate?.sampleCount).length }, null, 2));

const meshReports = [];
const pairIds = ["barrel80-center12", "center64-third10", "third60-fourth8", "fourth56-escape7"];
if (process.env.GEAR_SWEEPS === "1" && accepted) {
  for (const pair of pairIds) {
    const file = path.join(output, `${pair}.json`);
    const result = spawnSync(process.execPath, ["scripts/audit-center-third-mesh.mjs", file, base], { stdio: "inherit", env: { ...process.env, EXPERIMENT: experiment, MESH_PAIR: pair, MESH_SAMPLES: "8193", SKIP_ADJACENT: "1", MESH_PHASE_DEG: "0", THIRD_PINION_PHASE_DEG: "0", SCAN_PHASE: "0" } });
    if (result.status !== 0) throw new Error(`train sweep failed: ${pair}`);
    meshReports.push(fileRow(file));
  }
} else if (process.env.USE_GEAR_REPORTS === "1") {
  for (const pair of pairIds) meshReports.push(fileRow(path.join(output, `${pair}.json`)));
}
const sourceByFile = new Map(sourceFiles.map((row) => [row.file, row.sha256]));
const pairReportsAccepted = meshReports.length === 4 && meshReports.every(({ file }, index) => {
  const r = JSON.parse(fs.readFileSync(file, "utf8"));
  return r.pairId === pairIds[index] && r.phaseOverrideDeg === 0 && r.experimentEvidence?.actual?.name === experiment
    && r.experimentEvidence.sourceFiles?.every((row) => sourceByFile.get(row.file) === row.sha256)
    && r.result?.sampleCount >= 8193 && r.result?.collisionSamples === 0 && r.result?.maximumIntersectionAreaMm2 === 0 && r.result?.minimumPositiveClearanceMm > 0
    && r.localRefinement?.sampleCount >= 2049 && r.localRefinement?.collisionSamples === 0 && r.localRefinement?.maximumIntersectionAreaMm2 === 0 && r.localRefinement?.minimumPositiveClearanceMm > 0
    && r.candidateGeometrySha256 === (experiment === "center-web" ? target.geometrySha256 : candidate.meshes.find((m) => m.name === "center:wheel")?.geometrySha256);
});
const manifest = { schema: "watch.train-design-evidence.v1", experiment, accepted: accepted && pairReportsAccepted, checkpointCommit, sourceFiles, candidateGeometrySha256: target.geometrySha256, checks: { ...checks, allFourTrainPairsAccepted: pairReportsAccepted }, meshReports, supportingReports: [fileRow(reportPath)] };
if (experiment === "center-web" || meshReports.length) fs.writeFileSync(path.join(output, "package-evidence.json"), `${JSON.stringify(manifest, null, 2)}\n`);
if (!accepted || ((process.env.GEAR_SWEEPS === "1" || process.env.USE_GEAR_REPORTS === "1") && !pairReportsAccepted)) process.exitCode = 1;
