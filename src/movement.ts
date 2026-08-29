import * as THREE from "three";
import {
  ANGLES,
  DEPTH,
  ESCAPEMENT,
  FROZEN_ARBOR_WORLD_Z,
  MODULE,
  TEETH,
  THICK,
  computeLayout,
  type Layout,
  type PartName,
  type Vec2,
} from "./spec";
import {
  RENDERED_ESCAPE_CLUB,
  sampleEscapementState,
  type EscapementSample,
} from "./escapementContact";
import type { MaterialSet } from "./materials";
import {
  createBalance,
  createBarrel,
  createEscapeWheel,
  createHairspring,
  createPalletFork,
  createTrainArbor,
  type Hairspring,
} from "./geometry";

export type AnimatedPart = {
  name: PartName;
  pose: THREE.Group;
  motion: THREE.Group;
};

export type Movement = {
  root: THREE.Group;
  parts: Record<PartName, AnimatedPart>;
  layout: Layout;
  hairspring: Hairspring;
  sampleEscapement(time: number): EscapementSample;
  update(time: number): void;
};

function makePart(name: PartName, geometry: THREE.Object3D, z: number, xy: { x: number; y: number }): AnimatedPart {
  const pose = new THREE.Group();
  pose.name = `${name}:pose`;
  pose.position.set(xy.x, xy.y, z);
  const motion = new THREE.Group();
  motion.name = `${name}:motion`;
  pose.add(motion);
  geometry.name = `${name}:geom`;
  motion.add(geometry);
  return { name, pose, motion };
}

