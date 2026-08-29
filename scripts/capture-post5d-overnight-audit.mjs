import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const root = process.cwd();
const auditRoot = path.join(root, "captures/post5d-overnight-audit");
const afterDir = path.join(auditRoot, "after");
const diagnosticsDir = path.join(auditRoot, "diagnostics");
fs.mkdirSync(afterDir, { recursive: true });
fs.mkdirSync(diagnosticsDir, { recursive: true });

const outputs = [
  "after/img2-center-network-normal.png",
  "after/img2-center-network-flat-id.png",
  "diagnostics/img2-center-network-side.png",
  "after/img3-stemBar-normal.png",
  "after/img3-stemBar-flat-id.png",
  "diagnostics/img3-stemBar-side.png",
  "diagnostics/img1-projection-normal.png",
  "diagnostics/img1-projection-flat-id.png",
  "diagnostics/img1-side-z-proof.png",
  "diagnostics/img4-projection-normal.png",
  "diagnostics/img4-projection-flat-id.png",
  "diagnostics/img4-side-z-proof.png",
  "diagnostics/runtime-report.json",
];
for (const relative of outputs) {
  const absolute = path.join(auditRoot, relative);
  if (fs.existsSync(absolute)) throw new Error(`refusing to overwrite ${absolute}`);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
await page.goto(`${baseUrl}/?static=1&view=structTop&t=0.104&accommodation=0`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(
  () =>
    globalThis.__WATCH__?.capture !== undefined &&
    globalThis.__WATCH__?.sceneDump !== undefined,
);
await page.waitForTimeout(900);

const cdp = await page.context().newCDPSession(page);
await cdp.send("Runtime.evaluate", {
  expression: "import('/node_modules/.vite/deps/three.js').then(m => globalThis.__OVERNIGHT_THREE__ = m)",
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
  "__OVERNIGHT_THREE__.Scene.prototype",
  "xs => xs.find(x => x.getObjectByName && x.getObjectByName('calibre'))",
  "__OVERNIGHT_SCENE__",
);
await exposeObject(
  "__OVERNIGHT_THREE__.PerspectiveCamera.prototype",
  "xs => xs.find(x => x.isPerspectiveCamera && x.fov >= 10 && x.fov <= 80)",
  "__OVERNIGHT_CAMERA__",
);

await page.evaluate(() => {
  const THREE = globalThis.__OVERNIGHT_THREE__;
  const scene = globalThis.__OVERNIGHT_SCENE__;
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
  const balanceCock = scene.getObjectByName("balanceCock");
  const spine = balanceCock.children
    .filter((object) => object.isMesh && !object.name)
    .sort((a, b) => boxOf(a).min[1] - boxOf(b).min[1])[0];
  const objects = {
    centerNetwork: scene.getObjectByName("struct:plate:spoke:center-network"),
    stemBar: scene.getObjectByName("struct:escapeFinger:stemBar"),
    balanceCockSpine: spine,
    palletVerticalRiser: scene.getObjectByName("pallet:verticalRiser"),
    palletForkBridge: scene.getObjectByName("pallet:forkBridge"),
    balanceImpulseJewel: scene.getObjectByName("balance:impulseJewel"),
  };
  for (const [key, object] of Object.entries(objects)) {
    if (!object) throw new Error(`overnight witness object missing: ${key}`);
  }
  globalThis.__OVERNIGHT_OBJECTS__ = objects;
  globalThis.__OVERNIGHT_PATH_OF__ = pathOf;
  globalThis.__OVERNIGHT_BOX_OF__ = boxOf;
});

const rows = [];
const capture = async (relative, participants, camera, palette = null) => {
  const result = await page.evaluate(({ participants, camera, palette }) => {
    const THREE = globalThis.__OVERNIGHT_THREE__;
    const scene = globalThis.__OVERNIGHT_SCENE__;
    const renderCamera = globalThis.__OVERNIGHT_CAMERA__;
    const objects = globalThis.__OVERNIGHT_OBJECTS__;
    const selected = new Set(participants.map((key) => objects[key]));
    const original = [];
    const generated = [];
    scene.traverse((object) => {
      if (!object.isMesh) return;
      original.push({ object, visible: object.visible, material: object.material });
      object.visible = selected.has(object);
      if (!object.visible || !palette) return;
      const key = participants.find((candidate) => objects[candidate] === object);
      const material = new THREE.MeshBasicMaterial({
        color: palette[key],
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      generated.push(material);
      object.material = material;
    });
    renderCamera.position.set(...camera.position);
    renderCamera.up.set(...camera.up);
    renderCamera.fov = camera.fov;
    renderCamera.lookAt(new THREE.Vector3(...camera.target));
    renderCamera.updateProjectionMatrix();
    renderCamera.updateMatrixWorld(true);
    globalThis.__WATCH__.setTime(0.104);
    const dataUrl = globalThis.__WATCH__.capture();
    const cameraProof = {
      position: renderCamera.position.toArray(),
      target: camera.target,
      up: renderCamera.up.toArray(),
      fov: renderCamera.fov,
    };
    const objectRows = participants.map((key) => {
      const object = objects[key];
      return {
        key,
        runtimeName: object.name || "(unnamed direct Mesh)",
        path: globalThis.__OVERNIGHT_PATH_OF__(object),
        bounds: globalThis.__OVERNIGHT_BOX_OF__(object),
        unifiedOwners: object.userData.unifiedOwners ?? null,
        junctionTenon: object.userData.junctionTenon ?? null,
      };
    });
    for (const row of original) {
      row.object.visible = row.visible;
      row.object.material = row.material;
    }
    for (const material of generated) material.dispose();
    return { dataUrl, camera: cameraProof, participants: objectRows };
  }, { participants, camera, palette });
  const data = Buffer.from(result.dataUrl.split(",")[1], "base64");
  const absolute = path.join(auditRoot, relative);
  fs.writeFileSync(absolute, data, { flag: "wx" });
  rows.push({
    file: relative,
    bytes: data.byteLength,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
    camera: result.camera,
    participants: result.participants,
    presentation: palette ? "flat ID, isolated exact participants" : "finished materials, isolated exact participants",
  });
  console.log("ok", relative);
};

const cameras = {
  centerOblique: {
    position: [5.8, -6.2, -8.8],
    target: [-3.05, 0.9, -1.035],
    up: [0, 0, -1],
    fov: 29,
  },
  centerSide: {
    position: [13.5, 0.9, -1.035],
    target: [-3.05, 0.9, -1.035],
    up: [0, 0, 1],
    fov: 21,
  },
  stemTop: {
    position: [4.8, 1.4, 11.2],
    target: [-0.67, 6.24, 2.554],
    up: [0, 1, 0],
    fov: 27,
  },
  stemSide: {
    position: [12.5, 6.24, 2.554],
    target: [-0.67, 6.24, 2.554],
    up: [0, 0, 1],
    fov: 20,
  },
  img1Projection: {
    position: [6.4, -1.6, 8.8],
    target: [0.0, 7.45, 2.85],
    up: [0, 0, 1],
    fov: 24,
  },
  img1Side: {
    position: [11.0, 7.45, 2.78],
    target: [0.0, 7.45, 2.78],
    up: [0, 0, 1],
    fov: 17,
  },
  img4Projection: {
    position: [7.2, -1.8, 7.0],
    target: [-0.35, 7.35, 3.0],
    up: [0, 0, 1],
    fov: 25,
  },
  img4Side: {
    position: [12.0, 7.35, 3.0],
    target: [-0.35, 7.35, 3.0],
    up: [0, 0, 1],
    fov: 18,
  },
};

const centerPalette = { centerNetwork: 0x24d6ff };
const stemPalette = { stemBar: 0xff4fa3 };
const img1Participants = [
  "balanceCockSpine",
  "palletVerticalRiser",
  "palletForkBridge",
  "balanceImpulseJewel",
];
const img1Palette = {
  balanceCockSpine: 0x25d6ff,
  palletVerticalRiser: 0xffa21a,
  palletForkBridge: 0xffd447,
  balanceImpulseJewel: 0xff3b85,
};
const img4Participants = ["balanceCockSpine", "stemBar"];
const img4Palette = { balanceCockSpine: 0x25d6ff, stemBar: 0xff4fa3 };

await capture("after/img2-center-network-normal.png", ["centerNetwork"], cameras.centerOblique);
await capture("after/img2-center-network-flat-id.png", ["centerNetwork"], cameras.centerOblique, centerPalette);
await capture("diagnostics/img2-center-network-side.png", ["centerNetwork"], cameras.centerSide, centerPalette);
await capture("after/img3-stemBar-normal.png", ["stemBar"], cameras.stemTop);
await capture("after/img3-stemBar-flat-id.png", ["stemBar"], cameras.stemTop, stemPalette);
await capture("diagnostics/img3-stemBar-side.png", ["stemBar"], cameras.stemSide, stemPalette);
await capture("diagnostics/img1-projection-normal.png", img1Participants, cameras.img1Projection);
await capture("diagnostics/img1-projection-flat-id.png", img1Participants, cameras.img1Projection, img1Palette);
await capture("diagnostics/img1-side-z-proof.png", img1Participants, cameras.img1Side, img1Palette);
await capture("diagnostics/img4-projection-normal.png", img4Participants, cameras.img4Projection);
await capture("diagnostics/img4-projection-flat-id.png", img4Participants, cameras.img4Projection, img4Palette);
await capture("diagnostics/img4-side-z-proof.png", img4Participants, cameras.img4Side, img4Palette);

const participant = (key) => rows.flatMap((row) => row.participants).find((row) => row.key === key);
const bounds = (key) => participant(key).bounds;
const axialGap = (lowerKey, upperKey) => bounds(upperKey).min[2] - bounds(lowerKey).max[2];
const report = {
  schema: "post5d-overnight-visual-audit-v1",
  disposition: "VISUAL WITNESS CAPTURED — PRODUCT SOURCE UNTOUCHED",
  productSourceEdited: false,
  browserErrors,
  exactCameraBaselines: {
    strapMacro: {
      file: "after/strap-macro.png",
      camera: {
        position: [14.4, 14.10036930167738, -0.2160000052452088],
        target: [1.0, 13.95036930167738, -0.6160000052452088],
        up: [0, 1, 0],
        fov: 32,
      },
    },
    extCrownRoot: {
      file: "after/ext-crown-root.png",
      camera: {
        position: [19.396762287513566, -6.8, -5.61],
        target: [13.346762287513566, 0.04, -0.13],
        up: [0, 1, 0],
        fov: 32,
      },
    },
  },
  unifiedOwners: {
    image2: participant("centerNetwork"),
    image3: participant("stemBar"),
  },
  projectionOnly: {
    image1: {
      participants: img1Participants.map(participant),
      balanceCockToVerticalRiserGapMm: axialGap("palletVerticalRiser", "balanceCockSpine"),
      balanceCockToForkBridgeGapMm: axialGap("palletForkBridge", "balanceCockSpine"),
      classification: "projection-only; balance-cock spine is axially above the pallet riser/fork bridge",
      intentionalActiveEngagement: "balance impulse jewel and pallet fork are retained as the active escapement pair",
    },
    image4: {
      participants: img4Participants.map(participant),
      axialGapMm: axialGap("stemBar", "balanceCockSpine"),
      classification: "projection-only; balance-cock spine is axially above the unified escape-finger stemBar",
    },
  },
  images: rows,
};
fs.writeFileSync(
  path.join(diagnosticsDir, "runtime-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  { flag: "wx" },
);

await browser.close();
console.log("done", auditRoot);
