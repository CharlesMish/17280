import * as THREE from "three";
import { DEPTH } from "./spec";
import type { Movement } from "./movement";
import {
  buildDisplayDriveGeometry,
  createDisplayDriveMaterials,
  type DisplayDriveGeometry,
  type DisplayDriveMaterials,
} from "./displayDriveGeometry";
import {
  DISPLAY_DRIVE,
  DISPLAY_DRIVE_GEARS,
  DISPLAY_DRIVE_MESHES,
  DISPLAY_DRIVE_NET_RATIO,
  DISPLAY_DRIVE_NOT_CLAIMED,
  type DisplayDriveGearSpec,
} from "./displayDriveSpec";

export type DisplayDriveOwner = "stationary" | "minute" | "compound" | "hour";

export type DisplayDriveAuditVisibility =
  | "all"
  | "rotating"
  | "stationary"
  | "motionWorks"
  | "minute"
  | "hour";

export type DisplayDriveReadoutParts = {
  hourHandMount?: THREE.Object3D | null;
  minuteHandMount?: THREE.Object3D | null;
  hourCollar?: THREE.Object3D | null;
  minuteCollar?: THREE.Object3D | null;
  centerStem?: THREE.Object3D | null;
  cap?: THREE.Object3D | null;
};

export type DisplayDriveClaimOptions = {
  /** Use Object3D.attach() instead of retaining aligned readout-local transforms. */
  preserveWorldTransform?: boolean;
  /** Remove the old HourPose / MinutePose clocking after mechanical adoption. */
  resetHandClocking?: boolean;
  /** Force claimed readout roots back onto the frozen center XY. */
  zeroClaimXy?: boolean;
};

export type DisplayDriveMemberId =
  | "centerSource"
  | "centerStaff"
  | "cannonPinion"
  | "minuteDrive"
  | "minuteWheel"
  | "minutePinion"
  | "hourWheel"
  | "hourPipe"
  | "minuteHand"
  | "hourHand";

export type DisplayDriveMemberSample = {
  id: DisplayDriveMemberId;
  angleRad: number;
  angleDeg: number;
  kinematicAngleRad: number;
  localPhaseRad: number;
  ratioToCenter: number;
};

export type DisplayDriveKinematicSample = {
  inputQ: number;
  sourceZero: number;
  sourceDelta: number;
  members: Record<DisplayDriveMemberId, DisplayDriveMemberSample>;
};

export type DisplayDriveIntervalSample = {
  from: DisplayDriveKinematicSample;
  to: DisplayDriveKinematicSample;
  sourceDeltaRad: number;
  sourceDeltaDeg: number;
  deltas: Record<
    DisplayDriveMemberId,
    {
      angleRad: number;
      angleDeg: number;
      measuredRatioToCenter: number | null;
    }
  >;
};

export type DisplayDrivePresentationToken = {
  readonly id: number;
  readonly timeSeconds: number;
  readonly displayQ: number;
};

type ClaimRole = keyof DisplayDriveReadoutParts;

type ClaimRecord = {
  role: ClaimRole;
  object: THREE.Object3D;
  originalParent: THREE.Object3D | null;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  visible: boolean;
  owner: "minute" | "hour";
};

type SectionMaterialState = {
  clippingPlanes: THREE.Plane[] | null;
  clipIntersection: boolean;
};

type KinematicChain = {
  inputQ: number;
  minute: number;
  compound: number;
  hour: number;
};

export type DisplayDriveLayer = {
  root: THREE.Group;
  centerOutput: THREE.Group;
  geometry: DisplayDriveGeometry;
  materials: DisplayDriveMaterials;
  getSourceZero: () => number;
  getRuntimeQ: () => number;
  getDisplayedQ: () => number;
  setSourceZero: (q: number) => void;
  update: (q?: number) => DisplayDriveKinematicSample;
  sampleKinematics: (q: number) => DisplayDriveKinematicSample;
  sampleInterval: (q0: number, q1: number) => DisplayDriveIntervalSample;
  applyPresentationTime: (
    timeSeconds: number,
    displayQ: number,
  ) => DisplayDrivePresentationToken;
  restorePresentationTime: (token?: DisplayDrivePresentationToken) => void;
  claimReadout: (
    parts: DisplayDriveReadoutParts,
    options?: DisplayDriveClaimOptions,
  ) => void;
  releaseReadout: () => void;
  setVisible: (on: boolean) => void;
  setOwnersVisible: (
    owners: Partial<
      Record<DisplayDriveOwner | "minuteClaims" | "hourClaims", boolean>
    >,
  ) => void;
  setAuditVisibility: (mode: DisplayDriveAuditVisibility) => void;
  setSection: (on: boolean, plane?: THREE.Plane) => void;
  setIdMode: (on: boolean) => void;
  report: () => DisplayDriveReport;
  dispose: () => void;
};

