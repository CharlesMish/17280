import * as THREE from "three";
import { FINISH } from "./finishSpec";
import { createFinishMaps, type FinishMaps } from "./finishMaps";

export type FinishMaterials = {
  maps: FinishMaps;
  plateFace: THREE.MeshPhysicalMaterial;
  plateEdge: THREE.MeshPhysicalMaterial;
  bridgeFace: THREE.MeshPhysicalMaterial;
  cockFace: THREE.MeshPhysicalMaterial;
  bossFace: THREE.MeshPhysicalMaterial;
  bridgeEdge: THREE.MeshPhysicalMaterial;
  wheelFace: THREE.MeshPhysicalMaterial;
  wheelEdge: THREE.MeshPhysicalMaterial;
  escapeFace: THREE.MeshPhysicalMaterial;
  pinion: THREE.MeshPhysicalMaterial;
  arbor: THREE.MeshPhysicalMaterial;
  barrelFace: THREE.MeshPhysicalMaterial;
  barrelEdge: THREE.MeshPhysicalMaterial;
  barrel: THREE.MeshPhysicalMaterial;
  spring: THREE.MeshPhysicalMaterial;
  balanceFace: THREE.MeshPhysicalMaterial;
  balanceEdge: THREE.MeshPhysicalMaterial;
  balance: THREE.MeshPhysicalMaterial;
  hairspring: THREE.MeshPhysicalMaterial;
  trainScrew: THREE.MeshPhysicalMaterial;
  jewel: THREE.MeshPhysicalMaterial;
  jewelHero: THREE.MeshPhysicalMaterial;
  stone: THREE.MeshPhysicalMaterial;
  ruby: THREE.MeshPhysicalMaterial;
  rubyCap: THREE.MeshPhysicalMaterial;
  setting: THREE.MeshPhysicalMaterial;
  chaton: THREE.MeshPhysicalMaterial;
  bushing: THREE.MeshPhysicalMaterial;
  screw: THREE.MeshPhysicalMaterial;
  screwEdge: THREE.MeshPhysicalMaterial;
};

function steel(opts: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    metalness: 1,
    envMapIntensity: 1.02,
    ...opts,
  });
}

