(() => {
  const client=window.supabase.createClient('https://waqobihznhkbspdchjbb.supabase.co','sb_publishable_uPGjlkbauGtisASevhnTLA_jIJDhzZG',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const form=document.querySelector('#forumSearchForm');
  const input=document.querySelector('#forumSearchInput');
  const results=document.querySelector('#forumSearchResults');
  const bookmarkBtn=document.querySelector('#showBookmarksBtn');
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const clip=(v,n=180)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
  const openThread=id=>{location.href=`/forum/?thread=${encodeURIComponent(id)}`};

  async function categoryMapFor(ids){
    const categoryIds=[...new Set((ids||[]).filter(v=>v!==null&&v!==undefined))];
    if(!categoryIds.length)return new Map();
    const{data,error}=await client.from('forum_categories').select('id,name').in('id',categoryIds);
    if(error)throw error;
    return new Map((data||[]).map(c=>[String(c.id),c]));
  }

  async function threadMapFor(ids){
    const threadIds=[...new Set((ids||[]).filter(Boolean))];
    if(!threadIds.length)return new Map();
    const{data,error}=await client.from('forum_threads').select('id,title,category_id,last_post_at').in('id',threadIds);
    if(error)throw error;
    const categoryMap=await categoryMapFor((data||[]).map(t=>t.category_id));
    return new Map((data||[]).map(t=>[t.id,{...t,category:categoryMap.get(String(t.category_id))||null}]));
  }

  function wireResults(){results.querySelectorAll('[data-search-thread]').forEach(b=>b.addEventListener('click',()=>openThread(b.dataset.searchThread)))}

  async function searchForum(e){
    e?.preventDefault();
    const q=input.value.trim();
    if(q.length<2){results.innerHTML='<div class="empty-state">Enter at least 2 characters.</div>';return}
    results.innerHTML='<div class="empty-state">Searching forum archive…</div>';
    const pattern=`%${q.replaceAll('%','\\%').replaceAll('_','\\_')}%`;
    try{
      const [threadsRes,postsRes]=await Promise.all([
        client.from('forum_threads').select('id,title,last_post_at,category_id').ilike('title',pattern).order('last_post_at',{ascending:false}).limit(20),
        client.from('forum_posts').select('id,thread_id,body,created_at').ilike('body',pattern).order('created_at',{ascending:false}).limit(20)
      ]);
      if(threadsRes.error)throw threadsRes.error;
      if(postsRes.error)throw postsRes.error;
      const threads=threadsRes.data||[];
      const posts=postsRes.data||[];
      const [categoryMap,postThreadMap]=await Promise.all([
        categoryMapFor(threads.map(t=>t.category_id)),
        threadMapFor(posts.map(p=>p.thread_id))
      ]);
      if(!threads.length&&!posts.length){results.innerHTML='<div class="empty-state">No matching discussions or posts.</div>';return}
      results.innerHTML=`${threads.length?'<div class="search-section-label">THREAD TITLES</div>'+threads.map(t=>`<button class="search-result" data-search-thread="${t.id}" type="button"><strong>${esc(t.title)}</strong><span>${esc(categoryMap.get(String(t.category_id))?.name||'Forum')}</span></button>`).join(''):''}${posts.length?'<div class="search-section-label">POST TEXT</div>'+posts.map(p=>{const t=postThreadMap.get(p.thread_id);return `<button class="search-result" data-search-thread="${p.thread_id}" type="button"><strong>${esc(t?.title||'Discussion')}</strong><span>${esc(clip(p.body))}</span></button>`}).join(''):''}`;
      wireResults();
    }catch(error){
      console.error('Forum search failed',error);
      results.innerHTML='<div class="empty-state">Search is temporarily unavailable.</div>';
    }
  }

  async function showBookmarks(){
    const{data:{session}}=await client.auth.getSession();
    if(!session){results.innerHTML='<div class="empty-state">Sign in to view your bookmarked discussions.</div>';return}
    results.innerHTML='<div class="empty-state">Loading bookmarks…</div>';
    try{
      const{data,error}=await client.from('forum_bookmarks').select('thread_id,created_at').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(50);
      if(error)throw error;
      if(!data?.length){results.innerHTML='<div class="empty-state">You have no bookmarked discussions yet.</div>';return}
      const threadMap=await threadMapFor(data.map(b=>b.thread_id));
      const visible=data.map(b=>({bookmark:b,thread:threadMap.get(b.thread_id)})).filter(x=>x.thread);
      if(!visible.length){results.innerHTML='<div class="empty-state">You have no currently visible bookmarked discussions.</div>';return}
      results.innerHTML='<div class="search-section-label">YOUR BOOKMARKS</div>'+visible.map(({bookmark,thread:t})=>`<button class="search-result" data-search-thread="${bookmark.thread_id}" type="button"><strong>${esc(t.title||'Discussion')}</strong><span>${esc(t.category?.name||'Forum')}</span></button>`).join('');
      wireResults();
    }catch(error){
      console.error('Forum bookmark load failed',error);
      results.innerHTML='<div class="empty-state">Bookmarks are temporarily unavailable.</div>';
    }
  }

  form?.addEventListener('submit',searchForum);
  bookmarkBtn?.addEventListener('click',showBookmarks);

  // Load non-core polish extensions after the forum DOM and Supabase client are ready.
  const loadExtension=(src,id)=>{
    if(document.getElementById(id))return;
    const script=document.createElement('script');
    script.id=id;
    script.src=src;
    script.async=false;
    document.body.appendChild(script);
  };
  loadExtension('/forum/forum-entity-links.js?v=20260907-entity1','forumEntityLinksExtension');
  loadExtension('/forum/forum-post-polish.js?v=20260907-postpolish1','forumPostPolishExtension');
})();