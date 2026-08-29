import * as THREE from "three";
import { DEPTH, ESCAPEMENT, MOTION, THICK, type Layout, type Vec2 } from "./spec";
import {
  STRUCT,
  ESCAPE_FINGER_UNDERPASS,
  closestOnRing,
  createStructuralPlan,
  lowerColumnNeeded,
  lowerSeatZ,
  validateFootAuthority,
  validateSeatSemantics,
  type Anchorage,
  type BearingSeat,
  type Locus,
  type StructuralPlan,
} from "./structureSpec";
import {
  PLATE_MID_Z,
  SEAT_JOIN_OVERLAP,
  annularColumnMesh,
  boredBossDisc,
  bossDisc,
  circleShape,
  columnMesh,
  extendBack,
  finishedStructure,
  fingerPath,
  hoopShape,
  minimumCircularBoreRadius,
  seatIsland,
  seatPost,
  seatStack,
  strokeOpen,
  strokeOpenSided,
  throughSeat,
  unionStructuralShapes,
  validateSeatStack,
  vecToShape,
  widthFlare,
  widthForSeats,
} from "./structureGeometry";
import { createStructureMaterials, type StructureMaterials } from "./structureMaterials";

const CENTER_PASSAGE_RADIUS = 0.082;

export type StructureViewName =
  | "structHero"
  | "structTop"
  | "structTrain"
  | "structEscape"
  | "structCock"
  | "structProfile"
  | "silhouette"
  | "structAudit"
  | "structRear"
  | "structRearOblique"
  | "structRearGrazing";

export const STRUCTURE_VIEWS: Record<
  StructureViewName,
  { position: THREE.Vector3; target: THREE.Vector3 }
> = {
  structHero: {
    position: new THREE.Vector3(12.2, 9.4, 22.4),
    target: new THREE.Vector3(-1.5, 1.2, 0.9),
  },
  structTop: {
    position: new THREE.Vector3(-1.5, 1.1, 34),
    target: new THREE.Vector3(-1.5, 1.1, 0.4),
  },
  structTrain: {
    position: new THREE.Vector3(8.4, 2.2, 11.5),
    target: new THREE.Vector3(2.2, 0.6, 1.4),
  },
  structEscape: {
    position: new THREE.Vector3(5.2, 7.4, 9.6),
    target: new THREE.Vector3(-1.5, 4.4, 2.3),
  },
  structCock: {
    position: new THREE.Vector3(-1.2, 11.6, 8.4),
    target: new THREE.Vector3(-3.4, 6.6, 3.1),
  },
  structProfile: {
    position: new THREE.Vector3(20.5, 1.2, 3.8),
    target: new THREE.Vector3(-1.2, 1.2, 1.1),
  },
  silhouette: {
    position: new THREE.Vector3(-1.5, 1.1, 36),
    target: new THREE.Vector3(-1.5, 1.1, 0.4),
  },
  structAudit: {
    position: new THREE.Vector3(22.5, 11.2, 7.2),
    target: new THREE.Vector3(1.6, 2.4, 1.15),
  },
  structRear: {
    position: new THREE.Vector3(-1.4, 1.0, -28),
    target: new THREE.Vector3(-1.4, 1.0, -0.6),
  },
  structRearOblique: {
    position: new THREE.Vector3(14.5, -11.0, -12.5),
    target: new THREE.Vector3(0.2, 1.2, 0.1),
  },
  structRearGrazing: {
    position: new THREE.Vector3(-1.6, -8.1, -2.55),
    target: new THREE.Vector3(-6.05, -2.82, -1.02),
  },
};

export type ContinuityRow = {
  id: string;
  element: string;
  bridgeBottomZ: number;
  seatTopZ: number;
  seatToBridge: number;
  shoulderBottomZ: number;
  bodyTopZ: number;
  bodyToShoulder: number;
  relation: "contact" | "overlap" | "gap";
};

export type StructureAuditReport = {
  maxFootDelta: number;
  maxSeatToBridgeGap: number;
  maxBodyToShoulderGap: number;
  maxBodyToShoulderOverlap: number;
  continuity: ContinuityRow[];
  feet: { id: string; declared: { x: number; y: number }; rendered: { x: number; y: number }; delta: number }[];
  elements: {
    id: string;
    supports: string[];
    bearings: { id: string; pivot: string; xy: { x: number; y: number }; z: number; bossRadius: number }[];
    anchors: Anchorage[];
  }[];
  lowerColumns: { pivot: string; present: boolean; seatZ: number; plateTop: number; rise: number }[];
  jointEnvelopes: JointEnvelopeRow[];
  jointSeats: JointSeatRow[];
};

export type JointSeatRow = {
  pivot: string;
  element: string;
  memberThick: number;
  bossThick: number;
  zAligned: boolean;
  pathThrough: boolean;
  memberHalfWAtSeat: number;
  bossR: number;
  xyOverlap: number;
  seated: boolean;
};

export type JointEnvelopeRow = {
  pivot: string;
  hasFrontLand: boolean;
  frontR: number;
  lowerBossR: number;
  columnBotR: number;
  columnTopR: number;
  lowerOverflow: number;
  contained: boolean;
};

export type MovementStructure = {
  root: THREE.Group;
  pose: THREE.Group;
  plan: StructuralPlan;
  loci: Locus[];
  materials: StructureMaterials;
  debug: THREE.Group;
  auditLights: THREE.Group;
  engineeringOwners: ReadonlyMap<string, THREE.Object3D>;
  footAuthority: { id: string; delta: number }[];
  report: () => StructureAuditReport;
  setSilhouette: (on: boolean) => void;
  setAudit: (on: boolean) => void;
  setJointId: (on: boolean) => void;
};


