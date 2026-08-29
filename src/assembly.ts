import * as THREE from "three";
import type { Vec2 } from "./spec";
import type { StructuralPlan } from "./structureSpec";
import {
  ASM,
  createAssemblyPlan,
  validateAssemblyAlignment,
  type AssemblyPlan,
  type BearingAssemblySpec,
  type FastenerAssemblySpec,
} from "./assemblySpec";
import { createAssemblyMaterials, type AssemblyMaterials } from "./assemblyMaterials";
import {
  bushingMesh,
  endstoneMesh,
  fastenerSeat,
  holeJewelMesh,
  retainerClip,
  settingRing,
  slottedScrew,
} from "./assemblyGeometry";

export type AssemblyViewName =
  | "asmTop"
  | "asmHero"
  | "asmTrain"
  | "asmEscape"
  | "asmBalance"
  | "asmFastener"
  | "asmFastenerAudit"
  | "asmUnderside"
  | "asmAudit"
  | "asmJointId"
  | "asmJointClose"
  | "asmJointSection"
  | "asmJointGraze1"
  | "asmJointGraze2"
  | "asmJointSeat";

export const ASSEMBLY_VIEWS: Record<
  AssemblyViewName,
  { position: THREE.Vector3; target: THREE.Vector3 }
> = {
  asmTop: {
    position: new THREE.Vector3(-1.5, 1.1, 34),
    target: new THREE.Vector3(-1.5, 1.1, 0.4),
  },
  asmHero: {
    position: new THREE.Vector3(12.2, 9.4, 22.4),
    target: new THREE.Vector3(-1.5, 1.2, 0.9),
  },
  asmTrain: {
    position: new THREE.Vector3(3.2, -1.6, 16.4),
    target: new THREE.Vector3(2.4, 0.45, 2.5),
  },
  asmEscape: {
    position: new THREE.Vector3(3.6, 6.6, 7.2),
    target: new THREE.Vector3(-0.4, 3.4, 2.5),
  },
  asmBalance: {
    position: new THREE.Vector3(-2.2, 8.4, 6.8),
    target: new THREE.Vector3(-3.36, 6.65, 3.58),
  },
  asmFastener: {
    position: new THREE.Vector3(10.9, 6.7, 5.2),
    target: new THREE.Vector3(9.24, 5.09, 2.56),
  },
  asmFastenerAudit: {
    position: new THREE.Vector3(12.6, 7.4, 4.6),
    target: new THREE.Vector3(9.24, 5.09, 2.32),
  },
  asmUnderside: {
    position: new THREE.Vector3(-1.5, 1.1, 18),
    target: new THREE.Vector3(-1.5, 1.1, -0.2),
  },
  asmAudit: {
    position: new THREE.Vector3(22.5, 11.2, 7.2),
    target: new THREE.Vector3(1.6, 2.4, 1.15),
  },
  asmJointId: {
    position: new THREE.Vector3(-1.5, 1.1, 34),
    target: new THREE.Vector3(-1.5, 1.1, 0.4),
  },
  asmJointClose: {
    position: new THREE.Vector3(6.4, -0.2, 8.4),
    target: new THREE.Vector3(2.7, -1.7, 2.45),
  },
  asmJointSection: {
    position: new THREE.Vector3(2.7, 13.2, 0.85),
    target: new THREE.Vector3(2.7, -1.73, 0.85),
  },
  // Marked screenshot 1: steep close graze at the center land, barrel behind.
  asmJointGraze1: {
    position: new THREE.Vector3(3.35, 2.55, 3.45),
    target: new THREE.Vector3(0.04, 0.04, 2.38),
  },
  // Marked screenshot 2: along-bridge graze from the fourth toward center.
  asmJointGraze2: {
    position: new THREE.Vector3(5.15, -3.35, 2.15),
    target: new THREE.Vector3(0.85, -0.55, 2.38),
  },
  // Tight cut through the center member→boss seat.
  asmJointSeat: {
    position: new THREE.Vector3(0.05, 4.8, 2.36),
    target: new THREE.Vector3(0.05, 0.0, 2.36),
  },
};

export type SeatAuditRow = {
  id: string;
  kind: "physical-seat" | "locus-alignment-only";
  locusZ: number;
  jewelMidZ: number;
  jewelBottomZ: number;
  seatFaceZ: number | null;
  locusDelta: number;
  seatOverlap: number | null;
  seatGap: number | null;
  relation: "overlap" | "contact" | "gap" | "locus-aligned" | "no-defined-seat";
};

