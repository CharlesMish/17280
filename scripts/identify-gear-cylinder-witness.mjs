import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:5173";
const root = process.cwd();
const outDir = path.join(root, "captures/post5d-gear-cylinder-witness");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300000);
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(String(error)));
await page.goto(`${baseUrl}/?static=1&view=finishBalance&t=0.104&readoutPose=1010`, {
  waitUntil: "commit",
  timeout: 60000,
});
await page.waitForFunction(() => globalThis.__WATCH__?.sceneDump !== undefined);

const cdp = await page.context().newCDPSession(page);
await cdp.send("Runtime.evaluate", {
  expression: "import('/node_modules/.vite/deps/three.js').then(m => globalThis.__THREE_IDENTIFY__ = m)",
  awaitPromise: true,
});
async function expose(constructorExpression, selector, name) {
  const proto = await cdp.send("Runtime.evaluate", { expression: constructorExpression });
  const objects = await cdp.send("Runtime.queryObjects", { prototypeObjectId: proto.result.objectId });
  await cdp.send("Runtime.callFunctionOn", {
    objectId: objects.objects.objectId,
    functionDeclaration: `function(){ globalThis.${name} = (${selector})(this); }`,
  });
}
await expose(
  "__THREE_IDENTIFY__.Scene.prototype",
  "xs => xs.find(x => x.getObjectByName && x.getObjectByName('calibre'))",
  "__IDENTIFY_SCENE__",
);
await expose(
  "__THREE_IDENTIFY__.PerspectiveCamera.prototype",
  "xs => xs.find(x => x.isPerspectiveCamera && x.fov >= 10 && x.fov <= 80)",
  "__IDENTIFY_CAMERA__",
);
await expose(
  "__THREE_IDENTIFY__.WebGLRenderer.prototype",
  "xs => xs.find(x => x.domElement && x.domElement.parentElement && x.domElement.parentElement.id === 'app')",
  "__IDENTIFY_RENDERER__",
);

