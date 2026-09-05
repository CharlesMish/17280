import * as THREE from "three";
import type { ExteriorMaterials } from "./exteriorMaterials";
import type { FinishMaterials } from "./finishMaterials";
import type { ReadoutMaterials } from "./readoutMaterials";
import type { StrapMaterials } from "./strapMaterials";

export const REFINEMENT_STAGES = ["baseline", "materials", "final", "graphite-materials", "graphite", "graphite-finish", "graphite-sapphire"] as const;
export type RefinementStage = typeof REFINEMENT_STAGES[number];
export type RefinementOptics = { ior?: number; thickness?: number; specularIntensity?: number };

/** Presentation overrides are reversible; engineering materials stay authored as before. */
export function createRefinement(opts: {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  exterior: ExteriorMaterials;
  finish: FinishMaterials;
  readout: ReadoutMaterials;
  strap: StrapMaterials;
  pad: THREE.MeshPhysicalMaterial;
  sapphire: THREE.MeshPhysicalMaterial;
}) {
  const originals = new Map<THREE.MeshPhysicalMaterial, THREE.MeshPhysicalMaterial>();
  const names = new Map<THREE.MeshPhysicalMaterial, string>();
  const remember = (material: unknown) => {
    if (material instanceof THREE.MeshPhysicalMaterial && !originals.has(material)) {
      originals.set(material, material.clone());
    }
  };
  for (const group of [opts.exterior, opts.finish, opts.readout, opts.strap]) Object.values(group).forEach(remember);
  remember(opts.pad);
  remember(opts.sapphire);
  opts.scene.traverse(object => {
    if (object instanceof THREE.Mesh) (Array.isArray(object.material) ? object.material : [object.material]).forEach(remember);
  });
  for (const [family, group] of Object.entries({ exterior: opts.exterior, finish: opts.finish, readout: opts.readout, strap: opts.strap })) {
    for (const [name, material] of Object.entries(group)) {
      if (material instanceof THREE.MeshPhysicalMaterial && !names.has(material)) names.set(material, `${family}.${name}`);
    }
  }
  names.set(opts.sapphire, "enclosure.sapphire");
  names.set(opts.pad, "holder.pad");
  // Rotated bridge clones share their texture but not their material identity.
  const cockColor = opts.finish.cockFace.color.getHex();
  for (const [material, original] of originals) {
    if (!names.has(material) && original.roughnessMap === opts.finish.maps.cotes) {
      names.set(material, original.color.getHex() === cockColor ? "finish.cockFace.rotated" : "finish.bridgeFace.rotated");
    }
  }
  const environments = new Map<string, THREE.WebGLRenderTarget>();
  const getEnvironment = (graphite = false, local: "crystal" | "hero-edge" | null = null) => {
    const key = `${graphite}:${local}`;
    const cached = environments.get(key);
    if (cached) return cached.texture;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(graphite ? 0x595959 : 0x535963);
    const cards: [number, number, number, number, number, number][] = graphite ? [
      [42, 26, 0xe6e6e3, 0, 20, 12],
      [18, 28, 0xc8c9c8, -18, 5, 10],
      [14, 24, 0xdcdcd9, 18, 8, 8],
      [30, 22, 0x9b9c9c, 0, 3, -22],
      [24, 14, 0x9e9e9c, 0, -18, -4],
      [3, 24, 0xf5f2ea, -10, 9, 17],
      [7, 20, 0x202122, 12, -3, 15],
    ] : [
      [42, 26, 0xe3e7ec, 0, 20, 12],
      [18, 28, 0xbfcbd8, -18, 5, 10],
      [14, 24, 0xd5dce4, 18, 8, 8],
      [30, 22, 0x929eae, 0, 3, -22],
      [24, 14, 0x929da9, 0, -18, -4],
    ];
    // Local strips affect only their assigned surfaces; the scene environment stays fixed.
    if (local === "crystal") cards.push([3, 32, 0xe3e7ec, -18, 0, 12]);
    if (local === "hero-edge") cards.push([3, 26, 0xffffff, -10, 9, 17]);
    for (const [w, h, color, x, y, z] of cards) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color }));
      if (local === "hero-edge" && color === 0xffffff) mesh.material.color.multiplyScalar(2);
      mesh.position.set(x, y, z);
      mesh.lookAt(0, 0, 0);
      scene.add(mesh);
    }
    const pmrem = new THREE.PMREMGenerator(opts.renderer);
    const target = pmrem.fromScene(scene, 0.04);
    target.texture.userData.refinementEnvironment = {
      base: graphite ? "graphite" : "materials",
      local,
      strip: local === "crystal" ? { size: [3, 32], position: [-18, 0, 12], color: "e3e7ec", intensity: 1 }
        : local === "hero-edge" ? { size: [3, 26], position: [-10, 9, 17], color: "ffffff", intensity: 2 } : null,
      target: [0, 0, 0], blur: 0.04,
    };
    environments.set(key, target);
    pmrem.dispose();
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
    return target.texture;
  };
  const restore = () => { for (const [material, original] of originals) material.copy(original); };
  // Roughness textures are non-color data. Preserve grain while targeting the
  // actual scalar × green-channel mean, rather than the nominal scalar alone.
  const meanGreen = (map: THREE.Texture | null): number => {
    if (!map || !(map.image instanceof HTMLCanvasElement)) return 1;
    const context = map.image.getContext("2d");
    if (!context) return 1;
    const data = context.getImageData(0, 0, map.image.width, map.image.height).data;
    let sum = 0;
    for (let i = 1; i < data.length; i += 4) sum += data[i];
    return sum / (data.length / 4) / 255;
  };
  const means = new Map<THREE.Texture | null, number>();
  const satin = (material: THREE.MeshPhysicalMaterial, target: number) => {
    if (!means.has(material.roughnessMap)) means.set(material.roughnessMap, meanGreen(material.roughnessMap));
    material.roughness = Math.min(1, target / means.get(material.roughnessMap)!);
  };
  const apply = (stage: RefinementStage, optics: RefinementOptics = {}, view = "") => {
    restore();
    if (stage === "baseline") return;
    const e = opts.exterior;
    for (const material of [e.bezelSatin, e.midSatin, e.casebackSatin, e.lugTop, e.lugSide, e.crown]) satin(material, 0.32);
    for (const material of [e.polish, e.lugTerm, e.crownShoulder, e.crownCap]) {
      material.roughness = 0.2;
      material.clearcoat = 0.12;
    }
    for (const [material] of originals) {
      if (material.roughnessMap === opts.finish.maps.cotes) {
        satin(material, 0.31);
        material.anisotropy = 0.3;
        material.color.setHex(0x858e9a);
      }
    }
    satin(opts.finish.plateFace, 0.38);
    opts.finish.plateFace.color.setHex(0x626c78);
    opts.finish.bridgeEdge.roughness = 0.19;
    opts.finish.bridgeEdge.clearcoat = 0.2;
    opts.finish.bridgeEdge.envMapIntensity = 0.95;
    opts.finish.wheelEdge.roughness = 0.14;
    opts.finish.wheelEdge.envMapIntensity = 0.95;
    for (const material of [opts.strap.rubber, opts.strap.rubberEdge]) {
      satin(material, 0.55);
      material.clearcoat = 0;
      material.sheen = 0.03;
    }
    opts.strap.rubber.color.setHex(0x292d33);
    opts.strap.rubberEdge.color.setHex(0x333941);
    for (const material of [e.sapphire, opts.sapphire]) {
      material.ior = optics.ior ?? (stage === "graphite" ? 1.77 : 1.46);
      material.thickness = 0;
      material.opacity = 1;
      material.specularIntensity = 0.2;
    }
    if (stage === "final" || stage.startsWith("graphite")) {
      for (const material of [opts.readout.hourFace, opts.readout.minuteFace]) {
        material.color.setHex(0x438bd7);
        material.metalness = 0.48;
        material.roughness = 0.3;
      }
      for (const material of [opts.readout.hourEdge, opts.readout.minuteEdge]) material.roughness = 0.18;
      opts.pad.color.setHex(0x424b57);
      opts.pad.roughness = 0.6;
      opts.pad.metalness = 0.7;
    }
    if (stage.startsWith("graphite")) {
      for (const material of [e.bezelSatin, e.midSatin, e.casebackSatin, e.lugTop, e.lugSide, e.crown]) {
        material.color.setHex(0x74787a);
        satin(material, 0.30);
      }
      for (const material of [e.waist, e.lugBore, e.socket, e.crownFlute]) material.color.setHex(0x292b2d);
      for (const material of [e.polish, e.lugTerm, e.crownShoulder]) {
        material.color.setHex(0x929596);
        material.roughness = 0.12;
        material.clearcoat = 0;
      }
      e.crownCap.color.setHex(0x686b6c);
      satin(e.crownCap, 0.26);
      for (const [material, original] of originals) {
        if (original.roughnessMap !== opts.finish.maps.cotes) continue;
        const cock = original.color.getHex() === cockColor;
        material.color.setHex(cock ? 0xa5a49f : 0x929593);
        satin(material, cock ? 0.29 : 0.32);
      }
      opts.finish.plateFace.color.setHex(0x5d605f);
      opts.finish.bridgeEdge.color.setHex(0xc5c6c3);
      opts.finish.bridgeEdge.roughness = 0.12;
      opts.finish.bridgeEdge.clearcoat = 0;
      // The large warm mass is the barrel, not the steel train wheels.
      opts.finish.barrelFace.color.setHex(0xc18a38);
      satin(opts.finish.barrelFace, 0.24);
      opts.finish.barrelEdge.color.setHex(0xe2b967);
      opts.finish.barrelEdge.roughness = 0.10;
      opts.finish.barrel.color.setHex(0x9c702e);
      opts.strap.rubber.color.setHex(0x1c1d1e);
      opts.strap.rubberEdge.color.setHex(0x292a2b);
      if (stage === "graphite") {
        for (const material of [e.sapphire, opts.sapphire]) {
          material.thickness = optics.thickness ?? 0;
          material.specularIntensity = optics.specularIntensity ?? 0.4;
        }
      }
    }
    if (stage === "graphite-finish" || stage === "graphite-sapphire") {
      // Only existing exterior highlight facets; satin faces retain the base treatment.
      for (const material of [e.polish, e.lugTerm, e.crownShoulder]) {
        material.roughness = 0.085;
        material.clearcoat = 0.10;
        material.clearcoatRoughness = 0.055;
        if (view === "r1FinalHero") material.envMap = getEnvironment(false, "hero-edge");
      }
      for (const material of [e.sapphire, opts.sapphire]) {
        material.ior = 1.77;
        material.thickness = 0.04;
        material.specularIntensity = 0.4;
        material.envMap = getEnvironment(false, "crystal");
        if (stage === "graphite-sapphire") {
          // Preserve the base's normal-incidence F0 in linear color space,
          // while restoring the stock dielectric grazing limit (F90 = 1).
          // This is a coated appearance approximation, not a coating simulation.
          material.specularColor.multiplyScalar(0.4);
          material.specularIntensity = 1;
        }
      }
    }
    opts.scene.environment = getEnvironment(stage === "graphite");
  };
  const reportedMean = (map: THREE.Texture | null) => {
    if (!means.has(map)) means.set(map, meanGreen(map));
    return means.get(map)!;
  };
  return { apply, restore, report: () => [...originals.keys()].map(material => ({
    name: names.get(material) ?? (material.name || "unclassified"),
    color: material.color.getHexString(), roughness: material.roughness,
    mapMean: reportedMean(material.roughnessMap), metalness: material.metalness,
    ior: material.ior, opacity: material.opacity, transmission: material.transmission,
    thickness: material.thickness, specularIntensity: material.specularIntensity,
    specularColorLinear: material.specularColor.toArray(),
    reflectionEnvironment: material.envMap?.userData.refinementEnvironment ?? null,
    envMapIntensity: material.envMapIntensity, clearcoat: material.clearcoat,
    clearcoatRoughness: material.clearcoatRoughness,
  })) };
}
