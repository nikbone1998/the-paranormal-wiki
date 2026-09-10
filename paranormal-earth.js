/* THE PARANORMAL WIKI — Earth engine bootstrap.
 * The bounded 2D map remains isolated in paranormal-earth-entities.js.
 */
(()=>{
 'use strict';
 const PUBLIC_BRAND='THE PARANORMAL WIKI';
 const COUNTER_BASELINE=0;
 const SESSION_KEY='paranormalWikiVisitCountedV4';
 const LAST_COUNT_KEY='paranormalWikiLastVisitorCountV4';

 if(typeof window.stat!=='function')window.stat=value=>{
  const score=Math.max(0,Math.min(10,Number(value)||0));
  return '█'.repeat(score)+'░'.repeat(10-score)+' '+score+'/10';
 };

 function setPublicBrand(){
  document.title='THE PARANORMAL WIKI — Expanded Research Database';
  const description=document.querySelector('meta[name="description"]');
  if(description)description.content='The Paranormal Wiki: a 1997-style paranormal research archive with folklore, cryptozoology, UFO history and modern UAP source review.';
  const masthead=document.querySelector('.site-title');
  if(masthead)masthead.textContent=PUBLIC_BRAND;
  document.querySelector('.since')?.remove();
  const firstBadge=document.querySelector('.badges .badge');
  if(firstBadge)firstBadge.innerHTML='THE PARANORMAL<br>WIKI';
  const footerBrand=document.querySelector('.footer > b');
  if(footerBrand)footerBrand.textContent=PUBLIC_BRAND;
 }

 function cleanCurrentView(){
  const app=document.getElementById('app');
  if(!app)return;
  app.querySelectorAll('.center').forEach(node=>{
   const text=node.textContent.replace(/\s+/g,' ').trim();
   if(text.includes('THE ARCHIVE HAS BEEN RESEARCHED AGAIN.')||text.includes('THE WEBSITE STILL THINKS IT IS 1997. THE SOURCES DO NOT.'))node.remove();
  });
  app.querySelectorAll('.box').forEach(box=>{
   if(box.querySelector('.box-title')?.textContent.trim()==='ENTITY OF THE WEEK')box.remove();
  });
  app.querySelectorAll('.welcome').forEach(heading=>{
   if(heading.textContent.trim()==='SEARCH THE UNSEEN ARCHIVE')heading.textContent='SEARCH THE PARANORMAL WIKI';
  });
 }

 function formatCount(value){
  const safe=Number.isSafeInteger(value)&&value>=COUNTER_BASELINE?value:COUNTER_BASELINE;
  return String(safe).padStart(8,'0');
 }

 async function updateVisitorCounter(){
  const counter=document.getElementById('visitor');
  if(!counter)return;
  let remembered=COUNTER_BASELINE;
  try{
   localStorage.removeItem('uaResearchVisits');
   localStorage.removeItem('paranormalWikiLastVisitorCount');
   localStorage.removeItem('paranormalWikiLastVisitorCountV2');
   remembered=Number(localStorage.getItem(LAST_COUNT_KEY));
  }catch(_error){}
  counter.textContent=formatCount(remembered);
  let counted=false;
  try{counted=sessionStorage.getItem(SESSION_KEY)==='1'}catch(_error){}
  try{
   const response=await fetch('/api/visitor',{method:counted?'GET':'POST',headers:{Accept:'application/json'},cache:'no-store'});
   if(!response.ok)throw new Error(`visitor endpoint returned ${response.status}`);
   const payload=await response.json();
   const value=Number(payload.count);
   if(!Number.isSafeInteger(value)||value<COUNTER_BASELINE)throw new Error('invalid visitor count');
   counter.textContent=formatCount(value);
   try{
    localStorage.setItem(LAST_COUNT_KEY,String(value));
    if(!counted)sessionStorage.setItem(SESSION_KEY,'1');
   }catch(_error){}
  }catch(error){console.warn('[PARANORMAL WIKI] visitor counter fallback active',error)}
 }

 setPublicBrand();
 cleanCurrentView();
 const app=document.getElementById('app');
 if(app)new MutationObserver(cleanCurrentView).observe(app,{childList:true,subtree:true});
 updateVisitorCounter();
})();

// Existing map layer — unchanged.
import('./paranormal-earth-entities.js?v=20260910-2d-rebuild-1').catch(error=>console.warn('[PARANORMAL WIKI EARTH] entity layer unavailable',error));

// Late-loaded occult profile data. Kept separate from the map implementation.
(()=>{
 const normalizeOccultRoute=()=>{
  const h=decodeURIComponent(location.hash.replace(/^#/,'')||'');
  if(h.startsWith('occult-rumor/')){
   const slug=h.slice('occult-rumor/'.length);
   if(slug) location.hash='#occult-figure/rumor/'+encodeURIComponent(slug);
  }
 };
 addEventListener('hashchange',normalizeOccultRoute);
 normalizeOccultRoute();

 const s=document.createElement('script');
 s.src='./occult-figures-batch2.js?v=20260910-b2-deep-2';
 s.async=true;
 s.onload=()=>{
  normalizeOccultRoute();
  const h=decodeURIComponent(location.hash.replace(/^#/,'')||'home');
  if((h==='occult-figures'||h.startsWith('occult-figure/rumor/'))&&typeof route==='function')route();
 };
 s.onerror=error=>console.warn('[PARANORMAL WIKI OCCULT] batch 2 profile data unavailable',error);
 document.head.appendChild(s);
})();
