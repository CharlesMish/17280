import * as THREE from "three";
import { ANGLES, DEPTH, ESCAPEMENT, MODULE, TEETH, THICK, type Vec2 } from "./spec";
import type { MaterialSet } from "./materials";
import { PALLET_CONTACT } from "./escapementContact";

export type WheelStyle = "wheel" | "pinion";
export type ToothProfile = "legacy" | "involute";
type RenderedZInterval = { min: number; max: number };

function polarV(radius: number, angle: number): THREE.Vector2 {
  return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function extrudeCentered(
  shape: THREE.Shape,
  thickness: number,
  bevel = true,
  curveSegments = 8,
): THREE.ExtrudeGeometry {
  const bevelSize = bevel ? Math.min(0.016, thickness * 0.2) : 0;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, thickness - 2 * bevelSize),
    bevelEnabled: bevel && bevelSize > 0,
    bevelThickness: bevelSize,
    bevelSize,
    bevelSegments: 2,
    curveSegments,
    steps: 1,
  });
  geometry.translate(0, 0, -thickness / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function conformRenderedZInterval<T extends THREE.BufferGeometry>(
  geometry: T,
  interval: RenderedZInterval | undefined,
): T {
  if (!interval) return geometry;
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) throw new Error("rendered Z interval requires geometry bounds");
  const span = bounds.max.z - bounds.min.z;
  if (!(span > 0)) throw new Error("rendered Z interval requires positive thickness");
  for (let i = 0; i < position.count; i++) {
    const t = (position.getZ(i) - bounds.min.z) / span;
    position.setZ(i, lerp(interval.min, interval.max, t));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Group 0 = broad faces (satin), group 1 = bevels / teeth flanks (polish). */
export function assignCapAndSideGroups(geometry: THREE.BufferGeometry): void {
  const index = geometry.getIndex();
  const pos = geometry.getAttribute("position");
  if (!index) return;
  const cap: number[] = [];
  const side: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const i0 = index.getX(i);
    const i1 = index.getX(i + 1);
    const i2 = index.getX(i + 2);
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    n.copy(ab.subVectors(b, a).cross(ac.subVectors(c, a))).normalize();
    if (Math.abs(n.z) > 0.62) cap.push(i0, i1, i2);
    else side.push(i0, i1, i2);
  }
  geometry.setIndex(cap.concat(side));
  geometry.clearGroups();
  geometry.addGroup(0, cap.length, 0);
  geometry.addGroup(cap.length, side.length, 1);
}

export function ensureTangents(geometry: THREE.BufferGeometry): void {
  if (geometry.getAttribute("tangent")) return;
  if (!geometry.getAttribute("normal") || !geometry.getAttribute("uv") || !geometry.getIndex()) return;
  try {
    geometry.computeTangents();
  } catch {
    /* some extrusions cannot form a tangent basis */
  }
}

export function applyPlanarUV(geometry: THREE.BufferGeometry, radius: number): void {
  const pos = geometry.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  const span = Math.max(radius * 2, 0.001);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / span + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / span + 0.5;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

function finishedMesh(
  geometry: THREE.ExtrudeGeometry,
  radius: number,
  face: THREE.Material,
  edge: THREE.Material,
): THREE.Mesh {
  applyPlanarUV(geometry, radius);
  assignCapAndSideGroups(geometry);
  const mesh = new THREE.Mesh(geometry, [face, edge]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function ringShape(outer: number, inner: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  if (inner > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return shape;
}

/**
 * Cycloidal-inspired tooth outline. Fine wheels stay slim and slightly
 * ogival; pinions get rounder leaves so they read as watch pinions.
 */
export function createSpurOutline(opts: {
  teeth: number;
  module: number;
  style?: WheelStyle;
  bore?: number;
}): THREE.Shape {
  const style = opts.style ?? (opts.teeth <= 16 ? "pinion" : "wheel");
  const pitchR = (opts.module * opts.teeth) / 2;
  const addendum = opts.module * (style === "pinion" ? 1.1 : 0.9);
  const dedendum = opts.module * (style === "pinion" ? 1.25 : 1.12);
  const outerR = pitchR + addendum;
  const rootR = Math.max(pitchR - dedendum, pitchR * 0.52);
  const toothAngle = (Math.PI * 2) / opts.teeth;
  const tipHalf = toothAngle * (style === "pinion" ? 0.16 : 0.088);
  const rootHalf = toothAngle * (style === "pinion" ? 0.26 : 0.28);
  const valleyHalf = toothAngle * 0.5;
  const flankN = style === "pinion" ? 4 : 6;
  const tipN = style === "pinion" ? 5 : 4;

  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < opts.teeth; i++) {
    const mid = i * toothAngle + toothAngle / 2;

    pts.push(polarV(rootR, mid - valleyHalf));

    for (let s = 1; s <= flankN; s++) {
      const t = s / flankN;
      const a = mid - lerp(rootHalf, tipHalf, t);
      const under =
        style === "wheel" ? Math.sin(t * Math.PI) * opts.module * 0.12 : 0;
      pts.push(polarV(lerp(rootR, outerR, smooth(t)) - under, a));
    }

    for (let s = 0; s <= tipN; s++) {
      const t = s / tipN;
      pts.push(polarV(outerR, mid - tipHalf + 2 * tipHalf * t));
    }

    for (let s = 1; s <= flankN; s++) {
      const t = s / flankN;
      const a = mid + lerp(tipHalf, rootHalf, t);
      const under =
        style === "wheel" ? Math.sin((1 - t) * Math.PI) * opts.module * 0.12 : 0;
      pts.push(polarV(lerp(outerR, rootR, smooth(t)) - under, a));
    }
  }

  const shape = new THREE.Shape(pts);
  shape.closePath();
  if (opts.bore && opts.bore > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, opts.bore, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return shape;
}

/**
 * Pair-selectable 20° involute outline.  It retains the project's existing
 * pitch, root and tip radii; only the working flank law differs from the
 * decorative legacy outline. `meshBacklash` is shared equally by the two
 * mating members when both use this constructor.
 */
function createInvoluteSpurOutline(opts: {
  teeth: number;
  module: number;
  style: WheelStyle;
  bore?: number;
  meshBacklash: number;
}): THREE.Shape {
  const pitchR = (opts.module * opts.teeth) / 2;
  const addendum = opts.module * (opts.style === "pinion" ? 1.1 : 0.9);
  const dedendum = opts.module * (opts.style === "pinion" ? 1.25 : 1.12);
  const outerR = pitchR + addendum;
  const rootR = Math.max(pitchR - dedendum, pitchR * 0.52);
  const pressure = THREE.MathUtils.degToRad(20);
  const baseR = pitchR * Math.cos(pressure);
  const inv = (angle: number): number => Math.tan(angle) - angle;
  const invPitch = inv(pressure);
  const toothAngle = (Math.PI * 2) / opts.teeth;
  // Half of the requested total mesh backlash is removed from each member.
  const halfAtPitch = toothAngle / 4 - opts.meshBacklash / (4 * pitchR);
  const flankHalf = (radius: number): number => {
    const workingR = Math.max(radius, baseR);
    const phi = Math.acos(Math.min(1, baseR / workingR));
    return Math.max(toothAngle * 0.012, halfAtPitch + invPitch - inv(phi));
  };
  const rootHalf = flankHalf(rootR);
  const flankN = opts.style === "pinion" ? 12 : 9;
  const rootArcN = 3;
  const tipN = 4;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < opts.teeth; i++) {
    const mid = i * toothAngle;
    for (let s = 0; s <= rootArcN; s++) {
      const t = s / rootArcN;
      pts.push(polarV(rootR, mid - toothAngle / 2 + (toothAngle / 2 - rootHalf) * t));
    }
    for (let s = 1; s <= flankN; s++) {
      const t = s / flankN;
      const radius = lerp(rootR, outerR, t);
      pts.push(polarV(radius, mid - flankHalf(radius)));
    }
    const tipHalf = flankHalf(outerR);
    for (let s = 1; s <= tipN; s++) {
      const t = s / tipN;
      pts.push(polarV(outerR, mid - tipHalf + 2 * tipHalf * t));
    }
    for (let s = 1; s <= flankN; s++) {
      const t = s / flankN;
      const radius = lerp(outerR, rootR, t);
      pts.push(polarV(radius, mid + flankHalf(radius)));
    }
    for (let s = 1; s <= rootArcN; s++) {
      const t = s / rootArcN;
      pts.push(polarV(rootR, mid + rootHalf + (toothAngle / 2 - rootHalf) * t));
    }
  }
  const shape = new THREE.Shape(pts);
  shape.closePath();
  if (opts.bore && opts.bore > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, opts.bore, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return shape;
}

function roundedWindow(
  innerR: number,
  outerR: number,
  a0: number,
  a1: number,
  corner: number,
): THREE.Path {
  const innerCorner = Math.min(corner, (outerR - innerR) * 0.45);
  const dInner = innerCorner / innerR;
  const dOuter = innerCorner / outerR;
  const samples: THREE.Vector2[] = [];

  const arc = (
    radius: number,
    start: number,
    end: number,
    steps: number,
  ): void => {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      samples.push(polarV(radius, lerp(start, end, t)));
    }
  };

  // Clockwise hole: outer a0→a1, inner a1→a0.
  arc(outerR, a0 + dOuter, a1 - dOuter, 8);
  arc(innerR, a1 - dInner, a0 + dInner, 8);

  const path = new THREE.Path();
  path.moveTo(samples[0].x, samples[0].y);
  for (let i = 1; i < samples.length; i++) {
    path.lineTo(samples[i].x, samples[i].y);
  }
  path.closePath();
  return path;
}

export function addCrossingHoles(
  shape: THREE.Shape,
  opts: {
    spokeCount: number;
    hubRadius: number;
    innerRim: number;
    spokeWidth: number;
    sweep?: number;
  },
): void {
  const sector = (Math.PI * 2) / opts.spokeCount;
  const inner = opts.hubRadius + 0.14;
  const outer = opts.innerRim - 0.1;
  if (outer - inner < 0.45) return;
  const sweep = opts.sweep ?? 0.05;

  for (let i = 0; i < opts.spokeCount; i++) {
    const aMid = i * sector + sector / 2;
    const hubAng = Math.asin(
      Math.min(0.85, (opts.spokeWidth * 0.62) / Math.max(inner, 0.2)),
    );
    const rimAng = Math.asin(
      Math.min(0.85, (opts.spokeWidth * 0.34) / Math.max(outer, 0.2)),
    );
    const waist = 0.045;
    shape.holes.push(
      waistedWindow({
        inner,
        outer,
        a0: aMid - sector / 2 + hubAng,
        a1: aMid + sector / 2 - hubAng,
        a0o: aMid - sector / 2 + rimAng + sweep,
        a1o: aMid + sector / 2 - rimAng + sweep,
        waist,
      }),
    );
  }
}

function waistedWindow(opts: {
  inner: number;
  outer: number;
  a0: number;
  a1: number;
  a0o: number;
  a1o: number;
  waist: number;
}): THREE.Path {
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  const steps = 7;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bow = Math.sin(t * Math.PI) * opts.waist;
    const aL = lerp(opts.a0, opts.a0o, t) - bow;
    const aR = lerp(opts.a1, opts.a1o, t) + bow;
    const r = lerp(opts.inner, opts.outer, smooth(t));
    left.push(polarV(r, aL));
    right.push(polarV(r, aR));
  }
  const samples: THREE.Vector2[] = [...left];
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    samples.push(polarV(opts.outer, lerp(opts.a0o, opts.a1o, t)));
  }
  for (let i = right.length - 1; i >= 0; i--) samples.push(right[i]);
  for (let i = 7; i >= 1; i--) {
    const t = i / 8;
    samples.push(polarV(opts.inner, lerp(opts.a0, opts.a1, t)));
  }
  const path = new THREE.Path();
  path.moveTo(samples[0].x, samples[0].y);
  for (let i = 1; i < samples.length; i++) {
    path.lineTo(samples[i].x, samples[i].y);
  }
  path.closePath();
  return path;
}

function createHub(
  radius: number,
  height: number,
  bore: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    extrudeCentered(ringShape(radius, bore), height, true, 48),
    material,
  );
  mesh.castShadow = true;
  return mesh;
}

function createArbor(opts: {
  name: string;
  radius: number;
  zMin: number;
  zMax: number;
  material: THREE.Material;
}): THREE.Group {
  const group = new THREE.Group();
  group.name = `${opts.name}:arbor`;
  const length = opts.zMax - opts.zMin;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(opts.radius, opts.radius, length, 24),
    opts.material,
  );
  shaft.name = `${opts.name}:arbor:shaft`;
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = (opts.zMin + opts.zMax) / 2;
  group.add(shaft);

  const pivotH = 0.22;
  const pivotR = opts.radius * 0.55;
  for (const z of [opts.zMin, opts.zMax]) {
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(pivotR, pivotH, 14),
      opts.material,
    );
    tip.name = `${opts.name}:arbor:${z === opts.zMax ? "upperTip" : "lowerTip"}`;
    tip.rotation.x = z === opts.zMax ? -Math.PI / 2 : Math.PI / 2;
    tip.position.z = z + (z === opts.zMax ? pivotH * 0.45 : -pivotH * 0.45);
    group.add(tip);
  }
  return group;
}

