(() => {
  const SUPABASE_URL = 'https://waqobihznhkbspdchjbb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_uPGjlkbauGtisASevhnTLA_jIJDhzZG';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });

  const els = {
    categories: document.querySelector('#categories'),
    latest: document.querySelector('#latestThreads'),
    mainTitle: document.querySelector('#mainTitle'),
    authState: document.querySelector('#authState'),
    authActions: document.querySelector('#authActions'),
    profileSetup: document.querySelector('#profileSetup'),
    usernameInput: document.querySelector('#usernameInput'),
    displayNameInput: document.querySelector('#displayNameInput'),
    saveProfileBtn: document.querySelector('#saveProfileBtn'),
    newThreadBtn: document.querySelector('#newThreadBtn'),
    threadView: document.querySelector('#threadView'),
    forumHome: document.querySelector('#forumHome'),
    breadcrumbs: document.querySelector('#breadcrumbs'),
    loginModal: document.querySelector('#loginModal'),
    newThreadModal: document.querySelector('#newThreadModal'),
    loginForm: document.querySelector('#loginForm'),
    signupForm: document.querySelector('#signupForm'),
    newThreadForm: document.querySelector('#newThreadForm'),
    threadCategory: document.querySelector('#threadCategory'),
    threadTitle: document.querySelector('#threadTitle'),
    threadBody: document.querySelector('#threadBody'),
    entityId: document.querySelector('#entityId'),
    entityName: document.querySelector('#entityName'),
    globalNotice: document.querySelector('#globalNotice'),
    replyForm: document.querySelector('#replyForm'),
    replyBody: document.querySelector('#replyBody'),
    threadPosts: document.querySelector('#threadPosts'),
    threadHeading: document.querySelector('#threadHeading'),
    threadMeta: document.querySelector('#threadMeta'),
    threadEntity: document.querySelector('#threadEntity'),
    bookmarkBtn: document.querySelector('#bookmarkBtn')
  };

  let session = null;
  let profile = null;
  let categories = [];
  let activeThread = null;

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const fmt = (value) => {
    if (!value) return '';
    try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    catch { return value; }
  };

  function showNotice(message, kind = '') {
    if (!els.globalNotice) return;
    els.globalNotice.className = `notice ${kind}`.trim();
    els.globalNotice.textContent = message;
    els.globalNotice.classList.remove('hidden');
    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => els.globalNotice.classList.add('hidden'), 5000);
  }

  function openModal(el) { el?.classList.remove('hidden'); }
  function closeModal(el) { el?.classList.add('hidden'); }

  async function loadCategories() {
    const { data, error } = await client.from('forum_categories')
      .select('id,slug,name,description,sort_order,is_locked')
      .order('sort_order');
    if (error) throw error;
    categories = data || [];
    renderCategories();
    if (els.threadCategory) {
      els.threadCategory.innerHTML = categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    }
  }

  function renderCategories() {
    if (!els.categories) return;
    if (!categories.length) {
      els.categories.innerHTML = '<div class="empty-state">No boards are available.</div>';
      return;
    }
    els.categories.innerHTML = categories.map(c => `
      <div class="category-row">
        <div>
          <div class="category-name"><button type="button" data-category="${esc(c.slug)}">${esc(c.name)}</button></div>
          <div class="category-desc">${esc(c.description)}</div>
        </div>
        <div class="category-meta">${c.is_locked ? 'LOCKED' : 'OPEN'}</div>
      </div>`).join('');
    els.categories.querySelectorAll('[data-category]').forEach(btn => btn.addEventListener('click', () => loadCategory(btn.dataset.category)));
  }

  async function loadLatestThreads() {
    if (!els.latest) return;
    els.latest.innerHTML = '<div class="empty-state">Loading recent discussions…</div>';
    const { data, error } = await client.from('forum_threads')
      .select('id,title,category_id,author_id,created_at,last_post_at,forum_profiles(username,display_name),forum_categories(name,slug)')
      .order('last_post_at', { ascending: false })
      .limit(12);
    if (error) {
      els.latest.innerHTML = '<div class="empty-state">Recent discussions are temporarily unavailable.</div>';
      return;
    }
    renderThreadRows(data || [], els.latest);
  }

  function renderThreadRows(rows, target) {
    if (!rows.length) {
      target.innerHTML = '<div class="empty-state">No discussions yet. The archive is quiet.</div>';
      return;
    }
    target.innerHTML = rows.map(t => {
      const author = t.forum_profiles?.display_name || t.forum_profiles?.username || 'Unknown member';
      const board = t.forum_categories?.name || 'Forum';
      return `<div class="thread-row">
        <button class="thread-link thread-title" type="button" data-thread="${t.id}">${esc(t.title)}</button>
        <div class="thread-meta">${esc(board)} · ${esc(author)} · last activity ${esc(fmt(t.last_post_at))}</div>
      </div>`;
    }).join('');
    target.querySelectorAll('[data-thread]').forEach(btn => btn.addEventListener('click', () => openThread(btn.dataset.thread)));
  }

  async function loadCategory(slug) {
    const category = categories.find(c => c.slug === slug);
    if (!category) return;
    history.pushState({ category: slug }, '', `/forum/?category=${encodeURIComponent(slug)}`);
    els.mainTitle.textContent = category.name;
    els.categories.innerHTML = '<div class="empty-state">Loading discussions…</div>';
    const { data, error } = await client.from('forum_threads')
      .select('id,title,category_id,author_id,created_at,last_post_at,forum_profiles(username,display_name),forum_categories(name,slug)')
      .eq('category_id', category.id)
      .order('is_pinned', { ascending: false })
      .order('last_post_at', { ascending: false })
      .limit(50);
    if (error) {
      els.categories.innerHTML = '<div class="empty-state">Unable to load this board.</div>';
      return;
    }
    renderThreadRows(data || [], els.categories);
    renderBreadcrumbs([{ label: 'Forum', action: showHome }, { label: category.name }]);
  }

  function renderBreadcrumbs(items) {
    if (!els.breadcrumbs) return;
    els.breadcrumbs.innerHTML = '';
    items.forEach((item, index) => {
      if (index) els.breadcrumbs.append(document.createTextNode(' / '));
      if (item.action) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = item.label; b.addEventListener('click', item.action); els.breadcrumbs.append(b);
      } else {
        const s = document.createElement('span'); s.textContent = item.label; els.breadcrumbs.append(s);
      }
    });
  }

  async function openThread(id, push = true) {
    if (push) history.pushState({ thread: id }, '', `/forum/?thread=${encodeURIComponent(id)}`);
    els.forumHome.classList.add('hidden');
    els.threadView.classList.remove('hidden');
    els.threadPosts.innerHTML = '<div class="empty-state">Opening case discussion…</div>';

    const { data: thread, error: threadError } = await client.from('forum_threads')
      .select('id,title,category_id,author_id,created_at,last_post_at,is_locked,forum_profiles(username,display_name),forum_categories(name,slug)')
      .eq('id', id).single();
    if (threadError || !thread) {
      els.threadPosts.innerHTML = '<div class="empty-state">This discussion could not be found.</div>';
      return;
    }
    activeThread = thread;
    els.threadHeading.textContent = thread.title;
    const author = thread.forum_profiles?.display_name || thread.forum_profiles?.username || 'Unknown member';
    els.threadMeta.textContent = `${thread.forum_categories?.name || 'Forum'} · started by ${author} · ${fmt(thread.created_at)}`;
    els.replyForm?.classList.toggle('hidden', !session || !profile || thread.is_locked);
    if (thread.is_locked && session) showNotice('This discussion is locked.');

    const { data: links } = await client.from('forum_entity_links').select('entity_id,entity_name').eq('thread_id', id);
    if (els.threadEntity) {
      els.threadEntity.innerHTML = (links || []).map(l => `<span class="entity-tag">ARCHIVE LINK: ${esc(l.entity_name)}</span>`).join('');
    }

    const { data: posts, error: postError } = await client.from('forum_posts')
      .select('id,body,author_id,reply_to_id,created_at,updated_at,forum_profiles(username,display_name,created_at)')
      .eq('thread_id', id)
      .order('created_at');
    if (postError) {
      els.threadPosts.innerHTML = '<div class="empty-state">Posts could not be loaded.</div>';
      return;
    }
    renderPosts(posts || []);
    renderBreadcrumbs([
      { label: 'Forum', action: showHome },
      { label: thread.forum_categories?.name || 'Board', action: () => loadCategory(thread.forum_categories?.slug) },
      { label: thread.title }
    ]);
    await updateBookmarkState();
  }

  function renderPosts(posts) {
    els.threadPosts.innerHTML = posts.map((p, index) => {
      const name = p.forum_profiles?.display_name || p.forum_profiles?.username || 'Unknown member';
      const joined = p.forum_profiles?.created_at ? new Date(p.forum_profiles.created_at).toLocaleDateString() : '';
      return `<article class="post" id="post-${p.id}">
        <aside class="post-author"><div><strong>${esc(name)}</strong><span>${esc(p.forum_profiles?.username ? '@' + p.forum_profiles.username : '')}</span></div><span>JOINED ${esc(joined)}</span></aside>
        <div class="post-body">
          <div class="post-text">${esc(p.body)}</div>
          <div class="post-tools">
            <button type="button" class="mini-btn" data-react="${p.id}:like">LIKE</button>
            <button type="button" class="mini-btn" data-react="${p.id}:interesting">INTERESTING</button>
            <button type="button" class="mini-btn" data-report-post="${p.id}">REPORT</button>
            <span class="thread-meta">#${index + 1} · ${esc(fmt(p.created_at))}</span>
          </div>
        </div>
      </article>`;
    }).join('');
    els.threadPosts.querySelectorAll('[data-react]').forEach(btn => btn.addEventListener('click', async () => {
      if (!requireProfile()) return;
      const [postId, reaction] = btn.dataset.react.split(':');
      const { error } = await client.from('forum_reactions').insert({ post_id: postId, user_id: session.user.id, reaction });
      if (error && error.code !== '23505') showNotice(error.message, 'error');
      else showNotice('Reaction recorded.', 'success');
    }));
    els.threadPosts.querySelectorAll('[data-report-post]').forEach(btn => btn.addEventListener('click', () => reportPost(btn.dataset.reportPost)));
  }

  async function reportPost(postId) {
    if (!requireProfile()) return;
    const reason = prompt('Brief reason for reporting this post:');
    if (!reason?.trim()) return;
    const { error } = await client.from('forum_reports').insert({ reporter_id: session.user.id, target_type: 'post', post_id: postId, reason: reason.trim().slice(0, 100) });
    if (error) showNotice(error.message, 'error');
    else showNotice('Report submitted for moderator review.', 'success');
  }

  async function refreshAuth() {
    const { data } = await client.auth.getSession();
    session = data.session;
    profile = null;
    if (session?.user) {
      const { data: p } = await client.from('forum_profiles').select('*').eq('id', session.user.id).maybeSingle();
      profile = p || null;
    }
    renderAuth();
  }

  function renderAuth() {
    els.newThreadBtn.disabled = !session || !profile;
    if (!session) {
      els.authState.textContent = 'Reading as guest. Sign in to post, react, bookmark, or report.';
      els.authActions.innerHTML = '<button class="bbs-btn" type="button" id="openLoginBtn">SIGN IN / REGISTER</button>';
      document.querySelector('#openLoginBtn')?.addEventListener('click', () => openModal(els.loginModal));
      els.profileSetup.classList.add('hidden');
      return;
    }
    if (!profile) {
      els.authState.textContent = `Signed in as ${session.user.email}. Create your public forum username to participate.`;
      els.authActions.innerHTML = '<button class="bbs-btn secondary" type="button" id="logoutBtn">SIGN OUT</button>';
      document.querySelector('#logoutBtn')?.addEventListener('click', logout);
      els.profileSetup.classList.remove('hidden');
      return;
    }
    els.profileSetup.classList.add('hidden');
    els.authState.textContent = `Logged in as ${profile.display_name || profile.username} (@${profile.username}).`;
    els.authActions.innerHTML = '<button class="bbs-btn secondary" type="button" id="logoutBtn">SIGN OUT</button>';
    document.querySelector('#logoutBtn')?.addEventListener('click', logout);
  }

  function requireProfile() {
    if (!session) { openModal(els.loginModal); return false; }
    if (!profile) { showNotice('Create your forum username first.', 'error'); return false; }
    return true;
  }

  async function logout() {
    await client.auth.signOut();
    session = null; profile = null; renderAuth();
    showNotice('Signed out.');
  }

  async function saveProfile() {
    if (!session) return;
    const username = els.usernameInput.value.trim().toLowerCase();
    const displayName = els.displayNameInput.value.trim();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      showNotice('Username must be 3–24 characters using lowercase letters, numbers, or underscores.', 'error'); return;
    }
    const { error } = await client.from('forum_profiles').insert({ id: session.user.id, username, display_name: displayName || null });
    if (error) { showNotice(error.code === '23505' ? 'That username is already taken.' : error.message, 'error'); return; }
    await refreshAuth();
    showNotice('Forum profile created.', 'success');
  }

  async function handleLogin(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { error } = await client.auth.signInWithPassword({ email: String(fd.get('email')).trim(), password: String(fd.get('password')) });
    if (error) { showNotice(error.message, 'error'); return; }
    closeModal(els.loginModal); e.currentTarget.reset(); await refreshAuth(); showNotice('Signed in.', 'success');
  }

  async function handleSignup(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email')).trim();
    const password = String(fd.get('password'));
    const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/forum/` } });
    if (error) { showNotice(error.message, 'error'); return; }
    e.currentTarget.reset();
    if (data.session) {
      closeModal(els.loginModal); await refreshAuth(); showNotice('Account created. Choose your forum username.', 'success');
    } else {
      showNotice('Check your email to confirm the account, then return here and sign in.', 'success');
    }
  }

  async function handleNewThread(e) {
    e.preventDefault();
    if (!requireProfile()) return;
    const categoryId = Number(els.threadCategory.value);
    const title = els.threadTitle.value.trim();
    const body = els.threadBody.value.trim();
    if (!Number.isInteger(categoryId) || title.length < 3 || body.length < 1) {
      showNotice('Choose a board and enter a title and message.', 'error'); return;
    }
    const entityId = els.entityId.value.trim();
    const entityName = els.entityName.value.trim();
    const { data, error } = await client.rpc('forum_create_thread', {
      p_category_id: categoryId,
      p_title: title,
      p_body: body,
      p_entity_id: entityId && entityName ? entityId : null,
      p_entity_name: entityId && entityName ? entityName : null
    });
    if (error) { showNotice(error.message, 'error'); return; }
    e.currentTarget.reset(); closeModal(els.newThreadModal); await loadLatestThreads(); await openThread(data); showNotice('Discussion posted.', 'success');
  }

  async function handleReply(e) {
    e.preventDefault();
    if (!activeThread || !requireProfile()) return;
    const body = els.replyBody.value.trim();
    if (!body) return;
    const { error } = await client.from('forum_posts').insert({ thread_id: activeThread.id, author_id: session.user.id, body });
    if (error) { showNotice(error.message, 'error'); return; }
    els.replyBody.value = ''; await openThread(activeThread.id, false); showNotice('Reply posted.', 'success');
  }

  async function toggleBookmark() {
    if (!activeThread || !requireProfile()) return;
    const { data } = await client.from('forum_bookmarks').select('thread_id').eq('user_id', session.user.id).eq('thread_id', activeThread.id).maybeSingle();
    if (data) {
      await client.from('forum_bookmarks').delete().eq('user_id', session.user.id).eq('thread_id', activeThread.id);
    } else {
      await client.from('forum_bookmarks').insert({ user_id: session.user.id, thread_id: activeThread.id });
    }
    await updateBookmarkState();
  }

  async function updateBookmarkState() {
    if (!els.bookmarkBtn) return;
    els.bookmarkBtn.disabled = !session || !profile || !activeThread;
    if (!session || !profile || !activeThread) { els.bookmarkBtn.textContent = 'BOOKMARK'; return; }
    const { data } = await client.from('forum_bookmarks').select('thread_id').eq('user_id', session.user.id).eq('thread_id', activeThread.id).maybeSingle();
    els.bookmarkBtn.textContent = data ? 'BOOKMARKED' : 'BOOKMARK';
  }

  function showHome(push = true) {
    if (push) history.pushState({}, '', '/forum/');
    activeThread = null;
    els.threadView.classList.add('hidden');
    els.forumHome.classList.remove('hidden');
    els.mainTitle.textContent = 'Archive Boards';
    renderCategories();
    loadLatestThreads();
    renderBreadcrumbs([{ label: 'Forum' }]);
  }

  function wireEvents() {
    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal-backdrop'))));
    document.querySelectorAll('.modal-backdrop').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m); }));
    els.loginForm?.addEventListener('submit', handleLogin);
    els.signupForm?.addEventListener('submit', handleSignup);
    els.saveProfileBtn?.addEventListener('click', saveProfile);
    els.newThreadBtn?.addEventListener('click', () => requireProfile() && openModal(els.newThreadModal));
    els.newThreadForm?.addEventListener('submit', handleNewThread);
    els.replyForm?.addEventListener('submit', handleReply);
    els.bookmarkBtn?.addEventListener('click', toggleBookmark);
    document.querySelector('#forumHomeBtn')?.addEventListener('click', () => showHome());
    window.addEventListener('popstate', routeFromUrl);
    client.auth.onAuthStateChange(() => setTimeout(refreshAuth, 0));
  }

  async function routeFromUrl() {
    const qs = new URLSearchParams(location.search);
    const thread = qs.get('thread');
    const category = qs.get('category');
    if (thread) return openThread(thread, false);
    showHome(false);
    if (category) return loadCategory(category);
  }

  async function init() {
    wireEvents();
    try {
      await Promise.all([loadCategories(), refreshAuth()]);
      await loadLatestThreads();
      await routeFromUrl();
    } catch (err) {
      console.error(err);
      showNotice('The forum database could not be reached.', 'error');
    }
  }

  init();
})();