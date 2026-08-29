/**
 * Phase 3A.1 packaging mathematics.
 * Accommodation-specific. Does not alter frozen Phase-2 helpers.
 */
import type { Vec2 } from "./spec";

/** Explicit numerical tolerance (mm). Not an aesthetic allowance. */
export const ACC_EPS = 1e-4;

export function signedArea(poly: Vec2[]): number {
  let a = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a * 0.5;
}

export function isCcw(poly: Vec2[]): boolean {
  return signedArea(poly) > 0;
}

export function convexHull(points: Vec2[]): Vec2[] {
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** True outward constant-distance offset of a convex polygon. */
export function offsetConvexExact(poly: Vec2[], distance: number): Vec2[] {
  const n = poly.length;
  if (n < 3) return poly.slice();
  const ccw = isCcw(poly);
  const shifted: { a: Vec2; b: Vec2 }[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = ccw ? dy / len : -dy / len;
    const ny = ccw ? -dx / len : dx / len;
    shifted.push({
      a: { x: a.x + nx * distance, y: a.y + ny * distance },
      b: { x: b.x + nx * distance, y: b.y + ny * distance },
    });
  }
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const e0 = shifted[(i + n - 1) % n];
    const e1 = shifted[i];
    out.push(intersectLines(e0.a, e0.b, e1.a, e1.b));
  }
  return out;
}

export function intersectLines(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 {
  const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(den) < 1e-12) {
    return { x: (eMid(p1, p2).x + eMid(p3, p4).x) * 0.5, y: (eMid(p1, p2).y + eMid(p3, p4).y) * 0.5 };
  }
  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

function eMid(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number; dist: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, dist: Math.hypot(p.x - point.x, p.y - point.y) };
}

export function pointToPolygonBoundary(p: Vec2, poly: Vec2[]): number {
  let min = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const d = closestOnSegment(p, poly[i], poly[(i + 1) % n]).dist;
    if (d < min) min = d;
  }
  return min;
}

/** Minimum Euclidean distance between two polygon boundaries. */
export function minBoundaryDistance(a: Vec2[], b: Vec2[]): number {
  let min = Infinity;
  for (const p of a) min = Math.min(min, pointToPolygonBoundary(p, b));
  for (const p of b) min = Math.min(min, pointToPolygonBoundary(p, a));
  return min;
}

export function pointInConvex(p: Vec2, poly: Vec2[], eps = ACC_EPS): boolean {
  const n = poly.length;
  const ccw = isCcw(poly);
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (ccw && cross < -eps) return false;
    if (!ccw && cross > eps) return false;
  }
  return true;
}

export function containsConvex(inner: Vec2[], outer: Vec2[], eps = ACC_EPS): boolean {
  return inner.every((p) => pointInConvex(p, outer, eps));
}

/** Rightmost intersection of the horizontal line y with a convex polygon. */
export function rightmostHorizontalHit(poly: Vec2[], y: number): Vec2 | null {
  const hits: Vec2[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dy = b.y - a.y;
    if (Math.abs(dy) < 1e-14) {
      if (Math.abs(a.y - y) < 1e-12) {
        hits.push({ x: a.x, y });
        hits.push({ x: b.x, y });
      }
      continue;
    }
    const t = (y - a.y) / dy;
    if (t < -1e-12 || t > 1 + 1e-12) continue;
    hits.push({ x: a.x + t * (b.x - a.x), y });
  }
  if (hits.length === 0) return null;
  return hits.reduce((best, p) => (p.x > best.x ? p : best), hits[0]);
}

export function closestOnPolyline(poly: Vec2[], hint: Vec2): {
  point: Vec2;
  t: number;
  a: Vec2;
  b: Vec2;
  index: number;
  dist: number;
} {
  let best = {
    point: poly[0],
    t: 0,
    a: poly[0],
    b: poly[1] ?? poly[0],
    index: 0,
    dist: Infinity,
  };
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const hit = closestOnSegment(hint, a, b);
    if (hit.dist < best.dist) {
      best = { point: hit.point, t: hit.t, a, b, index: i, dist: hit.dist };
    }
  }
  return best;
}

/** Outward unit normal of segment a→b given polygon winding. */
export function outwardNormal(a: Vec2, b: Vec2, ccw: boolean): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return ccw ? { x: dy / len, y: -dx / len } : { x: -dy / len, y: dx / len };
}

export function verticesOutside(points: Vec2[], hull: Vec2[], eps = ACC_EPS): number {
  let n = 0;
  for (const p of points) if (!pointInConvex(p, hull, eps)) n += 1;
  return n;
}

export function uniqueXy(points: Vec2[]): Vec2[] {
  const seen = new Set<string>();
  const out: Vec2[] = [];
  for (const p of points) {
    const k = `${p.x.toFixed(8)},${p.y.toFixed(8)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}
