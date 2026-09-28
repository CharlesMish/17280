// Triangle-level collision sweep of the moving train against the fixed
// structure, jewel settings, and each other. Runs in Node through Vite's SSR
// loader, so no browser is needed:
//
//   npm run audit:collisions            (48 time samples)
//   node scripts/audit-collisions.mjs 96
//
// Exits non-zero when any pair outside ALLOWED intersects.
import { createServer } from "vite";

// Material creation paints procedural grain maps; a no-op 2D context is enough
// because only geometry is audited here.
const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop, set: () => true });
const context2d = new Proxy({}, {
  get: (_, key) => {
    if (key === "getImageData" || key === "createImageData") {
      return (a, b, w, h) => {
        const width = w ?? a?.width ?? 1;
        const height = h ?? b ?? 1;
        return { data: new Uint8ClampedArray(width * height * 4), width, height };
      };
    }
    if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop() {} });
    if (key === "measureText") return () => ({ width: 1 });
    return () => noop;
  },
  set: () => true,
});
const canvas = () => ({ width: 1, height: 1, style: {}, getContext: () => context2d });
globalThis.document ??= { createElement: canvas, createElementNS: canvas };

/** Intended contacts: pivots seated in jewels, banking, and roller drive. */
const ALLOWED = [
  // An arbor may only enter its own seats and the bridge members carrying them.
  /^(\w+):arbor:\w+ x (\S*:\1(:\S*)?|\(unnamed in assembly:bearing:\1:\w+:\w+\))$/,
  /^balance:arbor:upperTip x \(unnamed in balanceCock\)$/,
  /^(third|fourth|center):arbor:upperTip x struct:trainBridge:(body|stub:\w)$/,
  /^pallet:arbor:shaft x struct:escapeFinger:stemBar$/,
  /^pallet:bankingLug x struct:bankingStop:/,
  /^MOVER pallet:fork\S+ x balance:impulseJewel$/,
  /^MOVER balance:\S* x balance:/,
  /^MOVER  x balance:arbor:shaft$/,
];

const samples = Number(process.argv[2] ?? 48);
const server = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
let failed = false;
try {
  const load = (id) => server.ssrLoadModule(id);
  const THREE = await load("three");
  const { createMaterials } = await load("/src/materials.ts");
  const { createMovement } = await load("/src/movement.ts");
  const { createMovementStructure } = await load("/src/structure.ts");
  const { createMovementAssembly } = await load("/src/assembly.ts");

  const movement = createMovement(createMaterials());
  const structure = createMovementStructure(movement.layout);
  structure.root.add(createMovementAssembly(structure.plan).root);
  structure.root.updateMatrixWorld(true);

  const shown = (object) => {
    for (let o = object; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  const meshes = (root) => {
    const out = [];
    root.traverse((o) => {
      if (o.isMesh && !o.userData.engineeringAuditOnly && shown(o)) out.push(o);
    });
    return out;
  };

  const vertex = new THREE.Vector3();
  const triangles = (mesh) => {
    mesh.updateWorldMatrix(true, false);
    const position = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const point = (i) => {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      return [vertex.x, vertex.y, vertex.z];
    };
    const count = index ? index.count : position.count;
    const out = [];
    for (let i = 0; i < count; i += 3) {
      const t = index
        ? [point(index.getX(i)), point(index.getX(i + 1)), point(index.getX(i + 2))]
        : [point(i), point(i + 1), point(i + 2)];
      const min = [0, 1, 2].map((k) => Math.min(t[0][k], t[1][k], t[2][k]));
      const max = [0, 1, 2].map((k) => Math.max(t[0][k], t[1][k], t[2][k]));
      out.push({ t, min, max });
    }
    const min = [0, 1, 2].map((k) => Math.min(...out.map((r) => r.min[k])));
    const max = [0, 1, 2].map((k) => Math.max(...out.map((r) => r.max[k])));
    return { tris: out, min, max };
  };

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // Separating-axis test; faces merely touching within 1e-5 mm do not count.
  const intersects = (a, b) => {
    const ea = [sub(a[1], a[0]), sub(a[2], a[1]), sub(a[0], a[2])];
    const eb = [sub(b[1], b[0]), sub(b[2], b[1]), sub(b[0], b[2])];
    const axes = [cross(ea[0], ea[1]), cross(eb[0], eb[1])];
    for (const x of ea) for (const y of eb) axes.push(cross(x, y));
    for (const axis of axes) {
      const length = Math.hypot(...axis);
      if (length < 1e-12) continue;
      const n = axis.map((v) => v / length);
      const pa = a.map((p) => dot(p, n));
      const pb = b.map((p) => dot(p, n));
      if (Math.max(...pa) < Math.min(...pb) + 1e-5 || Math.max(...pb) < Math.min(...pa) + 1e-5) return false;
    }
    return true;
  };
  const boxesOverlap = (a, b) => [0, 1, 2].every((k) => a.max[k] >= b.min[k] && b.max[k] >= a.min[k]);
  const collide = (A, B) => {
    if (!boxesOverlap(A, B)) return false;
    for (const p of A.tris) {
      if (!boxesOverlap(p, B)) continue;
      for (const q of B.tris) if (boxesOverlap(p, q) && intersects(p.t, q.t)) return true;
    }
    return false;
  };

  const fixed = meshes(structure.root).map((mesh) => [mesh, triangles(mesh)]);
  const moving = meshes(movement.root);
  const part = (name) => name.split(":")[0];
  const hits = new Map();
  const record = (key, time) => {
    const row = hits.get(key) ?? { count: 0, firstTime: time };
    row.count++;
    hits.set(key, row);
  };

  for (let i = 0; i < samples; i++) {
    const time = 0.104 + i * 7.31;
    movement.update(time);
    movement.root.updateMatrixWorld(true);
    const posed = moving.map((mesh) => [mesh, triangles(mesh)]);
    for (const [mesh, A] of posed) {
      for (const [still, B] of fixed) {
        if (collide(A, B)) record(`${mesh.name} x ${still.name || `(unnamed in ${still.parent?.name})`}`, time);
      }
    }
    for (let a = 0; a < posed.length; a++) {
      for (let b = a + 1; b < posed.length; b++) {
        if (part(posed[a][0].name) === part(posed[b][0].name)) continue;
        if (collide(posed[a][1], posed[b][1])) record(`MOVER ${posed[a][0].name} x ${posed[b][0].name}`, time);
      }
    }
  }

  for (const [key, row] of [...hits].sort()) {
    const allowed = ALLOWED.some((pattern) => pattern.test(key));
    if (!allowed) failed = true;
    console.log(`${allowed ? "allowed " : "COLLISION"} ${key}  (${row.count}/${samples}, first t=${row.firstTime.toFixed(3)})`);
  }
  console.log(failed ? "FAIL: unexpected intersections found." : `PASS: no unexpected intersections across ${samples} samples.`);
} finally {
  await server.close();
}
process.exit(failed ? 1 : 0);
