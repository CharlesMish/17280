import * as THREE from "three";
import type { Vec2 } from "./spec";
import type { EnclosurePlan } from "./enclosurePlan";
import { finishedStructure, hoopShape, vecToShape } from "./structureGeometry";
import { offsetConvexExact } from "./accommodationMath";
import { ENC } from "./enclosureSpec";
import { EXT, EXT_FINISH } from "./exteriorSpec";
import { ensureTangents } from "./geometry";
import {
  applyCrownPocket,
  applyCrownRadialKeepout,
  crownRadiusAtX,
  extremumOnXSpan,
  growShoulder,
  type ExteriorPlan,
  type LugSide,
} from "./exteriorPlan";
import type { ExteriorFinishKind, ExteriorMaterials } from "./exteriorMaterials";

type BandUvKind = "sunburst" | "vertical" | "circular" | "frost" | "none";

function markFinish(mesh: THREE.Mesh, kind: ExteriorFinishKind | ExteriorFinishKind[]): void {
  if (Array.isArray(kind)) mesh.userData.finishSlots = kind;
  else mesh.userData.finishKind = kind;
}

function applyBandFinishUv(geo: THREE.BufferGeometry, kind: BandUvKind): void {
  if (kind === "none") return;
  const pos = geo.getAttribute("position");
  const nrm = geo.getAttribute("normal");
  if (!pos) return;
  const uv = new Float32Array(pos.count * 2);
  const mm =
    kind === "vertical"
      ? EXT_FINISH.brushMm
      : kind === "sunburst"
        ? EXT_FINISH.sunburstMm
        : kind === "circular"
          ? EXT_FINISH.circularMm
          : 4.2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nz = nrm ? nrm.getZ(i) : 1;
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x);
    if (kind === "frost") {
      if (Math.abs(nz) > 0.5) {
        uv[i * 2] = x / mm;
        uv[i * 2 + 1] = y / mm;
      } else {
        uv[i * 2] = z / mm;
        uv[i * 2 + 1] = a / Math.PI;
      }
    } else if (kind === "sunburst") {
      if (Math.abs(nz) > 0.5) {
        uv[i * 2] = r / mm;
        uv[i * 2 + 1] = a / Math.PI;
      } else {
        uv[i * 2] = z / EXT_FINISH.brushMm;
        uv[i * 2 + 1] = a / Math.PI;
      }
    } else if (kind === "circular") {
      if (Math.abs(nz) > 0.5) {
        uv[i * 2] = a / Math.PI;
        uv[i * 2 + 1] = r / mm;
      } else {
        uv[i * 2] = z / EXT_FINISH.brushMm;
        uv[i * 2 + 1] = a / Math.PI;
      }
    } else {
      if (Math.abs(nz) > 0.5) {
        // The old vertical-wall projection used constant Z over the cap and
        // collapsed one UV derivative. Keep vertical grain on walls while
        // giving horizontal closure faces a valid planar basis.
        uv[i * 2] = x / mm;
        uv[i * 2 + 1] = y / mm;
      } else {
        uv[i * 2] = z / mm;
        uv[i * 2 + 1] = a / Math.PI;
      }
    }
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.deleteAttribute("tangent");
}

function finishBandMesh(mesh: THREE.Mesh, uvKind: BandUvKind, kind: ExteriorFinishKind): void {
  applyBandFinishUv(mesh.geometry, uvKind);
  ensureTangents(mesh.geometry);
  markFinish(mesh, kind);
}

function bandMaterials(
  role: ExteriorPlan["bands"][number]["role"],
  mats: ExteriorMaterials,
): { face: THREE.MeshPhysicalMaterial; edge: THREE.MeshPhysicalMaterial; uv: BandUvKind; kind: ExteriorFinishKind } {
  if (role === "bezel") return { face: mats.bezelSatin, edge: mats.bezelSatin, uv: "sunburst", kind: "bezelSatin" };
  if (role === "chamfer") return { face: mats.polish, edge: mats.polish, uv: "none", kind: "polish" };
  if (role === "mid") return { face: mats.midSatin, edge: mats.midSatin, uv: "vertical", kind: "midSatin" };
  if (role === "waist") return { face: mats.waist, edge: mats.waist, uv: "frost", kind: "waist" };
  return { face: mats.casebackSatin, edge: mats.casebackSatin, uv: "circular", kind: "casebackSatin" };
}

function assignNormalGroups(
  geometry: THREE.BufferGeometry,
  classify: (n: THREE.Vector3, centroid: THREE.Vector3) => number,
  groupCount: number,
): void {
  const index = geometry.getIndex();
  const pos = geometry.getAttribute("position");
  if (!index || !pos) return;
  const buckets: number[][] = Array.from({ length: groupCount }, () => []);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const i0 = index.getX(i);
    const i1 = index.getX(i + 1);
    const i2 = index.getX(i + 2);
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    n.copy(ab.subVectors(b, a).cross(ac.subVectors(c, a))).normalize();
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    const g = Math.max(0, Math.min(groupCount - 1, classify(n, centroid)));
    buckets[g].push(i0, i1, i2);
  }
  geometry.setIndex(buckets.flat());
  geometry.clearGroups();
  let offset = 0;
  for (let g = 0; g < groupCount; g++) {
    geometry.addGroup(offset, buckets[g].length, g);
    offset += buckets[g].length;
  }
}

function assignLugFinishGroups(
  geo: THREE.BufferGeometry,
  holeY: number,
  holeZ: number,
  reserveR: number,
  yRoot: number,
  yTip: number,
): void {
  const span = yTip - yRoot || 1;
  assignNormalGroups(
    geo,
    (n, centroid) => {
      const radial = Math.hypot(centroid.y - holeY, centroid.z - holeZ);
      if (radial < reserveR + 0.12 && Math.abs(n.x) < 0.75) return 3;
      if (Math.abs(n.z) > 0.62) return 0;
      const along = (centroid.y - yRoot) / span;
      if (Math.abs(n.y) > 0.38 && along > 0.55) return 2;
      return 1;
    },
    4,
  );
}

function applyLugFinishUv(geo: THREE.BufferGeometry): void {
  const pos = geo.getAttribute("position");
  const nrm = geo.getAttribute("normal");
  if (!pos || !nrm) return;
  const uv = new Float32Array(pos.count * 2);
  const mm = EXT_FINISH.brushMm;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(nrm.getX(i));
    const ay = Math.abs(nrm.getY(i));
    const az = Math.abs(nrm.getZ(i));
    // Dominant-axis projection keeps both UV derivatives non-zero on every
    // broad horn family. The previous Y/X projection collapsed V on X-normal
    // side faces, leaving hundreds of UV-degenerate triangles for anisotropy.
    if (ax >= ay && ax >= az) {
      uv[i * 2] = y / mm;
      uv[i * 2 + 1] = z / mm;
    } else if (ay >= ax && ay >= az) {
      uv[i * 2] = x / mm;
      uv[i * 2 + 1] = z / mm;
    } else {
      uv[i * 2] = y / mm;
      uv[i * 2 + 1] = x / mm;
    }
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.deleteAttribute("tangent");
}

function assignCrownBodyGroups(geo: THREE.BufferGeometry): void {
  assignNormalGroups(geo, (n) => (Math.abs(n.x) > 0.48 ? 1 : 0), 2);
}

function innerPoly(plan: ExteriorPlan, kind: "frontOpening" | "rearExhibition" | "cavity"): Vec2[] {
  if (kind === "frontOpening") return plan.contours.bezelInner;
  if (kind === "rearExhibition") return plan.contours.casebackInner;
  return plan.kernel.cavity;
}

function circlePath(c: Vec2, r: number): THREE.Path {
  const path = new THREE.Path();
  path.absarc(c.x, c.y, r, 0, Math.PI * 2, false);
  return path;
}

function bandOuter(plan: ExteriorPlan, b: ExteriorPlan["bands"][number]): Vec2[] {
  if (b.role === "bezel") return plan.contours.bezelOuter;
  if (b.role === "mid") return plan.contours.midOuter;
  if (b.role === "waist") return plan.contours.waistOuter;
  if (b.role === "caseback") return plan.contours.casebackOuter;
  return offsetConvexExact(plan.kernel.outerWall, b.offset);
}

