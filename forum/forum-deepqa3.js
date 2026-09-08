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