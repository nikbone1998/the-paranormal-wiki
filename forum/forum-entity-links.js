(() => {
  'use strict';

  const CACHE_KEY='tpw:canonical-entity-index:v1';
  const CACHE_TTL=24*60*60*1000;
  const MIN_TRUSTED_ENTRIES=800;
  let entityIndex=null;
  let entityIndexPromise=null;
  let pickerInstalled=false;

  const normalize=s=>String(s??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const cleanSlug=v=>decodeURIComponent(String(v||'').split(/[?#]/)[0]).trim();

  function readCache(){
    try{
      const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(!cached||!Array.isArray(cached.entries)||Date.now()-cached.savedAt>CACHE_TTL)return null;
      if(cached.entries.length<MIN_TRUSTED_ENTRIES)return null;
      return cached.entries;
    }catch{return null}
  }

  function writeCache(entries){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),entries}))}catch{}
  }

  function extractFromDocument(doc){
    const bySlug=new Map();
    const add=(slug,name,id='')=>{
      slug=cleanSlug(slug);
      name=normalize(name);
      id=normalize(id);
      if(!slug||!name||name.length>160||/^view\b|^open\b|^read\b/i.test(name))return;
      const existing=bySlug.get(slug);
      if(!existing||(!existing.id&&id))bySlug.set(slug,{slug,name,id:id||''});
    };

    doc.querySelectorAll('a[href*="#entity/"]').forEach(a=>{
      const href=a.getAttribute('href')||'';
      const slug=href.split('#entity/')[1];
      const holder=a.closest('[data-entity-id],[data-entity-name],[data-entity-slug]');
      const name=a.getAttribute('data-entity-name')||holder?.getAttribute('data-entity-name')||a.getAttribute('aria-label')||a.getAttribute('title')||a.textContent;
      const id=a.getAttribute('data-entity-id')||holder?.getAttribute('data-entity-id')||'';
      add(slug,name,id);
    });

    doc.querySelectorAll('[data-entity-slug][data-entity-name]').forEach(el=>{
      add(el.getAttribute('data-entity-slug'),el.getAttribute('data-entity-name'),el.getAttribute('data-entity-id')||'');
    });

    return [...bySlug.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }

  function extractFromSource(html){
    const bySlug=new Map();
    const add=(slug,name,id='')=>{
      slug=cleanSlug(slug);name=normalize(name);id=normalize(id);
      if(!slug||!name||name.length>160||/^view\b|^open\b|^read\b/i.test(name))return;
      const existing=bySlug.get(slug);
      if(!existing||(!existing.id&&id))bySlug.set(slug,{slug,name,id:id||''});
    };

    const anchorRe=/<a\b([^>]*?href=["'][^"']*#entity\/([^"'#?]+)[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
    let m;
    while((m=anchorRe.exec(html))){
      const attrs=m[1]||'';
      const inner=m[3]||'';
      const text=normalize(inner.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"'));
      const nameAttr=attrs.match(/data-entity-name=["']([^"']+)["']/i)?.[1]||attrs.match(/aria-label=["']([^"']+)["']/i)?.[1]||attrs.match(/title=["']([^"']+)["']/i)?.[1]||'';
      const id=attrs.match(/data-entity-id=["']([^"']+)["']/i)?.[1]||'';
      add(m[2],nameAttr||text,id);
    }

    const dataRe=/data-entity-slug=["']([^"']+)["'][^>]{0,500}?data-entity-name=["']([^"']+)["']/gi;
    while((m=dataRe.exec(html)))add(m[1],m[2]);

    return [...bySlug.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }

  async function loadIndex(){
    if(entityIndex)return entityIndex;
    const cached=readCache();
    if(cached){entityIndex=cached;return cached}
    if(entityIndexPromise)return entityIndexPromise;
    entityIndexPromise=(async()=>{
      const response=await fetch('/',{credentials:'same-origin',cache:'force-cache'});
      if(!response.ok)throw new Error(`Archive index request failed (${response.status})`);
      const html=await response.text();
      const doc=new DOMParser().parseFromString(html,'text/html');
      let entries=extractFromDocument(doc);
      if(entries.length<MIN_TRUSTED_ENTRIES)entries=extractFromSource(html);
      if(entries.length<MIN_TRUSTED_ENTRIES){
        throw new Error(`Only ${entries.length} canonical entity routes could be verified; expected a near-complete archive index.`);
      }
      entityIndex=entries;
      writeCache(entries);
      return entries;
    })().finally(()=>{entityIndexPromise=null});
    return entityIndexPromise;
  }

  function exactMatch(value){
    value=normalize(value).toLocaleLowerCase();
    return entityIndex?.find(e=>e.name.toLocaleLowerCase()===value||e.slug.toLocaleLowerCase()===value)||null;
  }

  function installPickerShell(){
    if(pickerInstalled)return;
    const idInput=document.querySelector('#entityId');
    const nameInput=document.querySelector('#entityName');
    if(!idInput||!nameInput)return;
    const idField=idInput.closest('.field');
    const nameField=nameInput.closest('.field');
    if(!idField||!nameField)return;

    const wrap=document.createElement('div');
    wrap.className='field canonical-entity-picker';
    wrap.innerHTML=`<label for="canonicalEntitySearch">Canonical archive entity (optional)</label><input id="canonicalEntitySearch" list="canonicalEntityOptions" maxlength="160" autocomplete="off" placeholder="Start typing an entity name…"><datalist id="canonicalEntityOptions"></datalist><div id="canonicalEntityStatus" class="field-help">Canonical archive index loads only when needed.</div>`;
    idField.before(wrap);
    idField.classList.add('entity-legacy-field');
    nameField.classList.add('entity-legacy-field');
    pickerInstalled=true;

    const search=wrap.querySelector('#canonicalEntitySearch');
    search.addEventListener('focus',preparePicker,{once:true});
    search.addEventListener('input',syncPickerSelection);
    search.addEventListener('change',syncPickerSelection);
  }

  async function preparePicker(){
    const status=document.querySelector('#canonicalEntityStatus');
    const list=document.querySelector('#canonicalEntityOptions');
    const idInput=document.querySelector('#entityId');
    const nameInput=document.querySelector('#entityName');
    if(!status||!list||!idInput||!nameInput)return;
    status.textContent='Verifying canonical entity routes from the archive…';
    try{
      const entries=await loadIndex();
      list.innerHTML=entries.map(e=>`<option value="${esc(e.name)}" label="${esc(e.slug)}"></option>`).join('');
      document.querySelectorAll('.entity-legacy-field').forEach(el=>el.classList.add('hidden'));
      status.textContent=`${entries.length} canonical archive entity routes verified. Select an exact match to attach it.`;
      syncPickerSelection();
    }catch(error){
      console.warn('Canonical entity selector unavailable',error);
      document.querySelectorAll('.entity-legacy-field').forEach(el=>el.classList.remove('hidden'));
      status.textContent='Automatic canonical selector could not verify the full archive index. Manual entity fields remain available; no route will be guessed.';
    }
  }

  function syncPickerSelection(){
    const search=document.querySelector('#canonicalEntitySearch');
    const status=document.querySelector('#canonicalEntityStatus');
    const idInput=document.querySelector('#entityId');
    const nameInput=document.querySelector('#entityName');
    if(!search||!idInput||!nameInput||!entityIndex)return;
    const match=exactMatch(search.value);
    if(!match){
      idInput.value='';nameInput.value='';
      if(status&&search.value.trim())status.textContent='Choose an exact canonical entity from the suggestions; unmatched text will not create an archive link.';
      return;
    }
    idInput.value=match.id||`slug:${match.slug}`;
    nameInput.value=match.name;
    if(status)status.textContent=`Linked to canonical archive route /#entity/${match.slug}`;
  }

  async function upgradeThreadLinks(){
    const root=document.querySelector('#threadEntity');
    if(!root||!root.querySelector('.entity-tag')||root.dataset.canonicalLinksReady==='1')return;
    root.dataset.canonicalLinksReady='loading';
    try{
      const entries=await loadIndex();
      const byName=new Map(entries.map(e=>[e.name.toLocaleLowerCase(),e]));
      root.querySelectorAll('.entity-tag').forEach(tag=>{
        const raw=normalize(tag.textContent).replace(/^ARCHIVE LINK:\s*/i,'');
        const match=byName.get(raw.toLocaleLowerCase());
        if(!match)return;
        const link=document.createElement('a');
        link.href=`/#entity/${encodeURIComponent(match.slug)}`;
        link.textContent=`ARCHIVE LINK: ${match.name}`;
        link.title=`Open canonical Paranormal Wiki entity: ${match.name}`;
        tag.textContent='';tag.append(link);
        tag.title=`Canonical archive route: /#entity/${match.slug}`;
      });
      root.dataset.canonicalLinksReady='1';
    }catch(error){
      root.dataset.canonicalLinksReady='0';
      console.warn('Canonical thread link upgrade skipped',error);
    }
  }

  installPickerShell();

  document.addEventListener('click',event=>{
    if(event.target.closest('#newThreadBtn'))setTimeout(()=>{installPickerShell();preparePicker()},0);
  },true);

  const observer=new MutationObserver(()=>{
    installPickerShell();
    if(document.querySelector('#threadEntity .entity-tag'))upgradeThreadLinks();
  });
  observer.observe(document.body,{subtree:true,childList:true});
})();