export function createFinishMaterials(): FinishMaterials {
  const maps = createFinishMaps();

  const ruby = new THREE.MeshPhysicalMaterial({
    color: FINISH.rubyColor,
    metalness: 0.02,
    roughness: 0.07,
    transmission: 0.64,
    thickness: 0.5,
    ior: 1.77,
    attenuationColor: FINISH.rubyAtten,
    attenuationDistance: 0.15,
    transparent: true,
    opacity: 1,
    envMapIntensity: 1.22,
    clearcoat: 0.45,
    clearcoatRoughness: 0.06,
  });

  const rubyCap = new THREE.MeshPhysicalMaterial({
    color: 0x5c1022,
    metalness: 0.02,
    roughness: 0.06,
    transmission: 0.52,
    thickness: 0.38,
    ior: 1.77,
    attenuationColor: 0x7a152c,
    attenuationDistance: 0.13,
    transparent: true,
    opacity: 1,
    envMapIntensity: 1.18,
    clearcoat: 0.5,
    clearcoatRoughness: 0.05,
  });

  return {
    maps,
    plateFace: steel({
      color: FINISH.plateColor,
      roughness: FINISH.plateRough,
      roughnessMap: maps.perlage,
      envMapIntensity: 0.72,
    }),
    plateEdge: steel({
      color: FINISH.plateEdgeColor,
      roughness: FINISH.plateEdgeRough,
      clearcoat: 0.42,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.08,
    }),
    bridgeFace: steel({
      color: FINISH.bridgeColor,
      roughness: FINISH.bridgeRough,
      roughnessMap: maps.cotes,
      anisotropy: FINISH.anisotropy,
      anisotropyRotation: 0,
      envMapIntensity: 0.96,
    }),
    cockFace: steel({
      color: FINISH.cockColor,
      roughness: FINISH.cockRough,
      roughnessMap: maps.cotes,
      anisotropy: 0.76,
      anisotropyRotation: 0,
      envMapIntensity: 1.04,
    }),
    bossFace: steel({
      color: 0x6a727c,
      roughness: 0.27,
      roughnessMap: maps.circularFine,
      envMapIntensity: 1.0,
      // Boss/foot faces intentionally share the accepted bridge/plate plane.
      // Give the circular land deterministic depth ownership without moving a
      // vertex or changing any mechanical envelope.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    bridgeEdge: steel({
      color: FINISH.bevelColor,
      roughness: FINISH.bevelRough,
      clearcoat: 0.78,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.28,
    }),
    wheelFace: steel({
      color: FINISH.wheelColor,
      roughness: FINISH.wheelRough,
      roughnessMap: maps.circular,
      envMapIntensity: 0.98,
    }),
    wheelEdge: steel({
      color: FINISH.wheelEdgeColor,
      roughness: 0.08,
      clearcoat: 0.58,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.16,
    }),
    escapeFace: steel({
      color: 0x6e747e,
      roughness: 0.32,
      roughnessMap: maps.circularFine,
      envMapIntensity: 0.9,
    }),
    pinion: steel({
      color: 0xb8bec6,
      roughness: 0.1,
      clearcoat: 0.48,
      clearcoatRoughness: 0.055,
    }),
    arbor: steel({
      color: 0xccd2da,
      roughness: 0.075,
      clearcoat: 0.52,
      clearcoatRoughness: 0.045,
    }),
    barrelFace: steel({
      color: FINISH.barrelFaceColor,
      roughness: FINISH.barrelRough,
      roughnessMap: maps.circularFine,
      envMapIntensity: 1.08,
    }),
    barrelEdge: steel({
      color: FINISH.barrelEdgeColor,
      roughness: 0.11,
      clearcoat: 0.38,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.14,
    }),
    barrel: steel({
      color: FINISH.barrelColor,
      roughness: 0.26,
      envMapIntensity: 1.0,
    }),
    spring: steel({
      color: 0x8a6a34,
      roughness: 0.42,
      metalness: 0.88,
    }),
    balanceFace: steel({
      color: FINISH.balanceColor,
      roughness: 0.26,
      roughnessMap: maps.circularFine,
      envMapIntensity: 1.0,
    }),
    balanceEdge: steel({
      color: 0xd0d4da,
      roughness: 0.09,
      clearcoat: 0.42,
      clearcoatRoughness: 0.06,
    }),
    balance: steel({
      color: 0xb0b6be,
      roughness: 0.16,
      clearcoat: 0.22,
    }),
    hairspring: steel({
      color: FINISH.hairspringColor,
      roughness: 0.13,
      metalness: 0.97,
      envMapIntensity: 1.2,
    }),
    trainScrew: steel({
      color: FINISH.screwColor,
      roughness: 0.15,
      clearcoat: 0.32,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.16,
    }),
    jewel: ruby,
    jewelHero: rubyCap,
    stone: rubyCap,
    ruby,
    rubyCap,
    setting: steel({
      color: FINISH.settingColor,
      roughness: 0.18,
      envMapIntensity: 1.02,
    }),
    chaton: steel({
      color: FINISH.chatonColor,
      roughness: 0.2,
      envMapIntensity: 1.02,
    }),
    bushing: steel({
      color: FINISH.bushingColor,
      roughness: 0.3,
      metalness: 0.86,
    }),
    screw: steel({
      color: FINISH.screwColor,
      roughness: 0.15,
      envMapIntensity: 1.18,
      clearcoat: 0.3,
      clearcoatRoughness: 0.1,
    }),
    screwEdge: steel({
      color: FINISH.screwEdgeColor,
      roughness: 0.08,
      clearcoat: 0.55,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.24,
    }),
  };
}

export function cloneWithRotation(src: THREE.MeshPhysicalMaterial, angle: number): THREE.MeshPhysicalMaterial {
  const m = src.clone();
  m.anisotropyRotation = angle;
  return m;
}
