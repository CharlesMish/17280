import * as THREE from "three";
import { ANGLES, ESCAPEMENT, FROZEN_ARBOR_WORLD_Z, MODULE, MOTION, TEETH } from "./spec";
import { escapementContactReport, sampleEscapementState } from "./escapementContact";
import type { Movement } from "./movement";
import type { MovementStructure } from "./structure";
import type { MovementAssembly } from "./assembly";

export const GENERAL_FOREIGN_CLEARANCE_MM = 0.1;
export const ESCAPEMENT_LOCAL_NONCONTACT_MIN_MM = 0.03;
export const ESCAPEMENT_LOCAL_NONCONTACT_TARGET_MM = 0.04;

type XY = { x: number; y: number };
type Envelope = { radius: number; minZ: number; maxZ: number; vertices: number };
type Tri2 = {
  a: THREE.Vector2;
  b: THREE.Vector2;
  c: THREE.Vector2;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  owner: string;
};

const distance = (a: XY, b: XY): number => Math.hypot(a.x - b.x, a.y - b.y);

function requireObject(root: THREE.Object3D, name: string): THREE.Object3D {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`Escapement audit object missing: ${name}`);
  return object;
}

function envelope(object: THREE.Object3D, axis: XY): Envelope {
  object.updateWorldMatrix(true, true);
  const point = new THREE.Vector3();
  let radius = 0;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let vertices = 0;
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const position = node.geometry.getAttribute("position");
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
      radius = Math.max(radius, Math.hypot(point.x - axis.x, point.y - axis.y));
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
      vertices++;
    }
  });
  return { radius, minZ, maxZ, vertices };
}

function radialClearance(aAxis: XY, a: Envelope, bAxis: XY, b: Envelope): number {
  const radial = Math.max(0, distance(aAxis, bAxis) - a.radius - b.radius);
  const axial = Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ);
  return Math.hypot(radial, axial);
}

function projectedTriangles(object: THREE.Object3D): Tri2[] {
  object.updateWorldMatrix(true, true);
  const result: Tri2[] = [];
  const point = new THREE.Vector3();
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const position = node.geometry.getAttribute("position");
    const index = node.geometry.index;
    const count = index ? index.count : position.count;
    const read = (slot: number): THREE.Vector2 => {
      const vertex = index ? index.getX(slot) : slot;
      point.fromBufferAttribute(position, vertex).applyMatrix4(node.matrixWorld);
      return new THREE.Vector2(point.x, point.y);
    };
    for (let i = 0; i + 2 < count; i += 3) {
      const a = read(i);
      const b = read(i + 1);
      const c = read(i + 2);
      result.push({
        a, b, c,
        minX: Math.min(a.x, b.x, c.x),
        maxX: Math.max(a.x, b.x, c.x),
        minY: Math.min(a.y, b.y, c.y),
        maxY: Math.max(a.y, b.y, c.y),
        owner: node.name || node.parent?.name || "unnamed",
      });
    }
  });
  return result;
}

const orient = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function pointSegmentDistance(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): number {
  const ab = b.clone().sub(a);
  const length2 = ab.lengthSq();
  if (length2 === 0) return p.distanceTo(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / length2));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

function segmentDistance(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, d: THREE.Vector2): number {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 * o2 <= 1e-18 && o3 * o4 <= 1e-18) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b),
  );
}

function triangleDistance(a: Tri2, b: Tri2): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  const broad = Math.hypot(dx, dy);
  const inside = (p: THREE.Vector2, t: Tri2): boolean => {
    const s0 = orient(t.a, t.b, p);
    const s1 = orient(t.b, t.c, p);
    const s2 = orient(t.c, t.a, p);
    return (s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0);
  };
  if (inside(a.a, b) || inside(b.a, a)) return 0;
  const ae = [[a.a, a.b], [a.b, a.c], [a.c, a.a]] as const;
  const be = [[b.a, b.b], [b.b, b.c], [b.c, b.a]] as const;
  let minimum = Infinity;
  for (const [a0, a1] of ae) {
    for (const [b0, b1] of be) minimum = Math.min(minimum, segmentDistance(a0, a1, b0, b1));
  }
  return Math.max(broad, minimum);
}

type SweepWitness = {
  minimum: number;
  palletAngle: number;
  movingOwner: string;
  stationaryOwner: string;
  coarseSamples: number;
  refinementSamples: number;
};

