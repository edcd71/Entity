import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[],failed=[],checks=[];
const check=(name,value)=>{assert(value,name);checks.push(name)};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)failed.push(r.url())});
await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
const data=await (await page.request.get('http://127.0.0.1:4173/media/cube/index.json')).json();
await page.waitForFunction(total=>window.entitySphere?.total===total,data.total);
check('Moonlight atmosphere loads by default',await page.evaluate(()=>entitySphere.lighting==='moonlight'&&entitySphere.lightAmount===1));
check('Every retained image and video has a unique media particle',data.total===data.images+data.videos&&new Set(data.faces.flatMap(f=>f.items.map(i=>i.id))).size===data.total);
check('Black background with no dashboard',await page.evaluate(()=>getComputedStyle(document.body).backgroundColor==='rgb(0, 0, 0)'&&!document.querySelector('.icon-rail')&&!document.querySelector('.tools-column')));
check('No visible tool controls',await page.locator('button:visible, #hint, #hover-name, #filename, #reset').count()===0);
const cameraBefore=await page.evaluate(()=>entitySphere.camera);await page.waitForTimeout(700);check('Sphere rotates gently before interaction',await page.evaluate(before=>entitySphere.rotating&&entitySphere.camera.some((v,i)=>Math.abs(v-before[i])>.001),cameraBefore));
check('Entity title and feature copy are visible',await page.getByRole('heading',{name:'Entity',exact:true,level:1}).isVisible() && await page.locator('.intro p').isVisible());
check('The introduction uses the local Geist Serif face',await page.locator('.intro').evaluate(async intro=>{
 await document.fonts.ready;
 return Array.from(document.fonts).some(face=>face.family.includes('Geist Serif')&&face.status==='loaded') &&
   [...intro.children].every(element=>getComputedStyle(element).fontFamily.startsWith('"Geist Serif"'));
}));
check('The introduction passes gestures to the sphere',await page.locator('#entity-title').evaluate(heading=>{
 const {x,y,width,height}=heading.getBoundingClientRect();
 return document.elementFromPoint(x+width/2,y+height/2)?.id==='sphere';
}));
const stageBox=await page.locator('#stage').boundingBox();
check('Sphere canvas fills the viewport',stageBox.x===0&&stageBox.y===0&&stageBox.width===1440&&stageBox.height===1000);
const expectedFlags=data.faces.flatMap(f=>f.items).filter(item=>item.capturedAt?.slice(0,4)==='2022').map(item=>item.id).sort();
const actualFlags=await page.evaluate(()=>entitySphere.flaggedMedia.sort());
check('Only media captured in 2022 receives a blue node',JSON.stringify(actualFlags)===JSON.stringify(expectedFlags));
const center={x:stageBox.x+stageBox.width/2,y:stageBox.y+stageBox.height/2};
await page.screenshot({path:'.qa/sphere-desktop.png'});
await page.mouse.move(center.x,center.y);await page.mouse.wheel(0,-1800);await page.waitForTimeout(600);
check('Interaction stops idle rotation',await page.evaluate(()=>!entitySphere.rotating));
const after=await page.evaluate(()=>entitySphere.camera);check('Wheel zoom brings camera closer',Math.hypot(...after)<Math.hypot(...cameraBefore));
await page.mouse.wheel(0,-1600);await page.waitForFunction(()=>entitySphere.detailTiles>0);await page.waitForTimeout(1200);
check('High resolution tiles load when zoomed',await page.evaluate(()=>entitySphere.detailTiles>0));
check('Atmosphere fades when zooming into media',await page.evaluate(()=>entitySphere.lightAmount<0.15));
await page.screenshot({path:'.qa/sphere-zoom.png'});
await page.locator('#sphere').focus();await page.keyboard.press('Enter');check('Center tile opens its media',await page.locator('#viewer').evaluate(el=>el.open));
const selected=await page.evaluate(()=>entitySphere.selected),item=data.faces.flatMap(f=>f.items).find(i=>i.id===selected);
check('Viewer displays the selected tile file',await page.locator('#media img, #media video').getAttribute('src')==='/'+(item.type==='video'?item.path:item.preview).split('/').map(encodeURIComponent).join('/'));
await page.locator('#media').click();await page.waitForFunction(()=>!document.querySelector('#viewer').open);check('Closing viewer restores sphere focus',await page.locator('#sphere').evaluate(el=>el===document.activeElement));
await page.locator('#sphere').focus();await page.keyboard.press('Home');await page.waitForTimeout(500);
const rotationBefore=await page.evaluate(()=>entitySphere.camera);
await page.mouse.move(center.x,center.y);await page.mouse.down();await page.mouse.move(center.x+135,center.y+55,{steps:12});await page.mouse.up();await page.waitForTimeout(350);
check('Drag rotates without opening media',!await page.locator('#viewer').evaluate(el=>el.open)&&await page.evaluate(before=>entitySphere.camera.some((v,i)=>Math.abs(v-before[i])>.1),rotationBefore));
await page.keyboard.press('Home');await page.waitForTimeout(400);
const blueNode=await page.evaluate(()=>entitySphere.visibleMedia.find(item=>item.node&&item.type==='image'));
check('A 2022 node is visible in the sphere overview',Boolean(blueNode));
await page.mouse.click(blueNode.node.x,blueNode.node.y);
check('Selecting a blue node opens its associated media',await page.locator('#viewer').evaluate(el=>el.open)&&await page.evaluate(id=>entitySphere.selected===id,blueNode.id));
await page.locator('#media img').evaluate(img=>img.decode());
await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#viewer').open);
// Inspect real sphere selections, without any visible labels or controls.
let imageViewed=false,videoViewed=false,videoPlayback=null;
const byId=new Map(data.faces.flatMap(f=>f.items).map(item=>[item.id,item]));
for(const type of ['image','video']){
 let found=false;
 const candidates=await page.evaluate(type=>entitySphere.visibleMedia.filter(p=>p.type===type).slice(0,60),type);
 for(const candidate of candidates){
   await page.mouse.click(candidate.x,candidate.y);
   if(!await page.locator('#viewer').evaluate(el=>el.open))continue;
   const id=await page.evaluate(()=>entitySphere.selected);
   if(id===candidate.id&&byId.get(id)?.type===type){found=true;break;}
   await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#viewer').open);
 }
 check(`Visible ${type} tile opens correct file`,found&&await page.locator('#viewer').evaluate(el=>el.open));
 if(type==='image'){
  await page.locator('#media img').evaluate(img=>img.decode());imageViewed=true;
  const metadata=page.getByRole('complementary',{name:'Image metadata'});
  await page.locator('.swatch-chip').first().waitFor();
  await metadata.locator('details').first().waitFor();
  await metadata.locator('summary').first().click();
  check('Reading metadata keeps the selected image open',await page.locator('#viewer').evaluate(el=>el.open));
  check('Image metadata matches the sphere selection',await metadata.locator('dd').first().textContent()===byId.get(await page.evaluate(()=>entitySphere.selected)).name);
  await page.screenshot({path:'.qa/sphere-image.png'});
 }else{
  check('Photo metadata clears when a video is selected',await page.locator('.photo-metadata').isHidden());
  check('Photo colors clear when a video is selected',await page.locator('.photo-palette').isHidden());
  videoViewed=true;check('Video controls are hidden',await page.locator('#media video').evaluate(v=>!v.controls));
  await page.waitForFunction(()=>{
    const video=document.querySelector('#media video');
    return video?.readyState>=2&&video.currentTime>0.1;
  },undefined,{timeout:12000});
  videoPlayback=await page.locator('#media video').evaluate(v=>({readyState:v.readyState,currentTime:v.currentTime,error:v.error?.message||null})).catch(()=>({fallback:true}));
  await page.screenshot({path:'.qa/sphere-video.png'});
 }
 await page.locator('#media').click();await page.waitForFunction(()=>!document.querySelector('#viewer').open);
}
check('Individual image previews render',imageViewed);check('Individual video viewer works',videoViewed&&videoPlayback.readyState>=2&&videoPlayback.currentTime>0&&!videoPlayback.error);
check('Closing media removes video playback element',await page.locator('#media video').count()===0);
await page.locator('#sphere').focus();await page.keyboard.press('Home');
const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
mobile.on('pageerror',e=>errors.push(e.message));
await mobile.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});await mobile.waitForFunction(total=>window.entitySphere?.total===total,data.total);
await mobile.screenshot({path:'.qa/sphere-mobile.png'});
check('Mobile fills viewport without overflow',await mobile.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight));
const mobileStage=await mobile.locator('#stage').boundingBox();
const touchCenter={x:mobileStage.x+mobileStage.width/2,y:mobileStage.y+mobileStage.height/2};
const cdp=await mobile.context().newCDPSession(mobile);
const touchCamera=await mobile.evaluate(()=>entitySphere.camera);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchCenter.x-30,y:touchCenter.y-30},{x:touchCenter.x+30,y:touchCenter.y+30}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchCenter.x-85,y:touchCenter.y-80},{x:touchCenter.x+85,y:touchCenter.y+80}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await mobile.waitForTimeout(500);
check('Two-finger pinch zooms and stops rotation',await mobile.evaluate(before=>!entitySphere.rotating&&Math.hypot(...entitySphere.camera)<Math.hypot(...before),touchCamera));
check('Pinching does not open a media tile',!await mobile.locator('#viewer').evaluate(el=>el.open));
await mobile.screenshot({path:'.qa/sphere-mobile-zoom.png'});
const reduced=await browser.newPage({viewport:{width:900,height:700},reducedMotion:'reduce'});reduced.on('pageerror',e=>errors.push(e.message));reduced.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await reduced.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});await reduced.waitForFunction(()=>window.entitySphere);check('Reduced motion disables idle rotation',await reduced.evaluate(()=>!entitySphere.rotating));
for(const treatment of ['ember','aurora']){
 await reduced.goto('http://127.0.0.1:4173/?light='+treatment,{waitUntil:'networkidle'});
 await reduced.waitForFunction(total=>window.entitySphere?.total===total,data.total);
 check(`${treatment} lighting preserves media and blue flags`,await reduced.evaluate(([preset,flags])=>entitySphere.lighting===preset&&entitySphere.flaggedMedia.length===flags,[treatment,expectedFlags.length]));
}
check('No JavaScript errors',errors.length===0);check('No failed media requests',failed.length===0);
const report={checks,errors,failed,videoPlayback,total:data.total,checkedAt:new Date().toISOString()};await fs.writeFile('.qa/sphere-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await browser.close();
