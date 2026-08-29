import * as THREE from "three";
import {
  applyPlanarUV,
  assignCapAndSideGroups,
  extrudeCentered,
} from "./geometry";
import type { Vec2 } from "./spec";
import { STRUCT, bossRadius, type PivotId } from "./structureSpec";

export function vecToShape(points: Vec2[]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i].x, points[i].y);
  }
  shape.closePath();
  return shape;
}

export function finishedStructure(
  shape: THREE.Shape,
  thickness: number,
  face: THREE.Material,
  edge: THREE.Material,
  radiusHint: number,
  curveSegments = 12,
): THREE.Mesh {
  const geo = extrudeCentered(shape, thickness, true, curveSegments);
  applyPlanarUV(geo, radiusHint);
  assignCapAndSideGroups(geo);
  const mesh = new THREE.Mesh(geo, [face, edge]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export function strokeOpen(points: Vec2[], halfWidth: (i: number, t: number) => number): THREE.Shape {
  const n = points.length;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty;
    const ny = tx;
    const w = halfWidth(i, n === 1 ? 0 : i / (n - 1));
    left.push({ x: points[i].x + nx * w, y: points[i].y + ny * w });
    right.push({ x: points[i].x - nx * w, y: points[i].y - ny * w });
  }
  const start = points[0];
  const end = points[n - 1];
  const sT = { x: points[1].x - start.x, y: points[1].y - start.y };
  const eT = { x: end.x - points[n - 2].x, y: end.y - points[n - 2].y };
  const sL = Math.hypot(sT.x, sT.y) || 1;
  const eL = Math.hypot(eT.x, eT.y) || 1;
  const sNx = -sT.y / sL;
  const sNy = sT.x / sL;
  const eNx = -eT.y / eL;
  const eNy = eT.x / eL;
  const w0 = halfWidth(0, 0);
  const w1 = halfWidth(n - 1, 1);
  const startCap = arcPoints(start, Math.atan2(-sNy, -sNx), Math.atan2(sNy, sNx), w0, 6);
  const endCap = arcPoints(end, Math.atan2(eNy, eNx), Math.atan2(-eNy, -eNx), w1, 6);
  const outline = [...left, ...endCap, ...right.slice().reverse(), ...startCap];
  return vecToShape(outline);
}

/**
 * Localized variant for a mechanically asymmetric root flare. End widths are
 * expected to match; only interior vertices may differ from side to side.
 */
export function strokeOpenSided(
  points: Vec2[],
  leftHalfWidth: (i: number, t: number) => number,
  rightHalfWidth: (i: number, t: number) => number,
): THREE.Shape {
  const n = points.length;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty;
    const ny = tx;
    const t = n === 1 ? 0 : i / (n - 1);
    const leftWidth = leftHalfWidth(i, t);
    const rightWidth = rightHalfWidth(i, t);
    left.push({ x: points[i].x + nx * leftWidth, y: points[i].y + ny * leftWidth });
    right.push({ x: points[i].x - nx * rightWidth, y: points[i].y - ny * rightWidth });
  }
  const start = points[0];
  const end = points[n - 1];
  const sT = { x: points[1].x - start.x, y: points[1].y - start.y };
  const eT = { x: end.x - points[n - 2].x, y: end.y - points[n - 2].y };
  const sL = Math.hypot(sT.x, sT.y) || 1;
  const eL = Math.hypot(eT.x, eT.y) || 1;
  const sNx = -sT.y / sL;
  const sNy = sT.x / sL;
  const eNx = -eT.y / eL;
  const eNy = eT.x / eL;
  const w0 = Math.max(leftHalfWidth(0, 0), rightHalfWidth(0, 0));
  const w1 = Math.max(leftHalfWidth(n - 1, 1), rightHalfWidth(n - 1, 1));
  const startCap = arcPoints(start, Math.atan2(-sNy, -sNx), Math.atan2(sNy, sNx), w0, 6);
  const endCap = arcPoints(end, Math.atan2(eNy, eNx), Math.atan2(-eNy, -eNx), w1, 6);
  return vecToShape([...left, ...endCap, ...right.slice().reverse(), ...startCap]);
}

