(()=>{'use strict';
const C=window.ForumCore,T=window.ForumThread,S=window.ForumSocial,M=window.ForumCommunity;
const {db,state,$,esc,fmt,urlFor,flash}=C;

// Keep staff replies on the page that actually contains the newly-created post.
T.submitReply=async function(form){
  const body=$('#replyBody')?.value.trim();
  if(!state.thread||!body||!C.requireProfile())return;
  const threadId=state.thread.id,replyTo=state.replyTo?.id||null,button=form.querySelector('button[type="submit"]');
  button.disabled=true;button.textContent='POSTING…';
  try{
    const{data:newPost,error}=await db.rpc('forum_create_post',{p_thread_id:threadId,p_body:body,p_reply_to:replyTo});
    if(error)throw error;
    T.clearReplyTarget();
    const target=await db.from('forum_posts').select('created_at').eq('id',newPost).eq('thread_id',threadId).maybeSingle();
    if(target.error||!target.data)throw target.error||new Error('New reply could not be located.');
    let countQuery=db.from('forum_posts').select('*',{count:'exact',head:true}).eq('thread_id',threadId).lte('created_at',target.data.created_at);
    if(!C.isStaff())countQuery=countQuery.eq('moderation_status','visible');
    const countRes=await countQuery;
    if(countRes.error)throw countRes.error;
    const page=Math.max(1,Math.ceil((countRes.count||1)/C.POST_PAGE_SIZE));
    location.assign(`${urlFor({thread:threadId,...(page>1?{postPage:page}:{})})}#post-${encodeURIComponent(newPost)}`);
  }catch(e){
    flash(e.message||'Unable to post reply.','error');
    button.disabled=false;button.textContent='SUBMIT REPLY';
  }
};

// Make conversations longer than 200 messages navigable instead of silently hiding old history.
// If a live message refresh replaces the list with the newest 200, reset the older-history cursor
// so the next LOAD EARLIER action cannot skip or duplicate a page.
const historyState=new Map();
let historyObserver=null,historyResetTimer=null;
function dmBubble(m){
  const mine=m.sender_id===state.profile?.id;
  const media=m.attachment_path?`<div class="dm-attachment regression-media" data-path="${esc(m.attachment_path)}" data-mime="${esc(m.attachment_mime||'')}" data-name="${esc(m.attachment_name||'attachment')}"><span>LOADING PRIVATE MEDIA…</span></div>`:'';
  return `<article class="dm-message ${mine?'mine':'theirs'}" id="dm-message-${esc(m.id)}"><div class="dm-bubble">${m.body?`<div class="dm-text">${esc(m.body)}</div>`:''}${media}<div class="dm-time">${esc(fmt(m.created_at))}</div></div></article>`;
}
async function resolveOlderMedia(root){
  const nodes=[...root.querySelectorAll('.regression-media[data-path]')];
  await Promise.all(nodes.map(async el=>{
    const{data,error}=await db.storage.from('forum-dm-media').createSignedUrl(el.dataset.path,3600);
    if(error||!data?.signedUrl){el.innerHTML='<span>PRIVATE MEDIA UNAVAILABLE</span>';return}
    const src=esc(data.signedUrl),mime=el.dataset.mime||'',name=esc(el.dataset.name||'attachment');
    if(mime.startsWith('image/'))el.innerHTML=`<a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${name}" loading="lazy" referrerpolicy="no-referrer"></a>`;
    else if(mime.startsWith('video/'))el.innerHTML=`<video src="${src}" controls playsinline preload="metadata"></video><div class="dm-file-name">${name}</div>`;
    else el.innerHTML=`<a href="${src}" target="_blank" rel="noopener">${name}</a>`;
    el.classList.remove('regression-media');
  }));
}
function updateHistoryStatus(id){
  const hs=historyState.get(id),status=$('#dmHistoryLoader span'),btn=$('[data-load-older-dm]');
  if(!hs)return;
  if(status)status.textContent=`${Math.min(hs.loaded,hs.total)} OF ${hs.total} MOST RECENT LOADED`;
  if(btn){
    const done=hs.loaded>=hs.total;
    btn.disabled=done;
    btn.textContent=done?'FULL MESSAGE HISTORY LOADED':'LOAD EARLIER MESSAGES';
  }
}
function observeLiveHistoryReset(id,box){
  historyObserver?.disconnect();historyObserver=null;
  historyObserver=new MutationObserver(records=>{
    const hs=historyState.get(id);
    if(!hs||hs.busy||!records.some(r=>r.target===box&&r.type==='childList'))return;
    clearTimeout(historyResetTimer);
    historyResetTimer=setTimeout(async()=>{
      const currentId=new URLSearchParams(location.search).get('dm'),current=historyState.get(id);
      if(currentId!==id||!current||current.busy)return;
      const countRes=await db.from('forum_private_messages').select('*',{count:'exact',head:true}).eq('conversation_id',id).is('deleted_at',null);
      if(countRes.error)return;
      current.total=countRes.count||0;
      current.loaded=Math.min(200,current.total);
      updateHistoryStatus(id);
    },90);
  });
  historyObserver.observe(box,{childList:true});
}
async function installHistoryLoader(id){
  const box=$('#dmMessages');if(!box)return;
  const countRes=await db.from('forum_private_messages').select('*',{count:'exact',head:true}).eq('conversation_id',id).is('deleted_at',null);
  if(countRes.error)return;
  const total=countRes.count||0;
  historyObserver?.disconnect();historyObserver=null;
  if(total<=200){historyState.delete(id);return}
  const existing=$('#dmHistoryLoader');if(existing)existing.remove();
  historyState.set(id,{loaded:200,total,busy:false});
  box.insertAdjacentHTML('beforebegin',`<div id="dmHistoryLoader" class="dm-history-loader"><button class="bbs-btn secondary" type="button" data-load-older-dm>LOAD EARLIER MESSAGES</button><span>${Math.min(200,total)} OF ${total} MOST RECENT LOADED</span></div>`);
  observeLiveHistoryReset(id,box);
}
const baseRenderConversation=S.renderConversation.bind(S);
S.renderConversation=async function(id){
  await baseRenderConversation(id);
  await installHistoryLoader(id);
};

document.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-load-older-dm]');if(!btn)return;
  e.preventDefault();
  const id=new URLSearchParams(location.search).get('dm'),hs=id&&historyState.get(id),box=$('#dmMessages');
  if(!id||!hs||!box||hs.busy)return;
  hs.busy=true;btn.disabled=true;btn.textContent='LOADING…';
  try{
    // Recount first so newly-arrived messages do not shift the offset under us.
    const countRes=await db.from('forum_private_messages').select('*',{count:'exact',head:true}).eq('conversation_id',id).is('deleted_at',null);
    if(countRes.error)throw countRes.error;
    const currentTotal=countRes.count||0,newerSinceState=Math.max(0,currentTotal-hs.total);
    hs.total=currentTotal;
    const from=hs.loaded+newerSinceState,to=Math.min(hs.total-1,from+199);
    const r=await db.from('forum_private_messages').select('id,conversation_id,sender_id,body,attachment_path,attachment_name,attachment_mime,attachment_size,created_at,updated_at').eq('conversation_id',id).is('deleted_at',null).order('created_at',{ascending:false}).range(from,to);
    if(r.error)throw r.error;
    const rows=(r.data||[]).reverse();
    if(rows.length){
      const anchor=box.firstElementChild;
      box.insertAdjacentHTML('afterbegin',rows.map(dmBubble).join(''));
      await resolveOlderMedia(box);
      hs.loaded+=rows.length;
      anchor?.scrollIntoView({block:'start'});
    }
    updateHistoryStatus(id);
  }catch(err){flash(err.message||'Unable to load earlier messages.','error');btn.textContent='LOAD EARLIER MESSAGES';btn.disabled=false}
  finally{hs.busy=false}
});