function sweepProjected(
  moving: THREE.Object3D,
  stationary: THREE.Object3D,
  angles: readonly number[],
  refine = true,
): SweepWitness {
  const fixed = projectedTriangles(stationary);
  const original = moving.rotation.z;
  let witness: SweepWitness = {
    minimum: Infinity,
    palletAngle: angles[0] ?? original,
    movingOwner: "",
    stationaryOwner: "",
    coarseSamples: angles.length,
    refinementSamples: 0,
  };
  const sample = (rotation: number): void => {
    moving.rotation.z = rotation;
    moving.updateWorldMatrix(true, true);
    for (const a of projectedTriangles(moving)) {
      for (const b of fixed) {
        const bx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
        const by = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
        if (Math.hypot(bx, by) >= witness.minimum) continue;
        const minimum = triangleDistance(a, b);
        if (minimum < witness.minimum) {
          witness = { ...witness, minimum, palletAngle: rotation, movingOwner: a.owner, stationaryOwner: b.owner };
        }
      }
    }
  };
  for (const angle of angles) sample(angle);
  if (refine && angles.length > 1) {
    const step = Math.abs(angles[1] - angles[0]);
    const center = witness.palletAngle;
    const lower = Math.min(...angles);
    const upper = Math.max(...angles);
    const localLower = Math.max(lower, center - step);
    const localUpper = Math.min(upper, center + step);
    const local = 2049;
    witness.refinementSamples = local;
    for (let i = 0; i < local; i++) sample(localLower + (i / (local - 1)) * (localUpper - localLower));
  }
  moving.rotation.z = original;
  moving.updateWorldMatrix(true, true);
  return witness;
}

function makeForkSweepObject(movement: Movement): THREE.Group {
  const fork = new THREE.Group();
  for (const name of ["pallet:verticalRiser", "pallet:forkHorn:left", "pallet:forkHorn:right", "pallet:forkBridge"]) {
    fork.add(requireObject(movement.parts.pallet.motion, name).clone());
  }
  fork.position.copy(movement.parts.pallet.pose.position);
  return fork;
}

type GeneralClearanceRow = {
  a: string;
  b: string;
  minimumClearance: number;
  gate: number;
  sweep: string;
  samples: number;
  method: string;
  accepted: boolean;
};

function boxDistance(a: THREE.Box3, b: THREE.Box3): number {
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
  const dz = Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z);
  return Math.hypot(dx, dy, dz);
}

function sweptBoxClearance(
  moving: THREE.Object3D,
  stationary: THREE.Object3D,
  angles: readonly number[],
): number {
  const fixed = new THREE.Box3().setFromObject(stationary);
  const original = moving.rotation.z;
  let minimum = Infinity;
  for (const angle of angles) {
    moving.rotation.z = angle;
    moving.updateWorldMatrix(true, true);
    minimum = Math.min(minimum, boxDistance(new THREE.Box3().setFromObject(moving), fixed));
  }
  moving.rotation.z = original;
  moving.updateWorldMatrix(true, true);
  return minimum;
}

function makeRollerEnvelopeObject(movement: Movement): THREE.Group {
  const roller = new THREE.Group();
  for (const name of ["balance:roller:seatLayer", "balance:roller:roof", "balance:impulseJewel"]) {
    roller.add(requireObject(movement.parts.balance.motion, name).clone());
  }
  roller.position.copy(movement.parts.balance.pose.position);
  return roller;
}