type OutlineSegment = { a: Vec2; b: Vec2 };

const UNION_EPSILON = 1e-8;

function outlinePoints(shape: THREE.Shape): Vec2[] {
  const points = shape.getPoints(12).map((point) => ({ x: point.x, y: point.y }));
  const clean: Vec2[] = [];
  for (const point of points) {
    const previous = clean[clean.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > UNION_EPSILON) {
      clean.push(point);
    }
  }
  if (
    clean.length > 1 &&
    Math.hypot(clean[0].x - clean[clean.length - 1].x, clean[0].y - clean[clean.length - 1].y) <= UNION_EPSILON
  ) {
    clean.pop();
  }
  return clean;
}

function cross2(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

function pointOnOutline(point: Vec2, polygon: Vec2[]): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const ap = { x: point.x - a.x, y: point.y - a.y };
    const scale = Math.max(1, Math.hypot(ab.x, ab.y));
    if (Math.abs(cross2(ab, ap)) > UNION_EPSILON * scale) continue;
    const dot = ap.x * ab.x + ap.y * ab.y;
    if (dot >= -UNION_EPSILON && dot <= ab.x * ab.x + ab.y * ab.y + UNION_EPSILON) return true;
  }
  return false;
}

function pointInsideOutline(point: Vec2, polygon: Vec2[]): boolean {
  if (pointOnOutline(point, polygon)) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentIntersectionParameter(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denominator = cross2(r, s);
  if (Math.abs(denominator) <= UNION_EPSILON) return null;
  const ca = { x: c.x - a.x, y: c.y - a.y };
  const t = cross2(ca, s) / denominator;
  const u = cross2(ca, r) / denominator;
  if (t < -UNION_EPSILON || t > 1 + UNION_EPSILON || u < -UNION_EPSILON || u > 1 + UNION_EPSILON) {
    return null;
  }
  return THREE.MathUtils.clamp(t, 0, 1);
}

function exposedOutlineSegments(subject: Vec2[], other: Vec2[]): OutlineSegment[] {
  const result: OutlineSegment[] = [];
  for (let i = 0; i < subject.length; i++) {
    const a = subject[i];
    const b = subject[(i + 1) % subject.length];
    const cuts = [0, 1];
    for (let j = 0; j < other.length; j++) {
      const t = segmentIntersectionParameter(a, b, other[j], other[(j + 1) % other.length]);
      if (t !== null && !cuts.some((value) => Math.abs(value - t) <= UNION_EPSILON)) cuts.push(t);
    }
    cuts.sort((x, y) => x - y);
    for (let j = 0; j + 1 < cuts.length; j++) {
      const t0 = cuts[j];
      const t1 = cuts[j + 1];
      if (t1 - t0 <= UNION_EPSILON) continue;
      const pointAt = (t: number): Vec2 => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
      const middle = pointAt((t0 + t1) * 0.5);
      if (!pointInsideOutline(middle, other)) result.push({ a: pointAt(t0), b: pointAt(t1) });
    }
  }
  return result;
}

function pointKey(point: Vec2): string {
  return `${Math.round(point.x / UNION_EPSILON)},${Math.round(point.y / UNION_EPSILON)}`;
}

/**
 * Exact planar union for the intersecting, hole-free structural ribbons used
 * by this calibre. It keeps every exposed input edge, while removing only the
 * internal caps/faces that otherwise produce a polished seam at a load-path
 * junction. Disjoint or multi-loop inputs are rejected instead of silently
 * creating presentation geometry.
 */
export function unionStructuralShapes(shapes: THREE.Shape[]): THREE.Shape {
  if (shapes.length < 1) throw new Error("structural union requires at least one shape");
  let union = outlinePoints(shapes[0]);
  for (const [unionIndex, shape] of shapes.slice(1).entries()) {
    let incoming = outlinePoints(shape);
    if (union.length < 3 || incoming.length < 3) throw new Error("structural union received a degenerate outline");
    if (THREE.ShapeUtils.isClockWise(union) !== THREE.ShapeUtils.isClockWise(incoming)) incoming = incoming.reverse();
    const segments = [...exposedOutlineSegments(union, incoming), ...exposedOutlineSegments(incoming, union)];
    if (segments.length < 3) {
      if (pointInsideOutline(incoming[0], union)) continue;
      if (pointInsideOutline(union[0], incoming)) {
        union = incoming;
        continue;
      }
      throw new Error("structural union inputs must overlap");
    }

    const byStart = new Map<string, number[]>();
    segments.forEach((segment, index) => {
      const key = pointKey(segment.a);
      const list = byStart.get(key) ?? [];
      list.push(index);
      byStart.set(key, list);
    });
    const used = new Set<number>();
    const loops: Vec2[][] = [];
    for (let start = 0; start < segments.length; start++) {
      if (used.has(start)) continue;
      const outline: Vec2[] = [];
      let current = start;
      for (let guard = 0; guard <= segments.length; guard++) {
        if (used.has(current)) break;
        const segment = segments[current];
        used.add(current);
        if (outline.length === 0) outline.push(segment.a);
        outline.push(segment.b);
        const candidates = byStart.get(pointKey(segment.b)) ?? [];
        const next = candidates.find((index) => !used.has(index));
        if (next === undefined) break;
        current = next;
      }
      if (
        outline.length >= 4 &&
        Math.hypot(outline[0].x - outline[outline.length - 1].x, outline[0].y - outline[outline.length - 1].y) <=
          UNION_EPSILON * 4
      ) {
        outline.pop();
        loops.push(outline);
      }
    }
    const expectedBounds = {
      minX: Math.min(...union.map((point) => point.x), ...incoming.map((point) => point.x)),
      maxX: Math.max(...union.map((point) => point.x), ...incoming.map((point) => point.x)),
      minY: Math.min(...union.map((point) => point.y), ...incoming.map((point) => point.y)),
      maxY: Math.max(...union.map((point) => point.y), ...incoming.map((point) => point.y)),
    };
    const area = (polygon: Vec2[]): number => Math.abs(polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) * 0.5);
    const boundsMatch = (polygon: Vec2[]): boolean => {
      const minX = Math.min(...polygon.map((point) => point.x));
      const maxX = Math.max(...polygon.map((point) => point.x));
      const minY = Math.min(...polygon.map((point) => point.y));
      const maxY = Math.max(...polygon.map((point) => point.y));
      return Math.max(
        Math.abs(minX - expectedBounds.minX),
        Math.abs(maxX - expectedBounds.maxX),
        Math.abs(minY - expectedBounds.minY),
        Math.abs(maxY - expectedBounds.maxY),
      ) <= UNION_EPSILON * 8;
    };
    const outline = loops.filter(boundsMatch).sort((a, b) => area(b) - area(a))[0];
    if (!outline) {
      const loopSummary = loops.map((polygon) => ({
        area: area(polygon),
        minX: Math.min(...polygon.map((point) => point.x)),
        maxX: Math.max(...polygon.map((point) => point.x)),
        minY: Math.min(...polygon.map((point) => point.y)),
        maxY: Math.max(...polygon.map((point) => point.y)),
      }));
      throw new Error(
        `structural union did not resolve to one closed outline at input ${unionIndex + 1}: ` +
        `segments=${segments.length}, used=${used.size}, expected=${JSON.stringify(expectedBounds)}, ` +
        `loops=${JSON.stringify(loopSummary)}`,
      );
    }
    union = outline;
  }
  return vecToShape(union);
}