export type FastenerSeatRow = {
  id: string;
  kind: "physical-seat";
  seatTopZ: number;
  headUndersideZ: number;
  gap: number;
  relation: "contact" | "overlap" | "gap";
};

export type AssemblyReport = {
  bearingCount: number;
  fastenerCount: number;
  invented: number;
  maxBearingDelta: number;
  maxFastenerDelta: number;
  maxUpperSeatOverlap: number;
  maxLowerLocusDelta: number;
  maxFastenerSeatGap: number;
  alignment: { id: string; delta: number }[];
  containment: {
    id: string;
    bossOrFoot: number;
    outer: number;
    margin: number;
  }[];
  seatAudit: SeatAuditRow[];
  fastenerSeats: FastenerSeatRow[];
};

export type MovementAssembly = {
  root: THREE.Group;
  pose: THREE.Group;
  plan: AssemblyPlan;
  materials: AssemblyMaterials;
  auditLights: THREE.Group;
  report: () => AssemblyReport;
  setSilhouette: (on: boolean) => void;
  setAudit: (on: boolean) => void;
  setLowerHardware: (on: boolean) => void;
  setJointId: (on: boolean) => void;
};

export function createMovementAssembly(structure: StructuralPlan): MovementAssembly {
  const materials = createAssemblyMaterials();
  const plan = createAssemblyPlan(structure);
  const root = new THREE.Group();
  root.name = "assembly:root";
  const pose = new THREE.Group();
  pose.name = "assembly:pose";
  root.add(pose);

  const rendered: { id: string; xy: Vec2 }[] = [];
  const lower = new THREE.Group();
  lower.name = "assembly:lowerHardware";

  for (const b of plan.bearings) {
    const g = buildBearing(b, materials, rendered);
    if (b.side === "lower") lower.add(g);
    else pose.add(g);
  }
  pose.add(lower);
  for (const f of plan.fasteners) {
    pose.add(buildFastener(f, materials, rendered));
  }

  const alignment = validateAssemblyAlignment(plan, rendered);
  const maxDelta = alignment.reduce((m, r) => Math.max(m, r.delta), 0);
  if (maxDelta > 1e-9) {
    console.warn("assembly XY authority mismatch", maxDelta, alignment);
  }

  const auditLights = new THREE.Group();
  auditLights.name = "assembly:auditLights";
  auditLights.visible = false;
  const fill = new THREE.HemisphereLight(0xf4f6f8, 0x9aa0a6, 1.35);
  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(10, 6, 12);
  const under = new THREE.DirectionalLight(0xffffff, 0.7);
  under.position.set(2, -12, -6);
  auditLights.add(fill, key, under);
  root.add(auditLights);

  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  pose.traverse((obj) => {
    if (obj instanceof THREE.Mesh) originals.set(obj, obj.material);
  });

  const idJewel = new THREE.MeshBasicMaterial({ color: 0xc0392b });
  const idSetting = new THREE.MeshBasicMaterial({ color: 0xe67e22 });
  const idScrew = new THREE.MeshBasicMaterial({ color: 0x5dade2 });
  const idLower = new THREE.MeshBasicMaterial({ color: 0x27ae60 });
  const idOther = new THREE.MeshBasicMaterial({ color: 0x3d4248 });

  const report = (): AssemblyReport => makeReport(plan, alignment, pose);

  return {
    root,
    pose,
    plan,
    materials,
    auditLights,
    report,
    setLowerHardware: (on: boolean) => {
      lower.visible = on;
    },
    setJointId: (on: boolean) => {
      auditLights.visible = on;
      if (!on) {
        for (const [mesh, mat] of originals) mesh.material = mat;
        return;
      }
      pose.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const n = o.name;
        const p = o.parent?.name ?? "";
        if (p.includes(":lower") || n.includes(":lower")) {
          o.material = idLower;
        } else if (n.includes(":jewel") || n.includes(":endstone") || n.includes(":chaton")) {
          o.material = idJewel;
        } else if (n.includes(":setting") || n.includes(":retainer")) {
          o.material = idSetting;
        } else if (n.includes(":screw") || n.includes(":head") || n.includes(":seat")) {
          o.material = idScrew;
        } else {
          o.material = idOther;
        }
      });
    },
    setSilhouette: (on: boolean) => {
      for (const [mesh, mat] of originals) {
        mesh.material = on ? materials.silhouette : mat;
      }
    },
    setAudit: (on: boolean) => {
      auditLights.visible = on;
      for (const [mesh, mat] of originals) {
        const keepAperture = mat === materials.aperture || (Array.isArray(mat) && mat.includes(materials.aperture));
        mesh.material = on && !keepAperture ? materials.audit : mat;
      }
    },
  };
}

