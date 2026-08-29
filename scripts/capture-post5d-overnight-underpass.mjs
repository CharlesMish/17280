import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv.slice(2).find((arg) => !arg.startsWith("--")) || "http://127.0.0.1:5173";
const resume = process.argv.includes("--resume");
const version = process.argv.find((arg) => arg.startsWith("--version="))?.split("=")[1] || "v2";
const root = process.cwd();
const auditRoot = path.join(root, "captures/post5d-overnight-audit");
const afterDir = path.join(auditRoot, "after");
const diagnosticsDir = path.join(auditRoot, "diagnostics");
fs.mkdirSync(afterDir, { recursive: true });
fs.mkdirSync(diagnosticsDir, { recursive: true });

const outputFiles = [
  `after/img3-underpass-${version}-normal.png`,
  `after/img3-underpass-${version}-flat-id.png`,
  `diagnostics/img3-underpass-${version}-side.png`,
  `diagnostics/img3-underpass-${version}-context.png`,
  `diagnostics/img3-underpass-${version}-orthographic-z-section.png`,
  `diagnostics/img3-underpass-${version}-side-wide.png`,
  `diagnostics/img3-underpass-${version}-orthographic-z-section-wide.png`,
  `diagnostics/img4-underpass-${version}-projection-normal.png`,
  `diagnostics/img4-underpass-${version}-projection-flat-id.png`,
  `diagnostics/img4-underpass-${version}-side-z-proof.png`,
  `diagnostics/underpass-${version}-runtime-report.json`,
];
for (const relative of outputFiles) {
  const absolute = path.join(auditRoot, relative);
  if (fs.existsSync(absolute) && !resume) throw new Error(`refusing to overwrite ${absolute}`);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
await page.goto(`${baseUrl}/?static=1&view=structEscape&t=0.104&accommodation=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => globalThis.__WATCH__?.capture !== undefined);
await page.waitForTimeout(900);
await page.evaluate(() => {
  globalThis.__WATCH__.setView("structEscape");
  globalThis.__WATCH__.setTime(0.104);
  globalThis.__WATCH__.setDebug(false);
});

const cdp = await page.context().newCDPSession(page);
await cdp.send("Runtime.evaluate", {
  expression: "import('/node_modules/.vite/deps/three.js').then(m => globalThis.__UNDERPASS_THREE__ = m)",
  awaitPromise: true,
});

async function exposeObject(constructorExpression, selectFunction, globalName) {
  const prototype = await cdp.send("Runtime.evaluate", { expression: constructorExpression });
  const instances = await cdp.send("Runtime.queryObjects", { prototypeObjectId: prototype.result.objectId });
  await cdp.send("Runtime.callFunctionOn", {
    objectId: instances.objects.objectId,
    functionDeclaration: `function(){ globalThis.${globalName} = (${selectFunction})(this); }`,
  });
}

await exposeObject(
  "__UNDERPASS_THREE__.Scene.prototype",
  "xs => xs.find(x => x.getObjectByName && x.getObjectByName('calibre'))",
  "__UNDERPASS_SCENE__",
);
await exposeObject(
  "__UNDERPASS_THREE__.WebGLRenderer.prototype",
  "xs => xs.find(x => x.domElement && x.domElement.parentElement && x.domElement.parentElement.id === 'app')",
  "__UNDERPASS_RENDERER__",
);

await page.evaluate(() => {
  const THREE = globalThis.__UNDERPASS_THREE__;
  const scene = globalThis.__UNDERPASS_SCENE__;
  const pathOf = (object) => {
    const labels = [];
    for (let cursor = object; cursor; cursor = cursor.parent) {
      let label = cursor.name || cursor.type;
      if (!cursor.name && cursor.parent) label += `[${cursor.parent.children.indexOf(cursor)}]`;
      labels.push(label);
    }
    return labels.reverse().join("/");
  };
  const boxOf = (object) => {
    const box = new THREE.Box3().setFromObject(object, true);
    return { min: box.min.toArray(), max: box.max.toArray() };
  };
  const balanceGeom = scene.getObjectByName("balance:geom");
  const balanceRim = balanceGeom.children[0];
  const balanceCock = scene.getObjectByName("balanceCock");
  const balanceCockSpine = balanceCock.children
    .filter((object) => object.isMesh && !object.name)
    .sort((a, b) => boxOf(a).min[1] - boxOf(b).min[1])[0];
  const objects = {
    stemBar: scene.getObjectByName("struct:escapeFinger:stemBar"),
    anchorScrew: scene.getObjectByName("assembly:anchor:escape:screw"),
    balanceRim,
    escapeBoss: scene.getObjectByName("struct:boss:escape:upper"),
    palletBoss: scene.getObjectByName("struct:boss:pallet:upper"),
    palletForkBridge: scene.getObjectByName("pallet:forkBridge"),
    balanceCockSpine,
  };
  for (const [key, object] of Object.entries(objects)) {
    if (!object) throw new Error(`underpass witness object missing: ${key}`);
  }
  globalThis.__UNDERPASS_OBJECTS__ = objects;
  globalThis.__UNDERPASS_PATH_OF__ = pathOf;
  globalThis.__UNDERPASS_BOX_OF__ = boxOf;
});

const imageRows = [];
const capture = async (relative, participants, cameraSpec, palette = null) => {
  const result = await page.evaluate(({ participants, cameraSpec, palette }) => {
    const THREE = globalThis.__UNDERPASS_THREE__;
    const scene = globalThis.__UNDERPASS_SCENE__;
    const renderer = globalThis.__UNDERPASS_RENDERER__;
    const objects = globalThis.__UNDERPASS_OBJECTS__;
    scene.updateMatrixWorld(true);
    const meshesByKey = Object.fromEntries(participants.map((key) => {
      const meshes = [];
      objects[key].traverse((object) => {
        if (object.isMesh) meshes.push(object);
      });
      return [key, meshes];
    }));
    const selected = new Set(Object.values(meshesByKey).flat());
    const originalVisibility = [];
    const originalMaterials = [];
    const generated = [];
    scene.traverse((object) => {
      originalVisibility.push([object, object.visible]);
      if (object.isMesh) object.visible = selected.has(object);
    });
    for (const mesh of selected) {
      for (let cursor = mesh; cursor; cursor = cursor.parent) cursor.visible = true;
    }
    if (palette) {
      for (const key of participants) {
        for (const mesh of meshesByKey[key]) {
          originalMaterials.push([mesh, mesh.material]);
          const material = new THREE.MeshBasicMaterial({
            color: palette[key],
            side: THREE.DoubleSide,
            toneMapped: false,
          });
          generated.push(material);
          mesh.material = material;
        }
      }
    }
    const aspect = renderer.domElement.width / renderer.domElement.height;
    let camera;
    if (cameraSpec.type === "orthographic") {
      const halfWidth = cameraSpec.width * 0.5;
      const halfHeight = halfWidth / aspect;
      camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, 0.01, 100);
    } else {
      camera = new THREE.PerspectiveCamera(cameraSpec.fov, aspect, 0.01, 100);
    }
    camera.position.set(...cameraSpec.position);
    camera.up.set(...cameraSpec.up);
    camera.lookAt(new THREE.Vector3(...cameraSpec.target));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");
    const objectRows = participants.map((key) => ({
      key,
      runtimeName: objects[key].name || "(unnamed direct Mesh)",
      path: globalThis.__UNDERPASS_PATH_OF__(objects[key]),
      bounds: globalThis.__UNDERPASS_BOX_OF__(objects[key]),
      childMeshes: meshesByKey[key].map((mesh) => ({
        name: mesh.name || "(unnamed Mesh)",
        path: globalThis.__UNDERPASS_PATH_OF__(mesh),
        bounds: globalThis.__UNDERPASS_BOX_OF__(mesh),
      })),
      unifiedOwners: objects[key].userData.unifiedOwners ?? null,
      junctionTenon: objects[key].userData.junctionTenon ?? null,
      balanceUnderpass: objects[key].userData.balanceUnderpass ?? null,
      renderedSeatTopZ: objects[key].userData.renderedSeatTopZ ?? null,
      renderedSeatContactGap: objects[key].userData.renderedSeatContactGap ?? null,
    }));
    for (const [mesh, material] of originalMaterials) mesh.material = material;
    for (const [object, visible] of originalVisibility) object.visible = visible;
    for (const material of generated) material.dispose();
    return {
      dataUrl,
      camera: {
        type: cameraSpec.type,
        position: camera.position.toArray(),
        target: cameraSpec.target,
        up: camera.up.toArray(),
        fov: camera.isPerspectiveCamera ? camera.fov : null,
        width: camera.isOrthographicCamera ? cameraSpec.width : null,
      },
      participants: objectRows,
    };
  }, { participants, cameraSpec, palette });
  const bytes = Buffer.from(result.dataUrl.split(",")[1], "base64");
  const absolute = path.join(auditRoot, relative);
  if (!fs.existsSync(absolute)) fs.writeFileSync(absolute, bytes, { flag: "wx" });
  const retainedBytes = fs.readFileSync(absolute);
  imageRows.push({
    file: relative,
    bytes: retainedBytes.byteLength,
    sha256: crypto.createHash("sha256").update(retainedBytes).digest("hex"),
    presentation: palette ? "isolated flat ID" : "isolated finished materials",
    camera: result.camera,
    participants: result.participants,
  });
  console.log("ok", relative);
};

const cameras = {
  top: { type: "perspective", position: [4.8, 0.8, 11.8], target: [-0.7, 6.3, 2.5], up: [0, 1, 0], fov: 27 },
  side: { type: "perspective", position: [12.8, 6.35, 2.62], target: [-0.7, 6.35, 2.62], up: [0, 0, 1], fov: 19 },
  context: { type: "perspective", position: [8.4, -2.8, 7.4], target: [-0.1, 6.75, 2.55], up: [0, 0, 1], fov: 26 },
  orthoZ: { type: "orthographic", position: [0, -12, 2.64], target: [0, 6.3, 2.64], up: [0, 0, 1], width: 8.8 },
  sideWide: { type: "orthographic", position: [13, 6.35, 2.62], target: [-0.7, 6.35, 2.62], up: [0, 0, 1], width: 8.8 },
  orthoZWide: { type: "orthographic", position: [0, -12, 2.64], target: [0, 6.3, 2.64], up: [0, 0, 1], width: 10.4 },
  img4Projection: { type: "perspective", position: [7.2, -1.8, 7.0], target: [-0.35, 7.35, 2.9], up: [0, 0, 1], fov: 25 },
  img4Side: { type: "orthographic", position: [12, 7.35, 2.95], target: [-0.35, 7.35, 2.95], up: [0, 0, 1], width: 8.2 },
};

const core = ["stemBar", "anchorScrew", "balanceRim", "escapeBoss", "palletBoss", "palletForkBridge"];
const corePalette = {
  stemBar: 0xff4fa3,
  anchorScrew: 0xffb000,
  balanceRim: 0x31d9ff,
  escapeBoss: 0x72e06a,
  palletBoss: 0x8b6cff,
  palletForkBridge: 0xffd447,
};
const img4 = ["balanceCockSpine", "stemBar"];
const img4Palette = { balanceCockSpine: 0x25d6ff, stemBar: 0xff4fa3 };

await capture(`after/img3-underpass-${version}-normal.png`, core, cameras.top);
await capture(`after/img3-underpass-${version}-flat-id.png`, core, cameras.top, corePalette);
await capture(`diagnostics/img3-underpass-${version}-side.png`, core, cameras.side, corePalette);
await capture(`diagnostics/img3-underpass-${version}-context.png`, core, cameras.context);
await capture(`diagnostics/img3-underpass-${version}-orthographic-z-section.png`, core, cameras.orthoZ, corePalette);
await capture(`diagnostics/img3-underpass-${version}-side-wide.png`, core, cameras.sideWide, corePalette);
await capture(`diagnostics/img3-underpass-${version}-orthographic-z-section-wide.png`, core, cameras.orthoZWide, corePalette);
await capture(`diagnostics/img4-underpass-${version}-projection-normal.png`, img4, cameras.img4Projection);
await capture(`diagnostics/img4-underpass-${version}-projection-flat-id.png`, img4, cameras.img4Projection, img4Palette);
await capture(`diagnostics/img4-underpass-${version}-side-z-proof.png`, img4, cameras.img4Side, img4Palette);

const participant = (key) => imageRows.flatMap((row) => row.participants).find((row) => row.key === key);
const bounds = (key) => participant(key).bounds;
const zGap = (lower, upper) => bounds(upper).min[2] - bounds(lower).max[2];
const authority = await page.evaluate(() => ({ assembly: globalThis.__WATCH__.assemblyReport() }));
const escapeAnchorFastenerSeat = authority.assembly.fastenerSeats.find(
  (row) => row.id === "assembly:anchor:escape:screw",
);
const report = {
  schema: `post5d-overnight-underpass-visual-audit-${version}`,
  disposition: "UPDATED UNDERPASS WITNESS CAPTURED — PRODUCT SOURCE UNTOUCHED",
  productSourceEdited: false,
  browserErrors,
  runtime: {
    stemBar: participant("stemBar"),
    anchorScrew: participant("anchorScrew"),
    balanceRim: participant("balanceRim"),
    escapeBoss: participant("escapeBoss"),
    palletBoss: participant("palletBoss"),
    palletForkBridge: participant("palletForkBridge"),
    balanceCockSpine: participant("balanceCockSpine"),
  },
  clearancesMm: {
    stemBarTopToBalanceRimFloor: zGap("stemBar", "balanceRim"),
    anchorScrewTopToBalanceRimFloor: zGap("anchorScrew", "balanceRim"),
    palletForkTopToStemBarFloor: zGap("palletForkBridge", "stemBar"),
    stemBarTopToBalanceCockSpineFloor: zGap("stemBar", "balanceCockSpine"),
  },
  seatContact: {
    authority: escapeAnchorFastenerSeat,
    renderedSeatTopZ: participant("anchorScrew").renderedSeatTopZ,
    renderedContactGapMm: participant("anchorScrew").renderedSeatContactGap,
    accepted:
      escapeAnchorFastenerSeat?.relation === "contact" &&
      Math.abs(participant("anchorScrew").renderedSeatContactGap ?? Infinity) <= 1e-9,
  },
  interpretation: {
    underpass: "stemBar and recessed frozen-anchor screw pass below the moving balance rim",
    bosses: "escape and pallet upper bosses retain their original upper bearing slabs and loci",
    image4: "the balance-cock spine and revised stemBar remain projection-only, with greater axial separation after the underpass",
  },
  images: imageRows,
};
fs.writeFileSync(
  path.join(diagnosticsDir, `underpass-${version}-runtime-report.json`),
  `${JSON.stringify(report, null, 2)}\n`,
  { flag: "wx" },
);
await browser.close();
console.log("done", auditRoot);
