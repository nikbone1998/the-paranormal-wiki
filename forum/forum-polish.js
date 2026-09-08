(() => {
  'use strict';

  const SUPABASE_URL='https://waqobihznhkbspdchjbb.supabase.co';
  const SUPABASE_KEY='sb_publishable_uPGjlkbauGtisASevhnTLA_jIJDhzZG';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const BOARD_PAGE_SIZE=20;
  const POST_PAGE_SIZE=15;

  let currentUserId=null;
  let categoryRenderToken=0;
  let enhancementTimer=null;
  let threadHeaderSignature='';
  let editedMarkerSignature='';

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
  const profileName=p=>p?.display_name||p?.username||'Unknown member';

  async function refreshUser(){
    const{data}=await client.auth.getSession();
    currentUserId=data.session?.user?.id||null;
    ensureEditingControls();
  }

  async function loadProfiles(ids){
    const unique=[...new Set((ids||[]).filter(Boolean))];
    if(!unique.length)return new Map();
    const{data,error}=await client.from('forum_profiles').select('id,username,display_name,role,created_at').in('id',unique);
    if(error)throw error;
    return new Map((data||[]).map(p=>[p.id,p]));
  }

  async function getThreadMetadata(threadIds){
    const ids=[...new Set((threadIds||[]).filter(Boolean))];
    if(!ids.length)return new Map();
    const{data,error}=await client.rpc('forum_thread_metadata',{p_thread_ids:ids});
    if(error)throw error;
    const map=new Map();
    for(const row of data||[]){
      map.set(row.thread_id,{
        postCount:Number(row.post_count||0),
        replyCount:Number(row.reply_count||0),
        lastPostAt:row.last_post_at||null,
        lastPostAuthorId:row.last_post_author_id||null
      });
    }
    const profiles=await loadProfiles([...map.values()].map(v=>v.lastPostAuthorId));
    for(const meta of map.values())meta.lastProfile=profiles.get(meta.lastPostAuthorId)||null;
    return map;
  }

  function roleBadge(role){
    return role&&role!=='member'?`<span class="role-badge ${esc(role)}">${esc(role)}</span>`:'';
  }

  function renderThreadRow(thread,categoryName,starter,meta){
    const flags=`${thread.is_pinned?'<span class="thread-flag pin">PINNED</span>':''}${thread.is_locked?'<span class="thread-flag lock">LOCKED</span>':''}`;
    const replies=meta?.replyCount||0;
    const posts=meta?.postCount||0;
    const lastPoster=profileName(meta?.lastProfile);
    return `<div class="thread-row polished-thread-row"><div class="thread-title-wrap"><button class="thread-link thread-title" type="button" data-thread="${esc(thread.id)}">${esc(thread.title)}</button><span class="thread-flags">${flags}</span></div><div class="thread-meta"><span>started ${esc(fmt(thread.created_at))} by ${esc(profileName(starter))}${roleBadge(starter?.role)}</span><span class="thread-detail-sep"> · </span><span>${replies} ${replies===1?'reply':'replies'} / ${posts} ${posts===1?'post':'posts'}</span><span class="thread-detail-sep"> · </span><span>last post ${esc(fmt(meta?.lastPostAt||thread.last_post_at))} by ${esc(lastPoster)}</span></div></div>`;
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

      const from=(page-1)*BOARD_PAGE_SIZE;
      const to=from+BOARD_PAGE_SIZE-1;
      const{data:threads,error,count}=await client.from('forum_threads')
        .select('id,title,category_id,author_id,created_at,last_post_at,is_pinned,is_locked',{count:'exact'})
        .eq('category_id',category.id)
        .eq('moderation_status','visible')
        .order('is_pinned',{ascending:false})
        .order('last_post_at',{ascending:false})
        .range(from,to);
      if(error)throw error;
      if(token!==categoryRenderToken)return;

      const rows=threads||[];
      const [starters,metadata]=await Promise.all([
        loadProfiles(rows.map(t=>t.author_id)),
        getThreadMetadata(rows.map(t=>t.id))
      ]);
      if(token!==categoryRenderToken)return;

      const total=count||0;
      const totalPages=Math.max(1,Math.ceil(total/BOARD_PAGE_SIZE));
      if(page>totalPages&&total>0)return renderCategoryPage(slug,totalPages,push);

      const rowHtml=rows.length
        ?rows.map(t=>renderThreadRow(t,category.name,starters.get(t.author_id),metadata.get(t.id))).join('')
        :'<div class="empty-state">No discussions yet. The archive is quiet.</div>';

      container.innerHTML=`${rowHtml}<div class="forum-pagination" aria-label="Board pagination"><button type="button" class="bbs-btn secondary" data-forum-page="${page-1}" ${page<=1?'disabled':''}>PREVIOUS</button><span class="page-status">PAGE ${page} OF ${totalPages} · ${total} ${total===1?'DISCUSSION':'DISCUSSIONS'}</span><button type="button" class="bbs-btn secondary" data-forum-page="${page+1}" ${page>=totalPages?'disabled':''}>NEXT</button></div>`;
      container.querySelectorAll('[data-thread]').forEach(b=>b.addEventListener('click',()=>{location.href=`/forum/?thread=${encodeURIComponent(b.dataset.thread)}`}));
      container.querySelectorAll('[data-forum-page]').forEach(b=>b.addEventListener('click',()=>renderCategoryPage(slug,Number(b.dataset.forumPage),true)));
      renderCategoryBreadcrumb(category.name);
      if(push)history.pushState({category:slug,page},'',`/forum/?category=${encodeURIComponent(slug)}&page=${page}`);
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
    const buttons=[...document.querySelectorAll('#latestThreads [data-thread], #categories [data-thread]')];
    const pending=buttons.filter(b=>{
      const row=b.closest('.thread-row');
      return row&&!row.classList.contains('polished-thread-row')&&!row.dataset.polishMetadata;
    });
    if(!pending.length)return;

    const ids=[...new Set(pending.map(b=>b.dataset.thread).filter(Boolean))];
    try{
      const [metadataResult,threadsResult]=await Promise.all([
        getThreadMetadata(ids),
        client.from('forum_threads').select('id,created_at,last_post_at').in('id',ids)
      ]);
      if(threadsResult.error)throw threadsResult.error;
      const threadMap=new Map((threadsResult.data||[]).map(t=>[t.id,t]));
      for(const button of pending){
        const row=button.closest('.thread-row');
        const metaEl=row?.querySelector('.thread-meta');
        if(!row||!metaEl)continue;
        const m=metadataResult.get(button.dataset.thread);
        const t=threadMap.get(button.dataset.thread);
        const detail=document.createElement('span');
        detail.className='thread-counts';
        detail.textContent=` · started ${fmt(t?.created_at)} · ${m?.replyCount||0} ${(m?.replyCount||0)===1?'reply':'replies'} / ${m?.postCount||0} ${(m?.postCount||0)===1?'post':'posts'} · last post by ${profileName(m?.lastProfile)}`;
        metaEl.append(detail);
        row.dataset.polishMetadata='1';
      }
    }catch(error){console.warn('Thread metadata enhancement skipped',error)}
  }

  function ensureEditingControls(){
    document.querySelectorAll('[data-own-edit-post]').forEach(btn=>{
      const article=btn.closest('article.post');
      const authorId=article?.querySelector('.profile-link[data-profile]')?.dataset.profile;
      if(!currentUserId||authorId!==currentUserId)btn.remove();
    });

    document.querySelectorAll('#threadPosts article.post').forEach(article=>{
      const authorId=article.querySelector('.profile-link[data-profile]')?.dataset.profile;
      if(!currentUserId||authorId!==currentUserId||article.querySelector('[data-own-edit-post]'))return;
      const tools=article.querySelector('.post-tools');
      const postId=article.id?.replace(/^post-/,'');
      if(!tools||!postId)return;
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
    if(currentUserId&&authorId===currentUserId&&actions&&!titleBtn){
      titleBtn=document.createElement('button');
      titleBtn.id='editThreadTitleBtn';
      titleBtn.type='button';
      titleBtn.className='bbs-btn secondary';
      titleBtn.textContent='EDIT TITLE';
      actions.append(titleBtn);
    }else if((!currentUserId||authorId!==currentUserId)&&titleBtn){
      titleBtn.remove();
    }
  }

  async function startPostEdit(postId){
    if(!currentUserId)return notice('Sign in to edit your post.','error');
    const article=document.getElementById(`post-${postId}`);
    const text=article?.querySelector('.post-text');
    if(!article||!text||article.querySelector('.edit-inline'))return;

    try{
      const{data,error}=await client.from('forum_posts').select('id,body,author_id').eq('id',postId).eq('author_id',currentUserId).maybeSingle();
      if(error)throw error;
      if(!data)return notice('This post is not editable by your account.','error');

      const editor=document.createElement('div');
      editor.className='edit-inline';
      const textarea=document.createElement('textarea');
      textarea.maxLength=20000;
      textarea.value=data.body||'';
      textarea.setAttribute('aria-label','Edit post');
      const actions=document.createElement('div');
      actions.className='edit-actions';
      const save=document.createElement('button');
      save.type='button';save.className='bbs-btn';save.textContent='SAVE CHANGES';
      const cancel=document.createElement('button');
      cancel.type='button';cancel.className='bbs-btn secondary';cancel.textContent='CANCEL';
      actions.append(save,cancel);
      editor.append(textarea,actions);
      text.after(editor);
      text.hidden=true;
      textarea.focus();

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
        setEditedMarker(article,updated.updated_at);
        notice('Post updated.','success');
      });
    }catch(error){
      console.error('Post edit failed',error);
      notice('Unable to open the post editor.','error');
    }
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

      const editor=document.createElement('div');
      editor.className='edit-inline title-editor';
      const input=document.createElement('input');
      input.type='text';input.maxLength=160;input.minLength=3;input.value=data.title||'';input.setAttribute('aria-label','Edit discussion title');
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
        const crumb=[...document.querySelectorAll('#breadcrumbs span')].at(-1);
        if(crumb)crumb.textContent=updated.title;
        editor.remove();
        notice('Discussion title updated.','success');
      });
    }catch(error){
      console.error('Title edit failed',error);
      notice('Unable to open the title editor.','error');
    }
  }

  function setEditedMarker(article,updatedAt){
    const stamp=article?.querySelector('.post-tools .thread-meta');
    if(!stamp)return;
    let marker=stamp.querySelector('.edited-marker');
    if(!marker){marker=document.createElement('span');marker.className='edited-marker';stamp.append(marker)}
    marker.textContent=` · EDITED ${fmt(updatedAt)}`;
  }

  async function enhanceEditedMarkers(){
    const articles=[...document.querySelectorAll('#threadPosts article.post')];
    const ids=articles.map(a=>a.id?.replace(/^post-/,'')).filter(Boolean);
    const signature=ids.join('|');
    if(!ids.length||signature===editedMarkerSignature)return;
    editedMarkerSignature=signature;
    try{
      const{data,error}=await client.from('forum_posts').select('id,created_at,updated_at').in('id',ids);
      if(error)throw error;
      const byId=new Map((data||[]).map(p=>[p.id,p]));
      for(const article of articles){
        const id=article.id?.replace(/^post-/,'');
        const row=byId.get(id);
        if(!row?.updated_at||!row?.created_at)continue;
        if(new Date(row.updated_at).getTime()-new Date(row.created_at).getTime()>1000)setEditedMarker(article,row.updated_at);
      }
    }catch(error){console.warn('Edited marker load skipped',error)}
  }

  function applyPostPagination(push=false,requestedPage=null){
    const threadView=$('#threadView');
    const postsRoot=$('#threadPosts');
    if(!threadView||threadView.classList.contains('hidden')||!postsRoot)return;
    const posts=[...postsRoot.querySelectorAll(':scope > article.post')];
    let pager=$('#threadPostPager');
    if(!posts.length){pager?.remove();return}

    const params=new URLSearchParams(location.search);
    let page=Math.max(1,Number(requestedPage??params.get('postPage')??1)||1);
    const totalPages=Math.max(1,Math.ceil(posts.length/POST_PAGE_SIZE));
    if(page>totalPages)page=totalPages;
    const start=(page-1)*POST_PAGE_SIZE;
    const end=start+POST_PAGE_SIZE;
    posts.forEach((post,index)=>{post.hidden=index<start||index>=end});

    if(!pager){
      pager=document.createElement('div');
      pager.id='threadPostPager';
      pager.className='forum-pagination thread-post-pagination';
      postsRoot.insertAdjacentElement('afterend',pager);
    }
    pager.innerHTML=`<button type="button" class="bbs-btn secondary" data-post-page="${page-1}" ${page<=1?'disabled':''}>PREVIOUS</button><span class="page-status">POST PAGE ${page} OF ${totalPages} · ${posts.length} ${posts.length===1?'POST':'POSTS'}</span><button type="button" class="bbs-btn secondary" data-post-page="${page+1}" ${page>=totalPages?'disabled':''}>NEXT</button>`;
    pager.querySelectorAll('[data-post-page]').forEach(btn=>btn.addEventListener('click',()=>{
      const next=Math.max(1,Number(btn.dataset.postPage)||1);
      const nextParams=new URLSearchParams(location.search);
      if(next===1)nextParams.delete('postPage');else nextParams.set('postPage',String(next));
      history.pushState({},'',`${location.pathname}?${nextParams.toString()}`);
      applyPostPagination(false,next);
      $('#threadHeading')?.scrollIntoView({behavior:'smooth',block:'start'});
    }));

    if(push){
      const nextParams=new URLSearchParams(location.search);
      if(page===1)nextParams.delete('postPage');else nextParams.set('postPage',String(page));
      history.replaceState({},'',`${location.pathname}?${nextParams.toString()}`);
    }
  }

  async function enhanceThreadHeader(){
    const threadView=$('#threadView');
    const threadId=new URLSearchParams(location.search).get('thread');
    const postsCount=document.querySelectorAll('#threadPosts article.post').length;
    if(!threadId||!threadView||threadView.classList.contains('hidden'))return;
    const signature=`${threadId}:${postsCount}`;
    if(signature===threadHeaderSignature)return;
    threadHeaderSignature=signature;

    try{
      const [threadResult,metadata]=await Promise.all([
        client.from('forum_threads').select('id,title,author_id,category_id,created_at,last_post_at,is_pinned,is_locked').eq('id',threadId).maybeSingle(),
        getThreadMetadata([threadId])
      ]);
      if(threadResult.error||!threadResult.data)throw threadResult.error||new Error('Thread not found');
      const thread=threadResult.data;
      const meta=metadata.get(threadId)||{postCount:postsCount,replyCount:Math.max(postsCount-1,0),lastPostAt:thread.last_post_at};
      const profiles=await loadProfiles([thread.author_id,meta.lastPostAuthorId]);
      const starter=profiles.get(thread.author_id);
      const lastPoster=profiles.get(meta.lastPostAuthorId)||meta.lastProfile;
      let bar=$('#threadStatsBar');
      if(!bar){bar=document.createElement('div');bar.id='threadStatsBar';bar.className='thread-stats-bar';$('#threadMeta')?.insertAdjacentElement('afterend',bar)}
      if(bar){
        const status=[thread.is_pinned?'PINNED':null,thread.is_locked?'LOCKED':'OPEN'].filter(Boolean).join(' · ');
        bar.innerHTML=`<span><strong>${meta.replyCount||0}</strong> ${(meta.replyCount||0)===1?'REPLY':'REPLIES'}</span><span><strong>${meta.postCount||0}</strong> ${(meta.postCount||0)===1?'POST':'POSTS'}</span><span>STARTED ${esc(fmt(thread.created_at))} BY ${esc(profileName(starter))}</span><span>LAST POST ${esc(fmt(meta.lastPostAt||thread.last_post_at))} BY ${esc(profileName(lastPoster))}</span><span>${esc(status)}</span>`;
      }
    }catch(error){
      threadHeaderSignature='';
      console.warn('Thread header metadata enhancement skipped',error);
    }
  }

  function scheduleEnhancements(){
    clearTimeout(enhancementTimer);
    enhancementTimer=setTimeout(()=>{
      ensureEditingControls();
      enhanceVisibleThreadRows();
      enhanceEditedMarkers();
      applyPostPagination(true);
      enhanceThreadHeader();
    },60);
  }

  document.addEventListener('click',event=>{
    const categoryButton=event.target.closest('[data-category]');
    if(categoryButton&&$('#forumHome')?.contains(categoryButton)){
      event.preventDefault();
      event.stopImmediatePropagation();
      renderCategoryPage(categoryButton.dataset.category,1,true);
      return;
    }
    const editPost=event.target.closest('[data-own-edit-post]');
    if(editPost){event.preventDefault();startPostEdit(editPost.dataset.ownEditPost);return}
    if(event.target.closest('#editThreadTitleBtn')){event.preventDefault();startTitleEdit()}
  },true);

  const observer=new MutationObserver(scheduleEnhancements);
  observer.observe(document.body,{subtree:true,childList:true});

  window.addEventListener('popstate',()=>{
    const params=new URLSearchParams(location.search);
    const slug=params.get('category');
    if(slug)setTimeout(()=>renderCategoryPage(slug,Number(params.get('page')||1),false),0);
    setTimeout(()=>applyPostPagination(false,Number(params.get('postPage')||1)),80);
  });

  client.auth.onAuthStateChange(()=>setTimeout(refreshUser,0));
  refreshUser();
  setTimeout(()=>{
    const params=new URLSearchParams(location.search);
    const slug=params.get('category');
    if(slug)renderCategoryPage(slug,Number(params.get('page')||1),false);
    scheduleEnhancements();
  },350);
})();