export function createMovement(materials: MaterialSet): Movement {
  const layout = computeLayout();
  const root = new THREE.Group();
  root.name = "calibre";

  const barrel = makePart(
    "barrel",
    createBarrel(materials, {
      // Pair-bounded 80T/12T repair: retain the frozen analytic pitch/root/tip
      // radii and exact rendered world-Z slab while replacing only the working
      // flank law. Removing the generic bevel removes its ~0.016 mm rendered
      // radial overshoot; that contraction is not analytic-radius drift.
      wheelBevel: false,
      wheelToothProfile: "involute",
      meshBacklash: 0.02,
      wheelRenderedZInterval: {
        min: -0.1459999978542328,
        max: 0.11400000005960464,
      },
    }),
    DEPTH.barrelWheel,
    layout.positions.barrel,
  );
  const barrelArbor = barrel.motion.getObjectByName("barrel:arbor");
  if (!barrelArbor) throw new Error("barrel arbor missing");
  // A going barrel turns around its arbor. Keep the existing arbor at the
  // identical pose/local origin, but outside the drum's runtime motion group.
  barrelArbor.removeFromParent();
  barrel.pose.add(barrelArbor);

  const center = makePart(
    "center",
    createTrainArbor({
      name: "center",
      wheelTeeth: TEETH.center,
      pinionTeeth: TEETH.centerPinion,
      module: MODULE,
      wheelZ: DEPTH.centerWheel - DEPTH.centerWheel,
      pinionZ: DEPTH.centerPinion - DEPTH.centerWheel,
      // Pair-specific prismatic tooth slab: avoids the generic 0.016 mm
      // expanding bevel consuming the center/third radial working clearance.
      wheelBevel: false,
      wheelToothProfile: "involute",
      meshBacklash: 0.02,
      wheelRenderedZInterval: {
        min: -0.0885000005364418,
        max: 0.056499991565942764,
      },
      // The same center compound presents its 12-leaf pinion to the barrel
      // one plane below. Preserve its analytic pitch/root/tip radii and exact
      // Z slab; remove only the rendered bevel excess and replace the working
      // flank with the pair-specific non-expanding tooth slab.
      pinionBevel: false,
      pinionToothProfile: "involute",
      pinionRenderedZInterval: {
        min: -0.16599999368190765,
        max: 0.1340000033378601,
      },
      spokeCount: 5,
      hubRadius: 0.72,
      spokeWidth: 0.34,
      materials,
    }),
    DEPTH.centerWheel,
    layout.positions.center,
  );

  const third = makePart(
    "third",
    createTrainArbor({
      name: "third",
      wheelTeeth: TEETH.third,
      pinionTeeth: TEETH.thirdPinion,
      module: MODULE,
      wheelZ: 0,
      pinionZ: DEPTH.thirdPinion - DEPTH.thirdWheel,
      // The 64T center wheel drives this 10-leaf pinion.  Clock only the
      // pinion on its rigid third arbor and add modest watch-scale backlash
      // without changing either pitch circle, radial envelope, axis, or ratio.
      pinionPhase: THREE.MathUtils.degToRad(-9.2),
      pinionBevel: false,
      pinionToothProfile: "involute",
      meshBacklash: 0.02,
      pinionRenderedZInterval: {
        min: -0.16599999368190765,
        max: 0.1340000033378601,
      },
      // This same rigid third arbor presents its 60T wheel to the 8-leaf
      // fourth pinion one plane above the center/third engagement. Keep the
      // accepted radial envelope and exact rendered Z slab while giving that
      // pair the same non-expanding 20-degree working flank construction.
      wheelBevel: false,
      wheelToothProfile: "involute",
      wheelRenderedZInterval: {
        min: -0.0885000005364418,
        max: 0.056499991565942764,
      },
      spokeCount: 5,
      hubRadius: 0.58,
      spokeWidth: 0.3,
      materials,
    }),
    DEPTH.thirdWheel,
    layout.positions.third,
  );

  const fourth = makePart(
    "fourth",
    createTrainArbor({
      name: "fourth",
      wheelTeeth: TEETH.fourth,
      pinionTeeth: TEETH.fourthPinion,
      module: MODULE,
      wheelZ: 0,
      pinionZ: DEPTH.fourthPinion - DEPTH.fourthWheel,
      spokeCount: 5,
      hubRadius: 0.5,
      spokeWidth: 0.26,
      materials,
      wheelThickness: THICK.fourthWheel,
      // Pair-bounded 56T/7T repair: the analytic pitch/root/tip radii and
      // exact legacy Z slab stay frozen. The non-expanding involute slab
      // removes only the generic bevel's ~0.016 mm rendered radial excess.
      wheelBevel: false,
      wheelToothProfile: "involute",
      wheelRenderedZInterval: {
        min: -0.06599999964237213,
        max: 0.03399999812245369,
      },
      // Pair-specific partner for the 60T third wheel. The final fixed
      // pinion clocking is solved from a complete repeating mesh-cycle scan;
      // it changes neither compound-arbor motion nor the 56T wheel phase.
      pinionPhase: THREE.MathUtils.degToRad(-12.05),
      pinionBevel: false,
      pinionToothProfile: "involute",
      meshBacklash: 0.02,
      pinionRenderedZInterval: {
        min: -0.16599999368190765,
        max: 0.1340000033378601,
      },
      arborZMin: FROZEN_ARBOR_WORLD_Z.fourth.min - DEPTH.fourthWheel,
      arborZMax: FROZEN_ARBOR_WORLD_Z.fourth.max - DEPTH.fourthWheel,
    }),
    DEPTH.fourthWheel,
    layout.positions.fourth,
  );

  const escape = makePart(
    "escape",
    createEscapeWheel({
      module: MODULE,
      wheelZ: 0,
      pinionZ: DEPTH.escapePinion - DEPTH.escapeWheel,
      pitchRadius: layout.radii.escape,
      materials,
      clubIndex: computeEscapeClubIndex(layout),
      // Clock/profile only the 7-leaf going-train pinion. The 15-club escape
      // wheel keeps its independent local phase and certified contact law.
      // The fixed midpoint below is the center of the zero-collision interval
      // found by a full repeating-cycle rendered-mesh phase scan; it changes
      // neither the compound-arbor motion nor the club-to-pallet relationship.
      pinionPhase: THREE.MathUtils.degToRad(17.785714285714285),
      pinionBevel: false,
      pinionToothProfile: "involute",
      meshBacklash: 0.02,
      pinionRenderedZInterval: {
        min: -0.16599999368190765,
        max: 0.1340000033378601,
      },
      arborZMin: FROZEN_ARBOR_WORLD_Z.escape.min - DEPTH.escapeWheel,
      arborZMax: FROZEN_ARBOR_WORLD_Z.escape.max - DEPTH.escapeWheel,
    }),
    DEPTH.escapeWheel,
    layout.positions.escape,
  );

  const palletGeom = createPalletFork(materials);
  const pallet = makePart("pallet", palletGeom, DEPTH.pallet, layout.positions.pallet);
  pallet.pose.rotation.z = ESCAPEMENT.palletNeutralReference;

  const balance = makePart("balance", createBalance(materials), DEPTH.balance, layout.positions.balance);

  const hairspring = createHairspring(materials.hairspring, materials.arbor);
  const hairspringPose = new THREE.Group();
  hairspringPose.name = "hairspring:pose";
  hairspringPose.position.set(
    layout.positions.balance.x,
    layout.positions.balance.y,
    DEPTH.hairspring,
  );
  hairspringPose.add(hairspring.group);

  const parts = { barrel, center, third, fourth, escape, pallet, balance };
  for (const part of Object.values(parts)) {
    root.add(part.pose);
  }
  root.add(hairspringPose);

  const rest = computeRestPhases(layout);

  return {
    root,
    parts,
    layout,
    hairspring,
    sampleEscapement: sampleEscapementState,
    update(time: number) {
      const { escapeAngle, palletAngle, balanceAngle } = sampleEscapementState(time);

      const fourthDelta = -escapeAngle * (TEETH.escapePinion / TEETH.fourth);
      const thirdDelta = -fourthDelta * (TEETH.fourthPinion / TEETH.third);
      const centerDelta = -thirdDelta * (TEETH.thirdPinion / TEETH.center);
      const barrelDelta = -centerDelta * (TEETH.centerPinion / TEETH.barrel);

      barrel.motion.rotation.z = rest.barrel + barrelDelta;
      center.motion.rotation.z = rest.center + centerDelta;
      third.motion.rotation.z = rest.third + thirdDelta;
      fourth.motion.rotation.z = rest.fourth + fourthDelta;
      escape.motion.rotation.z = rest.escape + escapeAngle;
      pallet.motion.rotation.z = palletAngle;
      balance.motion.rotation.z = balanceAngle;
      hairspring.update(balanceAngle);
    },
  };
}

function angleTo(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/**
 * Rotate only the escape-wheel mesh so a club locking face addresses the
 * entry stone at t = 0. The pinion rest phase (fourth mesh) is unchanged.
 */
function computeEscapeClubIndex(layout: Layout): number {
  const clubWorld = ANGLES.palletFromEscape - Math.PI / 5;
  const pinionRest = angleTo(layout.positions.escape, layout.positions.fourth);
  return clubWorld - pinionRest - RENDERED_ESCAPE_CLUB.maximumAngleModuloPitch;
}

/**
 * Rest rotations so a wheel tooth faces the next pinion, and that pinion
 * presents a space. Animation then adds ratio-locked deltas.
 */
function computeRestPhases(layout: Layout): Record<"barrel" | "center" | "third" | "fourth" | "escape", number> {
  const p = layout.positions;
  const barrel = angleTo(p.barrel, p.center) - Math.PI / TEETH.barrel;
  const center = angleTo(p.center, p.barrel);
  const third = angleTo(p.third, p.center);
  const fourth = angleTo(p.fourth, p.third);
  const escape = angleTo(p.escape, p.fourth);
  return { barrel, center, third, fourth, escape };
}
