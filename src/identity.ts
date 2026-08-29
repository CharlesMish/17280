import * as THREE from "three";
import type { Vec2 } from "./spec";
import type { ExteriorPlan } from "./exteriorPlan";

export const REAR_IDENTITY_COPY = "2.4 Hz · 17\u2009280 · TWO HANDS";
export const REAR_IDENTITY_CANONICAL_COPY = "2.4 Hz · 17 280 · TWO HANDS";
const REAR_DECIMAL_MIN_DIAMETER_MM = 0.08;

type AttributeProof = {
  count: number;
  itemSize: number;
  checksum: number;
};

type HostProof = {
  mesh: string;
  position: AttributeProof;
  index: AttributeProof | null;
  bounds: { min: number[]; max: number[] };
};

export type IdentityBinding = {
  report: () => ReturnType<typeof identityReport>;
  finishMaps: { material: THREE.MeshPhysicalMaterial; roughnessMap: THREE.Texture | null }[];
};

function attrProof(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): AttributeProof {
  let checksum = 0;
  for (let i = 0; i < attribute.count; i++) {
    for (let j = 0; j < attribute.itemSize; j++) {
      checksum += attribute.getComponent(i, j) * (1 + ((i * attribute.itemSize + j) % 97));
    }
  }
  return { count: attribute.count, itemSize: attribute.itemSize, checksum };
}

function hostProof(mesh: THREE.Mesh): HostProof {
  const position = mesh.geometry.getAttribute("position");
  if (!position) throw new Error(`${mesh.name}: missing position attribute`);
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  if (!box) throw new Error(`${mesh.name}: missing bounds`);
  return {
    mesh: mesh.name,
    position: attrProof(position),
    index: mesh.geometry.getIndex() ? attrProof(mesh.geometry.getIndex()!) : null,
    bounds: { min: box.min.toArray(), max: box.max.toArray() },
  };
}

function exactlyEqual(a: HostProof, b: HostProof): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function textureFromCanvas(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for render-only identity maps");
  return { canvas, ctx };
}

function strokeCushionArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  const half = 0.58;
  ctx.beginPath();
  ctx.moveTo(cx - radius * half, cy + radius * 0.08);
  ctx.bezierCurveTo(
    cx - radius * 0.42,
    cy - radius * 0.5,
    cx + radius * 0.42,
    cy - radius * 0.5,
    cx + radius * half,
    cy + radius * 0.08,
  );
  ctx.stroke();
}

function crownMaps(): { roughness: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const size = 1024;
  const paint = (bump: boolean): THREE.CanvasTexture => {
    const { canvas, ctx } = makeCanvas(size);
    ctx.fillStyle = bump ? "rgb(128,128,128)" : "rgb(102,102,102)";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = bump ? "rgb(166,166,166)" : "rgb(255,255,255)";
    // CircleGeometry UV spans the full 3.0392 mm cap diameter. These values
    // resolve to a 1.02 mm overall mark and a 0.068 mm physical stroke.
    ctx.lineWidth = size * 0.0224;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate((i * Math.PI * 2) / 3);
      ctx.translate(0, -size * 0.105);
      strokeCushionArc(ctx, 0, 0, size * 0.12);
      ctx.restore();
    }
    return textureFromCanvas(canvas);
  };
  return { roughness: paint(false), bump: paint(true) };
}

function planarUv(mesh: THREE.Mesh, box: THREE.Box3): void {
  const pos = mesh.geometry.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  const sx = Math.max(1e-9, box.max.x - box.min.x);
  const sy = Math.max(1e-9, box.max.y - box.min.y);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - box.min.x) / sx;
    uv[i * 2 + 1] = (pos.getY(i) - box.min.y) / sy;
  }
  mesh.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  mesh.geometry.deleteAttribute("tangent");
  try {
    mesh.geometry.computeTangents();
  } catch {
    // The cap still renders correctly when an extrusion cannot form tangents.
  }
}

