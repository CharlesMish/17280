import * as THREE from "three";
import { finishedStructure, hoopShape, vecToShape } from "./structureGeometry";
import { offsetConvexExact } from "./accommodationMath";
import type { EnclosurePlan } from "./enclosurePlan";
import { ENC } from "./enclosureSpec";

export type EncMaterials = {
  frontCarrier: THREE.MeshPhysicalMaterial;
  rearCarrier: THREE.MeshPhysicalMaterial;
  sapphire: THREE.MeshPhysicalMaterial;
  gasket: THREE.MeshPhysicalMaterial;
  fastener: THREE.MeshBasicMaterial;
  seat: THREE.MeshBasicMaterial;
  truth: THREE.MeshLambertMaterial;
  ghostFront: THREE.MeshBasicMaterial;
  ghostRear: THREE.MeshBasicMaterial;
  lineSeat: THREE.LineBasicMaterial;
};

export function createEncMaterials(): EncMaterials {
  return {
    frontCarrier: new THREE.MeshPhysicalMaterial({ color: 0x4a5058, metalness: 0.42, roughness: 0.5 }),
    rearCarrier: new THREE.MeshPhysicalMaterial({ color: 0x3e444c, metalness: 0.4, roughness: 0.52 }),
    sapphire: new THREE.MeshPhysicalMaterial({
      // Phase 5D-A: neutral, high-transmission sapphire.  The enclosure slab
      // and the frozen outer sculpture are legitimate contiguous portions of
      // one crystal. Pass A audition: product-visible opacity is 1;
      // transmission/ior/thickness remain unchanged.
      color: 0xf6f9fa,
      metalness: 0.0,
      roughness: 0.025,
      transmission: 0.97,
      thickness: 0.25,
      ior: 1.46,
      attenuationColor: 0xf7fafb,
      attenuationDistance: 15,
      specularIntensity: 0.62,
      specularColor: 0xd7e1e7,
      envMapIntensity: 0.78,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true,
      alphaToCoverage: false,
      dithering: false,
      side: THREE.FrontSide,
    }),
    gasket: new THREE.MeshPhysicalMaterial({ color: 0x2a2a2c, metalness: 0.05, roughness: 0.85 }),
    fastener: new THREE.MeshBasicMaterial({ color: 0xf0c14b }),
    seat: new THREE.MeshBasicMaterial({ color: 0x7ec8ff }),
    truth: new THREE.MeshLambertMaterial({ color: 0xc8ccd0 }),
    ghostFront: new THREE.MeshBasicMaterial({
      color: 0x9ad4ff,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    ghostRear: new THREE.MeshBasicMaterial({
      color: 0x9ae0c0,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    lineSeat: new THREE.LineBasicMaterial({ color: 0xffdd66 }),
  };
}

function loop(pts: { x: number; y: number }[], z: number, mat: THREE.LineBasicMaterial): THREE.LineLoop {
  const v = pts.map((p) => new THREE.Vector3(p.x, p.y, z));
  v.push(v[0].clone());
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(v), mat);
}

export function buildFrontCarrier(plan: EnclosurePlan, mats: EncMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "FrontCarrierPose";
  const f = plan.front;
  const h = f.carrierTopZ - f.registerZ0;
  const ring = finishedStructure(hoopShape(f.carrierOuter, f.carrierInner), h, mats.frontCarrier, mats.frontCarrier, 18);
  ring.position.z = (f.carrierTopZ + f.registerZ0) / 2;
  ring.name = "enc:frontCarrier";
  g.add(ring);
  return g;
}

export function buildRearCarrier(plan: EnclosurePlan, mats: EncMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "RearCarrierPose";
  const r = plan.rear;
  const h = r.holderShoulderZ - r.carrierBottomZ;
  // Plan carrierInner stays on the exhibition (gasket support). The rendered
  // bore is set back to the existing exhibition→footprint seat land (0.08 mm)
  // so this hoop does not share the finished caseback inner wall.
  const ring = finishedStructure(hoopShape(r.carrierOuter, r.gasketOuter), h, mats.rearCarrier, mats.rearCarrier, 18);
  ring.position.z = (r.holderShoulderZ + r.carrierBottomZ) / 2;
  ring.name = "enc:rearCarrier";
  g.add(ring);
  const shoulder = finishedStructure(
    hoopShape(r.holderShoulderOuter, r.holderShoulderInner),
    0.12,
    mats.rearCarrier,
    mats.rearCarrier,
    16,
  );
  shoulder.position.z = r.holderShoulderZ - 0.04;
  shoulder.name = "enc:holderShoulder";
  g.add(shoulder);
  return g;
}

export function buildFrontCrystal(plan: EnclosurePlan, mats: EncMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "FrontCrystalPose";
  const f = plan.front;
  const slab = finishedStructure(vecToShape(f.footprint), f.minThick, mats.sapphire, mats.sapphire, 18);
  slab.position.z = f.inner.z + f.minThick / 2;
  slab.name = "enc:frontSapphire";
  g.add(slab);
  const capShape = offsetConvexExact(f.footprint, -ENC.frontCapInset);
  const cap = finishedStructure(vecToShape(capShape), f.provisionalCap, mats.sapphire, mats.sapphire, 16);
  cap.position.z = f.inner.z + f.minThick + f.provisionalCap / 2;
  cap.name = "enc:frontSapphireCap";
  g.add(cap);
  return g;
}

export function buildRearCrystal(plan: EnclosurePlan, mats: EncMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "RearCrystalPose";
  const r = plan.rear;
  const slab = finishedStructure(vecToShape(r.footprint), r.minThick, mats.sapphire, mats.sapphire, 18);
  slab.position.z = r.inner.z - r.minThick / 2;
  slab.name = "enc:rearSapphire";
  g.add(slab);
  const capShape = offsetConvexExact(r.footprint, -ENC.rearCapInset);
  const cap = finishedStructure(vecToShape(capShape), r.provisionalCap, mats.sapphire, mats.sapphire, 16);
  cap.position.z = r.inner.z - r.minThick - r.provisionalCap / 2;
  cap.name = "enc:rearSapphireCap";
  g.add(cap);
  return g;
}

export function buildGaskets(plan: EnclosurePlan, mats: EncMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "enc:gaskets";
  const f = plan.front;
  const frontGasket = finishedStructure(
    hoopShape(f.gasketOuter, f.gasketInner),
    f.gasket,
    mats.gasket,
    mats.gasket,
    14,
  );
  frontGasket.position.z = f.seatZ + f.gasket / 2;
  frontGasket.name = "enc:frontGasketReserve";
  g.add(frontGasket);
  const r = plan.rear;
  const rearGasket = finishedStructure(
    hoopShape(r.gasketOuter, r.gasketInner),
    r.gasket,
    mats.gasket,
    mats.gasket,
    14,
  );
  rearGasket.position.z = r.seatZ - r.gasket / 2;
  rearGasket.name = "enc:rearGasketReserve";
  g.add(rearGasket);
  return g;
}

export function buildClosureDebug(plan: EnclosurePlan, mats: EncMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = "ClosureDebugPose";
  g.add(loop(plan.front.footprint, plan.front.inner.z + 0.01, mats.lineSeat));
  g.add(loop(plan.rear.exhibition, plan.rear.inner.z - 0.01, mats.lineSeat));
  const fSeat = finishedStructure(
    hoopShape(plan.front.footprint, plan.front.opening),
    0.03,
    mats.seat,
    mats.seat,
    12,
  );
  fSeat.position.z = plan.front.seatZ + 0.02;
  g.add(fSeat);
  const rSeat = finishedStructure(
    hoopShape(plan.rear.footprint, plan.rear.exhibition),
    0.03,
    mats.seat,
    mats.seat,
    12,
  );
  rSeat.position.z = plan.rear.seatZ - 0.02;
  g.add(rSeat);
  for (const a of plan.closure.fastenerAxes) {
    const h = a.z1 - a.z0;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(ENC.fastenerReserveR, ENC.fastenerReserveR, h, 10), mats.fastener);
    m.rotation.x = Math.PI / 2;
    m.position.set(a.xy.x, a.xy.y, (a.z0 + a.z1) / 2);
    m.name = a.id;
    g.add(m);
  }
  return g;
}
