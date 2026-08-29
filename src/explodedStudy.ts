import * as THREE from "three";

export type ExplodedLayerSpec = {
  id: string;
  label: string;
  offsetZ: number;
  objects: THREE.Object3D[];
  safeWhy: string;
  revealWhileExploded?: THREE.Object3D[];
};

type GeometrySignature = {
  pathAtAuthority: string;
  positionCount: number;
  positionChecksum: number;
  indexCount: number | null;
  bounds: { min: number[]; max: number[] };
};

type CarrierRecord = {
  layer: ExplodedLayerSpec;
  object: THREE.Object3D;
  parent: THREE.Object3D;
  siblingIndex: number;
  carrier: THREE.Group;
  position: number[];
  quaternion: number[];
  scale: number[];
  geometries: Map<THREE.Mesh, GeometrySignature>;
};

export type ExplodedStudy = {
  set: (value: number) => void;
  value: () => number;
  report: () => ReturnType<typeof makeReport>;
};

const objectPath = (object: THREE.Object3D): string => {
  const rows: string[] = [];
  let current: THREE.Object3D | null = object;
  while (current) {
    rows.push(current.name || current.type);
    current = current.parent;
  }
  return rows.reverse().join("/");
};

const attributeChecksum = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): number => {
  let sum = 0;
  for (let i = 0; i < attribute.count; i++) {
    for (let j = 0; j < attribute.itemSize; j++) {
      sum += attribute.getComponent(i, j) * (1 + ((i * attribute.itemSize + j) % 101));
    }
  }
  return sum;
};

const geometrySignature = (mesh: THREE.Mesh): GeometrySignature => {
  const position = mesh.geometry.getAttribute("position");
  if (!position) throw new Error(`Annex E1 mesh has no positions: ${objectPath(mesh)}`);
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox;
  if (!bounds) throw new Error(`Annex E1 mesh has no bounds: ${objectPath(mesh)}`);
  return {
    pathAtAuthority: objectPath(mesh),
    positionCount: position.count,
    positionChecksum: attributeChecksum(position),
    indexCount: mesh.geometry.getIndex()?.count ?? null,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  };
};

const exactTransform = (record: CarrierRecord): boolean =>
  JSON.stringify(record.object.position.toArray()) === JSON.stringify(record.position) &&
  JSON.stringify(record.object.quaternion.toArray()) === JSON.stringify(record.quaternion) &&
  JSON.stringify(record.object.scale.toArray()) === JSON.stringify(record.scale);

const geometryUnchanged = (record: CarrierRecord): boolean => {
  for (const [mesh, authority] of record.geometries) {
    const current = geometrySignature(mesh);
    if (
      authority.positionCount !== current.positionCount ||
      authority.positionChecksum !== current.positionChecksum ||
      authority.indexCount !== current.indexCount ||
      JSON.stringify(authority.bounds) !== JSON.stringify(current.bounds)
    ) return false;
  }
  return true;
};

function makeReport(
  value: number,
  records: CarrierRecord[],
  layers: ExplodedLayerSpec[],
  installed: boolean,
) {
  const eased = value * value * (3 - 2 * value);
  const objectRows = records.map((record) => ({
    layer: record.layer.id,
    object: record.object.name,
    authorityParent: record.parent.name,
    authoritySiblingIndex: record.siblingIndex,
    carrier: record.carrier.name,
    carrierInstalled: record.carrier.parent === record.parent,
    currentParent: record.object.parent?.name ?? null,
    canonicalOffsetZ: record.layer.offsetZ,
    currentOffsetZ: record.carrier.position.z,
    localTransformUnchanged: exactTransform(record),
    geometryUnchanged: geometryUnchanged(record),
    geometryMeshes: record.geometries.size,
  }));
  return {
    annex: "E1",
    disposition: "PRESENTATION ANNEX E1 — EXPLODED ASSEMBLY CLOSED",
    presentationOnly: true,
    scalar: { value, range: [0, 1], interpolation: "smoothstep", eased },
    assembledEquivalence: {
      exactAtZero: value === 0 && !installed && objectRows.every((row) =>
        row.currentParent === row.authorityParent && row.localTransformUnchanged && row.geometryUnchanged),
      carriersAbsentFromProductPathsAtZero: value === 0 && !installed,
      geometryMutated: false,
      materialMutated: false,
      localKinematicsMutated: false,
    },
    layers: layers.map((layer) => ({
      id: layer.id,
      label: layer.label,
      canonicalOffsetZ: layer.offsetZ,
      objects: layer.objects.map((object) => object.name),
      safeWhy: layer.safeWhy,
    })),
    objects: objectRows,
    centralReference: {
      offsetZ: 0,
      owners: ["calibre", "barrel/center/third/fourth/escape/pallet/balance", "midcase/lugs/crown/strap"],
      reason: "keeps the going train, gold barrel, balance, case silhouette and attachment thesis immediately legible",
    },
    stageTwoFeasibility: {
      feasible: true,
      recommendedStaticOnlyInitially: true,
      cleanRigidLayers: [
        "trainBridge + its upper bearing groups",
        "balanceCock + balance upper bearing",
        "escapeFinger + escape/pallet upper bearings",
        "complete barrel pose as one arbor/drum/wheel compound",
        "complete center, third and fourth pose groups as individual wheel/pinion/arbor compounds",
        "complete escape, pallet and balance pose groups as rigid escapement compounds",
        "mainplate + lower bearing hardware",
      ],
      keepRigid: [
        "each wheel/pinion/arbor motion group",
        "barrel drum, wheel and arbor relationship",
        "pallet lever, staff, stones, fork and riser",
        "balance rim, roller, seated impulse jewel, hairspring and staff",
        "Phase-4B center output, real motion works and claimed hand mounts",
        "each jewel/setting/endstone/retainer bearing assembly",
      ],
      caution: "deeper separation should remain a static mechanism pose and pair each moved bridge with its upper bearings; it must not imply runtime meshing while axially separated",
    },
  };
}