export function buildExteriorBands(plan: ExteriorPlan, mats: ExteriorMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "MidcaseExteriorPose";
  for (const b of plan.bands) {
    const outer = bandOuter(plan, b);
    const inner = innerPoly(plan, b.inner);
    const shape = hoopShape(outer, inner);
    if (b.fastenerPockets) {
      for (const a of plan.kernel.fastenerAxes) shape.holes.push(circlePath(a.xy, EXT.fastenerAccessR));
    }
    const h = Math.max(0.06, b.z1 - b.z0);
    const { face, edge, uv, kind } = bandMaterials(b.role, mats);
    const mesh = finishedStructure(shape, h, face, edge, 18);
    mesh.position.z = (b.z0 + b.z1) / 2;
    mesh.name = b.id;
    finishBandMesh(mesh, uv, kind);
    g.add(mesh);
  }

  const lip = finishedStructure(
    hoopShape(
      offsetConvexExact(plan.kernel.outerWall, plan.bands[0].offset + 0.04),
      offsetConvexExact(plan.kernel.outerWall, plan.bands[0].offset - 0.16),
    ),
    EXT.chamfer,
    mats.polish,
    mats.polish,
    16,
  );
  lip.position.z = plan.z.metalTop - EXT.chamfer * 0.45;
  lip.name = "ext:bezel-lip";
  markFinish(lip, "polish");
  g.add(lip);

  const waist = plan.bands.find((b) => b.role === "waist");
  const mid = plan.bands.find((b) => b.role === "mid");
  if (waist && mid) {
    const bevelZ0 = waist.z1 - 0.08;
    const bevelZ1 = mid.z0 + 0.28;
    const hornXLo = plan.lugs.strapWidth / 2;
    const hornXHi = hornXLo + plan.lugs.hornRootThick;
    const bevelOff = (mid.offset + waist.offset) * 0.5 + 0.06;
    const bevelGrow = 1.22 + (mid.offset - bevelOff);
    const xEast0 = hornXLo - 0.15;
    const xEast1 = hornXHi + 0.35;
    const xWest0 = -hornXHi - 0.35;
    const xWest1 = -hornXLo + 0.15;
    let bevelOuter = offsetConvexExact(plan.kernel.outerWall, bevelOff);
    bevelOuter = growShoulder(bevelOuter, xEast0, xEast1, bevelGrow, 1);
    bevelOuter = growShoulder(bevelOuter, xWest0, xWest1, bevelGrow, 1);
    bevelOuter = growShoulder(bevelOuter, xWest0, xWest1, -bevelGrow, -1);
    bevelOuter = growShoulder(bevelOuter, xEast0, xEast1, -bevelGrow, -1);
    bevelOuter = applyCrownPocket(bevelOuter, plan.crown.caseX, plan.crown.pocketDepth, plan.crown.pocketYHalf);
    bevelOuter = applyCrownRadialKeepout(bevelOuter, plan.crown, bevelZ0 - 0.18, bevelZ1 + 0.18, 0.36);
    const bevelInner = offsetConvexExact(plan.kernel.outerWall, waist.offset + 0.04);
    const bevelShape = hoopShape(bevelOuter, bevelInner);
    const geo = new THREE.ExtrudeGeometry(bevelShape, {
      depth: Math.max(0.12, bevelZ1 - bevelZ0),
      bevelEnabled: true,
      bevelThickness: 0.16,
      bevelSize: 0.16,
      bevelSegments: 3,
      curveSegments: 20,
    });
    geo.translate(0, 0, -(bevelZ1 - bevelZ0) / 2);
    geo.computeVertexNormals();
    const bevel = new THREE.Mesh(geo, [mats.polish, mats.polish]);
    bevel.position.z = (bevelZ0 + bevelZ1) / 2;
    bevel.name = "ext:waist-bevel";
    markFinish(bevel, "polish");
    g.add(bevel);
  }
  return g;
}

export function buildBezel(plan: ExteriorPlan, mats: ExteriorMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "FrontBezelExteriorPose";
  const ring = finishedStructure(
    hoopShape(offsetConvexExact(plan.contours.bezelInner, 0.18), plan.contours.bezelInner),
    0.16,
    mats.bezelSatin,
    mats.polish,
    14,
  );
  ring.position.z = plan.bands[0].z0 + 0.1;
  ring.name = "ext:bezel-inner-polish";
  finishBandMesh(ring, "sunburst", "bezelSatin");
  markFinish(ring, ["bezelSatin", "polish"]);
  g.add(ring);
  return g;
}

export function buildCaseback(plan: ExteriorPlan, mats: ExteriorMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "RearCasebackExteriorPose";
  const z1 = plan.bands[4].z1 - 0.08;
  let stepOuter = offsetConvexExact(plan.kernel.outerWall, plan.bands[4].offset + 0.22);
  stepOuter = applyCrownPocket(stepOuter, plan.crown.caseX, plan.crown.pocketDepth * 0.78, plan.crown.pocketYHalf);
  stepOuter = applyCrownRadialKeepout(stepOuter, plan.crown, z1 - 0.12, z1 + 0.12, 0.14);
  const mesh = finishedStructure(
    hoopShape(stepOuter, offsetConvexExact(plan.contours.casebackInner, 0.28)),
    0.14,
    mats.polish,
    mats.polish,
    14,
  );
  mesh.position.z = z1;
  mesh.name = "ext:caseback-step";
  markFinish(mesh, "polish");
  g.add(mesh);
  return g;
}

function signedArea(pts: Vec2[]): number {
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}

function flipWinding(geo: THREE.BufferGeometry): void {
  const idx = geo.getIndex();
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
    idx.needsUpdate = true;
    return;
  }
  const pos = geo.attributes.position;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i + 1);
    b.fromBufferAttribute(pos, i + 2);
    pos.setXYZ(i + 1, b.x, b.y, b.z);
    pos.setXYZ(i + 2, a.x, a.y, a.z);
  }
  pos.needsUpdate = true;
}

function distPointSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 < 1e-16 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  return Math.hypot(apx - abx * t, apy - aby * t);
}

function segsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const cr = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cr(a, b, c);
  const d2 = cr(a, b, d);
  const d3 = cr(c, d, a);
  const d4 = cr(c, d, b);
  return (
    ((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) &&
    ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12))
  );
}

function profileSelfIntersects(outer: Vec2[]): boolean {
  const n = outer.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adj = Math.abs(i - j) <= 1 || (i === 0 && j === n - 1) || (i === n - 1 && j === 0);
      if (adj) continue;
      if (segsCross(outer[i], outer[(i + 1) % n], outer[j], outer[(j + 1) % n])) return true;
    }
  }
  return false;
}

export type HornMeshReport = {
  name: string;
  components: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  triangles: number;
  weldedVertices: number;
  profileSelfIntersects: boolean;
  minCenterToOuter: number;
  holeClearance: number;
  outwardOk: boolean;
  rootJoin: {
    minEmbedMid: number;
    minEmbedWaist: number;
    maxAirGap: number;
    samples: number;
  };
};

function normalsPointOutward(geo: THREE.BufferGeometry): boolean {
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return true;
  const center = box.getCenter(new THREE.Vector3());
  const pos = geo.attributes.position;
  const idx = geo.getIndex();
  const triIndex = (i: number) => (idx ? idx.getX(i) : i);
  const nTri = Math.floor((idx ? idx.count : pos.count) / 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  const cent = new THREE.Vector3();
  let score = 0;
  for (let t = 0; t < nTri; t++) {
    a.fromBufferAttribute(pos, triIndex(t * 3));
    b.fromBufferAttribute(pos, triIndex(t * 3 + 1));
    c.fromBufferAttribute(pos, triIndex(t * 3 + 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac);
    cent.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    cent.sub(center);
    const d = n.dot(cent);
    if (d > 1e-10) score += 1;
    else if (d < -1e-10) score -= 1;
  }
  return score > 0;
}

function analyzeHornMesh(geo: THREE.BufferGeometry): Omit<
  HornMeshReport,
  "name" | "profileSelfIntersects" | "minCenterToOuter" | "holeClearance" | "rootJoin"
> {
  const pos = geo.attributes.position;
  const idx = geo.getIndex();
  const empty = { components: -1, boundaryEdges: -1, nonManifoldEdges: -1, triangles: 0, weldedVertices: 0, outwardOk: false };
  if (pos.count < 3) return empty;
  const triIndex = (i: number) => (idx ? idx.getX(i) : i);
  const indexCount = idx ? idx.count : pos.count;
  if (indexCount < 3) return empty;

  const weld = new Map<string, number>();
  const map = new Int32Array(pos.count);
  let nW = 0;
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    let id = weld.get(k);
    if (id === undefined) {
      id = nW++;
      weld.set(k, id);
    }
    map[i] = id;
  }

  const edgeFaces = new Map<string, number>();
  const edgeToFace = new Map<string, number[]>();
  const nTri = Math.floor(indexCount / 3);
  const parent = new Int32Array(nTri);
  for (let t = 0; t < nTri; t++) parent[t] = t;
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };

  for (let t = 0; t < nTri; t++) {
    const i0 = map[triIndex(t * 3)];
    const i1 = map[triIndex(t * 3 + 1)];
    const i2 = map[triIndex(t * 3 + 2)];
    if (i0 === i1 || i1 === i2 || i2 === i0) continue;
    const es: [number, number][] = [
      [i0, i1],
      [i1, i2],
      [i2, i0],
    ];
    for (const [a, b] of es) {
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      edgeFaces.set(k, (edgeFaces.get(k) ?? 0) + 1);
      const arr = edgeToFace.get(k) ?? [];
      arr.push(t);
      edgeToFace.set(k, arr);
    }
  }
  for (const faces of edgeToFace.values()) {
    for (let i = 1; i < faces.length; i++) {
      const ia = find(faces[0]);
      const ib = find(faces[i]);
      if (ia !== ib) parent[ia] = ib;
    }
  }
  const roots = new Set<number>();
  for (let t = 0; t < nTri; t++) roots.add(find(t));

  let boundary = 0;
  let nonMan = 0;
  for (const c of edgeFaces.values()) {
    if (c === 1) boundary++;
    else if (c > 2) nonMan++;
  }

  const outwardOk = normalsPointOutward(geo);

  return {
    components: roots.size,
    boundaryEdges: boundary,
    nonManifoldEdges: nonMan,
    triangles: nTri,
    weldedVertices: nW,
    outwardOk,
  };
}

