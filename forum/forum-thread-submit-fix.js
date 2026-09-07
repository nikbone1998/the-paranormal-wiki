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
})();