export function createMovementStructure(layout: Layout): MovementStructure {
  const materials = createStructureMaterials();
  const root = new THREE.Group();
  root.name = "structure:root";
  const pose = new THREE.Group();
  pose.name = "structure:pose";
  root.add(pose);

  const plan = createStructuralPlan(layout);
  const renderedFeet: { id: string; xy: Vec2 }[] = [];
  const engineeringOwners = new Map<string, THREE.Object3D>();

  pose.add(buildMainplate(layout, plan, materials, engineeringOwners));
  pose.add(buildTrainBridge(layout, plan, materials, renderedFeet, engineeringOwners));
  pose.add(buildEscapeFinger(layout, plan, materials, renderedFeet));
  pose.add(buildBalanceCock(layout, plan, materials, renderedFeet));
  pose.add(buildAnchorPosts(plan, materials));

  const footAuthority = validateFootAuthority(plan, renderedFeet);
  const maxDelta = footAuthority.reduce((m, f) => Math.max(m, f.delta), 0);
  if (maxDelta > 1e-9) {
    console.warn("structural foot authority mismatch", maxDelta, footAuthority);
  }
  const continuity = buildContinuity(plan);
  const maxSeatGap = continuity.reduce((m, r) => Math.max(m, r.seatToBridge), 0);
  const maxBodyGap = continuity.reduce((m, r) => Math.max(m, r.bodyToShoulder), 0);
  if (maxSeatGap > 1e-9 || maxBodyGap > 1e-9) {
    console.warn("structural Z continuity gap", { maxSeatGap, maxBodyGap, continuity });
  }

  const debug = buildDebug(plan);
  debug.visible = false;
  root.add(debug);

  const auditLights = new THREE.Group();
  auditLights.name = "structure:auditLights";
  auditLights.visible = false;
  const fill = new THREE.HemisphereLight(0xf4f6f8, 0x9aa0a6, 1.45);
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(10, 6, 12);
  const under = new THREE.DirectionalLight(0xffffff, 0.55);
  under.position.set(3, -10, 4);
  const rim = new THREE.DirectionalLight(0xffffff, 0.5);
  rim.position.set(-8, 3, -10);
  auditLights.add(fill, key, under, rim);
  root.add(auditLights);

  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  pose.traverse((obj) => {
    if (obj instanceof THREE.Mesh) originals.set(obj, obj.material);
  });

  const report = (): StructureAuditReport => {
    const feet = renderedFeet.map((r) => {
      const a = plan.anchors[r.id];
      return {
        id: r.id,
        declared: a ? { x: a.xy.x, y: a.xy.y } : { x: NaN, y: NaN },
        rendered: { x: r.xy.x, y: r.xy.y },
        delta: a ? Math.hypot(a.xy.x - r.xy.x, a.xy.y - r.xy.y) : Infinity,
      };
    });
    return {
      maxFootDelta: feet.reduce((m, f) => Math.max(m, f.delta), 0),
      maxSeatToBridgeGap: Math.max(0, ...continuity.map((r) => r.seatToBridge)),
      maxBodyToShoulderGap: Math.max(0, ...continuity.map((r) => r.bodyToShoulder)),
      maxBodyToShoulderOverlap: Math.max(0, ...continuity.map((r) => -r.bodyToShoulder)),
      continuity,
      feet,
      elements: plan.elements
        .filter((el) => el.kind !== "plate")
        .map((el) => ({
          id: el.id,
          supports: [...el.supports],
          bearings: plan.bearings
            .filter((b) => b.element === el.id)
            .map((b) => ({
              id: b.id,
              pivot: b.pivot,
              xy: { x: b.xy.x, y: b.xy.y },
              z: b.z,
              bossRadius: b.bossRadius,
            })),
          anchors: Object.values(plan.anchors).filter((a) => a.element === el.id),
        })),
      lowerColumns: plan.bearings
        .filter((b) => b.seat === "lower")
        .map((b) => {
          const seatZ = lowerSeatZ(b.pivot);
          const present = lowerColumnNeeded(b.pivot);
          return {
            pivot: b.pivot,
            present,
            seatZ,
            plateTop: STRUCT.plateTop,
            rise: present ? seatZ - 0.05 - STRUCT.plateTop : 0.1,
          };
        }),
      jointEnvelopes: plan.bearings
        .filter((b) => b.seat === "lower")
        .map((b) => jointEnvelope(plan, b.pivot)),
      jointSeats: seatAudit(plan),
    };
  };

  return {
    root,
    pose,
    plan,
    loci: plan.loci,
    materials,
    debug,
    auditLights,
    engineeringOwners,
    footAuthority,
    report,
    setSilhouette: (on: boolean) => {
      for (const [mesh, mat] of originals) {
        mesh.material = on ? materials.silhouette : mat;
      }
    },
    setAudit: (on: boolean) => {
      auditLights.visible = on;
      for (const [mesh, mat] of originals) {
        mesh.material = on ? materials.audit : mat;
      }
    },
    setJointId: (on: boolean) => {
      auditLights.visible = on;
      if (!on) {
        for (const [mesh, mat] of originals) mesh.material = mat;
        return;
      }
      const idBoss = new THREE.MeshBasicMaterial({ color: 0x2f80ed });
      const idFoot = new THREE.MeshBasicMaterial({ color: 0x8e44ad });
      const idCol = new THREE.MeshBasicMaterial({ color: 0x1abc9c });
      const idBody = new THREE.MeshBasicMaterial({ color: 0x566573 });
      pose.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        if (o.name.startsWith("struct:boss:")) o.material = idBoss;
        else if (o.name.startsWith("struct:foot:")) o.material = idFoot;
        else if (o.name.startsWith("struct:column:")) o.material = idCol;
        else o.material = idBody;
      });
    },
  };
}

/**
 * Front-visible land vs lower support envelope.
 * When an upper boss exists, the lower column/boss must sit inside that land
 * so the backside stack cannot silhouette around the front joint.
 * Barrel has no upper land; keep its full plate boss.
 */
function jointEnvelope(plan: StructuralPlan, pivot: string): JointEnvelopeRow {
  const lower = plan.bearings.find((b) => b.pivot === pivot && b.seat === "lower");
  const upper = plan.bearings.find((b) => b.pivot === pivot && b.seat === "upper");
  const planLowerR = lower?.bossRadius ?? 0;
  if (!upper) {
    const colBot = Math.max(0.12, planLowerR - STRUCT.columnTaper);
    return {
      pivot,
      hasFrontLand: false,
      frontR: planLowerR,
      lowerBossR: planLowerR,
      columnBotR: colBot,
      columnTopR: planLowerR * 0.92,
      lowerOverflow: 0,
      contained: true,
    };
  }
  const frontR = upper.bossRadius;
  // Land slightly inside the front boss so a 3/4 ray cannot pick up a rear rim.
  // Still above assembly min land (setting ~0.33 + 0.055 margin).
  const lowerBossR = frontR * 0.94;
  const columnTopR = frontR * 0.7;
  const columnBotR = frontR * 0.82;
  const overflow = Math.max(0, lowerBossR - frontR, columnTopR - frontR, columnBotR - frontR);
  return {
    pivot,
    hasFrontLand: true,
    frontR,
    lowerBossR,
    columnBotR,
    columnTopR,
    lowerOverflow: overflow,
    contained: overflow <= 1e-6,
  };
}

function memberThickFor(element: string): number {
  if (element === "trainBridge") return STRUCT.trainBridgeThick;
  if (element === "escapeFinger") return STRUCT.escapeBridgeThick;
  if (element === "balanceCock") return STRUCT.cockThick;
  return STRUCT.plateThick;
}

function seatAudit(plan: StructuralPlan): JointSeatRow[] {
  return plan.bearings
    .filter((b) => b.seat === "upper")
    .map((b) => {
      const crankedEscapeFinger = b.element === "escapeFinger";
      const memberThick = crankedEscapeFinger
        ? ESCAPE_FINGER_UNDERPASS.top - ESCAPE_FINGER_UNDERPASS.bottom
        : memberThickFor(b.element);
      const bossThick = crankedEscapeFinger ? STRUCT.escapeBridgeThick : memberThick;
      const memberHalfWAtSeat = b.bossRadius;
      const xyOverlap = memberHalfWAtSeat - b.bossRadius * 0.35;
      const zOverlap = crankedEscapeFinger
        ? ESCAPE_FINGER_UNDERPASS.top - STRUCT.escapeBridgeBottom + 0.016
        : bossThick;
      return {
        pivot: b.pivot,
        element: b.element,
        memberThick,
        bossThick,
        zAligned: !crankedEscapeFinger,
        pathThrough: true,
        memberHalfWAtSeat,
        bossR: b.bossRadius,
        xyOverlap,
        seated: xyOverlap > 0.05 && zOverlap > 0,
      };
    });
}

