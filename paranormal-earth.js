/* THE PARANORMAL WIKI — Earth engine bootstrap.
 * Renderer is kept modular in paranormal-earth-engine-v4.js; homepage/brand compatibility remains here.
 */
import('./paranormal-earth-tile-shim.js?v=4.0.1').catch(error=>{
 console.error('[PARANORMAL WIKI EARTH] engine bootstrap failed',error);
 document.querySelectorAll('[data-unseen-earth]').forEach(root=>{
  root.classList.remove('ua-ready');
  root.classList.add('ua-fallback');
 });
});

/* Public-brand and global visitor-counter patch.
   Archive-lore references to "The Unseen Archive" remain intentionally intact. */
(()=>{
 'use strict';
 const PUBLIC_BRAND='THE PARANORMAL WIKI';
 const COUNTER_BASELINE=0;
const SESSION_KEY='paranormalWikiVisitCountedV4';
const LAST_COUNT_KEY='paranormalWikiLastVisitorCountV4';

 // Compatibility repair for the canonical dossier evidence-table formatter.
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

 function organizedHomeMarkup(){
  const publicEntities=913,alienArchetypes=60,uapCases=24;
  const fiction=25,nonFiction=888,sourced=888;
  const featured=[
   ['ghost','Ghost'],['poltergeist','Poltergeist'],['djinn','Djinn'],['vampire','Vampire'],
   ['wendigo','Wendigo'],['skinwalker','Skinwalker'],['bigfoot','Bigfoot'],['mothman','Mothman'],
   ['loch-ness-monster','Loch Ness Monster'],['gray-alien','Gray Alien'],
   ['men-in-black','Men in Black'],['flatwoods-occupant','Flatwoods Occupant']
  ];
  const featuredRows=[];
  for(let index=0;index<featured.length;index+=2){
   const left=featured[index],right=featured[index+1];
   featuredRows.push(`<tr><td><a data-entity="${left[0]}">${left[1]}</a></td><td><a data-entity="${right[0]}">${right[1]}</a></td></tr>`);
  }
  return `<div class="home-organized" data-home-organized>
   <div class="welcome">WELCOME TRAVELER</div>
   <p class="warning">WARNING: SUPERNATURAL CLAIMS ARE CATALOGED — NOT AUTOMATICALLY ENDORSED</p>

   <table class="box home-start"><tr><td class="box-title purple">START HERE</td></tr><tr><td class="box-body center">
    <p>Explore a source-labeled archive of folklore, historical records, cryptid claims, modern witness reports, original archive fiction and documented UAP material.</p>
    <div class="home-actions"><a data-go="entity-index">[ BROWSE ALL ${publicEntities} ENTITIES ]</a><a data-go="search">[ SEARCH THE ARCHIVE ]</a><button type="button" data-home-earth>[ EXPLORE THE EARTH ]</button></div>
   </td></tr></table>

   <div data-earth-slot></div>

   <table class="box"><tr><td class="box-title green">BROWSE THE ARCHIVE</td></tr><tr><td class="box-body">
    <table class="archive-table home-browse-grid"><tbody>
     <tr><td><a data-go="entity-index">COMPLETE ENTITY INDEX</a></td><td><a data-go="categories">CATEGORIES</a></td><td><a data-go="cultures">CULTURES</a></td></tr>
     <tr><td><a data-go="countries">COUNTRIES &amp; REGIONS</a></td><td><a data-cat="Cryptids">CRYPTIDS</a></td><td><a data-cat="Ghosts &amp; Apparitions">GHOSTS &amp; APPARITIONS</a></td></tr>
     <tr><td><a data-cat="Folklore Creatures">FOLKLORE &amp; MYTHOLOGY</a></td><td><a data-cat="Demonology &amp; Occult Entities">DEMONS &amp; SPIRITS</a></td><td><a data-go="aliens">ALIEN / NHI ARCHIVE</a></td></tr>
     <tr><td><a data-go="uap">MODERN UAP RESEARCH</a></td><td><a data-go="cases">UAP CASE FILES</a></td><td><a data-go="archive-tree">ARCHIVE TREE</a></td></tr>
    </tbody></table>
    <p class="home-map-note mono">MAP POLICY: Entity dossiers may plot cultural range, historical records, modern reports and famous cases separately. Maps never claim to show a creature population.</p>
   </td></tr></table>

   <table class="box"><tr><td class="box-title purple">FEATURED RESEARCH DOSSIERS</td></tr><tr><td class="box-body">
    <table class="archive-table home-feature-grid"><tbody>${featuredRows.join('')}</tbody></table>
    <p class="center home-section-action">[ <a data-go="entity-index">VIEW ALL DEEP DOSSIERS</a> ]</p>
   </td></tr></table>

   <table class="box"><tr><td class="box-title">ARCHIVE STATISTICS</td></tr><tr><td class="box-body">
    <div class="home-stat-grid mono"><span>PUBLIC ENTITY FILES: <b>${publicEntities}</b></span><span>ALIEN / NHI ARCHETYPES: <b>${alienArchetypes}</b></span><span>UAP CASE FILES: <b>${uapCases}</b></span><span>COMPLETED NON-FICTION DOSSIERS: <b>${nonFiction}</b></span><span>NON-FICTION FILES WITH NAMED SOURCES: <b>${sourced}</b></span><span>ORIGINAL ARCHIVE-FICTION FILES: <b>${fiction}</b></span></div>
    <p class="tiny center">RESEARCH CURRENT THROUGH: 09/06/2026 · COMPLETION PASS: 09/06/2026</p>
    <p class="tiny">All ${publicEntities} public entity files use the expanded dossier architecture. The original 150 records remain preserved, with 763 records appended without renumbering legacy files. Original archive-fiction files remain explicitly fictional and do not receive fabricated evidence or real-world heat maps.</p>
   </td></tr></table>

   <table class="layout home-dual"><tr><td width="50%"><table class="box"><tr><td class="box-title red">ALIEN / NHI ARCHIVE</td></tr><tr><td class="box-body center"><span class="ufo">🛸</span><p>Species lore, contactee movements, alleged occupants, abduction narratives and extraterrestrial archetypes.</p>[ <a data-go="aliens">ENTER ALIEN / NHI ARCHIVE</a> ]</td></tr></table></td><td width="50%"><table class="box"><tr><td class="box-title green">MODERN UAP RESEARCH</td></tr><tr><td class="box-body center"><p>Official imagery, government records, historical investigations, AARO material and evidence-status reviews.</p><p class="tiny">Unresolved does not mean extraterrestrial.</p>[ <a data-go="uap">OPEN MODERN UAP ARCHIVE</a> ]</td></tr></table></td></tr></table>

   <table class="box home-mystery"><tr><td class="box-title yellow">ARCHIVE MYSTERY</td></tr><tr><td class="box-body mono"><div class="home-mystery-grid"><div>PUBLIC FILE COUNT: ${publicEntities}<br>ALIEN INDEX COUNT: ${alienArchetypes}<br>RESTRICTED COUNT: ???<br>LAST UPDATE LOG: <span class="secret">09/07/2026</span></div><div>DATABASE GROWTH LOG:<br>1997 — 54 files · 1999 — 92 files · 2001 — 118 files · 2003 — 150 files<br>2007 — 207 files · 2012 — 319 files · 2017 — 438 files<br>2020 — 511 files · 2023 — 669 files · 2026 — 913 files</div></div><p class="tiny">(That date is in a hidden fictional storyline. Public research is current through 09/06/2026.)</p></td></tr></table>
  </div>`;
 }

 function organizeHome(){
  const app=document.getElementById('app');
  if(!app||app.querySelector('[data-home-organized]'))return;
  const routeName=decodeURIComponent(location.hash.replace(/^#/,'')||'home');
  if(routeName!=='home')return;
  const earth=app.querySelector('.ua-globe-section');
  if(!earth)return;
  earth.remove();
  app.innerHTML=organizedHomeMarkup();
  const slot=app.querySelector('[data-earth-slot]');
  slot.replaceWith(earth);
  const earthHeading=earth.querySelector('.ua-globe-head');
  if(earthHeading)earthHeading.textContent='GLOBAL OBSERVATION SYSTEM';
  app.querySelector('[data-home-earth]')?.addEventListener('click',()=>earth.scrollIntoView({behavior:'smooth',block:'start'}));
  app.querySelectorAll('[data-go]').forEach(link=>link.onclick=()=>{location.hash='#'+link.dataset.go});
  app.querySelectorAll('[data-entity]').forEach(link=>link.onclick=()=>{location.hash='#entity/'+link.dataset.entity});
  app.querySelectorAll('[data-cat]').forEach(link=>link.onclick=()=>{location.hash='#category/'+encodeURIComponent(link.dataset.cat)});
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
  organizeHome();
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