// A cross-conversation video call temporarily borrows the DM channel. Once the call/decline UI
// closes, restore the DM represented by the URL so the composer can never target a different member
// than the person visible on screen.
let callRestoreTimer=null;
function scheduleVisibleDmRestore(){
  const dm=new URLSearchParams(location.search).get('dm');
  if(!dm)return;
  const video=$('#videoCallModal'),incoming=$('#incomingCallModal');
  if(video&&!video.classList.contains('hidden'))return;
  if(incoming&&!incoming.classList.contains('hidden'))return;
  clearTimeout(callRestoreTimer);
  callRestoreTimer=setTimeout(()=>{
    const stillDm=new URLSearchParams(location.search).get('dm');
    if(stillDm===dm&&$('#videoCallModal')?.classList.contains('hidden')&&$('#incomingCallModal')?.classList.contains('hidden'))window.ForumApp?.route?.();
  },180);
}
const callModalObserver=new MutationObserver(scheduleVisibleDmRestore);
queueMicrotask(()=>{
  const incoming=$('#incomingCallModal'),video=$('#videoCallModal');
  if(incoming)callModalObserver.observe(incoming,{attributes:true,attributeFilter:['class']});
  if(video)callModalObserver.observe(video,{attributes:true,attributeFilter:['class']});
});

// Keep the expanded private account menu usable on short phones / landscape mode.
const menuStyle=document.createElement('style');
menuStyle.textContent='.account-menu{max-height:calc(100dvh - 20px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}';
document.head.append(menuStyle);
function safePositionAccountMenu(){
  const chip=$('#accountChip'),menu=$('#accountMenu');
  if(!chip||!menu||menu.classList.contains('hidden'))return;
  const r=chip.getBoundingClientRect(),w=Math.min(280,window.innerWidth-20),maxTop=Math.max(10,window.innerHeight-menu.offsetHeight-10);
  menu.style.width=`${w}px`;
  menu.style.top=`${Math.max(10,Math.min(maxTop,r.bottom+6))}px`;
  menu.style.left=`${Math.max(10,Math.min(window.innerWidth-w-10,r.right-w))}px`;
}
const baseToggleAccountMenu=C.toggleAccountMenu.bind(C);
C.toggleAccountMenu=function(){baseToggleAccountMenu();requestAnimationFrame(safePositionAccountMenu)};
C.positionAccountMenu=safePositionAccountMenu;

// Prevent absurd suspension durations from throwing a client-side date RangeError.
const baseSuspend=M.suspendMember.bind(M);
M.suspendMember=async function(id){
  const amount=prompt('Suspend for how many hours? Enter 0 for indefinite:','24');if(amount===null)return;
  const hours=Number(amount);if(!Number.isFinite(hours)||hours<0||hours>87600)return flash('Enter 0 for indefinite, or a duration from 1 to 87,600 hours.','error');
  const reason=prompt('Reason for suspension:');if(!reason?.trim())return;
  const until=hours===0?null:new Date(Date.now()+hours*3600000).toISOString();
  const{error}=await db.rpc('forum_suspend_member',{p_user_id:id,p_until:until,p_reason:reason.trim()});
  if(error)return flash(error.message,'error');
  flash('Member suspended.','success');M.showProfile(id);
};
})();