export type DisplayDriveReport = ReturnType<typeof makeReport>;

const RAD_TO_DEG = 180 / Math.PI;

const finite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) throw new Error(`Phase 4B ${label} must be finite`);
  return value;
};

const objectPath = (object: THREE.Object3D): string => {
  const names: string[] = [];
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    if (cursor.name) names.push(cursor.name);
    cursor = cursor.parent;
  }
  return names.reverse().join("/");
};

const bounds = (object: THREE.Object3D) => {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object, true);
  if (box.isEmpty()) return null;
  return {
    minX: box.min.x,
    maxX: box.max.x,
    minY: box.min.y,
    maxY: box.max.y,
    minZ: box.min.z,
    maxZ: box.max.z,
  };
};

const meshMaterials = (mesh: THREE.Mesh): THREE.Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material];

const ownerForClaim = (role: ClaimRole): "minute" | "hour" =>
  role === "hourHandMount" || role === "hourCollar" ? "hour" : "minute";

const memberSample = (
  id: DisplayDriveMemberId,
  kinematicAngleRad: number,
  localPhaseRad: number,
  ratioToCenter: number,
): DisplayDriveMemberSample => {
  const angleRad = kinematicAngleRad + localPhaseRad;
  return {
    id,
    angleRad,
    angleDeg: angleRad * RAD_TO_DEG,
    kinematicAngleRad,
    localPhaseRad,
    ratioToCenter,
  };
};