function arcPoints(c: Vec2, a0: number, a1: number, r: number, steps: number): Vec2[] {
  let delta = a1 - a0;
  while (delta <= 0) delta += Math.PI * 2;
  while (delta > Math.PI * 2) delta -= Math.PI * 2;
  const pts: Vec2[] = [];
  for (let i = 1; i < steps; i++) {
    const a = a0 + (delta * i) / steps;
    pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return pts;
}

export function circleShape(c: Vec2, r: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(c.x, c.y, r, 0, Math.PI * 2, false);
  return shape;
}

export function hoopShape(outer: Vec2[], inner: Vec2[]): THREE.Shape {
  const shape = vecToShape(outer);
  const hole = new THREE.Path();
  const ring = inner.slice().reverse();
  hole.moveTo(ring[0].x, ring[0].y);
  for (let i = 1; i < ring.length; i++) hole.lineTo(ring[i].x, ring[i].y);
  hole.closePath();
  shape.holes.push(hole);
  return shape;
}

export function columnMesh(
  xy: Vec2,
  z0: number,
  z1: number,
  r0: number,
  r1: number,
  material: THREE.Material,
): THREE.Mesh {
  const h = Math.max(0.04, z1 - z0);
  const geo = new THREE.CylinderGeometry(r1, r0, h, 28);
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(xy.x, xy.y, (z0 + z1) / 2);
  mesh.userData.stationaryColumn = { z0, z1, r0, r1 };
  return mesh;
}

/**
 * Tapered stationary column with a true coaxial through-bore. The exterior
 * radii follow `columnMesh` exactly; only the previously solid axis is removed.
 */
export function annularColumnMesh(
  xy: Vec2,
  z0: number,
  z1: number,
  r0: number,
  r1: number,
  bore: number,
  material: THREE.Material,
  segments = 28,
): THREE.Mesh {
  const h = Math.max(0.04, z1 - z0);
  if (!(bore > 0 && bore < Math.min(r0, r1))) {
    throw new Error(`annular column bore ${bore} must be inside exterior radii ${r0}/${r1}`);
  }
  const half = h * 0.5;
  const profile = [
    new THREE.Vector2(bore, -half),
    new THREE.Vector2(r0, -half),
    new THREE.Vector2(r1, half),
    new THREE.Vector2(bore, half),
    new THREE.Vector2(bore, -half),
  ];
  const geo = new THREE.LatheGeometry(profile, segments);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(xy.x, xy.y, (z0 + z1) / 2);
  mesh.userData.throughBoreRadius = bore;
  mesh.userData.targetThroughBoreRadius = bore;
  mesh.userData.minimumThroughBoreRadius = bore;
  return mesh;
}

/** Shoulder thickness. Physical seat top is `z1`; bottom is `z1 - SEAT_SHOULDER_H`. */
export const SEAT_SHOULDER_H = 0.07;
/** Intentional internal overlap so shaft/body cannot leave an air gap under the shoulder. */
export const SEAT_JOIN_OVERLAP = 0.012;

export type SeatStack = {
  rootH: number;
  shoulderH: number;
  seatTopZ: number;
  shoulderBottomZ: number;
  bodyTopZ: number;
  bodyBottomZ: number;
};

/**
 * Authoritative Z stack for an upper support.
 * `z1` is the physical seat top and must equal the bridge underside.
 * Body overlaps the shoulder by `SEAT_JOIN_OVERLAP`; there is no positive gap.
 */
export function seatStack(z0: number, z1: number): SeatStack {
  const h = Math.max(0.12, z1 - z0);
  const rootH = Math.min(0.28, h * 0.16);
  const shoulderBottomZ = z1 - SEAT_SHOULDER_H;
  return {
    rootH,
    shoulderH: SEAT_SHOULDER_H,
    seatTopZ: z1,
    shoulderBottomZ,
    bodyTopZ: shoulderBottomZ + SEAT_JOIN_OVERLAP,
    bodyBottomZ: z0 + rootH * 0.55,
  };
}

export function validateSeatStack(stack: SeatStack): { seatToBridgeReady: number; bodyToShoulder: number } {
  return {
    seatToBridgeReady: stack.seatTopZ,
    bodyToShoulder: stack.shoulderBottomZ - stack.bodyTopZ,
  };
}

/** Plate-connected standoff: flared root, tapered shaft, seat the bridge foot sits on. */
export function seatPost(
  xy: Vec2,
  z0: number,
  z1: number,
  rBase: number,
  rTop: number,
  face: THREE.Material,
  edge: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  const stack = seatStack(z0, z1);
  g.userData.seatStack = stack;
  const root = finishedStructure(circleShape(xy, rBase + 0.1), stack.rootH, face, edge, rBase + 0.4);
  root.position.z = z0 + stack.rootH * 0.5;
  g.add(root);
  g.add(columnMesh(xy, stack.bodyBottomZ, stack.bodyTopZ, rBase, rTop * 0.9, face));
  const shoulder = finishedStructure(circleShape(xy, rTop), stack.shoulderH, face, edge, rTop + 0.3);
  shoulder.position.z = (stack.shoulderBottomZ + stack.seatTopZ) / 2;
  g.add(shoulder);
  return g;
}

/** Continuous raised seat under a close group of hoop feet. */
export function seatIsland(
  points: Vec2[],
  z0: number,
  z1: number,
  halfWidth: number,
  face: THREE.Material,
  edge: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  const pts = points.length >= 2 ? points : [points[0], points[0]];
  const stack = seatStack(z0, z1);
  g.userData.seatStack = stack;
  const root = finishedStructure(strokeOpen(pts, () => halfWidth + 0.1), stack.rootH, face, edge, halfWidth + 0.6);
  root.position.z = z0 + stack.rootH * 0.5;
  g.add(root);
  const shaft = finishedStructure(
    strokeOpen(pts, () => halfWidth * 0.92),
    Math.max(0.1, stack.bodyTopZ - stack.bodyBottomZ),
    face,
    edge,
    halfWidth + 0.5,
  );
  shaft.position.z = (stack.bodyBottomZ + stack.bodyTopZ) / 2;
  g.add(shaft);
  const shoulder = finishedStructure(strokeOpen(pts, () => halfWidth * 0.96), stack.shoulderH, face, edge, halfWidth + 0.5);
  shoulder.position.z = (stack.shoulderBottomZ + stack.seatTopZ) / 2;
  g.add(shoulder);
  return g;
}

export function bossDisc(
  xy: Vec2,
  z: number,
  radius: number,
  thick: number,
  face: THREE.Material,
  edge: THREE.Material,
  segments = 24,
): THREE.Mesh {
  const mesh = finishedStructure(circleShape(xy, radius), thick, face, edge, radius + 0.4, segments);
  mesh.position.z = z;
  return mesh;
}

/** Stationary boss with the same exterior circle and an authorized axial bore. */
export function boredBossDisc(
  xy: Vec2,
  z: number,
  radius: number,
  bore: number,
  thick: number,
  face: THREE.Material,
  edge: THREE.Material,
  segments = 24,
): THREE.Mesh {
  if (!(bore > 0 && bore < radius)) {
    throw new Error(`boss bore ${bore} must be inside exterior radius ${radius}`);
  }
  const profileBore = beveledCircularBoreProfileRadius(bore, thick, segments);
  const shape = circleShape(xy, radius);
  const passage = new THREE.Path();
  passage.absarc(xy.x, xy.y, profileBore, 0, Math.PI * 2, true);
  shape.holes.push(passage);
  const mesh = finishedStructure(shape, thick, face, edge, radius + 0.4, segments);
  mesh.position.z = z;
  const minimumBore = minimumCircularBoreRadius(
    mesh.geometry,
    xy,
    (profileBore + radius) * 0.5,
  );
  mesh.userData.throughBoreRadius = minimumBore;
  mesh.userData.targetThroughBoreRadius = bore;
  mesh.userData.minimumThroughBoreRadius = minimumBore;
  mesh.userData.boreProfileRadius = profileBore;
  return mesh;
}

/**
 * Three's beveled extrusion offsets a hole inward by the bevel size. Circular
 * paths are polygonized at twice `curveSegments`, so compensate the secant as
 * well as the nominal bevel. The two-micron margin keeps the Float32 result on
 * the safe side of the authorized running radius without a visible change.
 */
export function beveledCircularBoreProfileRadius(
  minimumRadius: number,
  thickness: number,
  curveSegments: number,
): number {
  const bevelSize = Math.min(0.016, thickness * 0.2);
  const polygonOffset = bevelSize / Math.cos(Math.PI / (curveSegments * 2));
  return minimumRadius + polygonOffset + 0.000002;
}

/** Measure the narrowest rendered vertex ring belonging to a circular bore. */
export function minimumCircularBoreRadius(
  geometry: THREE.BufferGeometry,
  xy: Vec2,
  innerRegionMaxRadius: number,
): number {
  const positions = geometry.getAttribute("position");
  let minimum = Infinity;
  for (let i = 0; i < positions.count; i++) {
    const radius = Math.hypot(positions.getX(i) - xy.x, positions.getY(i) - xy.y);
    if (radius <= innerRegionMaxRadius) minimum = Math.min(minimum, radius);
  }
  if (!Number.isFinite(minimum)) {
    throw new Error("unable to measure circular bore vertices");
  }
  return minimum;
}

/** Continue a path through a seat so the member occupies the land, not just its perimeter. */
export function throughSeat(from: Vec2, seat: Vec2, extra: number): Vec2 {
  const dx = seat.x - from.x;
  const dy = seat.y - from.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: seat.x + (dx / l) * extra, y: seat.y + (dy / l) * extra };
}

