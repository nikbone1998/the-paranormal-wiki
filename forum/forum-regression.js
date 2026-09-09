(()=>{'use strict';
const C=window.ForumCore,T=window.ForumThread,S=window.ForumSocial,M=window.ForumCommunity;
const {db,state,$,esc,urlFor,flash}=C;

// Public sidebar counts must not change just because a staff account can see hidden content.
C.refreshStats=async function(){
  const{data,error}=await db.rpc('forum_public_stats');
  if(error)throw error;
  const row=Array.isArray(data)?data[0]:data;
  $('#forumStats').innerHTML=`<div><strong>${Number(row?.member_count||0)}</strong><span>MEMBERS</span></div><div><strong>${Number(row?.thread_count||0)}</strong><span>CONVERSATIONS</span></div><div><strong>${Number(row?.post_count||0)}</strong><span>POSTS</span></div>`;
};

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

// The cursor module owns all long-DM pagination. This compatibility layer only creates the loader
// shell after the normal conversation renderer has drawn the newest 200 messages.
async function installHistoryShell(id){
  const box=$('#dmMessages');if(!box)return;
  const countRes=await db.from('forum_private_messages').select('*',{count:'exact',head:true}).eq('conversation_id',id).is('deleted_at',null);
  if(countRes.error)return;
  const total=countRes.count||0,existing=$('#dmHistoryLoader');
  if(total<=200){existing?.remove();return}
  existing?.remove();
  box.insertAdjacentHTML('beforebegin',`<div id="dmHistoryLoader" class="dm-history-loader"><button class="bbs-btn secondary" type="button" data-load-older-dm>LOAD EARLIER MESSAGES</button><span>${Math.min(200,total)} OF ${total} MOST RECENT LOADED</span></div>`);
}
const baseRenderConversation=S.renderConversation.bind(S);
S.renderConversation=async function(id,...args){const result=await baseRenderConversation(id,...args);await installHistoryShell(id);return result};

// A cross-conversation video call temporarily borrows the DM channel. Once the call/decline UI
// closes, restore the DM represented by the URL so the composer cannot target a different member.
let callRestoreTimer=null;
function scheduleVisibleDmRestore(){
  const dm=new URLSearchParams(location.search).get('dm');if(!dm)return;
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
function attachCallObservers(){
  callModalObserver.disconnect();
  const incoming=$('#incomingCallModal'),video=$('#videoCallModal');
  if(incoming)callModalObserver.observe(incoming,{attributes:true,attributeFilter:['class']});
  if(video)callModalObserver.observe(video,{attributes:true,attributeFilter:['class']});
}
const baseSocialInit=S.init.bind(S);
S.init=async function(){await baseSocialInit();attachCallObservers()};

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
