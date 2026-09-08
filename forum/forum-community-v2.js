(() => {
  'use strict';

  const SUPABASE_URL='https://waqobihznhkbspdchjbb.supabase.co';
  const SUPABASE_KEY='sb_publishable_uPGjlkbauGtisASevhnTLA_jIJDhzZG';
  const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const POST_PAGE_SIZE=15;
  const AVATAR_BUCKET='forum-avatars';
  const MAX_AVATAR_BYTES=2*1024*1024;
  const ALLOWED_AVATAR_TYPES=new Set(['image/jpeg','image/png','image/webp']);

  let currentUserId=null;
  let replyTarget=null;
  let activeThreadId=null;
  let enhanceTimer=null;
  let lastPostSignature='';
  let profileToken=0;

  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const fmt=v=>{if(!v)return'';try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch{return String(v)}};
  const initials=p=>String(p?.display_name||p?.username||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase().slice(0,2)||'?';
  const displayName=p=>p?.display_name||p?.username||'Unknown member';

  function flash(message,kind=''){
    const el=$('#globalNotice');if(!el)return;
    el.className=`notice ${kind}`.trim();el.textContent=message;el.classList.remove('hidden');
    clearTimeout(flash.t);flash.t=setTimeout(()=>el.classList.add('hidden'),5200);
  }

  function avatarHtml(profile,size='md'){
    if(profile?.avatar_url)return `<span class="forum-avatar ${size}"><img src="${esc(profile.avatar_url)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
    return `<span class="forum-avatar ${size} fallback" aria-hidden="true">${esc(initials(profile))}</span>`;
  }

  async function refreshSession(){
    const{data}=await db.auth.getSession();
    currentUserId=data.session?.user?.id||null;
  }

  async function getProfiles(ids){
    const list=[...new Set((ids||[]).filter(Boolean))];
    if(!list.length)return new Map();
    const{data,error}=await db.from('forum_profiles').select('id,username,display_name,bio,avatar_url,role,created_at').in('id',list);
    if(error)throw error;
    return new Map((data||[]).map(p=>[p.id,p]));
  }

  function scheduleEnhance(){
    clearTimeout(enhanceTimer);
    enhanceTimer=setTimeout(()=>enhancePosts(),90);
  }

  async function enhancePosts(){
    const threadId=new URLSearchParams(location.search).get('thread');
    const root=$('#threadPosts');
    if(!threadId||!root||$('#threadView')?.classList.contains('hidden'))return;
    if(activeThreadId!==threadId){activeThreadId=threadId;replyTarget=null;renderReplyTarget();lastPostSignature=''}

    const articles=[...root.querySelectorAll(':scope > article.post')];
    const ids=articles.map(a=>a.id?.replace(/^post-/,'')).filter(Boolean);
    if(!ids.length)return;
    const signature=ids.join('|')+`:${currentUserId||''}`;
    if(signature===lastPostSignature&&articles.every(a=>a.dataset.communityEnhanced==='1'))return;

    try{
      const[{data:posts,error:pe},{data:reactions,error:re}]=await Promise.all([
        db.from('forum_posts').select('id,author_id,reply_to_id,body,created_at').in('id',ids),
        db.from('forum_reactions').select('post_id,user_id,reaction').in('post_id',ids).eq('reaction','helpful')
      ]);
      if(pe)throw pe;if(re)throw re;
      const postMap=new Map((posts||[]).map(p=>[p.id,p]));
      const authorIds=[];
      for(const p of posts||[]){authorIds.push(p.author_id);if(p.reply_to_id){const target=postMap.get(p.reply_to_id);if(target)authorIds.push(target.author_id)}}
      const profiles=await getProfiles(authorIds);
      const helpful=new Map(ids.map(id=>[id,{count:0,mine:false}]));
      for(const r of reactions||[]){const h=helpful.get(r.post_id)||{count:0,mine:false};h.count+=1;if(currentUserId&&r.user_id===currentUserId)h.mine=true;helpful.set(r.post_id,h)}

      for(const article of articles){
        const id=article.id.replace(/^post-/,'');
        const row=postMap.get(id);if(!row)continue;
        const profile=profiles.get(row.author_id);
        const authorBox=article.querySelector('.post-author');
        if(authorBox&&!authorBox.querySelector('.forum-avatar'))authorBox.insertAdjacentHTML('afterbegin',avatarHtml(profile,'sm'));

        const tools=article.querySelector('.post-tools');
        if(tools){
          if(!tools.querySelector(`[data-reply-post="${CSS.escape(id)}"]`)){
            const b=document.createElement('button');b.type='button';b.className='mini-btn reply-post-btn';b.dataset.replyPost=id;b.textContent='REPLY';tools.prepend(b);
          }
          if(!tools.querySelector(`[data-helpful="${CSS.escape(id)}"]`)){
            const b=document.createElement('button');b.type='button';b.className='mini-btn helpful-btn';b.dataset.helpful=id;tools.insertBefore(b,tools.querySelector('[data-report-post]')||null);
          }
          const hb=tools.querySelector(`[data-helpful="${CSS.escape(id)}"]`),h=helpful.get(id)||{count:0,mine:false};
          if(hb){hb.textContent=`${h.mine?'UNHELPFUL':'HELPFUL'} (${h.count})`;hb.classList.toggle('active',h.mine)}
        }

        const body=article.querySelector('.post-body'),text=article.querySelector('.post-text');
        if(body&&text){
          body.querySelector('.reply-context')?.remove();
          if(row.reply_to_id){
            const target=postMap.get(row.reply_to_id);
            const targetProfile=target?profiles.get(target.author_id):null;
            const context=document.createElement('button');
            context.type='button';context.className='reply-context';context.dataset.jumpPost=row.reply_to_id;
            if(target){
              const preview=String(target.body||'').replace(/\s+/g,' ').trim().slice(0,150);
              context.innerHTML=`<span class="reply-context-label">↳ REPLYING TO @${esc(targetProfile?.username||'member')}</span><span class="reply-context-quote">“${esc(preview)}${target.body?.length>150?'…':''}”</span>`;
            }else{
              context.textContent='↳ Replying to a post that is hidden or unavailable';
              context.disabled=true;
            }
            text.before(context);
          }
        }
        article.dataset.communityEnhanced='1';
      }
      lastPostSignature=signature;
      jumpFromHash();
    }catch(error){console.warn('Community post enhancements skipped',error)}
  }

  function setReplyTarget(postId){
    const article=document.getElementById(`post-${postId}`);if(!article)return;
    const replyForm=$('#replyForm');
    if(!replyForm||replyForm.classList.contains('hidden'))return flash('This discussion is locked or you are not signed in.','error');
    const username=article.querySelector('.profile-link[data-profile]')?.textContent?.trim()||'member';
    const text=article.querySelector('.post-text')?.textContent?.trim()||'';
    replyTarget={id:postId,name:username,preview:text.replace(/\s+/g,' ').slice(0,180)};
    renderReplyTarget();
    $('#replyBody')?.focus();
    replyForm.scrollIntoView({behavior:'smooth',block:'center'});
  }

  function renderReplyTarget(){
    const form=$('#replyForm'),panel=form?.querySelector('.panel-body');if(!panel)return;
    let bar=$('#replyTargetBar');
    if(!replyTarget){bar?.remove();return}
    if(!bar){bar=document.createElement('div');bar.id='replyTargetBar';bar.className='reply-target-bar';panel.prepend(bar)}
    bar.innerHTML=`<div><strong>REPLYING TO ${esc(replyTarget.name)}</strong><span>“${esc(replyTarget.preview)}${replyTarget.preview.length>=180?'…':''}”</span></div><button type="button" class="mini-btn" id="cancelReplyTarget">CANCEL REPLY-TO</button>`;
  }

  async function submitReply(event){
    event.preventDefault();event.stopImmediatePropagation();
    const form=event.currentTarget;
    const textarea=$('#replyBody');const body=textarea?.value.trim();
    const threadId=new URLSearchParams(location.search).get('thread');
    if(!threadId||!body)return;
    const button=form.querySelector('button[type="submit"]');if(button){button.disabled=true;button.textContent='POSTING…'}
    try{
      const{data:newPostId,error}=await db.rpc('forum_create_post',{p_thread_id:threadId,p_body:body,p_reply_to:replyTarget?.id||null});
      if(error)throw error;
      textarea.value='';replyTarget=null;renderReplyTarget();
      const{count}=await db.from('forum_posts').select('*',{count:'exact',head:true}).eq('thread_id',threadId).eq('moderation_status','visible');
      const page=Math.max(1,Math.ceil((count||1)/POST_PAGE_SIZE));
      const q=new URLSearchParams();q.set('thread',threadId);if(page>1)q.set('postPage',String(page));
      location.href=`/forum/?${q.toString()}#post-${encodeURIComponent(newPostId)}`;
    }catch(error){flash(error.message||'Unable to post reply.','error');if(button){button.disabled=false;button.textContent='SUBMIT REPLY'}}
  }

  async function toggleHelpful(postId,button){
    const{data:s}=await db.auth.getSession();const uid=s.session?.user?.id;
    if(!uid)return flash('Sign in to mark posts helpful.','error');
    button.disabled=true;
    try{
      const{data:mine,error:qe}=await db.from('forum_reactions').select('post_id').eq('post_id',postId).eq('user_id',uid).eq('reaction','helpful').maybeSingle();
      if(qe)throw qe;
      let error;
      if(mine)({error}=await db.from('forum_reactions').delete().eq('post_id',postId).eq('user_id',uid).eq('reaction','helpful'));
      else({error}=await db.from('forum_reactions').insert({post_id:postId,user_id:uid,reaction:'helpful'}));
      if(error)throw error;
      const{data:rows,error:re}=await db.from('forum_reactions').select('user_id').eq('post_id',postId).eq('reaction','helpful');if(re)throw re;
      const nowMine=(rows||[]).some(r=>r.user_id===uid);button.textContent=`${nowMine?'UNHELPFUL':'HELPFUL'} (${rows?.length||0})`;button.classList.toggle('active',nowMine);
    }catch(error){flash(error.message||'Unable to update Helpful reaction.','error')}finally{button.disabled=false}
  }

  function jumpToPost(postId){
    const all=[...document.querySelectorAll('#threadPosts > article.post')];const article=document.getElementById(`post-${postId}`);if(!article)return flash('That post is unavailable.','error');
    const index=all.indexOf(article);const page=Math.floor(Math.max(0,index)/POST_PAGE_SIZE)+1;
    const q=new URLSearchParams(location.search);if(page<=1)q.delete('postPage');else q.set('postPage',String(page));
    history.pushState({},'',`${location.pathname}?${q.toString()}#post-${encodeURIComponent(postId)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setTimeout(()=>{article.scrollIntoView({behavior:'smooth',block:'center'});article.classList.add('context-flash');setTimeout(()=>article.classList.remove('context-flash'),1600)},180);
  }

  function jumpFromHash(){
    const m=location.hash.match(/^#post-([0-9a-f-]{36})$/i);if(!m)return;
    const article=document.getElementById(`post-${m[1]}`);if(!article)return;
    setTimeout(()=>{article.scrollIntoView({block:'center'});article.classList.add('context-flash');setTimeout(()=>article.classList.remove('context-flash'),1500)},160);
  }

  async function upgradeProfile(userId){
    if(!userId)return;const token=++profileToken;
    try{
      const[{data:p,error:pe},{count:posts},{count:threads},{data:recent,error:te}]=await Promise.all([
        db.from('forum_profiles').select('id,username,display_name,bio,avatar_url,role,created_at').eq('id',userId).maybeSingle(),
        db.from('forum_posts').select('*',{count:'exact',head:true}).eq('author_id',userId).eq('moderation_status','visible'),
        db.from('forum_threads').select('*',{count:'exact',head:true}).eq('author_id',userId).eq('moderation_status','visible'),
        db.from('forum_threads').select('id,title,created_at,last_post_at,is_locked,is_pinned').eq('author_id',userId).eq('moderation_status','visible').order('last_post_at',{ascending:false}).limit(5)
      ]);
      if(pe)throw pe;if(te)throw te;if(!p||token!==profileToken)return;
      const root=$('#profileContent');if(!root)return;
      root.querySelector('.profile-community-upgrade')?.remove();
      const card=root.querySelector('.profile-card');
      if(card){
        let avatar=card.querySelector('.profile-avatar-slot');
        if(!avatar){avatar=document.createElement('div');avatar.className='profile-avatar-slot';card.prepend(avatar)}
        avatar.innerHTML=avatarHtml(p,'lg');
      }
      const section=document.createElement('section');section.className='profile-community-upgrade';
      section.innerHTML=`<div class="profile-stat-grid"><div><strong>${threads||0}</strong><span>DISCUSSIONS</span></div><div><strong>${posts||0}</strong><span>POSTS</span></div><div><strong>${esc(new Date(p.created_at).toLocaleDateString())}</strong><span>JOINED</span></div></div><div class="profile-recent"><strong>RECENT DISCUSSIONS</strong>${(recent||[]).length?(recent||[]).map(t=>`<button type="button" class="profile-recent-thread" data-profile-thread="${esc(t.id)}"><span>${esc(t.title)}</span><small>${t.is_pinned?'PINNED · ':''}${t.is_locked?'LOCKED · ':''}${esc(fmt(t.last_post_at))}</small></button>`).join(''):'<div class="staff-empty">No discussions started yet.</div>'}</div>`;
      root.append(section);
      if(currentUserId===userId){
        const edit=$('#editProfileBtn');if(edit&&!edit.dataset.communityBound){edit.dataset.communityBound='1';edit.addEventListener('click',()=>setTimeout(()=>renderRichProfileEditor(p),0))}
      }
    }catch(error){console.warn('Profile enhancement skipped',error)}
  }

  function renderRichProfileEditor(profile){
    const area=$('#profileEditArea');if(!area||currentUserId!==profile.id)return;
    area.innerHTML=`<div class="profile-editor-rich"><div class="profile-editor-avatar">${avatarHtml(profile,'lg')}<div><label class="bbs-btn secondary avatar-upload-label">CHOOSE AVATAR<input id="profileAvatarFile" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><button type="button" class="mini-btn" id="removeAvatarBtn" ${profile.avatar_url?'':'disabled'}>REMOVE AVATAR</button><div class="field-help">PNG, JPG or WebP · maximum 2 MB.</div></div></div><div class="field"><label>Display name</label><input id="richDisplayName" maxlength="60" value="${esc(profile.display_name||'')}"></div><div class="field"><label>Bio</label><textarea id="richBio" maxlength="500">${esc(profile.bio||'')}</textarea><div class="field-help"><span id="bioCount">${String(profile.bio||'').length}</span>/500 characters</div></div><div class="field-help">@${esc(profile.username)} is permanent. Your role cannot be changed from profile settings.</div><button type="button" class="bbs-btn" id="saveRichProfile">SAVE PROFILE</button></div>`;
    $('#richBio')?.addEventListener('input',e=>{$('#bioCount').textContent=String(e.target.value.length)});
    $('#removeAvatarBtn')?.addEventListener('click',()=>{area.dataset.removeAvatar='1';$('#removeAvatarBtn').textContent='AVATAR WILL BE REMOVED';$('#removeAvatarBtn').disabled=true});
    $('#saveRichProfile')?.addEventListener('click',()=>saveRichProfile(profile));
  }

  async function saveRichProfile(profile){
    const button=$('#saveRichProfile'),display=$('#richDisplayName')?.value.trim()||'',bio=$('#richBio')?.value.trim()||'',file=$('#profileAvatarFile')?.files?.[0]||null;
    if(bio.length>500)return flash('Bio is limited to 500 characters.','error');
    if(file&&(file.size>MAX_AVATAR_BYTES||!ALLOWED_AVATAR_TYPES.has(file.type)))return flash('Avatar must be PNG, JPG or WebP and no larger than 2 MB.','error');
    button.disabled=true;button.textContent='SAVING…';
    let avatarUrl=profile.avatar_url||null,newPath=null;
    try{
      if(file){
        const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
        newPath=`${currentUserId}/${Date.now()}-${crypto.randomUUID().slice(0,8)}.${ext}`;
        const{error:uploadError}=await db.storage.from(AVATAR_BUCKET).upload(newPath,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(uploadError)throw uploadError;
        avatarUrl=db.storage.from(AVATAR_BUCKET).getPublicUrl(newPath).data.publicUrl;
      }
      if($('#profileEditArea')?.dataset.removeAvatar==='1')avatarUrl=null;
      const{error}=await db.from('forum_profiles').update({display_name:display||null,bio:bio||null,avatar_url:avatarUrl}).eq('id',currentUserId);if(error)throw error;
      const old=profile.avatar_url;
      if(old&&old!==avatarUrl&&old.includes('/storage/v1/object/public/forum-avatars/')){
        const oldPath=decodeURIComponent(old.split('/storage/v1/object/public/forum-avatars/')[1]||'');if(oldPath.startsWith(`${currentUserId}/`))db.storage.from(AVATAR_BUCKET).remove([oldPath]).catch(()=>{});
      }
      flash('Profile updated.','success');
      const strong=$('#profileContent .profile-meta strong');if(strong)strong.textContent=display||profile.username;
      const bioEl=$('#profileContent .profile-bio');if(bioEl)bioEl.textContent=bio||'No profile biography.';
      $('#profileEditArea').innerHTML='';
      await upgradeProfile(currentUserId);
      lastPostSignature='';scheduleEnhance();
    }catch(error){
      if(newPath)db.storage.from(AVATAR_BUCKET).remove([newPath]).catch(()=>{});
      flash(error.message||'Unable to save profile.','error');button.disabled=false;button.textContent='SAVE PROFILE';
    }
  }

  document.addEventListener('click',event=>{
    const reply=event.target.closest('[data-reply-post]');if(reply){event.preventDefault();setReplyTarget(reply.dataset.replyPost);return}
    const helpful=event.target.closest('[data-helpful]');if(helpful){event.preventDefault();toggleHelpful(helpful.dataset.helpful,helpful);return}
    const jump=event.target.closest('[data-jump-post]');if(jump&&!jump.disabled){event.preventDefault();jumpToPost(jump.dataset.jumpPost);return}
    if(event.target.closest('#cancelReplyTarget')){event.preventDefault();replyTarget=null;renderReplyTarget();return}
    const recent=event.target.closest('[data-profile-thread]');if(recent){event.preventDefault();document.querySelector('#profileModal')?.classList.add('hidden');location.href=`/forum/?thread=${encodeURIComponent(recent.dataset.profileThread)}`;return}
    const profile=event.target.closest('[data-profile]');if(profile){setTimeout(()=>upgradeProfile(profile.dataset.profile),110)}
    if(event.target.closest('#editProfileBtn')){
      const profileId=currentUserId; if(profileId)setTimeout(async()=>{const{data}=await db.from('forum_profiles').select('id,username,display_name,bio,avatar_url,role,created_at').eq('id',profileId).maybeSingle();if(data)renderRichProfileEditor(data)},0);
    }
  },true);

  const replyForm=$('#replyForm');if(replyForm)replyForm.addEventListener('submit',submitReply,true);
  new MutationObserver(scheduleEnhance).observe(document.body,{subtree:true,childList:true});
  db.auth.onAuthStateChange(()=>setTimeout(async()=>{await refreshSession();lastPostSignature='';scheduleEnhance()},0));
  refreshSession().then(scheduleEnhance);
})();