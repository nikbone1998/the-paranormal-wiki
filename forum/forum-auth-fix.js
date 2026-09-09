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

/* Profile editor fix: owns EDIT PROFILE before later forum enhancement handlers can conflict. */
(() => {
  if (!window.supabase) return;

  const SUPABASE_URL='https://waqobihznhkbspdchjbb.supabase.co';
  const SUPABASE_KEY='sb_publishable_uPGjlkbauGtisASevhnTLA_jIJDhzZG';
  const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const BUCKET='forum-avatars';
  const MAX_BYTES=10*1024*1024;
  const TYPES=new Set(['image/jpeg','image/png','image/webp']);
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function flash(message,kind=''){
    const el=$('#globalNotice');if(!el)return;
    el.className=`notice ${kind}`.trim();
    el.textContent=message;
    el.classList.remove('hidden');
    clearTimeout(flash.t);
    flash.t=setTimeout(()=>el.classList.add('hidden'),5200);
  }

  const initials=p=>String(p?.display_name||p?.username||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase().slice(0,2)||'?';
  const avatarMarkup=p=>p?.avatar_url
    ? `<span class="forum-avatar lg"><img src="${esc(p.avatar_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`
    : `<span class="forum-avatar lg fallback" aria-hidden="true">${esc(initials(p))}</span>`;

  async function getOwnProfile(){
    const{data,error}=await db.auth.getSession();
    if(error)throw error;
    const session=data.session;
    if(!session?.user)throw new Error('Sign in again before editing your profile.');
    const{data:profile,error:pe}=await db.from('forum_profiles').select('id,username,display_name,bio,avatar_url,role,created_at').eq('id',session.user.id).maybeSingle();
    if(pe)throw pe;
    if(!profile)throw new Error('Forum profile not found.');
    return{session,profile};
  }

  async function openProfileEditor(){
    const area=$('#profileEditArea');if(!area)return;
    area.innerHTML='<div class="staff-empty">Loading profile editor…</div>';
    try{
      const{profile}=await getOwnProfile();
      area.dataset.removeAvatar='0';
      area.innerHTML=`<div class="profile-editor-rich profile-editor-fixed">
        <div class="profile-editor-avatar">
          <div id="fixedAvatarPreview">${avatarMarkup(profile)}</div>
          <div>
            <label class="bbs-btn secondary avatar-upload-label">CHOOSE AVATAR<input id="fixedProfileAvatarFile" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>
            <button type="button" class="mini-btn" id="fixedRemoveAvatarBtn" ${profile.avatar_url?'':'disabled'}>REMOVE AVATAR</button>
            <div class="field-help">PNG, JPG or WebP · maximum 10 MB.</div>
          </div>
        </div>
        <div class="field"><label for="fixedDisplayName">Display name</label><input id="fixedDisplayName" maxlength="60" value="${esc(profile.display_name||'')}"></div>
        <div class="field"><label for="fixedBio">Bio</label><textarea id="fixedBio" maxlength="500">${esc(profile.bio||'')}</textarea><div class="field-help"><span id="fixedBioCount">${String(profile.bio||'').length}</span>/500 characters</div></div>
        <div class="field-help">@${esc(profile.username)} is permanent. Your role cannot be changed here.</div>
        <button type="button" class="bbs-btn" id="fixedSaveProfileBtn">SAVE PROFILE</button>
      </div>`;

      const bio=$('#fixedBio');
      bio?.addEventListener('input',()=>{$('#fixedBioCount').textContent=String(bio.value.length)});

      $('#fixedProfileAvatarFile')?.addEventListener('change',event=>{
        const file=event.target.files?.[0];if(!file)return;
        if(file.size>MAX_BYTES||!TYPES.has(file.type)){
          event.target.value='';
          return flash('Avatar must be PNG, JPG or WebP and no larger than 10 MB.','error');
        }
        area.dataset.removeAvatar='0';
        const remove=$('#fixedRemoveAvatarBtn');if(remove){remove.disabled=false;remove.textContent='REMOVE AVATAR'}
        const reader=new FileReader();
        reader.onload=()=>{const preview=$('#fixedAvatarPreview');if(preview)preview.innerHTML=`<span class="forum-avatar lg"><img src="${esc(reader.result)}" alt="Avatar preview"></span>`};
        reader.readAsDataURL(file);
      });

      $('#fixedRemoveAvatarBtn')?.addEventListener('click',()=>{
        area.dataset.removeAvatar='1';
        const input=$('#fixedProfileAvatarFile');if(input)input.value='';
        const preview=$('#fixedAvatarPreview');if(preview)preview.innerHTML=`<span class="forum-avatar lg fallback" aria-hidden="true">${esc(initials(profile))}</span>`;
        const b=$('#fixedRemoveAvatarBtn');if(b){b.disabled=true;b.textContent='AVATAR WILL BE REMOVED'}
      });

      $('#fixedSaveProfileBtn')?.addEventListener('click',()=>saveProfile(profile));
    }catch(error){
      area.innerHTML='';
      flash(error.message||'Unable to open profile editor.','error');
    }
  }

  async function saveProfile(original){
    const button=$('#fixedSaveProfileBtn');if(!button)return;
    const display=$('#fixedDisplayName')?.value.trim()||'';
    const bio=$('#fixedBio')?.value.trim()||'';
    const file=$('#fixedProfileAvatarFile')?.files?.[0]||null;
    const remove=$('#profileEditArea')?.dataset.removeAvatar==='1';
    if(display.length>60)return flash('Display name is limited to 60 characters.','error');
    if(bio.length>500)return flash('Bio is limited to 500 characters.','error');
    if(file&&(file.size>MAX_BYTES||!TYPES.has(file.type)))return flash('Avatar must be PNG, JPG or WebP and no larger than 10 MB.','error');

    button.disabled=true;button.textContent='SAVING…';
    let newPath=null;
    try{
      const{session}=await getOwnProfile();
      const uid=session.user.id;
      let avatarUrl=remove?null:(original.avatar_url||null);

      if(file){
        const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
        newPath=`${uid}/${Date.now()}-${crypto.randomUUID().slice(0,8)}.${ext}`;
        const{error:uploadError}=await db.storage.from(BUCKET).upload(newPath,file,{cacheControl:'3600',upsert:false,contentType:file.type});
        if(uploadError)throw uploadError;
        avatarUrl=db.storage.from(BUCKET).getPublicUrl(newPath).data.publicUrl;
      }

      const{data:updated,error:updateError}=await db.from('forum_profiles').update({display_name:display||null,bio:bio||null,avatar_url:avatarUrl}).eq('id',uid).select('id,username,display_name,bio,avatar_url,role,created_at').maybeSingle();
      if(updateError)throw updateError;
      if(!updated)throw new Error('Profile save did not complete.');

      const old=original.avatar_url;
      if(old&&old!==avatarUrl&&old.includes('/storage/v1/object/public/forum-avatars/')){
        const oldPath=decodeURIComponent(old.split('/storage/v1/object/public/forum-avatars/')[1]||'');
        if(oldPath.startsWith(`${uid}/`))db.storage.from(BUCKET).remove([oldPath]).catch(()=>{});
      }

      const strong=$('#profileContent .profile-meta strong');if(strong)strong.textContent=updated.display_name||updated.username;
      const bioEl=$('#profileContent .profile-bio');if(bioEl)bioEl.textContent=updated.bio||'No profile biography.';
      const avatarSlot=$('#profileContent .profile-avatar-slot');if(avatarSlot)avatarSlot.innerHTML=avatarMarkup(updated);
      $('#profileEditArea').innerHTML='';
      flash('Profile saved.','success');
    }catch(error){
      if(newPath)db.storage.from(BUCKET).remove([newPath]).catch(()=>{});
      flash(error.message||'Unable to save profile.','error');
      button.disabled=false;button.textContent='SAVE PROFILE';
    }
  }

  document.addEventListener('click',event=>{
    const edit=event.target.closest('#editProfileBtn');
    if(!edit)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openProfileEditor();
  },true);
})();