export function createDisplayDrive(opts: {
  movement: Movement;
  materials?: DisplayDriveMaterials;
  /** Generalized center-source angle at the mechanical zero reference. */
  sourceZero?: number;
}): DisplayDriveLayer {
  const materials = opts.materials ?? createDisplayDriveMaterials();
  const geometry = buildDisplayDriveGeometry(materials);
  const centerMotion = opts.movement.parts.center.motion;
  const centerXy = opts.movement.layout.positions.center;

  if (
    Math.hypot(
      centerXy.x - DISPLAY_DRIVE.axis.x,
      centerXy.y - DISPLAY_DRIVE.axis.y,
    ) > 1e-12
  ) {
    throw new Error(
      `Phase 4B frozen center drift: layout=(${centerXy.x},${centerXy.y}) drive=(${DISPLAY_DRIVE.axis.x},${DISPLAY_DRIVE.axis.y})`,
    );
  }

  geometry.root.position.set(centerXy.x, centerXy.y, 0);
  geometry.centerOutput.position.set(0, 0, -DEPTH.centerWheel);
  centerMotion.add(geometry.centerOutput);

  let sourceZero = finite(
    opts.sourceZero ?? centerMotion.rotation.z,
    "sourceZero",
  );
  let runtimeQ = centerMotion.rotation.z;
  let displayedQ = runtimeQ;
  let presentationCounter = 0;
  let activePresentation: DisplayDrivePresentationToken | null = null;
  const claims = new Map<ClaimRole, ClaimRecord>();

  const minuteMeshRatio = DISPLAY_DRIVE_MESHES.minuteReduction.signedRatio;
  const hourMeshRatio = DISPLAY_DRIVE_MESHES.hourReduction.signedRatio;

  /**
   * Walk the physical mesh chain. The hour result intentionally derives from
   * compound motion; there is no direct center / 12 runtime shortcut here.
   */
  const chainForQ = (q: number): KinematicChain => {
    finite(q, "runtime input q");
    const minute = q - sourceZero;
    const compound = minuteMeshRatio * minute;
    const hour = hourMeshRatio * compound;
    return { inputQ: q, minute, compound, hour };
  };

  const applyDisplayedQ = (q: number): void => {
    const chain = chainForQ(q);
    displayedQ = q;

    // centerOutput inherits runtimeQ from center:motion. This compensation
    // leaves the normal mechanical clocking at q-q0 and holds a forced pose
    // fixed even if the source continues to advance during a capture.
    geometry.centerOutput.rotation.z = chain.minute - runtimeQ;
    geometry.compoundMotion.rotation.z = chain.compound;
    geometry.hourMotion.rotation.z = chain.hour;
  };

  const sampleKinematics = (q: number): DisplayDriveKinematicSample => {
    const chain = chainForQ(q);
    const netRatio = minuteMeshRatio * hourMeshRatio;
    const members: Record<DisplayDriveMemberId, DisplayDriveMemberSample> = {
      centerSource: memberSample("centerSource", q, 0, 1),
      centerStaff: memberSample("centerStaff", chain.minute, 0, 1),
      cannonPinion: memberSample(
        "cannonPinion",
        chain.minute,
        DISPLAY_DRIVE_GEARS.cannonPinion.localPhase,
        1,
      ),
      minuteDrive: memberSample("minuteDrive", chain.minute, 0, 1),
      minuteWheel: memberSample(
        "minuteWheel",
        chain.compound,
        DISPLAY_DRIVE_GEARS.minuteWheel.localPhase,
        minuteMeshRatio,
      ),
      minutePinion: memberSample(
        "minutePinion",
        chain.compound,
        DISPLAY_DRIVE_GEARS.minutePinion.localPhase,
        minuteMeshRatio,
      ),
      hourWheel: memberSample(
        "hourWheel",
        chain.hour,
        DISPLAY_DRIVE_GEARS.hourWheel.localPhase,
        netRatio,
      ),
      hourPipe: memberSample("hourPipe", chain.hour, 0, netRatio),
      minuteHand: memberSample("minuteHand", chain.minute, 0, 1),
      hourHand: memberSample("hourHand", chain.hour, 0, netRatio),
    };
    return {
      inputQ: q,
      sourceZero,
      sourceDelta: q - sourceZero,
      members,
    };
  };

  const sampleInterval = (q0: number, q1: number): DisplayDriveIntervalSample => {
    const from = sampleKinematics(q0);
    const to = sampleKinematics(q1);
    const sourceDeltaRad = q1 - q0;
    const ids = Object.keys(from.members) as DisplayDriveMemberId[];
    const deltas = Object.fromEntries(
      ids.map((id) => {
        const angleRad = to.members[id].angleRad - from.members[id].angleRad;
        return [
          id,
          {
            angleRad,
            angleDeg: angleRad * RAD_TO_DEG,
            measuredRatioToCenter:
              Math.abs(sourceDeltaRad) > 1e-15 ? angleRad / sourceDeltaRad : null,
          },
        ];
      }),
    ) as DisplayDriveIntervalSample["deltas"];
    return {
      from,
      to,
      sourceDeltaRad,
      sourceDeltaDeg: sourceDeltaRad * RAD_TO_DEG,
      deltas,
    };
  };

  const allOwnerRoots = (): Record<DisplayDriveOwner, THREE.Group> => ({
    stationary: geometry.stationaryOwner,
    minute: geometry.centerOutput,
    compound: geometry.compoundMotion,
    hour: geometry.hourMotion,
  });

  const allMeshes = (): { owner: DisplayDriveOwner; mesh: THREE.Mesh }[] => {
    const rows: { owner: DisplayDriveOwner; mesh: THREE.Mesh }[] = [];
    const seen = new Set<THREE.Mesh>();
    for (const [owner, group] of Object.entries(allOwnerRoots()) as [
      DisplayDriveOwner,
      THREE.Group,
    ][]) {
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || seen.has(object)) return;
        seen.add(object);
        rows.push({ owner, mesh: object });
      });
    }
    return rows;
  };

  const idMaterials: Record<DisplayDriveOwner, THREE.MeshBasicMaterial> = {
    stationary: new THREE.MeshBasicMaterial({
      name: "phase4b:id:stationary",
      color: 0x64748b,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
    minute: new THREE.MeshBasicMaterial({
      name: "phase4b:id:minute",
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
    compound: new THREE.MeshBasicMaterial({
      name: "phase4b:id:compound",
      color: 0x22c55e,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
    hour: new THREE.MeshBasicMaterial({
      name: "phase4b:id:hour",
      color: 0x3b82f6,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  };
  const idOriginals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  let idMode = false;

  const sectionStates = new Map<THREE.Material, SectionMaterialState>();
  let sectionPlane: THREE.Plane | null = null;

  const applySectionMaterial = (material: THREE.Material): void => {
    if (!sectionPlane) return;
    if (!sectionStates.has(material)) {
      sectionStates.set(material, {
        clippingPlanes: material.clippingPlanes
          ? material.clippingPlanes.map((plane) => plane.clone())
          : null,
        clipIntersection: material.clipIntersection,
      });
    }
    material.clippingPlanes = [sectionPlane];
    material.clipIntersection = false;
    material.needsUpdate = true;
  };

  const applyCurrentSection = (): void => {
    if (!sectionPlane) return;
    for (const { mesh } of allMeshes()) {
      for (const material of meshMaterials(mesh)) applySectionMaterial(material);
    }
  };

  const setIdMode = (on: boolean): void => {
    if (on === idMode) {
      if (on) {
        for (const { owner, mesh } of allMeshes()) {
          if (!idOriginals.has(mesh)) idOriginals.set(mesh, mesh.material);
          mesh.material = idMaterials[owner];
        }
        applyCurrentSection();
      }
      return;
    }
    idMode = on;
    if (on) {
      for (const { owner, mesh } of allMeshes()) {
        if (!idOriginals.has(mesh)) idOriginals.set(mesh, mesh.material);
        mesh.material = idMaterials[owner];
      }
      applyCurrentSection();
    } else {
      for (const [mesh, material] of idOriginals) mesh.material = material;
      idOriginals.clear();
      applyCurrentSection();
    }
  };

  const setSection = (on: boolean, plane?: THREE.Plane): void => {
    if (on) {
      sectionPlane = (plane ?? new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.15)).clone();
      applyCurrentSection();
      return;
    }
    for (const [material, state] of sectionStates) {
      material.clippingPlanes = state.clippingPlanes
        ? state.clippingPlanes.map((saved) => saved.clone())
        : null;
      material.clipIntersection = state.clipIntersection;
      material.needsUpdate = true;
    }
    sectionStates.clear();
    sectionPlane = null;
  };

  const releaseReadout = (): void => {
    const restoreId = idMode;
    if (restoreId) setIdMode(false);
    for (const record of claims.values()) {
      record.object.removeFromParent();
      if (record.originalParent) record.originalParent.add(record.object);
      record.object.position.copy(record.position);
      record.object.quaternion.copy(record.quaternion);
      record.object.scale.copy(record.scale);
      record.object.visible = record.visible;
    }
    claims.clear();
    if (restoreId) setIdMode(true);
  };

  const claimReadout = (
    parts: DisplayDriveReadoutParts,
    options: DisplayDriveClaimOptions = {},
  ): void => {
    releaseReadout();
    const preserveWorldTransform = options.preserveWorldTransform ?? false;
    const resetHandClocking = options.resetHandClocking ?? true;
    const zeroClaimXy = options.zeroClaimXy ?? true;
    const seen = new Set<THREE.Object3D>();

    for (const [role, candidate] of Object.entries(parts) as [
      ClaimRole,
      THREE.Object3D | null | undefined,
    ][]) {
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      const owner = ownerForClaim(role);
      const target = owner === "minute" ? geometry.minuteClaims : geometry.hourClaims;
      const record: ClaimRecord = {
        role,
        object: candidate,
        originalParent: candidate.parent,
        position: candidate.position.clone(),
        quaternion: candidate.quaternion.clone(),
        scale: candidate.scale.clone(),
        visible: candidate.visible,
        owner,
      };
      claims.set(role, record);

      if (preserveWorldTransform) target.attach(candidate);
      else {
        candidate.removeFromParent();
        target.add(candidate);
      }
      if (zeroClaimXy) {
        candidate.position.x = 0;
        candidate.position.y = 0;
      }
      if (
        resetHandClocking &&
        (role === "hourHandMount" || role === "minuteHandMount")
      ) {
        candidate.rotation.z = 0;
      }
    }
    if (idMode) setIdMode(true);
    applyCurrentSection();
  };

  const setOwnersVisible = (
    owners: Partial<
      Record<DisplayDriveOwner | "minuteClaims" | "hourClaims", boolean>
    >,
  ): void => {
    if (owners.stationary !== undefined)
      geometry.stationaryOwner.visible = owners.stationary;
    if (owners.minute !== undefined) geometry.minuteGeometry.visible = owners.minute;
    if (owners.compound !== undefined)
      geometry.compoundMotion.visible = owners.compound;
    if (owners.hour !== undefined) geometry.hourGeometry.visible = owners.hour;
    if (owners.minuteClaims !== undefined)
      geometry.minuteClaims.visible = owners.minuteClaims;
    if (owners.hourClaims !== undefined)
      geometry.hourClaims.visible = owners.hourClaims;
  };

  const setAuditVisibility = (mode: DisplayDriveAuditVisibility): void => {
    const table: Record<
      DisplayDriveAuditVisibility,
      Record<DisplayDriveOwner | "minuteClaims" | "hourClaims", boolean>
    > = {
      all: {
        stationary: true,
        minute: true,
        compound: true,
        hour: true,
        minuteClaims: true,
        hourClaims: true,
      },
      rotating: {
        stationary: false,
        minute: true,
        compound: true,
        hour: true,
        minuteClaims: true,
        hourClaims: true,
      },
      stationary: {
        stationary: true,
        minute: false,
        compound: false,
        hour: false,
        minuteClaims: false,
        hourClaims: false,
      },
      motionWorks: {
        stationary: true,
        minute: true,
        compound: true,
        hour: true,
        minuteClaims: false,
        hourClaims: false,
      },
      minute: {
        stationary: false,
        minute: true,
        compound: false,
        hour: false,
        minuteClaims: true,
        hourClaims: false,
      },
      hour: {
        stationary: false,
        minute: false,
        compound: false,
        hour: true,
        minuteClaims: false,
        hourClaims: true,
      },
    };
    setOwnersVisible(table[mode]);
  };

  const report = (): DisplayDriveReport =>
    makeReport({
      geometry,
      centerXy,
      sourceZero,
      runtimeQ,
      displayedQ,
      activePresentation,
      claims,
      sample: sampleKinematics(displayedQ),
    });

  const layer: DisplayDriveLayer = {
    root: geometry.root,
    centerOutput: geometry.centerOutput,
    geometry,
    materials,
    getSourceZero: () => sourceZero,
    getRuntimeQ: () => runtimeQ,
    getDisplayedQ: () => displayedQ,
    setSourceZero: (q) => {
      sourceZero = finite(q, "sourceZero");
      applyDisplayedQ(activePresentation?.displayQ ?? runtimeQ);
    },
    update: (q = centerMotion.rotation.z) => {
      runtimeQ = finite(q, "runtime input q");
      applyDisplayedQ(activePresentation?.displayQ ?? runtimeQ);
      return sampleKinematics(runtimeQ);
    },
    sampleKinematics,
    sampleInterval,
    applyPresentationTime: (timeSeconds, displayQ) => {
      finite(timeSeconds, "presentation time");
      finite(displayQ, "presentation q");
      if (activePresentation) {
        throw new Error("Phase 4B presentation override already active");
      }
      const token = Object.freeze({
        id: ++presentationCounter,
        timeSeconds,
        displayQ,
      });
      activePresentation = token;
      applyDisplayedQ(displayQ);
      return token;
    },
    restorePresentationTime: (token) => {
      if (!activePresentation) return;
      if (token && token.id !== activePresentation.id) {
        throw new Error(
          `Phase 4B presentation token mismatch ${token.id} != ${activePresentation.id}`,
        );
      }
      activePresentation = null;
      applyDisplayedQ(runtimeQ);
    },
    claimReadout,
    releaseReadout,
    setVisible: (on) => {
      geometry.root.visible = on;
      geometry.centerOutput.visible = on;
    },
    setOwnersVisible,
    setAuditVisibility,
    setSection,
    setIdMode,
    report,
    dispose: () => {
      setIdMode(false);
      setSection(false);
      releaseReadout();
      geometry.centerOutput.removeFromParent();
      geometry.root.removeFromParent();
      const ownedMaterials = new Set<THREE.Material>(Object.values(materials));
      for (const { mesh } of allMeshes()) mesh.geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      for (const material of Object.values(idMaterials)) material.dispose();
    },
  };

  applyDisplayedQ(runtimeQ);
  return layer;
}

function makeReport(opts: {
  geometry: DisplayDriveGeometry;
  centerXy: { x: number; y: number };
  sourceZero: number;
  runtimeQ: number;
  displayedQ: number;
  activePresentation: DisplayDrivePresentationToken | null;
  claims: Map<ClaimRole, ClaimRecord>;
  sample: DisplayDriveKinematicSample;
}) {
  const measuredCenterDistance = Math.hypot(
    opts.geometry.offAxisPose.position.x,
    opts.geometry.offAxisPose.position.y,
  );
  const netRatioFromMeshes =
    DISPLAY_DRIVE_MESHES.minuteReduction.signedRatio *
    DISPLAY_DRIVE_MESHES.hourReduction.signedRatio;
  const meshRows = Object.values(DISPLAY_DRIVE_MESHES).map((mesh) => ({
    ...mesh,
    measuredCenterDistance,
    centerDistanceError: measuredCenterDistance - mesh.expectedCenterDistance,
    direction: "external" as const,
  }));
  const f = DISPLAY_DRIVE.frozen;
  const g = DISPLAY_DRIVE_GEARS;
  const gearRows = Object.values(DISPLAY_DRIVE_GEARS).map((gear) => {
    const mesh = opts.geometry.meshes[gear.id];
    const measured = mesh.userData.phase4b?.measured as
      | {
          boreR: number;
          outerR: number;
          localZ0: number;
          localZ1: number;
          face: number;
        }
      | undefined;
    return { ...gear, measured: measured ? { ...measured } : null };
  });
  const measuredGear = (id: DisplayDriveGearSpec["id"]) =>
    gearRows.find((row) => row.id === id)?.measured ?? null;
  const cannonMeasured = measuredGear("cannonPinion");
  const minuteWheelMeasured = measuredGear("minuteWheel");
  const minutePinionMeasured = measuredGear("minutePinion");
  const hourWheelMeasured = measuredGear("hourWheel");
  const axialOverlap = (
    a0: number,
    a1: number,
    b0: number,
    b1: number,
  ) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const claimBounds = (role: ClaimRole) => {
    const object = opts.claims.get(role)?.object;
    return object ? bounds(object) : null;
  };
  const hourCollarBounds = claimBounds("hourCollar");
  const hourHandBounds = claimBounds("hourHandMount");
  const minuteCollarBounds = claimBounds("minuteCollar");
  const minuteHandBounds = claimBounds("minuteHandMount");
  return {
    phase: "4B",
    disposition: "real two-hand display drive",
    architecture:
      "rigid center staff/cannon → off-axis compound minute wheel/pinion → independent center hour wheel/pipe",
    settingOrSlipValidated: false,
    axis: {
      source: { ...opts.centerXy },
      drive: { ...DISPLAY_DRIVE.axis },
      drift: Math.hypot(
        opts.centerXy.x - DISPLAY_DRIVE.axis.x,
        opts.centerXy.y - DISPLAY_DRIVE.axis.y,
      ),
    },
    source: {
      owner: objectPath(opts.geometry.centerOutput.parent ?? opts.geometry.centerOutput),
      sourceZero: opts.sourceZero,
      runtimeQ: opts.runtimeQ,
      displayedQ: opts.displayedQ,
      centerOutputLocalZCompensation: opts.geometry.centerOutput.position.z,
      expectedLocalZCompensation: -DEPTH.centerWheel,
    },
    derivation: {
      minuteFromSource: 1,
      compoundFromMinute: DISPLAY_DRIVE_MESHES.minuteReduction.signedRatio,
      hourFromCompound: DISPLAY_DRIVE_MESHES.hourReduction.signedRatio,
      netFromTraversedMeshes: netRatioFromMeshes,
      reportedNetConstant: DISPLAY_DRIVE_NET_RATIO,
      sameDisplayedDirection: netRatioFromMeshes > 0,
      runtimePath:
        "qMinute=q-q0; qCompound=meshA.signedRatio*qMinute; qHour=meshB.signedRatio*qCompound",
    },
    meshes: meshRows,
    gears: gearRows,
    members: {
      staff: {
        ...DISPLAY_DRIVE.staff,
        path: objectPath(
          opts.geometry.minuteGeometry.getObjectByName(
            "phase4b:centerStaff:stepped",
          ) ?? opts.geometry.minuteGeometry,
        ),
      },
      minuteTube: {
        ...DISPLAY_DRIVE.minuteTube,
        integralStem: {
          visibleSection: { ...DISPLAY_DRIVE.minuteStem },
          handTenon: { ...DISPLAY_DRIVE.minuteTenon },
        },
        cannonOuterR: g.cannonPinion.outerR,
        path: objectPath(opts.geometry.meshes.minuteTube),
      },
      compound: {
        axis: { ...DISPLAY_DRIVE.offAxis },
        bearing: { ...DISPLAY_DRIVE.compoundBearing },
        path: objectPath(opts.geometry.compoundMotion),
      },
      hourPipe: {
        ...DISPLAY_DRIVE.hourPipe,
        hubCoupling: { ...DISPLAY_DRIVE.hourHubCoupling },
        hourWheelOuterR: g.hourWheel.outerR,
        path: objectPath(opts.geometry.meshes.hourPipe),
      },
    },
    connections: {
      minuteAnnulusToIntegralStem: {
        commonMesh: objectPath(opts.geometry.meshes.minuteTube),
        transitionZ: DISPLAY_DRIVE.minuteStem.z0,
        continuous: true,
      },
      minuteStemToCollar: {
        claimed: !!minuteCollarBounds,
        axialEngagement: minuteCollarBounds
          ? axialOverlap(
              DISPLAY_DRIVE.minuteTenon.z0,
              DISPLAY_DRIVE.minuteTenon.z1,
              minuteCollarBounds.minZ,
              minuteCollarBounds.maxZ,
            )
          : 0,
        matchingRadius: DISPLAY_DRIVE.minuteTenon.outerR,
      },
      minuteStemToHand: {
        claimed: !!minuteHandBounds,
        axialEngagement: minuteHandBounds
          ? axialOverlap(
              DISPLAY_DRIVE.minuteTenon.z0,
              DISPLAY_DRIVE.minuteTenon.z1,
              minuteHandBounds.minZ,
              minuteHandBounds.maxZ,
            )
          : 0,
        matchingRadius: DISPLAY_DRIVE.minuteTenon.outerR,
      },
      hourPipeToHubCoupling: {
        commonOwner: objectPath(opts.geometry.hourMotion),
        axialOverlap: axialOverlap(
          DISPLAY_DRIVE.hourPipe.z0,
          DISPLAY_DRIVE.hourPipe.z1,
          DISPLAY_DRIVE.hourHubCoupling.z0,
          DISPLAY_DRIVE.hourHubCoupling.z1,
        ),
        radialOverlap:
          DISPLAY_DRIVE.hourHubCoupling.shoulderOuterR -
          DISPLAY_DRIVE.hourPipe.innerR,
      },
      hourCouplingToCollar: {
        claimed: !!hourCollarBounds,
        axialEngagement: hourCollarBounds
          ? axialOverlap(
              DISPLAY_DRIVE.hourHubCoupling.z0,
              DISPLAY_DRIVE.hourHubCoupling.z1,
              hourCollarBounds.minZ,
              hourCollarBounds.maxZ,
            )
          : 0,
        matchingRadius: DISPLAY_DRIVE.hourHubCoupling.neckOuterR,
      },
      hourCouplingToHand: {
        claimed: !!hourHandBounds,
        axialEngagement: hourHandBounds
          ? axialOverlap(
              DISPLAY_DRIVE.hourHubCoupling.z0,
              DISPLAY_DRIVE.hourHubCoupling.z1,
              hourHandBounds.minZ,
              hourHandBounds.maxZ,
            )
          : 0,
        matchingRadius: DISPLAY_DRIVE.hourHubCoupling.neckOuterR,
      },
      coaxialRunningGap:
        DISPLAY_DRIVE.hourHubCoupling.innerR -
        DISPLAY_DRIVE.minuteTube.outerR,
      interpretation:
        "rigid runtime press/collet fits; hand-setting and slip torque are not claimed",
    },
    containment: {
      minuteInnerPreserved:
        DISPLAY_DRIVE.minuteTube.innerR >= f.minuteReserveInnerR - 1e-12,
      minuteOuterPreserved:
        (cannonMeasured?.outerR ?? g.cannonPinion.outerR) <=
        f.minuteReserveOuterR + 1e-12,
      minuteZPreserved:
        DISPLAY_DRIVE.minuteTube.z0 >= f.minuteReserveZ0 - 1e-12 &&
        DISPLAY_DRIVE.minuteTube.z1 <= f.minuteReserveZ1 + 1e-12,
      minuteIntegralStemInsideAcceptedHub:
        DISPLAY_DRIVE.minuteStem.outerR <= 0.11 + 1e-12 &&
        DISPLAY_DRIVE.minuteTenon.outerR <= 0.08 + 1e-12 &&
        DISPLAY_DRIVE.minuteTenon.z1 <= f.visibleMaxZ + 1e-12,
      hourInnerPreserved:
        DISPLAY_DRIVE.hourPipe.innerR >= f.hourReserveInnerR - 1e-12,
      hourOuterPreserved:
        (hourWheelMeasured?.outerR ?? g.hourWheel.outerR) <=
        f.hourReserveOuterR + 1e-12,
      hourZStrictSubset:
        DISPLAY_DRIVE.hourPipe.z0 >= f.hourReserveZ0 - 1e-12 &&
        DISPLAY_DRIVE.hourPipe.z1 <= f.hourReserveZ1 + 1e-12,
      hourHubCouplingInsideAcceptedHub:
        DISPLAY_DRIVE.hourHubCoupling.shoulderOuterR <= 0.5 + 1e-12 &&
        DISPLAY_DRIVE.hourHubCoupling.z1 <= f.visibleMaxZ + 1e-12,
      coaxialMembersSeparated:
        DISPLAY_DRIVE.hourHubCoupling.innerR -
          DISPLAY_DRIVE.minuteStem.outerR >
        0,
      compoundFootInsideInterface:
        DISPLAY_DRIVE.centerDistance + DISPLAY_DRIVE.compoundBearing.footR <=
        f.interfaceOuterR + 1e-12,
      intermediateRadialMax:
        DISPLAY_DRIVE.centerDistance + g.minuteWheel.outerR,
    },
    clearances: {
      interfaceTopToLowerGear:
        DISPLAY_DRIVE.lowerFace.z0 - f.interfaceTopZ,
      nearestFrozenCentralTopToLowerGear:
        DISPLAY_DRIVE.lowerFace.z0 - f.nearestFrozenCentralTopZ,
      upperGearToChapter:
        f.chapterGeometryBottomZ - DISPLAY_DRIVE.upperFace.z1,
      upperGearToHourHand:
        f.hourHandBottomZ - DISPLAY_DRIVE.upperFace.z1,
      sapphireRemaining: f.sapphireInnerZ - f.visibleMaxZ,
      renderedCannonToMinuteEnvelope:
        f.minuteReserveOuterR -
        (cannonMeasured?.outerR ?? g.cannonPinion.outerR),
      renderedHourWheelToHourEnvelope:
        f.hourReserveOuterR -
        (hourWheelMeasured?.outerR ?? g.hourWheel.outerR),
      renderedMinuteWheelBoreToStud:
        (minuteWheelMeasured?.boreR ?? g.minuteWheel.boreR) -
        DISPLAY_DRIVE.compoundBearing.studR,
      renderedMinutePinionBoreToStud:
        (minutePinionMeasured?.boreR ?? g.minutePinion.boreR) -
        DISPLAY_DRIVE.compoundBearing.studR,
    },
    bearingPassage: {
      rotatingJournalR: DISPLAY_DRIVE.staff.journalR,
      requiredStationaryBoreR: DISPLAY_DRIVE.staff.requiredStationaryBoreR,
      radialRunningClearance:
        DISPLAY_DRIVE.staff.requiredStationaryBoreR -
        DISPLAY_DRIVE.staff.journalR,
      existingJewelApertureR: DISPLAY_DRIVE.staff.existingJewelApertureR,
      jewelRadialClearance:
        DISPLAY_DRIVE.staff.existingJewelApertureR -
        DISPLAY_DRIVE.staff.journalR,
      note:
        "The stationary bridge/support implementation must provide this coaxial bore; this layer supplies only the center-owned rotating staff.",
    },
    presentation: opts.activePresentation
      ? { active: true, ...opts.activePresentation }
      : { active: false },
    runtime: opts.sample,
    ownership: {
      stationary: objectPath(opts.geometry.stationaryOwner),
      minute: objectPath(opts.geometry.centerOutput),
      compound: objectPath(opts.geometry.compoundMotion),
      hour: objectPath(opts.geometry.hourMotion),
      claims: Array.from(opts.claims.values()).map((claim) => ({
        role: claim.role,
        owner: claim.owner,
        name: claim.object.name,
        path: objectPath(claim.object),
      })),
    },
    bounds: {
      stationary: bounds(opts.geometry.stationaryOwner),
      minute: bounds(opts.geometry.minuteGeometry),
      compound: bounds(opts.geometry.compoundMotion),
      hour: bounds(opts.geometry.hourGeometry),
      minuteClaims: bounds(opts.geometry.minuteClaims),
      hourClaims: bounds(opts.geometry.hourClaims),
    },
    notClaimed: [...DISPLAY_DRIVE_NOT_CLAIMED],
  };
}
