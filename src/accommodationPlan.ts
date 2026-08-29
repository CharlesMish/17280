import * as THREE from "three";
import type { Layout, Vec2 } from "./spec";
import { STRUCT, closestOnRing, type StructuralPlan } from "./structureSpec";
import { ACC, ACC_PHASES, type BoxExtent, type HolderContact } from "./accommodationSpec";
import type { Movement } from "./movement";
import {
  closestOnPolyline,
  convexHull,
  isCcw,
  offsetConvexExact,
  outwardNormal,
  rightmostHorizontalHit,
  uniqueXy,
} from "./accommodationMath";

export type SweepMeta = {
  phases: typeof ACC_PHASES;
  includedRoots: string[];
  includedFamilies: string[];
  excludedCategories: string[];
  meshCount: number;
  projectedVertices: number;
  uniqueProjected: number;
  hullCount: number;
  matricesUpdatedBeforeCollect: true;
  authoritySmoothing: "none";
  honesty: "conservative-for-sampled-phases-not-continuous-time-exact";
};

export type AccommodationPlan = {
  method: "sampled-conservative-union";
  phases: typeof ACC_PHASES;
  staticBox: BoxExtent;
  sweptBox: BoxExtent;
  sampledSweptContour: Vec2[];
  requiredClearanceContour: Vec2[];
  cavityContour: Vec2[];
  outerWall: Vec2[];
  /** Alias of sampledSweptContour — built holder inner still consumes truth. */
  sweptContour: Vec2[];
  /** Alias of cavityContour. */
  cavity: Vec2[];
  contacts: HolderContact[];
  sweep: SweepMeta;
  z: {
    moveMin: number;
    moveMax: number;
    rearClear: number;
    rearClose: number;
    midcaseBottom: number;
    plateBottom: number;
    plateTop: number;
    frontClear: number;
    dialTop: number;
    frontCloseLo: number;
    frontCloseHi: number;
    midcaseTop: number;
  };
  corridor: {
    origin: Vec2;
    z: number;
    dir: { x: number; y: number };
    radius: number;
    endAt: Vec2;
    boundaryHit: Vec2;
    length: number;
    intersectionMethod: "rightmost-y0-segment-intersection-with-sampledSweptContour";
    note: "ends-at-projected-sampled-movement-boundary";
    projectedAuthorityOnly: true;
    noKeylessWorks: true;
    window: {
      yHalf: number;
      zHalf: number;
      zLo: number;
      zHi: number;
      xInner: number;
      xOuter: number;
    };
  };
  closureSemantics: {
    front: "allowable-range-not-frozen-plane";
    rear: "provisional-plane";
    curvedClosuresNeedLocalZ: true;
    crystalsAreNotRetention: true;
  };
};

const _v = new THREE.Vector3();
const _box = new THREE.Box3();

const EXCLUDED_NAME = /debug|audit|helper|axes|grid|contour|envelope|truthLights|ReservePose|accommodation/i;

export const SWEEP_EXCLUDED = [
  "Phase-3A accommodation geometry",
  "holder/carrier",
  "coarse case / midcase",
  "debug helpers and locus spheres",
  "envelope visualizers and contour lines",
  "crown-corridor markers",
  "audit discs/spheres/lights",
  "camera helpers / axes / grids",
  "invisible truth/debug objects",
  "finishing-bench geometry",
  "non-calibre scene nodes",
];

export function isCalibreAuthorityMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  if (!(obj instanceof THREE.Mesh) || !obj.geometry) return false;
  if (
    obj instanceof THREE.Line ||
    obj instanceof THREE.LineLoop ||
    obj instanceof THREE.LineSegments ||
    obj instanceof THREE.Points ||
    obj instanceof THREE.Sprite
  ) {
    return false;
  }
  let p: THREE.Object3D | null = obj;
  while (p) {
    if (p.name && EXCLUDED_NAME.test(p.name)) return false;
    const t = p.type;
    if (t === "Line" || t === "LineLoop" || t === "LineSegments" || t === "Points" || t === "Sprite") return false;
    p = p.parent;
  }
  return true;
}

function emptyBox(): BoxExtent {
  return {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
    limit: { minX: "?", maxX: "?", minY: "?", maxY: "?", minZ: "?", maxZ: "?" },
  };
}

function meshFamilyName(obj: THREE.Object3D): string {
  let p: THREE.Object3D | null = obj;
  while (p) {
    if (
      p.name &&
      (p.name.includes(":") ||
        p.name === "mainplate" ||
        p.name.endsWith("Bridge") ||
        p.name.endsWith("Cock") ||
        p.name.endsWith("Finger") ||
        p.name.startsWith("assembly:") ||
        p.name === "calibre")
    ) {
      return p.name;
    }
    p = p.parent;
  }
  return obj.name || "mesh";
}