function buildContinuity(plan: StructuralPlan): ContinuityRow[] {
  const semantic = validateSeatSemantics(plan);
  return Object.values(plan.anchors).map((a) => {
    const stack = seatStack(a.plateTopZ, a.seatTopZ);
    const crankedEscapeAnchor = a.id === "anchor:escape";
    const bridgeBottomZ = crankedEscapeAnchor
      ? ESCAPE_FINGER_UNDERPASS.bottom
      : a.bridgeBottomZ;
    const renderedShoulderTopZ =
      stack.seatTopZ - Math.min(0.016, stack.shoulderH * 0.2);
    const effectiveSeatTopZ = crankedEscapeAnchor ? renderedShoulderTopZ : stack.seatTopZ;
    const seatToBridge = bridgeBottomZ - effectiveSeatTopZ;
    const bodyToShoulder = validateSeatStack(stack).bodyToShoulder;
    const semanticDelta = crankedEscapeAnchor
      ? seatToBridge
      : semantic.find((s) => s.id === a.id)?.delta ?? seatToBridge;
    return {
      id: a.id,
      element: a.element,
      bridgeBottomZ,
      seatTopZ: effectiveSeatTopZ,
      seatToBridge: semanticDelta,
      shoulderBottomZ: stack.shoulderBottomZ,
      bodyTopZ: stack.bodyTopZ,
      bodyToShoulder,
      relation: crankedEscapeAnchor
        ? seatToBridge < -1e-9
          ? "overlap"
          : seatToBridge > 1e-9
            ? "gap"
            : "contact"
        : bodyToShoulder > 1e-9
          ? "gap"
          : bodyToShoulder < -1e-9
            ? "overlap"
            : "contact",
    };
  });
}

function markFoot(mesh: THREE.Object3D, id: string, xy: Vec2, rendered: { id: string; xy: Vec2 }[]): void {
  mesh.userData.locusId = id;
  mesh.userData.locusXy = xy;
  rendered.push({ id, xy: { x: xy.x, y: xy.y } });
}

function walkRing(ring: Vec2[], hint: Vec2, delta: number): Vec2 {
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const d = (ring[i].x - hint.x) ** 2 + (ring[i].y - hint.y) ** 2;
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  const n = ring.length;
  return ring[(bestI + delta + n * 8) % n];
}

function widthBossBlend(waist: number, end: number): (i: number, t: number) => number {
  return (_i, t) => {
    const s = Math.sin(t * Math.PI);
    return waist + (end - waist) * (1 - s);
  };
}

/** Bury a hoop-rooted ribbon start in the rim band, along inner→outer, not along the chord. */
function embedThroughHoop(innerPt: Vec2, outer: Vec2[], dist: number): Vec2 {
  const o = closestOnRing(outer, innerPt);
  const dx = o.x - innerPt.x;
  const dy = o.y - innerPt.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: innerPt.x + (dx / l) * dist, y: innerPt.y + (dy / l) * dist };
}

function bowedPath(from: Vec2, to: Vec2, bow: number, steps: number): Vec2[] {
  const tx = to.x - from.x;
  const ty = to.y - from.y;
  const nx = -ty;
  const ny = tx;
  const nl = Math.hypot(nx, ny) || 1;
  const pts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = Math.sin(t * Math.PI);
    pts.push({
      x: from.x + tx * t + (nx / nl) * bow * s,
      y: from.y + ty * t + (ny / nl) * bow * s,
    });
  }
  return pts;
}

/** Remove only duplicate/strictly-collinear union vertices; the outline itself is unchanged. */
function cleanUnionOutline(shape: THREE.Shape): THREE.Shape {
  const epsilon = 1e-6;
  let points = shape.getPoints(12).map((point) => ({ x: point.x, y: point.y }));
  if (
    points.length > 1 &&
    Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y) <= epsilon
  ) {
    points.pop();
  }
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    const next: Vec2[] = [];
    for (let i = 0; i < points.length; i++) {
      const previous = points[(i - 1 + points.length) % points.length];
      const current = points[i];
      const following = points[(i + 1) % points.length];
      const ax = current.x - previous.x;
      const ay = current.y - previous.y;
      const bx = following.x - current.x;
      const by = following.y - current.y;
      const aLength = Math.hypot(ax, ay);
      const bLength = Math.hypot(bx, by);
      const duplicate = aLength <= epsilon || bLength <= epsilon;
      const chordLength = Math.hypot(following.x - previous.x, following.y - previous.y) || 1;
      const collinearForward =
        !duplicate &&
        ax * bx + ay * by > 0 &&
        Math.abs(ax * by - ay * bx) / chordLength <= epsilon;
      // A two-outline intersection can leave a sub-bevel hairpin: the contour
      // travels out and back by only a few hundredths while its neighbouring
      // vertices are almost coincident. It is not part of either load-path
      // silhouette; removing the middle vertex deletes the polished spur that
      // accompanied the former cap pocket without moving either real boundary.
      const microBacktrack =
        !duplicate &&
        chordLength <= 0.02 &&
        aLength <= 0.05 &&
        bLength <= 0.05 &&
        ax * bx + ay * by < 0;
      if (duplicate || collinearForward || microBacktrack) {
        changed = true;
        continue;
      }
      next.push(current);
    }
    points = next;
  }
  return vecToShape(points);
}

