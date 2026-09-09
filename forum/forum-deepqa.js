(()=>{'use strict';
const C=window.ForumCore,T=window.ForumThread,S=window.ForumSocial,N=window.ForumMember;
const{db,state,$,esc,rel,displayName,avatar,badge,urlFor,flash}=C;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validUuid=v=>UUID_RE.test(String(v||''));

// Important routes should fail cleanly rather than exposing a Postgres UUID parser error.
const baseThread=T.renderThread.bind(T);
T.renderThread=async function(id,...rest){if(!validUuid(id))return C.renderNotFound('This discussion link is invalid.');return baseThread(id,...rest)};
const baseConversation=S.renderConversation.bind(S);
S.renderConversation=async function(id,...rest){if(!validUuid(id))return C.renderNotFound('This private conversation link is invalid.');const result=await baseConversation(id,...rest);await correctPendingConversationBanner(id);return result};

async function allConversationSummaries(){
  if(!state.profile)return[];
  const out=[];let offset=0;
  for(let page=0;page<10;page++){
    const{data,error}=await db.rpc('forum_direct_conversation_summaries',{p_limit:200,p_offset:offset});
    if(error)throw error;const rows=data||[];out.push(...rows);if(rows.length<200)break;offset+=rows.length;
  }
  return out;
}
const ownReadAt=c=>c.user_one===state.profile?.id?c.read_at_one:c.read_at_two;
async function accurateAttention(){
  if(!state.session||!state.profile)return{unreadMessages:0,friendRequests:0,messageRequests:0,total:0};
  const uid=state.profile.id,[rows,settingsRes,friendRes]=await Promise.all([
    allConversationSummaries(),
    db.from('forum_member_settings').select('notify_private_messages,notify_friend_requests,notify_message_requests').eq('user_id',uid).maybeSingle(),
    db.from('forum_friendships').select('requested_by,status').or(`user_one.eq.${uid},user_two.eq.${uid}`).eq('status','pending')
  ]);
  if(settingsRes.error)throw settingsRes.error;if(friendRes.error)throw friendRes.error;
  const s=settingsRes.data||{notify_private_messages:true,notify_friend_requests:true,notify_message_requests:true};
  const unreadMessages=rows.filter(c=>c.status==='active'&&c.last_message_at&&(!ownReadAt(c)||new Date(c.last_message_at)>new Date(ownReadAt(c)))).length;
  const messageRequests=rows.filter(c=>c.status==='pending'&&c.requested_by!==uid&&c.last_message_id).length;
  const friendRequests=(friendRes.data||[]).filter(f=>f.requested_by!==uid).length;
  const total=(s.notify_private_messages?unreadMessages:0)+(s.notify_friend_requests?friendRequests:0)+(s.notify_message_requests?messageRequests:0);
  return{unreadMessages,friendRequests,messageRequests,total};
}
function patchAttentionDom(a){
  const tab=$('#memberAreaTab');if(tab&&state.profile)tab.textContent=a.total?`MEMBER AREA (${a.total})`:'MEMBER AREA';
  const chip=$('#accountChip');if(chip){chip.querySelector('.member-chip-badge')?.remove();if(a.total)chip.insertAdjacentHTML('beforeend',`<span class="member-chip-badge" aria-label="${a.total} private member alerts">${a.total}</span>`)}
  const menu=$('#accountMenu');if(menu){
    const member=[...menu.querySelectorAll('a')].find(x=>x.href.includes('view=member')&&!x.href.includes('member-'));
    const messages=[...menu.querySelectorAll('a')].find(x=>x.href.includes('view=messages'));
    const requests=[...menu.querySelectorAll('a')].find(x=>x.href.includes('view=requests'));
    if(member)member.textContent=a.total?`MEMBER AREA (${a.total})`:'MEMBER AREA';
    if(messages)messages.textContent=a.unreadMessages?`PRIVATE MESSAGES (${a.unreadMessages})`:'PRIVATE MESSAGES';
    if(requests)requests.textContent=a.friendRequests+a.messageRequests?`REQUESTS (${a.friendRequests+a.messageRequests})`:'REQUESTS';
  }
  for(const card of document.querySelectorAll('.member-stat-card')){
    const label=card.querySelector('span')?.textContent?.trim(),num=card.querySelector('strong');if(!num)continue;
    if(label==='UNREAD MESSAGES')num.textContent=a.unreadMessages;
    else if(label==='FRIEND REQUESTS')num.textContent=a.friendRequests;
    else if(label==='MESSAGE REQUESTS')num.textContent=a.messageRequests;
  }
  for(const link of document.querySelectorAll('.member-quick-actions a')){
    const href=link.getAttribute('href')||'';
    if(href.includes('view=messages'))link.textContent=a.unreadMessages?`MESSAGES (${a.unreadMessages})`:'MESSAGES';
    if(href.includes('view=requests'))link.textContent=a.friendRequests+a.messageRequests?`REQUESTS (${a.friendRequests+a.messageRequests})`:'REQUESTS';
  }
}
const baseMemberRefresh=N.refreshNav.bind(N);
N.refreshNav=async function(){await baseMemberRefresh();if(!state.profile)return;try{patchAttentionDom(await accurateAttention())}catch{}};
const baseOverview=N.renderOverview.bind(N);
N.renderOverview=async function(){await baseOverview();if(!state.profile)return;try{patchAttentionDom(await accurateAttention())}catch{}};

// Blank pending rows are drafts, not actual incoming message requests.
const baseRequests=N.renderRequests.bind(N);
N.renderRequests=async function(){
  await baseRequests();if(!state.profile)return;
  try{
    const summaries=await allConversationSummaries(),valid=new Set(summaries.filter(x=>x.status==='pending'&&x.requested_by!==state.profile.id&&x.last_message_id).map(x=>x.id));
    const panels=[...document.querySelectorAll('#forumContent .panel')],panel=panels.find(p=>p.querySelector('.panel-title')?.textContent?.trim().startsWith('MESSAGE REQUESTS'));
    if(panel){for(const card of [...panel.querySelectorAll('.member-person-card')]){const id=card.querySelector('[data-social-action="accept-message"]')?.dataset.socialTarget;if(id&&!valid.has(id))card.remove()}
      const count=panel.querySelectorAll('.member-person-card').length,span=panel.querySelector('.panel-title span');if(span)span.textContent=count;
      if(!count&&!panel.querySelector('.empty-state'))panel.insertAdjacentHTML('beforeend','<div class="empty-state">No message requests.</div>');
    }
    patchAttentionDom(await accurateAttention());
  }catch{}
};

function socialButton(label,action,target){return`<button class="bbs-btn secondary" type="button" data-social-action="${esc(action)}" data-social-target="${esc(target)}">${esc(label)}</button>`}
function conversationCard({c,p,unread}){
  const hasMessage=!!c.last_message_id,request=c.status==='pending',incoming=request&&c.requested_by!==state.profile.id&&hasMessage;
  const draft=request&&c.requested_by===state.profile.id&&!hasMessage;
  const preview=c.last_body||c.last_attachment_name||(draft?'DRAFT — NOT SENT':request?'Message request':'No messages yet');
  return`<article class="dm-row ${unread?'unread':''}"><a class="dm-row-main" data-route href="${urlFor({dm:c.id})}">${avatar(p,'sm')}<span class="dm-row-copy"><strong>${esc(displayName(p))} ${unread?'<span class="status">NEW</span>':''}</strong><span>@${esc(p.username)}</span><span>${esc(preview)}</span></span></a><div class="dm-row-meta"><span>${esc(rel(c.last_message_at||c.updated_at))}</span>${incoming?`<div>${socialButton('ACCEPT','accept-message',c.id)}${socialButton('DECLINE','decline-message',c.id)}</div>`:request&&hasMessage?'<span class="status">REQUEST SENT</span>':draft?'<span class="status">DRAFT</span>':''}</div></article>`;
}
S.renderMessages=async function(){
  C.activeTab('member');C.crumbs([{label:'Forum',href:'/forum/'},{label:'Member Area',href:'/forum/?view=member'},{label:'Messages'}]);
  if(!(state.session&&state.profile)){C.requireProfile();return}
  const rows=await allConversationSummaries(),pm=await C.profiles(rows.map(c=>c.user_one===state.profile.id?c.user_two:c.user_one)),items=rows.map(c=>({c,p:pm.get(c.user_one===state.profile.id?c.user_two:c.user_one),unread:!!(c.status==='active'&&c.last_message_at&&(!ownReadAt(c)||new Date(c.last_message_at)>new Date(ownReadAt(c))))})).filter(x=>x.p);
  const incoming=items.filter(x=>x.c.status==='pending'&&x.c.requested_by!==state.profile.id&&x.c.last_message_id),rest=items.filter(x=>!incoming.includes(x)&&!(x.c.status==='pending'&&x.c.requested_by!==state.profile.id&&!x.c.last_message_id));
  $('#forumContent').innerHTML=C.pageHead('PRIVATE COMMUNITY','Messages','One-to-one conversations. Non-friends arrive as message requests after they actually send their first message.',`<a class="bbs-btn secondary" data-route href="/forum/?view=friends">FRIENDS & REQUESTS</a>`)+`${incoming.length?`<section class="panel"><div class="panel-title">MESSAGE REQUESTS <span>${incoming.length}</span></div>${incoming.map(conversationCard).join('')}</section>`:''}<section class="panel ${incoming.length?'social-section':''}"><div class="panel-title">CONVERSATIONS</div>${rest.length?rest.map(conversationCard).join(''):'<div class="empty-state">No private conversations yet. Open a member profile and choose MESSAGE.</div>'}</section>`;
  await S.refreshNav();
};
function pendingDraftComposer(){return`<form id="dmComposer" class="dm-composer"><textarea id="dmBody" maxlength="5000" placeholder="Write a private message…"></textarea><div id="dmFilePreview" class="dm-file-preview"></div><div class="dm-compose-actions"><button class="bbs-btn primary" type="submit">SEND REQUEST</button></div><div class="field-help">Nothing is sent until you submit this first message. Photos and videos unlock after the other member accepts.</div></form>`}
async function correctPendingConversationBanner(id){
  if(!state.profile||!validUuid(id))return;
  try{
    const{data,error}=await db.rpc('forum_direct_conversation_summaries',{p_limit:200,p_offset:0});if(error)return;const c=(data||[]).find(x=>x.id===id);if(!c||c.status!=='pending')return;
    const banner=$('#forumContent .dm-request-banner');
    if(!c.last_message_id){
      if(banner)banner.innerHTML='<strong>MESSAGE REQUEST DRAFT</strong><span>Nothing has been sent yet. The first person to submit a message starts the request.</span>';
      else $('#forumContent .dm-head')?.insertAdjacentHTML('afterend','<div class="dm-request-banner"><strong>MESSAGE REQUEST DRAFT</strong><span>Nothing has been sent yet. The first person to submit a message starts the request.</span></div>');
      if(!$('#dmComposer'))$('#forumContent .dm-shell')?.insertAdjacentHTML('beforeend',pendingDraftComposer());
    }
  }catch{}
}

// Preserve native browser new-tab behavior for modified clicks on forum links.
document.addEventListener('pointerdown',e=>{const a=e.target.closest?.('a[data-route]');if(!a||!(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey))return;a.dataset.deepqaRoute='1';a.removeAttribute('data-route');setTimeout(()=>{if(a.isConnected&&a.dataset.deepqaRoute){a.setAttribute('data-route','');delete a.dataset.deepqaRoute}},500)},true);

// viewport-fit=cover requires explicit safe-area padding on iPhone/standalone Safari.
const style=document.createElement('style');style.textContent=`
.forum-shell{padding-bottom:calc(54px + env(safe-area-inset-bottom,0px))}
@supports(padding:max(0px)){.modal-backdrop{padding-top:max(14px,env(safe-area-inset-top));padding-right:max(14px,env(safe-area-inset-right));padding-bottom:max(14px,env(safe-area-inset-bottom));padding-left:max(14px,env(safe-area-inset-left))}.forum-tabs{padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)}}
@media(orientation:landscape) and (max-height:500px){.account-menu{max-height:calc(100dvh - max(12px,env(safe-area-inset-top)) - max(12px,env(safe-area-inset-bottom)))}}
`;document.head.append(style);
})();