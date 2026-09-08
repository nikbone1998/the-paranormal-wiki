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

async function loadArchiveHtml(){
 const local=path.join(process.cwd(),'index.html');
 try{return fs.readFileSync(local,'utf8')}catch{}
 const ref=process.env.VERCEL_GIT_COMMIT_SHA||process.env.VERCEL_GIT_COMMIT_REF||'main';
 const raw=`https://raw.githubusercontent.com/nikbone1998/the-paranormal-wiki/${encodeURIComponent(ref)}/index.html`;
 const response=await fetch(raw,{headers:{'User-Agent':'the-paranormal-wiki-forum-index'}});
 if(!response.ok)throw new Error(`archive source returned ${response.status}`);
 return response.text();
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
   const html=await loadArchiveHtml();
   const entries=extractCanonicalEntities(html);
   if(entries.length!==EXPECTED_ENTRIES)throw new Error(`canonical entity extraction returned ${entries.length} routes; expected exactly ${EXPECTED_ENTRIES}`);
   cached={count:entries.length,entries};
  }
  return send(res,200,cached);
 }catch(error){
  console.error('Forum canonical entity index error',error);
  return send(res,503,{error:'canonical_entity_index_unavailable'});
 }
};
