import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve(process.argv[2] || "captures/post5d-newer-827");
const baseUrl = process.argv[3] || "http://127.0.0.1:5173";
fs.mkdirSync(outDir, { recursive: true });
for (const index of [1, 5]) {
  fs.copyFileSync(
    path.resolve(`watch_newer_827_${index}.png`),
    path.join(outDir, `supplied-watch_newer_827_${index}.png`),
  );
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
page.setDefaultTimeout(300000);
await page.goto(`${baseUrl}/?static=1&view=structEscape&t=0.104&explode=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => typeof globalThis.__WATCH__?.setEscapementAudit === "function");
await page.waitForTimeout(500);

const cdp = await page.context().newCDPSession(page);
await cdp.send("Runtime.evaluate", {
  expression: "import('/node_modules/.vite/deps/three.js').then(m => globalThis.__THREE_NEWER_EVIDENCE__ = m)",
  awaitPromise: true,
});
for (const [type, target] of [
  ["Scene", "__NEWER_EVIDENCE_SCENE__"],
  ["PerspectiveCamera", "__NEWER_EVIDENCE_CAMERA__"],
]) {
  const prototype = await cdp.send("Runtime.evaluate", {
    expression: `__THREE_NEWER_EVIDENCE__.${type}.prototype`,
  });
  const instances = await cdp.send("Runtime.queryObjects", {
    prototypeObjectId: prototype.result.objectId,
  });
  await cdp.send("Runtime.callFunctionOn", {
    objectId: instances.objects.objectId,
    functionDeclaration:
      type === "Scene"
        ? `function(){ globalThis.${target} = this.find(x => x.getObjectByName && x.getObjectByName('calibre')); }`
        : `function(){ globalThis.${target} = this.find(x => x.isPerspectiveCamera && x.parent === null && Math.abs(x.aspect - (1600 / 1100)) < 0.01); }`,
  });
}

const capture = async ({ file, mode, time, position, fov, up, label }) => {
  await page.evaluate(({ mode, time, position, fov, up, label }) => {
    const THREE = globalThis.__THREE_NEWER_EVIDENCE__;
    const scene = globalThis.__NEWER_EVIDENCE_SCENE__;
    const camera = globalThis.__NEWER_EVIDENCE_CAMERA__;
    const watch = globalThis.__WATCH__;
    watch.clearEscapementAudit();
    watch.setTime(time);
    watch.setEscapementAudit("participantsTop");
    if (globalThis.__NEWER_EVIDENCE_MATERIALS__) {
      for (const [mesh, material] of globalThis.__NEWER_EVIDENCE_MATERIALS__) mesh.material = material;
    }
    globalThis.__NEWER_EVIDENCE_MATERIALS__ = new Map();
    const escape = scene.getObjectByName("escape:wheel");
    const balanceGeom = scene.getObjectByName("balance:geom");
    const balanceArms = [1, 2, 3].map((index) => balanceGeom.children[index]);
    const pallet = {
      entryStone: scene.getObjectByName("pallet:stone:entry"),
      exitStone: scene.getObjectByName("pallet:stone:exit"),
      entryCarrier: scene.getObjectByName("pallet:lowerArm:entry"),
      exitCarrier: scene.getObjectByName("pallet:lowerArm:exit"),
      lowerBoss: scene.getObjectByName("pallet:lowerBoss"),
      lowerLever: scene.getObjectByName("pallet:lowerLever"),
    };
    const selected = mode.startsWith("one")
      ? new Set([escape, ...balanceArms])
      : mode === "fiveContact"
        ? new Set([escape, pallet.lowerBoss])
        : new Set([escape, ...Object.values(pallet)]);
    scene.traverse((object) => {
      if (object.isMesh) object.visible = selected.has(object);
    });
    const isId = mode.endsWith("Id") || mode === "oneSection" || mode === "fiveContact";
    if (isId) {
      const colors = new Map([
        [escape, 0xf4d03f],
        ...balanceArms.map((mesh) => [mesh, 0x35e06f]),
        [pallet.entryStone, 0xff3ba7],
        [pallet.exitStone, 0xff3ba7],
        [pallet.entryCarrier, 0x34e7a5],
        [pallet.exitCarrier, 0x34e7a5],
        [pallet.lowerBoss, 0xff8a38],
        [pallet.lowerLever, 0x8ca2b8],
      ]);
      for (const mesh of selected) {
        globalThis.__NEWER_EVIDENCE_MATERIALS__.set(mesh, mesh.material);
        mesh.material = new THREE.MeshBasicMaterial({
          color: colors.get(mesh) ?? 0x737b86,
          side: THREE.DoubleSide,
          toneMapped: false,
        });
      }
    }
    camera.position.fromArray(position);
    camera.up.fromArray(up);
    camera.fov = fov;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    scene.background = new THREE.Color(0x0b0e13);
    watch.setTone("neutral", 1.3);
    watch.capture();
    let overlay = document.getElementById("newer-evidence-label");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "newer-evidence-label";
      Object.assign(overlay.style, {
        position: "fixed",
        left: "24px",
        top: "24px",
        zIndex: "100000",
        maxWidth: "1120px",
        padding: "14px 18px",
        background: "rgba(4,7,12,.82)",
        border: "1px solid rgba(255,255,255,.28)",
        color: "#f2f5f8",
        font: "600 18px/1.38 ui-monospace, SFMono-Regular, Menlo, monospace",
        whiteSpace: "pre-line",
        pointerEvents: "none",
      });
      document.body.appendChild(overlay);
    }
    overlay.textContent = label;
  }, { mode, time, position, fov, up, label });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outDir, file) });
  console.log("ok", file);
};

const oneLabel =
  "#1 — ESCAPE WHEEL / BALANCE ARM\nescape:wheel (yellow) · balance arm meshes [1..3] (green)\nRendered Z clearance = 2.639000 − 2.146500 = 0.492500 mm · invariant through full motions";
await capture({
  file: "01-escape-balance-tight-normal.png",
  mode: "oneNormal",
  time: 0.104,
  position: [6.0, 9.0, 7.5],
  fov: 19,
  up: [0, 1, 0],
  label: oneLabel,
});
await capture({
  file: "01-escape-balance-flat-owner-id.png",
  mode: "oneId",
  time: 0.104,
  position: [6.0, 9.0, 7.5],
  fov: 19,
  up: [0, 1, 0],
  label: oneLabel,
});
await capture({
  file: "01-escape-balance-orthographic-z-section.png",
  mode: "oneSection",
  time: 0.104,
  position: [46.0, 33.0, 2.25],
  fov: 3.7,
  up: [0, 0, 1],
  label: oneLabel,
});

const fiveLabel =
  "#5 — ESCAPE CLUB / PALLET STONES + STEEL CARRIERS\nescape:wheel yellow · rubies magenta · carriers green · relieved lower boss orange\n2,049-state beat: entry 0.040492 mm · exit 0.040492 mm · boss 0.035062 mm · zero steel intersections";
await capture({
  file: "05-escape-pallet-after-tight-normal.png",
  mode: "fiveNormal",
  time: 0,
  position: [2.5, 1.5, 10],
  fov: 22,
  up: [0, 1, 0],
  label: fiveLabel,
});
await capture({
  file: "05-escape-pallet-after-flat-owner-id.png",
  mode: "fiveId",
  time: 0,
  position: [2.5, 1.5, 10],
  fov: 22,
  up: [0, 1, 0],
  label: fiveLabel,
});
await capture({
  file: "05-escape-pallet-orthographic-minimum-contact.png",
  mode: "fiveContact",
  time: 0.11128743489583334,
  position: [-1.75, 5.35, 62],
  fov: 3.8,
  up: [0, 1, 0],
  label:
    "#5 GLOBAL STEEL MINIMUM — ACTUAL RENDERED TRIANGLES\nescape:wheel yellow · pallet:lowerBoss orange\nminimum positive clearance = 0.035062211 mm @ t=0.111287435 s · pallet +1.749808° · escape +11.886895°",
});

await browser.close();
