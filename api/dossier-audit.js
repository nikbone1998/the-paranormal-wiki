const vm=require('vm');

const ARCHIVE_FILES=['archive-entities-01.js','archive-entities-02.js','archive-entities-03.js','archive-entities-04.js','archive-entities-05.js'];
const PLACEHOLDER=/^(?:empty|null|n\/a|no data|unknown|-|not entered|none)$/i;
const text=value=>String(value??'').replace(/\s+/g,' ').trim();
const meaningful=value=>{const valueText=text(value);return !!valueText&&!PLACEHOLDER.test(valueText)};
const hasDeep=(entity,pattern)=>(entity.deepSections||[]).some(section=>pattern.test(text(section&&section.title)+' '+(section&&section.paragraphs||[]).map(text).join(' ')));

async function loadEntities(req){
 const host=req.headers['x-forwarded-host']||req.headers.host;
 if(!host)throw new Error('request host unavailable');
 const proto=req.headers['x-forwarded-proto']||'https';
 const headers={Accept:'text/javascript'};
 if(req.headers.cookie)headers.Cookie=req.headers.cookie;
 if(req.headers.authorization)headers.Authorization=req.headers.authorization;
 if(req.headers['x-vercel-protection-bypass'])headers['x-vercel-protection-bypass']=req.headers['x-vercel-protection-bypass'];
 const sandbox={window:{__ARCHIVE_ENTITIES:[]}};
 vm.createContext(sandbox);
 for(const filename of ARCHIVE_FILES){
  const url=`${proto}://${host}/${filename}`;
  const response=await fetch(url,{headers,cache:'no-store'});
  if(!response.ok)throw new Error(`${filename} returned ${response.status}`);
  const source=await response.text();
  vm.runInContext(source,sandbox,{filename,timeout:10000});
 }
 return sandbox.window.__ARCHIVE_ENTITIES;
}

function coverage(entity){
 const timeline=(entity.timeline||[]).filter(row=>Array.isArray(row)&&meaningful(row[1]));
 const cases=(entity.caseFiles||[]).filter(item=>meaningful(item&&item.case)||meaningful(item&&item.notes)||meaningful(item&&item.evidence));
 const points=(entity.mapPoints||[]).filter(point=>meaningful(point&&point.label)||meaningful(point&&point.why));
 const deep=entity.deepSections||[];
 return {
  famousSightings:cases.length>0||points.length>0||timeline.length>0||hasDeep(entity,/sighting|report|case|encounter|incident|witness|appearance|episode|story|account|reception|literary/i)||meaningful(entity.history)||meaningful(entity.description),
  behavior:meaningful(entity.behaviorLong)||hasDeep(entity,/behavior|behaviour|hunt|stalk|attack|encounter|movement|nocturnal|mimic|communication|manifest|return|visit|territor/i)||meaningful(entity.description)||meaningful(entity.appearance),
  weaknesses:meaningful(entity.protection)||hasDeep(entity,/weakness|vulnerab|protection|ward|repel|banish|deterr|limit|avoid|iron|salt|sunlight|daylight|fire|water|prayer|ritual|sacred|talisman|amulet|iyi-uwa/i)||deep.length>0,
  culturalSignificance:meaningful(entity.culture)||hasDeep(entity,/cultur|religio|ritual|folklore|myth|tradition|literature|literary|film|television|symbol|identity|reception|festival|oral|belief/i)||meaningful(entity.history)||meaningful(entity.description),
  scientificExplanations:meaningful(entity.skeptical)||hasDeep(entity,/scient|skeptic|natural|psycholog|medical|misident|pareidolia|sleep|hallucin|memory|infrasound|atmospher|geolog|animal|camera|optical|astronom|weather|disease|fraud|hoax/i)||meaningful(entity.description),
  hoaxesAndControversies:meaningful(entity.controversy)||hasDeep(entity,/hoax|controvers|disput|debunk|fraud|misident|confession|forg|commercial|category error|source-control|standardiz|contradict|reception/i)||meaningful(entity.modern)||deep.length>0,
  reportFrequency:cases.length>0||points.length>0||timeline.length>0||Number.isFinite(Number(entity.rarity))||meaningful(entity.modern)||meaningful(entity.origin),
  geographicalOrigin:meaningful(entity.origin)||meaningful(entity.country)||(entity.locations||[]).some(meaningful)||points.length>0||hasDeep(entity,/geograph|region|location|range|distribution|origin|country/i)
 };
}

module.exports=async function dossierAudit(req,res){
 if(req.method!=='GET'){
  res.statusCode=405;res.setHeader('Allow','GET');res.end(JSON.stringify({error:'method_not_allowed'}));return;
 }
 try{
  const entities=await loadEntities(req);
  const fields=['famousSightings','behavior','weaknesses','culturalSignificance','scientificExplanations','hoaxesAndControversies','reportFrequency','geographicalOrigin'];
  const counts=Object.fromEntries(fields.map(field=>[field,0]));
  const missing=[];
  const ids=new Set(),slugs=new Set(),duplicateIds=[],duplicateSlugs=[];
  let withDeepSections=0,withSources=0,withCaseFiles=0,withMapPoints=0;
  let totalDeepSections=0,totalSources=0;
  const direct={behaviorLong:0,protection:0,culture:0,skeptical:0,controversy:0,origin:0};

  for(const entity of entities){
   const c=coverage(entity);const entityMissing=[];
   for(const field of fields){if(c[field])counts[field]++;else entityMissing.push(field)}
   if(entityMissing.length)missing.push({id:entity.id,slug:entity.slug,name:entity.name,missing:entityMissing});
   if(ids.has(entity.id))duplicateIds.push(entity.id);else ids.add(entity.id);
   if(slugs.has(entity.slug))duplicateSlugs.push(entity.slug);else slugs.add(entity.slug);
   if((entity.deepSections||[]).length){withDeepSections++;totalDeepSections+=(entity.deepSections||[]).length}
   if((entity.sources||[]).length){withSources++;totalSources+=(entity.sources||[]).length}
   if((entity.caseFiles||[]).length)withCaseFiles++;
   if((entity.mapPoints||[]).length)withMapPoints++;
   Object.keys(direct).forEach(key=>{if(meaningful(entity[key]))direct[key]++});
  }

  const body={
   generatedAt:new Date().toISOString(),
   totalEntities:entities.length,
   expectedEntities:913,
   entityCountPreserved:entities.length===913,
   duplicateIds,duplicateSlugs,
   recordsWithDeepSections:withDeepSections,
   totalDeepSections,
   recordsWithNamedSources:withSources,
   totalNamedSources:totalSources,
   recordsWithCaseFiles:withCaseFiles,
   recordsWithMapPoints:withMapPoints,
   directFieldPopulation:direct,
   repairInputCoverage:counts,
   allEightRepairInputsAvailable:missing.length===0,
   missingRepairInputs:missing.slice(0,100)
  };
  res.statusCode=200;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body,null,2));
 }catch(error){
  res.statusCode=500;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify({error:'audit_failed',message:error.message}));
 }
};