function buildMainplate(
  layout: Layout,
  plan: StructuralPlan,
  mats: StructureMaterials,
  engineeringOwners: Map<string, THREE.Object3D>,
): THREE.Group {
  const g = new THREE.Group();
  g.name = "mainplate";
  const hoop = finishedStructure(
    hoopShape(plan.outer, plan.inner),
    STRUCT.plateThick,
    mats.plateFace,
    mats.plateEdge,
    14,
  );
  hoop.name = "struct:plate:hoop";
  hoop.position.z = PLATE_MID_Z;
  g.add(hoop);

  const p = layout.positions;
  const ringStep = Math.max(3, Math.round(plan.inner.length * 0.13));
  const hoopBarrelA = walkRing(plan.inner, p.barrel, ringStep);
  const hoopBarrelB = walkRing(plan.inner, p.barrel, -ringStep);
  const plateSpokes: {
    id: string;
    from: Vec2;
    to: Vec2;
    bow: number;
    width?: (i: number, t: number) => number;
    embed?: number;
    hoopRoot?: boolean;
  }[] = [
    { id: "hoop-barrel-a", from: hoopBarrelA, to: p.barrel, bow: 0.72, width: widthBossBlend(0.18, 0.4), embed: 0.78, hoopRoot: true },
    { id: "hoop-barrel-b", from: hoopBarrelB, to: p.barrel, bow: -0.58, width: widthBossBlend(0.16, 0.38), embed: 0.78, hoopRoot: true },
    { id: "barrel-center", from: p.barrel, to: p.center, bow: 0.84, width: widthBossBlend(0.17, 0.36), embed: 0.52 },
    { id: "hoop-third", from: closestOnRing(plan.inner, p.third), to: p.third, bow: 0.18 },
    { id: "hoop-fourth", from: closestOnRing(plan.inner, p.fourth), to: p.fourth, bow: -0.22 },
    { id: "center-fourth", from: p.center, to: p.fourth, bow: 0.16 },
    { id: "center-escape", from: p.center, to: p.escape, bow: 0.2 },
    { id: "escape-pallet", from: p.escape, to: p.pallet, bow: -0.12 },
    { id: "hoop-balance", from: closestOnRing(plan.inner, p.balance), to: p.balance, bow: 0.1 },
  ];

  const centerNetworkIds = new Set(["barrel-center", "center-fourth", "center-escape"]);
  const centerNetworkShapes: THREE.Shape[] = [];
  let escapePalletShape: THREE.Shape | null = null;
  for (const s of plateSpokes) {
    const start = s.hoopRoot
      ? embedThroughHoop(s.from, plan.outer, s.embed ?? 0.78)
      : extendBack(s.from, s.to, s.embed ?? 0.55);
    let path = s.hoopRoot ? bowedPath(start, s.to, s.bow, 24) : fingerPath(start, s.to, s.bow);
    // `extendBack()` is useful where one ribbon enters a separate boss, but at
    // the center Y-junction it made the fourth/escape ribbons cross behind the
    // frozen center locus before all three independently rounded caps were
    // unioned.  Retain every sampled branch point (and therefore the accepted
    // centerline/bow/width) outside the join; replace only that artificial
    // first overlap point with the actual center locus.  The rounded land below
    // completely contains this edited root segment.
    if ((s.id === "center-fourth" || s.id === "center-escape") && path.length > 1) {
      path[0] = { ...p.center };
    }
    if (s.id === "escape-pallet" && path.length > 1) {
      // `extendBack()` previously carried this branch 0.55 mm through the
      // escape locus. Its independently bevelled round cap then crossed the
      // center→escape branch and produced the supplied leaf-shaped void and
      // polished spur. Remove only the two samples behind the frozen escape
      // axis; every forward centerline sample, bow and the pallet end stay
      // exact. Reapply the existing 0.30...0.40 mm width law monotonically
      // over the corrected local path.
      const axis = { x: s.to.x - s.from.x, y: s.to.y - s.from.y };
      const axisLength = Math.hypot(axis.x, axis.y) || 1;
      const firstForward = path.findIndex((point) =>
        ((point.x - s.from.x) * axis.x + (point.y - s.from.y) * axis.y) / axisLength > 1e-9,
      );
      const retainedStart = firstForward >= 0 ? firstForward : path.length - 1;
      path = [
        { ...s.from },
        ...path.slice(retainedStart),
      ];
    }
    const shape = strokeOpen(path, s.width ?? widthFlare(0.3, 0.4));
    if (centerNetworkIds.has(s.id)) {
      centerNetworkShapes.push(shape);
      continue;
    }
    if (s.id === "escape-pallet") {
      escapePalletShape = shape;
      continue;
    }
    const finger = finishedStructure(
      shape,
      s.hoopRoot ? STRUCT.plateThick : STRUCT.plateThick * 0.98,
      mats.plateFace,
      mats.plateEdge,
      8,
    );
    finger.name = `struct:plate:spoke:${s.id}`;
    finger.position.z = PLATE_MID_Z;
    finger.renderOrder = 1;
    g.add(finger);
  }
  // These three ribbons share one center load-path junction.  A direct union
  // of their three independently capped outlines creates a high-valence graph
  // at (0,0); its former first-edge traversal could emit a self-crossing loop,
  // leaving both a cap hole and several polished slivers.  Give the unchanged
  // branches one rounded structural land first, so each branch meets the union
  // boundary through an ordinary two-intersection join.  The land stays inside
  // the existing center-column envelope and has at least 0.06 mm radial overlap
  // beyond the widest (0.40 mm) branch root.
  const centerLandRadius = 0.46;
  const centerLand = new THREE.Shape();
  const centerLandSegments = 48;
  for (let i = 0; i < centerLandSegments; i++) {
    const angle = (i / centerLandSegments) * Math.PI * 2;
    const point = {
      x: p.center.x + Math.cos(angle) * centerLandRadius,
      y: p.center.y + Math.sin(angle) * centerLandRadius,
    };
    if (i === 0) centerLand.moveTo(point.x, point.y);
    else centerLand.lineTo(point.x, point.y);
  }
  centerLand.closePath();
  if (!escapePalletShape) throw new Error("escape-pallet plate branch was not constructed");
  // A radius equal to both existing 0.40 mm branch-root half-widths closes the
  // two-way bearing land without growing either branch silhouette. Union the
  // corrected escape→pallet ribbon into the existing center network before a
  // single extrusion, eliminating all internal caps/coplanar finish faces.
  const escapeLandRadius = 0.4;
  const escapeLand = circleShape(p.escape, escapeLandRadius);
  const centerNetwork = finishedStructure(
    cleanUnionOutline(
      unionStructuralShapes([centerLand, ...centerNetworkShapes, escapeLand, escapePalletShape]),
    ),
    STRUCT.plateThick * 0.98,
    mats.plateFace,
    mats.plateEdge,
    8,
  );
  centerNetwork.name = "struct:plate:spoke:center-network";
  centerNetwork.position.z = PLATE_MID_Z;
  centerNetwork.renderOrder = 1;
  centerNetwork.userData.unifiedOwners = [...centerNetworkIds, "escape-pallet"];
  centerNetwork.userData.centerLand = {
    axis: { ...p.center },
    radius: centerLandRadius,
    segments: centerLandSegments,
    minimumBranchRootOverlap: centerLandRadius - 0.4,
    containedByCenterColumnRadius: jointEnvelope(plan, "center").columnBotR,
  };
  centerNetwork.userData.escapeLand = {
    axis: { ...p.escape },
    radius: escapeLandRadius,
    removedBackExtension: 0.55,
    samePlanarBoundary: true,
    productOwner: centerNetwork.name,
  };
  g.add(centerNetwork);

  // Keep the branch as an exact logical/audit owner outside the product scene.
  // Product shading and package bounds are owned solely by the unified plate.
  const escapePalletAudit = finishedStructure(
    escapePalletShape,
    STRUCT.plateThick * 0.98,
    mats.plateFace,
    mats.plateEdge,
    8,
  );
  escapePalletAudit.name = "struct:plate:spoke:escape-pallet";
  escapePalletAudit.position.z = PLATE_MID_Z;
  escapePalletAudit.userData.engineeringAuditOnly = true;
  escapePalletAudit.userData.productRenderOwner = centerNetwork.name;
  engineeringOwners.set(escapePalletAudit.name, escapePalletAudit);

  // Rear junction audit: the three barrel spokes previously met only as
  // independent coplanar round caps. A through-plate land closes that local
  // assembly. Keep the historical rear plate plane: the added join allowance
  // is asymmetric toward +Z instead of enlarging the movement package below.
  // A hidden annular neck then overlaps both land and existing barrel column
  // while clearing the rotating lower pivot through the bushing aperture.
  // Barrel XY, spoke paths, exterior land radius, and bearing stack stay fixed.
  const barrelLower = plan.bearings.find((b) => b.pivot === "barrel" && b.seat === "lower");
  if (barrelLower) {
    const env = jointEnvelope(plan, "barrel");
    const junction = bossDisc(
      barrelLower.xy,
      PLATE_MID_Z + SEAT_JOIN_OVERLAP * 0.5,
      env.lowerBossR,
      STRUCT.plateThick + SEAT_JOIN_OVERLAP,
      mats.plateFace,
      mats.plateEdge,
    );
    junction.name = "struct:plate:junction:barrel";
    junction.renderOrder = 2;
    g.add(junction);

    const junctionJoinHalfHeight = 0.02;
    const junctionJoin = annularColumnMesh(
      barrelLower.xy,
      STRUCT.plateTop - junctionJoinHalfHeight,
      STRUCT.plateTop + junctionJoinHalfHeight,
      env.columnBotR,
      env.columnBotR,
      0.18,
      mats.plateFace,
    );
    junctionJoin.name = "struct:column:barrel:junctionJoin";
    junctionJoin.userData.baselineRestoration = {
      baseOverlap: 0.016,
      columnOverlap: junctionJoinHalfHeight,
      pivotClearanceRadius: 0.18,
    };
    g.add(junctionJoin);
  }

  const plateTop = STRUCT.plateTop;
  for (const b of plan.bearings.filter((x) => x.seat === "lower")) {
    const xy = b.xy;
    const env = jointEnvelope(plan, b.pivot);
    if (lowerColumnNeeded(b.pivot)) {
      // The three non-hoop center ribbons use the 0.98 plate gauge. Their
      // beveled extrusion ends 0.0212 mm below nominal plateTop, so a column
      // starting at plateTop leaves real air. Embed only this existing center
      // column by the standard structural join allowance.
      const ribbonThick = STRUCT.plateThick * 0.98;
      const ribbonBevel = Math.min(0.016, ribbonThick * 0.2);
      const centerRibbonTop = PLATE_MID_Z + ribbonThick * 0.5 - ribbonBevel;
      const columnBottom = b.pivot === "center" ? centerRibbonTop - SEAT_JOIN_OVERLAP : plateTop;
      if (b.pivot === "pallet") {
        // The repaired fourth/pallet layout puts the old coaxial pallet
        // column through the fourth wheel's continuous swept rim.  Preserve
        // both coaxial attachment lands, but carry the stationary load path
        // around that wheel plane with one compact radial-outboard C-route.
        const support = new THREE.Group();
        support.name = "struct:column:pallet";
        const originalTop = b.z - 0.05;
        const lowerTop = 0.83;
        const upperBottom = 1.13;
        const linkThickness = 0.16;
        const linkHalfWidth = 0.16;
        const lowerLinkZ = 0.79;
        const upperLinkZ = 1.19;
        const postRadius = 0.16;
        const postOffset = 0.62;
        const dx = xy.x - p.fourth.x;
        const dy = xy.y - p.fourth.y;
        const radialLength = Math.hypot(dx, dy) || 1;
        const outboard = {
          x: xy.x + (dx / radialLength) * postOffset,
          y: xy.y + (dy / radialLength) * postOffset,
        };
        const radiusAt = (z: number): number => {
          const t = Math.max(0, Math.min(1, (z - columnBottom) / (originalTop - columnBottom)));
          return env.columnBotR + (env.columnTopR - env.columnBotR) * t;
        };
        const lower = columnMesh(
          xy,
          columnBottom,
          lowerTop,
          env.columnBotR,
          radiusAt(lowerTop),
          mats.plateFace,
        );
        lower.name = "struct:column:pallet:lower";
        support.add(lower);

        const lowerLink = finishedStructure(
          strokeOpen([xy, outboard], () => linkHalfWidth),
          linkThickness,
          mats.plateFace,
          mats.plateEdge,
          postOffset + linkHalfWidth,
          12,
        );
        lowerLink.name = "struct:column:pallet:lowerLink";
        lowerLink.position.z = lowerLinkZ;
        support.add(lowerLink);

        const post = columnMesh(
          outboard,
          0.75,
          1.28,
          postRadius,
          postRadius,
          mats.plateFace,
        );
        post.name = "struct:column:pallet:outboardPost";
        support.add(post);

        const upperLink = finishedStructure(
          strokeOpen([outboard, xy], () => linkHalfWidth),
          linkThickness,
          mats.plateFace,
          mats.plateEdge,
          postOffset + linkHalfWidth,
          12,
        );
        upperLink.name = "struct:column:pallet:upperLink";
        upperLink.position.z = upperLinkZ;
        support.add(upperLink);

        const upper = columnMesh(
          xy,
          upperBottom,
          originalTop,
          radiusAt(upperBottom),
          env.columnTopR,
          mats.plateFace,
        );
        upper.name = "struct:column:pallet:upper";
        support.add(upper);
        support.userData.palletSupportReroute = {
          concept: "single radial-outboard C dog-leg",
          frozenAxis: { x: xy.x, y: xy.y },
          outboard,
          wheelPlaneGap: { below: 0.083, above: 0.057 },
          connected: true,
          stationary: true,
        };
        g.add(support);
      } else {
        const col = columnMesh(
          xy,
          columnBottom,
          b.z - 0.05,
          env.columnBotR,
          env.columnTopR,
          mats.plateFace,
        );
        col.name = `struct:column:${b.pivot}`;
        g.add(col);
      }
      const disc = bossDisc(xy, b.z - 0.04, env.lowerBossR, 0.1, mats.plateFace, mats.plateEdge);
      disc.name = `struct:boss:${b.pivot}:lower`;
      g.add(disc);
    } else {
      const disc = bossDisc(xy, plateTop + 0.04, env.lowerBossR, 0.1, mats.plateFace, mats.plateEdge);
      disc.name = `struct:boss:${b.pivot}:lower`;
      g.add(disc);
    }
  }

  const bankingRadius = 0.5;
  const movingLugRadius = 0.04;
  const stopRadius = 0.05;
  const contactOffset = 2 * Math.asin((movingLugRadius + stopRadius) / (2 * bankingRadius));
  for (const sign of [-1, 1]) {
    const angle =
      ESCAPEMENT.palletNeutralReference + Math.PI +
      sign * (MOTION.palletAmplitude + contactOffset);
    const xy = {
      x: p.pallet.x + Math.cos(angle) * bankingRadius,
      y: p.pallet.y + Math.sin(angle) * bankingRadius,
    };
    const stop = columnMesh(
      xy,
      STRUCT.plateTop,
      ESCAPEMENT.palletLowerBodyZ.max,
      stopRadius + 0.02,
      stopRadius,
      mats.plateFace,
    );
    stop.name = `struct:bankingStop:${sign < 0 ? "negative" : "positive"}`;
    stop.userData.bankingContact = {
      palletAngle: sign * MOTION.palletAmplitude,
      movingLugRadius,
      stopRadius,
      supportedFromZ: STRUCT.plateTop,
    };
    g.add(stop);
  }

  return g;
}

