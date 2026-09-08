(() => {
  'use strict';

  const SUPABASE_URL='https://waqobihznhkbspdchjbb.supabase.co';
  const SUPABASE_KEY='sb_publishable_uPGjlkbauGtisASevhnTLA_jIJDhzZG';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const PAGE_SIZE=20;
  let currentUserId=null;
  let categoryRenderToken=0;
  let statsBusy=false;

  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const fmt=v=>{if(!v)return'';try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch{return String(v)}};
  const notice=(message,kind='')=>{
    const el=$('#globalNotice');
    if(!el)return;
    el.className=`notice ${kind}`.trim();
    el.textContent=message;
    el.classList.remove('hidden');
    clearTimeout(notice.timer);
    notice.timer=setTimeout(()=>el.classList.add('hidden'),5000);
  };

  async function refreshUser(){
    const{data}=await client.auth.getSession();
    currentUserId=data.session?.user?.id||null;
    ensureEditingControls();
  }

  async function loadProfiles(ids){
    const unique=[...new Set((ids||[]).filter(Boolean))];
    if(!unique.length)return new Map();
    const{data,error}=await client.from('forum_profiles').select('id,username,display_name,role').in('id',unique);
    if(error)throw error;
    return new Map((data||[]).map(p=>[p.id,p]));
  }

  async function getThreadStats(threadIds){
    const ids=[...new Set((threadIds||[]).filter(Boolean))];
    if(!ids.length)return new Map();
    const{data,error}=await client.from('forum_posts').select('thread_id,author_id,created_at').in('thread_id',ids).eq('moderation_status','visible').order('created_at',{ascending:true});
    if(error)throw error;
    const stats=new Map(ids.map(id=>[id,{postCount:0,lastAuthorId:null,lastCreatedAt:null}]));
    for(const post of data||[]){
      const s=stats.get(post.thread_id)||{postCount:0,lastAuthorId:null,lastCreatedAt:null};
      s.postCount+=1;
      if(!s.lastCreatedAt||new Date(post.created_at)>new Date(s.lastCreatedAt)){
        s.lastCreatedAt=post.created_at;
        s.lastAuthorId=post.author_id;
      }
      stats.set(post.thread_id,s);
    }
    const profiles=await loadProfiles([...stats.values()].map(s=>s.lastAuthorId));
    for(const s of stats.values())s.lastProfile=profiles.get(s.lastAuthorId)||null;
    return stats;
  }

  function profileName(profile){return profile?.display_name||profile?.username||'Unknown member'}

  function renderThreadRow(t,categoryName,profile,stat){
    const flags=`${t.is_pinned?'<span class="thread-flag pin">PINNED</span>':''}${t.is_locked?'<span class="thread-flag lock">LOCKED</span>':''}`;
    const replies=Math.max((stat?.postCount||0)-1,0);
    const lastPoster=profileName(stat?.lastProfile);
    const role=profile?.role&&profile.role!=='member'?`<span class="role-badge ${esc(profile.role)}">${esc(profile.role)}</span>`:'';
    return `<div class="thread-row"><div class="thread-title-wrap"><button class="thread-link thread-title" type="button" data-thread="${esc(t.id)}">${esc(t.title)}</button><span class="thread-flags">${flags}</span></div><div class="thread-meta">${esc(categoryName||'Forum')} · ${esc(profileName(profile))}${role} · last activity ${esc(fmt(t.last_post_at))}<span class="thread-counts"> · ${replies} ${replies===1?'reply':'replies'} · last post by ${esc(lastPoster)}</span></div></div>`;
  }

  async function renderCategoryPage(slug,page=1,push=true){
    const token=++categoryRenderToken;
    page=Math.max(1,Number(page)||1);
    const container=$('#categories');
    const home=$('#forumHome');
    const threadView=$('#threadView');
    const mainTitle=$('#mainTitle');
    if(!container||!home||!threadView||!mainTitle)return;
    threadView.classList.add('hidden');
    home.classList.remove('hidden');
    container.innerHTML='<div class="empty-state">Loading discussions…</div>';
    try{
      const{data:category,error:categoryError}=await client.from('forum_categories').select('id,slug,name,description,is_locked').eq('slug',slug).maybeSingle();
      if(categoryError)throw categoryError;
      if(!category){container.innerHTML='<div class="empty-state">Board not found.</div>';return}
      if(token!==categoryRenderToken)return;
      mainTitle.textContent=category.name;
      const from=(page-1)*PAGE_SIZE;
      const to=from+PAGE_SIZE-1;
      const{data:threads,error,count}=await client.from('forum_threads').select('id,title,category_id,author_id,created_at,last_post_at,is_pinned,is_locked',{count:'exact'}).eq('category_id',category.id).eq('moderation_status','visible').order('is_pinned',{ascending:false}).order('last_post_at',{ascending:false}).range(from,to);
      if(error)throw error;
      if(token!==categoryRenderToken)return;
      const rows=threads||[];
      const [profiles,stats]=await Promise.all([loadProfiles(rows.map(t=>t.author_id)),getThreadStats(rows.map(t=>t.id))]);
      if(token!==categoryRenderToken)return;
      const total=count||0;
      const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
      if(page>totalPages&&total>0){return renderCategoryPage(slug,totalPages,push)}
      const rowHtml=rows.length?rows.map(t=>renderThreadRow(t,category.name,profiles.get(t.author_id),stats.get(t.id))).join(''):'<div class="empty-state">No discussions yet. The archive is quiet.</div>';
      const prevDisabled=page<=1?'disabled':'';
      const nextDisabled=page>=totalPages?'disabled':'';
      container.innerHTML=`${rowHtml}<div class="forum-pagination" aria-label="Board pagination"><button type="button" class="bbs-btn secondary" data-forum-page="${page-1}" ${prevDisabled}>PREVIOUS</button><span class="page-status">PAGE ${page} OF ${totalPages} · ${total} ${total===1?'DISCUSSION':'DISCUSSIONS'}</span><button type="button" class="bbs-btn secondary" data-forum-page="${page+1}" ${nextDisabled}>NEXT</button></div>`;
      container.querySelectorAll('[data-thread]').forEach(b=>b.addEventListener('click',()=>{location.href=`/forum/?thread=${encodeURIComponent(b.dataset.thread)}`}));
      container.querySelectorAll('[data-forum-page]').forEach(b=>b.addEventListener('click',()=>renderCategoryPage(slug,Number(b.dataset.forumPage),true)));
      renderCategoryBreadcrumb(category.name);
      if(push){history.pushState({category:slug,page},'',`/forum/?category=${encodeURIComponent(slug)}&page=${page}`)}
    }catch(error){
      console.error('Paginated board load failed',error);
      container.innerHTML='<div class="empty-state">Unable to load this board.</div>';
    }
  }

  function renderCategoryBreadcrumb(name){
    const crumbs=$('#breadcrumbs');
    if(!crumbs)return;
    crumbs.innerHTML='';
    const home=document.createElement('button');
    home.type='button';
    home.textContent='Forum';
    home.addEventListener('click',()=>{location.href='/forum/'});
    crumbs.append(home,document.createTextNode(' / '));
    const span=document.createElement('span');
    span.textContent=name;
    crumbs.append(span);
  }

  async function enhanceVisibleThreadRows(){
    if(statsBusy)return;
    const roots=[$('#latestThreads'),$('#categories')].filter(Boolean);
    const buttons=roots.flatMap(root=>[...root.querySelectorAll('[data-thread]')]).filter(b=>!b.closest('.forum-pagination'));
    const pending=buttons.filter(b=>!b.closest('.thread-row')?.querySelector('.thread-counts'));
    if(!pending.length)return;
    statsBusy=true;
    try{
      const stats=await getThreadStats(pending.map(b=>b.dataset.thread));
      for(const b of pending){
        const row=b.closest('.thread-row');
        const meta=row?.querySelector('.thread-meta');
        const stat=stats.get(b.dataset.thread);
        if(!meta||meta.querySelector('.thread-counts'))continue;
        const replies=Math.max((stat?.postCount||0)-1,0);
        const span=document.createElement('span');
        span.className='thread-counts';
        span.textContent=` · ${replies} ${replies===1?'reply':'replies'} · last post by ${profileName(stat?.lastProfile)}`;
        meta.append(span);
      }
    }catch(error){console.warn('Thread stat enhancement skipped',error)}finally{statsBusy=false}
  }

  function ensureEditingControls(){
    if(!currentUserId)return;
    document.querySelectorAll('#threadPosts article.post').forEach(article=>{
      const authorId=article.querySelector('.profile-link[data-profile]')?.dataset.profile;
      if(authorId!==currentUserId||article.querySelector('[data-own-edit-post]'))return;
      const tools=article.querySelector('.post-tools');
      if(!tools)return;
      const postId=article.id?.replace(/^post-/,'');
      if(!postId)return;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='mini-btn';
      btn.dataset.ownEditPost=postId;
      btn.textContent='EDIT';
      tools.insertBefore(btn,tools.firstChild);
    });
    const meta=$('#threadMeta');
    const authorId=meta?.querySelector('[data-profile]')?.dataset.profile;
    const actions=$('.thread-head .forum-actions');
    let titleBtn=$('#editThreadTitleBtn');
    if(authorId===currentUserId&&actions&&!titleBtn){
      titleBtn=document.createElement('button');
      titleBtn.id='editThreadTitleBtn';
      titleBtn.type='button';
      titleBtn.className='bbs-btn secondary';
      titleBtn.textContent='EDIT TITLE';
      actions.append(titleBtn);
    }else if(authorId!==currentUserId&&titleBtn){titleBtn.remove()}
  }

  async function startPostEdit(postId){
    if(!currentUserId)return notice('Sign in to edit your post.','error');
    const article=document.getElementById(`post-${postId}`);
    const text=article?.querySelector('.post-text');
    if(!article||!text||article.querySelector('.edit-inline'))return;
    try{
      const{data,error}=await client.from('forum_posts').select('id,body,author_id,moderation_status').eq('id',postId).eq('author_id',currentUserId).maybeSingle();
      if(error)throw error;
      if(!data)return notice('This post is not editable by your account.','error');
      const editor=document.createElement('div');
      editor.className='edit-inline';
      const textarea=document.createElement('textarea');
      textarea.maxLength=20000;
      textarea.value=data.body||'';
      textarea.setAttribute('aria-label','Edit post');
      const actions=document.createElement('div');actions.className='edit-actions';
      const save=document.createElement('button');save.type='button';save.className='bbs-btn';save.textContent='SAVE CHANGES';
      const cancel=document.createElement('button');cancel.type='button';cancel.className='bbs-btn secondary';cancel.textContent='CANCEL';
      actions.append(save,cancel);editor.append(textarea,actions);text.after(editor);text.hidden=true;textarea.focus();
      cancel.addEventListener('click',()=>{editor.remove();text.hidden=false});
      save.addEventListener('click',async()=>{
        const body=textarea.value.trim();
        if(!body)return notice('A forum post cannot be empty.','error');
        if(body.length>20000)return notice('Posts are limited to 20,000 characters.','error');
        save.disabled=true;save.textContent='SAVING…';
        const{data:updated,error:updateError}=await client.from('forum_posts').update({body}).eq('id',postId).eq('author_id',currentUserId).select('body,updated_at').maybeSingle();
        if(updateError||!updated){save.disabled=false;save.textContent='SAVE CHANGES';return notice(updateError?.message||'Unable to save this edit.','error')}
        text.textContent=updated.body;
        text.hidden=false;
        editor.remove();
        const stamp=article.querySelector('.post-tools .thread-meta');
        if(stamp&&!stamp.querySelector('.edited-marker')){const mark=document.createElement('span');mark.className='edited-marker';mark.textContent=' · EDITED';stamp.append(mark)}
        notice('Post updated.','success');
      });
    }catch(error){console.error('Post edit failed',error);notice('Unable to open the post editor.','error')}
  }

  async function startTitleEdit(){
    if(!currentUserId)return notice('Sign in to edit this title.','error');
    const threadId=new URLSearchParams(location.search).get('thread');
    const heading=$('#threadHeading');
    if(!threadId||!heading||$('.thread-head .edit-inline'))return;
    try{
      const{data,error}=await client.from('forum_threads').select('id,title,author_id').eq('id',threadId).eq('author_id',currentUserId).maybeSingle();
      if(error)throw error;
      if(!data)return notice('This discussion title is not editable by your account.','error');
      const editor=document.createElement('div');editor.className='edit-inline';
      const input=document.createElement('input');input.type='text';input.maxLength=160;input.minLength=3;input.value=data.title||'';input.setAttribute('aria-label','Edit discussion title');
      const actions=document.createElement('div');actions.className='edit-actions';
      const save=document.createElement('button');save.type='button';save.className='bbs-btn';save.textContent='SAVE TITLE';
      const cancel=document.createElement('button');cancel.type='button';cancel.className='bbs-btn secondary';cancel.textContent='CANCEL';
      actions.append(save,cancel);editor.append(input,actions);heading.after(editor);input.focus();input.select();
      cancel.addEventListener('click',()=>editor.remove());
      save.addEventListener('click',async()=>{
        const title=input.value.trim();
        if(title.length<3||title.length>160)return notice('Titles must be 3–160 characters.','error');
        save.disabled=true;save.textContent='SAVING…';
        const{data:updated,error:updateError}=await client.from('forum_threads').update({title}).eq('id',threadId).eq('author_id',currentUserId).select('title').maybeSingle();
        if(updateError||!updated){save.disabled=false;save.textContent='SAVE TITLE';return notice(updateError?.message||'Unable to save this title.','error')}
        heading.textContent=updated.title;
        const crumb=[...document.querySelectorAll('#breadcrumbs span')].at(-1);if(crumb)crumb.textContent=updated.title;
        editor.remove();notice('Discussion title updated.','success');
      });
    }catch(error){console.error('Title edit failed',error);notice('Unable to open the title editor.','error')}
  }

  document.addEventListener('click',event=>{
    const categoryButton=event.target.closest('[data-category]');
    if(categoryButton&&$('#forumHome')?.contains(categoryButton)){
      event.preventDefault();event.stopImmediatePropagation();
      renderCategoryPage(categoryButton.dataset.category,1,true);
      return;
    }
    const editPost=event.target.closest('[data-own-edit-post]');
    if(editPost){event.preventDefault();startPostEdit(editPost.dataset.ownEditPost);return}
    if(event.target.closest('#editThreadTitleBtn')){event.preventDefault();startTitleEdit()}
  },true);

  const observer=new MutationObserver(()=>{
    ensureEditingControls();
    queueMicrotask(enhanceVisibleThreadRows);
  });
  observer.observe(document.body,{subtree:true,childList:true});

  window.addEventListener('popstate',()=>{
    const params=new URLSearchParams(location.search);
    const slug=params.get('category');
    if(slug)setTimeout(()=>renderCategoryPage(slug,Number(params.get('page')||1),false),0);
  });

  client.auth.onAuthStateChange(()=>setTimeout(refreshUser,0));
  refreshUser();
  setTimeout(()=>{
    const params=new URLSearchParams(location.search);
    const slug=params.get('category');
    if(slug)renderCategoryPage(slug,Number(params.get('page')||1),false);
    enhanceVisibleThreadRows();
    ensureEditingControls();
  },350);
})();