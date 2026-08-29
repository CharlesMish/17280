import * as THREE from "three";

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
  tex.needsUpdate = true;
  return tex;
}

/** Fine polar roughness: high frequency, low amplitude. Not graphic rings. */
export function fineCircularRoughness(size = 512, freq = 240, amp = 7): THREE.CanvasTexture {
  return canvasTexture(size, (ctx, n) => {
    const img = ctx.createImageData(n, n);
    const cx = n * 0.5;
    const cy = n * 0.5;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        const grain = Math.sin(r * (freq / n) * Math.PI * 2 + Math.sin(a * 11) * 0.55);
        const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const speck = hash - Math.floor(hash) - 0.5;
        const v = 150 + grain * amp + speck * 6;
        const i = (y * n + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(128, Math.min(172, v));
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

/**
 * Plate perlage. Overlapping circles with a soft radial falloff so the
 * field melts at reading distance and rewards a macro.
 */
export function faintPerlage(size = 512, cells = 14): THREE.CanvasTexture {
  return canvasTexture(size, (ctx, n) => {
    ctx.fillStyle = "#7a7e84";
    ctx.fillRect(0, 0, n, n);
    const step = n / cells;
    const r = step * 0.52;
    for (let j = -1; j < cells + 2; j++) {
      for (let i = -1; i < cells + 2; i++) {
        const cx = i * step + (j % 2) * step * 0.5;
        const cy = j * step;
        const g = ctx.createRadialGradient(cx - r * 0.18, cy - r * 0.2, r * 0.05, cx, cy, r);
        g.addColorStop(0, "rgba(210,214,220,0.22)");
        g.addColorStop(0.45, "rgba(150,154,160,0.08)");
        g.addColorStop(0.82, "rgba(90,94,100,0.16)");
        g.addColorStop(1, "rgba(70,74,80,0.0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(230,234,238,0.08)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  });
}

/** Côtes de Genève: soft scalloped bands. Meant to be read along a member, not as a graphic. */
export function cotesDeGeneve(size = 512, bands = 14): THREE.CanvasTexture {
  return canvasTexture(size, (ctx, n) => {
    const img = ctx.createImageData(n, n);
    const h = n / bands;
    for (let y = 0; y < n; y++) {
      const band = Math.floor(y / h);
      const u = (y - band * h) / h;
      const scallop = 0.5 - 0.5 * Math.cos(u * Math.PI);
      const grain = Math.sin(y * 0.55) * 0.35 + Math.sin(y * 1.7) * 0.15;
      const v = 138 + scallop * 28 + grain * 6;
      for (let x = 0; x < n; x++) {
        const hash = Math.sin(x * 0.37 + y * 0.11) * 43758.5453;
        const speck = hash - Math.floor(hash) - 0.5;
        const i = (y * n + x) * 4;
        const c = Math.max(118, Math.min(178, v + speck * 5));
        img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

/** Subtle non-directional micro-roughness for satin faces. */
export function microSatin(size = 256): THREE.CanvasTexture {
  return canvasTexture(size, (ctx, n) => {
    const img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const n1 = Math.sin(x * 0.9) * Math.sin(y * 0.11);
        const n2 = ((x * 3.1 + y * 5.7) % 7) / 7;
        const v = 140 + n1 * 8 + n2 * 10;
        const i = (y * n + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

export type FinishMaps = {
  circular: THREE.CanvasTexture;
  circularFine: THREE.CanvasTexture;
  perlage: THREE.CanvasTexture;
  satin: THREE.CanvasTexture;
  cotes: THREE.CanvasTexture;
};

export function createFinishMaps(): FinishMaps {
  return {
    circular: fineCircularRoughness(512, 200, 8),
    circularFine: fineCircularRoughness(512, 280, 5),
    perlage: faintPerlage(512, 14),
    satin: microSatin(256),
    cotes: cotesDeGeneve(512, 14),
  };
}
