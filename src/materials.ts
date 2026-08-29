import * as THREE from "three";

export type MaterialSet = {
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
  screw: THREE.MeshPhysicalMaterial;
  jewel: THREE.MeshPhysicalMaterial;
  stone: THREE.MeshPhysicalMaterial;
};

function metal(opts: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    metalness: 1,
    roughness: 0.25,
    envMapIntensity: 1.05,
    ...opts,
  });
}

function circularGrain(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  const img = ctx.createImageData(size, size);
  const cx = size * 0.5;
  const cy = size * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const ring = Math.sin(r * 5.4) * 0.5 + 0.5;
      const swirl = Math.sin(r * 0.8 + ang * 3) * 0.08;
      const v = 168 + ring * 28 + swirl * 12;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function createMaterials(): MaterialSet {
  const grain = circularGrain();
  const grainFine = circularGrain(384);

  const jewel = new THREE.MeshPhysicalMaterial({
    color: 0x6e1028,
    metalness: 0.05,
    roughness: 0.08,
    transmission: 0.45,
    thickness: 0.35,
    ior: 1.76,
    attenuationColor: 0x9a1840,
    attenuationDistance: 0.4,
    transparent: true,
    envMapIntensity: 1.15,
  });

  return {
    wheelFace: metal({
      color: 0xc0c4cb,
      roughness: 0.34,
      roughnessMap: grain,
      clearcoat: 0.08,
      clearcoatRoughness: 0.45,
      envMapIntensity: 1.12,
    }),
    wheelEdge: metal({
      color: 0xdfe3e8,
      roughness: 0.1,
      clearcoat: 0.55,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.2,
    }),
    escapeFace: metal({
      color: 0xb2b7c0,
      roughness: 0.32,
      roughnessMap: grainFine,
      envMapIntensity: 1.0,
    }),
    pinion: metal({
      color: 0xd5dae0,
      roughness: 0.1,
      clearcoat: 0.5,
      clearcoatRoughness: 0.06,
    }),
    arbor: metal({
      color: 0xe6e9ee,
      roughness: 0.07,
      clearcoat: 0.6,
      clearcoatRoughness: 0.05,
    }),
    barrelFace: metal({
      color: 0xc09a52,
      roughness: 0.33,
      roughnessMap: grain,
      envMapIntensity: 0.96,
    }),
    barrelEdge: metal({
      color: 0xddc078,
      roughness: 0.14,
      clearcoat: 0.28,
      clearcoatRoughness: 0.12,
    }),
    barrel: metal({
      color: 0xb8924c,
      roughness: 0.28,
      envMapIntensity: 0.95,
    }),
    spring: metal({
      color: 0xa47d38,
      roughness: 0.42,
      metalness: 0.9,
    }),
    balanceFace: metal({
      color: 0xccc2b0,
      roughness: 0.3,
      roughnessMap: grainFine,
      envMapIntensity: 1.0,
    }),
    balanceEdge: metal({
      color: 0xddd4c4,
      roughness: 0.12,
      clearcoat: 0.4,
      clearcoatRoughness: 0.1,
    }),
    balance: metal({
      color: 0xc9bdaa,
      roughness: 0.2,
      clearcoat: 0.22,
    }),
    hairspring: metal({
      color: 0x8aa3bc,
      roughness: 0.12,
      metalness: 0.97,
      envMapIntensity: 1.25,
    }),
    screw: metal({
      color: 0xb08d4c,
      roughness: 0.16,
      clearcoat: 0.35,
    }),
    jewel,
    stone: new THREE.MeshPhysicalMaterial({
      color: 0x8f1434,
      metalness: 0.04,
      roughness: 0.07,
      transmission: 0.4,
      thickness: 0.28,
      ior: 1.76,
      attenuationColor: 0xb01c42,
      attenuationDistance: 0.35,
      transparent: true,
      envMapIntensity: 1.2,
    }),
  };
}

export function disposeMaterials(set: MaterialSet): void {
  for (const material of Object.values(set)) {
    material.dispose();
  }
}