function mark(id: string, xy: Vec2, rendered: { id: string; xy: Vec2 }[]): void {
  rendered.push({ id, xy: { x: xy.x, y: xy.y } });
}

function buildBearing(
  spec: BearingAssemblySpec,
  mats: AssemblyMaterials,
  rendered: { id: string; xy: Vec2 }[],
): THREE.Group {
  const g = new THREE.Group();
  g.name = spec.id;
  mark(spec.id, spec.xy, rendered);

  if (spec.kind === "bushing") {
    g.add(
      bushingMesh(
        spec.xy,
        spec.jewelMidZ,
        spec.jewelRadius,
        spec.apertureRadius,
        spec.jewelThick,
        mats,
        `${spec.id}:bushing`,
      ),
    );
    return g;
  }

  if (spec.setting === "chaton") {
    g.add(
      settingRing(
        spec.xy,
        spec.settingMidZ,
        spec.settingRadius,
        spec.jewelRadius * 0.96,
        ASM.settingThick + 0.012,
        mats.chaton,
        `${spec.id}:chaton`,
      ),
    );
  } else if (spec.setting === "collar") {
    g.add(
      settingRing(
        spec.xy,
        spec.settingMidZ,
        spec.settingRadius,
        spec.jewelRadius * 0.97,
        ASM.settingThick,
        mats.setting,
        `${spec.id}:setting`,
      ),
    );
  }

  g.add(
    holeJewelMesh(
      spec.xy,
      spec.jewelMidZ,
      spec.jewelRadius,
      spec.apertureRadius,
      spec.jewelThick,
      mats,
      `${spec.id}:jewel`,
      { openAperture: spec.pivot === "center" && spec.side === "upper" },
    ),
  );

  if (spec.hasEndstone && spec.endstoneMidZ !== null) {
    g.add(
      endstoneMesh(
        spec.xy,
        spec.endstoneMidZ,
        spec.endstoneRadius,
        ASM.endstoneThick,
        mats,
        `${spec.id}:endstone`,
      ),
    );
  }
  if (spec.hasRetainer && spec.retainerMidZ !== null) {
    g.add(
      retainerClip(
        spec.xy,
        spec.retainerMidZ,
        spec.retainerRadius,
        ASM.retainerThick,
        mats,
        `${spec.id}:retainer`,
      ),
    );
  }
  return g;
}

function buildFastener(
  spec: FastenerAssemblySpec,
  mats: AssemblyMaterials,
  rendered: { id: string; xy: Vec2 }[],
): THREE.Group {
  const g = new THREE.Group();
  g.name = spec.id;
  mark(spec.id, spec.xy, rendered);
  const seat = fastenerSeat(
    spec.xy,
    spec.seatTopZ - ASM.seatThick * 0.5,
    spec.seatRadius,
    spec.shaftRadius + 0.012,
    ASM.seatThick,
    mats,
    `${spec.id}:seat`,
  );
  // The escape-anchor fastener is recessed into the cranked underpass. Three's
  // bevelled seat extrusion realizes 0.00368 mm below its analytic top; align
  // that one rendered face to the screw underside so the fastener genuinely
  // clamps its seat. Other frozen fastener stacks retain their old placement.
  if (spec.sourceId === "anchor:escape") {
    seat.geometry.computeBoundingBox();
    const localTop = seat.geometry.boundingBox?.max.z;
    if (localTop === undefined) throw new Error("escape-anchor seat has no rendered bounds");
    const beforeTop = seat.position.z + localTop;
    seat.position.z += spec.headUndersideZ - beforeTop;
    const renderedSeatTopZ = seat.position.z + localTop;
    g.userData.renderedSeatTopZ = renderedSeatTopZ;
    g.userData.renderedSeatContactGap = spec.headUndersideZ - renderedSeatTopZ;
  }
  g.add(seat);
  g.add(
    slottedScrew(
      spec.xy,
      spec.headMidZ,
      spec.headRadius,
      ASM.headThick,
      spec.shaftRadius,
      spec.shaftBottomZ,
      spec.slotAngle,
      mats,
      `${spec.id}:head`,
    ),
  );
  return g;
}

