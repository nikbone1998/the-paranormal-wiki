(()=>{'use strict';
const C=window.ForumCore,M=window.ForumCommunity,N=window.ForumMember,S=window.ForumSocial;
const{$,state}=C;
function signedIn(){return!!(state.session&&state.profile)}
function signedOutView(){
  C.activeTab('');C.crumbs([{label:'Forum',href:'/forum/'},{label:'Member Area'}]);
  $('#forumContent').innerHTML=C.pageHead('PRIVATE COMMUNITY','Sign In Required','Your private messages, friends, requests and settings are available after you sign in.')+'<section class="panel"><div class="empty-state"><button class="bbs-btn primary" type="button" data-auth-open="signin">SIGN IN</button></div></section>';
  C.requireProfile();
}
function guard(name){const base=N[name]?.bind(N);if(!base)return;N[name]=async function(...args){if(!signedIn())return signedOutView();return base(...args)}}
['renderOverview','renderRequests','renderMemberProfile','renderActivity','renderSettings','renderMessages','renderFriends','renderConversation'].forEach(guard);

// If an existing DM becomes disallowed because of blocking/friend/privacy changes,
// remove the misleading composer before the user types a message that the server will reject.
const baseConversation=S.renderConversation.bind(S);
S.renderConversation=async function(id,...args){
  const result=await baseConversation(id,...args);if(!signedIn())return result;
  try{
    const{data:c,error}=await C.db.from('forum_direct_conversations').select('user_one,user_two,status').eq('id',id).maybeSingle();if(error||!c)return result;
    const other=c.user_one===state.profile.id?c.user_two:c.user_one,{data:allowed,error:pe}=await C.db.rpc('forum_can_message_member',{p_target:other});if(pe||allowed!==false)return result;
    $('#dmComposer')?.remove();
    if(!$('#dmPermissionBanner')){const messages=$('#dmMessages');messages?.insertAdjacentHTML('beforebegin','<div id="dmPermissionBanner" class="dm-request-banner"><strong>PRIVATE MESSAGING UNAVAILABLE</strong><span>This conversation is currently read-only because the relationship, block, suspension, or privacy state no longer permits new messages.</span></div>')}
  }catch{}
  return result;
};

// A hard reload on sign-out guarantees camera/microphone, WebRTC peers, presence, typing,
// stale private DOM and account-specific JS caches cannot survive into the signed-out state.
M.signOut=async function(){
  try{await S.teardownConversationChannel?.()}catch{}
  try{await S.teardownUserChannel?.()}catch{}
  try{await C.db.auth.signOut()}catch{}
  location.replace('/forum/');
};
C.db.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'&&!session){
    const video=$('#videoCallModal');
    if(video&&!video.classList.contains('hidden'))location.replace('/forum/');
  }
});
})();