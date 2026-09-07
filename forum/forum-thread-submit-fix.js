(() => {
  const form = document.querySelector('#newThreadForm');
  if (!form || !window.supabase) return;

  const SUPABASE_URL = 'https://waqobihznhkbspdchjbb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_uPGjlkbauGtisASevhnTLA_jIJDhzZG';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });

  let busy = false;
  let status = document.querySelector('#threadSubmitStatus');
  if (!status) {
    status = document.createElement('div');
    status.id = 'threadSubmitStatus';
    status.className = 'notice hidden';
    status.setAttribute('aria-live', 'polite');
    form.insertBefore(status, form.firstChild);
  }

  const setStatus = (message, kind = '') => {
    status.className = `notice ${kind}`.trim();
    status.textContent = message;
    status.classList.remove('hidden');
    status.scrollIntoView({ block: 'nearest' });
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy) return;

    const button = form.querySelector('button[type="submit"]');
    const categoryId = Number(document.querySelector('#threadCategory')?.value);
    const title = String(document.querySelector('#threadTitle')?.value || '').trim();
    const body = String(document.querySelector('#threadBody')?.value || '').trim();
    const entityId = String(document.querySelector('#entityId')?.value || '').trim();
    const entityName = String(document.querySelector('#entityName')?.value || '').trim();

    if (!categoryId || title.length < 3 || !body) {
      setStatus('Choose a board, enter a title of at least 3 characters, and add an opening post.', 'error');
      return;
    }

    busy = true;
    const originalLabel = button?.textContent || 'POST DISCUSSION';
    if (button) {
      button.disabled = true;
      button.textContent = 'POSTING…';
    }
    setStatus('Posting discussion…');

    try {
      const { data, error } = await client.rpc('forum_create_thread', {
        p_category_id: categoryId,
        p_title: title,
        p_body: body,
        p_entity_id: entityId && entityName ? entityId : null,
        p_entity_name: entityId && entityName ? entityName : null
      });
      if (error) throw error;

      setStatus('Discussion posted. Opening thread…', 'success');
      form.reset();
      window.location.assign(`/forum/?thread=${encodeURIComponent(data)}`);
    } catch (error) {
      console.error('Forum thread creation failed:', error);
      setStatus(error?.message || 'Unable to post discussion. Please try again.', 'error');
      busy = false;
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }
  }, true);

  // Admin moderation polish: the server-side moderation RPC already supports
  // both `hide` and `restore`. The main v2 UI always renders HIDE THREAD, so
  // convert that control to RESTORE THREAD when a staff member opens a hidden
  // discussion. This keeps moderation reversible from the browser.
  let moderationSyncRunning = false;
  let moderationSyncTimer = null;

  async function syncHiddenThreadControls() {
    if (moderationSyncRunning) return;
    moderationSyncRunning = true;
    try {
      const threadId = new URLSearchParams(location.search).get('thread');
      const strip = document.querySelector('#staffThreadTools');
      if (!threadId || !strip || strip.classList.contains('hidden')) return;

      const { data: authData } = await client.auth.getSession();
      const userId = authData?.session?.user?.id;
      if (!userId) return;

      const { data: staffProfile } = await client
        .from('forum_profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      if (!staffProfile || !['moderator', 'admin'].includes(staffProfile.role)) return;

      const { data: thread, error } = await client
        .from('forum_threads')
        .select('moderation_status')
        .eq('id', threadId)
        .maybeSingle();
      if (error || !thread) return;

      const actionButton = strip.querySelector('[data-mod-thread="hide"], [data-mod-thread="restore"]');
      if (!actionButton) return;

      let note = strip.querySelector('[data-hidden-thread-note]');
      if (thread.moderation_status === 'hidden') {
        actionButton.dataset.modThread = 'restore';
        actionButton.textContent = 'RESTORE THREAD';
        actionButton.classList.remove('danger-btn');
        actionButton.classList.add('success-btn');
        if (!note) {
          note = document.createElement('div');
          note.dataset.hiddenThreadNote = '1';
          note.className = 'notice';
          note.textContent = 'STAFF VIEW: This thread is hidden from public listings. Use RESTORE THREAD to make it public again.';
          strip.appendChild(note);
        }
      } else {
        actionButton.dataset.modThread = 'hide';
        actionButton.textContent = 'HIDE THREAD';
        actionButton.classList.remove('success-btn');
        actionButton.classList.add('danger-btn');
        note?.remove();
      }
    } catch (error) {
      console.error('Forum hidden-thread control sync failed:', error);
    } finally {
      moderationSyncRunning = false;
    }
  }

  const scheduleModerationSync = () => {
    clearTimeout(moderationSyncTimer);
    moderationSyncTimer = setTimeout(syncHiddenThreadControls, 120);
  };

  const observer = new MutationObserver(scheduleModerationSync);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', scheduleModerationSync);
  window.addEventListener('pageshow', scheduleModerationSync);
  setTimeout(syncHiddenThreadControls, 600);
})();