function expandMesh(box: BoxExtent, mesh: THREE.Mesh, name: string): void {
  mesh.updateWorldMatrix(true, false);
  _box.setFromObject(mesh);
  if (_box.isEmpty()) return;
  if (_box.min.x < box.minX) {
    box.minX = _box.min.x;
    box.limit.minX = name;
  }
  if (_box.max.x > box.maxX) {
    box.maxX = _box.max.x;
    box.limit.maxX = name;
  }
  if (_box.min.y < box.minY) {
    box.minY = _box.min.y;
    box.limit.minY = name;
  }
  if (_box.max.y > box.maxY) {
    box.maxY = _box.max.y;
    box.limit.maxY = name;
  }
  if (_box.min.z < box.minZ) {
    box.minZ = _box.min.z;
    box.limit.minZ = name;
  }
  if (_box.max.z > box.maxZ) {
    box.maxZ = _box.max.z;
    box.limit.maxZ = name;
  }
}

function collectProjected(root: THREE.Object3D, out: Vec2[], meshes: Set<THREE.Mesh>): void {
  root.traverse((obj) => {
    if (!isCalibreAuthorityMesh(obj)) return;
    const pos = obj.geometry.getAttribute("position");
    if (!pos) return;
    obj.updateWorldMatrix(true, false);
    meshes.add(obj);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      out.push({ x: _v.x, y: _v.y });
    }
  });
}

function walkBox(root: THREE.Object3D, box: BoxExtent): void {
  root.traverse((obj) => {
    if (!isCalibreAuthorityMesh(obj)) return;
    expandMesh(box, obj, meshFamilyName(obj));
  });
}

export function measureCalibre(
  movement: Movement,
  structureRoot: THREE.Object3D,
  assemblyRoot: THREE.Object3D | null,
): {
  staticBox: BoxExtent;
  sweptBox: BoxExtent;
  xySamples: Vec2[];
  sweep: SweepMeta;
} {
  const includedRoots = [movement.root, structureRoot];
  if (assemblyRoot) includedRoots.push(assemblyRoot);
  const includedNames = includedRoots.map((r) => r.name || "unnamed");

  const staticBox = emptyBox();
  for (const r of includedRoots) {
    r.updateWorldMatrix(true, true);
    walkBox(r, staticBox);
  }

  const sweptBox = emptyBox();
  const xySamples: Vec2[] = [];
  const meshes = new Set<THREE.Mesh>();
  const saved = 0;
  for (const phase of ACC_PHASES) {
    movement.update(phase.t);
    for (const r of includedRoots) {
      r.updateWorldMatrix(true, true);
      walkBox(r, sweptBox);
      collectProjected(r, xySamples, meshes);
    }
  }
  movement.update(saved);
  for (const r of includedRoots) r.updateWorldMatrix(true, true);

  const unique = uniqueXy(xySamples);
  const hull = convexHull(unique);
  return {
    staticBox,
    sweptBox,
    xySamples,
    sweep: {
      phases: ACC_PHASES,
      includedRoots: includedNames,
      includedFamilies: [
        "frozen mechanism (calibre / movement.root)",
        "frozen structural skeleton (structure.root minus debug)",
        "frozen bearing/fastener assembly (assembly.root minus audit lights)",
      ],
      excludedCategories: SWEEP_EXCLUDED,
      meshCount: meshes.size,
      projectedVertices: xySamples.length,
      uniqueProjected: unique.length,
      hullCount: hull.length,
      matricesUpdatedBeforeCollect: true,
      authoritySmoothing: "none",
      honesty: "conservative-for-sampled-phases-not-continuous-time-exact",
    },
  };
}

