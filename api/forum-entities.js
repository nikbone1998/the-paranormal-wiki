const fs=require('fs');
const path=require('path');
const EXPECTED_ENTRIES=913;
let cached=null;

function normalize(value){return String(value??'').replace(/\s+/g,' ').trim()}
function decodeHtml(value){return normalize(String(value||'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>'))}
function cleanSlug(value){try{return decodeURIComponent(String(value||'').split(/[?#]/)[0]).trim()}catch{return String(value||'').split(/[?#]/)[0].trim()}}

function extractCanonicalEntities(html){
 const bySlug=new Map();
 const add=(slug,name,id='')=>{
  slug=cleanSlug(slug);name=decodeHtml(name);id=normalize(id);
  if(!slug||!name||name.length>160||/^view\b|^open\b|^read\b/i.test(name))return;
  const existing=bySlug.get(slug);
  if(!existing||(!existing.id&&id))bySlug.set(slug,{id:id||'',name,slug});
 };
 let match;
 const anchorRe=/<a\b([^>]*?href=["'][^"']*#entity\/([^"'#?]+)[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
 while((match=anchorRe.exec(html))){
  const attrs=match[1]||'',inner=match[3]||'';
  const name=attrs.match(/data-entity-name=["']([^"']+)["']/i)?.[1]||attrs.match(/aria-label=["']([^"']+)["']/i)?.[1]||attrs.match(/title=["']([^"']+)["']/i)?.[1]||inner;
  const id=attrs.match(/data-entity-id=["']([^"']+)["']/i)?.[1]||'';
  add(match[2],name,id);
 }
 const dataRe=/data-entity-slug=["']([^"']+)["'][^>]{0,500}?data-entity-name=["']([^"']+)["'][^>]*>/gi;
 while((match=dataRe.exec(html))){
  const tag=match[0],id=tag.match(/data-entity-id=["']([^"']+)["']/i)?.[1]||'';
  add(match[1],match[2],id);
 }
 return [...bySlug.values()].sort((a,b)=>a.name.localeCompare(b.name));
}

function extractPushedArray(source){
 const marker='window.__ARCHIVE_ENTITIES=window.__ARCHIVE_ENTITIES||[];window.__ARCHIVE_ENTITIES.push(...[';
 const start=source.indexOf(marker);
 if(start<0)throw new Error('archive entity payload marker missing');
 const open=start+marker.length-1;
 let depth=0,inString=false,escaped=false;
 for(let i=open;i<source.length;i++){
  const ch=source[i];
  if(inString){
   if(escaped)escaped=false;
   else if(ch==='\\')escaped=true;
   else if(ch==='"')inString=false;
   continue;
  }
  if(ch==='"'){inString=true;continue}
  if(ch==='[')depth++;
  else if(ch===']'){
   depth--;
   if(depth===0)return JSON.parse(source.slice(open,i+1));
  }
 }
 throw new Error('archive entity payload end missing');
}

async function loadArchiveEntities(){
 const files=['archive-entities-01.js','archive-entities-02.js','archive-entities-03.js','archive-entities-04.js','archive-entities-05.js'];
 const local=[];
 for(const file of files){
  try{local.push(...extractPushedArray(fs.readFileSync(path.join(process.cwd(),file),'utf8')))}catch{}
 }
 if(local.length)return local;
 const ref=process.env.VERCEL_GIT_COMMIT_SHA||process.env.VERCEL_GIT_COMMIT_REF||'main';
 const remote=await Promise.all(files.map(async file=>{
  const raw=`https://raw.githubusercontent.com/nikbone1998/the-paranormal-wiki/${encodeURIComponent(ref)}/${file}`;
  const response=await fetch(raw,{headers:{'User-Agent':'the-paranormal-wiki-forum-index'}});
  if(!response.ok)throw new Error(`archive source returned ${response.status} for ${file}`);
  return extractPushedArray(await response.text());
 }));
 return remote.flat();
}

function send(res,status,body){
 res.statusCode=status;
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control',status===200?'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800':'no-store');
 res.end(JSON.stringify(body));
}

module.exports=async function forumEntities(req,res){
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return send(res,405,{error:'method_not_allowed'});
 }
 try{
  if(!cached){
   const entities=await loadArchiveEntities();
   const entries=entities.map(entity=>({id:normalize(entity.id),name:normalize(entity.name),slug:cleanSlug(entity.slug)})).filter(entry=>entry.id&&entry.name&&entry.slug);
   if(entries.length!==EXPECTED_ENTRIES)throw new Error(`canonical entity extraction returned ${entries.length} routes; expected exactly ${EXPECTED_ENTRIES}`);
   cached={count:entries.length,entries};
  }
  return send(res,200,cached);
 }catch(error){
  console.error('Forum canonical entity index error',error);
  return send(res,503,{error:'canonical_entity_index_unavailable'});
 }
};
