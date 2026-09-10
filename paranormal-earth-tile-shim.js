/* THE PARANORMAL WIKI — Earth regional imagery transport shim.
 * Rewrites only the legacy NASA GIBS Landsat requests emitted by Earth v4.
 * Uses a per-image wrapper instead of redefining HTMLImageElement.prototype.src,
 * which can abort module startup on iPhone Safari.
 */
(()=>{
 'use strict';
 if(window.__paranormalWikiEarthTileShim)return;

 const NativeImage=window.Image;
 const proto=window.HTMLImageElement?.prototype;
 const srcDescriptor=proto&&Object.getOwnPropertyDescriptor(proto,'src');
 const gibs=/^https:\/\/gibs\.earthdata\.nasa\.gov\/wmts\/epsg3857\/(?:best|all)\/Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual\/default\/2010-12-01\/GoogleMapsCompatible_Level12\/(\d+)\/(\d+)\/(\d+)\.jpg(?:\?.*)?$/;

 function rewriteEarthTile(value){
  if(typeof value!=='string')return value;
  const match=value.match(gibs);
  if(!match)return value;
  const [,z,y,x]=match;
  return `/api/earth-tile?z=${encodeURIComponent(z)}&x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`;
 }

 // Do not touch HTMLImageElement.prototype. Safari may expose its src accessor as
 // non-configurable; attempting to redefine it can stop this module before Earth loads.
 // Instead, wrap only Image() instances created after this shim loads. If Safari rejects
 // the instance-level accessor for any reason, return the native image untouched so the
 // globe still starts rather than failing closed.
 if(typeof NativeImage==='function'&&srcDescriptor?.get&&srcDescriptor?.set){
  function EarthImage(width,height){
   const image=new NativeImage(width,height);
   try{
    Object.defineProperty(image,'src',{
     configurable:true,
     enumerable:srcDescriptor.enumerable,
     get(){return srcDescriptor.get.call(image);},
     set(value){return srcDescriptor.set.call(image,rewriteEarthTile(value));}
    });
   }catch(error){
    console.info('[PARANORMAL WIKI EARTH] safe tile interception unavailable; native image transport retained',error?.message||error);
   }
   return image;
  }
  try{
   EarthImage.prototype=NativeImage.prototype;
   window.Image=EarthImage;
  }catch(error){
   console.info('[PARANORMAL WIKI EARTH] Image wrapper unavailable; native image transport retained',error?.message||error);
  }
 }

 function addCredit(root){
  if(!root||root.querySelector('.ua-earth-imagery-credit'))return;
  const credit=document.createElement('div');
  credit.className='ua-earth-imagery-credit';
  credit.setAttribute('aria-label','Earth imagery attribution');
  credit.style.cssText='position:absolute;z-index:11;right:5px;bottom:4px;max-width:78%;padding:2px 4px;border:1px dotted #333;background:rgba(0,0,0,.72);color:#777;font:7px/1.25 "Courier New",monospace;text-align:right;pointer-events:auto';
  credit.innerHTML='IMAGERY: <a href="https://cloudless.eox.at" target="_blank" rel="noopener noreferrer" style="color:#8a8aaa">EOxCloudless</a> by EOX IT Services GmbH · Contains modified Copernicus Sentinel data 2016 &amp; 2017';
  root.appendChild(credit);
 }

 function scan(){document.querySelectorAll('[data-unseen-earth]').forEach(addCredit);}
 scan();
 const observer=new MutationObserver(scan);
 observer.observe(document.documentElement,{childList:true,subtree:true});
 addEventListener('pagehide',()=>observer.disconnect(),{once:true});
 window.__paranormalWikiEarthTileShim=true;
})();

import('./paranormal-earth-engine-v4.js?v=4.0.4-marker-stability');
