const LAYER='Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual';
const TIME='2010-12-01';
const MATRIX='GoogleMapsCompatible_Level12';
const MAX_ZOOM=12;

function sendJson(res,status,body){
 res.statusCode=status;
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.end(JSON.stringify(body));
}

function int(value){
 const n=Number(value);
 return Number.isInteger(n)?n:null;
}

module.exports=async function earthTile(req,res){
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return sendJson(res,405,{error:'method_not_allowed'});
 }

 const z=int(req.query?.z),x=int(req.query?.x),y=int(req.query?.y);
 if(z===null||x===null||y===null||z<0||z>MAX_ZOOM){
  return sendJson(res,400,{error:'invalid_tile'});
 }
 const n=2**z;
 if(x<0||x>=n||y<0||y>=n)return sendJson(res,400,{error:'invalid_tile'});

 const paths=[
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${LAYER}/default/${TIME}/${MATRIX}/${z}/${y}/${x}.jpg`,
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/all/${LAYER}/default/${TIME}/${MATRIX}/${z}/${y}/${x}.jpg`
 ];

 let lastStatus=502;
 try{
  for(const url of paths){
   const upstream=await fetch(url,{
    method:'GET',
    headers:{Accept:'image/jpeg,image/*;q=0.9,*/*;q=0.5','User-Agent':'TheParanormalWiki-EarthRenderer/4.1'}
   });
   lastStatus=upstream.status;
   const type=upstream.headers.get('content-type')||'';
   if(!upstream.ok||!type.toLowerCase().startsWith('image/'))continue;
   const bytes=Buffer.from(await upstream.arrayBuffer());
   if(!bytes.length)continue;
   res.statusCode=200;
   res.setHeader('Content-Type',type.includes('jpeg')?'image/jpeg':type);
   res.setHeader('Content-Length',String(bytes.length));
   res.setHeader('Cache-Control','public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
   res.setHeader('X-Earth-Tile-Source','NASA-GIBS-Landsat-WELD');
   return res.end(bytes);
  }
  return sendJson(res,502,{error:'tile_upstream_failed',status:lastStatus,z,x,y});
 }catch(error){
  console.error('Earth tile proxy error',{z,x,y,error:String(error?.message||error)});
  return sendJson(res,502,{error:'tile_proxy_error',z,x,y});
 }
};
