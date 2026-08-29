import * as THREE from "three";
import { createSpurOutline, extrudeCentered } from "./geometry";
import {
  DISPLAY_DRIVE,
  DISPLAY_DRIVE_GEARS,
  type DisplayDriveGearSpec,
} from "./displayDriveSpec";

export type DisplayDriveMaterials = {
  staff: THREE.MeshPhysicalMaterial;
  minute: THREE.MeshPhysicalMaterial;
  compound: THREE.MeshPhysicalMaterial;
  hour: THREE.MeshPhysicalMaterial;
  stationary: THREE.MeshPhysicalMaterial;
};

export type DisplayDriveGeometry = {
  root: THREE.Group;
  centerOutput: THREE.Group;
  minuteGeometry: THREE.Group;
  minuteClaims: THREE.Group;
  fixedRoot: THREE.Group;
  offAxisPose: THREE.Group;
  stationaryOwner: THREE.Group;
  compoundMotion: THREE.Group;
  hourMotion: THREE.Group;
  hourGeometry: THREE.Group;
  hourClaims: THREE.Group;
  meshes: {
    cannonPinion: THREE.Mesh;
    minuteWheel: THREE.Mesh;
    minutePinion: THREE.Mesh;
    hourWheel: THREE.Mesh;
    minuteTube: THREE.Mesh;
    hourPipe: THREE.Mesh;
    hourHubCoupling: THREE.Mesh;
    supportStud: THREE.Mesh;
  };
};

export function createDisplayDriveMaterials(): DisplayDriveMaterials {
  return {
    staff: new THREE.MeshPhysicalMaterial({
      name: "phase4b:material:centerStaff",
      color: 0xd5d9df,
      metalness: 0.9,
      roughness: 0.22,
    }),
    minute: new THREE.MeshPhysicalMaterial({
      name: "phase4b:material:minuteDrive",
      color: 0xc5cbd4,
      metalness: 0.88,
      roughness: 0.24,
    }),
    compound: new THREE.MeshPhysicalMaterial({
      name: "phase4b:material:compoundWheel",
      color: 0xb99648,
      metalness: 0.86,
      roughness: 0.28,
    }),
    hour: new THREE.MeshPhysicalMaterial({
      name: "phase4b:material:hourDrive",
      color: 0x9fa8b5,
      metalness: 0.9,
      roughness: 0.23,
    }),
    stationary: new THREE.MeshPhysicalMaterial({
      name: "phase4b:material:stationaryBearing",
      color: 0x5f6875,
      metalness: 0.76,
      roughness: 0.34,
    }),
  };
}