function southIntersection(poly: Vec2[], x: number): number {
  let y = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x) || Math.abs(b.x - a.x) < 1e-12) continue;
    const t = (x - a.x) / (b.x - a.x);
    y = Math.min(y, a.y + (b.y - a.y) * t);
  }
  if (!Number.isFinite(y)) throw new Error(`No south contour intersection at x=${x}`);
  return y;
}

function casebackMaps(mesh: THREE.Mesh, plan: ExteriorPlan): {
  roughness: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  letterHeightMm: number;
  trackingEm: number;
  placement: { centerY: number; x0: number; x1: number };
} {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox!;
  const size = 2048;
  const letterHeightMm = 0.38;
  const trackingEm = 0.15;
  const sx = box.max.x - box.min.x;
  const sy = box.max.y - box.min.y;
  const toPxX = (x: number) => ((x - box.min.x) / sx) * size;
  const toPxY = (y: number) => size - ((y - box.min.y) / sy) * size;
  const fontPx = (letterHeightMm / sy) * size;
  // The south fastener is at x=-0.627, y=-10.274. The copy sits outward of
  // that pocket, wholly on the visible cap band and clear of the exhibition
  // opening/barrel field.
  const centerY = -10.1;
  const contourRange = (poly: Vec2[]) => ({
    min: Math.min(...poly.map((point) => point.x)),
    max: Math.max(...poly.map((point) => point.x)),
  });
  const outerRange = contourRange(plan.contours.casebackOuter);
  const innerRange = contourRange(plan.contours.casebackInner);
  const x0 = Math.max(0.2, outerRange.min + 0.02, innerRange.min + 0.02);
  const x1 = Math.min(10.8, outerRange.max - 0.02, innerRange.max - 0.02);
  const pathY = (x: number): number => {
    const outer = southIntersection(plan.contours.casebackOuter, x);
    const inner = southIntersection(plan.contours.casebackInner, x);
    const nominal = inner + (outer - inner) * 0.46;
    return Math.max(outer + 0.25, Math.min(inner - 0.25, nominal));
  };

  // Advance along the actual cushion contour rather than in flat texture X.
  // This keeps the visible tracking and baseline stable as the south band
  // turns up toward the flank.
  const pathSamples = 1025;
  const path = Array.from({ length: pathSamples }, (_, i) => {
    const t = i / (pathSamples - 1);
    const x = x1 + (x0 - x1) * t;
    const y = pathY(x);
    const slope = (pathY(x + 0.005) - pathY(x - 0.005)) / 0.01;
    return { x: toPxX(x), y: toPxY(y), angle: Math.atan(slope), distance: 0 };
  });
  for (let i = 1; i < path.length; i++) {
    path[i].distance = path[i - 1].distance + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  const pathLength = path[path.length - 1].distance;
  const atDistance = (distance: number) => {
    let lo = 0;
    let hi = path.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (path[mid].distance < distance) lo = mid;
      else hi = mid;
    }
    const a = path[lo];
    const b = path[hi];
    const span = Math.max(1e-9, b.distance - a.distance);
    const t = (distance - a.distance) / span;
    return {
      x: THREE.MathUtils.lerp(a.x, b.x, t),
      y: THREE.MathUtils.lerp(a.y, b.y, t),
      angle: THREE.MathUtils.lerp(a.angle, b.angle, t),
    };
  };

  const rough = makeCanvas(size);
  const bump = makeCanvas(size);
  bump.ctx.fillStyle = "rgb(128,128,128)";
  bump.ctx.fillRect(0, 0, size, size);
  const roughPixels = rough.ctx.createImageData(size, size);
  const cx = size * 0.5;
  const cy = size * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = Math.hypot(x - cx, y - cy);
      const satin = Math.max(45, Math.min(
        53,
        49 + Math.sin(r * 0.086) * 1.3 + Math.sin(r * 0.026 + 0.8) * 0.3,
      ));
      roughPixels.data[i] = roughPixels.data[i + 1] = roughPixels.data[i + 2] = satin;
      roughPixels.data[i + 3] = 255;
    }
  }
  rough.ctx.putImageData(roughPixels, 0, 0);

  const glyphs = Array.from(REAR_IDENTITY_COPY);
  const measure = rough.ctx;
  measure.font = `500 ${fontPx}px Arial, Helvetica, sans-serif`;
  const widths = glyphs.map((glyph) => measure.measureText(glyph).width);
  const trackingPx = fontPx * trackingEm;
  const natural = widths.reduce((a, b) => a + b, 0) + trackingPx * (glyphs.length - 1);
  const scaleX = Math.min(1, pathLength / natural);
  const drawGlyphs = (ctx: CanvasRenderingContext2D, floor: string, shoulder: string): void => {
    ctx.font = `500 ${fontPx}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.imageSmoothingEnabled = true;
    const precisionContext = ctx as CanvasRenderingContext2D & { textRendering?: string };
    precisionContext.textRendering = "geometricPrecision";
    ctx.lineWidth = 0.8;
    ctx.lineJoin = "round";
    ctx.strokeStyle = shoulder;
    ctx.fillStyle = floor;
    const drawnLength = natural * scaleX;
    let cursor = (pathLength - drawnLength) * 0.5;
    for (let i = 0; i < glyphs.length; i++) {
      const advance = widths[i] * scaleX;
      const point = atDistance(cursor + advance * 0.5);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(point.angle);
      // The rear camera sees the -Z face with reversed screen-X handedness.
      // Mirror each glyph once in the texture so the physical back reads
      // normally with 12 up.
      ctx.scale(-scaleX, 1);
      ctx.strokeText(glyphs[i], 0, 0);
      ctx.fillText(glyphs[i], 0, 0);
      if (glyphs[i] === ".") {
        const metric = ctx.measureText(glyphs[i]);
        const centerX = (metric.actualBoundingBoxRight - metric.actualBoundingBoxLeft) * 0.5;
        const centerY = (metric.actualBoundingBoxDescent - metric.actualBoundingBoxAscent) * 0.5;
        const radiusPx = (REAR_DECIMAL_MIN_DIAMETER_MM / sy) * size * 0.5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();
      }
      ctx.restore();
      cursor += advance + trackingPx * scaleX;
    }
  };
  // A 0.8 px shoulder at 2048 square is roughly 0.01 mm on the host. It
  // gives the groove a resolved edge without increasing its visible scale or
  // introducing a new color contribution.
  drawGlyphs(rough.ctx, "rgb(102,102,102)", "rgb(82,82,82)");
  drawGlyphs(bump.ctx, "rgb(184,184,184)", "rgb(154,154,154)");
  const roughness = textureFromCanvas(rough.canvas);
  const bumpMap = textureFromCanvas(bump.canvas);
  roughness.anisotropy = 16;
  bumpMap.anisotropy = 16;
  return {
    roughness,
    bump: bumpMap,
    letterHeightMm,
    trackingEm,
    placement: { centerY, x0, x1 },
  };
}

function physicalMaterials(mesh: THREE.Mesh): THREE.MeshPhysicalMaterial[] {
  const rows = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return rows.map((material) => {
    if (!(material instanceof THREE.MeshPhysicalMaterial)) {
      throw new Error(`${mesh.name}: identity host is not MeshPhysicalMaterial`);
    }
    return material;
  });
}

function identityReport(binding: {
  crownBefore: HostProof;
  crownAfter: HostProof;
  rearBefore: HostProof;
  rearAfter: HostProof;
  stepMarked: boolean;
  rearPlacement: { centerY: number; x0: number; x1: number };
}) {
  return {
    system: "Identity System 1",
    faceUnsigned: true,
    crown: {
      host: "ext:crown-cap",
      graphic: "three identical open cushion arcs at 120 degrees",
      symmetryOrder: 3,
      letters: false,
      nominalDiameterMm: 1.02,
      nominalStrokeMm: 0.068,
      treatment: "same-steel roughness + recessed bump map",
      geometryUnchanged: exactlyEqual(binding.crownBefore, binding.crownAfter),
      before: binding.crownBefore,
      after: binding.crownAfter,
    },
    rear: {
      host: "ext:caseback",
      excludedHosts: ["ext:caseback-step", "enc:rearCarrier", "ext:sapphireOpticalOwnership"],
      canonicalCopy: REAR_IDENTITY_CANONICAL_COPY,
      renderedCopy: REAR_IDENTITY_COPY,
      letterHeightMm: 0.38,
      trackingEm: 0.15,
      placement: { region: "south / 6 o'clock cap band, bases outward, 12-up", ...binding.rearPlacement },
      treatment: "same-steel roughness + recessed bump map on cap material slot only",
      refinement: {
        glyphRaster: "geometric-precision canvas coverage with controlled edge shaping",
        decimalMinimumDiameterMm: REAR_DECIMAL_MIN_DIAMETER_MM,
        decimalRaster: "ASCII decimal receives a minimum circular floor in the existing same-steel maps",
        pathPlacement: "1025-sample cushion-contour arc-length placement",
        filtering: "2048-square mipmapped linear texture, anisotropy 16",
      },
      noOverlayMesh: true,
      noDepthOverride: true,
      stepUnmarked: !binding.stepMarked,
      geometryUnchangedExceptOptionalUv: exactlyEqual(binding.rearBefore, binding.rearAfter),
      before: binding.rearBefore,
      after: binding.rearAfter,
    },
    colorContribution: "none",
    proudGeometry: false,
  };
}

export function bindIdentity(body: THREE.Group, plan: ExteriorPlan): IdentityBinding {
  const crown = body.getObjectByName("ext:crown-cap");
  const rear = body.getObjectByName("ext:caseback");
  const step = body.getObjectByName("ext:caseback-step");
  if (!(crown instanceof THREE.Mesh) || !(rear instanceof THREE.Mesh) || !(step instanceof THREE.Mesh)) {
    throw new Error("Identity System 1 hosts are missing");
  }
  const crownBefore = hostProof(crown);
  const rearBefore = hostProof(rear);

  const crownMap = crownMaps();
  const crownBase = physicalMaterials(crown)[0];
  const crownIdentity = crownBase.clone();
  crownIdentity.name = "identity:crown-cap:same-steel";
  crownIdentity.roughness = 0.55;
  crownIdentity.roughnessMap = crownMap.roughness;
  crownIdentity.bumpMap = crownMap.bump;
  crownIdentity.bumpScale = -0.08;
  crownIdentity.needsUpdate = true;
  crown.material = crownIdentity;

  rear.geometry.computeBoundingBox();
  planarUv(rear, rear.geometry.boundingBox!);
  const rearMap = casebackMaps(rear, plan);
  const rearMaterials = physicalMaterials(rear);
  const rearFace = rearMaterials[0].clone();
  rearFace.name = "identity:caseback-cap:same-steel";
  rearFace.roughness = 0.9;
  rearFace.roughnessMap = rearMap.roughness;
  rearFace.bumpMap = rearMap.bump;
  rearFace.bumpScale = -0.07;
  rearFace.needsUpdate = true;
  rear.material = Array.isArray(rear.material)
    ? [rearFace, ...rearMaterials.slice(1)]
    : rearFace;

  crown.userData.identityHost = "crown-emblem";
  rear.userData.identityHost = "rear-technical-arc";
  rear.userData.identityFaceMaterialSlot = 0;
  const crownAfter = hostProof(crown);
  const rearAfter = hostProof(rear);
  const stepMarked = Boolean(step.userData.identityHost);
  const data = { crownBefore, crownAfter, rearBefore, rearAfter, stepMarked, rearPlacement: rearMap.placement };
  return {
    report: () => identityReport(data),
    finishMaps: [
      { material: crownIdentity, roughnessMap: crownIdentity.roughnessMap },
      { material: rearFace, roughnessMap: rearFace.roughnessMap },
    ],
  };
}