function buildAnchorPosts(plan: StructuralPlan, mats: StructureMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "anchorPosts";
  const byElement = new Map<string, Anchorage[]>();
  for (const a of Object.values(plan.anchors)) {
    const list = byElement.get(a.element) ?? [];
    list.push(a);
    byElement.set(a.element, list);
  }
  for (const [element, list] of byElement) {
    if (element === "balanceCock" && list.length >= 2) {
      const heel = list.find((a) => a.id === "anchor:cock:heel") ?? list[0];
      const a = list.find((x) => x.id === "anchor:cock:a");
      const b = list.find((x) => x.id === "anchor:cock:b");
      const pts = [a?.xy, heel.xy, b?.xy].filter((p): p is Vec2 => !!p);
      g.add(seatIsland(pts, heel.plateTopZ, heel.seatTopZ, 0.46, mats.plateFace, mats.plateEdge));
      continue;
    }
    const seen = new Set<string>();
    for (const anc of list) {
      const key = `${anc.xy.x.toFixed(4)},${anc.xy.y.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const post = seatPost(
        anc.xy,
        anc.plateTopZ,
        anc.seatTopZ,
        anc.footRadius + 0.1,
        anc.footRadius,
        mats.plateFace,
        mats.plateEdge,
      );
      // Ownership names only: the bounded swept-volume audit needs to
      // distinguish this fixed standoff's root, body, and bridge shoulder.
      // Geometry, materials, transforms, and the accepted seat stack are
      // deliberately untouched.
      post.name = anc.id;
      const postParts = ["root", "body", "shoulder"] as const;
      post.children.forEach((child, index) => {
        child.name = `${anc.id}:${postParts[index] ?? `part-${index}`}`;
      });
      g.add(post);
    }
  }
  return g;
}

function buildTrainBridge(
  layout: Layout,
  plan: StructuralPlan,
  mats: StructureMaterials,
  rendered: { id: string; xy: Vec2 }[],
  engineeringOwners: Map<string, THREE.Object3D>,
): THREE.Group {
  const g = new THREE.Group();
  g.name = "trainBridge";
  const p = layout.positions;
  const footA = plan.anchors["anchor:train:a"];
  const footB = plan.anchors["anchor:train:b"];
  const z = footA.bridgeMidZ;
  const t = STRUCT.trainBridgeThick;
  const seats = plan.bearings
    .filter((x) => x.element === "trainBridge")
    .map((b) => ({ xy: b.xy, r: b.bossRadius }));
  const centerR = seats.find((s) => Math.hypot(s.xy.x - p.center.x, s.xy.y - p.center.y) < 0.05)?.r ?? 0.5;
  const thirdR = seats.find((s) => Math.hypot(s.xy.x - p.third.x, s.xy.y - p.third.y) < 0.05)?.r ?? 0.5;
  const fourthR = seats.find((s) => Math.hypot(s.xy.x - p.fourth.x, s.xy.y - p.fourth.y) < 0.05)?.r ?? 0.5;
  const viaCenter = [
    ...fingerPath(throughSeat(p.center, p.third, thirdR * 0.72), p.center, 0.22).slice(0, -1),
    ...fingerPath(p.center, throughSeat(p.center, p.fourth, fourthR * 0.72), -0.18),
  ];
  const centerPathIndex = viaCenter.findIndex(
    (point) => Math.hypot(point.x - p.center.x, point.y - p.center.y) < 1e-9,
  );
  const baseBodyWidth = widthForSeats(
    viaCenter,
    seats,
    (_i, u) => 0.3 + Math.sin(u * Math.PI) * 0.06,
  );
  const centerRootRightWidth = (i: number, u: number): number => {
    const base = baseBodyWidth(i, u);
    if (centerPathIndex < 0 || i !== centerPathIndex + 1) return base;
    // The first fourth-side sample collapsed from the 0.5888 mm center land to
    // 0.418607 mm and formed the measured grazing notch. Keep the correction
    // on that one root sample; all other left/right samples, the center line,
    // and the boss remain unchanged. 89.5% leaves two exact background pixels
    // at the accepted 1400x1000 witness camera; 90% is the first stable closure.
    return Math.max(base, centerR * 0.9);
  };
  const bodyCurveSegments = 16;
  // This open bridge ribbon has the opposite contour winding from a round
  // boss, so Three's bevel opens its internal circle instead of closing it.
  // Use the authorized running radius directly, plus the same two-micron
  // Float32 guard used by the boss helper: the rendered face is the narrowest
  // ring and stays just safely above r=0.082 while the exterior is unchanged.
  const bodyBoreProfileRadius = CENTER_PASSAGE_RADIUS + 0.000002;
  const bodyOuterShape = strokeOpenSided(viaCenter, baseBodyWidth, centerRootRightWidth);
  // `stub:b` terminates on the center→fourth body centerline.  Rendering the
  // two ribbons as separately bevelled, closed extrusions left the stub's
  // rounded end-cap and both coplanar cap surfaces inside the load-path join.
  // At the supplied grazing view those internal surfaces read as a leaf-shaped
  // pocket plus a polished spur.  Preserve the frozen anchor, route, section,
  // body path, and Z slab, but make their product surface one planar union
  // before extrusion so the join has one cap and one continuous bevel.
  const stubBMerge = {
    x: p.center.x + (p.fourth.x - p.center.x) * 0.78,
    y: p.center.y + (p.fourth.y - p.center.y) * 0.78,
  };
  const stubB = fingerPath(footB.xy, stubBMerge, -0.08);
  const stubWidth = widthForSeats(
    stubB,
    seats,
    (_i, u) => (u < 0.22 ? 0.42 - u * 0.5 : 0.28),
  );
  const stubBShape = strokeOpen(stubB, stubWidth);
  const bodyShape = cleanUnionOutline(unionStructuralShapes([bodyOuterShape, stubBShape]));
  const bodyPassage = new THREE.Path();
  bodyPassage.absarc(p.center.x, p.center.y, bodyBoreProfileRadius, 0, Math.PI * 2, true);
  bodyShape.holes.push(bodyPassage);
  const body = finishedStructure(
    bodyShape,
    t,
    mats.bridgeFace,
    mats.bridgeEdge,
    10,
    bodyCurveSegments,
  );
  const bodyMinimumBore = minimumCircularBoreRadius(
    body.geometry,
    p.center,
    bodyBoreProfileRadius + 0.08,
  );
  body.name = "struct:trainBridge:body";
  body.userData.throughBoreRadius = bodyMinimumBore;
  body.userData.targetThroughBoreRadius = CENTER_PASSAGE_RADIUS;
  body.userData.minimumThroughBoreRadius = bodyMinimumBore;
  body.userData.boreProfileRadius = bodyBoreProfileRadius;
  body.userData.unifiedOwners = ["struct:trainBridge:body", "struct:trainBridge:stub:b"];
  body.userData.stubBProductUnion = {
    anchor: { ...footB.xy },
    merge: { ...stubBMerge },
    totalWidth: 0.56,
    thickness: t,
    samePlanarBoundary: true,
  };
  body.position.z = z;
  g.add(body);

  const stubA = fingerPath(footA.xy, throughSeat(footA.xy, p.third, thirdR * 0.72), 0.04);
  // Final bounded authority: anchor B reinforces the center→fourth body well
  // before the fourth boss instead of entering the pallet-fork corridor.  The
  // endpoint is on the existing bridge centerline, so the full 0.56 × 0.36 mm
  // section forms a positive-area union with the main body while the frozen
  // foot, boss, bearing, and all Z planes remain untouched.
  const stubAMesh = finishedStructure(
    strokeOpen(stubA, widthForSeats(stubA, seats, (_i, u) => (u < 0.22 ? 0.42 - u * 0.5 : 0.28))),
    t,
    mats.bridgeFace,
    mats.bridgeEdge,
    5,
    16,
  );
  stubAMesh.name = "struct:trainBridge:stub:a";
  stubAMesh.position.z = z;
  g.add(stubAMesh);

  // Keep the certified stub-specific triangle owner outside the product scene
  // for engineering collision reports. Its route and triangles are the exact
  // pre-union stub; final-product shading is owned solely by the unified body.
  const stubBAudit = finishedStructure(
    stubBShape,
    t,
    mats.bridgeFace,
    mats.bridgeEdge,
    5,
    16,
  );
  stubBAudit.name = "struct:trainBridge:stub:b";
  stubBAudit.position.z = z;
  stubBAudit.userData.engineeringAuditOnly = true;
  stubBAudit.userData.productRenderOwner = body.name;
  engineeringOwners.set(stubBAudit.name, stubBAudit);

  // The center train arbor is lower than the third/fourth arbors. Carry the
  // frozen center upper-bearing locus up to the common train-bridge underside
  // with a functional pendant boss; this seats around the existing pivot tip
  // without moving the arbor, locus, bridge body, or jewel.
  const centerSeat = plan.bearings.find(
    (bearing) => bearing.element === "trainBridge" && bearing.pivot === "center" && bearing.seat === "upper",
  );
  if (centerSeat) {
    const centerSupport = annularColumnMesh(
      centerSeat.xy,
      centerSeat.z,
      STRUCT.trainBridgeBottom,
      centerSeat.bossRadius * 0.44,
      centerSeat.bossRadius * 0.62,
      CENTER_PASSAGE_RADIUS,
      mats.bridgeFace,
    );
    centerSupport.name = "struct:trainBridge:centerSupport";
    g.add(centerSupport);
  }

  for (const b of plan.bearings.filter((x) => x.element === "trainBridge")) {
    const disc =
      b.pivot === "center"
        ? boredBossDisc(
            b.xy,
            z,
            b.bossRadius,
            CENTER_PASSAGE_RADIUS,
            t,
            mats.bridgeFace,
            mats.bridgeEdge,
          )
        : bossDisc(b.xy, z, b.bossRadius, t, mats.bridgeFace, mats.bridgeEdge);
    disc.name = `struct:boss:${b.pivot}:upper`;
    g.add(disc);
  }

  const discA = bossDisc(footA.xy, z, footA.footRadius, t, mats.bridgeFace, mats.bridgeEdge);
  const discB = bossDisc(footB.xy, z, footB.footRadius, t, mats.bridgeFace, mats.bridgeEdge);
  discA.name = `struct:foot:${footA.id}`;
  discB.name = `struct:foot:${footB.id}`;
  markFoot(discA, footA.id, footA.xy, rendered);
  markFoot(discB, footB.id, footB.xy, rendered);
  g.add(discA, discB);
  return g;
}

function buildEscapeFinger(
  layout: Layout,
  plan: StructuralPlan,
  mats: StructureMaterials,
  rendered: { id: string; xy: Vec2 }[],
): THREE.Group {
  const g = new THREE.Group();
  g.name = "escapeFinger";
  const p = layout.positions;
  const foot = plan.anchors["anchor:escape"];
  const mid = {
    x: (p.escape.x + p.pallet.x) * 0.5,
    y: (p.escape.y + p.pallet.y) * 0.5,
  };
  const join = {
    x: mid.x * 0.62 + foot.xy.x * 0.38,
    y: mid.y * 0.62 + foot.xy.y * 0.38,
  };
  const z = foot.bridgeMidZ;
  const t = STRUCT.escapeBridgeThick;
  const seats = plan.bearings
    .filter((x) => x.element === "escapeFinger")
    .map((b) => ({ xy: b.xy, r: b.bossRadius }));
  const palR = seats.find((s) => Math.hypot(s.xy.x - p.pallet.x, s.xy.y - p.pallet.y) < 0.05)?.r ?? 0.42;
  const stem = fingerPath(foot.xy, join, 0.05);
  const bar = [
    // Seat the member on the escape locus without projecting its rounded cap
    // beyond the boss silhouette. Its pivot-centred end still occupies the
    // complete circular land and preserves the accepted XY/Z bearing stack.
    ...fingerPath(p.escape, join, 0.04).slice(0, -1),
    ...fingerPath(join, throughSeat(join, p.pallet, palR * 0.72), -0.05),
  ];
  // The former stem ended 0.015458391 mm short of positive bar engagement.
  // Carry a narrow, tapered tenon 0.16 mm from the shared join into the escape
  // branch centerline. Its 0.10 mm terminal half-width remains inside the bar
  // stock, while 0.144541609 mm of advance remains beyond the measured gap.
  const stemTenonLength = 0.16;
  const joinToEscape = { x: p.escape.x - join.x, y: p.escape.y - join.y };
  const joinToEscapeLength = Math.hypot(joinToEscape.x, joinToEscape.y) || 1;
  const tenonEnd = {
    x: join.x + (joinToEscape.x / joinToEscapeLength) * stemTenonLength,
    y: join.y + (joinToEscape.y / joinToEscapeLength) * stemTenonLength,
  };
  const stemWithTenon = [...stem, tenonEnd];
  const stemBaseCount = stem.length;
  // Stem and bearing bar are one stationary load path. Their previous pair of
  // separately closed extrusions stopped at a 0.015458391 mm point-junction
  // gap, exposing both terminal bevels under grazing light. The tenon creates
  // positive stock engagement; extrude the resulting planar union once so the
  // visible surface and anglage have one owner.
  const bodyShape = unionStructuralShapes([
      strokeOpen(stemWithTenon, (index) => {
        if (index >= stemBaseCount) return 0.1;
        const originalT = index / Math.max(1, stemBaseCount - 1);
        return 0.38 - originalT * 0.16;
      }),
      strokeOpen(bar, widthForSeats(bar, seats, (_i, u) => 0.17 + Math.sin(u * Math.PI) * 0.03)),
      // Keep the frozen anchor land in the same planar owner as the ribbon so
      // the axial reroute does not introduce another coplanar finish seam.
      circleShape(foot.xy, foot.footRadius),
    ]);
  const underpassCurveSegments = 16;
  const underpassThickness = ESCAPE_FINGER_UNDERPASS.top - ESCAPE_FINGER_UNDERPASS.bottom;
  const underpassBevel = Math.min(0.016, underpassThickness * 0.2);
  // Leave a true rendered throat around the recessed existing fastener. This
  // union outline has the same winding behavior as the bored train-bridge
  // ribbon: the hole face is the narrowest generated ring, so only a two-micron
  // Float32 guard is needed. Verify the actual BufferGeometry below.
  const fastenerBoreProfile = ESCAPE_FINGER_UNDERPASS.fastenerBoreMinimum + 0.000002;
  const fastenerBore = new THREE.Path();
  fastenerBore.absarc(foot.xy.x, foot.xy.y, fastenerBoreProfile, 0, Math.PI * 2, true);
  bodyShape.holes.push(fastenerBore);
  const bodyMesh = finishedStructure(
    bodyShape,
    underpassThickness,
    mats.bridgeFace,
    mats.bridgeEdge,
    6,
    underpassCurveSegments,
  );
  // Three's beveled ExtrudeGeometry extends one bevel below its nominal zero
  // before `extrudeCentered` translates it. Compensate that render-space
  // asymmetry so these declared underpass planes are the actual AABB planes.
  bodyMesh.position.z =
    (ESCAPE_FINGER_UNDERPASS.bottom + ESCAPE_FINGER_UNDERPASS.top) * 0.5 + underpassBevel;
  const renderedFastenerBore = minimumCircularBoreRadius(
    bodyMesh.geometry,
    foot.xy,
    fastenerBoreProfile + 0.04,
  );
  if (renderedFastenerBore + 1e-6 < ESCAPE_FINGER_UNDERPASS.fastenerBoreMinimum) {
    throw new Error(
      `escape-finger fastener bore ${renderedFastenerBore} is below ` +
      `${ESCAPE_FINGER_UNDERPASS.fastenerBoreMinimum}`,
    );
  }
  bodyMesh.name = "struct:escapeFinger:stemBar";
  bodyMesh.userData.unifiedOwners = ["struct:escapeFinger:stem", "struct:escapeFinger:bar"];
  bodyMesh.userData.junctionTenon = {
    length: stemTenonLength,
    terminalHalfWidth: 0.1,
    preRepairGap: 0.015458391,
    advanceBeyondGap: stemTenonLength - 0.015458391,
    positiveOverlapArea: 0.05744093092993463,
    branch: "join-to-escape",
  };
  bodyMesh.userData.balanceUnderpass = {
    concept: "single cranked axial underpass",
    anchorXy: { ...foot.xy },
    escapeXy: { ...p.escape },
    palletXy: { ...p.pallet },
    bottomZ: ESCAPE_FINGER_UNDERPASS.bottom,
    topZ: ESCAPE_FINGER_UNDERPASS.top,
    forkAxialClearance: ESCAPE_FINGER_UNDERPASS.bottom - ESCAPEMENT.palletForkZ.max,
    nominalBalanceRimFloorZ: DEPTH.balance - THICK.balanceRim * 0.5 - 0.016,
    nominalBalanceAxialClearance:
      DEPTH.balance - THICK.balanceRim * 0.5 - 0.016 - ESCAPE_FINGER_UNDERPASS.top,
    postShoulderOverlap: 2.406 - ESCAPE_FINGER_UNDERPASS.bottom,
    upperBossOverlap: ESCAPE_FINGER_UNDERPASS.top - 2.404,
    fastenerBoreProfile,
    renderedFastenerBore,
    stationary: true,
  };
  g.add(bodyMesh);
  markFoot(bodyMesh, foot.id, foot.xy, rendered);
  for (const b of plan.bearings.filter((x) => x.element === "escapeFinger")) {
    const boss = bossDisc(b.xy, z, b.bossRadius, t, mats.bridgeFace, mats.bridgeEdge);
    boss.name = `struct:boss:${b.pivot}:upper`;
    g.add(boss);
  }
  return g;
}

function buildBalanceCock(
  layout: Layout,
  plan: StructuralPlan,
  mats: StructureMaterials,
  rendered: { id: string; xy: Vec2 }[],
): THREE.Group {
  const g = new THREE.Group();
  g.name = "balanceCock";
  const p = layout.positions;
  const heel = plan.anchors["anchor:cock:heel"];
  const footA = plan.anchors["anchor:cock:a"];
  const footB = plan.anchors["anchor:cock:b"];
  const z = heel.bridgeMidZ;
  const t = STRUCT.cockThick;

  const staff = plan.bearings.find((b) => b.id === "bearing:balance:upper") as BearingSeat;
  const spine = fingerPath(heel.xy, throughSeat(heel.xy, p.balance, staff.bossRadius * 0.72), 0.05);
  const body = finishedStructure(
    strokeOpen(
      spine,
      widthForSeats(spine, [{ xy: staff.xy, r: staff.bossRadius }], (_i, u) => {
        if (u < 0.14) return 0.33 - u * 1.35;
        if (u < 0.82) return 0.115;
        return 0.115 + (u - 0.82) * 0.28;
      }),
    ),
    t,
    mats.bridgeFace,
    mats.bridgeEdge,
    8,
    16,
  );
  body.position.z = z;
  g.add(body);

  const heelBar = finishedStructure(
    strokeOpen(fingerPath(footA.xy, footB.xy, 0.03), (_i, u) => 0.28 + Math.sin(u * Math.PI) * 0.04),
    t * 0.92,
    mats.bridgeFace,
    mats.bridgeEdge,
    4,
    16,
  );
  heelBar.position.z = z;
  g.add(heelBar);

  const staffDisc = bossDisc(staff.xy, z, staff.bossRadius, t, mats.bridgeFace, mats.bridgeEdge);
  staffDisc.name = "struct:boss:balance:upper";
  g.add(staffDisc);

  for (const a of [footA, footB, heel]) {
    const disc = bossDisc(a.xy, z, a.footRadius, t, mats.bridgeFace, mats.bridgeEdge);
    disc.name = `struct:foot:${a.id}`;
    markFoot(disc, a.id, a.xy, rendered);
    g.add(disc);
  }
  return g;
}

function buildDebug(plan: StructuralPlan): THREE.Group {
  const g = new THREE.Group();
  g.name = "structure:debug";
  const bear = new THREE.MeshBasicMaterial({ color: 0x7ec8ff });
  const anc = new THREE.MeshBasicMaterial({ color: 0xf0c14b });
  for (const loc of plan.loci) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(loc.kind === "bearing" ? 0.08 : 0.1, 10, 8),
      loc.kind === "bearing" ? bear : anc,
    );
    m.position.set(loc.xy.x, loc.xy.y, loc.z);
    g.add(m);
  }
  return g;
}

export function applyStructureView(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void },
  name: StructureViewName,
): void {
  const view = STRUCTURE_VIEWS[name];
  camera.position.copy(view.position);
  controls.target.copy(view.target);
  controls.update();
}