function cylinderZ(
  radius: number,
  z0: number,
  z1: number,
  material: THREE.Material,
  name: string,
  segments = 32,
): THREE.Mesh {
  const height = z1 - z0;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, segments),
    material,
  );
  mesh.name = name;
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = (z0 + z1) / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function tubeZ(
  innerR: number,
  outerR: number,
  z0: number,
  z1: number,
  material: THREE.Material,
  name: string,
  segments = 48,
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const height = z1 - z0;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: segments,
  });
  geometry.translate(0, 0, -height / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.z = (z0 + z1) / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function steppedMinuteMemberZ(
  material: THREE.Material,
  name: string,
  segments = 48,
): THREE.Mesh {
  const tube = DISPLAY_DRIVE.minuteTube;
  const stem = DISPLAY_DRIVE.minuteStem;
  const tenon = DISPLAY_DRIVE.minuteTenon;
  const centerZ = (tube.z0 + tenon.z1) / 2;
  const localZ = (z: number) => z - centerZ;
  const profile = [
    new THREE.Vector2(tube.innerR, localZ(tube.z0)),
    new THREE.Vector2(tube.outerR, localZ(tube.z0)),
    new THREE.Vector2(tube.outerR, localZ(tube.z1)),
    new THREE.Vector2(stem.outerR, localZ(stem.z0)),
    new THREE.Vector2(stem.outerR, localZ(stem.z1)),
    new THREE.Vector2(tenon.outerR, localZ(tenon.z0)),
    new THREE.Vector2(tenon.outerR, localZ(tenon.z1)),
    new THREE.Vector2(0, localZ(tenon.z1)),
    new THREE.Vector2(0, localZ(stem.z0)),
    new THREE.Vector2(tube.innerR, localZ(tube.z1)),
    new THREE.Vector2(tube.innerR, localZ(tube.z0)),
  ];
  const geometry = new THREE.LatheGeometry(profile, segments);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = centerZ;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.phase4b = {
    kind: "continuous-minute-member",
    annularSection: { ...tube },
    integralStem: {
      visibleSection: { ...stem },
      handTenon: { ...tenon },
    },
  };
  return mesh;
}

function steppedHourCouplingZ(
  material: THREE.Material,
  name: string,
  segments = 48,
): THREE.Mesh {
  const coupling = DISPLAY_DRIVE.hourHubCoupling;
  const centerZ = (coupling.z0 + coupling.z1) / 2;
  const localZ = (z: number) => z - centerZ;
  const profile = [
    new THREE.Vector2(coupling.innerR, localZ(coupling.z0)),
    new THREE.Vector2(coupling.shoulderOuterR, localZ(coupling.z0)),
    new THREE.Vector2(
      coupling.shoulderOuterR,
      localZ(coupling.shoulderZ1),
    ),
    new THREE.Vector2(coupling.neckOuterR, localZ(coupling.shoulderZ1)),
    new THREE.Vector2(coupling.neckOuterR, localZ(coupling.z1)),
    new THREE.Vector2(coupling.innerR, localZ(coupling.z1)),
    new THREE.Vector2(coupling.innerR, localZ(coupling.z0)),
  ];
  const geometry = new THREE.LatheGeometry(profile, segments);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.rotation.x = Math.PI / 2;
  mesh.position.z = centerZ;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.phase4b = {
    kind: "hour-hub-collet",
    ...coupling,
  };
  return mesh;
}

function gearMesh(
  spec: DisplayDriveGearSpec,
  material: THREE.Material,
  name: string,
): THREE.Mesh {
  const shape = createSpurOutline({
    teeth: spec.teeth,
    module: spec.module,
    style: spec.style,
    bore: spec.boreR,
  });
  // `extrudeCentered(..., true)` uses Three's positive bevelSize, which grows
  // the face OD and closes the bore at both faces.  That is not a harmless
  // cosmetic chamfer here: it would push the 16T cannon outside its frozen
  // r=0.20 authority and make the compound wheels intersect their fixed stud.
  // Keep the real motion-work profiles prismatic so pitch geometry, OD, bore,
  // and the declared 0.12 mm face all remain exact.
  const geometry = extrudeCentered(shape, spec.z1 - spec.z0, false, 8);
  const position = geometry.getAttribute("position");
  let measuredBoreR = Number.POSITIVE_INFINITY;
  let measuredOuterR = 0;
  let measuredLocalZ0 = Number.POSITIVE_INFINITY;
  let measuredLocalZ1 = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const r = Math.hypot(x, y);
    measuredBoreR = Math.min(measuredBoreR, r);
    measuredOuterR = Math.max(measuredOuterR, r);
    measuredLocalZ0 = Math.min(measuredLocalZ0, position.getZ(index));
    measuredLocalZ1 = Math.max(measuredLocalZ1, position.getZ(index));
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.z = (spec.z0 + spec.z1) / 2;
  mesh.rotation.z = spec.localPhase;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.phase4b = {
    kind: "gear",
    id: spec.id,
    teeth: spec.teeth,
    module: spec.module,
    pitchR: spec.pitchR,
    rootR: spec.rootR,
    outerR: spec.outerR,
    measured: {
      boreR: measuredBoreR,
      outerR: measuredOuterR,
      localZ0: measuredLocalZ0,
      localZ1: measuredLocalZ1,
      face: measuredLocalZ1 - measuredLocalZ0,
    },
  };
  return mesh;
}

export function buildDisplayDriveGeometry(
  materials: DisplayDriveMaterials,
): DisplayDriveGeometry {
  const root = new THREE.Group();
  root.name = "Phase4BDisplayDriveRoot";

  // This group is attached by createDisplayDrive() beneath center:motion.
  // Its local -DEPTH.centerWheel compensation makes all child Z values world Z.
  const centerOutput = new THREE.Group();
  centerOutput.name = "phase4b:centerOutput";
  const minuteGeometry = new THREE.Group();
  minuteGeometry.name = "phase4b:owner:minuteDrive";
  const minuteClaims = new THREE.Group();
  minuteClaims.name = "phase4b:claims:minute";
  centerOutput.add(minuteGeometry, minuteClaims);

  const staff = new THREE.Group();
  staff.name = "phase4b:centerStaff:stepped";
  const s = DISPLAY_DRIVE.staff;
  staff.add(
    cylinderZ(
      s.lowerCouplingR,
      s.lowerCouplingZ0,
      s.lowerCouplingZ1,
      materials.staff,
      "phase4b:centerStaff:lowerCoupling",
      24,
    ),
    cylinderZ(
      s.journalR,
      s.journalZ0,
      s.journalZ1,
      materials.staff,
      "phase4b:centerStaff:runningJournal",
      32,
    ),
    cylinderZ(
      s.upperCoreR,
      s.upperCoreZ0,
      s.upperCoreZ1,
      materials.staff,
      "phase4b:centerStaff:upperCore",
      32,
    ),
  );

  const minuteTube = steppedMinuteMemberZ(
    materials.minute,
    "phase4b:minuteDrive:continuousTubeStem",
  );
  const minuteShoulder = cylinderZ(
    DISPLAY_DRIVE.minuteCouplingShoulder.r,
    DISPLAY_DRIVE.minuteCouplingShoulder.z0,
    DISPLAY_DRIVE.minuteCouplingShoulder.z1,
    materials.minute,
    "phase4b:minuteDrive:rigidShoulder",
    40,
  );
  const cannonPinion = gearMesh(
    DISPLAY_DRIVE_GEARS.cannonPinion,
    materials.minute,
    "phase4b:gear:cannonPinion:16T",
  );
  minuteGeometry.add(staff, minuteTube, minuteShoulder, cannonPinion);

  const fixedRoot = new THREE.Group();
  fixedRoot.name = "phase4b:fixedRoot";
  const offAxisPose = new THREE.Group();
  offAxisPose.name = "phase4b:offAxisPose";
  offAxisPose.position.set(DISPLAY_DRIVE.offAxis.x, DISPLAY_DRIVE.offAxis.y, 0);
  fixedRoot.add(offAxisPose);

  const stationaryOwner = new THREE.Group();
  stationaryOwner.name = "phase4b:owner:stationaryBearing";
  const b = DISPLAY_DRIVE.compoundBearing;
  const supportFoot = cylinderZ(
    b.footR,
    b.footZ0,
    b.footZ1,
    materials.stationary,
    "phase4b:compoundBearing:foot",
    28,
  );
  const supportStud = cylinderZ(
    b.studR,
    b.studZ0,
    b.studZ1,
    materials.stationary,
    "phase4b:compoundBearing:stud",
    20,
  );
  const supportCap = cylinderZ(
    b.capR,
    b.capZ0,
    b.capZ1,
    materials.stationary,
    "phase4b:compoundBearing:cap",
    28,
  );
  stationaryOwner.add(supportFoot, supportStud, supportCap);

  const compoundMotion = new THREE.Group();
  compoundMotion.name = "phase4b:owner:compoundMotion";
  const compoundSleeve = tubeZ(
    b.gearBoreR,
    b.sleeveOuterR,
    DISPLAY_DRIVE.lowerFace.z0,
    DISPLAY_DRIVE.upperFace.z1,
    materials.compound,
    "phase4b:compound:sleeve",
    28,
  );
  const minuteWheel = gearMesh(
    DISPLAY_DRIVE_GEARS.minuteWheel,
    materials.compound,
    "phase4b:gear:minuteWheel:32T",
  );
  const minutePinion = gearMesh(
    DISPLAY_DRIVE_GEARS.minutePinion,
    materials.compound,
    "phase4b:gear:minutePinion:8T",
  );
  compoundMotion.add(compoundSleeve, minuteWheel, minutePinion);
  offAxisPose.add(stationaryOwner, compoundMotion);

  const hourMotion = new THREE.Group();
  hourMotion.name = "phase4b:owner:hourMotion";
  const hourGeometry = new THREE.Group();
  hourGeometry.name = "phase4b:hourGeometry";
  const hourClaims = new THREE.Group();
  hourClaims.name = "phase4b:claims:hour";
  const hourWheel = gearMesh(
    DISPLAY_DRIVE_GEARS.hourWheel,
    materials.hour,
    "phase4b:gear:hourWheel:48T",
  );
  const hourPipe = tubeZ(
    DISPLAY_DRIVE.hourPipe.innerR,
    DISPLAY_DRIVE.hourPipe.outerR,
    DISPLAY_DRIVE.hourPipe.z0,
    DISPLAY_DRIVE.hourPipe.z1,
    materials.hour,
    "phase4b:hourDrive:pipe",
  );
  const hourHubCoupling = steppedHourCouplingZ(
    materials.hour,
    "phase4b:hourDrive:hubCoupling",
  );
  hourGeometry.add(hourWheel, hourPipe, hourHubCoupling);
  hourMotion.add(hourGeometry, hourClaims);

  root.add(fixedRoot, hourMotion);

  return {
    root,
    centerOutput,
    minuteGeometry,
    minuteClaims,
    fixedRoot,
    offAxisPose,
    stationaryOwner,
    compoundMotion,
    hourMotion,
    hourGeometry,
    hourClaims,
    meshes: {
      cannonPinion,
      minuteWheel,
      minutePinion,
      hourWheel,
      minuteTube,
      hourPipe,
      hourHubCoupling,
      supportStud,
    },
  };
}