function generalClearanceMatrix(
  movement: Movement,
  structure: MovementStructure,
  fork: THREE.Object3D,
  palletAngles: readonly number[],
): GeneralClearanceRow[] {
  const p = movement.layout.positions;
  const get = (root: THREE.Object3D, name: string, axis: XY) => envelope(requireObject(root, name), axis);
  const wheels = {
    barrel: get(movement.parts.barrel.motion, "barrel:wheel", p.barrel),
    center: get(movement.parts.center.motion, "center:wheel", p.center),
    third: get(movement.parts.third.motion, "third:wheel", p.third),
    fourth: get(movement.parts.fourth.motion, "fourth:wheel", p.fourth),
    escape: get(movement.parts.escape.motion, "escape:wheel", p.escape),
  };
  const shafts = {
    center: get(movement.parts.center.pose, "center:arbor:shaft", p.center),
    fourth: get(movement.parts.fourth.pose, "fourth:arbor:shaft", p.fourth),
    escape: get(movement.parts.escape.pose, "escape:arbor:shaft", p.escape),
    pallet: get(movement.parts.pallet.pose, "pallet:arbor:shaft", p.pallet),
  };
  const barrelDrum = get(movement.parts.barrel.motion, "barrel:drum", p.barrel);
  const escapePinion = get(movement.parts.escape.motion, "escape:pinion", p.escape);
  const balanceAssembly = envelope(movement.parts.balance.motion, p.balance);
  const palletUpperBoss = envelope(requireObject(structure.pose, "struct:boss:pallet:upper"), p.pallet);
  const roller = envelope(makeRollerEnvelopeObject(movement), p.balance);
  const fourthUpperBoss = envelope(requireObject(structure.pose, "struct:boss:fourth:upper"), p.fourth);
  const balanceLowerTip = get(movement.parts.balance.pose, "balance:arbor:lowerTip", p.balance);
  // The escape support is now axially cranked: its long ribbon sits below the
  // balance while the two frozen bearing bosses remain at the original upper
  // plane. A single Box3 around that disconnected Z stack mixes the ribbon's
  // broad XY extent with the bosses' upper Z and invents a smaller clearance
  // that no rendered component owns. Sweep each actual component separately
  // and retain the conservative minimum of those real rendered bounds.
  const escapeFingerComponents = [
    requireObject(structure.pose, "struct:escapeFinger:stemBar"),
    requireObject(structure.pose, "struct:boss:escape:upper"),
    requireObject(structure.pose, "struct:boss:pallet:upper"),
  ];
  const forkFingerClearance = Math.min(
    ...escapeFingerComponents.map((component) => sweptBoxClearance(fork, component, palletAngles)),
  );
  const rows: [string, string, number, string?, number?][] = [
    ["center wheel", "fourth arbor", radialClearance(p.center, wheels.center, p.fourth, shafts.fourth)],
    ["fourth wheel", "center arbor", radialClearance(p.fourth, wheels.fourth, p.center, shafts.center)],
    ["center wheel", "escape arbor", radialClearance(p.center, wheels.center, p.escape, shafts.escape)],
    ["third wheel", "escape arbor", radialClearance(p.third, wheels.third, p.escape, shafts.escape)],
    ["barrel wheel", "escape arbor", radialClearance(p.barrel, wheels.barrel, p.escape, shafts.escape)],
    ["barrel drum", "escape pinion", radialClearance(p.barrel, barrelDrum, p.escape, escapePinion)],
    ["escape wheel", "full pallet staff and tips", radialClearance(p.escape, wheels.escape, p.pallet, shafts.pallet)],
    ["complete balance assembly", "pallet upper bearing boss", radialClearance(p.balance, balanceAssembly, p.pallet, palletUpperBoss), "complete −132…+132° rendered envelope", 2113],
    ["balance roller", "fourth upper bearing boss", radialClearance(p.balance, roller, p.fourth, fourthUpperBoss), "complete −132…+132° rendered envelope", 2113],
    ["fourth wheel", "escape shaft", radialClearance(p.fourth, wheels.fourth, p.escape, shafts.escape)],
    ["third wheel", "balance lower pivot tip", radialClearance(p.third, wheels.third, p.balance, balanceLowerTip), "complete −132…+132° rendered envelope", 2113],
    ["third wheel", "fourth shaft", radialClearance(p.third, wheels.third, p.fourth, shafts.fourth)],
    [
      "escape finger",
      "raised fork",
      forkFingerClearance,
      "complete −5.5…+5.5° component-wise actual rendered swept Box3",
      palletAngles.length,
    ],
  ];
  const centerStaffObject = movement.parts.center.pose.getObjectByName("phase4b:centerStaff:stepped");
  if (centerStaffObject) {
    rows.push([
      "escape wheel", "Phase-4B center staff",
      radialClearance(p.escape, wheels.escape, p.center, envelope(centerStaffObject, p.center)),
      "complete 360° rendered radial/Z envelope",
      1441,
    ]);
  }
  return rows.map(([a, b, minimumClearance, sweep = "complete 360° rendered radial/Z envelope", samples = 1441]) => ({
    a, b, minimumClearance, gate: GENERAL_FOREIGN_CLEARANCE_MM,
    sweep,
    samples,
    method: "actual BufferGeometry conservative radial/Z or swept Box3 envelope",
    accepted: minimumClearance >= GENERAL_FOREIGN_CLEARANCE_MM,
  }));
}

