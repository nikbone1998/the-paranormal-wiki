
(()=>{'use strict';
const C=window.ForumCore;if(!C)return;
const V=window.ForumViews,M=window.ForumMember;
const root=()=>C.$('#forumContent');
const esc=C.esc;
let applying=false,continueLoaded=false,observerStarted=false;

function currentView(){
  const p=new URLSearchParams(location.search);
  if(p.get('thread')||p.get('dm')||p.get('category'))return p.get('category')?'boards':'thread';
  return p.get('view')||'home';
}
function setAreaNav(){
  const view=currentView(),tabs=C.$$('.forum-tab');
  tabs.forEach(t=>t.removeAttribute('aria-current'));
  const map={home:'home',experiences:'home',boards:'home',latest:'latest',search:'search',bookmarks:'member',member:'member','member-profile':'member','member-activity':'member',messages:'member',friends:'member',requests:'member',settings:'member','my-discussions':'member','my-posts':'member',thread:'home'};
  const active=map[view];
  tabs.filter(t=>t.dataset.navView===active&&!t.classList.contains('hidden')).forEach(t=>t.setAttribute('aria-current','page'));
  const account=tabs.find(t=>t.dataset.navView==='member'&&!t.classList.contains('hidden'));
  if(account&&active==='member')account.setAttribute('aria-current','page');
}
function groupName(name){
  const n=String(name||'').toLowerCase();
  if(/experience|sighting|encounter|sleep|dream/.test(n))return ['PERSONAL EXPERIENCES','First-person reports, encounters, and anomalous experiences.'];
  if(/cryptid|creature|haunt|spirit|ghost|ufo|uap|alien|folklore|legend|monster/.test(n))return ['PARANORMAL SUBJECTS','Creatures, hauntings, UFO/UAP, folklore, and unexplained subjects.'];
  if(/theor|research|evidence|case|analysis|investigat/.test(n))return ['RESEARCH & DISCUSSION','Compare explanations, evidence, and case material.'];
  if(/intro|off.?topic|feedback|community|general/.test(n))return ['COMMUNITY','Introductions, site feedback, and conversations outside the main subjects.'];
  return ['OTHER COMMUNITY BOARDS','Additional community spaces.'];
}
function groupBoards(){
  const dirs=[...document.querySelectorAll('.board-directory')];
  dirs.forEach(dir=>{
    if(dir.dataset.iaGrouped==='1')return;
    const cards=[...dir.children].filter(x=>x.classList.contains('board-card'));
    if(!cards.length)return;
    const groups=new Map();
    cards.forEach(card=>{
      const label=card.querySelector('.board-name a')?.textContent||card.querySelector('.board-name')?.textContent||'';
      const key=groupName(label)[0];
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(card);
    });
    dir.dataset.iaGrouped='1';
    dir.innerHTML='';
    const jump=document.createElement('nav');jump.className='ia-board-jump';jump.setAttribute('aria-label','Board categories');
    const order=['PERSONAL EXPERIENCES','PARANORMAL SUBJECTS','RESEARCH & DISCUSSION','COMMUNITY','OTHER COMMUNITY BOARDS'];
    const ordered=[...groups.entries()].sort((a,b)=>(order.indexOf(a[0])<0?99:order.indexOf(a[0]))-(order.indexOf(b[0])<0?99:order.indexOf(b[0])));
    ordered.forEach(([label,cards])=>{
      const anchor=document.createElement('a');anchor.href='#ia-'+label.toLowerCase().replace(/[^a-z0-9]+/g,'-');anchor.textContent=label;jump.append(anchor);
    });
    if(dir.id==='boardsAll')dir.append(jump);
    ordered.forEach(([label,cards])=>{
      const section=document.createElement('section');section.className='ia-board-group';section.id='ia-'+label.toLowerCase().replace(/[^a-z0-9]+/g,'-');
      const title=document.createElement('div');title.className='ia-board-group-title';title.innerHTML='<span>'+esc(label)+'</span><span>'+cards.length+' BOARD'+(cards.length===1?'':'S')+'</span>';section.append(title);
      cards.forEach(card=>section.append(card));
      dir.append(section);
    });
  });
}
function addContinue(){
  const r=root();if(!r||!C.state.session||!C.state.profile||r.querySelector('#iaContinue'))return;
  const head=r.querySelector('.page-head');if(!head)return;
  const section=document.createElement('section');section.id='iaContinue';section.className='panel ia-continue';
  section.innerHTML='<div class="panel-title">YOUR COMMUNITY <span>PRIVATE MEMBER SHORTCUTS</span></div><div class="ia-continue-grid"><a class="ia-continue-card" data-route href="/forum/?view=member"><strong>MEMBER AREA</strong><span>Your community home and activity.</span></a><a class="ia-continue-card" data-route href="/forum/?view=messages"><strong>MESSAGES</strong><span>Open private conversations.</span></a><a class="ia-continue-card" data-route href="/forum/?view=requests"><strong>REQUESTS</strong><span>Friend and message requests.</span></a><a class="ia-continue-card" data-route href="/forum/?view=bookmarks"><strong>BOOKMARKS</strong><span>Return to saved conversations.</span></a></div>';
  head.after(section);continueLoaded=true;
}
function decorateMemberNav(){
  document.querySelectorAll('.member-nav').forEach(nav=>{
    if(nav.dataset.iaGrouped==='1')return;
    const links=[...nav.querySelectorAll('a')];if(!links.length)return;
    const groups=[['ACTIVITY',links.filter(a=>/overview|profile|activity|bookmark/i.test(a.textContent))],['PEOPLE',links.filter(a=>/message|friend|request/i.test(a.textContent))],['ACCOUNT',links.filter(a=>/setting/i.test(a.textContent))]];
    nav.innerHTML='';nav.classList.add('ia-member-nav');nav.dataset.iaGrouped='1';
    groups.forEach(([label,items])=>{if(!items.length)return;const box=document.createElement('div');box.className='ia-member-nav-group';const h=document.createElement('div');h.className='ia-member-nav-group-title';h.textContent=label;box.append(h);items.forEach(a=>box.append(a));nav.append(box)});
  });
}
function threadRows(){return [...document.querySelectorAll('.thread-list')].filter(list=>!list.closest('#homeExperiences,#homeLatest'))}
function decorateThreadControls(){
  threadRows().forEach(list=>{
    if(list.dataset.iaControls==='1'||!list.querySelector('.thread-row'))return;
    list.dataset.iaControls='1';
    const bar=document.createElement('div');bar.className='ia-thread-controls';
    bar.innerHTML='<span class="ia-thread-controls-label">VIEW DISCUSSIONS BY</span><span class="ia-thread-control-set"><button type="button" class="ia-thread-control" data-ia-sort="latest" aria-pressed="true">LATEST</button><button type="button" class="ia-thread-control" data-ia-sort="discussed" aria-pressed="false">MOST DISCUSSED</button><button type="button" class="ia-thread-control" data-ia-sort="unanswered" aria-pressed="false">UNANSWERED</button>'+(C.state.session&&C.state.profile?'<a class="ia-thread-control" data-route href="/forum/?view=my-discussions">MY DISCUSSIONS</a>':'')+'</span>';
    list.before(bar);
  });
}
function threadCount(row){
  const strong=row.querySelector('.thread-stats strong');return strong?Number(strong.textContent)||0:0;
}
function sortRows(button){
  const list=button.closest('.thread-list'),rows=[...list.querySelectorAll('.thread-row')],mode=button.dataset.iaSort;
  list.querySelectorAll('[data-ia-sort]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  rows.forEach(r=>r.classList.remove('hidden'));
  if(mode==='discussed')rows.sort((a,b)=>threadCount(b)-threadCount(a)).forEach(r=>list.append(r));
  if(mode==='unanswered')rows.forEach(r=>{if(threadCount(r)>0)r.classList.add('hidden')});
}
async function memberSearch(form){
  const q=form.querySelector('input')?.value.trim()||'',box=form.querySelector('.ia-member-result');if(!box)return;
  if(q.length<2){box.innerHTML='<div class="empty-state">Enter at least two characters.</div>';return}
  if(!C.state.session){box.innerHTML='<div class="empty-state">Sign in to search public members.<br><button class="bbs-btn secondary" type="button" data-auth-open="signin" style="margin-top:8px">SIGN IN</button></div>';return}
  box.innerHTML='<div class="loading-state">SEARCHING MEMBERS…</div>';
  try{
    const r=await C.db.rpc('forum_search_members',{p_query:q,p_limit:20});
    if(r.error)throw r.error;
    const rows=r.data||[];
    box.innerHTML=rows.length?rows.map(p=>'<article class="ia-member-result-card"><div>'+C.avatar(p,'sm')+'<a href="#" data-profile="'+esc(p.id)+'"><strong>'+esc(C.displayName(p))+'</strong><small>@'+esc(p.username)+'</small></a></div><button type="button" class="bbs-btn secondary" data-profile="'+esc(p.id)+'">OPEN PROFILE</button></article>').join(''):'<div class="empty-state">No members found.</div>';
  }catch(e){box.innerHTML='<div class="empty-state">Member search is temporarily unavailable. Please try again later.</div>'}
}
function searchTabs(){
  const form=C.$('#searchForm');if(!form)return;
  const panel=form.closest('.panel');if(!panel)return;
  let tabs=panel.querySelector('.ia-search-tabs');
  if(!tabs){tabs=document.createElement('div');tabs.className='ia-search-tabs';panel.insertBefore(tabs,form)}
  const p=new URLSearchParams(location.search),type=p.get('searchType')||'discussions',q=p.get('q')||'';
  const href=t=>'/forum/?view=search&searchType='+encodeURIComponent(t)+(q?'&q='+encodeURIComponent(q):'');
  const labels=[['all','ALL'],['archive','ARCHIVE'],['discussions','DISCUSSIONS'],['members','MEMBERS'],['boards','BOARDS']];
  tabs.innerHTML=labels.map(x=>x[0]==='archive'?'<a class="ia-search-tab" href="/#search">ARCHIVE</a>':'<a class="ia-search-tab" data-route aria-selected="'+String(type===x[0])+'" href="'+href(x[0])+'">'+x[1]+'</a>').join('');
  let mode=panel.querySelector('.ia-search-mode');
  if(type==='discussions'||type==='all'){
    form.classList.remove('hidden');if(mode)mode.remove();return;
  }
  form.classList.add('hidden');
  if(!mode){mode=document.createElement('section');mode.className='ia-search-mode';panel.append(mode)}
  if(mode.dataset.iaType===type&&((type==='members'&&mode.querySelector('#iaMemberSearchForm'))||type!=='members'))return;
  mode.dataset.iaType=type;
  if(type==='archive'){mode.innerHTML='<p>Search the canonical Paranormal Wiki archive for dossiers, entities, regions, cultures, and other reference material.</p><a class="bbs-btn primary" href="/#search">OPEN ARCHIVE SEARCH</a>';return}
  if(type==='boards'){mode.innerHTML='<p>Browse the community boards by subject or purpose.</p><div class="ia-member-result">'+C.state.categories.map(c=>'<article class="ia-member-result-card"><a data-route href="/forum/?category='+encodeURIComponent(c.slug)+'"><strong>'+esc(c.name)+'</strong><small>'+esc(c.description||'Open this community board.')+'</small></a><a class="bbs-btn secondary" data-route href="/forum/?category='+encodeURIComponent(c.slug)+'">OPEN</a></article>').join('')+'</div>';return}
  if(type==='members'){
    mode.innerHTML='<p>Find a public forum member by username or display name.</p><form id="iaMemberSearchForm" class="form-stack"><div class="field"><label for="iaMemberSearchInput">Member search</label><input id="iaMemberSearchInput" maxlength="120" value="'+esc(q)+'" placeholder="Search members…"></div><button class="bbs-btn primary" type="submit">SEARCH MEMBERS</button></form><div class="ia-member-result"><div class="empty-state">Enter at least two characters.</div></div>';
    const f=mode.querySelector('#iaMemberSearchForm');if(q.length>=2)memberSearch(f);
  }
}
function mobileNav(){
  if(C.$('#iaMobileNav'))return;
  const n=document.createElement('nav');n.id='iaMobileNav';n.className='ia-mobile-nav';n.setAttribute('aria-label','Mobile forum navigation');
  n.innerHTML='<a data-route data-mobile-view="home" href="/forum/"><b>⌂</b><span>HOME</span></a><a data-route data-mobile-view="boards" href="/forum/?view=boards"><b>▦</b><span>BROWSE</span></a><button type="button" class="ia-mobile-primary" data-new-thread><b>＋</b><span>NEW POST</span></button><a data-route data-mobile-view="latest" href="/forum/?view=latest"><b>≡</b><span>LATEST</span></a><a data-route data-mobile-view="member" href="/forum/?view=member"><b>◎</b><span>ACCOUNT</span></a>';
  document.body.append(n);
  setMobileActive();
}
function setMobileActive(){
  const view=currentView(),map={home:'home',experiences:'home',boards:'boards',latest:'latest',search:'home',bookmarks:'member',member:'member','member-profile':'member','member-activity':'member',messages:'member',friends:'member',requests:'member',settings:'member','my-discussions':'member','my-posts':'member',thread:'home'};
  document.querySelectorAll('[data-mobile-view]').forEach(a=>{if(a.dataset.mobileView===map[view])a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
}
function ensureMemberSearch(){
  const p=new URLSearchParams(location.search),f=C.$('#iaMemberSearchForm');
  if(p.get('searchType')!=='members'||!f||f.dataset.iaSearchStarted==='1')return;
  const q=f.querySelector('input')?.value.trim()||'';
  if(q.length<2)return;
  f.dataset.iaSearchStarted='1';memberSearch(f);
}
function apply(){
  if(applying)return;applying=true;
  try{
    setAreaNav();mobileNav();setMobileActive();groupBoards();if(currentView()==='home')addContinue();decorateMemberNav();decorateThreadControls();searchTabs();ensureMemberSearch();
    document.body.classList.add('ia-mobile-dock-space');
  }finally{applying=false}
}
function wire(){
  document.addEventListener('click',e=>{
    const sort=e.target.closest('[data-ia-sort]');if(sort){sortRows(sort);return}
  });
  document.addEventListener('submit',e=>{
    if(e.target.id==='iaMemberSearchForm'){e.preventDefault();const q=e.target.querySelector('input')?.value.trim()||'';const u=new URL(location.href);u.searchParams.set('q',q);history.pushState({},'',u.pathname+'?'+u.searchParams.toString());apply();memberSearch(e.target)}
  });
  window.addEventListener('popstate',()=>setTimeout(apply,40));
  const r=root();if(r&&!observerStarted){observerStarted=true;new MutationObserver(()=>setTimeout(apply,20)).observe(r,{childList:true,subtree:true})}
}
function boot(){wire();setTimeout(apply,120)}
boot();
})();
