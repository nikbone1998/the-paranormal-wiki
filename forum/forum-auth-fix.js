(() => {
  const form = document.querySelector('#signupForm');
  if (!form || !window.supabase) return;

  const SUPABASE_URL = 'https://waqobihznhkbspdchjbb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_uPGjlkbauGtisASevhnTLA_jIJDhzZG';
  const authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });

  let status = document.querySelector('#signupInlineStatus');
  if (!status) {
    status = document.createElement('div');
    status.id = 'signupInlineStatus';
    status.className = 'notice hidden';
    status.setAttribute('aria-live', 'polite');
    form.insertBefore(status, form.querySelector('.field'));
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

    const button = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');

    if (!email) {
      setStatus('Enter an email address.', 'error');
      return;
    }
    if (password.length < 8) {
      setStatus('Password must be at least 8 characters.', 'error');
      return;
    }

    const originalLabel = button?.textContent || 'CREATE ACCOUNT';
    if (button) {
      button.disabled = true;
      button.textContent = 'CREATING ACCOUNT…';
    }
    setStatus('Contacting the forum account server…');

    try {
      // Intentionally omit emailRedirectTo on the protected preview. A preview
      // hostname is not guaranteed to be present in the Supabase Auth redirect
      // allow-list. The confirmation itself still completes server-side; the
      // member can then return to the forum and sign in.
      const { data: result, error } = await authClient.auth.signUp({ email, password });
      if (error) throw error;

      form.reset();
      if (result?.session) {
        setStatus('Account created successfully. Reload the forum to continue with your username setup.', 'success');
      } else {
        setStatus('Account created. Check your email for the confirmation message. After confirming, return to this forum preview and sign in.', 'success');
      }
    } catch (error) {
      console.error('Forum registration failed:', error);
      setStatus(error?.message || 'Registration failed. Please try again.', 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }
  }, true);
})();
