(()=>{'use strict';
const C=window.ForumCore,S=window.ForumSocial,T=window.ForumThread;
const{db,state,$,esc,fmt,flash}=C;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const history=new Map();
const timers=new Map();
function messageId(el){const id=el?.id||'';return id.startsWith('dm-message-')?id.slice(11):null}
function oldestVisible(box){return messageId(box?.querySelector('.dm-message[id^="dm-message-"]'))}
function visibleCount(box){return box?.querySelectorAll('.dm-message[id^="dm-message-"]').length||0}
function bubble(m){const mine=m.sender_id===state.profile?.id,media=m.attachment_path?`<div class="dm-attachment cursor-history-media" data-path="${esc(m.attachment_path)}" data-mime="${esc(m.attachment_mime||'')}" data-name="${esc(m.attachment_name||'attachment')}"><span>LOADING PRIVATE MEDIA…</span></div>`:'';return`<article class="dm-message ${mine?'mine':'theirs'}" id="dm-message-${esc(m.id)}"><div class="dm-bubble">${m.body?`<div class="dm-text">${esc(m.body)}</div>`:''}${media}<div class="dm-time">${esc(fmt(m.created_at))}</div></div></article>`}
async function resolveMedia(root){const nodes=[...root.querySelectorAll('.cursor-history-media[data-path]')];await Promise.all(nodes.map(async el=>{const{data,error}=await db.storage.from('forum-dm-media').createSignedUrl(el.dataset.path,3600);if(error||!data?.signedUrl){el.innerHTML='<span>PRIVATE MEDIA UNAVAILABLE</span>';return}const src=esc(data.signedUrl),mime=el.dataset.mime||'',name=esc(el.dataset.name||'attachment');if(mime.startsWith('image/'))el.innerHTML=`<a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${name}" loading="lazy" referrerpolicy="no-referrer"></a>`;else if(mime.startsWith('video/'))el.innerHTML=`<video src="${src}" controls playsinline preload="metadata"></video><div class="dm-file-name">${name}</div>`;else el.innerHTML=`<a href="${src}" target="_blank" rel="noopener">${name}</a>`;el.classList.remove('cursor-history-media')}))}
async function totalFor(id){const r=await db.from('forum_private_messages').select('*',{count:'exact',head:true}).eq('conversation_id',id).is('deleted_at',null);if(r.error)throw r.error;return r.count||0}
function updateUi(id){const h=history.get(id),btn=$('[data-load-older-dm]'),status=$('#dmHistoryLoader span');if(!h||!btn)return;const loaded=Math.min(h.loaded,h.total),done=loaded>=h.total||!h.beforeId;if(status)status.textContent=`${loaded} OF ${h.total} MOST RECENT LOADED`;btn.disabled=done||h.busy;btn.textContent=done?'FULL MESSAGE HISTORY LOADED':h.busy?'LOADING…':'LOAD EARLIER MESSAGES'}
async function sync(id,reset=false){const h=history.get(id),box=$('#dmMessages');if(!h||!box||new URLSearchParams(location.search).get('dm')!==id)return;h.total=await totalFor(id);h.loaded=visibleCount(box);h.beforeId=oldestVisible(box);if(reset)h.invalidated=false;updateUi(id)}
function observe(id,box){const h=history.get(id);h.observer?.disconnect();h.observer=new MutationObserver(records=>{if(!records.some(r=>r.target===box&&r.type==='childList'))return;if(h.busy){h.invalidated=true;return}clearTimeout(timers.get(id));timers.set(id,setTimeout(()=>sync(id,true).catch(()=>{}),140))});h.observer.observe(box,{childList:true})}
async function install(id){const box=$('#dmMessages'),btn=$('[data-load-older-dm]');if(!box||!btn){history.get(id)?.observer?.disconnect();history.delete(id);return}const total=await totalFor(id);const h=history.get(id)||{};h.total=total;h.loaded=visibleCount(box);h.beforeId=oldestVisible(box);h.busy=false;h.invalidated=false;history.set(id,h);observe(id,box);updateUi(id)}
const baseConversation=S.renderConversation.bind(S);
S.renderConversation=async function(id,...args){try{const result=await baseConversation(id,...args);try{await install(id)}catch{}return result}catch(err){const msg=String(err?.message||'');if(msg.includes('Private conversation unavailable')||msg.includes('other member profile is unavailable')){C.renderNotFound('This private conversation is unavailable.');return}throw err}};
const baseThread=T.renderThread.bind(T);
T.renderThread=async function(id,page=1,hash=''){if(hash?.startsWith('#post-')){let post='';try{post=decodeURIComponent(hash.slice(6))}catch{}if(!UUID_RE.test(post))hash=''}return baseThread(id,page,hash)};
async function cursorPage(id,h,box){for(let attempt=0;attempt<4;attempt++){
  if(new URLSearchParams(location.search).get('dm')!==id||!box.isConnected)return[];
  h.invalidated=false;
  const before=oldestVisible(box);h.beforeId=before;if(!before)return[];
  const{data,error}=await db.rpc('forum_private_message_history',{p_conversation:id,p_before_id:before,p_limit:200});if(error)throw error;
  if(h.invalidated||new URLSearchParams(location.search).get('dm')!==id||!box.isConnected)continue;
  const existing=new Set([...box.querySelectorAll('.dm-message[id^="dm-message-"]')].map(messageId));
  const rows=(data||[]).reverse().filter(m=>!existing.has(String(m.id)));
  const anchor=box.querySelector('.dm-message[id^="dm-message-"]');
  if(rows.length){
    h.observer?.disconnect();
    box.insertAdjacentHTML('afterbegin',rows.map(bubble).join(''));
    await resolveMedia(box);
    const replaced=!box.isConnected||new URLSearchParams(location.search).get('dm')!==id||(anchor&&!anchor.isConnected);
    if(box.isConnected&&new URLSearchParams(location.search).get('dm')===id)observe(id,box);
    if(replaced){h.invalidated=true;continue}
    anchor?.scrollIntoView({block:'start'});
  }
  await sync(id,true);
  return rows;
 }
 throw new Error('Conversation changed while older messages were loading. Please try again.');
}
document.addEventListener('click',async e=>{
 const btn=e.target.closest?.('[data-load-older-dm]');if(!btn)return;
 e.preventDefault();e.stopImmediatePropagation();
 const id=new URLSearchParams(location.search).get('dm'),h=id&&history.get(id),box=$('#dmMessages');if(!id||!h||!box||h.busy)return;
 h.busy=true;updateUi(id);
 try{await cursorPage(id,h,box)}catch(err){flash(err.message||'Unable to load earlier messages.','error')}
 finally{h.busy=false;try{await sync(id,true)}catch{}updateUi(id)}
},true);
})();