/**
 * Closed YZ horn silhouette. Shape x = world Z, shape y = world Y.
 * One faceted load path: embedded root → tapered web → blocky terminal → distal chamfers.
 * The spring-bar hole is a circular bore through that terminal mass, not a concentric annulus.
 */
function hornProfile(
  side: LugSide,
  plan: ExteriorPlan,
  barY: number,
  barZ: number,
): { outer: Vec2[]; hole: Vec2; minCenterToOuter: number } {
  const s = side.side === "north" ? 1 : -1;
  const reserve = plan.lugs.bars[0].reserveR;
  const surround = plan.lugs.surround;
  const eyeR = reserve + surround;
  const yIn = side.yRoot - s * side.embed;
  const yShoulder = side.yRoot + s * 0.42;
  // Parallel-sided terminal begins before the bore so the hole sits in mass, not in a ring.
  const yJoin = barY - s * (reserve + 0.52);
  const yFlat = barY + s * (eyeR - 0.16);
  const yTip = side.yTip;
  const zRb = plan.lugs.rootZ0;
  const zRf = plan.lugs.rootZ1;
  // Underside must reach barZ-eyeR so the bore keeps minimum surround.
  const zTb = barZ - eyeR;
  // Keep the dial-side face high so the horn stays a tall slab; the bore
  // sits in that mass instead of defining a dropped annular eye.
  const zTf = zRf - 0.42;
  const chamfer = 0.36;

  const outer: Vec2[] = [
    { x: zRb, y: yIn },
    { x: zRf, y: yIn },
    { x: zRf, y: yShoulder },
    { x: zTf, y: yJoin },
    { x: zTf, y: yFlat },
    { x: zTf - chamfer, y: yTip },
    { x: zTb + chamfer, y: yTip },
    { x: zTb, y: yFlat },
    { x: zTb, y: yJoin },
    { x: zRb, y: side.yRoot + s * 0.12 },
  ];
  if (signedArea(outer) < 0) outer.reverse();
  const hole = { x: barZ, y: barY };
  let minCenterToOuter = Infinity;
  for (let i = 0; i < outer.length; i++) {
    minCenterToOuter = Math.min(minCenterToOuter, distPointSeg(hole, outer[i], outer[(i + 1) % outer.length]));
  }
  return { outer, hole, minCenterToOuter };
}

function makeHornGeometry(
  side: LugSide,
  xInner: number,
  xOuterRoot: number,
  xOuterTip: number,
  plan: ExteriorPlan,
  barY: number,
  barZ: number,
): { geo: THREE.BufferGeometry; report: HornMeshReport } {
  const { outer, hole, minCenterToOuter } = hornProfile(side, plan, barY, barZ);
  const name = `ext:lug-${side.side}-${xInner > 0 ? "east" : "west"}`;
  const shape = new THREE.Shape();
  shape.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i].x, outer[i].y);
  shape.closePath();
  const holePath = new THREE.Path();
  holePath.absarc(hole.x, hole.y, plan.lugs.bars[0].reserveR, 0, Math.PI * 2, true);
  shape.holes.push(holePath);
  const depth = Math.abs(xOuterRoot - xInner);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
    curveSegments: 28,
  });
  const y0 = side.yRoot;
  const y1 = side.yTip;
  const s = side.side === "north" ? 1 : -1;
  const yBlend = y0 + s * 0.65;
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = Math.max(0, Math.min(1, (v.y - y0) / (y1 - y0 || 1)));
    const u = Math.max(0, Math.min(1, v.z / depth));
    const rootW = rootBlendWeight(v.y, y0, yBlend, s);
    const span = xOuterRoot + (xOuterTip - xOuterRoot) * t - xInner;
    const worldX = xInner + span * u;
    const wallShift = wallYAtX(plan.contours.midOuter, worldX, side) - y0;
    const worldY = v.y + wallShift * rootW;
    pos.setXYZ(i, worldX, worldY, v.x);
  }
  if (!normalsPointOutward(geo)) flipWinding(geo);
  geo.computeVertexNormals();
  const topo = analyzeHornMesh(geo);
  return {
    geo,
    report: {
      name,
      ...topo,
      profileSelfIntersects: profileSelfIntersects(outer),
      minCenterToOuter,
      holeClearance: minCenterToOuter - plan.lugs.bars[0].reserveR,
      rootJoin: measureRootJoin(plan, side, xInner, xOuterRoot),
    },
  };
}

function rootBlendWeight(y: number, yRoot: number, yBlend: number, s: number): number {
  if (s * (y - yRoot) <= 0) return 1;
  if (s * (y - yBlend) >= 0) return 0;
  const den = yBlend - yRoot;
  if (Math.abs(den) < 1e-12) return 0;
  return 1 - (y - yRoot) / den;
}

function wallYAtX(poly: Vec2[], x: number, side: LugSide): number {
  const mode = side.side === "north" ? "max" : "min";
  return extremumOnXSpan(poly, x - 0.04, x + 0.04, mode).y;
}

function measureRootJoin(
  plan: ExteriorPlan,
  side: LugSide,
  xInner: number,
  xOuterRoot: number,
): HornMeshReport["rootJoin"] {
  const s = side.side === "north" ? 1 : -1;
  let minEmbedMid = Infinity;
  let minEmbedWaist = Infinity;
  let maxAirGap = 0;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = xInner + (xOuterRoot - xInner) * (i / (n - 1));
    const midY = wallYAtX(plan.contours.midOuter, x, side);
    const waistY = wallYAtX(plan.contours.waistOuter, x, side);
    const face = midY - s * side.embed;
    minEmbedMid = Math.min(minEmbedMid, s * (midY - face));
    minEmbedWaist = Math.min(minEmbedWaist, s * (waistY - face));
    maxAirGap = Math.max(maxAirGap, Math.max(0, s * (face - midY), s * (face - waistY)));
  }
  return { minEmbedMid, minEmbedWaist, maxAirGap, samples: n };
}

function profileZAtY(outer: Vec2[], y: number): { zLo: number; zHi: number } | null {
  const zs: number[] = [];
  const n = outer.length;
  for (let i = 0; i < n; i++) {
    const a = outer[i];
    const b = outer[(i + 1) % n];
    const dy = b.y - a.y;
    if (Math.abs(dy) < 1e-12) {
      if (Math.abs(a.y - y) < 1e-8) zs.push(a.x, b.x);
      continue;
    }
    const t = (y - a.y) / dy;
    if (t >= -1e-8 && t <= 1 + 1e-8) zs.push(a.x + t * (b.x - a.x));
  }
  if (zs.length < 2) return null;
  return { zLo: Math.min(...zs), zHi: Math.max(...zs) };
}

function sectionWafer(
  y: number,
  zLo: number,
  zHi: number,
  x0: number,
  x1: number,
  hole: { z: number; half: number } | null,
  mat: THREE.Material,
  name: string,
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(x0, zLo);
  shape.lineTo(x1, zLo);
  shape.lineTo(x1, zHi);
  shape.lineTo(x0, zHi);
  shape.closePath();
  if (hole && hole.half > 0.04) {
    const hp = new THREE.Path();
    const inset = 0.015;
    hp.moveTo(x0 + inset, hole.z - hole.half);
    hp.lineTo(x1 - inset, hole.z - hole.half);
    hp.lineTo(x1 - inset, hole.z + hole.half);
    hp.lineTo(x0 + inset, hole.z + hole.half);
    hp.closePath();
    shape.holes.push(hp);
  }
  const thick = 0.1;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 2 });
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    pos.setXYZ(i, v.x, y - thick * 0.5 + v.z, v.y);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  return mesh;
}

