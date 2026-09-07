(() => {
  if (!window.supabase) return;

  const SUPABASE_URL = 'https://waqobihznhkbspdchjbb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_uPGjlkbauGtisASevhnTLA_jIJDhzZG';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });

  let pendingTarget = null;
  let lastProfileTarget = null;

  const modal = document.createElement('div');
  modal.id = 'reportModal';
  modal.className = 'modal-backdrop hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Report community content');
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header"><h3>Report Community Content</h3><button class="modal-close" id="closeReportModal" type="button">CLOSE</button></div>
      <form id="reportForm" class="modal-body">
        <div class="notice">Reports go only to forum staff. A report does not automatically remove content or change the canonical archive.</div>
        <div class="field"><label for="reportReason">Reason</label><select id="reportReason" required>
          <option value="">Choose a reason…</option>
          <option value="Spam or advertising">Spam or advertising</option>
          <option value="Harassment or threats">Harassment or threats</option>
          <option value="Private information or doxxing">Private information or doxxing</option>
          <option value="Impersonation">Impersonation</option>
          <option value="Fabricated evidence or deceptive sourcing">Fabricated evidence or deceptive sourcing</option>
          <option value="Dangerous or illegal content">Dangerous or illegal content</option>
          <option value="Off-topic or disruptive behavior">Off-topic or disruptive behavior</option>
          <option value="Other">Other</option>
        </select></div>
        <div class="field"><label for="reportDetails">Details (optional)</label><textarea id="reportDetails" maxlength="2000" placeholder="Briefly explain what staff should review."></textarea></div>
        <div class="field-help"><span id="reportTargetLabel">No target selected.</span> · Maximum 2,000 characters.</div>
        <div id="reportStatus" class="notice hidden" aria-live="polite"></div>
        <div class="forum-actions"><button class="bbs-btn" id="submitReportBtn" type="submit">SUBMIT REPORT</button></div>
      </form>
    </div>`;
  document.body.append(modal);

  const form = modal.querySelector('#reportForm');
  const reason = modal.querySelector('#reportReason');
  const details = modal.querySelector('#reportDetails');
  const status = modal.querySelector('#reportStatus');
  const submit = modal.querySelector('#submitReportBtn');
  const targetLabel = modal.querySelector('#reportTargetLabel');

  function setStatus(message, kind = '') {
    status.className = `notice ${kind}`.trim();
    status.textContent = message;
    status.classList.remove('hidden');
  }

  async function openReport(type, id) {
    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      document.querySelector('#loginModal')?.classList.remove('hidden');
      return;
    }
    pendingTarget = { type, id };
    reason.value = '';
    details.value = '';
    status.classList.add('hidden');
    targetLabel.textContent = `Reporting ${type}`;
    modal.classList.remove('hidden');
  }

  function closeReport() {
    modal.classList.add('hidden');
    pendingTarget = null;
  }

  modal.querySelector('#closeReportModal').addEventListener('click', closeReport);
  modal.addEventListener('click', e => { if (e.target === modal) closeReport(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!pendingTarget || !reason.value) {
      setStatus('Choose a reason for the report.', 'error');
      return;
    }
    submit.disabled = true;
    submit.textContent = 'SUBMITTING…';
    setStatus('Sending report to forum staff…');
    try {
      const { error } = await client.rpc('forum_submit_report', {
        p_target_type: pendingTarget.type,
        p_target_id: pendingTarget.id,
        p_reason: reason.value,
        p_details: details.value.trim() || null
      });
      if (error) throw error;
      setStatus('Report submitted. Forum staff will review it.', 'success');
      submit.textContent = 'SUBMITTED';
      setTimeout(closeReport, 900);
    } catch (err) {
      setStatus(err?.message || 'Unable to submit report.', 'error');
      submit.disabled = false;
      submit.textContent = 'SUBMIT REPORT';
    }
  });

  document.addEventListener('click', e => {
    const threadButton = e.target.closest('#threadReportBtn');
    if (threadButton) {
      const id = new URL(location.href).searchParams.get('thread');
      if (id) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openReport('thread', id);
      }
      return;
    }

    const postButton = e.target.closest('[data-report-post]');
    if (postButton) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openReport('post', postButton.dataset.reportPost);
      return;
    }

    const profileButton = e.target.closest('[data-profile], [data-staff-profile]');
    if (profileButton) lastProfileTarget = profileButton.dataset.profile || profileButton.dataset.staffProfile || null;
  }, true);

  const profileContent = document.querySelector('#profileContent');
  if (profileContent) {
    const observer = new MutationObserver(async () => {
      if (!lastProfileTarget) return;
      if (profileContent.querySelector('#reportProfileBtn')) return;
      const { data: { session } } = await client.auth.getSession();
      if (!session || session.user.id === lastProfileTarget) return;
      const actions = profileContent.querySelector('.profile-actions');
      if (!actions) return;
      const button = document.createElement('button');
      button.id = 'reportProfileBtn';
      button.className = 'bbs-btn secondary';
      button.type = 'button';
      button.textContent = 'REPORT MEMBER';
      button.addEventListener('click', () => openReport('profile', lastProfileTarget));
      actions.append(button);
    });
    observer.observe(profileContent, { childList: true, subtree: true });
  }
})();