function createPinionMesh(
  teeth: number,
  module: number,
  thickness: number,
  bore: number,
  material: THREE.Material,
  bevel = true,
  profile: ToothProfile = "legacy",
  meshBacklash = 0,
  renderedZInterval?: RenderedZInterval,
): THREE.Mesh {
  const outline = profile === "involute"
    ? createInvoluteSpurOutline({ teeth, module, style: "pinion", bore, meshBacklash })
    : createSpurOutline({ teeth, module, style: "pinion", bore });
  const geometry = conformRenderedZInterval(
    extrudeCentered(outline, thickness, bevel),
    renderedZInterval,
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

export function createTrainWheel(opts: {
  teeth: number;
  module: number;
  thickness: number;
  spokeCount: number;
  spokeWidth: number;
  hubRadius: number;
  bore: number;
  face: THREE.Material;
  edge: THREE.Material;
  bevel?: boolean;
  toothProfile?: ToothProfile;
  meshBacklash?: number;
  renderedZInterval?: RenderedZInterval;
}): THREE.Mesh {
  const pitchR = (opts.module * opts.teeth) / 2;
  const rootR = pitchR - opts.module * 1.12;
  const shape = opts.toothProfile === "involute"
    ? createInvoluteSpurOutline({
        teeth: opts.teeth,
        module: opts.module,
        style: "wheel",
        bore: opts.bore,
        meshBacklash: opts.meshBacklash ?? 0,
      })
    : createSpurOutline({
        teeth: opts.teeth,
        module: opts.module,
        style: "wheel",
        bore: opts.bore,
      });
  addCrossingHoles(shape, {
    spokeCount: opts.spokeCount,
    hubRadius: opts.hubRadius,
    innerRim: rootR - 0.04,
    spokeWidth: opts.spokeWidth,
    sweep: opts.spokeCount === 5 ? 0.055 : 0.03,
  });
  return finishedMesh(
    conformRenderedZInterval(
      extrudeCentered(shape, opts.thickness, opts.bevel ?? true),
      opts.renderedZInterval,
    ),
    pitchR,
    opts.face,
    opts.edge,
  );
}

export function createBarrel(
  materials: MaterialSet,
  opts: {
    wheelBevel?: boolean;
    wheelToothProfile?: ToothProfile;
    meshBacklash?: number;
    wheelRenderedZInterval?: RenderedZInterval;
  } = {},
): THREE.Group {
  const group = new THREE.Group();
  const module = MODULE;
  const teeth = TEETH.barrel;
  const pitchR = (module * teeth) / 2;
  const rootR = pitchR - module * 1.15;
  const drumR = rootR - 0.12;
  const bore = 0.2;

  const ring = opts.wheelToothProfile === "involute"
    ? createInvoluteSpurOutline({
        teeth,
        module,
        style: "wheel",
        bore: drumR - 0.04,
        meshBacklash: opts.meshBacklash ?? 0,
      })
    : createSpurOutline({ teeth, module, style: "wheel", bore: drumR - 0.04 });
  const teethMesh = finishedMesh(
    conformRenderedZInterval(
      extrudeCentered(ring, THICK.barrelTeeth, opts.wheelBevel ?? true),
      opts.wheelRenderedZInterval,
    ),
    pitchR,
    materials.barrelFace,
    materials.barrelEdge,
  );
  teethMesh.name = "barrel:wheel";
  group.add(teethMesh);

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(drumR, drumR, THICK.barrelDrum, 72, 1, true),
    materials.barrel,
  );
  wall.rotation.x = Math.PI / 2;
  wall.position.z = THICK.barrelDrum * 0.5;
  wall.name = "barrel:drum";
  group.add(wall);

  const floor = finishedMesh(
    extrudeCentered(ringShape(drumR - 0.02, bore), 0.07, true, 56),
    drumR,
    materials.barrelFace,
    materials.barrelEdge,
  );
  floor.position.z = 0.06;
  floor.name = "barrel:floor";
  group.add(floor);

  const cover = ringShape(drumR - 0.04, 0.62);
  for (let i = 0; i < 3; i++) {
    const mid = (i * Math.PI * 2) / 3 + 0.45;
    const half = 0.22;
    cover.holes.push(roundedWindow(2.15, drumR - 1.55, mid - half, mid + half, 0.18));
  }
  const coverMesh = finishedMesh(
    extrudeCentered(cover, 0.075, true, 56),
    drumR,
    materials.barrelFace,
    materials.barrelEdge,
  );
  coverMesh.position.z = THICK.barrelDrum * 0.92;
  coverMesh.name = "barrel:cover";
  group.add(coverMesh);

  const mainspring = createMainspring(drumR - 0.28, 0.7, materials.spring);
  mainspring.name = "barrel:mainspring";
  group.add(mainspring);

  const hub = createHub(0.7, 0.5, bore, materials.barrel);
  hub.position.z = THICK.barrelDrum * 0.48;
  hub.name = "barrel:hub";
  group.add(hub);

  group.add(
    createArbor({
      name: "barrel",
      radius: 0.15,
      zMin: -0.55,
      zMax: THICK.barrelDrum + 0.28,
      material: materials.arbor,
    }),
  );
  return group;
}

function createMainspring(
  outerR: number,
  innerR: number,
  material: THREE.Material,
): THREE.Mesh {
  const turns = 6.2;
  const points: THREE.Vector3[] = [];
  const total = turns * Math.PI * 2;
  const n = 360;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const theta = t * total + 0.4;
    const r = innerR + (outerR - innerR) * t;
    points.push(new THREE.Vector3(Math.cos(theta) * r, Math.sin(theta) * r, 0.42));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, n, 0.045, 5, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

export function createTrainArbor(opts: {
  name: "center" | "third" | "fourth";
  wheelTeeth: number;
  pinionTeeth: number;
  module: number;
  wheelZ: number;
  pinionZ: number;
  pinionPhase?: number;
  wheelBevel?: boolean;
  pinionBevel?: boolean;
  wheelToothProfile?: ToothProfile;
  pinionToothProfile?: ToothProfile;
  meshBacklash?: number;
  wheelRenderedZInterval?: RenderedZInterval;
  pinionRenderedZInterval?: RenderedZInterval;
  spokeCount: number;
  hubRadius: number;
  spokeWidth: number;
  materials: MaterialSet;
  wheelThickness?: number;
  arborZMin?: number;
  arborZMax?: number;
}): THREE.Group {
  const group = new THREE.Group();
  const wheel = createTrainWheel({
    teeth: opts.wheelTeeth,
    module: opts.module,
    thickness: opts.wheelThickness ?? THICK.trainWheel,
    spokeCount: opts.spokeCount,
    spokeWidth: opts.spokeWidth,
    hubRadius: opts.hubRadius,
    bore: 0.14,
    face: opts.materials.wheelFace,
    edge: opts.materials.wheelEdge,
    bevel: opts.wheelBevel,
    toothProfile: opts.wheelToothProfile,
    meshBacklash: opts.meshBacklash,
    renderedZInterval: opts.wheelRenderedZInterval,
  });
  wheel.position.z = opts.wheelZ;
  wheel.name = `${opts.name}:wheel`;
  group.add(wheel);
  const hub = createHub(opts.hubRadius * 0.85, 0.2, 0.14, opts.materials.pinion);
  hub.position.z = opts.wheelZ;
  hub.name = `${opts.name}:hub`;
  group.add(hub);

  const pinion = createPinionMesh(
    opts.pinionTeeth,
    opts.module,
    THICK.pinionFace,
    0.12,
    opts.materials.pinion,
    opts.pinionBevel,
    opts.pinionToothProfile,
    opts.meshBacklash,
    opts.pinionRenderedZInterval,
  );
  pinion.position.z = opts.pinionZ;
  pinion.rotation.z = opts.pinionPhase ?? 0;
  pinion.name = `${opts.name}:pinion`;
  group.add(pinion);

  const zMin = opts.arborZMin ?? Math.min(opts.wheelZ, opts.pinionZ) - 0.5;
  const zMax = opts.arborZMax ?? Math.max(opts.wheelZ, opts.pinionZ) + 0.48;
  group.add(
    createArbor({
      name: opts.name,
      radius: 0.11,
      zMin,
      zMax,
      material: opts.materials.arbor,
    }),
  );
  return group;
}

export function createEscapeWheel(opts: {
  module: number;
  wheelZ: number;
  pinionZ: number;
  pitchRadius: number;
  materials: MaterialSet;
  /** Indexes clubs relative to the pinion without changing arbor rest phase. */
  clubIndex?: number;
  /** Pair-bounded going-train pinion clocking; never rotates the clubs. */
  pinionPhase?: number;
  pinionBevel?: boolean;
  pinionToothProfile?: ToothProfile;
  meshBacklash?: number;
  pinionRenderedZInterval?: RenderedZInterval;
  arborZMin?: number;
  arborZMax?: number;
}): THREE.Group {
  const group = new THREE.Group();
  const shape = createEscapeOutline(TEETH.escape, opts.pitchRadius);
  addCrossingHoles(shape, {
    spokeCount: 3,
    hubRadius: 0.46,
    innerRim: opts.pitchRadius - 0.82,
    spokeWidth: 0.24,
    sweep: 0.07,
  });
  const wheel = finishedMesh(
    extrudeCentered(shape, THICK.escape, true),
    opts.pitchRadius,
    opts.materials.escapeFace,
    opts.materials.wheelEdge,
  );
  wheel.position.z = opts.wheelZ;
  wheel.rotation.z = opts.clubIndex ?? 0;
  wheel.name = "escape:wheel";
  group.add(wheel);

  const hub = createHub(0.58, 0.2, 0.12, opts.materials.pinion);
  hub.position.z = opts.wheelZ;
  hub.name = "escape:hub";
  group.add(hub);

  const pinion = createPinionMesh(
    TEETH.escapePinion,
    opts.module,
    THICK.pinionFace,
    0.1,
    opts.materials.pinion,
    opts.pinionBevel,
    opts.pinionToothProfile,
    opts.meshBacklash,
    opts.pinionRenderedZInterval,
  );
  pinion.position.z = opts.pinionZ;
  pinion.rotation.z = opts.pinionPhase ?? 0;
  pinion.name = "escape:pinion";
  group.add(pinion);

  group.add(
    createArbor({
      name: "escape",
      radius: 0.1,
      zMin: opts.arborZMin ?? opts.pinionZ - 0.48,
      zMax: opts.arborZMax ?? opts.wheelZ + 0.46,
      material: opts.materials.arbor,
    }),
  );
  return group;
}

function createEscapeOutline(teeth: number, pitchR: number): THREE.Shape {
  const tipR = pitchR + 0.48;
  const clubR = pitchR + 0.55;
  const rootR = pitchR - 0.58;
  const stemR = pitchR - 0.22;
  const toothAngle = (Math.PI * 2) / teeth;
  const pts: THREE.Vector2[] = [];

  for (let i = 0; i < teeth; i++) {
    const a0 = i * toothAngle;
    const a1 = a0 + toothAngle;
    // Hooked club: nearly radial locking face, then a pad that reads from
    // three-quarter as well as from above. Wide valleys keep it from looking
    // like a going-train spur.
    pts.push(polarV(rootR, a0 + toothAngle * 0.06));
    pts.push(polarV(stemR, a0 + toothAngle * 0.03));
    pts.push(polarV(pitchR + 0.08, a0 + toothAngle * 0.015));
    pts.push(polarV(tipR, a0 + toothAngle * 0.01));
    pts.push(polarV(clubR, a0 + toothAngle * 0.09));
    pts.push(polarV(clubR + 0.06, a0 + toothAngle * 0.15));
    pts.push(polarV(clubR - 0.04, a0 + toothAngle * 0.2));
    pts.push(polarV(pitchR - 0.02, a0 + toothAngle * 0.22));
    pts.push(polarV(stemR, a0 + toothAngle * 0.26));
    pts.push(polarV(rootR, a0 + toothAngle * 0.48));
    pts.push(polarV(rootR, a1));
  }

  const shape = new THREE.Shape(pts);
  shape.closePath();
  const bore = new THREE.Path();
  bore.absarc(0, 0, 0.12, 0, Math.PI * 2, true);
  shape.holes.push(bore);
  return shape;
}

export function createPalletFork(materials: MaterialSet): THREE.Group {
  const group = new THREE.Group();
  group.name = "pallet:crankedLever";
  const lowerZ0 = ESCAPEMENT.palletLowerBodyZ.min - DEPTH.pallet;
  const lowerZ1 = ESCAPEMENT.palletLowerBodyZ.max - DEPTH.pallet;
  const lowerMid = (lowerZ0 + lowerZ1) * 0.5;
  const lowerThick = lowerZ1 - lowerZ0;
  const forkZ0 = ESCAPEMENT.palletForkZ.min - DEPTH.pallet;
  const forkZ1 = ESCAPEMENT.palletForkZ.max - DEPTH.pallet;
  const forkMid = (forkZ0 + forkZ1) * 0.5;
  const forkThick = forkZ1 - forkZ0;

  // The pallet axis is only 0.245 mm outside the measured maximum escape-club
  // radius. A circular r=0.28 lower lever hub therefore entered the club sweep
  // even though the frozen r=0.085 staff remains clear. Preserve the full hub
  // everywhere except a bounded sector facing the escape axis (local -Y).
  // The relieved r=0.21 land still leaves 0.123 mm of steel outside the
  // r=0.087 bore, and the 36°/52° eased sector covers the complete ±5.5° bank.
  const palletLowerBossShape = (() => {
    const shape = new THREE.Shape();
    const count = 128;
    const outer = 0.28;
    const relieved = 0.21;
    const sectorCenter = -Math.PI / 2;
    const fullRelief = (36 * Math.PI) / 180;
    const reliefEnd = (52 * Math.PI) / 180;
    const angularDistance = (angle: number): number =>
      Math.abs(Math.atan2(Math.sin(angle - sectorCenter), Math.cos(angle - sectorCenter)));
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2;
      const distance = angularDistance(angle);
      const raw = THREE.MathUtils.clamp(
        (distance - fullRelief) / (reliefEnd - fullRelief),
        0,
        1,
      );
      const eased = raw * raw * (3 - 2 * raw);
      const radius = THREE.MathUtils.lerp(relieved, outer, eased);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    const bore = new THREE.Path();
    bore.absarc(0, 0, 0.087, 0, Math.PI * 2, true);
    shape.holes.push(bore);
    return shape;
  })();
  const boss = finishedMesh(
    extrudeCentered(palletLowerBossShape, lowerThick, false, 40),
    0.3,
    materials.wheelFace,
    materials.wheelEdge,
  );
  boss.position.z = lowerMid;
  boss.name = "pallet:lowerBoss";
  boss.userData.escapeClubRelief = {
    frozenAxis: true,
    boreRadius: 0.087,
    originalOuterRadius: 0.28,
    relievedRadius: 0.21,
    fullReliefHalfAngleDeg: 36,
    transitionEndHalfAngleDeg: 52,
    minimumRadialWall: 0.123,
  };
  group.add(boss);

  for (const side of ["entry", "exit"] as const) {
    const solution = PALLET_CONTACT[side];
    const carrierDirection = new THREE.Vector2(solution.centerSeed.x, solution.centerSeed.y).normalize();
    const carrierNormal = new THREE.Vector2(-carrierDirection.y, carrierDirection.x);
    const carrierRoot = 0.14;
    const carrierEnd = 1.835;
    const rootHalfWidth = 0.075;
    const seatHalfWidth = 0.025;
    // The actual club witness crosses the old straight carrier near r=0.668,
    // on the escape-facing side of each arm. Dog-leg the neutral axis toward
    // the inactive side while retaining a useful 0.072–0.084 mm free-span
    // section, then return to the existing ruby's rear stock for its seat.
    const inactiveSign = side === "entry" ? 1 : -1;
    const carrierStations = [
      { radius: carrierRoot, offset: 0, halfWidth: rootHalfWidth },
      { radius: 0.42, offset: inactiveSign * 0.052, halfWidth: 0.042 },
      { radius: 1.55, offset: inactiveSign * 0.038, halfWidth: 0.036 },
      { radius: carrierEnd, offset: 0, halfWidth: seatHalfWidth },
    ];
    const carrierPoint = (station: (typeof carrierStations)[number], sideSign: number) =>
      carrierDirection.clone().multiplyScalar(station.radius).addScaledVector(
        carrierNormal,
        station.offset + sideSign * station.halfWidth,
      );
    const carrierShape = shapeFromVec2([
      ...carrierStations.map((station) => carrierPoint(station, -1)),
      ...[...carrierStations].reverse().map((station) => carrierPoint(station, 1)),
    ]);
    const arm = new THREE.Mesh(
      extrudeCentered(carrierShape, lowerThick, false, 8),
      materials.wheelFace,
    );
    arm.position.z = lowerMid;
    arm.name = `pallet:lowerArm:${side}`;
    arm.castShadow = true;
    arm.userData.stoneCarrierSeat = {
      side,
      carrierRootRadius: carrierRoot,
      carrierEndRadius: carrierEnd,
      rootWidth: rootHalfWidth * 2,
      embeddedSeatWidth: seatHalfWidth * 2,
      inactiveDoglegMaximum: 0.052,
      minimumFreeSpanWidth: 0.072,
      stoneSeedRadius: ESCAPEMENT.palletStoneRadius,
      nominalRadialEmbed: carrierEnd - 1.8063838967793484,
    };
    group.add(arm);
    const stone = new THREE.Mesh(
      extrudeCentered(
        shapeFromVec2(solution.polygon),
        ESCAPEMENT.palletStoneZ.max - ESCAPEMENT.palletStoneZ.min,
        false,
        16,
      ),
      materials.stone,
    );
    stone.position.z = (ESCAPEMENT.palletStoneZ.min + ESCAPEMENT.palletStoneZ.max) * 0.5 - DEPTH.pallet;
    stone.name = `pallet:stone:${side}`;
    stone.userData.contactFace = {
      lockTravel: solution.lockTravel,
      renderedClubRadius: solution.contactRadiusFromEscape,
      impulseTorque: solution.impulseTorque,
    };
    group.add(stone);
  }

  const balanceRelative = {
    x: Math.cos(ANGLES.balanceFromEscape) * ESCAPEMENT.escapeToBalance -
      Math.cos(ANGLES.palletFromEscape) * ESCAPEMENT.escapeToPallet,
    y: Math.sin(ANGLES.balanceFromEscape) * ESCAPEMENT.escapeToBalance -
      Math.sin(ANGLES.palletFromEscape) * ESCAPEMENT.escapeToPallet,
  };
  const forkDirection = Math.atan2(balanceRelative.y, balanceRelative.x) - ESCAPEMENT.palletNeutralReference;
  const forkUnit = new THREE.Vector2(Math.cos(forkDirection), Math.sin(forkDirection));
  const forkNormal = new THREE.Vector2(-forkUnit.y, forkUnit.x);
  const lowerLever = barBetween(
    new THREE.Vector2(), forkUnit.clone().multiplyScalar(4.04), 0.18,
    lowerThick, lowerMid, materials.wheelFace,
  );
  lowerLever.name = "pallet:lowerLever";
  group.add(lowerLever);

  const riser = barBetween(
    forkUnit.clone().multiplyScalar(3.86), forkUnit.clone().multiplyScalar(4.06), 0.38,
    forkZ0 - lowerZ1, (lowerZ1 + forkZ0) * 0.5, materials.wheelFace,
  );
  riser.name = "pallet:verticalRiser";
  group.add(riser);

  const forkPoint = (radial: number, lateral: number): Vec2 => ({
    x: forkUnit.x * radial + forkNormal.x * lateral,
    y: forkUnit.y * radial + forkNormal.y * lateral,
  });
  const slotHalf = ESCAPEMENT.forkSlot.width * 0.5;
  const leftHorn = new THREE.Mesh(
    extrudeCentered(shapeFromVec2([
      forkPoint(ESCAPEMENT.forkSlot.radialMin, -slotHalf),
      forkPoint(ESCAPEMENT.forkSlot.radialMax, -slotHalf),
      forkPoint(ESCAPEMENT.forkSlot.radialMax, -slotHalf - 0.1),
      forkPoint(4.3, -slotHalf - 0.1),
      forkPoint(4.2, -slotHalf - 0.05),
      forkPoint(ESCAPEMENT.forkSlot.radialMin, -slotHalf - 0.035),
    ]), forkThick, false, 8),
    materials.wheelFace,
  );
  leftHorn.position.z = forkMid;
  leftHorn.name = "pallet:forkHorn:left";
  group.add(leftHorn);

  const rightHorn = new THREE.Mesh(
    extrudeCentered(shapeFromVec2([
      forkPoint(ESCAPEMENT.forkSlot.radialMin, slotHalf),
      forkPoint(ESCAPEMENT.forkSlot.radialMin, slotHalf + 0.1),
      forkPoint(ESCAPEMENT.forkSlot.radialMax, slotHalf + 0.1),
      forkPoint(ESCAPEMENT.forkSlot.radialMax, slotHalf),
    ]), forkThick, false, 8),
    materials.wheelFace,
  );
  rightHorn.position.z = forkMid;
  rightHorn.name = "pallet:forkHorn:right";
  group.add(rightHorn);

  const bridgeInner = ESCAPEMENT.forkSlot.radialMin - 0.039;
  const forkBridge = new THREE.Mesh(
    extrudeCentered(shapeFromVec2([
      forkPoint(bridgeInner, -slotHalf - 0.02),
      forkPoint(bridgeInner, slotHalf + 0.1),
      forkPoint(ESCAPEMENT.forkSlot.radialMin, slotHalf + 0.1),
      forkPoint(ESCAPEMENT.forkSlot.radialMin, -slotHalf - 0.035),
    ]), forkThick, false, 8),
    materials.wheelFace,
  );
  forkBridge.position.z = forkMid;
  forkBridge.name = "pallet:forkBridge";
  group.add(forkBridge);

  const bankingLug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, lowerThick, 20), materials.pinion);
  bankingLug.rotation.x = Math.PI / 2;
  bankingLug.position.set(-0.5, 0, lowerMid);
  bankingLug.name = "pallet:bankingLug";
  group.add(bankingLug);

  group.add(
    createArbor({
      name: "pallet",
      radius: 0.085,
      zMin: -0.55,
      zMax: 0.55,
      material: materials.arbor,
    }),
  );
  return group;
}

