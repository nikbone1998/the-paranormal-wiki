/* THE PARANORMAL WIKI — source-grounded dossier layer for the 3D Earth. */
(()=>{
 'use strict';
 const COLORS={traditional:'#00ffff',historical:'#ffff00',modern:'#cc66ff',famous:'#ff3333'};
 const LABELS={traditional:'TRADITIONAL / CULTURAL',historical:'HISTORICAL RECORD',modern:'MODERN REPORT',famous:'FAMOUS CASE'};
 const layerKey=point=>({reported:'modern',case:'famous',cases:'famous'}[String(point?.layer||'').toLowerCase()]||String(point?.layer||''));
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const sourceEntities=()=>window.__ARCHIVE_ENTITIES||[];
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 function mount(root,api){
  if(root.querySelector('.ua-entity-layer'))return;
  const all=sourceEntities(),records=[];
  all.forEach(entity=>(entity.mapPoints||[]).forEach((point,index)=>records.push({entity,point,index})));
  const layer=document.createElement('div');layer.className='ua-entity-layer';layer.setAttribute('aria-label','Source-grounded dossier locations');
  layer.innerHTML=`<div class="ua-entity-toolbar">
   <label class="ua-entity-search-label">FIND <input type="search" class="ua-entity-search" placeholder="entity or location" aria-label="Find an entity or location"></label>
   <label class="ua-entity-keyboard-label">SELECT <select class="ua-entity-select" aria-label="Select a mapped dossier location"><option value="">CHOOSE MAPPED LOCATION</option></select></label>
   <div class="ua-entity-filters" role="group" aria-label="Map layers">
    ${[['all','ALL LAYERS'],['traditional','TRADITIONAL'],['historical','HISTORICAL'],['modern','MODERN REPORTS'],['famous','FAMOUS CASES'],['mapped','MAPPED ENTITIES'],['unmapped','UNMAPPED']].map(([k,v],i)=>`<button type="button" class="ua-entity-filter${i===0?' on':''}" data-entity-filter="${k}">[ ${v} ]</button>`).join('')}
   </div>
   <div class="ua-entity-count mono"></div>
  </div>
  <div class="ua-entity-panel" hidden></div>
  <div class="ua-entity-unmapped" hidden></div>
  <div class="ua-entity-disclaimer">MAP INDEX: SOURCE-GROUNDED ASSOCIATIONS ONLY. MARKER DENSITY IS NOT CREATURE POPULATION DENSITY OR PROOF OF A PARANORMAL EVENT.</div>`;
  root.appendChild(layer);
  const style=document.createElement('style');style.textContent='.ua-entity-layer{position:absolute;inset:0;z-index:9;pointer-events:none;font-family:"Courier New",monospace}.ua-entity-toolbar{position:absolute;left:8px;right:8px;top:8px;padding:6px;border:1px solid #505080;background:rgba(0,0,12,.84);pointer-events:auto;color:#ccc;font-size:10px}.ua-entity-search-label,.ua-entity-keyboard-label{display:flex;align-items:center;gap:5px}.ua-entity-search{width:170px;max-width:55%;background:#05050d;color:#fff;border:1px solid #6666aa;padding:4px;font:11px "Courier New",monospace}.ua-entity-select{max-width:58%;background:#05050d;color:#fff;border:1px solid #6666aa;padding:4px;font:10px "Courier New",monospace}.ua-entity-filters{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px}.ua-entity-filter{font:9px "Courier New",monospace;color:#aaa;background:#080817;border:1px solid #444477;padding:3px 5px}.ua-entity-filter.on{color:#00ffff;border-color:#00ffff;background:#111144}.ua-entity-count{color:#66ff99;margin-top:4px}.ua-entity-panel{position:absolute;right:10px;top:82px;width:min(310px,calc(100% - 20px));max-height:calc(100% - 125px);overflow:auto;padding:9px;border:2px ridge #888;background:rgba(2,2,14,.96);color:#ddd;pointer-events:auto;font:11px Arial,sans-serif}.ua-entity-close{float:right;background:#222;color:#fff;border:1px solid #777;font-size:16px;line-height:15px}.ua-entity-panel-title{font:bold 17px Arial;margin-bottom:3px}.ua-entity-panel-meta{color:#aaa;border-bottom:1px dotted #666;padding-bottom:5px;margin-bottom:5px}.ua-entity-panel dl{margin:0}.ua-entity-panel dt{color:#00ffff;font:bold 10px "Courier New",monospace;margin-top:5px}.ua-entity-panel dd{margin:1px 0}.ua-entity-open{display:block;margin-top:8px;color:#00ffff;font:bold 11px "Courier New",monospace}.ua-entity-disclaimer{position:absolute;left:8px;right:8px;bottom:8px;padding:4px;background:rgba(0,0,0,.78);border-left:2px solid #ffff00;color:#ddd;font:9px Arial,sans-serif;pointer-events:none}.ua-entity-unmapped{position:absolute;left:10px;right:10px;bottom:37px;max-height:31%;overflow:auto;padding:7px;background:rgba(0,0,12,.95);border:1px solid #777;color:#ffff88;pointer-events:auto;font:10px Arial,sans-serif}.ua-unmapped-list{margin-top:5px;line-height:1.7}.ua-unmapped-list a{color:#aaaaff;margin-right:5px}@media(max-width:680px){.ua-entity-toolbar{top:5px;left:5px;right:5px}.ua-entity-search{width:145px}.ua-entity-select{max-width:100%;width:100%}.ua-entity-filter{font-size:8px;padding:3px}.ua-entity-panel{top:108px;right:5px;width:calc(100% - 10px);max-height:42%}.ua-entity-disclaimer{font-size:8px;bottom:5px}.ua-entity-unmapped{bottom:45px}}';document.head.appendChild(style);
  const panel=layer.querySelector('.ua-entity-panel'),unmapped=layer.querySelector('.ua-entity-unmapped'),search=layer.querySelector('.ua-entity-search'),select=layer.querySelector('.ua-entity-select'),count=layer.querySelector('.ua-entity-count');
  let filter='all',query='',selected=null,lastSignature='';
  const stop=e=>{e.stopPropagation();};
  ['click','pointerdown','pointermove','wheel','touchstart','touchmove'].forEach(t=>layer.addEventListener(t,stop,{passive:t==='pointermove'||t==='touchmove'}));
  const visible=r=>{if(query&&!(`${r.entity.name} ${r.entity.slug} ${r.point.label} ${r.entity.category}`.toLowerCase().includes(query)))return false;if(filter==='mapped'||filter==='all')return true;if(filter==='unmapped')return false;return layerKey(r.point)===filter;};
  const label=r=>LABELS[layerKey(r.point)]||String(r.point.layer||'INDEXED').toUpperCase();
  const open=r=>{selected=r;panel.hidden=false;panel.innerHTML=`<button type="button" class="ua-entity-close" aria-label="Close dossier location">×</button><div class="ua-entity-panel-title" style="color:${COLORS[layerKey(r.point)]||'#fff'}">${esc(r.entity.name)}</div><div class="ua-entity-panel-meta">${esc(r.entity.category||'ARCHIVE ENTITY')} · ${esc(label(r))}</div><dl><dt>LOCATION</dt><dd>${esc(r.point.label)}</dd><dt>ASSOCIATION</dt><dd>${esc(['WEAK / CONTEXT','MODERATE','HIGH','VERY HIGH'][Math.min(3,Number(r.point.intensity)||1)]||'INDEXED')}</dd><dt>SOURCE TYPE</dt><dd>${esc(r.point.sourceType||'[?] INDEXED ASSOCIATION')}</dd><dt>WHY IT MATTERS</dt><dd>${esc(r.point.why||'Source-grounded archive association; see dossier bibliography.')}</dd></dl><a class="ua-entity-open" href="#entity/${encodeURIComponent(r.entity.slug)}">[ OPEN FULL DOSSIER ]</a>`;panel.querySelector('.ua-entity-close').onclick=()=>{panel.hidden=true;selected=null;};};
  const showUnmapped=()=>{if(filter!=='unmapped'){unmapped.hidden=true;return;}const list=all.filter(e=>!(e.mapPoints||[]).length&&(!query||`${e.name} ${e.slug} ${e.category}`.toLowerCase().includes(query))).slice(0,80);unmapped.hidden=false;unmapped.innerHTML=`<b>NO PUBLIC POINT ASSIGNED</b><br><span class="tiny">These records remain intentionally unmapped because the dossier does not support a defensible public coordinate.</span><div class="ua-unmapped-list">${list.map(e=>`<a href="#entity/${encodeURIComponent(e.slug)}">${esc(e.name)}</a>`).join(' · ')||'NO MATCHES'}</div>`;};
  const activeRecords=()=>records.filter(visible);
  let syncAttempts=0;
  const syncMarkers=()=>{const active=activeRecords(),sent=api.setMarkers?.(active,selection=>{const items=Array.isArray(selection)?selection:[selection];if(items.length>1){const first=items[0];api.flyTo({lat:first.point.lat,lon:first.point.lon,altitude:260});}else if(items[0])open(items[0]);});count.textContent=`${active.length} POINT${active.length===1?'':'S'} DISPLAYED · ${new Set(active.map(r=>r.entity.id)).size} ENTITIES`;showUnmapped();if(sent===false&&syncAttempts++<120)setTimeout(syncMarkers,500);};
  records.forEach(r=>{const o=document.createElement('option');o.value=`${r.entity.id}-${r.index}`;o.textContent=`${r.entity.name} — ${r.point.label}`;select.appendChild(o);});
  select.addEventListener('change',()=>{const r=records.find(x=>`${x.entity.id}-${x.index}`===select.value);if(r){api.flyTo({lat:r.point.lat,lon:r.point.lon,altitude:260});open(r);}});
  layer.querySelectorAll('[data-entity-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.entityFilter;layer.querySelectorAll('[data-entity-filter]').forEach(x=>x.classList.toggle('on',x===b));lastSignature='';syncMarkers();});
  search.addEventListener('input',()=>{query=search.value.trim().toLowerCase();lastSignature='';const match=records.find(r=>query&&`${r.entity.name} ${r.entity.slug} ${r.point.label} ${r.entity.category}`.toLowerCase().includes(query));if(match)api.flyTo({lat:match.point.lat,lon:match.point.lon,altitude:260});syncMarkers();});
  syncMarkers();
  root.querySelector('.ua-globe-sub').textContent='INTERACTIVE EARTH OBSERVATION SYSTEM // SOURCE-GROUNDED ENTITY LAYER ONLINE';
  root.querySelector('.ua-globe-future').textContent='ENTITY COORDINATES: '+records.length+' POINTS / '+new Set(records.map(r=>r.entity.id)).size+' ENTITIES';
  root.querySelector('.ua-globe-status').innerHTML='EARTH ENGINE <b>ONLINE</b><br>ENTITY LAYER: <b>ONLINE</b><br>RENDER: <span class="ua-globe-quality">...</span>';
 }
 async function boot(){for(let i=0;i<120;i++){const root=document.querySelector('[data-unseen-earth]');if(root){const bridge={getObservationState:()=>window.UnseenEarth?.get(root)?.getObservationState?.()||{center:{lat:13,lon:25},altitudeKm:12000},setMarkers:(items,onSelect)=>window.UnseenEarth?.get(root)?.setMarkers?.(items,onSelect)||false,flyTo:options=>window.UnseenEarth?.get(root)?.flyTo?.(options)};mount(root,bridge);return;}await wait(500);}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