export function forEachCalibreMesh(
  movement: Movement,
  structureRoot: THREE.Object3D,
  assemblyRoot: THREE.Object3D | null,
  visitor: (mesh: THREE.Mesh, name: string) => void,
): void {
  const roots = [movement.root, structureRoot];
  if (assemblyRoot) roots.push(assemblyRoot);
  const saved = 0;
  for (const phase of ACC_PHASES) {
    movement.update(phase.t);
    for (const r of roots) {
      r.updateWorldMatrix(true, true);
      r.traverse((obj) => {
        if (!isCalibreAuthorityMesh(obj)) return;
        visitor(obj, meshFamilyName(obj));
      });
    }
  }
  movement.update(saved);
  for (const r of roots) r.updateWorldMatrix(true, true);
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pickContacts(plan: StructuralPlan): HolderContact[] {
  const outer = plan.outer;
  const ccw = isCcw(outer);
  const anchors = Object.values(plan.anchors);
  const hints: { id: string; hint: Vec2; purposes: HolderContact["purposes"] }[] = [
    { id: "contact:hoop:barrel", hint: { x: -10, y: -5 }, purposes: ["radial", "axial-down", "axial-up", "anti-rotation"] },
    { id: "contact:hoop:south", hint: { x: 1, y: -11 }, purposes: ["radial", "axial-down", "axial-up"] },
    { id: "contact:hoop:west", hint: { x: -11, y: 3 }, purposes: ["radial", "axial-down", "axial-up", "anti-rotation"] },
    { id: "contact:hoop:southeast", hint: { x: 8, y: -6 }, purposes: ["radial", "axial-down", "axial-up"] },
    { id: "contact:hoop:north-flank", hint: { x: -6, y: 10 }, purposes: ["radial", "axial-down", "axial-up", "anti-rotation"] },
  ];
  const out: HolderContact[] = [];
  for (const h of hints) {
    const previousXy = closestOnRing(outer, h.hint);
    const hit = closestOnPolyline(outer, h.hint);
    const xy = hit.point;
    const ang = Math.atan2(xy.y, xy.x);
    if (Math.abs(ang) < ACC.crownHalfAngle) continue;
    if (anchors.some((a) => dist(a.xy, xy) < ACC.holderAvoidAnchor)) continue;
    const n = outwardNormal(hit.a, hit.b, ccw);
    out.push({
      id: h.id,
      source: "mainplate.hoop.outer",
      xy,
      normal: n,
      area: Math.PI * ACC.holderPadR * ACC.holderPadR * 0.45,
      purposes: h.purposes,
      previousXy,
      displacement: dist(previousXy, xy),
      segment: { a: hit.a, b: hit.b, t: hit.t, index: hit.index },
    });
  }
  return out;
}

export function createAccommodationPlan(
  _layout: Layout,
  structure: StructuralPlan,
  measure: { staticBox: BoxExtent; sweptBox: BoxExtent; xySamples: Vec2[]; sweep: SweepMeta },
): AccommodationPlan {
  const sampledSweptContour = convexHull(uniqueXy(measure.xySamples));
  const requiredClearanceContour = offsetConvexExact(sampledSweptContour, ACC.radialClearance);
  const cavityContour = requiredClearanceContour;
  const outerWall = offsetConvexExact(cavityContour, ACC.wall);
  const contacts = pickContacts(structure);

  const moveMin = measure.sweptBox.minZ;
  const moveMax = measure.sweptBox.maxZ;
  const rearClear = moveMin - ACC.rearMoveClear;
  const rearClose = rearClear;
  const midcaseBottom = rearClose - ACC.rearStruct;
  const frontClear = moveMax + ACC.frontMoveClear;
  const dialTop = frontClear + ACC.dialStack;
  const frontCloseLo = dialTop + ACC.enclosureClear;
  const frontCloseHi = frontCloseLo + ACC.frontClosureBand;
  const midcaseTop = frontCloseHi + ACC.frontStruct;

  const boundaryHit = rightmostHorizontalHit(sampledSweptContour, 0);
  if (!boundaryHit) {
    throw new Error("crown corridor: no y=0 intersection with sampledSweptContour");
  }
  const outerHit = rightmostHorizontalHit(outerWall, 0);
  if (!outerHit) {
    throw new Error("crown corridor: no y=0 intersection with outerWall");
  }
  const corridorZ = STRUCT.plateTop + 0.55;
  const endAt = { x: boundaryHit.x, y: boundaryHit.y };
  const origin = { x: outerHit.x + 0.2, y: 0 };
  const zHalf = ACC.corridorR + 0.16;
  const window = {
    yHalf: ACC.corridorR + 0.12,
    zHalf,
    zLo: corridorZ - zHalf,
    zHi: corridorZ + zHalf,
    xInner: endAt.x + 0.18,
    xOuter: origin.x + 0.4,
  };

  return {
    method: "sampled-conservative-union",
    phases: ACC_PHASES,
    staticBox: measure.staticBox,
    sweptBox: measure.sweptBox,
    sampledSweptContour,
    requiredClearanceContour,
    cavityContour,
    outerWall,
    sweptContour: sampledSweptContour,
    cavity: cavityContour,
    contacts,
    sweep: { ...measure.sweep, hullCount: sampledSweptContour.length },
    z: {
      moveMin,
      moveMax,
      rearClear,
      rearClose,
      midcaseBottom,
      plateBottom: STRUCT.plateBottom,
      plateTop: STRUCT.plateTop,
      frontClear,
      dialTop,
      frontCloseLo,
      frontCloseHi,
      midcaseTop,
    },
    corridor: {
      origin,
      z: corridorZ,
      dir: { x: -1, y: 0 },
      radius: ACC.corridorR,
      endAt,
      boundaryHit: { ...boundaryHit },
      length: origin.x - endAt.x,
      intersectionMethod: "rightmost-y0-segment-intersection-with-sampledSweptContour",
      note: "ends-at-projected-sampled-movement-boundary",
      projectedAuthorityOnly: true,
      noKeylessWorks: true,
      window,
    },
    closureSemantics: {
      front: "allowable-range-not-frozen-plane",
      rear: "provisional-plane",
      curvedClosuresNeedLocalZ: true,
      crystalsAreNotRetention: true,
    },
  };
}