function shapeFromVec2(points: readonly Vec2[]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].y);
  shape.closePath();
  return shape;
}

function barBetween(
  from: THREE.Vector2,
  to: THREE.Vector2,
  width: number,
  thick: number,
  z: number,
  material: THREE.Material,
): THREE.Mesh {
  const length = from.distanceTo(to);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, width, thick), material);
  mesh.position.set((from.x + to.x) * 0.5, (from.y + to.y) * 0.5, z);
  mesh.rotation.z = Math.atan2(to.y - from.y, to.x - from.x);
  mesh.castShadow = true;
  return mesh;
}

export function createBalance(materials: MaterialSet): THREE.Group {
  const group = new THREE.Group();
  const outer = ESCAPEMENT.balanceRimRadius;
  const inner = outer - 0.4;
  const rim = finishedMesh(
    extrudeCentered(ringShape(outer, inner), THICK.balanceRim, true, 80),
    outer,
    materials.balanceFace,
    materials.balanceEdge,
  );
  group.add(rim);

  for (let i = 0; i < ESCAPEMENT.balanceArmCount; i++) {
    const a = (i * Math.PI * 2) / ESCAPEMENT.balanceArmCount + Math.PI / 6;
    const arm = createBalanceArm(inner - 0.02, 0.28, materials.balance);
    arm.rotation.z = a;
    group.add(arm);
  }

  const hub = createHub(0.58, 0.26, 0.1, materials.pinion);
  group.add(hub);

  const screwCount = 6;
  for (let i = 0; i < screwCount; i++) {
    const a = (i * Math.PI * 2) / screwCount + Math.PI / 12;
    const screw = createTimingScrew(materials.screw);
    screw.position.set(Math.cos(a) * (outer - 0.16), Math.sin(a) * (outer - 0.16), 0);
    screw.rotation.z = a;
    group.add(screw);
  }

  const jewelAngle = ESCAPEMENT.rollerJewel.neutralAzimuth;
  const jewelX = Math.cos(jewelAngle) * ESCAPEMENT.rollerJewel.radialOffset;
  const jewelY = Math.sin(jewelAngle) * ESCAPEMENT.rollerJewel.radialOffset;
  const seatZ0 = 2.36;
  const seatZ1 = seatZ0 + ESCAPEMENT.rollerJewel.seatDepth;
  const seatLayerShape = ringShape(0.72, 0.12);
  const seatPocket = new THREE.Path();
  seatPocket.absarc(jewelX, jewelY, ESCAPEMENT.rollerJewel.radius + 0.001, 0, Math.PI * 2, true);
  seatLayerShape.holes.push(seatPocket);
  const seatLayer = new THREE.Mesh(
    extrudeCentered(seatLayerShape, seatZ1 - seatZ0, false, 40),
    materials.pinion,
  );
  seatLayer.position.z = (seatZ0 + seatZ1) * 0.5 - DEPTH.balance;
  seatLayer.name = "balance:roller:seatLayer";
  group.add(seatLayer);

  const rollerRoof = new THREE.Mesh(
    extrudeCentered(ringShape(0.72, 0.12), 2.48 - seatZ1, false, 40),
    materials.pinion,
  );
  rollerRoof.position.z = (seatZ1 + 2.48) * 0.5 - DEPTH.balance;
  rollerRoof.name = "balance:roller:roof";
  group.add(rollerRoof);

  const impulse = new THREE.Mesh(
    new THREE.CylinderGeometry(
      ESCAPEMENT.rollerJewel.radius,
      ESCAPEMENT.rollerJewel.radius,
      ESCAPEMENT.rollerJewel.height,
      16,
    ),
    materials.stone,
  );
  impulse.rotation.x = Math.PI / 2;
  impulse.position.set(jewelX, jewelY, ESCAPEMENT.rollerJewel.worldCenterZ - DEPTH.balance);
  impulse.name = "balance:impulseJewel";
  group.add(impulse);

  group.add(
    createArbor({
      name: "balance",
      radius: 0.09,
      zMin: -0.85,
      zMax: 0.55,
      material: materials.arbor,
    }),
  );
  return group;
}

