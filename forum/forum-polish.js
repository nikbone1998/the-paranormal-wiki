(() => {
  'use strict';

  const URL='https://waqobihznhkbspdchjbb.supabase.co';
  const KEY='sb_publishable_uPGjlkbauGtisASevhnTLA_jIJDhzZG';
  const db=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const BOARD_PAGE_SIZE=20;
  const POST_PAGE_SIZE=15;

  let userId=null;
  let categoryToken=0;
  let timer=null;
  let editedSig='';
  let headerSig='';

  const $=s=>document.querySelector(s);
  const fmt=v=>{if(!v)return'';try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch{return String(v)}};
  const safe=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const nameOf=p=>p?.display_name||p?.username||'Unknown member';
  const badge=r=>r&&r!=='member'?`<span class="role-badge ${safe(r)}">${safe(r)}</span>`:'';

  function flash(message,kind=''){
    const el=$('#globalNotice');
    if(!el)return;
    el.className=`notice ${kind}`.trim();
    el.textContent=message;
    el.classList.remove('hidden');
    clearTimeout(flash.t);
    flash.t=setTimeout(()=>el.classList.add('hidden'),5000);
  }

  async function refreshUser(){
    const{data}=await db.auth.getSession();
    userId=data.session?.user?.id||null;
    syncEditButtons();
  }

  async function profiles(ids){
    const list=[...new Set((ids||[]).filter(Boolean))];
    if(!list.length)return new Map();
    const{data,error}=await db.from('forum_profiles').select('id,username,display_name,role,created_at').in('id',list);
    if(error)throw error;
    return new Map((data||[]).map(p=>[p.id,p]));
  }

  async function metadata(ids){
    const list=[...new Set((ids||[]).filter(Boolean))];
    if(!list.length)return new Map();
    const{data,error}=await db.rpc('forum_thread_metadata',{p_thread_ids:list});
    if(error)throw error;
    const map=new Map((data||[]).map(r=>[r.thread_id,{
      posts:Number(r.post_count||0),
      replies:Number(r.reply_count||0),
      lastAt:r.last_post_at||null,
      lastAuthor:r.last_post_author_id||null
    }]));
    const pm=await profiles([...map.values()].map(m=>m.lastAuthor));
    for(const m of map.values())m.lastProfile=pm.get(m.lastAuthor)||null;
    return map;
  }

  function categoryCrumb(label){
    const el=$('#breadcrumbs');
    if(!el)return;
    el.innerHTML='';
    const b=document.createElement('button');
    b.type='button';b.textContent='Forum';b.onclick=()=>location.href='/forum/';
    el.append(b,document.createTextNode(' / '));
    const s=document.createElement('span');s.textContent=label;el.append(s);
  }

  function threadRow(t,category,starter,m){
    const flags=`${t.is_pinned?'<span class="thread-flag pin">PINNED</span>':''}${t.is_locked?'<span class="thread-flag lock">LOCKED</span>':''}`;
    const replies=m?.replies||0,posts=m?.posts||0;
    return `<div class="thread-row polished-thread-row"><div class="thread-title-wrap"><button type="button" class="thread-link thread-title" data-thread="${safe(t.id)}">${safe(t.title)}</button><span class="thread-flags">${flags}</span></div><div class="thread-meta"><span>started ${safe(fmt(t.created_at))} by ${safe(nameOf(starter))}${badge(starter?.role)}</span><span class="thread-detail-sep"> · </span><span>${replies} ${replies===1?'reply':'replies'} / ${posts} ${posts===1?'post':'posts'}</span><span class="thread-detail-sep"> · </span><span>last post ${safe(fmt(m?.lastAt||t.last_post_at))} by ${safe(nameOf(m?.lastProfile))}</span></div></div>`;
  }

  async function showCategory(slug,page=1,push=true){
    const token=++categoryToken;
    page=Math.max(1,Number(page)||1);
    const box=$('#categories'),home=$('#forumHome'),thread=$('#threadView'),title=$('#mainTitle');
    if(!box||!home||!thread||!title)return;
    thread.classList.add('hidden');home.classList.remove('hidden');box.innerHTML='<div class="empty-state">Loading discussions…</div>';

    try{
      const{data:c,error:ce}=await db.from('forum_categories').select('id,slug,name').eq('slug',slug).maybeSingle();
      if(ce)throw ce;if(!c)return box.innerHTML='<div class="empty-state">Board not found.</div>';if(token!==categoryToken)return;
      title.textContent=c.name;
      const from=(page-1)*BOARD_PAGE_SIZE,to=from+BOARD_PAGE_SIZE-1;
      const{data:rows,error,count}=await db.from('forum_threads').select('id,title,author_id,created_at,last_post_at,is_pinned,is_locked',{count:'exact'}).eq('category_id',c.id).eq('moderation_status','visible').order('is_pinned',{ascending:false}).order('last_post_at',{ascending:false}).range(from,to);
      if(error)throw error;if(token!==categoryToken)return;
      const list=rows||[];
      const [starters,stats]=await Promise.all([profiles(list.map(x=>x.author_id)),metadata(list.map(x=>x.id))]);
      if(token!==categoryToken)return;
      const total=count||0,pages=Math.max(1,Math.ceil(total/BOARD_PAGE_SIZE));
      if(page>pages&&total)return showCategory(slug,pages,push);
      box.innerHTML=`${list.length?list.map(t=>threadRow(t,c.name,starters.get(t.author_id),stats.get(t.id))).join(''):'<div class="empty-state">No discussions yet. The archive is quiet.</div>'}<div class="forum-pagination"><button class="bbs-btn secondary" type="button" data-board-page="${page-1}" ${page<=1?'disabled':''}>PREVIOUS</button><span class="page-status">PAGE ${page} OF ${pages} · ${total} ${total===1?'DISCUSSION':'DISCUSSIONS'}</span><button class="bbs-btn secondary" type="button" data-board-page="${page+1}" ${page>=pages?'disabled':''}>NEXT</button></div>`;
      box.querySelectorAll('[data-thread]').forEach(b=>b.onclick=()=>location.href=`/forum/?thread=${encodeURIComponent(b.dataset.thread)}`);
      box.querySelectorAll('[data-board-page]').forEach(b=>b.onclick=()=>showCategory(slug,Number(b.dataset.boardPage),true));
      categoryCrumb(c.name);
      if(push)history.pushState({category:slug,page},'',`/forum/?category=${encodeURIComponent(slug)}&page=${page}`);
    }catch(e){console.error(e);box.innerHTML='<div class="empty-state">Unable to load this board.</div>'}
  }

  async function enrichRows(){
    const buttons=[...document.querySelectorAll('#latestThreads [data-thread],#categories [data-thread]')];
    const pending=buttons.filter(b=>{const r=b.closest('.thread-row');return r&&!r.classList.contains('polished-thread-row')&&!r.dataset.polishMeta});
    if(!pending.length)return;
    const ids=[...new Set(pending.map(b=>b.dataset.thread))];
    try{
      const [stats,tr]=await Promise.all([metadata(ids),db.from('forum_threads').select('id,created_at').in('id',ids)]);
      if(tr.error)throw tr.error;
      const tm=new Map((tr.data||[]).map(t=>[t.id,t]));
      for(const b of pending){
        const row=b.closest('.thread-row'),meta=row?.querySelector('.thread-meta');
        if(!row||!meta)continue;
        const m=stats.get(b.dataset.thread),t=tm.get(b.dataset.thread);
        const span=document.createElement('span');span.className='thread-counts';span.textContent=` · started ${fmt(t?.created_at)} · ${m?.replies||0} ${(m?.replies||0)===1?'reply':'replies'} / ${m?.posts||0} ${(m?.posts||0)===1?'post':'posts'} · last post by ${nameOf(m?.lastProfile)}`;
        meta.append(span);row.dataset.polishMeta='1';
      }
    }catch(e){console.warn('Row metadata skipped',e)}
  }

  function syncEditButtons(){
    document.querySelectorAll('[data-own-edit-post]').forEach(b=>{
      const author=b.closest('article.post')?.querySelector('[data-profile]')?.dataset.profile;
      if(!userId||author!==userId)b.remove();
    });
    document.querySelectorAll('#threadPosts article.post').forEach(a=>{
      const author=a.querySelector('[data-profile]')?.dataset.profile,postId=a.id?.replace(/^post-/,'');
      if(!userId||author!==userId||!postId||a.querySelector('[data-own-edit-post]'))return;
      const tools=a.querySelector('.post-tools');if(!tools)return;
      const b=document.createElement('button');b.type='button';b.className='mini-btn';b.dataset.ownEditPost=postId;b.textContent='EDIT';tools.prepend(b);
    });
    const threadAuthor=$('#threadMeta [data-profile]')?.dataset.profile,actions=$('.thread-head .forum-actions');let b=$('#editThreadTitleBtn');
    if(userId&&threadAuthor===userId&&actions&&!b){b=document.createElement('button');b.id='editThreadTitleBtn';b.type='button';b.className='bbs-btn secondary';b.textContent='EDIT TITLE';actions.append(b)}
    else if((!userId||threadAuthor!==userId)&&b)b.remove();
  }

  function markEdited(article,when){
    const meta=article?.querySelector('.post-tools .thread-meta');if(!meta)return;
    let m=meta.querySelector('.edited-marker');if(!m){m=document.createElement('span');m.className='edited-marker';meta.append(m)}
    m.textContent=` · EDITED ${fmt(when)}`;
  }

  async function loadEditedMarkers(){
    const articles=[...document.querySelectorAll('#threadPosts article.post')],ids=articles.map(a=>a.id?.replace(/^post-/,'')).filter(Boolean),sig=ids.join('|');
    if(!ids.length||sig===editedSig)return;editedSig=sig;
    try{
      const{data,error}=await db.from('forum_posts').select('id,created_at,updated_at').in('id',ids);if(error)throw error;
      const map=new Map((data||[]).map(x=>[x.id,x]));
      for(const a of articles){const x=map.get(a.id.replace(/^post-/,''));if(x&&new Date(x.updated_at)-new Date(x.created_at)>1000)markEdited(a,x.updated_at)}
    }catch(e){console.warn('Edit markers skipped',e)}
  }

  async function editPost(id){
    if(!userId)return flash('Sign in to edit your post.','error');
    const article=document.getElementById(`post-${id}`),text=article?.querySelector('.post-text');if(!article||!text||article.querySelector('.edit-inline'))return;
    const{data,error}=await db.from('forum_posts').select('body,author_id').eq('id',id).eq('author_id',userId).maybeSingle();
    if(error||!data)return flash(error?.message||'This post is not editable by your account.','error');
    const wrap=document.createElement('div');wrap.className='edit-inline';wrap.innerHTML=`<textarea maxlength="20000" aria-label="Edit post"></textarea><div class="edit-actions"><button type="button" class="bbs-btn" data-save-edit>SAVE CHANGES</button><button type="button" class="bbs-btn secondary" data-cancel-edit>CANCEL</button></div>`;
    const ta=wrap.querySelector('textarea');ta.value=data.body||'';text.after(wrap);text.hidden=true;ta.focus();
    wrap.querySelector('[data-cancel-edit]').onclick=()=>{wrap.remove();text.hidden=false};
    wrap.querySelector('[data-save-edit]').onclick=async e=>{const body=ta.value.trim();if(!body)return flash('A forum post cannot be empty.','error');e.currentTarget.disabled=true;e.currentTarget.textContent='SAVING…';const{data:u,error:ue}=await db.from('forum_posts').update({body}).eq('id',id).eq('author_id',userId).select('body,updated_at').maybeSingle();if(ue||!u){e.currentTarget.disabled=false;e.currentTarget.textContent='SAVE CHANGES';return flash(ue?.message||'Unable to save this edit.','error')}text.textContent=u.body;text.hidden=false;wrap.remove();markEdited(article,u.updated_at);flash('Post updated.','success')};
  }

  async function editTitle(){
    if(!userId)return flash('Sign in to edit this title.','error');
    const id=new URLSearchParams(location.search).get('thread'),heading=$('#threadHeading');if(!id||!heading||$('.title-editor'))return;
    const{data,error}=await db.from('forum_threads').select('title,author_id').eq('id',id).eq('author_id',userId).maybeSingle();if(error||!data)return flash(error?.message||'This title is not editable by your account.','error');
    const wrap=document.createElement('div');wrap.className='edit-inline title-editor';wrap.innerHTML=`<input maxlength="160" minlength="3" aria-label="Edit discussion title"><div class="edit-actions"><button type="button" class="bbs-btn" data-save-title>SAVE TITLE</button><button type="button" class="bbs-btn secondary" data-cancel-title>CANCEL</button></div>`;const input=wrap.querySelector('input');input.value=data.title||'';heading.after(wrap);input.focus();input.select();
    wrap.querySelector('[data-cancel-title]').onclick=()=>wrap.remove();
    wrap.querySelector('[data-save-title]').onclick=async e=>{const title=input.value.trim();if(title.length<3||title.length>160)return flash('Titles must be 3–160 characters.','error');e.currentTarget.disabled=true;e.currentTarget.textContent='SAVING…';const{data:u,error:ue}=await db.from('forum_threads').update({title}).eq('id',id).eq('author_id',userId).select('title').maybeSingle();if(ue||!u){e.currentTarget.disabled=false;e.currentTarget.textContent='SAVE TITLE';return flash(ue?.message||'Unable to save this title.','error')}heading.textContent=u.title;const c=[...document.querySelectorAll('#breadcrumbs span')].at(-1);if(c)c.textContent=u.title;wrap.remove();flash('Discussion title updated.','success')};
  }

  function paginatePosts(requested=null,updateUrl=false){
    const view=$('#threadView'),root=$('#threadPosts');if(!view||view.classList.contains('hidden')||!root)return;
    const posts=[...root.querySelectorAll(':scope > article.post')];let pager=$('#threadPostPager');if(!posts.length){pager?.remove();return}
    const params=new URLSearchParams(location.search);let page=Math.max(1,Number(requested??params.get('postPage')??1)||1),pages=Math.max(1,Math.ceil(posts.length/POST_PAGE_SIZE));if(page>pages)page=pages;
    posts.forEach((p,i)=>p.hidden=i<(page-1)*POST_PAGE_SIZE||i>=page*POST_PAGE_SIZE);
    if(!pager){pager=document.createElement('div');pager.id='threadPostPager';pager.className='forum-pagination thread-post-pagination';root.insertAdjacentElement('afterend',pager)}
    const sig=`${page}:${pages}:${posts.length}`;
    if(pager.dataset.sig!==sig){pager.dataset.sig=sig;pager.innerHTML=`<button class="bbs-btn secondary" type="button" data-post-page="${page-1}" ${page<=1?'disabled':''}>PREVIOUS</button><span class="page-status">POST PAGE ${page} OF ${pages} · ${posts.length} ${posts.length===1?'POST':'POSTS'}</span><button class="bbs-btn secondary" type="button" data-post-page="${page+1}" ${page>=pages?'disabled':''}>NEXT</button>`;pager.querySelectorAll('[data-post-page]').forEach(b=>b.onclick=()=>{const next=Number(b.dataset.postPage);const q=new URLSearchParams(location.search);if(next<=1)q.delete('postPage');else q.set('postPage',String(next));history.pushState({},'',`${location.pathname}?${q}`);paginatePosts(next,false);$('#threadHeading')?.scrollIntoView({behavior:'smooth',block:'start'})})}
    if(updateUrl){const q=new URLSearchParams(location.search);if(page===1)q.delete('postPage');else q.set('postPage',String(page));history.replaceState({},'',`${location.pathname}?${q}`)}
  }

  async function threadHeader(){
    const id=new URLSearchParams(location.search).get('thread'),view=$('#threadView');if(!id||!view||view.classList.contains('hidden'))return;
    const stateText=$('#staffThreadTools')?.textContent||'',postCount=document.querySelectorAll('#threadPosts article.post').length,sig=`${id}:${postCount}:${stateText}`;if(sig===headerSig)return;headerSig=sig;
    try{
      const [tr,stats]=await Promise.all([db.from('forum_threads').select('id,author_id,created_at,last_post_at,is_pinned,is_locked').eq('id',id).maybeSingle(),metadata([id])]);if(tr.error||!tr.data)throw tr.error||new Error('Thread not found');
      const t=tr.data,m=stats.get(id)||{posts:postCount,replies:Math.max(postCount-1,0),lastAt:t.last_post_at};const pm=await profiles([t.author_id,m.lastAuthor]);
      let bar=$('#threadStatsBar');if(!bar){bar=document.createElement('div');bar.id='threadStatsBar';bar.className='thread-stats-bar';$('#threadMeta')?.insertAdjacentElement('afterend',bar)}
      if(bar)bar.innerHTML=`<span><strong>${m.replies||0}</strong> ${(m.replies||0)===1?'REPLY':'REPLIES'}</span><span><strong>${m.posts||0}</strong> ${(m.posts||0)===1?'POST':'POSTS'}</span><span>STARTED ${safe(fmt(t.created_at))} BY ${safe(nameOf(pm.get(t.author_id)))}</span><span>LAST POST ${safe(fmt(m.lastAt||t.last_post_at))} BY ${safe(nameOf(pm.get(m.lastAuthor)))}</span><span>${safe([t.is_pinned?'PINNED':null,t.is_locked?'LOCKED':'OPEN'].filter(Boolean).join(' · '))}</span>`;
    }catch(e){headerSig='';console.warn('Thread header metadata skipped',e)}
  }

  function run(){clearTimeout(timer);timer=setTimeout(()=>{syncEditButtons();enrichRows();loadEditedMarkers();paginatePosts(null,true);threadHeader()},70)}

  document.addEventListener('click',e=>{
    const c=e.target.closest('[data-category]');if(c&&$('#forumHome')?.contains(c)){e.preventDefault();e.stopImmediatePropagation();showCategory(c.dataset.category,1,true);return}
    const p=e.target.closest('[data-own-edit-post]');if(p){e.preventDefault();editPost(p.dataset.ownEditPost);return}
    if(e.target.closest('#editThreadTitleBtn')){e.preventDefault();editTitle()}
  },true);

  new MutationObserver(run).observe(document.body,{subtree:true,childList:true});
  window.addEventListener('popstate',()=>{const q=new URLSearchParams(location.search),c=q.get('category');if(c)setTimeout(()=>showCategory(c,Number(q.get('page')||1),false),0);setTimeout(()=>paginatePosts(Number(q.get('postPage')||1),false),90)});
  db.auth.onAuthStateChange(()=>setTimeout(refreshUser,0));
  refreshUser();
  setTimeout(()=>{const q=new URLSearchParams(location.search),c=q.get('category');if(c)showCategory(c,Number(q.get('page')||1),false);run()},350);
})();