const NASA_LAYER='Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual';
const NASA_TIME='2010-12-01';
const NASA_MATRIX='GoogleMapsCompatible_Level12';
const MAX_ZOOM=13;
const ORIGIN=20037508.342789244;
const WORLD=ORIGIN*2;
const MIN_USEFUL_BYTES=2000;

function sendJson(res,status,body){
 res.statusCode=status;
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.end(JSON.stringify(body));
}
function int(value){const n=Number(value);return Number.isInteger(n)?n:null;}
function tileBbox(z,x,y){const span=WORLD/(2**z),minX=-ORIGIN+x*span,maxX=minX+span,maxY=ORIGIN-y*span,minY=maxY-span;return [minX,minY,maxX,maxY];}
async function imageResponse(url){
 const upstream=await fetch(url,{method:'GET',headers:{Accept:'image/jpeg,image/png,image/*;q=0.9,*/*;q=0.5','User-Agent':'TheParanormalWiki-EarthRenderer/4.1'}});
 const type=upstream.headers.get('content-type')||'';
 if(!upstream.ok||!type.toLowerCase().startsWith('image/'))return {ok:false,status:upstream.status,type,bytes:null};
 const bytes=Buffer.from(await upstream.arrayBuffer());
 if(bytes.length<MIN_USEFUL_BYTES)return {ok:false,status:upstream.status,type,bytes};
 return {ok:true,status:upstream.status,type,bytes};
}

module.exports=async function earthTile(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return sendJson(res,405,{error:'method_not_allowed'});}
 const z=int(req.query?.z),x=int(req.query?.x),y=int(req.query?.y);
 if(z===null||x===null||y===null||z<0||z>MAX_ZOOM)return sendJson(res,400,{error:'invalid_tile'});
 const n=2**z;if(x<0||x>=n||y<0||y>=n)return sendJson(res,400,{error:'invalid_tile'});

 const bbox=tileBbox(z,x,y).join(',');
 const nasaWms=new URL('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi');
 nasaWms.search=new URLSearchParams({service:'WMS',request:'GetMap',version:'1.1.1',layers:NASA_LAYER,styles:'default',format:'image/jpeg',transparent:'false',srs:'EPSG:3857',width:'256',height:'256',time:NASA_TIME,bbox}).toString();

 const sources=[
  {name:'EOX-SENTINEL2-CLOUDLESS-2016',url:`https://e.tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/${z}/${y}/${x}.jpg`},
  {name:'NASA-GIBS-WMS',url:nasaWms.toString()},
  {name:'NASA-GIBS-WMTS-BEST',url:`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${NASA_LAYER}/default/${NASA_TIME}/${NASA_MATRIX}/${z}/${y}/${x}.jpg`}
 ];

 let last={status:502,type:'',bytes:null};
 try{
  for(const source of sources){
   const result=await imageResponse(source.url);last=result;
   if(!result.ok)continue;
   res.statusCode=200;
   res.setHeader('Content-Type',result.type.includes('jpeg')?'image/jpeg':result.type);
   res.setHeader('Content-Length',String(result.bytes.length));
   res.setHeader('Cache-Control','public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
   res.setHeader('X-Earth-Tile-Source',source.name);
   res.setHeader('X-Earth-Tile-Bytes',String(result.bytes.length));
   return res.end(result.bytes);
  }
  return sendJson(res,502,{error:'tile_upstream_failed',status:last.status,type:last.type,bytes:last.bytes?.length||0,z,x,y});
 }catch(error){
  console.error('Earth tile proxy error',{z,x,y,error:String(error?.message||error)});
  return sendJson(res,502,{error:'tile_proxy_error',z,x,y});
 }
};