/** Flare a stroke up to the seat radius as it enters each land. */
export function widthForSeats(
  pts: Vec2[],
  seats: { xy: Vec2; r: number }[],
  base: (i: number, t: number) => number,
): (i: number, t: number) => number {
  return (i, t) => {
    const p = pts[Math.max(0, Math.min(pts.length - 1, i))];
    let w = base(i, t);
    for (const s of seats) {
      const d = Math.hypot(p.x - s.xy.x, p.y - s.xy.y);
      const reach = s.r * 1.2;
      if (d < reach) {
        const u = 1 - d / reach;
        w = Math.max(w, s.r * (0.62 + 0.38 * u * u));
      }
    }
    return w;
  };
}

/** Reserved fastening-axis / bearing-locus marker. Not a boolean-cut through-hole. */
export function boreMarker(xy: Vec2, z: number, radius: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), material);
  mesh.position.set(xy.x, xy.y, z);
  return mesh;
}

export function fingerPath(from: Vec2, to: Vec2, bow = 0): Vec2[] {
  const tx = to.x - from.x;
  const ty = to.y - from.y;
  const nx = -ty;
  const ny = tx;
  const nl = Math.hypot(nx, ny) || 1;
  const pts: Vec2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const s = Math.sin(t * Math.PI);
    pts.push({
      x: from.x + tx * t + (nx / nl) * bow * s,
      y: from.y + ty * t + (ny / nl) * bow * s,
    });
  }
  return pts;
}

export function extendBack(from: Vec2, to: Vec2, dist: number): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: from.x - (dx / l) * dist, y: from.y - (dy / l) * dist };
}

export function widthFlare(min: number, max: number): (i: number, t: number) => number {
  return (_i, t) => {
    const s = Math.sin(t * Math.PI);
    return min + (max - min) * (1 - s * 0.55);
  };
}

export function pivotBossRadius(id: PivotId): number {
  return bossRadius(id);
}

export const PLATE_MID_Z = (STRUCT.plateTop + STRUCT.plateBottom) / 2;
export const PLATE_THICK = STRUCT.plateThick;