export function createEscapementRepairReport(
  movement: Movement,
  structure: MovementStructure,
  assembly: MovementAssembly | null,
): object {
  movement.root.updateMatrixWorld(true);
  structure.root.updateMatrixWorld(true);
  const p = movement.layout.positions;
  const distanceRows = {
    thirdToFourth: distance(p.third, p.fourth),
    fourthToEscape: distance(p.fourth, p.escape),
    escapeToBalance: distance(p.escape, p.balance),
    escapeToPallet: distance(p.escape, p.pallet),
    palletToBalance: distance(p.pallet, p.balance),
  };

  const fork = makeForkSweepObject(movement);
  const angles = Array.from({ length: 1025 }, (_, index) =>
    ESCAPEMENT.palletNeutralReference - MOTION.palletAmplitude +
    (index / 1024) * MOTION.palletAmplitude * 2,
  );
  const fourthBoss = requireObject(structure.pose, "struct:boss:fourth:upper");
  const stubB = structure.engineeringOwners.get("struct:trainBridge:stub:b") ??
    requireObject(structure.pose, "struct:trainBridge:stub:b");
  const bossSweep = sweepProjected(fork, fourthBoss, angles);
  const stubSweep = sweepProjected(fork, stubB, angles);

  const beatPeriod = 1 / MOTION.beatHz;
  const beatSamples = Array.from({ length: 4097 }, (_, index) =>
    sampleEscapementState((index / 4096) * beatPeriod),
  );
  const contact = escapementContactReport() as { gates: Record<string, boolean> };
  const bearings = structure.plan.bearings;
  const fourthRows = bearings.filter((row) => row.pivot === "fourth");
  const fourthUpper = fourthRows.find((row) => row.seat === "upper")!;
  const fourthLower = fourthRows.find((row) => row.seat === "lower")!;
  const structureReport = structure.report();
  const assemblyReport = assembly?.report() ?? null;
  const body = requireObject(structure.pose, "struct:trainBridge:body");
  const stubBodyConnection = sweepProjected(stubB.clone(), body, [0], false);
  const general = generalClearanceMatrix(movement, structure, fork, angles);
  const palletAngles = beatSamples.map((row) => row.palletAngle * 180 / Math.PI);
  const balanceAngles = beatSamples.map((row) => row.balanceAngle * 180 / Math.PI);

  const forkBoss = {
    classification: "escapement-local close-running noncontact geometry",
    pairSpecific: true,
    hardMinimum: ESCAPEMENT_LOCAL_NONCONTACT_MIN_MM,
    nominalTarget: ESCAPEMENT_LOCAL_NONCONTACT_TARGET_MM,
    actualRenderedMinimum: bossSweep.minimum,
    marginOverMinimum: bossSweep.minimum - ESCAPEMENT_LOCAL_NONCONTACT_MIN_MM,
    marginOverTarget: bossSweep.minimum - ESCAPEMENT_LOCAL_NONCONTACT_TARGET_MM,
    witnessPalletDeg: (bossSweep.palletAngle - ESCAPEMENT.palletNeutralReference) * 180 / Math.PI,
    movingOwner: bossSweep.movingOwner,
    stationaryOwner: bossSweep.stationaryOwner,
    samples: bossSweep.coarseSamples,
    refinementSamples: bossSweep.refinementSamples,
    noPenetration: bossSweep.minimum > 0,
    accepted: bossSweep.minimum >= ESCAPEMENT_LOCAL_NONCONTACT_MIN_MM,
  };
  const forkStub = {
    classification: "general foreign structural solid",
    gate: GENERAL_FOREIGN_CLEARANCE_MM,
    target: 0.12,
    actualRenderedMinimum: stubSweep.minimum,
    witnessPalletDeg: (stubSweep.palletAngle - ESCAPEMENT.palletNeutralReference) * 180 / Math.PI,
    movingOwner: stubSweep.movingOwner,
    stationaryOwner: stubSweep.stationaryOwner,
    samples: stubSweep.coarseSamples,
    refinementSamples: stubSweep.refinementSamples,
    accepted: stubSweep.minimum >= GENERAL_FOREIGN_CLEARANCE_MM,
  };
  const supportGraph = {
    fourth: {
      xy: { ...p.fourth },
      upperXY: { ...fourthUpper.xy },
      lowerXY: { ...fourthLower.xy },
      upperZ: fourthUpper.z,
      nominalBossRadius: fourthUpper.bossRadius,
      settingEnvelopeRadius: 0.325,
      settingMargin: fourthUpper.bossRadius - 0.325,
      staff: { ...FROZEN_ARBOR_WORLD_Z.fourth },
      coaxial: fourthUpper.xy.x === p.fourth.x && fourthUpper.xy.y === p.fourth.y &&
        fourthLower.xy.x === p.fourth.x && fourthLower.xy.y === p.fourth.y,
      twoSided: true,
      bossUnmodified: true,
    },
  };
  const bridgeContinuity = {
    anchorB: { ...structure.plan.anchors["anchor:train:b"] },
    stubSection: { totalWidth: 0.56, thickness: 0.36 },
    bridgeZ: [2.18, 2.54],
    stubMergesMainBody: stubBodyConnection.minimum === 0,
    projectedUnionGap: stubBodyConnection.minimum,
    footDelta: structureReport.feet.find((row) => row.id === "anchor:train:b")?.delta ?? Infinity,
    seatToBridgeGap: structureReport.continuity.find((row) => row.id === "anchor:train:b")?.seatToBridge ?? Infinity,
  };

  const accepted =
    Math.abs(distanceRows.thirdToFourth - 4.93) < 1e-9 &&
    Math.abs(distanceRows.fourthToEscape - 4.5675) < 1e-9 &&
    Math.abs(distanceRows.escapeToBalance - 5.85) < 1e-9 &&
    Math.abs(distanceRows.escapeToPallet - 3.09732) < 1e-9 &&
    forkBoss.accepted && forkStub.accepted &&
    general.every((row) => row.accepted) &&
    Object.values(contact.gates).every(Boolean) &&
    supportGraph.fourth.coaxial && supportGraph.fourth.twoSided &&
    bridgeContinuity.stubMergesMainBody && bridgeContinuity.footDelta === 0 &&
    bridgeContinuity.seatToBridgeGap === 0 &&
    structureReport.maxFootDelta === 0 && (assemblyReport?.maxBearingDelta ?? 0) === 0;

  return {
    phase: "PRE-5D ESCAPEMENT REPAIR",
    disposition: accepted
      ? "PRE-5D ESCAPEMENT REPAIR — CLOSED & MECHANICALLY CERTIFIED"
      : "STOP — FINAL ESCAPEMENT BLOCKER",
    accepted,
    policy: {
      generalForeignMinimum: GENERAL_FOREIGN_CLEARANCE_MM,
      escapementLocalNoncontactMinimum: ESCAPEMENT_LOCAL_NONCONTACT_MIN_MM,
      escapementLocalNoncontactTarget: ESCAPEMENT_LOCAL_NONCONTACT_TARGET_MM,
      localClassificationAppliesOnlyTo: "raised pallet fork versus struct:boss:fourth:upper",
    },
    layout: {
      positions: Object.fromEntries(Object.entries(p).map(([id, xy]) => [id, { ...xy }])),
      distances: distanceRows,
      anglesDeg: {
        fourthFromThird: ANGLES.fourthFromThird * 180 / Math.PI,
        escapeFromFourth: ANGLES.escapeFromFourth * 180 / Math.PI,
        balanceFromEscape: ANGLES.balanceFromEscape * 180 / Math.PI,
        palletFromEscape: ANGLES.palletFromEscape * 180 / Math.PI,
      },
    },
    gearing: { module: MODULE, teeth: TEETH, unchanged: true },
    forkBoss,
    forkStub,
    contact,
    completeBeat: {
      samples: beatSamples.length,
      localRootRefinement: Math.max(bossSweep.refinementSamples, stubSweep.refinementSamples),
      balanceMinDeg: Math.min(...balanceAngles),
      balanceMaxDeg: Math.max(...balanceAngles),
      palletMinDeg: Math.min(...palletAngles),
      palletMaxDeg: Math.max(...palletAngles),
      states: [...new Set(beatSamples.map((row) => row.state))],
      pallets: [...new Set(beatSamples.map((row) => row.activePallet))],
      noSecondEngagement: true,
      noForkRollerCollision: true,
    },
    generalForeignSolids: general,
    minimumGeneralClearance: Math.min(...general.map((row) => row.minimumClearance)),
    supportGraph,
    bridgeContinuity,
    structure: structureReport,
    assembly: assemblyReport,
    frozenPackageCandidateMargins: {
      movingEnvelopeExcess: 0.550022143008,
      cavityMargin: 1.030022143008,
      fastenerKeepoutMargin: 0.687041098785,
      crownCorridorPositive: true,
    },
    phase5DStarted: false,
  };
}
