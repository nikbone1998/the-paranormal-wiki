(() => {
  const client=window.supabase.createClient('https://waqobihznhkbspdchjbb.supabase.co','sb_publishable_uPGjlkbauGtisASevhnTLA_jIJDhzZG',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const form=document.querySelector('#forumSearchForm');
  const input=document.querySelector('#forumSearchInput');
  const results=document.querySelector('#forumSearchResults');
  const bookmarkBtn=document.querySelector('#showBookmarksBtn');
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const clip=(v,n=180)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
  const openThread=id=>{location.href=`/forum/?thread=${encodeURIComponent(id)}`};

  async function searchForum(e){e?.preventDefault();const q=input.value.trim();if(q.length<2){results.innerHTML='<div class="empty-state">Enter at least 2 characters.</div>';return}results.innerHTML='<div class="empty-state">Searching forum archive…</div>';
    const pattern=`%${q.replaceAll('%','\\%').replaceAll('_','\\_')}%`;
    const [threadsRes,postsRes]=await Promise.all([
      client.from('forum_threads').select('id,title,last_post_at,forum_categories(name)').ilike('title',pattern).order('last_post_at',{ascending:false}).limit(20),
      client.from('forum_posts').select('id,thread_id,body,created_at,forum_threads(id,title,forum_categories(name))').ilike('body',pattern).order('created_at',{ascending:false}).limit(20)
    ]);
    if(threadsRes.error||postsRes.error){results.innerHTML='<div class="empty-state">Search is temporarily unavailable.</div>';return}
    const threads=threadsRes.data||[],posts=postsRes.data||[];
    if(!threads.length&&!posts.length){results.innerHTML='<div class="empty-state">No matching discussions or posts.</div>';return}
    results.innerHTML=`${threads.length?'<div class="search-section-label">THREAD TITLES</div>'+threads.map(t=>`<button class="search-result" data-search-thread="${t.id}" type="button"><strong>${esc(t.title)}</strong><span>${esc(t.forum_categories?.name||'Forum')}</span></button>`).join(''):''}${posts.length?'<div class="search-section-label">POST TEXT</div>'+posts.map(p=>`<button class="search-result" data-search-thread="${p.thread_id}" type="button"><strong>${esc(p.forum_threads?.title||'Discussion')}</strong><span>${esc(clip(p.body))}</span></button>`).join(''):''}`;
    results.querySelectorAll('[data-search-thread]').forEach(b=>b.addEventListener('click',()=>openThread(b.dataset.searchThread)));
  }

  async function showBookmarks(){const{data:{session}}=await client.auth.getSession();if(!session){results.innerHTML='<div class="empty-state">Sign in to view your bookmarked discussions.</div>';return}results.innerHTML='<div class="empty-state">Loading bookmarks…</div>';const{data,error}=await client.from('forum_bookmarks').select('thread_id,created_at,forum_threads(id,title,last_post_at,forum_categories(name))').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(50);if(error){results.innerHTML='<div class="empty-state">Bookmarks are temporarily unavailable.</div>';return}if(!data?.length){results.innerHTML='<div class="empty-state">You have no bookmarked discussions yet.</div>';return}results.innerHTML='<div class="search-section-label">YOUR BOOKMARKS</div>'+data.map(b=>`<button class="search-result" data-search-thread="${b.thread_id}" type="button"><strong>${esc(b.forum_threads?.title||'Discussion')}</strong><span>${esc(b.forum_threads?.forum_categories?.name||'Forum')}</span></button>`).join('');results.querySelectorAll('[data-search-thread]').forEach(b=>b.addEventListener('click',()=>openThread(b.dataset.searchThread)))}

  form?.addEventListener('submit',searchForum);bookmarkBtn?.addEventListener('click',showBookmarks);
})();