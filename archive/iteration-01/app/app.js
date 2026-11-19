import { icon } from './icons.js';
import { chronologyMarkup, mountChronology } from './chronology.js';
import { paletteToolMarkup, mountPaletteTool, hexToLab, closestColor } from './colors.js';
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const esc = value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const fmt = n=>Number(n).toLocaleString('en-US');
const bytes = n=>n>=1e9?`${(n/1e9).toFixed(2)} GB`:n>=1e6?`${(n/1e6).toFixed(1)} MB`:`${Math.round(n/1e3)} KB`;
const url = p=>'/'+p.split('/').map(encodeURIComponent).join('/');
const readSaved=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
const persist=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{toast('Browser storage is unavailable. Changes last for this session.')}};
const saved = new Set(readSaved('entity:saved',[]));
const state={catalog:null,items:[],view:'timeline',period:null,type:'all',search:'',camera:'',sort:'newest',selected:null,limit:60,large:false,flyout:null};
let filtered=[],metadataRequest=0,inspectorOpener=null,paletteData=null,paletteTool=null,colorScores=new Map();
state.color=null;state.colorLabel='';state.colorTolerance=100;
const nav=[{id:'library',label:'Library',icon:'kiln'},{id:'timeline',label:'Timeline',icon:'wheel'},{id:'places',label:'Places',icon:'leaf'},{id:'saved',label:'Saved',icon:'spark'},{id:'archive',label:'Archive',icon:'stone'}];
const views={library:['The library','Every frame has a little more to tell.'],timeline:['Across time','Turn the cube. Find a moment. Follow its story.'],places:['A sense of place','Coordinates carried home with each frame.'],saved:['Held close','A few frames worth coming back to.'],archive:['Inside the archive','An honest look at what your files contain.']};
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,3300)}
function captureDay(item){return item.capturedAt?.slice(0,10)||''}
function dateLabel(item,long=false){if(!item.capturedAt)return 'Capture date unavailable';const part=captureDay(item);const d=new Date(`${part}T12:00:00`);return Number.isNaN(d.valueOf())?part:d.toLocaleDateString('en-US',{month:long?'long':'short',day:'numeric',year:long?'numeric':undefined})}
function duration(item){if(!Number.isFinite(item.duration))return '';const s=Math.floor(item.duration);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
function activeFilters(){return state.type!=='all'||state.search||state.camera||state.color}
function filterItems(){
 const q=state.search.trim().toLowerCase();
 let items=state.items.filter(item=>{
  if(state.view==='saved'&&!saved.has(item.id))return false;
  if(state.view==='places'&&!Number.isFinite(item.latitude))return false;
  if(state.type==='live'&&!item.liveVideo)return false;
  if(['image','video'].includes(state.type)&&item.type!==state.type)return false;
  if(state.camera&&item.camera!==state.camera)return false;
  if(state.color&&state.colorTolerance<100&&(!colorScores.get(item.id)||colorScores.get(item.id).delta>state.colorTolerance))return false;
  return !q||[item.name,item.camera,item.lens,item.capturedAt,item.format,item.latitude,item.longitude].filter(x=>x!=null).join(' ').toLowerCase().includes(q);
 });
 items.sort((a,b)=>{
  if(state.sort==='color'&&state.color)return (colorScores.get(a.id)?.delta??Infinity)-(colorScores.get(b.id)?.delta??Infinity)||a.name.localeCompare(b.name);
  if(state.sort==='name')return a.name.localeCompare(b.name);
  if(state.sort==='size')return b.bytes-a.bytes;
  const ad=a.capturedAt,bd=b.capturedAt;
  if(!ad&&!bd)return a.name.localeCompare(b.name);
  if(!ad)return 1;if(!bd)return -1;
  return state.sort==='oldest'?ad.localeCompare(bd):bd.localeCompare(ad);
 });return items;
}
function card(item){const selected=state.selected===item.id;return `<article class="media-card ${selected?'selected':''}" data-id="${esc(item.id)}">
 <button class="media-button" data-select="${esc(item.id)}" aria-label="Inspect ${esc(item.name)}" aria-pressed="${selected}"><div class="media-frame">${item.preview?`<img src="${url(item.preview)}" alt="${esc(item.name)}" loading="lazy" decoding="async">`:`<div class="fallback-preview">${icon(item.type==='video'?'play':'camera')}<span>Preview unavailable</span></div>`}<div class="media-badges"><span>${item.liveVideo?icon('live')+' LIVE':item.type==='video'?icon('play')+' '+duration(item):''}</span><span>${item.format}</span></div></div><div class="file-caption"><span>${esc(item.name)}</span><span>${item.width&&item.height?`${item.width} × ${item.height}`:''}</span></div><div class="file-subcaption">${dateLabel(item)}${Number.isFinite(item.latitude)?' · '+icon('pin'):''}${state.color&&colorScores.get(item.id)?`<span class="color-match" title="Closest preview color · Lab distance"><i style="background:${colorScores.get(item.id).hex}"></i>ΔE ${colorScores.get(item.id).delta.toFixed(1)}</span>`:''}</div></button><button class="saved-mark" data-save="${esc(item.id)}" aria-label="${saved.has(item.id)?'Unsave':'Save'} ${esc(item.name)}" aria-pressed="${saved.has(item.id)}">${icon('spark')}</button></article>`}
function grid(items){return `<div class="media-grid ${state.large?'large':''}">${items.map(card).join('')}</div>`}
function render(){
 if(!state.catalog)return;
 filtered=filterItems();
 $('#view-title').innerHTML=esc(views[state.view][0])+`<span class="heading-count">${fmt(state.view==='archive'?state.catalog.sourceFiles:filtered.length)}</span>`;
 $('#view-description').textContent=views[state.view][1];
 $('#breadcrumb').textContent=`B / YOUR ARCHIVE / ${state.view.toUpperCase()}`;
 $('#result-count').textContent=state.view==='archive'?`${fmt(state.catalog.sourceFiles)} source files · ${bytes(state.catalog.sourceBytes)}`:`${fmt(filtered.length)} ${filtered.length===1?'item':'items'}${state.view==='places'?' with GPS coordinates':''}`;
 $('#result-note').textContent=state.color?`MATCHING ${state.color}`:state.view==='places'?'EMBEDDED GPS ONLY':'ORIGINALS PRESERVED';
 $('#clear-filters').hidden=!activeFilters()||state.view==='archive';
 $('.library-controls').hidden=state.view==='archive';
 $$('.media-tab').forEach(b=>{b.classList.toggle('active',b.dataset.type===state.type);b.setAttribute('aria-pressed',String(b.dataset.type===state.type))});
 $$('.nav-item').forEach(b=>{if(b.dataset.view===state.view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 const visible=filtered.slice(0,state.limit);
 $('#load-more-wrap').hidden=state.view==='archive'||state.view==='places'||visible.length>=filtered.length;
 $('#page-progress').textContent=`${fmt(visible.length)} OF ${fmt(filtered.length)}`;
 if(state.view==='archive')renderArchive();
 else if(!filtered.length)$('#content').innerHTML=`<div class="empty-state">${icon(state.view==='saved'?'spark':'search')}<h2>${state.view==='saved'&&!activeFilters()?'Keep something close.':'No frames here yet.'}</h2><p>${state.view==='saved'&&!activeFilters()?'Use the small spark on a photo to save it here.':'Try a different search or clear your filters.'}</p>${activeFilters()?'<button class="outline-button" data-clear>Clear filters</button>':''}</div>`;
 else if(state.view==='timeline'){
  $('#content').innerHTML=chronologyMarkup();
  mountChronology($('#content'),filtered,state.period,(key,items,label)=>{
    state.period=key;
    $('#chapter-title').textContent=label;
    $('#chapter-count').textContent=`${fmt(items.length)} ITEMS`;
    $('#chapter-grid').innerHTML=grid(items.slice(0,state.limit));
    $('#load-more-wrap').hidden=state.limit>=items.length;
    $('#page-progress').textContent=`${fmt(Math.min(state.limit,items.length))} OF ${fmt(items.length)}`;
  });
 }else if(state.view==='places')renderPlaces();
 else $('#content').innerHTML=grid(visible);
 $('#footer-total').textContent=`${fmt(state.catalog.sourceFiles)} FILES · ${bytes(state.catalog.sourceBytes)} · LOCAL ARCHIVE`;
}
function renderPlaces(){
 const points=filtered;
 // Equirectangular coordinate plot. This deliberately does not fetch or imply a basemap.
 const dots=points.map(item=>{const x=(item.longitude+180)/360*800,y=(90-item.latitude)/180*400;return `<circle cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="3" fill="var(--accent)" fill-opacity=".55" data-point="${esc(item.id)}" tabindex="0" role="button" aria-label="Inspect ${esc(item.name)}"><title>${esc(item.name)} · ${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}</title></circle>`}).join('');
 const lines=Array.from({length:7},(_,i)=>`<path d="M${i*133.333} 0v400"/>`).join('')+Array.from({length:5},(_,i)=>`<path d="M0 ${i*100}h800"/>`).join('');
 $('#content').innerHTML=`<div class="places-layout"><section class="coordinate-map" aria-label="GPS coordinate plot"><svg viewBox="0 0 800 400" role="group" aria-label="Longitude from 180 west to 180 east; latitude from 90 north to 90 south"><g stroke="var(--line)" stroke-width="1">${lines}</g><path d="M0 200h800M400 0v400" stroke="var(--muted)" opacity=".3" stroke-dasharray="3 5"/><g fill="var(--muted)" font-family="monospace" font-size="10"><text x="8" y="17">90° N</text><text x="8" y="392">90° S</text><text x="365" y="392">0°</text><text x="740" y="392">180° E</text></g>${dots}</svg><div class="map-caption"><span>GPS coordinate plot · select a point to inspect</span><span>Coordinates only; no map tiles loaded.</span></div></section><div class="places-list">${points.slice(0,120).map(item=>`<button class="place-item" data-select="${esc(item.id)}">${item.preview?`<img src="${url(item.preview)}" alt="" loading="lazy">`:''}<span><strong>${esc(item.name)}</strong><span class="micro">${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}</span></span></button>`).join('')}</div></div>`;
}
function renderArchive(){
 const all=state.catalog.items,hasDate=all.filter(i=>i.capturedAt).length,hasGPS=all.filter(i=>Number.isFinite(i.latitude)).length,hasCamera=all.filter(i=>i.camera).length;
 const formats={};for(const item of all)formats[item.format]=(formats[item.format]||0)+1;
 const dates=all.map(i=>i.capturedAt?.slice(0,10)).filter(Boolean).sort();
 const duplicateHashes=new Set(),seen=new Set();for(const item of all){if(seen.has(item.sha256))duplicateHashes.add(item.sha256);seen.add(item.sha256)}
 $('#content').innerHTML=`<div class="archive-summary"><div class="stat"><strong>${fmt(state.catalog.sourceFiles)}</strong><span>Original files</span></div><div class="stat"><strong>${bytes(state.catalog.sourceBytes)}</strong><span>Preserved on this Mac</span></div><div class="stat"><strong>${fmt(all.filter(i=>i.liveVideo).length)}</strong><span>Confirmed Live Photo pairs</span></div><div class="stat"><strong>${fmt(hasDate)}</strong><span>Files with capture dates</span></div><div class="stat"><strong>${fmt(hasGPS)}</strong><span>Files with GPS coordinates</span></div><div class="stat"><strong>${fmt(hasCamera)}</strong><span>Files with camera details</span></div></div><section class="archive-section"><h2>The shape of the collection</h2><table class="archive-table"><thead><tr><th scope="col">Format</th><th scope="col">Description</th><th scope="col">Files</th></tr></thead><tbody>${Object.entries(formats).sort((a,b)=>b[1]-a[1]).map(([format,n])=>`<tr><td>${esc(format)}</td><td>${format==='HEIC'?'High-efficiency photographs':['MOV','MP4'].includes(format)?'Video, including Live Photo companions':'Images'}</td><td>${fmt(n)}</td></tr>`).join('')}<tr><td>AAE</td><td>Preserved edit sidecars</td><td>${fmt(state.catalog.sidecars)}</td></tr></tbody></table><div class="archive-callout"><strong>Source files stay untouched.</strong> Previews are generated copies. Capture dates come from embedded EXIF or QuickTime fields; missing dates stay unknown. Live Photos are paired only when their embedded content identifiers match. ${fmt(all.filter(i=>i.isLiveCompanion).length)} video companions are grouped with their photographs in the library.<br><br>${dates.length?`Capture dates span ${esc(dates[0])} to ${esc(dates.at(-1))}. `:''}${duplicateHashes.size?`${duplicateHashes.size} repeated content hash groups found.`:'No byte-identical media duplicates found.'} Saved selections are stored in this browser.</div></section>`;
}
function clearFilters(){state.color=null;state.colorTolerance=100;if(state.sort==='color'){state.sort='newest';$('#sort').value='newest'}paletteTool?.reset();state.type='all';state.search='';state.camera='';state.limit=60;$('#search').value='';$('#camera-filter').value='';render()}
function changeView(view,openOptions=true){state.view=view;state.limit=60;closeInspector(false);render();if(openOptions)openFlyout(view);window.scrollTo({top:0,behavior:'instant'})}
function openFlyout(id){
 if(state.flyout===id){closeFlyout();return}state.flyout=id;
 const titles={...Object.fromEntries(nav.map(n=>[n.id,n.label])),palette:'Rail color'};
 const options={library:[['all','All media'],['image','Photographs'],['video','Videos'],['live','Live Photos']],timeline:[['newest','Newest first'],['oldest','Oldest first']],places:[['all','All located media'],['image','Located photographs'],['video','Located videos']],saved:[['all','All saved media'],['image','Saved photographs'],['video','Saved videos']]};
 const body=id==='palette'?`<div class="color-options">${[['96','#a7b594','Moss'],['215','#9aaec3','Slate'],['32','#b99a7b','Clay'],['0','#b08787','Rose']].map(([h,c,l])=>`<button style="background:${c}" data-hue="${h}" aria-label="${l}" title="${l}"></button>`).join('')}</div>`:id==='archive'?'<p class="flyout-hint">File counts, extraction coverage, and preserved originals.</p><button class="flyout-option" data-export>Export current index ↗</button>':(options[id]||[]).map(([value,label])=>`<button class="flyout-option" data-option="${value}" data-option-view="${id}">${label}</button>`).join('');
 $('#rail-flyout').innerHTML=`<p class="flyout-title">${titles[id]}</p>${body}`;$('#rail-flyout').hidden=false;
 const button=$(`[data-view="${id}"]`)||$('#rail-palette');$('#rail-flyout').style.top=`${Math.max(25,button.offsetTop-5)}px`;
 $$('.nav-item').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.view===id)));$('#rail-palette').setAttribute('aria-expanded',String(id==='palette'));
}
function closeFlyout(){$('#rail-flyout').hidden=true;state.flyout=null;$$('.nav-item').forEach(b=>b.setAttribute('aria-expanded','false'));$('#rail-palette').setAttribute('aria-expanded','false')}
function toggleSave(id){if(saved.has(id))saved.delete(id);else saved.add(id);persist('entity:saved',[...saved]);render();if(state.selected===id)renderInspector(state.items.find(i=>i.id===id));toast(saved.has(id)?'Saved to Held close.':'Removed from saved media.')}
function row(label,value){return `<div class="inspector-row"><dt>${esc(label)}</dt><dd>${value===null||value===undefined||value===''?'—':esc(value)}</dd></div>`}
function renderInspector(item){
 if(!item)return;const exposure=item.exposure ? item.exposure<1?`1/${Math.round(1/item.exposure)} s`:`${item.exposure} s`:null;
 $('#inspector').innerHTML=`<div class="inspector-top"><span class="micro">THE DETAILS</span><button class="icon-button" data-close-inspector aria-label="Close inspector">×</button></div><button class="inspector-preview" data-preview="${esc(item.id)}" aria-label="Open preview of ${esc(item.name)}" style="width:100%;padding:0">${item.preview?`<img src="${url(item.preview)}" alt="${esc(item.name)}">`:`<div class="fallback-preview" style="height:150px">${icon('camera')}Preview unavailable</div>`}<span class="preview-expand">Expand ↗</span></button><h2 class="inspector-title">${esc(item.name)}</h2><p class="inspector-filetype micro">${item.format} · ${bytes(item.bytes)}${item.liveVideo?' · LIVE PHOTO':''}</p><div class="inspector-actions"><button data-save="${esc(item.id)}" aria-pressed="${saved.has(item.id)}">${icon('spark')}${saved.has(item.id)?'Saved':'Save'}</button><a href="${url(item.path)}" download="${esc(item.name)}">${icon('download')}Original</a></div><section class="inspector-section"><h3>${icon('clock')} A moment in time</h3><dl>${row('Captured',item.capturedAt?dateLabel(item,true):null)}${row('Time',item.capturedAt?.slice(11,19))}${row('Time zone',item.timezone || (item.capturedAt?.match(/(Z|[+-]\d{2}:?\d{2})$/)?.[1]) || 'Not embedded')}${row('Source',item.dateSource)}</dl></section><section class="inspector-section"><h3>${icon('camera')} Behind the frame</h3><dl>${row('Camera',item.camera)}${row('Lens',item.lens)}${row('Dimensions',item.width&&item.height?`${item.width} × ${item.height}`:null)}${item.type==='video'?row('Duration',duration(item))+row('Frame rate',item.fps?`${Number(item.fps).toFixed(2)} fps`:null):row('Aperture',item.aperture?`ƒ/${item.aperture}`:null)+row('Shutter',exposure)+row('ISO',item.iso)+row('Focal length',item.focalLength?`${item.focalLength} mm`:null)}</dl></section><section class="inspector-section"><h3>${icon('pin')} Where it happened</h3>${Number.isFinite(item.latitude)?`<div class="location-card"><p class="coordinates">${item.latitude.toFixed(6)}<br>${item.longitude.toFixed(6)}</p><a href="https://maps.apple.com/?ll=${encodeURIComponent(item.latitude+','+item.longitude)}" target="_blank" rel="noopener noreferrer">Open in Maps ↗</a><span class="micro">GPS FROM ORIGINAL FILE</span></div>`:'<p class="inspector-note">No GPS coordinates embedded in this file.</p>'}</section>${item.liveVideo?`<section class="inspector-section"><h3>${icon('live')} A little movement</h3><button class="text-button" data-live="${esc(item.id)}">Play Live Photo ${icon('play')}</button><p class="inspector-note">Paired using the embedded content identifier.</p></section>`:''}${item.sidecars?.length?`<section class="inspector-section"><h3>Related edit sidecar</h3>${item.sidecars.map(p=>`<a class="text-button" href="${url(p)}" download>${esc(p.split('/').at(-1))} ↗</a>`).join('')}<p class="inspector-note">Preserved for reference. Apple Photos edits are not applied to this preview.</p></section>`:''}${paletteData?.items[item.id]?`<section class="inspector-section"><h3>Colors in this frame</h3><div class="inspector-palette">${paletteData.items[item.id].palette.map(color=>`<button style="background:${color.hex}" data-frame-color="${color.hex}" aria-label="Match ${color.hex}" title="${color.hex} · ${Math.round(color.weight*100)}%"></button>`).join('')}</div><p class="inspector-palette-label">Sampled from the preview. Select a swatch to find related colors.</p></section>`:''}<section class="inspector-section"><details id="raw-details"><summary>All extracted metadata</summary><pre class="raw-metadata" id="raw-metadata">Open to read original fields.</pre></details><button class="text-button" data-export-item="${esc(item.id)}" style="margin-top:15px">Export metadata JSON ↗</button></section><p class="inspector-provenance">${icon('check')}Untouched original. SHA-256 verified on import.</p><p class="inspector-key">${esc(item.sha256)}</p>`;
 const request=++metadataRequest;
 $('#raw-details').addEventListener('toggle',async event=>{
  if(!event.target.open)return;
  try{const response=await fetch(url(item.metadataPath));if(!response.ok)throw Error('Unavailable');const raw=await response.json();if(request===metadataRequest)$('#raw-metadata').textContent=JSON.stringify(raw,null,2)}catch{if(request===metadataRequest)$('#raw-metadata').textContent='Metadata could not be loaded.'}
 },{once:true});
}
function selectItem(id,opener=document.activeElement){inspectorOpener=opener;const item=state.items.find(i=>i.id===id);if(!item)return;state.selected=id;document.body.classList.add('inspecting');$('#inspector').hidden=false;$('#tool-empty').hidden=true;if(innerWidth<=960){document.body.classList.add('tools-open');$('#tools-toggle').setAttribute('aria-expanded','true')}renderInspector(item);$$('.media-card').forEach(card=>{card.classList.toggle('selected',card.dataset.id===id);$('.media-button',card)?.setAttribute('aria-pressed',String(card.dataset.id===id))});closeFlyout();$('#inspector [data-close-inspector]').focus({preventScroll:true});$('#inspector').scrollIntoView({block:'start',behavior:'instant'})}
function closeInspector(restoreFocus=true){const id=state.selected,wasOpen=!$('#inspector').hidden;state.selected=null;document.body.classList.remove('inspecting');$('#inspector').hidden=true;$('#tool-empty').hidden=false;$('#tools-column').scrollTop=0;metadataRequest++;$$('.media-card.selected').forEach(c=>{c.classList.remove('selected');$('.media-button',c)?.setAttribute('aria-pressed','false')});if(wasOpen&&restoreFocus){if(innerWidth<=960)setToolsOpen(false);const target=inspectorOpener?.isConnected?inspectorOpener:$(`[data-select="${CSS.escape(id||'')}"]`);target?.focus({preventScroll:true})}return id}
function preview(id,live=false){const item=state.items.find(i=>i.id===id);if(!item)return;state.selected=id;$('#viewer-title').textContent=item.name;$('#viewer-caption').textContent=`${dateLabel(item,true)} · ${item.camera||'Camera unknown'} · ${item.width||'?'} × ${item.height||'?'}${item.type==='image'&&!live?' · GENERATED PREVIEW':''}`;
 const path=live?item.liveVideo:item.path;
 if(item.type==='video'||live){$('#viewer-media').innerHTML=`<video controls autoplay playsinline src="${url(path)}"${item.preview?` poster="${url(item.preview)}"`:''}></video>`;const video=$('video',$('#viewer-media'));video.addEventListener('error',()=>{const note=document.createElement('p');note.className='inspector-note';note.textContent='This browser cannot play the original codec. Download the original to open it on your Mac.';$('#viewer-media').append(note)},{once:true});video.play().catch(()=>{});
 }else $('#viewer-media').innerHTML=item.preview?`<img src="${url(item.preview)}" alt="${esc(item.name)}">`:'<p>Preview unavailable. Download the original from the inspector.</p>';
 if(!$('#viewer').open)$('#viewer').showModal();const index=filtered.findIndex(i=>i.id===id);$('#viewer-prev').disabled=index<=0;$('#viewer-next').disabled=index<0||index>=filtered.length-1;
}
function movePreview(delta){const index=filtered.findIndex(i=>i.id===state.selected),item=filtered[index+delta];if(item)preview(item.id)}
function downloadJSON(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000)}
function exportCatalog(){if(!state.catalog)return;downloadJSON({exportedAt:new Date().toISOString(),source:state.catalog.source,filters:{view:state.view,type:state.type,camera:state.camera,search:state.search,colorHex:state.color,pantoneReference:state.colorLabel||null,colorTolerance:state.colorTolerance},colorMethod:state.color?'Preview palette; CIE Lab distance (Delta E 76); no official Pantone mapping':null,items:filtered.map(item=>state.color?{...item,colorMatch:colorScores.get(item.id)||null}:item)},'entity-index.json');toast('Exported the current media index.')}
async function exportItem(id){const item=state.items.find(i=>i.id===id);try{const response=await fetch(url(item.metadataPath));if(!response.ok)throw Error();downloadJSON({file:item,metadata:await response.json()},`${item.name}.metadata.json`)}catch{toast('Could not read this metadata. Please try again.')}}
// Rail 04: source dimensions, shell, Stoneware glyphs, label mode, collapse and flyouts.
$('#nav-items').innerHTML=nav.map(n=>`<button class="nav-item" data-view="${n.id}" aria-label="${n.label}" title="${n.label}" aria-expanded="false" aria-controls="rail-flyout"${n.id==='library'?' aria-current="page"':''}>${icon(n.icon)}<span class="nav-label">${n.label}</span></button>`).join('');
$('#rail-labels').innerHTML=icon('sparrow');$('#rail-collapse').innerHTML=icon('chevron');$('#theme-toggle').innerHTML=icon('moon');$('#search-icon').innerHTML=icon('search');$('#density').innerHTML=icon('grid');
$('#nav-items').addEventListener('click',event=>{const b=event.target.closest('[data-view]');if(b)changeView(b.dataset.view)});
$('#nav-items').addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;const buttons=$$('.nav-item'),i=buttons.indexOf(document.activeElement);let next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;event.preventDefault();buttons[next].focus()});
$('#rail-collapse').onclick=()=>{const collapsed=$('#rail').classList.toggle('collapsed');$('#rail-collapse').setAttribute('aria-expanded',String(!collapsed));$('#rail-collapse').setAttribute('aria-label',collapsed?'Expand navigation':'Collapse navigation');$('#rail-collapse').title=collapsed?'Expand navigation':'Collapse navigation';$('#rail-content').inert=collapsed;closeFlyout()};
$('#rail-labels').onclick=()=>{const labels=$('#rail').classList.toggle('labels');$('#rail-labels').setAttribute('aria-pressed',String(labels));$('#rail-labels').setAttribute('aria-label',labels?'Show navigation icons':'Show navigation labels');closeFlyout()};
$('#rail-palette').onclick=()=>openFlyout('palette');
$('#rail').addEventListener('pointermove',event=>{const r=$('#rail').getBoundingClientRect();$('#rail').style.setProperty('--pointer-x',`${event.clientX-r.left}px`);$('#rail').style.setProperty('--pointer-y',`${event.clientY-r.top}px`)});
let drag=null;
function clampRail(x,y){const r=$('#rail').getBoundingClientRect();return {x:Math.max(8,Math.min(window.innerWidth-r.width-8,x)),y:Math.max(8,Math.min(window.innerHeight-r.height-40,y))}}
function positionRail(x,y){const p=clampRail(x,y);$('#rail-anchor').style.left=p.x+'px';$('#rail-anchor').style.top=p.y+'px'}
$('#rail-grip').addEventListener('pointerdown',event=>{if(event.button!==0)return;const r=$('#rail-anchor').getBoundingClientRect();drag={x:event.clientX,y:event.clientY,left:r.left,top:r.top};event.currentTarget.setPointerCapture(event.pointerId);closeFlyout();event.preventDefault()});
$('#rail-grip').addEventListener('pointermove',event=>{if(drag)positionRail(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y)});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('#rail-grip').addEventListener(name,()=>drag=null);
$('#rail-grip').addEventListener('keydown',event=>{if(event.key==='Home'){$('#rail-anchor').style.left='';$('#rail-anchor').style.top='';event.preventDefault()}else if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){const r=$('#rail-anchor').getBoundingClientRect(),step=event.shiftKey?25:10;positionRail(r.left+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),r.top+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0));event.preventDefault()}});
window.addEventListener('resize',()=>{if($('#rail-anchor').style.left){const r=$('#rail-anchor').getBoundingClientRect();positionRail(r.left,r.top)}});
$('#rail-flyout').addEventListener('click',event=>{const option=event.target.closest('[data-option]'),hue=event.target.closest('[data-hue]');if(option){if(option.dataset.optionView==='timeline'){state.sort=option.dataset.option;$('#sort').value=state.sort}else state.type=option.dataset.option;state.limit=60;render();closeFlyout()}if(hue){$('#rail').style.setProperty('--rail-hue',hue.dataset.hue);persist('entity:rail-hue',hue.dataset.hue);closeFlyout()}if(event.target.closest('[data-export]'))exportCatalog()});
$('#rail').style.setProperty('--rail-hue',readSaved('entity:rail-hue','96'));
let dark=readSaved('entity:dark',false);document.body.dataset.theme=dark?'dark':'light';
function updateThemeLabel(){$('#theme-toggle').setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme')};updateThemeLabel();
$('#theme-toggle').onclick=()=>{dark=!dark;document.body.dataset.theme=dark?'dark':'light';persist('entity:dark',dark);updateThemeLabel()};
$('.media-tabs').addEventListener('click',event=>{const b=event.target.closest('[data-type]');if(b){state.type=b.dataset.type;state.limit=60;render()}});
$('#search').addEventListener('input',event=>{state.search=event.target.value;state.limit=60;render()});
$('#camera-filter').onchange=event=>{state.camera=event.target.value;state.limit=60;render()};$('#sort').onchange=event=>{state.sort=event.target.value;render()};
$('#clear-filters').onclick=clearFilters;$('#load-more').onclick=()=>{state.limit+=60;render()};$('#density').onclick=()=>{state.large=!state.large;$('#density').setAttribute('aria-label',state.large?'Show smaller thumbnails':'Show larger thumbnails');render()};
$('#export-catalog').onclick=exportCatalog;
document.addEventListener('click',event=>{
 const save=event.target.closest('[data-save]'),select=event.target.closest('[data-select]'),point=event.target.closest('[data-point]'),expand=event.target.closest('[data-preview]'),live=event.target.closest('[data-live]'),exp=event.target.closest('[data-export-item]');
 if(save)toggleSave(save.dataset.save);else if(select)selectItem(select.dataset.select,select);else if(point)selectItem(point.dataset.point,point);else if(expand)preview(expand.dataset.preview);else if(live)preview(live.dataset.live,true);else if(exp)exportItem(exp.dataset.exportItem);
 if(event.target.closest('[data-clear]'))clearFilters();
 const frameColor=event.target.closest('[data-frame-color]');if(frameColor)applyColor(frameColor.dataset.frameColor);
 if(event.target.closest('[data-close-inspector]'))closeInspector();
 if(!event.target.closest('.rail-anchor'))closeFlyout();
});
document.addEventListener('dblclick',event=>{const b=event.target.closest('[data-select]');if(b)preview(b.dataset.select)});
document.addEventListener('keydown',event=>{if(event.target.closest('[data-point]')&&['Enter',' '].includes(event.key)){event.preventDefault();selectItem(event.target.dataset.point)}if(event.key==='Escape'){closeFlyout();if(!$('#viewer').open)closeInspector()}if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)&&!$('#viewer').open){event.preventDefault();if(innerWidth<=960){document.body.classList.add('tools-open');$('#tools-toggle').setAttribute('aria-expanded','true')}$('#search').focus()}if($('#viewer').open&&event.key==='ArrowLeft')movePreview(-1);if($('#viewer').open&&event.key==='ArrowRight')movePreview(1)});
$('#viewer-close').onclick=()=>$('#viewer').close();$('#viewer').addEventListener('close',()=>{$('#viewer-media').innerHTML='';const item=state.items.find(i=>i.id===state.selected);if(item&&!$('#inspector').hidden)renderInspector(item)});$('#viewer-prev').onclick=()=>movePreview(-1);$('#viewer-next').onclick=()=>movePreview(1);
// A / navigation, B / cube and media, C / tools. Keep tools in one permanent column.
const paletteContainer=document.createElement('div');paletteContainer.id='palette-container';paletteContainer.innerHTML=paletteToolMarkup();$('#tool-controls').append(paletteContainer);
$('#tool-controls').append($('.library-controls'));
$('#sort').insertAdjacentHTML('beforeend','<option value="color">Closest color</option>');
$('#tool-controls').append($('#export-catalog'));
for(const [id,label] of [['camera-filter','Camera'],['sort','Order']]){
 const tag=document.createElement('span');tag.className='control-label';tag.textContent=label;$('#'+id).parentElement.prepend(tag);
}
function setToolsOpen(open){document.body.classList.toggle('tools-open',open);$('#tools-toggle').setAttribute('aria-expanded',String(open));if(!open)$('#tools-toggle').focus({preventScroll:true})}
$('#tools-toggle').onclick=()=>setToolsOpen(!document.body.classList.contains('tools-open'));
$('#tools-close').onclick=()=>setToolsOpen(false);
function applyColor(hex,label=''){paletteTool?.setHex(hex,label);state.color=hex;state.colorLabel=label;state.sort='color';state.limit=60;$('#sort').value='color';const lab=hexToLab(hex);colorScores=new Map(state.items.map(item=>[item.id,closestColor(paletteData?.items[item.id]?.palette,lab)]));$('#color-hex').value=hex;$('#color-picker').value=hex;$('#color-clear').hidden=false;$('#color-tolerance-wrap').hidden=false;render()}
async function init(){try{
 const response=await fetch('/media/catalog.json');if(!response.ok)throw Error('The media index is not available yet.');state.catalog=await response.json();state.items=state.catalog.items.filter(item=>!item.isLiveCompanion);
 try{const colors=await fetch('/media/palettes.json');if(colors.ok)paletteData=await colors.json()}catch{}
 paletteTool=mountPaletteTool($('#palette-container'),{data:paletteData,onApply:applyColor,onClear:()=>{state.color=null;state.colorLabel='';state.colorTolerance=100;state.sort='newest';$('#sort').value='newest';render()},onTolerance:value=>{state.colorTolerance=value;state.limit=60;render()},toast});
 $('#count-all').textContent=fmt(state.items.length);$('#count-image').textContent=fmt(state.items.filter(i=>i.type==='image').length);$('#count-video').textContent=fmt(state.items.filter(i=>i.type==='video').length);$('#count-live').textContent=fmt(state.items.filter(i=>i.liveVideo).length);
 const cameras=[...new Set(state.items.map(i=>i.camera).filter(Boolean))].sort();$('#camera-filter').innerHTML='<option value="">All cameras</option>'+cameras.map(camera=>`<option value="${esc(camera)}">${esc(camera)}</option>`).join('');
 render();
 }catch(error){$('#result-count').textContent='Archive not ready';$('#content').innerHTML=`<div class="empty-state"><h2>The archive is still taking shape.</h2><p>${esc(error.message)} Run the media indexer, then reload.</p><button class="outline-button" id="retry">Try again</button></div>`;$('#retry').onclick=init}}
init();
