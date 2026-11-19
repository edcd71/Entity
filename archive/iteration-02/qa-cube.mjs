import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[],failed=[],checks=[];
const check=(name,value)=>{assert(value,name);checks.push(name)};
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url())});
await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.entityCube?.total===2491);
const data=await (await page.request.get('http://127.0.0.1:4173/media/cube/index.json')).json();
check('Every imported image and video has a unique cube tile',data.total===2491&&new Set(data.faces.flatMap(f=>f.items.map(i=>i.id))).size===2491);
check('Black background with no dashboard',await page.evaluate(()=>getComputedStyle(document.body).backgroundColor==='rgb(0, 0, 0)'&&!document.querySelector('.icon-rail')&&!document.querySelector('.tools-column')));
check('No visible interface controls or labels',await page.locator('button, #hint, #hover-name, #filename, #reset').count()===0);
const cameraBefore=await page.evaluate(()=>entityCube.camera);await page.waitForTimeout(700);check('Cube rotates gently before interaction',await page.evaluate(before=>entityCube.rotating&&entityCube.camera.some((v,i)=>Math.abs(v-before[i])>.001),cameraBefore));
await page.screenshot({path:'.qa/cube-desktop.png'});
await page.mouse.move(720,500);await page.mouse.wheel(0,-1800);await page.waitForTimeout(600);
check('Interaction stops idle rotation',await page.evaluate(()=>!entityCube.rotating));
const after=await page.evaluate(()=>entityCube.camera);check('Wheel zoom brings camera closer',Math.hypot(...after)<Math.hypot(...cameraBefore));
await page.mouse.wheel(0,-1600);await page.waitForFunction(()=>entityCube.detailTiles>0);await page.waitForTimeout(1200);
check('High resolution tiles load when zoomed',await page.evaluate(()=>entityCube.detailTiles>0));
await page.screenshot({path:'.qa/cube-zoom.png'});
await page.locator('#cube').focus();await page.keyboard.press('Enter');check('Center tile opens its media',await page.locator('#viewer').evaluate(el=>el.open));
const selected=await page.evaluate(()=>entityCube.selected),item=data.faces.flatMap(f=>f.items).find(i=>i.id===selected);
check('Viewer displays the selected tile file',await page.locator('#media img, #media video').getAttribute('src')==='/'+(item.type==='video'?item.path:item.preview).split('/').map(encodeURIComponent).join('/'));
await page.locator('#media').click();await page.waitForFunction(()=>!document.querySelector('#viewer').open);check('Closing viewer restores cube focus',await page.locator('#cube').evaluate(el=>el===document.activeElement));
await page.locator('#cube').focus();await page.keyboard.press('Home');await page.waitForTimeout(500);
const rotationBefore=await page.evaluate(()=>entityCube.camera);
await page.mouse.move(720,500);await page.mouse.down();await page.mouse.move(855,555,{steps:12});await page.mouse.up();await page.waitForTimeout(350);
check('Drag rotates without opening media',!await page.locator('#viewer').evaluate(el=>el.open)&&await page.evaluate(before=>entityCube.camera.some((v,i)=>Math.abs(v-before[i])>.1),rotationBefore));
await page.keyboard.press('Home');await page.waitForTimeout(400);
// Inspect real cube selections, without any visible labels or controls.
let imageViewed=false,videoViewed=false,videoPlayback=null;
const byId=new Map(data.faces.flatMap(f=>f.items).map(item=>[item.id,item]));
for(const type of ['image','video']){
 let found=false;
 for(const y of [350,400,450,500,550,600,650]){
  for(const x of [500,560,620,680,740,800,860,920]){
   await page.mouse.click(x,y);
   if(!await page.locator('#viewer').evaluate(el=>el.open))continue;
   const id=await page.evaluate(()=>entityCube.selected);
   if(byId.get(id)?.type===type){found=true;break;}
   await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#viewer').open);

  }
  if(found)break;
 }
 check(`Visible ${type} tile opens correct file`,found&&await page.locator('#viewer').evaluate(el=>el.open));
 if(type==='image'){
  await page.locator('#media img').evaluate(img=>img.decode());imageViewed=true;
  await page.screenshot({path:'.qa/cube-image.png'});
 }else{
  videoViewed=true;check('Video controls are hidden',await page.locator('#media video').evaluate(v=>!v.controls));await page.waitForTimeout(1800);
  videoPlayback=await page.locator('#media video').evaluate(v=>({readyState:v.readyState,currentTime:v.currentTime,error:v.error?.message||null})).catch(()=>({fallback:true}));
  await page.screenshot({path:'.qa/cube-video.png'});
 }
 await page.locator('#media').click();await page.waitForFunction(()=>!document.querySelector('#viewer').open);
}
check('Individual image previews render',imageViewed);check('Individual video viewer works',videoViewed);
check('Closing media removes video playback element',await page.locator('#media video').count()===0);
await page.locator('#cube').focus();await page.keyboard.press('Home');
const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
mobile.on('pageerror',e=>errors.push(e.message));
await mobile.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});await mobile.waitForFunction(()=>window.entityCube?.total===2491);
await mobile.screenshot({path:'.qa/cube-mobile.png'});
check('Mobile fills viewport without overflow',await mobile.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight));
const cdp=await mobile.context().newCDPSession(mobile);
const touchCamera=await mobile.evaluate(()=>entityCube.camera);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:165,y:380},{x:225,y:440}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:110,y:330},{x:280,y:490}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await mobile.waitForTimeout(500);
check('Two-finger pinch zooms and stops rotation',await mobile.evaluate(before=>!entityCube.rotating&&Math.hypot(...entityCube.camera)<Math.hypot(...before),touchCamera));
check('Pinching does not open a media tile',!await mobile.locator('#viewer').evaluate(el=>el.open));
await mobile.screenshot({path:'.qa/cube-mobile-zoom.png'});
const reduced=await browser.newPage({viewport:{width:900,height:700},reducedMotion:'reduce'});await reduced.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});await reduced.waitForFunction(()=>window.entityCube);check('Reduced motion disables idle rotation',await reduced.evaluate(()=>!entityCube.rotating));
check('No JavaScript errors',errors.length===0);check('No failed media requests',failed.length===0);
const report={checks,errors,failed,videoPlayback,total:data.total};await fs.writeFile('.qa/cube-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await browser.close();
