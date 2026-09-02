import * as THREE from "three";
import { EXT_FINISH } from "./exteriorSpec";

export type ExteriorFinishKind =
  | "bezelSatin"
  | "midSatin"
  | "casebackSatin"
  | "waist"
  | "polish"
  | "lugTop"
  | "lugSide"
  | "lugTerm"
  | "lugBore"
  | "crown"
  | "crownShoulder"
  | "crownCap"
  | "flute"
  | "socket"
  | "sapphire";

export type ExteriorMaterials = {
  maps: {
    brush: THREE.CanvasTexture;
    frost: THREE.CanvasTexture;
    circular: THREE.CanvasTexture;
  };
  bezelSatin: THREE.MeshPhysicalMaterial;
  midSatin: THREE.MeshPhysicalMaterial;
  casebackSatin: THREE.MeshPhysicalMaterial;
  lugTop: THREE.MeshPhysicalMaterial;
  lugSide: THREE.MeshPhysicalMaterial;
  lugTerm: THREE.MeshPhysicalMaterial;
  lugBore: THREE.MeshPhysicalMaterial;
  waist: THREE.MeshPhysicalMaterial;
  polish: THREE.MeshPhysicalMaterial;
  crown: THREE.MeshPhysicalMaterial;
  crownShoulder: THREE.MeshPhysicalMaterial;
  crownCap: THREE.MeshPhysicalMaterial;
  crownFlute: THREE.MeshPhysicalMaterial;
  socket: THREE.MeshPhysicalMaterial;
  satin: THREE.MeshPhysicalMaterial;
  recess: THREE.MeshPhysicalMaterial;
  sapphire: THREE.MeshPhysicalMaterial;
  ghost: THREE.MeshBasicMaterial;
  kernel: THREE.MeshBasicMaterial;
  keepout: THREE.MeshBasicMaterial;
  axis: THREE.MeshBasicMaterial;
  truth: THREE.MeshLambertMaterial;
  section: THREE.MeshLambertMaterial;
  idMid: THREE.MeshBasicMaterial;
  idWaist: THREE.MeshBasicMaterial;
  idCaseback: THREE.MeshBasicMaterial;
  idSocket: THREE.MeshBasicMaterial;
  idCrown: THREE.MeshBasicMaterial;
  idBevel: THREE.MeshBasicMaterial;
  idStep: THREE.MeshBasicMaterial;
  idOther: THREE.MeshBasicMaterial;
  idBezel: THREE.MeshBasicMaterial;
  idPolish: THREE.MeshBasicMaterial;
  idLugTop: THREE.MeshBasicMaterial;
  idLugSide: THREE.MeshBasicMaterial;
  idLugTerm: THREE.MeshBasicMaterial;
  idLugBore: THREE.MeshBasicMaterial;
  idCrownCap: THREE.MeshBasicMaterial;
  idFlute: THREE.MeshBasicMaterial;
  idShoulder: THREE.MeshBasicMaterial;
};

function canvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) paint(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.userData.phase5dB2Sampling = "band-limited procedural roughness with trilinear mip minification";
  tex.needsUpdate = true;
  return tex;
}