function polyRangeAtX(poly: Vec2[], x: number, mode: "max" | "min"): number | null {
  const hit = extremumOnXSpan(poly, x - 0.05, x + 0.05, mode);
  return Number.isFinite(hit.y) ? hit.y : null;
}

function polyXsAtY(poly: Vec2[], y: number): number[] {
  const xs: number[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dy = b.y - a.y;
    if (Math.abs(dy) < 1e-12) continue;
    const t = (y - a.y) / dy;
    if (t >= -1e-8 && t <= 1 + 1e-8) xs.push(a.x + t * (b.x - a.x));
  }
  return xs;
}

function yzSlice(
  x: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  mat: THREE.Material,
  name: string,
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(y0, z0);
  shape.lineTo(y1, z0);
  shape.lineTo(y1, z1);
  shape.lineTo(y0, z1);
  shape.closePath();
  const thick = 0.08;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 1 });
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    pos.setXYZ(i, x - thick * 0.5 + v.z, v.x, v.y);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.userData.diag = "root";
  return mesh;
}

export function buildLugDiagnostics(plan: ExteriorPlan, mats: ExteriorMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "ext:lugDiag";
  g.visible = false;
  const l = plan.lugs;
  const north = l.sides[0];
  const barY = l.bars[0].axisY;
  const barZ = l.bars[0].axisZ;
  const reserve = l.bars[0].reserveR;
  const { outer } = hornProfile(north, plan, barY, barZ);
  const s = 1;
  const stations: { id: string; y: number }[] = [
    { id: "root", y: north.yRoot + s * 0.28 },
    { id: "web", y: barY - s * (reserve + 0.58) },
    { id: "eye", y: barY },
  ];
  const xInner = l.strapWidth / 2;
  const y0 = north.yRoot;
  const y1 = north.yTip;
  for (const st of stations) {
    const span = profileZAtY(outer, st.y);
    if (!span) continue;
    const t = Math.max(0, Math.min(1, (st.y - y0) / (y1 - y0 || 1)));
    const xOuter = xInner + l.hornRootThick + (l.hornTipThick - l.hornRootThick) * t;
    const dy = st.y - barY;
    const insideHole = Math.abs(dy) < reserve - 1e-6;
    const hole = insideHole ? { z: barZ, half: Math.sqrt(Math.max(0, reserve * reserve - dy * dy)) } : null;
    const wafer = sectionWafer(st.y, span.zLo, span.zHi, xInner, xOuter, hole, mats.section, `ext:lug-section-${st.id}`);
    wafer.userData.diag = "horn";
    g.add(wafer);
  }

  // Centerline join: YZ at mid-horn X. Case band wall vs horn embed.
  const xMid = xInner + l.hornRootThick * 0.5;
  const wallY = wallYAtX(plan.contours.midOuter, xMid, north);
  const yIn = wallY - north.embed;
  const midInnerY = polyRangeAtX(plan.kernel.cavity, xMid, "max");
  for (const b of plan.bands) {
    if (b.role !== "mid" && b.role !== "waist" && b.role !== "caseback") continue;
    const outerY = polyRangeAtX(bandOuter(plan, b), xMid, "max");
    const innerY = midInnerY ?? (outerY !== null ? outerY - 2.4 : null);
    if (outerY === null || innerY === null) continue;
    const lo = Math.min(innerY, outerY);
    const hi = Math.max(innerY, outerY);
    g.add(yzSlice(xMid, lo, hi, b.z0, b.z1, mats.kernel, `ext:root-case-${b.role}`));
  }
  const hornZ = profileZAtY(outer, (yIn + wallY) * 0.5);
  if (hornZ) {
    g.add(yzSlice(xMid, yIn, wallY + 0.42, hornZ.zLo, hornZ.zHi, mats.section, "ext:root-horn-centerline"));
  }

  // Transverse join: XZ just inside the wall.
  const yCut = north.yRoot - 0.7;
  const spanCut = profileZAtY(outer, yCut);
  const midXs = polyXsAtY(plan.contours.midOuter, yCut).sort((a, b) => a - b);
  if (spanCut) {
    const wafer = sectionWafer(
      yCut,
      spanCut.zLo,
      spanCut.zHi,
      xInner - 0.2,
      xInner + l.hornRootThick + 0.22,
      null,
      mats.section,
      "ext:root-horn-transverse",
    );
    wafer.userData.diag = "root";
    g.add(wafer);
  }
  if (midXs.length >= 2) {
    const east = midXs.filter((x) => x > 0);
    if (east.length >= 1) {
      const xLo = Math.min(...east) - 0.15;
      const xHi = Math.max(...east) + 0.15;
      const midBand = plan.bands.find((b) => b.role === "mid");
      if (midBand) {
        const caseWafer = sectionWafer(
          yCut,
          midBand.z0,
          midBand.z1,
          xLo,
          xHi,
          null,
          mats.kernel,
          "ext:root-case-transverse",
        );
        caseWafer.userData.diag = "root";
        g.add(caseWafer);
      }
    }
  }

  const c = plan.crown;
  const join = crownJoinLayout(plan);
  const span = Math.max(0.35, join.socketX1 - join.socketX0);
  const socketMeridian: Vec2[] = [
    { x: join.socketX0, y: c.axis.z + join.socketMaxR * 0.92 },
    { x: join.socketX0 + Math.min(0.22, span * 0.28), y: c.axis.z + join.socketMaxR },
    { x: join.socketX0 + span * 0.62, y: c.axis.z + join.socketMaxR },
    { x: join.socketX1, y: c.axis.z + join.socketMouthR },
    { x: join.socketX1, y: c.axis.z - join.socketMouthR },
    { x: join.socketX0 + span * 0.62, y: c.axis.z - join.socketMaxR },
    { x: join.socketX0 + Math.min(0.22, span * 0.28), y: c.axis.z - join.socketMaxR },
    { x: join.socketX0, y: c.axis.z - join.socketMaxR * 0.92 },
  ];
  g.add(xzWafer(socketMeridian, c.axis.y, mats.section, "ext:crown-section-socket"));
  const bodyMeridian: Vec2[] = [
    { x: c.neckX0, y: c.axis.z + c.neckR * 0.78 },
    { x: c.bodyX0, y: c.axis.z + c.neckR },
    { x: c.bodyX0 + 0.48, y: c.axis.z + c.bodyR },
    { x: c.bodyX1 - 0.28, y: c.axis.z + c.bodyR },
    { x: c.bodyX1, y: c.axis.z + c.bodyR * 0.62 },
    { x: c.bodyX1, y: c.axis.z - c.bodyR * 0.62 },
    { x: c.bodyX1 - 0.28, y: c.axis.z - c.bodyR },
    { x: c.bodyX0 + 0.48, y: c.axis.z - c.bodyR },
    { x: c.bodyX0, y: c.axis.z - c.neckR },
    { x: c.neckX0, y: c.axis.z - c.neckR * 0.78 },
  ];
  g.add(xzWafer(bodyMeridian, c.axis.y, mats.section, "ext:crown-section-body"));
  for (const b of plan.bands) {
    if (b.role !== "mid" && b.role !== "waist" && b.role !== "caseback") continue;
    const outerXs = polyXsAtY(bandOuter(plan, b), c.axis.y);
    const innerXs = polyXsAtY(plan.kernel.cavity, c.axis.y);
    const outerX = outerXs.length ? Math.max(...outerXs) : null;
    const innerX = innerXs.length ? Math.max(...innerXs) : null;
    if (outerX === null || innerX === null) continue;
    const bandPoly: Vec2[] = [
      { x: innerX, y: b.z0 },
      { x: outerX, y: b.z0 },
      { x: outerX, y: b.z1 },
      { x: innerX, y: b.z1 },
    ];
    g.add(xzWafer(bandPoly, c.axis.y, mats.kernel, `ext:crown-section-case-${b.role}`));
  }
  return g;
}

function xzWafer(poly: Vec2[], y: number, mat: THREE.Material, name: string): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i].x, poly[i].y);
  shape.closePath();
  const thick = 0.08;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 1 });
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    pos.setXYZ(i, v.x, y - thick * 0.5 + v.z, v.y);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.userData.diag = "crown";
  return mesh;
}

