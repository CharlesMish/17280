import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

function assess(report) {
  // Camera interpolation is presentation state. Fresh query captures verify
  // authored cameras separately; compare every assembly field exactly here.
  const authority=({currentCamera,...assembly})=>assembly;
  for(const row of report.records) row.zeroStateRestored=
    JSON.stringify(authority(row.beforeExploded))===JSON.stringify(authority(row.afterExploded));
  report.comparisonScope='All assembled/exploded authority fields except currentCamera; camera presets verified by fresh-query renders';
  report.accepted=report.errors.length===0&&report.records.every(r=>r.displayDriveUnchanged&&r.zeroStateRestored&&r.heroViewPreserved)
    &&report.records.at(-1).restoredPageInitialGeometry===true;
  return report;
}
if(process.argv[2]==='--from-evidence') {
  const raw=fs.readFileSync(process.argv[3]);
  const report=assess(JSON.parse(raw));
  report.replayedCaptureSha256=crypto.createHash('sha256').update(raw).digest('hex');
  fs.writeFileSync(process.argv[4],JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({accepted:report.accepted,output:process.argv[4]}));
  process.exit(report.accepted?0:1);
}
const [base='http://127.0.0.1:5210', output='/tmp/train-design-switching.json']=process.argv.slice(2);
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist']});
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:320,height:240}});
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  page.setDefaultTimeout(240000);
  page.on('pageerror', error=>errors.push(String(error)));
  await page.goto(`${base}/?static=1&t=0.104&view=r1FinalHero&refinement=graphite-finish`,{waitUntil:'commit'});
  await page.waitForFunction(()=>typeof window.__WATCH__?.setExperiment==='function',null,{polling:100});
  const report=await page.evaluate(()=>{
    const w=window.__WATCH__, records=[];
    const baseline=w.displayDriveReport([0,10,60]);
    const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    for(const name of ['center-web','train-bridge','center-web','none']) {
      w.setView('r1FinalHero');
      w.setExperiment(name);
      const presentation=w.releasePresentationReport();
      const display=w.displayDriveReport([0,10,60]);
      const before=w.explodedAssemblyReport();
      w.setExplode(1); w.setExplode(0); w.setView('r1FinalHero');
      const after=w.explodedAssemblyReport();
      records.push({name, experiment:w.experimentReport(), presentation,
        heroViewPreserved:presentation.current.view==='r1FinalHero',
        displayDriveUnchanged:equal(display,baseline),
        zeroStateRestored:equal(before,after),
        beforeExploded:before, afterExploded:after,
        restoredPageInitialGeometry:name==='none'?after.assembledEquivalence.exactAtZero:null,
        expectedInitialBridgeAuthorityDifference:name==='train-bridge'?before.assembledEquivalence.exactAtZero===false:null,
      });
    }
    return {baselineDisplayDrive:baseline, records};
  });
  report.errors=errors;
  assess(report);
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({accepted:report.accepted,records:report.records.map(({name,displayDriveUnchanged,zeroStateRestored,restoredPageInitialGeometry})=>({name,displayDriveUnchanged,zeroStateRestored,restoredPageInitialGeometry})),output}));
  if(!report.accepted)process.exitCode=1;
} finally { await browser.close(); }