export function createExplodedStudy(layers: ExplodedLayerSpec[]): ExplodedStudy {
  const seen = new Set<THREE.Object3D>();
  const records: CarrierRecord[] = [];
  for (const layer of layers) {
    for (const object of layer.objects) {
      if (seen.has(object)) throw new Error(`Annex E1 duplicate target: ${object.name}`);
      seen.add(object);
      const parent = object.parent;
      if (!parent) throw new Error(`Annex E1 target has no parent: ${object.name}`);
      for (const other of seen) {
        if (other !== object && (other.getObjectById(object.id) || object.getObjectById(other.id))) {
          throw new Error(`Annex E1 nested targets are not allowed: ${other.name} / ${object.name}`);
        }
      }
      const geometries = new Map<THREE.Mesh, GeometrySignature>();
      object.traverse((candidate) => {
        if (candidate instanceof THREE.Mesh) geometries.set(candidate, geometrySignature(candidate));
      });
      const carrier = new THREE.Group();
      carrier.name = `annexE1:carrier:${layer.id}:${records.length}`;
      carrier.userData.presentationOnly = true;
      records.push({
        layer,
        object,
        parent,
        siblingIndex: parent.children.indexOf(object),
        carrier,
        position: object.position.toArray(),
        quaternion: object.quaternion.toArray(),
        scale: object.scale.toArray(),
        geometries,
      });
    }
  }

  const revealState = new Map<THREE.Object3D, boolean>();
  let installed = false;
  let current = 0;

  const install = (): void => {
    if (installed) return;
    for (const record of records) {
      if (record.object.parent !== record.parent) {
        throw new Error(`Annex E1 authority parent drift before install: ${record.object.name}`);
      }
      record.carrier.position.set(0, 0, 0);
      record.parent.add(record.carrier);
      record.carrier.add(record.object);
      const at = record.parent.children.indexOf(record.carrier);
      record.parent.children.splice(at, 1);
      record.parent.children.splice(record.siblingIndex, 0, record.carrier);
    }
    for (const layer of layers) {
      for (const object of layer.revealWhileExploded ?? []) {
        if (!revealState.has(object)) revealState.set(object, object.visible);
        object.visible = true;
      }
    }
    installed = true;
  };

  const restore = (): void => {
    if (!installed) return;
    for (const record of records) record.carrier.position.set(0, 0, 0);
    for (const record of records) {
      record.carrier.remove(record.object);
      record.parent.add(record.object);
      record.carrier.removeFromParent();
      const at = record.parent.children.indexOf(record.object);
      record.parent.children.splice(at, 1);
      record.parent.children.splice(record.siblingIndex, 0, record.object);
    }
    for (const [object, visible] of revealState) object.visible = visible;
    revealState.clear();
    installed = false;
  };

  const set = (input: number): void => {
    const value = THREE.MathUtils.clamp(Number.isFinite(input) ? input : 0, 0, 1);
    current = value;
    if (value === 0) {
      restore();
      return;
    }
    install();
    const eased = value * value * (3 - 2 * value);
    for (const record of records) record.carrier.position.z = record.layer.offsetZ * eased;
  };

  return {
    set,
    value: () => current,
    report: () => makeReport(current, records, layers, installed),
  };
}