export function buildLugs(plan: ExteriorPlan, mats: ExteriorMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "LugPose";
  const l = plan.lugs;
  const [north, south] = l.sides;
  const rootT = l.hornRootThick;
  const tipT = l.hornTipThick;
  const inner = l.strapWidth / 2;
  const pairs: { side: LugSide; xInner: number; xOuterRoot: number; xOuterTip: number; barY: number }[] = [
    { side: north, xInner: inner, xOuterRoot: inner + rootT, xOuterTip: inner + tipT, barY: l.bars[0].axisY },
    { side: north, xInner: -inner, xOuterRoot: -(inner + rootT), xOuterTip: -(inner + tipT), barY: l.bars[0].axisY },
    { side: south, xInner: inner, xOuterRoot: inner + rootT, xOuterTip: inner + tipT, barY: l.bars[1].axisY },
    { side: south, xInner: -inner, xOuterRoot: -(inner + rootT), xOuterTip: -(inner + tipT), barY: l.bars[1].axisY },
  ];
  const reports: HornMeshReport[] = [];
  for (const p of pairs) {
    const { geo, report } = makeHornGeometry(p.side, p.xInner, p.xOuterRoot, p.xOuterTip, plan, p.barY, l.bars[0].axisZ);
    assignLugFinishGroups(geo, p.barY, l.bars[0].axisZ, l.bars[0].reserveR, p.side.yRoot, p.side.yTip);
    applyLugFinishUv(geo);
    geo.computeVertexNormals();
    ensureTangents(geo);
    const mesh = new THREE.Mesh(geo, [mats.lugTop, mats.lugSide, mats.lugTerm, mats.lugBore]);
    mesh.name = report.name;
    markFinish(mesh, ["lugTop", "lugSide", "lugTerm", "lugBore"]);
    g.add(mesh);
    reports.push(report);
  }
  g.userData.hornReports = reports;
  for (const bar of l.bars) {
    const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, bar.x1 - bar.x0, 10), mats.axis);
    axis.rotation.z = Math.PI / 2;
    axis.position.set(0, bar.axisY, bar.axisZ);
    axis.name = bar.id;
    axis.userData.truthOnly = true;
    g.add(axis);
  }
  return g;
}

export type CrownJoinReport = {
  socketX0: number;
  socketX1: number;
  socketMaxR: number;
  socketMouthR: number;
  operatingGap: number;
  caseEmbedWaist: number;
  caseEmbedMid: number;
  caseAirGap: number;
  crownPenetration: number;
  axisDrift: number;
  bodyR: number;
  projection: number;
};

export type CrownRootCollarReport = {
  mesh: "ext:crown-root-collar";
  fixed: true;
  worldBounds: { min: [number, number, number]; max: [number, number, number] };
  radialMax: number;
  socketAxialOverlap: number;
  waistAxialEmbed: number;
  midAxialEmbed: number;
  bandZOverlap: { mid: number; waist: number; caseback: number; waistBevel: number };
  reserveToSocketMouth: number;
  reserveToRotatingNeck: number;
  operatingGapUnchanged: number;
  socketSegments: number;
  collarSegments: number;
};

export type CrownCapClosureReport = {
  bodyMesh: "ext:crown-body";
  capMesh: "ext:crown-cap";
  capIsSoleEndClosure: true;
  bodySegments: number;
  capSegments: number;
  segmentMatch: true;
  capRadius: number;
  bodyBoundaryRadius: number;
  boundaryRadialDelta: number;
  boundaryAxialDelta: number;
  projectedFaceOverlapArea: number;
  polishedShoulderOuterRadius: number;
  polishedShoulderAnnulusWidth: number;
  bodyX1: number;
  crownBodyRadius: number;
};

/** Compact fixed seat. Ends before the rotating crown; never larger than the body. */
export function crownJoinLayout(plan: ExteriorPlan): CrownJoinReport {
  const c = plan.crown;
  const operatingGap = 0.1;
  const socketMaxR = 1.3;
  const socketMouthR = 1.22;
  const socketX1 = c.neckX0 - operatingGap;
  const waistXs = polyXsAtY(plan.contours.waistOuter, c.axis.y);
  const midXs = polyXsAtY(plan.contours.midOuter, c.axis.y);
  const waistX = waistXs.length ? Math.max(...waistXs) : c.caseX - c.pocketDepth;
  const midX = midXs.length ? Math.max(...midXs) : c.caseX;
  const socketX0 = Math.min(waistX - 0.34, socketX1 - 0.62);
  return {
    socketX0,
    socketX1,
    socketMaxR,
    socketMouthR,
    operatingGap,
    caseEmbedWaist: waistX - socketX0,
    caseEmbedMid: midX - socketX0,
    caseAirGap: Math.max(0, socketX0 - waistX, socketX0 - midX),
    crownPenetration: Math.max(0, socketX1 - c.neckX0),
    axisDrift: Math.hypot(c.axis.y, 0),
    bodyR: c.bodyR,
    projection: c.projection,
  };
}