/** Hairline brush. Grain runs along U so anisotropy can follow it. */
function directionalBrush(size = 512, freq = 44, amp = 3): THREE.CanvasTexture {
  return canvasTexture(size, (ctx, n) => {
    const img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      const v = y / n;
      const wave = Math.sin(v * freq * Math.PI * 2) + Math.sin(v * 13 * Math.PI * 2 + 0.7) * 0.28;
      for (let x = 0; x < n; x++) {
        const cross = Math.sin((x / n) * 5 * Math.PI * 2 + v * Math.PI * 2) * 0.35;
        const value = 148 + wave * amp + cross;
        const i = (y * n + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(136, Math.min(160, value));
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function frostMap(size = 256): THREE.CanvasTexture {
  return canvasTexture(size, (ctx, n) => {
    const img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / n;
        const v = y / n;
        const n1 = Math.sin(u * 29 * Math.PI * 2 + 0.4) * Math.sin(v * 27 * Math.PI * 2);
        const n2 = Math.sin((u + v) * 11 * Math.PI * 2 + 1.1);
        const value = 148 + n1 * 3.2 + n2 * 1.4;
        const i = (y * n + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(138, Math.min(158, value));
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function circularBrush(size = 512, freq = 56, amp = 4): THREE.CanvasTexture {
  return canvasTexture(size, (ctx, n) => {
    const img = ctx.createImageData(n, n);
    const cx = n * 0.5;
    const cy = n * 0.5;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const r = Math.hypot(x - cx, y - cy);
        const grain = Math.sin(r * (freq / n) * Math.PI * 2);
        const drift = Math.sin(r * (17 / n) * Math.PI * 2 + 0.8) * 0.9;
        const v = 148 + grain * amp + drift;
        const i = (y * n + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(136, Math.min(160, v));
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function steel(opts: THREE.MeshPhysicalMaterialParameters): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    metalness: 0.96,
    envMapIntensity: 0.8,
    ...opts,
  });
}

export function createExteriorMaterials(): ExteriorMaterials {
  const maps = {
    brush: directionalBrush(),
    frost: frostMap(),
    circular: circularBrush(),
  };

  const bezelSatin = steel({
    color: EXT_FINISH.bezelColor,
    roughness: EXT_FINISH.bezelRough,
    roughnessMap: maps.brush,
    anisotropy: 0,
    anisotropyRotation: 0,
    envMapIntensity: 0.74,
  });
  const midSatin = steel({
    color: EXT_FINISH.midColor,
    roughness: EXT_FINISH.midRough,
    roughnessMap: maps.brush,
    anisotropy: EXT_FINISH.anisotropy,
    anisotropyRotation: 0,
    envMapIntensity: 0.72,
  });
  const casebackSatin = steel({
    color: EXT_FINISH.casebackColor,
    roughness: EXT_FINISH.casebackRough,
    roughnessMap: maps.circular,
    anisotropy: 0.28,
    anisotropyRotation: 0,
    envMapIntensity: 0.68,
  });
  const waist = steel({
    color: EXT_FINISH.waistColor,
    roughness: EXT_FINISH.waistRough,
    roughnessMap: maps.frost,
    metalness: 0.9,
    envMapIntensity: 0.52,
  });
  const polish = steel({
    color: EXT_FINISH.polishColor,
    roughness: EXT_FINISH.polishRough,
    metalness: 0.94,
    clearcoat: 0.32,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.86,
  });
  const lugTop = steel({
    color: EXT_FINISH.lugTopColor,
    roughness: EXT_FINISH.lugTopRough,
    roughnessMap: maps.brush,
    anisotropy: EXT_FINISH.anisotropy,
    envMapIntensity: 0.74,
  });
  const lugSide = steel({
    color: EXT_FINISH.lugSideColor,
    roughness: EXT_FINISH.lugSideRough,
    roughnessMap: maps.brush,
    anisotropy: 0.3,
    envMapIntensity: 0.8,
  });
  const lugTerm = steel({
    color: EXT_FINISH.lugTermColor,
    roughness: EXT_FINISH.polishRough,
    metalness: 0.94,
    clearcoat: 0.28,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.88,
  });
  const lugBore = steel({
    color: EXT_FINISH.lugBoreColor,
    roughness: EXT_FINISH.lugBoreRough,
    roughnessMap: maps.frost,
    metalness: 0.88,
    envMapIntensity: 0.45,
  });
  const crown = steel({
    color: EXT_FINISH.crownColor,
    roughness: EXT_FINISH.crownRough,
    roughnessMap: maps.brush,
    anisotropy: 0.32,
    envMapIntensity: 0.76,
  });
  const crownShoulder = steel({
    color: EXT_FINISH.crownShoulderColor,
    roughness: EXT_FINISH.crownShoulderRough,
    metalness: 0.93,
    clearcoat: 0.18,
    clearcoatRoughness: 0.1,
    envMapIntensity: 0.82,
  });
  const crownCap = steel({
    color: EXT_FINISH.crownCapColor,
    roughness: EXT_FINISH.crownCapRough,
    metalness: 0.9,
    clearcoat: 0.16,
    clearcoatRoughness: 0.12,
    envMapIntensity: 0.7,
  });
  const crownFlute = steel({
    color: EXT_FINISH.fluteColor,
    roughness: EXT_FINISH.fluteRough,
    roughnessMap: maps.frost,
    metalness: 0.86,
    envMapIntensity: 0.38,
  });

  return {
    maps,
    bezelSatin,
    midSatin,
    casebackSatin,
    lugTop,
    lugSide,
    lugTerm,
    lugBore,
    waist,
    polish,
    crown,
    crownShoulder,
    crownCap,
    crownFlute,
    socket: midSatin,
    satin: midSatin,
    recess: waist,
    sapphire: new THREE.MeshPhysicalMaterial({
      color: 0xf7fafb,
      metalness: 0,
      roughness: 0.018,
      transmission: 0.98,
      thickness: 0,
      ior: 1.46,
      attenuationColor: 0xf7fafb,
      attenuationDistance: 15,
      specularIntensity: 0.66,
      specularColor: 0xd5e0e7,
      envMapIntensity: 0.45,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true,
      alphaToCoverage: false,
      dithering: false,
      side: THREE.FrontSide,
    }),
    ghost: new THREE.MeshBasicMaterial({
      color: 0x9ab4c8,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    kernel: new THREE.MeshBasicMaterial({
      color: 0xf0c14b,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
    keepout: new THREE.MeshBasicMaterial({
      color: 0xff4fd8,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    axis: new THREE.MeshBasicMaterial({ color: 0xffcc55 }),
    truth: new THREE.MeshLambertMaterial({ color: 0xc9cdd2 }),
    section: new THREE.MeshLambertMaterial({
      color: 0xffd36a,
      emissive: 0x7a5214,
      emissiveIntensity: 0.4,
      side: THREE.DoubleSide,
    }),
    idMid: new THREE.MeshBasicMaterial({ color: 0x2f80ed }),
    idWaist: new THREE.MeshBasicMaterial({ color: 0x27ae60 }),
    idCaseback: new THREE.MeshBasicMaterial({ color: 0xf4d03f }),
    idSocket: new THREE.MeshBasicMaterial({ color: 0xe74c3c }),
    idCrown: new THREE.MeshBasicMaterial({ color: 0x8e44ad }),
    idBevel: new THREE.MeshBasicMaterial({ color: 0xe67e22 }),
    idStep: new THREE.MeshBasicMaterial({ color: 0x1abc9c }),
    idOther: new THREE.MeshBasicMaterial({ color: 0x3a3d42 }),
    idBezel: new THREE.MeshBasicMaterial({ color: 0x5dade2 }),
    idPolish: new THREE.MeshBasicMaterial({ color: 0xf4f6f7 }),
    idLugTop: new THREE.MeshBasicMaterial({ color: 0xe67e22 }),
    idLugSide: new THREE.MeshBasicMaterial({ color: 0xaf7ac5 }),
    idLugTerm: new THREE.MeshBasicMaterial({ color: 0xf5b7b1 }),
    idLugBore: new THREE.MeshBasicMaterial({ color: 0x145a32 }),
    idCrownCap: new THREE.MeshBasicMaterial({ color: 0xd2b4de }),
    idFlute: new THREE.MeshBasicMaterial({ color: 0x196f3d }),
    idShoulder: new THREE.MeshBasicMaterial({ color: 0xbb8fce }),
  };
}

export function finishIdMaterial(kind: ExteriorFinishKind, mats: ExteriorMaterials): THREE.Material | null {
  switch (kind) {
    case "bezelSatin":
      return mats.idBezel;
    case "midSatin":
    case "socket":
      return mats.idMid;
    case "casebackSatin":
      return mats.idCaseback;
    case "waist":
      return mats.idWaist;
    case "polish":
      return mats.idPolish;
    case "lugTerm":
      return mats.idLugTerm;
    case "lugTop":
      return mats.idLugTop;
    case "lugSide":
      return mats.idLugSide;
    case "lugBore":
      return mats.idLugBore;
    case "crown":
      return mats.idCrown;
    case "crownShoulder":
      return mats.idShoulder;
    case "crownCap":
      return mats.idCrownCap;
    case "flute":
      return mats.idFlute;
    case "sapphire":
      return null;
  }
}