function makeReport(
  plan: AssemblyPlan,
  alignment: { id: string; delta: number }[],
  pose: THREE.Object3D,
): AssemblyReport {
  const bearingIds = new Set(plan.bearings.map((b) => b.id));
  const maxBearingDelta = alignment
    .filter((a) => bearingIds.has(a.id))
    .reduce((m, a) => Math.max(m, a.delta), 0);
  const maxFastenerDelta = alignment
    .filter((a) => !bearingIds.has(a.id))
    .reduce((m, a) => Math.max(m, a.delta), 0);

  const containment = [
    ...plan.bearings.map((b) => ({
      id: b.id,
      bossOrFoot: b.bossRadius,
      outer: Math.max(b.settingRadius, b.retainerRadius, b.jewelRadius),
      margin: b.bossRadius - Math.max(b.settingRadius, b.retainerRadius, b.jewelRadius),
    })),
    ...plan.fasteners.map((f) => ({
      id: f.id,
      bossOrFoot: f.footRadius,
      outer: f.seatRadius,
      margin: f.footRadius - f.seatRadius,
    })),
  ];

  const seatAudit: SeatAuditRow[] = plan.bearings.map((b) => {
    const jewelBottomZ = b.jewelMidZ - b.jewelThick * 0.5;
    const locusDelta = b.jewelMidZ - b.locusZ;
    if (b.side === "upper" && b.seatFaceZ !== null) {
      const seatOverlap = b.seatFaceZ - jewelBottomZ;
      const seatGap = Math.max(0, jewelBottomZ - b.seatFaceZ);
      return {
        id: b.id,
        kind: "physical-seat",
        locusZ: b.locusZ,
        jewelMidZ: b.jewelMidZ,
        jewelBottomZ,
        seatFaceZ: b.seatFaceZ,
        locusDelta,
        seatOverlap,
        seatGap,
        relation: seatGap > 1e-9 ? "gap" : seatOverlap > 1e-9 ? "overlap" : "contact",
      };
    }
    return {
      id: b.id,
      kind: "locus-alignment-only",
      locusZ: b.locusZ,
      jewelMidZ: b.jewelMidZ,
      jewelBottomZ,
      seatFaceZ: null,
      locusDelta,
      seatOverlap: null,
      seatGap: null,
      relation: Math.abs(locusDelta) <= 1e-9 ? "locus-aligned" : "no-defined-seat",
    };
  });

  const fastenerSeats: FastenerSeatRow[] = plan.fasteners.map((f) => {
    const rendered = pose.getObjectByName(f.id);
    const renderedSeatTopZ =
      typeof rendered?.userData.renderedSeatTopZ === "number"
        ? rendered.userData.renderedSeatTopZ
        : f.seatTopZ;
    const gap = f.headUndersideZ - renderedSeatTopZ;
    return {
      id: f.id,
      kind: "physical-seat",
      seatTopZ: renderedSeatTopZ,
      headUndersideZ: f.headUndersideZ,
      gap,
      relation: gap > 1e-9 ? "gap" : gap < -1e-9 ? "overlap" : "contact",
    };
  });

  return {
    bearingCount: plan.bearings.length,
    fastenerCount: plan.fasteners.length,
    invented: 0,
    maxBearingDelta,
    maxFastenerDelta,
    maxUpperSeatOverlap: Math.max(0, ...seatAudit.map((r) => r.seatOverlap ?? 0)),
    maxLowerLocusDelta: Math.max(
      0,
      ...seatAudit.filter((r) => r.kind === "locus-alignment-only").map((r) => Math.abs(r.locusDelta)),
    ),
    maxFastenerSeatGap: Math.max(0, ...fastenerSeats.map((r) => r.gap)),
    alignment,
    containment,
    seatAudit,
    fastenerSeats,
  };
}

export function applyAssemblyView(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void },
  name: AssemblyViewName,
): void {
  const view = ASSEMBLY_VIEWS[name];
  camera.position.copy(view.position);
  controls.target.copy(view.target);
  controls.update();
}
