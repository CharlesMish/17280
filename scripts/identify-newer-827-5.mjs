import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
page.setDefaultTimeout(300000);
await page.goto("http://127.0.0.1:5173/?static=1&t=0.104&explode=0", { waitUntil: "commit", timeout: 60000 });
await page.waitForFunction(() => globalThis.__WATCH__?.sceneDump !== undefined);
await page.waitForTimeout(500);
const rows = await page.evaluate(() => globalThis.__WATCH__.sceneDump().filter((r) =>
  /calibre\/(center|third):pose/.test(r.path) || /DisplayDriveRoot/.test(r.path)
));
console.log(JSON.stringify(rows, null, 2));

const cdp = await page.context().newCDPSession(page);
await cdp.send("Runtime.evaluate", { expression: "import('/node_modules/.vite/deps/three.js').then(m => globalThis.__T8275=m)", awaitPromise: true });
const proto = await cdp.send("Runtime.evaluate", { expression: "__T8275.Scene.prototype" });
const instances = await cdp.send("Runtime.queryObjects", { prototypeObjectId: proto.result.objectId });
await cdp.send("Runtime.callFunctionOn", {
  objectId: instances.objects.objectId,
  functionDeclaration: "function(){globalThis.__S8275=this.find(x=>x.getObjectByName&&x.getObjectByName('calibre'))}",
});
const exact = await page.evaluate(() => {
  const T = globalThis.__T8275, S = globalThis.__S8275;
  globalThis.__WATCH__.setTime(.104); globalThis.__WATCH__.capture(); S.updateMatrixWorld(true);
  const path = (o) => { const a=[]; for(let c=o;c;c=c.parent) a.push(c.name||c.type); return a.reverse().join('/'); };
  const row = (name) => { const o=S.getObjectByName(name); o.geometry.computeBoundingBox(); const b=o.geometry.boundingBox; const wb=b.clone().applyMatrix4(o.matrixWorld); return { name, path:path(o), children:o.children.map(x=>x.name||x.type), local:{min:b.min.toArray(),max:b.max.toArray()}, world:{min:wb.min.toArray(),max:wb.max.toArray()}, matrix:o.matrixWorld.toArray(), motionRotation:o.parent.parent.rotation.z }; };
  return [row('center:wheel'),row('center:pinion'),row('third:wheel'),row('third:pinion')];
});
console.log(JSON.stringify({ exact }, null, 2));
await browser.close();