export function buildCrown(plan: ExteriorPlan, mats: ExteriorMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "CrownExteriorPose";
  const c = plan.crown;
  const join = crownJoinLayout(plan);
  const span = Math.max(0.35, join.socketX1 - join.socketX0);
  const socketPts: THREE.Vector2[] = [
    new THREE.Vector2(0.02, 0),
    new THREE.Vector2(join.socketMaxR * 0.92, 0),
    new THREE.Vector2(join.socketMaxR, Math.min(0.22, span * 0.28)),
    new THREE.Vector2(join.socketMaxR, span * 0.62),
    new THREE.Vector2(join.socketMouthR, span),
    new THREE.Vector2(0.02, span),
  ];
  // The fixed socket and its root collar share one radial tessellation so the
  // load path reads as a continuous machined seat instead of two faceted
  // silhouettes. Multiples of four retain the exact cardinal AABB extrema.
  const socketSegments = 32;
  const socketGeo = new THREE.LatheGeometry(socketPts, socketSegments);
  socketGeo.rotateZ(-Math.PI / 2);
  const socket = new THREE.Mesh(socketGeo, mats.socket);
  socket.position.set(join.socketX0, c.axis.y, c.axis.z);
  socket.name = "ext:crown-socket";
  socket.userData.crownJoin = join;
  markFinish(socket, "socket");
  g.add(socket);

  // The independently crown-retracted case bands leave a visible termination
  // immediately behind the fixed socket. Close only that fixed load path with
  // a compact coaxial fillet: its inboard half is buried in the existing
  // waist/mid mass, while its outboard half positively overlaps the socket.
  // It never exceeds the socket's frozen radial envelope and stops well before
  // the socket mouth, so the 0.10 mm socket-to-rotating-neck gap is untouched.
  const collarInboard = 0.24;
  const collarSocketOverlap = Math.min(0.22, span * 0.28);
  const collarX0 = join.socketX0 - collarInboard;
  const collarX1 = join.socketX0 + collarSocketOverlap;
  const collarPts: THREE.Vector2[] = [
    new THREE.Vector2(0.02, 0),
    new THREE.Vector2(join.socketMaxR * 0.69, 0),
    new THREE.Vector2(join.socketMaxR * 0.78, 0.08),
    new THREE.Vector2(join.socketMaxR * 0.87, 0.18),
    new THREE.Vector2(join.socketMaxR * 0.93, collarInboard),
    new THREE.Vector2(join.socketMaxR * 0.975, collarInboard + collarSocketOverlap * 0.55),
    new THREE.Vector2(join.socketMaxR, collarInboard + collarSocketOverlap),
    new THREE.Vector2(0.02, collarInboard + collarSocketOverlap),
  ];
  const collarGeo = new THREE.LatheGeometry(collarPts, socketSegments);
  collarGeo.rotateZ(-Math.PI / 2);
  collarGeo.computeVertexNormals();
  const collar = new THREE.Mesh(collarGeo, mats.socket);
  collar.position.set(collarX0, c.axis.y, c.axis.z);
  collar.name = "ext:crown-root-collar";
  collar.userData.fixedCaseJoin = true;
  markFinish(collar, "socket");
  g.add(collar);

  collarGeo.computeBoundingBox();
  const collarBounds = collarGeo.boundingBox!.clone().translate(collar.position);
  const bandOverlap = (role: "mid" | "waist" | "caseback"): number => {
    const band = plan.bands.find((candidate) => candidate.role === role);
    return band
      ? Math.max(0, Math.min(collarBounds.max.z, band.z1) - Math.max(collarBounds.min.z, band.z0))
      : 0;
  };
  const waistBand = plan.bands.find((candidate) => candidate.role === "waist");
  const midBand = plan.bands.find((candidate) => candidate.role === "mid");
  const waistBevelZ0 = waistBand ? waistBand.z1 - 0.08 : 0;
  const waistBevelZ1 = midBand ? midBand.z0 + 0.28 : 0;
  const collarReport: CrownRootCollarReport = {
    mesh: "ext:crown-root-collar",
    fixed: true,
    worldBounds: {
      min: collarBounds.min.toArray() as [number, number, number],
      max: collarBounds.max.toArray() as [number, number, number],
    },
    radialMax: join.socketMaxR,
    socketAxialOverlap: collarX1 - join.socketX0,
    waistAxialEmbed: join.socketX0 + join.caseEmbedWaist - collarX0,
    midAxialEmbed: join.socketX0 + join.caseEmbedMid - collarX0,
    bandZOverlap: {
      mid: bandOverlap("mid"),
      waist: bandOverlap("waist"),
      caseback: bandOverlap("caseback"),
      waistBevel: Math.max(
        0,
        Math.min(collarBounds.max.z, waistBevelZ1) - Math.max(collarBounds.min.z, waistBevelZ0),
      ),
    },
    reserveToSocketMouth: join.socketX1 - collarX1,
    reserveToRotatingNeck: c.neckX0 - collarX1,
    operatingGapUnchanged: c.neckX0 - join.socketX1,
    socketSegments,
    collarSegments: socketSegments,
  };
  collar.userData.crownRootCollar = collarReport;
  g.userData.crownRootCollar = collarReport;

  const bodySegments = 36;
  const capSegments = bodySegments;
  const capRadius = c.bodyR * 0.58;
  const polishedShoulderOuterRadius = c.bodyR * 0.62;
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.02, 0),
    new THREE.Vector2(c.neckR * 0.78, 0),
    new THREE.Vector2(c.neckR, c.bodyX0 - c.neckX0),
    new THREE.Vector2(c.bodyR - 0.2, c.bodyX0 - c.neckX0 + 0.22),
    new THREE.Vector2(c.bodyR, c.bodyX0 - c.neckX0 + 0.48),
    new THREE.Vector2(c.bodyR, c.bodyX1 - c.neckX0 - 0.28),
    new THREE.Vector2(c.bodyR - 0.22, c.bodyX1 - c.neckX0 - 0.08),
    new THREE.Vector2(polishedShoulderOuterRadius, c.bodyX1 - c.neckX0),
    // The identity cap is the sole front closure. End the lathe on its exact
    // perimeter rather than closing a second disk behind it: the former
    // 0.01 mm axial step and overlapping transmissive-looking metal faces
    // made this same-steel joint read as a detached crown-cap seam.
    new THREE.Vector2(capRadius, c.bodyX1 - c.neckX0),
  ];
  const lathe = new THREE.LatheGeometry(pts, bodySegments);
  lathe.rotateZ(-Math.PI / 2);
  assignCrownBodyGroups(lathe);
  lathe.computeVertexNormals();
  ensureTangents(lathe);
  const body = new THREE.Mesh(lathe, [mats.crown, mats.crownShoulder]);
  body.position.set(c.neckX0, c.axis.y, c.axis.z);
  body.name = "ext:crown-body";
  markFinish(body, ["crown", "crownShoulder"]);
  g.add(body);
  g.userData.crownBodyMesh = {
    ...analyzeHornMesh(lathe),
    fluteRhoMax: 0,
    fluteProud: false,
  };
  const envGeo = new THREE.LatheGeometry(pts, 48);
  envGeo.rotateZ(-Math.PI / 2);
  const env = new THREE.Mesh(envGeo, mats.keepout);
  env.position.set(c.neckX0, c.axis.y, c.axis.z);
  env.name = "ext:crown-keepout";
  env.userData.keepout = true;
  env.visible = false;
  g.add(env);
  const cap = new THREE.Mesh(new THREE.CircleGeometry(capRadius, capSegments), mats.crownCap);
  cap.rotation.y = Math.PI / 2;
  cap.position.set(c.bodyX1, c.axis.y, c.axis.z);
  cap.name = "ext:crown-cap";
  markFinish(cap, "crownCap");
  g.add(cap);
  const crownCapClosure: CrownCapClosureReport = {
    bodyMesh: "ext:crown-body",
    capMesh: "ext:crown-cap",
    capIsSoleEndClosure: true,
    bodySegments,
    capSegments,
    segmentMatch: true,
    capRadius,
    bodyBoundaryRadius: capRadius,
    boundaryRadialDelta: 0,
    boundaryAxialDelta: 0,
    projectedFaceOverlapArea: 0,
    polishedShoulderOuterRadius,
    polishedShoulderAnnulusWidth: polishedShoulderOuterRadius - capRadius,
    bodyX1: c.bodyX1,
    crownBodyRadius: c.bodyR,
  };
  body.userData.crownCapClosure = crownCapClosure;
  cap.userData.crownCapClosure = crownCapClosure;
  g.userData.crownCapClosure = crownCapClosure;
  // Grooves stay inside the cylindrical band so square box-ends do not
  // tab past the lathe tapers or stand proud of bodyR.
  const cyl0 = c.bodyX0 + 0.55;
  const cyl1 = c.bodyX1 - 0.42;
  const fluteLen = Math.max(0.35, cyl1 - cyl0);
  for (let i = 0; i < c.flutes; i++) {
    const a = (i / c.flutes) * Math.PI * 2;
    const flute = new THREE.Mesh(new THREE.BoxGeometry(fluteLen, 0.07, 0.08), mats.crownFlute);
    flute.position.set(
      (cyl0 + cyl1) * 0.5,
      c.axis.y + Math.sin(a) * (c.bodyR - 0.07),
      c.axis.z + Math.cos(a) * (c.bodyR - 0.07),
    );
    flute.rotation.x = a;
    flute.name = `ext:crown-flute-${i}`;
    markFinish(flute, "flute");
    g.add(flute);
  }
  let fluteRhoMax = 0;
  const fv = new THREE.Vector3();
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.name.startsWith("ext:crown-flute")) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      fv.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const rho = Math.hypot(fv.y - c.axis.y, fv.z - c.axis.z);
      if (rho > fluteRhoMax) fluteRhoMax = rho;
    }
  });
  const meshInfo = g.userData.crownBodyMesh as { fluteRhoMax: number; fluteProud: boolean };
  meshInfo.fluteRhoMax = fluteRhoMax;
  meshInfo.fluteProud = fluteRhoMax > c.bodyR + 0.02;
  return g;
}

export type CrownKeepoutHit = {
  mesh: string;
  minClearance: number;
  intersects: boolean;
  at: { x: number; y: number; z: number };
};

export type CrownKeepoutReport = {
  hits: CrownKeepoutHit[];
  minClearance: number;
  minPair: string;
  anyIntersection: boolean;
  envelopeR: number;
  bodyX0: number;
  bodyX1: number;
};

export function retractVerticesFromCrown(mesh: THREE.Mesh, c: ExteriorPlan["crown"], gap: number): void {
  mesh.updateMatrixWorld();
  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.applyMatrix4(mesh.matrixWorld);
    if (v.x < c.caseX - 5.5) continue;
    if (pointCrownClearance(c, v.x, v.y, v.z) >= gap) continue;
    let lo = Math.min(v.x - 2.5, c.neckX0 - 1);
    let hi = v.x;
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) * 0.5;
      if (pointCrownClearance(c, mid, v.y, v.z) >= gap) lo = mid;
      else hi = mid;
    }
    v.x = lo;
    v.applyMatrix4(inv);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const idx = mesh.geometry.getIndex();
  const triCount = Math.floor((idx ? idx.count : pos.count) / 3);
  const triIndex = (i: number) => (idx ? idx.getX(i) : i);
  const pullX = (worldX: number, y: number, z: number): number => {
    if (pointCrownClearance(c, worldX, y, z) >= gap) return worldX;
    let lo = Math.min(worldX - 2.5, c.neckX0 - 1);
    let hi = worldX;
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) * 0.5;
      if (pointCrownClearance(c, mid, y, z) >= gap) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let t = 0; t < triCount; t++) {
      const i0 = triIndex(t * 3);
      const i1 = triIndex(t * 3 + 1);
      const i2 = triIndex(t * 3 + 2);
      const a = new THREE.Vector3().fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
      const b = new THREE.Vector3().fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
      const d = new THREE.Vector3().fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
      const cx = (a.x + b.x + d.x) / 3;
      const cy = (a.y + b.y + d.y) / 3;
      const cz = (a.z + b.z + d.z) / 3;
      if (cx < c.caseX - 5.5) continue;
      if (pointCrownClearance(c, cx, cy, cz) >= gap) continue;
      const nx = pullX(cx, cy, cz);
      const dx = nx - cx;
      if (Math.abs(dx) < 1e-5) continue;
      for (const [ii, p] of [
        [i0, a],
        [i1, b],
        [i2, d],
      ] as const) {
        p.x += dx;
        p.applyMatrix4(inv);
        pos.setXYZ(ii, p.x, p.y, p.z);
      }
      moved = true;
    }
    if (!moved) break;
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

