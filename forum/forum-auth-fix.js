(() => {
  const form = document.querySelector('#signupForm');
  if (!form || !window.supabase) return;

  const SUPABASE_URL = 'https://waqobihznhkbspdchjbb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_uPGjlkbauGtisASevhnTLA_jIJDhzZG';
  const authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });

  const callbackUrl = () => `${location.origin}/auth/confirm/`;

  let status = document.querySelector('#signupInlineStatus');
  if (!status) {
    status = document.createElement('div');
    status.id = 'signupInlineStatus';
    status.className = 'notice hidden';
    status.setAttribute('aria-live', 'polite');
    form.insertBefore(status, form.querySelector('.field'));
  }

  let resend = document.querySelector('#resendConfirmationBtn');
  if (!resend) {
    resend = document.createElement('button');
    resend.id = 'resendConfirmationBtn';
    resend.type = 'button';
    resend.className = 'bbs-btn secondary';
    resend.textContent = 'RESEND CONFIRMATION';
    resend.style.marginTop = '7px';
    form.appendChild(resend);
  }

  const setStatus = (message, kind = '') => {
    status.className = `notice ${kind}`.trim();
    status.textContent = message;
    status.classList.remove('hidden');
    status.scrollIntoView({ block: 'nearest' });
  };

  const readEmail = () => String(new FormData(form).get('email') || '').trim();

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
      const { data: result, error } = await authClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl() }
      });
      if (error) throw error;

      if (result?.session) {
        setStatus('Account created successfully. Reload the forum to continue with your username setup.', 'success');
      } else {
        setStatus('Account created. Check your email and use the confirmation link. It should return to the Paranormal Wiki forum confirmation page.', 'success');
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

  resend.addEventListener('click', async () => {
    const email = readEmail();
    if (!email) {
      setStatus('Enter the email address you registered with, then press RESEND CONFIRMATION.', 'error');
      return;
    }
    const original = resend.textContent;
    resend.disabled = true;
    resend.textContent = 'SENDING…';
    setStatus('Requesting a new confirmation email…');
    try {
      const { error } = await authClient.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: callbackUrl() }
      });
      if (error) throw error;
      setStatus('A new confirmation email was requested. Use the newest email; older confirmation links may no longer work.', 'success');
    } catch (error) {
      console.error('Confirmation resend failed:', error);
      setStatus(error?.message || 'Could not resend the confirmation email.', 'error');
    } finally {
      resend.disabled = false;
      resend.textContent = original;
    }
  });
})();