function createBalanceArm(
  length: number,
  width: number,
  material: THREE.Material,
): THREE.Mesh {
  const shape = new THREE.Shape();
  const half = width / 2;
  shape.moveTo(0.42, -half * 1.25);
  shape.quadraticCurveTo(length * 0.42, -half * 0.72, length - 0.08, -half * 0.42);
  shape.absarc(length, 0, half * 0.42, -Math.PI / 2, Math.PI / 2, false);
  shape.quadraticCurveTo(length * 0.42, half * 0.72, 0.42, half * 1.25);
  shape.closePath();
  const mesh = new THREE.Mesh(extrudeCentered(shape, 0.13, true, 10), material);
  mesh.castShadow = true;
  return mesh;
}

function createTimingScrew(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.145, 0.09, 20), material);
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.13;
  const chamfer = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.03, 20), material);
  chamfer.rotation.x = Math.PI / 2;
  chamfer.position.z = 0.185;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.035), material);
  slot.position.z = 0.205;
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 12), material);
  stub.rotation.x = Math.PI / 2;
  stub.position.z = 0.02;
  group.add(head, chamfer, slot, stub);
  return group;
}

export type Hairspring = {
  group: THREE.Group;
  update(innerAngle: number): void;
};

export function createHairspring(
  material: THREE.Material,
  fittings: THREE.Material = material,
): Hairspring {
  const group = new THREE.Group();
  const turns = ESCAPEMENT.hairspringTurns;
  const inner = ESCAPEMENT.hairspringInner;
  const outer = ESCAPEMENT.hairspringOuter;
  const tube = ESCAPEMENT.hairspringTube;
  const total = turns * Math.PI * 2;
  const count = Math.round(turns * 80);
  const radii: number[] = [];
  const thetas: number[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    radii.push(inner + (outer - inner) * t);
    thetas.push(t * total);
  }

  const radial = 5;
  const positions = new Float32Array((count + 1) * (radial + 1) * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const index: number[] = [];
  for (let i = 0; i < count; i++) {
    for (let r = 0; r < radial; r++) {
      const a = i * (radial + 1) + r;
      const b = a + radial + 1;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  geometry.setIndex(index);

  const write = (innerAngle: number): void => {
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const drdt = outer - inner;
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const theta = thetas[i] + innerAngle * (1 - t) * (1 - t);
      const r = radii[i];
      const x = Math.cos(theta) * r;
      const y = Math.sin(theta) * r;
      // Analytic tangent of the deformed centerline r(t), theta(t).
      const dThetaDt = total - 2 * innerAngle * (1 - t);
      const dxdt = drdt * Math.cos(theta) - r * Math.sin(theta) * dThetaDt;
      const dydt = drdt * Math.sin(theta) + r * Math.cos(theta) * dThetaDt;
      const tLen = Math.hypot(dxdt, dydt) || 1;
      const nx = -dydt / tLen;
      const ny = dxdt / tLen;
      for (let s = 0; s <= radial; s++) {
        const u = (s / radial) * Math.PI * 2;
        const cu = Math.cos(u) * tube;
        const zu = Math.sin(u) * tube;
        const idx = (i * (radial + 1) + s) * 3;
        pos.array[idx] = x + nx * cu;
        pos.array[idx + 1] = y + ny * cu;
        pos.array[idx + 2] = zu;
      }
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  };

  write(0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  group.add(mesh);

  const collet = new THREE.Mesh(
    extrudeCentered(ringShape(0.4, 0.11), 0.09, true, 32),
    fittings,
  );
  group.add(collet);

  const stud = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.12), fittings);
  const studAngle = thetas[thetas.length - 1];
  stud.position.set(Math.cos(studAngle) * outer, Math.sin(studAngle) * outer, 0);
  stud.rotation.z = studAngle;
  group.add(stud);

  return {
    group,
    update: (innerAngle: number) => {
      write(innerAngle);
      collet.rotation.z = innerAngle;
    },
  };
}