export function pointCrownClearance(
  c: ExteriorPlan["crown"],
  x: number,
  y: number,
  z: number,
): number {
  const rho = Math.hypot(y - c.axis.y, z - c.axis.z);
  if (x >= c.neckX0 && x <= c.bodyX1) return rho - crownRadiusAtX(c, x);
  if (x < c.neckX0) {
    const axial = c.neckX0 - x;
    const radial = rho - c.neckR * 0.78;
    if (radial >= 0) return Math.hypot(axial, radial);
    return axial;
  }
  const axial = x - c.bodyX1;
  const radial = rho - c.bodyR * 0.62;
  if (radial >= 0) return Math.hypot(axial, radial);
  return axial;
}

export function auditCrownKeepout(plan: ExteriorPlan, root: THREE.Object3D): CrownKeepoutReport {
  const c = plan.crown;
  const names = new Set([
    "ext:mid",
    "ext:waist",
    "ext:caseback",
    "ext:waist-bevel",
    "ext:crown-socket",
    "ext:crown-root-collar",
    "ext:bezel-lip",
    "ext:bezel-chamfer",
    "ext:caseback-step",
  ]);
  const hits: CrownKeepoutHit[] = [];
  const v = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d3 = new THREE.Vector3();
  root.updateMatrixWorld(true);
  const consider = (x: number, y: number, z: number, min: { v: number; at: { x: number; y: number; z: number } }) => {
    if (x < c.caseX - 6) return;
    const d = pointCrownClearance(c, x, y, z);
    if (d < min.v) {
      min.v = d;
      min.at.x = x;
      min.at.y = y;
      min.at.z = z;
    }
  };
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !names.has(o.name)) return;
    const pos = o.geometry.attributes.position;
    if (!pos) return;
    const min = { v: Infinity, at: { x: 0, y: 0, z: 0 } };
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.applyMatrix4(o.matrixWorld);
      consider(v.x, v.y, v.z, min);
    }
    const idx = o.geometry.getIndex();
    const triCount = Math.floor((idx ? idx.count : pos.count) / 3);
    const triIndex = (i: number) => (idx ? idx.getX(i) : i);
    const step = Math.max(1, Math.floor(triCount / 2400));
    for (let t = 0; t < triCount; t += step) {
      a.fromBufferAttribute(pos, triIndex(t * 3)).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, triIndex(t * 3 + 1)).applyMatrix4(o.matrixWorld);
      d3.fromBufferAttribute(pos, triIndex(t * 3 + 2)).applyMatrix4(o.matrixWorld);
      consider((a.x + b.x + d3.x) / 3, (a.y + b.y + d3.y) / 3, (a.z + b.z + d3.z) / 3, min);
    }
    if (Number.isFinite(min.v)) {
      hits.push({ mesh: o.name, minClearance: min.v, intersects: min.v < -1e-4, at: min.at });
    }
  });
  hits.sort((a, b) => a.minClearance - b.minClearance);
  const worst = hits[0];
  return {
    hits,
    minClearance: worst ? worst.minClearance : Infinity,
    minPair: worst ? `ext:crown-body ↔ ${worst.mesh}` : "none",
    anyIntersection: hits.some((h) => h.intersects),
    envelopeR: c.bodyR,
    bodyX0: c.bodyX0,
    bodyX1: c.bodyX1,
  };
}

export function analyzeCrownBody(geo: THREE.BufferGeometry): {
  components: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  triangles: number;
  weldedVertices: number;
  outwardOk: boolean;
  fluteRhoMax?: number;
  fluteProud?: boolean;
} {
  return analyzeHornMesh(geo);
}

export function buildOuterCrystals(plan: ExteriorPlan, mats: ExteriorMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "OuterCrystalPose";
  const frontH = plan.sapphire.frontConsumed;
  const front = finishedStructure(
    vecToShape(offsetConvexExact(plan.kernel.frontGasketOuter, -plan.sapphire.frontInset)),
    frontH,
    mats.sapphire,
    mats.sapphire,
    16,
  );
  front.position.z = plan.z.frontSapphireInner + ENC.frontSapphireMinThick + frontH * 0.5;
  front.name = "ext:frontSapphireOuter";
  markFinish(front, "sapphire");
  g.add(front);
  const rearH = plan.sapphire.rearConsumed;
  const rear = finishedStructure(
    vecToShape(offsetConvexExact(plan.kernel.rearGasketOuter, -plan.sapphire.rearInset)),
    rearH,
    mats.sapphire,
    mats.sapphire,
    16,
  );
  rear.position.z = plan.z.rearSapphireInner - ENC.rearSapphireMinThick - rearH * 0.5;
  rear.name = "ext:rearSapphireOuter";
  markFinish(rear, "sapphire");
  g.add(rear);
  return g;
}

export type SapphireOpticalBodyReport = {
  name: string;
  authoritativeMeshes: string[];
  removedInternalFaces: number;
  retainedSurfaceTriangles: number;
  shoulderTriangles: number;
  materialSlots: ["accepted-inner", "accepted-outer"];
  interfaceZ: number;
  analyticInterfaceZ: number;
  renderedInterfaceDelta: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
};

type OpticalTriangleBuffer = {
  positions: number[];
  normals: number[];
  uvs: number[];
  triangles: number;
};

function appendOpenCrystalSurface(
  target: OpticalTriangleBuffer,
  source: THREE.Mesh,
  interfaceZ: number,
  removeNormalSign: 1 | -1,
): number {
  const geometry = source.geometry;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const index = geometry.getIndex();
  const triangleCount = (index?.count ?? position.count) / 3;
  let removed = 0;
  const ids = [0, 0, 0];
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    for (let corner = 0; corner < 3; corner++) {
      const cursor = triangle * 3 + corner;
      ids[corner] = index ? index.getX(cursor) : cursor;
    }
    const z0 = position.getZ(ids[0]) + source.position.z - interfaceZ;
    const z1 = position.getZ(ids[1]) + source.position.z - interfaceZ;
    const z2 = position.getZ(ids[2]) + source.position.z - interfaceZ;
    const capAtInterface = Math.max(Math.abs(z0), Math.abs(z1), Math.abs(z2)) <= 1e-7;
    const nz = normal
      ? (normal.getZ(ids[0]) + normal.getZ(ids[1]) + normal.getZ(ids[2])) / 3
      : 0;
    if (capAtInterface && nz * removeNormalSign > 0.9) {
      removed++;
      continue;
    }
    for (let corner = 0; corner < 3; corner++) {
      const id = ids[corner];
      target.positions.push(
        position.getX(id) + source.position.x,
        position.getY(id) + source.position.y,
        position.getZ(id) + source.position.z - interfaceZ,
      );
      target.normals.push(
        normal?.getX(id) ?? 0,
        normal?.getY(id) ?? 0,
        normal?.getZ(id) ?? removeNormalSign,
      );
      target.uvs.push(uv?.getX(id) ?? 0, uv?.getY(id) ?? 0);
    }
    target.triangles++;
  }
  return removed;
}

function appendShoulderSurface(
  target: OpticalTriangleBuffer,
  outer: Vec2[],
  inner: Vec2[],
  normalSign: 1 | -1,
): number {
  const contour = outer.map((point) => new THREE.Vector2(point.x, point.y));
  const hole = inner.map((point) => new THREE.Vector2(point.x, point.y));
  const faces = THREE.ShapeUtils.triangulateShape(contour, [hole]);
  const vertices = [...contour, ...hole];
  for (const face of faces) {
    const a = vertices[face[0]];
    const b = vertices[face[1]];
    const c = vertices[face[2]];
    const crossZ = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const ordered = crossZ * normalSign >= 0 ? face : [face[0], face[2], face[1]];
    for (const id of ordered) {
      const point = vertices[id];
      target.positions.push(point.x, point.y, 0);
      target.normals.push(0, 0, normalSign);
      target.uvs.push(point.x / 32 + 0.5, point.y / 32 + 0.5);
    }
    target.triangles++;
  }
  return faces.length;
}

