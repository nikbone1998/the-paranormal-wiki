(() => {
  'use strict';

  const SUPABASE_URL='https://waqobihznhkbspdchjbb.supabase.co';
  const SUPABASE_KEY='sb_publishable_uPGjlkbauGtisASevhnTLA_jIJDhzZG';
  const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const BUCKET='forum-avatars';
  const MAX_BYTES=10*1024*1024;
  const TYPES=new Set(['image/jpeg','image/png','image/webp']);
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function flash(message,kind=''){
    const el=$('#globalNotice');
    if(!el)return;
    el.className=`notice ${kind}`.trim();
    el.textContent=message;
    el.classList.remove('hidden');
    clearTimeout(flash.t);
    flash.t=setTimeout(()=>el.classList.add('hidden'),5200);
  }

  function initials(p){
    return String(p?.display_name||p?.username||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase().slice(0,2)||'?';
  }

  function avatarMarkup(p){
    return p?.avatar_url
      ? `<span class="forum-avatar lg"><img src="${esc(p.avatar_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`
      : `<span class="forum-avatar lg fallback" aria-hidden="true">${esc(initials(p))}</span>`;
  }

  async function sessionAndProfile(){
    const{data,error}=await db.auth.getSession();
    if(error)throw error;
    const session=data.session;
    if(!session?.user)throw new Error('Sign in again before editing your profile.');
    const{data:p,error:pe}=await db.from('forum_profiles').select('id,username,display_name,bio,avatar_url,role,created_at').eq('id',session.user.id).maybeSingle();
    if(pe)throw pe;
    if(!p)throw new Error('Forum profile not found.');
    return{session,profile:p};
  }

  async function openEditor(){
    const area=$('#profileEditArea');
    if(!area)return;
    area.innerHTML='<div class="staff-empty">Loading profile editor…</div>';
    try{
      const{profile}=await sessionAndProfile();
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

      $('#fixedProfileAvatarFile')?.addEventListener('change',e=>{
        const file=e.target.files?.[0];
        if(!file)return;
        if(file.size>MAX_BYTES||!TYPES.has(file.type)){
          e.target.value='';
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
      setTimeout(()=>$('#fixedDisplayName')?.focus(),0);
    }catch(error){
      area.innerHTML='';
      flash(error.message||'Unable to open profile editor.','error');
    }
  }

  async function saveProfile(original){
    const button=$('#fixedSaveProfileBtn');
    if(!button)return;
    const display=$('#fixedDisplayName')?.value.trim()||'';
    const bio=$('#fixedBio')?.value.trim()||'';
    const file=$('#fixedProfileAvatarFile')?.files?.[0]||null;
    const remove=$('#profileEditArea')?.dataset.removeAvatar==='1';
    if(display.length>60)return flash('Display name is limited to 60 characters.','error');
    if(bio.length>500)return flash('Bio is limited to 500 characters.','error');
    if(file&&(file.size>MAX_BYTES||!TYPES.has(file.type)))return flash('Avatar must be PNG, JPG or WebP and no larger than 10 MB.','error');

    button.disabled=true;
    button.textContent='SAVING…';
    let newPath=null;
    try{
      const{session}=await sessionAndProfile();
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
      window.dispatchEvent(new CustomEvent('forum-profile-saved',{detail:{userId:uid}}));
    }catch(error){
      if(newPath)db.storage.from(BUCKET).remove([newPath]).catch(()=>{});
      flash(error.message||'Unable to save profile.','error');
      button.disabled=false;
      button.textContent='SAVE PROFILE';
    }
  }

  document.addEventListener('click',event=>{
    const edit=event.target.closest('#editProfileBtn');
    if(!edit)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openEditor();
  },true);
})();