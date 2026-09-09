(()=>{'use strict';
const C=window.ForumCore,M=window.ForumCommunity,N=window.ForumMember,T=window.ForumThread,S=window.ForumSocial;
const{db,state,$,esc,fmt,flash,openModal}=C;

// Serialize profile updates in Postgres so concurrent tabs clean up the true previous avatar.
M.saveProfileEdit=async function(){
  if(!state.profile)return;
  const p=state.profile,display=$('#profileDisplayName')?.value.trim()||'',bio=$('#profileBio')?.value.trim()||'',file=$('#profileAvatarFile')?.files?.[0]||null,root=$('#profileEditor'),remove=root?.dataset.removeAvatar==='1',button=$('[data-save-profile]');
  if(!button)return;if(bio.length>500)return flash('Bio is limited to 500 characters.','error');
  if(file&&(file.size>C.MAX_AVATAR_BYTES||!C.AVATAR_TYPES.has(file.type)))return flash('Avatar must be PNG, JPG or WebP and no larger than 10 MB.','error');
  button.disabled=true;button.textContent='SAVING…';let newPath=null;
  try{
    let avatarUrl=remove?null:p.avatar_url;
    if(file){const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';newPath=`${p.id}/${Date.now()}-${crypto.randomUUID().slice(0,8)}.${ext}`;const{error:ue}=await db.storage.from(C.AVATAR_BUCKET).upload(newPath,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(ue)throw ue;avatarUrl=db.storage.from(C.AVATAR_BUCKET).getPublicUrl(newPath).data.publicUrl}
    const{data,error}=await db.rpc('forum_update_own_profile',{p_display_name:display||null,p_bio:bio||null,p_avatar_url:avatarUrl});if(error)throw error;
    const row=Array.isArray(data)?data[0]:data;if(!row)throw new Error('Profile save did not complete.');
    const old=row.previous_avatar_url,updated={id:row.id,username:row.username,display_name:row.display_name,bio:row.bio,avatar_url:row.avatar_url,role:row.role,created_at:row.created_at};
    if(old&&old!==updated.avatar_url&&old.includes('/storage/v1/object/public/forum-avatars/')){const oldPath=decodeURIComponent(old.split('/storage/v1/object/public/forum-avatars/')[1]||'');if(oldPath.startsWith(`${p.id}/`))await db.storage.from(C.AVATAR_BUCKET).remove([oldPath]).catch(()=>{})}
    state.profile=updated;C.renderAccount();await N.refreshNav().catch(()=>{});await M.showProfile(p.id,false);flash('Profile saved.','success');
  }catch(e){if(newPath)await db.storage.from(C.AVATAR_BUCKET).remove([newPath]).catch(()=>{});flash(e.message||'Unable to save profile.','error');button.disabled=false;button.textContent='SAVE PROFILE'}
};

// Keep an already-open DM consistent with current block/friend/privacy policy.
const basePrivacyConversation=S.renderConversation.bind(S);
S.renderConversation=async function(id,...rest){
  const result=await basePrivacyConversation(id,...rest);
  const form=$('#dmComposer');if(!form||!state.profile)return result;
  try{
    const{data:c,error}=await db.from('forum_direct_conversations').select('id,user_one,user_two,status').eq('id',id).maybeSingle();
    if(error||!c)return result;
    const partner=c.user_one===state.profile.id?c.user_two:c.user_one;
    const{data:allowed,error:pe}=await db.rpc('forum_can_message_member',{p_target:partner});
    if(pe||allowed===true)return result;
    form.remove();
    const shell=$('#forumContent .dm-shell');
    if(shell&&!shell.querySelector('.dm-permission-notice'))shell.insertAdjacentHTML('beforeend','<div class="notice error dm-permission-notice">Messaging is currently unavailable for this conversation because of a block, suspension, friendship change, or privacy setting.</div>');
  }catch{}
  return result;
};

// Reactions and bookmarks were hardened to atomic RPCs; keep the browser on those same paths.
T.toggleBookmark=async function(){
  if(!state.thread||!C.requireProfile())return;
  const b=$('#bookmarkBtn');if(b)b.disabled=true;
  try{
    const{data:active,error}=await db.rpc('forum_toggle_bookmark',{p_thread:state.thread.id});if(error)throw error;
    if(b){b.dataset.bookmarked=active===true?'1':'0';b.textContent=active===true?'BOOKMARKED':'BOOKMARK'}
    flash(active===true?'Discussion bookmarked.':'Bookmark removed.','success');
    await N.refreshNav?.().catch?.(()=>{});
  }catch(e){flash(e.message||'Unable to update bookmark.','error')}
  finally{if(b?.isConnected)b.disabled=false}
};
T.toggleReaction=async function(spec,button){
  if(!C.requireProfile())return;
  const[postId,reaction]=String(spec||'').split(':');
  if(!/^[0-9a-f-]{36}$/i.test(postId)||!['like','interesting','helpful'].includes(reaction))return flash('Invalid reaction.','error');
  if(button)button.disabled=true;
  try{
    const{data:active,error}=await db.rpc('forum_toggle_reaction',{p_post:postId,p_reaction:reaction});if(error)throw error;
    await T.reroute(false);
    document.getElementById(`post-${postId}`)?.scrollIntoView({block:'center'});
    flash(active===true?'Reaction added.':'Reaction removed.','success');
  }catch(e){flash(e.message||'Unable to update reaction.','error')}
  finally{if(button?.isConnected)button.disabled=false}
};

// Staff report queue must remain reachable beyond the first 50 rows.
const REPORT_PAGE_SIZE=50;let staffReportPage=1;
function reportRow(r){const target=r.thread_id||r.post_id||r.profile_id||'';return`<div class="staff-row"><div class="staff-row-title">${esc(String(r.target_type||'').toUpperCase())} REPORT · ${esc(r.reason)}</div><div class="staff-row-meta">${esc(fmt(r.created_at))} · target ${esc(target)}</div>${r.details?`<div class="staff-row-body">${esc(r.details)}</div>`:''}<div class="staff-actions" style="margin-top:7px"><button class="bbs-btn secondary" type="button" data-open-report-target="${esc(r.target_type+':'+target)}">OPEN TARGET</button><button class="bbs-btn success" type="button" data-resolve-report="${r.id}:resolved">RESOLVE</button><button class="bbs-btn secondary" type="button" data-resolve-report="${r.id}:dismissed">DISMISS</button></div></div>`}
async function renderStaff(page=1){
  if(!C.isStaff())return;const countRes=await db.from('forum_reports').select('*',{count:'exact',head:true}).eq('status','open');if(countRes.error)throw countRes.error;const total=countRes.count||0,pages=Math.max(1,Math.ceil(total/REPORT_PAGE_SIZE));staffReportPage=Math.min(pages,Math.max(1,Number(page)||1));const from=(staffReportPage-1)*REPORT_PAGE_SIZE;
  const[reports,actions]=await Promise.all([db.from('forum_reports').select('id,target_type,thread_id,post_id,profile_id,reason,details,status,created_at').eq('status','open').order('created_at',{ascending:true}).range(from,from+REPORT_PAGE_SIZE-1),db.from('forum_moderation_actions').select('id,action,target_type,target_id,note,created_at').order('created_at',{ascending:false}).limit(25)]);if(reports.error)throw reports.error;if(actions.error)throw actions.error;
  const pager=total>REPORT_PAGE_SIZE?`<div class="forum-pagination"><button class="bbs-btn secondary" type="button" data-staff-report-page="${staffReportPage-1}" ${staffReportPage<=1?'disabled':''}>PREVIOUS</button><span class="page-status">REPORT PAGE ${staffReportPage} OF ${pages} · ${total} OPEN</span><button class="bbs-btn secondary" type="button" data-staff-report-page="${staffReportPage+1}" ${staffReportPage>=pages?'disabled':''}>NEXT</button></div>`:'';
  $('#staffContent').innerHTML=`<div class="staff-grid"><section class="staff-section"><div class="panel-title">OPEN REPORTS <span>${total}</span></div>${reports.data?.length?reports.data.map(reportRow).join(''):'<div class="empty-state">No open reports.</div>'}${pager}</section><div><section class="staff-section"><div class="panel-title">MEMBER LOOKUP</div><div class="panel-body"><div class="field"><label for="staffMemberSearch">Username</label><input id="staffMemberSearch" placeholder="username"></div><button class="bbs-btn secondary" type="button" data-staff-search style="margin-top:8px">FIND MEMBER</button><div id="staffMemberResult"></div></div></section><section class="staff-section" style="margin-top:10px"><div class="panel-title">RECENT STAFF ACTIONS</div>${actions.data?.length?actions.data.map(a=>`<div class="staff-row"><div class="staff-row-title">${esc(a.action)} → ${esc(a.target_type)} ${esc(a.target_id)}</div><div class="staff-row-meta">${esc(fmt(a.created_at))}${a.note?' · '+esc(a.note):''}</div></div>`).join(''):'<div class="empty-state">No staff actions yet.</div>'}</section></div></div>`;
}
M.openStaffConsole=async function(){if(!C.isStaff())return;staffReportPage=1;$('#staffContent').innerHTML='<div class="loading-state">LOADING MODERATION QUEUE…</div>';openModal('#staffModal');try{await renderStaff(1)}catch(e){flash(e.message||'Unable to load staff console.','error')}};
M.resolveReport=async function(spec){const[id,status]=String(spec||'').split(':'),note=prompt(`Optional resolution note (${status}):`)||null,{error}=await db.rpc('forum_resolve_report',{p_report_id:id,p_status:status,p_note:note});if(error)return flash(error.message,'error');flash(`Report ${status}.`,'success');try{await renderStaff(staffReportPage)}catch(e){flash(e.message||'Unable to refresh report queue.','error')}};
document.addEventListener('click',e=>{const b=e.target.closest('[data-staff-report-page]');if(!b||b.disabled)return;e.preventDefault();renderStaff(Number(b.dataset.staffReportPage)).catch(err=>flash(err.message||'Unable to change report page.','error'))});
})();