function boundsRow(box: THREE.Box3): SapphireOpticalBodyReport["bounds"] {
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };
}

function makeSapphireOpticalBody(opts: {
  name: string;
  slab: THREE.Mesh;
  outer: THREE.Mesh;
  slabOutline: Vec2[];
  outerOutline: Vec2[];
  interfaceZ: number;
  analyticInterfaceZ: number;
  outwardZ: 1 | -1;
  innerMaterial: THREE.Material;
  outerMaterial: THREE.Material;
}): { mesh: THREE.Mesh; report: SapphireOpticalBodyReport } {
  const buffer: OpticalTriangleBuffer = { positions: [], normals: [], uvs: [], triangles: 0 };
  const slabStart = 0;
  const removedSlab = appendOpenCrystalSurface(
    buffer,
    opts.slab,
    opts.interfaceZ,
    opts.outwardZ,
  );
  const slabCount = buffer.positions.length / 3 - slabStart;
  const shoulderStart = buffer.positions.length / 3;
  const shoulderTriangles = appendShoulderSurface(
    buffer,
    opts.slabOutline,
    opts.outerOutline,
    opts.outwardZ,
  );
  const shoulderCount = buffer.positions.length / 3 - shoulderStart;
  const outerStart = buffer.positions.length / 3;
  const removedOuter = appendOpenCrystalSurface(
    buffer,
    opts.outer,
    opts.interfaceZ,
    opts.outwardZ === 1 ? -1 : 1,
  );
  const outerCount = buffer.positions.length / 3 - outerStart;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(buffer.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(buffer.normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buffer.uvs, 2));
  geometry.addGroup(slabStart, slabCount, 0);
  geometry.addGroup(shoulderStart, shoulderCount, 0);
  geometry.addGroup(outerStart, outerCount, 1);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, [opts.innerMaterial, opts.outerMaterial]);
  mesh.name = opts.name;
  mesh.position.z = opts.interfaceZ;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 0;
  mesh.userData.finishKind = "sapphire" satisfies ExteriorFinishKind;
  mesh.userData.phase5dOpticalOwner = true;
  mesh.userData.authoritativeMeshes = [opts.slab.name, opts.outer.name];
  mesh.userData.removedInternalFaces = removedSlab + removedOuter;
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  return {
    mesh,
    report: {
      name: opts.name,
      authoritativeMeshes: [opts.slab.name, opts.outer.name],
      removedInternalFaces: removedSlab + removedOuter,
      retainedSurfaceTriangles: buffer.triangles - shoulderTriangles,
      shoulderTriangles,
      materialSlots: ["accepted-inner", "accepted-outer"],
      interfaceZ: opts.interfaceZ,
      analyticInterfaceZ: opts.analyticInterfaceZ,
      renderedInterfaceDelta: opts.interfaceZ - opts.analyticInterfaceZ,
      bounds: boundsRow(box),
    },
  };
}

/**
 * Presentation-only union of the frozen enclosure slab and frozen exterior
 * sculpture. Source meshes remain untouched for engineering/truth modes. Only
 * the two planar faces at their shared interface are omitted; the exposed
 * shoulder is rebuilt from the exact authoritative outlines.
 */
export function buildSapphireOpticalBodies(opts: {
  exterior: ExteriorPlan;
  enclosure: EnclosurePlan;
  enclosureRoot: THREE.Object3D;
  outerRoot: THREE.Object3D;
  innerMaterial: THREE.Material;
  outerMaterial: THREE.Material;
}): { group: THREE.Group; reports: SapphireOpticalBodyReport[] } {
  const mesh = (root: THREE.Object3D, name: string): THREE.Mesh => {
    const found = root.getObjectByName(name);
    if (!(found instanceof THREE.Mesh)) throw new Error(`Missing sapphire authority mesh ${name}`);
    return found;
  };
  const frontSlab = mesh(opts.enclosureRoot, "enc:frontSapphire");
  const rearSlab = mesh(opts.enclosureRoot, "enc:rearSapphire");
  const frontOuter = mesh(opts.outerRoot, "ext:frontSapphireOuter");
  const rearOuter = mesh(opts.outerRoot, "ext:rearSapphireOuter");
  const frontOuterOutline = offsetConvexExact(
    opts.exterior.kernel.frontGasketOuter,
    -opts.exterior.sapphire.frontInset,
  );
  const rearOuterOutline = offsetConvexExact(
    opts.exterior.kernel.rearGasketOuter,
    -opts.exterior.sapphire.rearInset,
  );
  const capPlane = (source: THREE.Mesh, side: "min" | "max"): number => {
    source.geometry.computeBoundingBox();
    const box = source.geometry.boundingBox;
    if (!box) throw new Error(`Missing sapphire geometry bounds for ${source.name}`);
    return source.position.z + (side === "min" ? box.min.z : box.max.z);
  };
  const frontAnalyticInterface = opts.enclosure.front.inner.z + opts.enclosure.front.minThick;
  const rearAnalyticInterface = opts.enclosure.rear.inner.z - opts.enclosure.rear.minThick;
  const frontInterface = capPlane(frontSlab, "max");
  const rearInterface = capPlane(rearSlab, "min");
  const frontOuterInterface = capPlane(frontOuter, "min");
  const rearOuterInterface = capPlane(rearOuter, "max");
  if (Math.abs(frontInterface - frontOuterInterface) > 1e-6) {
    throw new Error(`Front sapphire rendered interface mismatch ${frontInterface} vs ${frontOuterInterface}`);
  }
  if (Math.abs(rearInterface - rearOuterInterface) > 1e-6) {
    throw new Error(`Rear sapphire rendered interface mismatch ${rearInterface} vs ${rearOuterInterface}`);
  }
  const front = makeSapphireOpticalBody({
    name: "ext:frontSapphireOpticalBody",
    slab: frontSlab,
    outer: frontOuter,
    slabOutline: opts.enclosure.front.footprint,
    outerOutline: frontOuterOutline,
    interfaceZ: frontInterface,
    analyticInterfaceZ: frontAnalyticInterface,
    outwardZ: 1,
    innerMaterial: opts.innerMaterial,
    outerMaterial: opts.outerMaterial,
  });
  const rear = makeSapphireOpticalBody({
    name: "ext:rearSapphireOpticalBody",
    slab: rearSlab,
    outer: rearOuter,
    slabOutline: opts.enclosure.rear.footprint,
    outerOutline: rearOuterOutline,
    interfaceZ: rearInterface,
    analyticInterfaceZ: rearAnalyticInterface,
    outwardZ: -1,
    innerMaterial: opts.innerMaterial,
    outerMaterial: opts.outerMaterial,
  });
  const group = new THREE.Group();
  group.name = "ext:sapphireOpticalOwnership";
  group.add(front.mesh, rear.mesh);
  return { group, reports: [front.report, rear.report] };
}

export function buildTruthOverlay(plan: ExteriorPlan, mats: ExteriorMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "ext:truthOverlay";
  const kernel = finishedStructure(
    hoopShape(plan.kernel.outerWall, plan.kernel.cavity),
    plan.kernel.midcaseTop - plan.kernel.midcaseBottom,
    mats.kernel,
    mats.kernel,
    14,
  );
  kernel.position.z = (plan.kernel.midcaseTop + plan.kernel.midcaseBottom) * 0.5;
  kernel.name = "ext:kernel-ghost";
  g.add(kernel);
  for (const a of plan.kernel.fastenerAxes) {
    const h = a.z1 - a.z0;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(ENC.fastenerReserveR, ENC.fastenerReserveR, h, 10), mats.keepout);
    m.rotation.x = Math.PI / 2;
    m.position.set(a.xy.x, a.xy.y, (a.z0 + a.z1) / 2);
    g.add(m);
  }
  const cor = plan.kernel.corridor;
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(cor.radius, cor.radius, Math.max(0.4, plan.crown.caseX - cor.endAt.x), 20, 1, true),
    mats.keepout,
  );
  cyl.rotation.z = Math.PI / 2;
  cyl.position.set((plan.crown.caseX + cor.endAt.x) / 2, cor.origin.y, cor.z);
  g.add(cyl);
  const pocket = new THREE.Mesh(
    new THREE.BoxGeometry(plan.crown.pocketDepth + 0.2, plan.crown.pocketYHalf * 2, plan.crown.pocketZ1 - plan.crown.pocketZ0),
    mats.keepout,
  );
  pocket.position.set(plan.crown.caseX - plan.crown.pocketDepth * 0.5, 0, (plan.crown.pocketZ0 + plan.crown.pocketZ1) * 0.5);
  pocket.name = "ext:crown-pocket-volume";
  g.add(pocket);
  return g;
}
