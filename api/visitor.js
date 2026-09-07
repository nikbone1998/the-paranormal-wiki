const COUNTER_KEY='the-paranormal-wiki:global-visits:v2';
const COUNTER_BASELINE=0;

function send(res,status,body){
 res.statusCode=status;
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.end(JSON.stringify(body));
}

module.exports=async function visitorCounter(req,res){
 if(req.method!=='GET'&&req.method!=='POST'){
  res.setHeader('Allow','GET, POST');
  return send(res,405,{error:'method_not_allowed'});
 }

 const redisUrl=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
 const redisToken=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
 if(!redisUrl||!redisToken)return send(res,503,{error:'counter_storage_unavailable'});

 const shouldIncrement=req.method==='POST';
 const script=[
  "local current = redis.call('GET', KEYS[1])",
  "if not current then redis.call('SET', KEYS[1], ARGV[1]); current = ARGV[1] end",
  "if ARGV[2] == '1' then return redis.call('INCR', KEYS[1]) end",
  'return tonumber(current)'
 ].join('\n');

 try{
  const upstream=await fetch(redisUrl.replace(/\/$/,''),{
   method:'POST',
   headers:{Authorization:`Bearer ${redisToken}`,'Content-Type':'application/json'},
   body:JSON.stringify(['EVAL',script,'1',COUNTER_KEY,String(COUNTER_BASELINE),shouldIncrement?'1':'0'])
  });
  if(!upstream.ok)throw new Error(`storage returned ${upstream.status}`);
  const payload=await upstream.json();
  const count=Number(payload.result);
  if(!Number.isSafeInteger(count)||count<COUNTER_BASELINE)throw new Error('storage returned an invalid count');
  return send(res,200,{count});
 }catch(error){
  console.error('Visitor counter storage error',error);
  return send(res,503,{error:'counter_temporarily_unavailable'});
 }
};