const result = await page.evaluate(() => {
  const THREE = globalThis.__THREE_IDENTIFY__;
  const scene = globalThis.__IDENTIFY_SCENE__;
  const camera = globalThis.__IDENTIFY_CAMERA__;
  const renderer = globalThis.__IDENTIFY_RENDERER__;
  scene.updateMatrixWorld(true);
  const objectPath = (object) => {
    const rows = [];
    for (let current = object; current; current = current.parent) {
      rows.push(current.name || `${current.type}[${current.parent?.children.indexOf(current) ?? 0}]`);
    }
    return rows.reverse().join("/");
  };
  const motionOwner = (object) => {
    for (let current = object; current; current = current.parent) {
      if (current.name.endsWith(":motion")) return objectPath(current);
    }
    return null;
  };
  const worldBounds = (object) => {
    const box = new THREE.Box3().setFromObject(object, true);
    return { min: box.min.toArray(), max: box.max.toArray() };
  };
  const actualOuterRadius = (mesh) => {
    const p = mesh.geometry.getAttribute("position");
    let maximum = 0;
    for (let i = 0; i < p.count; i++) maximum = Math.max(maximum, Math.hypot(p.getX(i), p.getY(i)));
    return maximum;
  };
  const teeth = { barrel: 80, center: 64, third: 60, fourth: 56, escape: 15 };
  const pitch = { barrel: 5.8, center: 4.64, third: 4.35, fourth: 4.06, escape: 2.22 };
  const wheelNames = ["barrel:wheel", "center:wheel", "third:wheel", "fourth:wheel", "escape:wheel"];
  const wheels = wheelNames.map((name) => {
    const mesh = scene.getObjectByName(name);
    const bounds = worldBounds(mesh);
    const pivot = mesh.getWorldPosition(new THREE.Vector3()).toArray();
    const family = name.split(":")[0];
    return {
      name,
      path: objectPath(mesh),
      functionalName: `${family} rotating wheel`,
      toothCount: teeth[family],
      pivot,
      pitchRadiusMm: pitch[family],
      renderedOuterRadiusMm: actualOuterRadius(mesh),
      zIntervalMm: [bounds.min[2], bounds.max[2]],
      motionOwner: motionOwner(mesh),
    };
  });
  const cylinderNames = [
    "barrel:arbor:shaft",
    "center:arbor:shaft",
    "third:arbor:shaft",
    "fourth:arbor:shaft",
    "escape:arbor:shaft",
    "pallet:arbor:shaft",
    "struct:column:center",
    "struct:column:third",
    "struct:column:fourth",
    "struct:column:escape",
    "struct:column:pallet",
  ];
  const cylinders = cylinderNames.map((name) => {
    const mesh = scene.getObjectByName(name);
    const bounds = worldBounds(mesh);
    return {
      name,
      path: objectPath(mesh),
      functionalName: name.includes("struct:column") ? "stationary mainplate support column" : "train arbor shaft",
      pivot: mesh.getWorldPosition(new THREE.Vector3()).toArray(),
      zIntervalMm: [bounds.min[2], bounds.max[2]],
      worldBounds: bounds,
      motionOwner: motionOwner(mesh),
      stationaryOrMoving: name.includes("struct:column") || name.startsWith("barrel:") ? "stationary" : "moving with named train owner",
    };
  });

  const candidatePairs = [
    {
      id: "candidate-e-fourth-wheel-pallet-column",
      gear: "fourth:wheel",
      cylinder: "struct:column:pallet",
      rationale: "large five-spoke fourth wheel against the thick stationary pallet support column highlighted in THISONE/THISONE2",
    },
    {
      id: "candidate-f-fourth-wheel-pallet-arbor",
      gear: "fourth:wheel",
      cylinder: "pallet:arbor:shaft",
      rationale: "same projected pallet axis, but the thin rotating pallet staff rather than the thick lower support column",
    },
    {
      id: "candidate-a-center-wheel-fourth-arbor",
      gear: "center:wheel",
      cylinder: "fourth:arbor:shaft",
      rationale: "steel wheel adjacent to the gold barrel, beside the balance region; long foreign shaft crosses its side-view sweep projection",
    },
    {
      id: "candidate-b-third-wheel-fourth-arbor",
      gear: "third:wheel",
      cylinder: "fourth:arbor:shaft",
      rationale: "neighboring steel train wheel sharing the same fourth-arbor vicinity",
    },
    {
      id: "candidate-c-barrel-wheel-escape-arbor",
      gear: "barrel:wheel",
      cylinder: "escape:arbor:shaft",
      rationale: "large warm wheel and a long foreign arbor appearing close in grazing projection",
    },
    {
      id: "candidate-d-fourth-wheel-center-arbor",
      gear: "fourth:wheel",
      cylinder: "center:arbor:shaft",
      rationale: "reciprocal center/fourth adjacency visible from the same profile family",
    },
  ];

  const originalMaterials = new Map();
  const originalVisibility = new Map();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    originalMaterials.set(object, object.material);
    originalVisibility.set(object, object.visible);
  });
  const dark = new THREE.MeshBasicMaterial({ color: 0x242931, side: THREE.DoubleSide });
  const green = new THREE.MeshBasicMaterial({ color: 0x39ff4f, side: THREE.DoubleSide });
  const magenta = new THREE.MeshBasicMaterial({ color: 0xff2fb3, side: THREE.DoubleSide });
  const hiddenPrefixes = ["ext:", "enc:", "readout:", "strap:", "phase4b:"];
  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.visible = !hiddenPrefixes.some((prefix) => objectPath(object).includes(prefix));
    object.material = dark;
  });
  scene.background = new THREE.Color(0x101318);
  const imageRows = [];
  const renderPair = (pair) => {
    const gear = scene.getObjectByName(pair.gear);
    const cylinder = scene.getObjectByName(pair.cylinder);
    gear.material = green;
    cylinder.material = magenta;
    const midpoint = gear.getWorldPosition(new THREE.Vector3())
      .add(cylinder.getWorldPosition(new THREE.Vector3()))
      .multiplyScalar(0.5);
    midpoint.z = (worldBounds(gear).min[2] + worldBounds(gear).max[2]) * 0.5;
    camera.position.copy(midpoint).add(new THREE.Vector3(11.5, -7.5, 0.35));
    camera.up.set(0, 1, 0);
    camera.fov = 27;
    camera.lookAt(midpoint);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);
    const source = renderer.domElement;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.drawImage(source, 0, 0);
    context.font = "bold 25px sans-serif";
    context.fillStyle = "#39ff4f";
    context.fillText(`GREEN  ${objectPath(gear)}`, 44, 52);
    context.fillStyle = "#ff2fb3";
    context.fillText(`MAGENTA  ${objectPath(cylinder)}`, 44, 88);
    context.font = "21px sans-serif";
    context.fillStyle = "#e6edf5";
    context.fillText(pair.rationale, 44, 122);
    imageRows.push({
      file: `${pair.id}.png`,
      dataUrl: canvas.toDataURL("image/png"),
      camera: { position: camera.position.toArray(), target: midpoint.toArray(), up: camera.up.toArray(), fov: camera.fov },
    });
    gear.material = dark;
    cylinder.material = dark;
  };
  candidatePairs.forEach(renderPair);
  for (const [object, material] of originalMaterials) object.material = material;
  for (const [object, visible] of originalVisibility) object.visible = visible;
  dark.dispose(); green.dispose(); magenta.dispose();
  return { browserErrors: [], wheels, cylinders, candidatePairs, imageRows };
});

for (const image of result.imageRows) {
  const data = Buffer.from(image.dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(outDir, image.file), data);
  delete image.dataUrl;
  image.bytes = data.byteLength;
}
result.browserErrors = browserErrors;
result.gate = "participant identification only — no collision distances calculated";
fs.writeFileSync(path.join(outDir, "identification-report.json"), `${JSON.stringify(result, null, 2)}\n`);
await browser.close();
console.log("Identification-only candidate suite complete");
