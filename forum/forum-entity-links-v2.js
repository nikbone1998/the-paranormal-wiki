(() => {
  'use strict';
  const CACHE_KEY='tpw:canonical-entity-index:v3';
  const CACHE_TTL=24*60*60*1000;
  const EXPECTED_ENTRIES=913;
  let entityIndex=null;
  let entityIndexPromise=null;
  let pickerInstalled=false;
  const normalize=s=>String(s??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function readCache(){
    try{
      const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(!cached||!Array.isArray(cached.entries)||Date.now()-cached.savedAt>CACHE_TTL)return null;
      if(cached.entries.length!==EXPECTED_ENTRIES)return null;
      return cached.entries;
    }catch{return null}
  }
  function writeCache(entries){try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),entries}))}catch{}}

  async function loadIndex(){
    if(entityIndex)return entityIndex;
    const cached=readCache();
    if(cached){entityIndex=cached;return cached}
    if(entityIndexPromise)return entityIndexPromise;
    entityIndexPromise=(async()=>{
      const response=await fetch('/api/forum-entities',{credentials:'same-origin',cache:'default'});
      if(!response.ok)throw new Error(`Canonical entity index request failed (${response.status})`);
      const payload=await response.json();
      const entries=Array.isArray(payload?.entries)?payload.entries.filter(e=>e&&e.name&&e.slug):[];
      if(entries.length!==EXPECTED_ENTRIES)throw new Error(`Verified ${entries.length} canonical routes; expected exactly ${EXPECTED_ENTRIES}.`);
      entries.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
      entityIndex=entries;writeCache(entries);return entries;
    })().finally(()=>{entityIndexPromise=null});
    return entityIndexPromise;
  }

  function exactMatch(value){value=normalize(value).toLocaleLowerCase();return entityIndex?.find(e=>String(e.name).toLocaleLowerCase()===value||String(e.slug).toLocaleLowerCase()===value)||null}

  function installPickerShell(){
    if(pickerInstalled)return;
    const idInput=document.querySelector('#entityId'),nameInput=document.querySelector('#entityName');
    if(!idInput||!nameInput)return;
    const idField=idInput.closest('.field'),nameField=nameInput.closest('.field');
    if(!idField||!nameField)return;
    const wrap=document.createElement('div');wrap.className='field canonical-entity-picker';
    wrap.innerHTML=`<label for="canonicalEntitySearch">Canonical archive entity (optional)</label><input id="canonicalEntitySearch" list="canonicalEntityOptions" maxlength="160" autocomplete="off" placeholder="Start typing an entity name…"><datalist id="canonicalEntityOptions"></datalist><div id="canonicalEntityStatus" class="field-help">Canonical archive index loads when this field is opened.</div>`;
    idField.before(wrap);idField.classList.add('entity-legacy-field');nameField.classList.add('entity-legacy-field');pickerInstalled=true;
    const search=wrap.querySelector('#canonicalEntitySearch');search.addEventListener('focus',preparePicker,{once:true});search.addEventListener('input',syncPickerSelection);search.addEventListener('change',syncPickerSelection);
  }

  async function preparePicker(){
    const status=document.querySelector('#canonicalEntityStatus'),list=document.querySelector('#canonicalEntityOptions'),idInput=document.querySelector('#entityId'),nameInput=document.querySelector('#entityName');
    if(!status||!list||!idInput||!nameInput)return;
    status.textContent='Loading and verifying all 913 canonical archive entities…';
    try{
      const entries=await loadIndex();
      list.innerHTML=entries.map(e=>`<option value="${esc(e.name)}" label="${esc(e.id||e.slug)}"></option>`).join('');
      document.querySelectorAll('.entity-legacy-field').forEach(el=>el.classList.add('hidden'));
      status.textContent='913 / 913 canonical archive entities verified. Choose an exact match to attach it.';syncPickerSelection();
    }catch(error){
      console.warn('Canonical entity selector unavailable',error);document.querySelectorAll('.entity-legacy-field').forEach(el=>el.classList.remove('hidden'));
      status.textContent='The forum could not verify all 913 canonical entities, so automatic linking is disabled. Manual fields remain available; no route will be guessed.';
    }
  }

  function syncPickerSelection(){
    const search=document.querySelector('#canonicalEntitySearch'),status=document.querySelector('#canonicalEntityStatus'),idInput=document.querySelector('#entityId'),nameInput=document.querySelector('#entityName');
    if(!search||!idInput||!nameInput||!entityIndex)return;
    const match=exactMatch(search.value);
    if(!match){idInput.value='';nameInput.value='';if(status&&search.value.trim())status.textContent='Choose an exact canonical entity from the suggestions.';return}
    idInput.value=match.id||`slug:${match.slug}`;nameInput.value=match.name;if(status)status.textContent=`Linked to canonical archive route /#entity/${match.slug}`;
  }

  async function upgradeThreadLinks(){
    const root=document.querySelector('#threadEntity');
    if(!root||!root.querySelector('.entity-tag')||root.dataset.canonicalLinksReady==='1'||root.dataset.canonicalLinksReady==='loading')return;
    root.dataset.canonicalLinksReady='loading';
    try{
      const entries=await loadIndex(),byName=new Map(entries.map(e=>[String(e.name).toLocaleLowerCase(),e])),byId=new Map(entries.filter(e=>e.id).map(e=>[String(e.id).toLocaleLowerCase(),e]));
      root.querySelectorAll('.entity-tag').forEach(tag=>{
        const raw=normalize(tag.textContent).replace(/^ARCHIVE LINK:\s*/i,''),idFromTitle=(tag.getAttribute('title')||'').replace(/^Archive entity ID:\s*/i,'').trim();
        const match=byId.get(idFromTitle.toLocaleLowerCase())||byName.get(raw.toLocaleLowerCase());if(!match)return;
        const link=document.createElement('a');link.href=`/#entity/${encodeURIComponent(match.slug)}`;link.textContent=`ARCHIVE LINK: ${match.name}`;link.title=`Open canonical Paranormal Wiki entity: ${match.name}`;
        tag.textContent='';tag.append(link);tag.title=`Canonical archive route: /#entity/${match.slug}`;
      });
      root.dataset.canonicalLinksReady='1';
    }catch(error){root.dataset.canonicalLinksReady='0';console.warn('Canonical thread link upgrade skipped',error)}
  }

  installPickerShell();
  document.addEventListener('click',event=>{if(event.target.closest('#newThreadBtn'))setTimeout(()=>{installPickerShell();preparePicker()},0)},true);
  const observer=new MutationObserver(()=>{installPickerShell();if(document.querySelector('#threadEntity .entity-tag'))upgradeThreadLinks()});observer.observe(document.body,{subtree:true,childList:true});
})();