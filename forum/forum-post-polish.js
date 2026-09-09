(() => {
  'use strict';

  if (!window.supabase) return;

  const SUPABASE_URL='https://waqobihznhkbspdchjbb.supabase.co';
  const SUPABASE_KEY='sb_publishable_uPGjlkbauGtisASevhnTLA_jIJDhzZG';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const POSTS_PER_PAGE=15;
  let enhanceTimer=null;
  let enhancing=false;

  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const threadId=()=>new URLSearchParams(location.search).get('thread');

  function injectStyles(){
    if(document.querySelector('#forumPostPolishStyles'))return;
    const style=document.createElement('style');
    style.id='forumPostPolishStyles';
    style.textContent=`
      .reply-target-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;margin-bottom:9px;border:1px dashed var(--line,#3e4c42);background:rgba(0,0,0,.24);font:12px var(--mono,monospace)}
      .reply-context{margin:0 0 9px;padding:7px 9px;border-left:3px solid var(--line,#3e4c42);background:rgba(255,255,255,.025);font:11px var(--mono,monospace);opacity:.88}
      .reply-context button{all:unset;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
      .post-pagination{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border-top:1px solid var(--line,#3e4c42);background:rgba(0,0,0,.18)}
      .post-pagination .page-status{flex:1;text-align:center;font:12px var(--mono,monospace);opacity:.82}
      .post[hidden]{display:none!important}
      .canonical-entity-picker{margin-bottom:10px}
      .canonical-entity-picker .field-help,#canonicalEntityStatus{margin-top:5px}
      .entity-legacy-field.hidden{display:none!important}
      .entity-tag a{color:inherit;text-decoration:underline;text-underline-offset:2px}
      .entity-tag a:hover,.entity-tag a:focus{filter:brightness(1.25)}
      @media(max-width:640px){.post-pagination{flex-wrap:wrap;align-items:stretch}.post-pagination .page-status{order:-1;flex-basis:100%}.post-pagination .bbs-btn{flex:1}.reply-target-banner{align-items:flex-start;flex-direction:column}}
    `;
    document.head.append(style);
  }

  function notice(message,kind=''){
    const el=$('#globalNotice');
    if(!el)return;
    el.className=`notice ${kind}`.trim();
    el.textContent=message;
    el.classList.remove('hidden');
    clearTimeout(notice.timer);
    notice.timer=setTimeout(()=>el.classList.add('hidden'),5200);
  }

  function postArticles(){return [...document.querySelectorAll('#threadPosts article.post')];}

  function findPostPage(postId){
    const articles=postArticles();
    const index=articles.findIndex(a=>a.id===`post-${postId}`);
    return index<0?1:Math.floor(index/POSTS_PER_PAGE)+1;
  }

  function setPostPage(page,push=true,scroll=true){
    const articles=postArticles();
    if(!articles.length)return;
    const totalPages=Math.max(1,Math.ceil(articles.length/POSTS_PER_PAGE));
    page=Math.min(totalPages,Math.max(1,Number(page)||1));
    articles.forEach((article,index)=>{article.hidden=Math.floor(index/POSTS_PER_PAGE)+1!==page});

    let pager=$('#threadPostPagination');
    if(totalPages<=1){pager?.remove();}
    else{
      if(!pager){
        pager=document.createElement('div');
        pager.id='threadPostPagination';
        pager.className='post-pagination';
        $('#threadPosts')?.append(pager);
      }
      pager.innerHTML=`<button type="button" class="bbs-btn secondary" data-post-page="${page-1}" ${page<=1?'disabled':''}>PREVIOUS</button><span class="page-status">POST PAGE ${page} OF ${totalPages} · ${articles.length} POSTS</span><button type="button" class="bbs-btn secondary" data-post-page="${page+1}" ${page>=totalPages?'disabled':''}>NEXT</button>`;
    }

    if(push){
      const url=new URL(location.href);
      if(page>1)url.searchParams.set('postPage',String(page));else url.searchParams.delete('postPage');
      history.pushState({thread:threadId(),postPage:page},'',`${url.pathname}${url.search}${url.hash}`);
    }
    if(scroll)$('#threadHeading')?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function applyPostPagination(){
    const articles=postArticles();
    if(!articles.length)return;
    const params=new URLSearchParams(location.search);
    let page=Number(params.get('postPage')||1);
    const hashMatch=location.hash.match(/^#post-([0-9a-f-]{36})$/i);
    if(hashMatch)page=findPostPage(hashMatch[1]);
    setPostPage(page,false,false);
    if(hashMatch){
      const target=document.getElementById(`post-${hashMatch[1]}`);
      if(target&&!target.hidden)setTimeout(()=>target.scrollIntoView({block:'center'}),80);
    }
  }

  function clearReplyTarget(){
    const form=$('#replyForm');
    if(!form)return;
    delete form.dataset.replyTo;
    form.querySelector('.reply-target-banner')?.remove();
  }

  function beginReplyTo(article){
    const form=$('#replyForm');
    const textarea=$('#replyBody');
    if(!form||!textarea||form.classList.contains('hidden'))return notice('Sign in to reply to this post.','error');
    const postId=article.id.replace(/^post-/,'');
    const member=article.querySelector('.profile-link')?.textContent?.trim()||'member';
    form.dataset.replyTo=postId;
    let banner=form.querySelector('.reply-target-banner');
    if(!banner){banner=document.createElement('div');banner.className='reply-target-banner';form.querySelector('.panel-body')?.prepend(banner)}
    banner.innerHTML=`<span>REPLYING TO <strong>${esc(member)}</strong> · <button type="button" class="mini-btn" data-jump-post="${esc(postId)}">VIEW POST</button></span><button type="button" class="mini-btn" data-cancel-reply>CANCEL REPLY</button>`;
    textarea.focus();
    form.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function toggleHelpful(postId,button){
    const{data:auth}=await client.auth.getSession();
    const userId=auth.session?.user?.id;
    if(!userId)return notice('Sign in to mark a post helpful.','error');
    button.disabled=true;
    try{
      const{data:existing,error:readError}=await client.from('forum_reactions').select('post_id').eq('post_id',postId).eq('user_id',userId).eq('reaction','helpful').maybeSingle();
      if(readError)throw readError;
      if(existing){
        const{error}=await client.from('forum_reactions').delete().eq('post_id',postId).eq('user_id',userId).eq('reaction','helpful');if(error)throw error;
      }else{
        const{error}=await client.from('forum_reactions').insert({post_id:postId,user_id:userId,reaction:'helpful'});if(error)throw error;
      }
      await refreshHelpful();
    }catch(error){console.error('Helpful reaction failed',error);notice(error?.message||'Unable to update reaction.','error')}
    finally{button.disabled=false}
  }

  async function refreshHelpful(){
    const articles=postArticles();
    const ids=articles.map(a=>a.id.replace(/^post-/,'')).filter(Boolean);
    if(!ids.length)return;
    const[{data:auth},{data:rows,error}]=await Promise.all([
      client.auth.getSession(),
      client.from('forum_reactions').select('post_id,user_id').in('post_id',ids).eq('reaction','helpful')
    ]);
    if(error)throw error;
    const userId=auth.session?.user?.id||null;
    const counts=new Map(),mine=new Set();
    for(const row of rows||[]){counts.set(row.post_id,(counts.get(row.post_id)||0)+1);if(userId&&row.user_id===userId)mine.add(row.post_id)}
    for(const article of articles){
      const id=article.id.replace(/^post-/,'');
      const btn=article.querySelector('[data-helpful]');
      if(btn)btn.textContent=`${mine.has(id)?'REMOVE HELPFUL':'HELPFUL'} (${counts.get(id)||0})`;
    }
  }

  async function decorateReplyRelationships(){
    const id=threadId();
    const articles=postArticles();
    if(!id||!articles.length)return;
    const{data:posts,error}=await client.from('forum_posts').select('id,reply_to_id,author_id').eq('thread_id',id).order('created_at');
    if(error)throw error;
    const byId=new Map((posts||[]).map(p=>[p.id,p]));
    const authorIds=[...new Set((posts||[]).map(p=>p.author_id).filter(Boolean))];
    const profilesResult=authorIds.length?await client.from('forum_profiles').select('id,username,display_name').in('id',authorIds):{data:[],error:null};
    if(profilesResult.error)throw profilesResult.error;
    const profiles=new Map((profilesResult.data||[]).map(p=>[p.id,p]));

    for(const article of articles){
      const postId=article.id.replace(/^post-/,'');
      const row=byId.get(postId);
      let context=article.querySelector('.reply-context');
      if(!row?.reply_to_id){context?.remove();continue}
      const parent=byId.get(row.reply_to_id);
      const profile=parent?profiles.get(parent.author_id):null;
      const label=profile?.display_name||profile?.username||'earlier post';
      if(!context){context=document.createElement('div');context.className='reply-context';article.querySelector('.post-text')?.before(context)}
      context.innerHTML=`Replying to <button type="button" data-jump-post="${esc(row.reply_to_id)}">${esc(label)}</button>`;
    }
  }

  function installPostButtons(){
    for(const article of postArticles()){
      const tools=article.querySelector('.post-tools');
      const postId=article.id.replace(/^post-/,'');
      if(!tools||!postId)continue;
      if(!tools.querySelector('[data-reply-post]')){
        const reply=document.createElement('button');reply.type='button';reply.className='mini-btn';reply.dataset.replyPost=postId;reply.textContent='REPLY';tools.insertBefore(reply,tools.querySelector('[data-report-post]')||tools.firstChild);
      }
      if(!tools.querySelector('[data-helpful]')){
        const helpful=document.createElement('button');helpful.type='button';helpful.className='mini-btn';helpful.dataset.helpful=postId;helpful.textContent='HELPFUL (0)';tools.insertBefore(helpful,tools.querySelector('[data-report-post]')||null);
      }
    }
  }

  async function enhance(){
    if(enhancing)return;
    const id=threadId();
    if(!id||!postArticles().length)return;
    enhancing=true;
    try{
      installPostButtons();
      await Promise.all([refreshHelpful(),decorateReplyRelationships()]);
      applyPostPagination();
    }catch(error){console.warn('Thread polish enhancement skipped',error)}
    finally{enhancing=false}
  }

  function scheduleEnhance(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(enhance,120)}

  document.addEventListener('click',event=>{
    const pageBtn=event.target.closest('[data-post-page]');
    if(pageBtn){event.preventDefault();if(!pageBtn.disabled)setPostPage(Number(pageBtn.dataset.postPage),true,true);return}
    const replyBtn=event.target.closest('[data-reply-post]');
    if(replyBtn){event.preventDefault();const article=replyBtn.closest('article.post');if(article)beginReplyTo(article);return}
    const cancel=event.target.closest('[data-cancel-reply]');
    if(cancel){event.preventDefault();clearReplyTarget();return}
    const jump=event.target.closest('[data-jump-post]');
    if(jump){
      event.preventDefault();
      const id=jump.dataset.jumpPost,page=findPostPage(id);
      setPostPage(page,true,false);
      history.replaceState(history.state,'',`${location.pathname}${location.search}#post-${encodeURIComponent(id)}`);
      document.getElementById(`post-${id}`)?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    const helpful=event.target.closest('[data-helpful]');
    if(helpful){event.preventDefault();toggleHelpful(helpful.dataset.helpful,helpful)}
  },true);

  document.addEventListener('submit',async event=>{
    const form=event.target.closest('#replyForm');
    if(!form?.dataset.replyTo)return;
    event.preventDefault();event.stopImmediatePropagation();
    const id=threadId(),body=String($('#replyBody')?.value||'').trim(),replyTo=form.dataset.replyTo;
    if(!id||!body)return;
    const button=form.querySelector('button[type="submit"]');
    const original=button?.textContent||'SUBMIT REPLY';
    if(button){button.disabled=true;button.textContent='POSTING…'}
    try{
      const{data:auth}=await client.auth.getSession();
      if(!auth.session?.user)throw new Error('Sign in to reply.');
      const{data:newPost,error}=await client.rpc('forum_create_post',{p_thread_id:id,p_body:body,p_reply_to:replyTo});
      if(error)throw error;
      clearReplyTarget();
      if($('#replyBody'))$('#replyBody').value='';
      const{count}=await client.from('forum_posts').select('id',{count:'exact',head:true}).eq('thread_id',id).eq('moderation_status','visible');
      const lastPage=Math.max(1,Math.ceil((count||1)/POSTS_PER_PAGE));
      location.assign(`/forum/?thread=${encodeURIComponent(id)}${lastPage>1?`&postPage=${lastPage}`:''}#post-${encodeURIComponent(newPost)}`);
    }catch(error){console.error('Reply-to submission failed',error);notice(error?.message||'Unable to post reply.','error');if(button){button.disabled=false;button.textContent=original}}
  },true);

  const observer=new MutationObserver(scheduleEnhance);
  observer.observe(document.body,{subtree:true,childList:true});
  window.addEventListener('popstate',()=>setTimeout(applyPostPagination,60));
  window.addEventListener('pageshow',scheduleEnhance);
  injectStyles();
  setTimeout(enhance,500);
})();