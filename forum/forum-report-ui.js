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
  const globalNotice = document.querySelector('#globalNotice');

  function setStatus(message, kind = '') {
    status.className = `notice ${kind}`.trim();
    status.textContent = message;
    status.classList.remove('hidden');
  }

  function setGlobal(message, kind = '') {
    if (!globalNotice) return;
    globalNotice.className = `notice ${kind}`.trim();
    globalNotice.textContent = message;
    globalNotice.classList.remove('hidden');
  }

  async function getSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function openReport(type, id) {
    let session;
    try {
      session = await getSession();
    } catch (err) {
      setGlobal(err?.message || 'Unable to read your forum session.', 'error');
      return;
    }
    if (!session) {
      document.querySelector('#loginModal')?.classList.remove('hidden');
      return;
    }
    pendingTarget = { type, id };
    reason.value = '';
    details.value = '';
    status.classList.add('hidden');
    submit.disabled = false;
    submit.textContent = 'SUBMIT REPORT';
    targetLabel.textContent = `Reporting ${type}`;
    modal.classList.remove('hidden');
  }

  function closeReport() {
    modal.classList.add('hidden');
    pendingTarget = null;
  }

  async function submitReportViaRest(session, target, selectedReason, reportDetails) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/forum_submit_report`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        p_target_type: target.type,
        p_target_id: target.id,
        p_reason: selectedReason,
        p_details: reportDetails || null
      })
    });

    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }

    if (!response.ok) {
      const message = payload?.message || payload?.error_description || payload?.hint || raw || `Report request failed (${response.status}).`;
      throw new Error(message);
    }

    const reportId = typeof payload === 'string' ? payload : payload?.id || payload;
    if (!reportId || typeof reportId !== 'string') throw new Error('The server did not return a report ID.');

    const verify = await fetch(`${SUPABASE_URL}/rest/v1/forum_reports?id=eq.${encodeURIComponent(reportId)}&select=id,status,target_type`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${session.access_token}`,
        'Accept': 'application/json'
      }
    });
    const verifyRaw = await verify.text();
    let rows = [];
    try { rows = verifyRaw ? JSON.parse(verifyRaw) : []; } catch { rows = []; }
    if (!verify.ok || !Array.isArray(rows) || rows.length !== 1 || rows[0].status !== 'open') {
      throw new Error('The report could not be verified in the moderation queue.');
    }
    return reportId;
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
      const session = await getSession();
      if (!session) throw new Error('Your forum session expired. Sign in again and retry.');
      await submitReportViaRest(session, pendingTarget, reason.value, details.value.trim());
      setStatus('Report submitted and verified in the moderation queue.', 'success');
      setGlobal('Report submitted successfully. It is now visible to forum staff.', 'success');
      submit.textContent = 'SUBMITTED';
      setTimeout(closeReport, 1100);
    } catch (err) {
      console.error('Forum report submission failed:', err);
      const message = err?.message || 'Unable to submit report.';
      setStatus(message, 'error');
      setGlobal(`Report failed: ${message}`, 'error');
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
      let session = null;
      try { session = await getSession(); } catch { return; }
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