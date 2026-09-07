/* THE PARANORMAL WIKI — Earth regional imagery transport shim.
 * Rewrites only the legacy NASA GIBS Landsat requests emitted by Earth v4.
 * The same-origin endpoint currently serves the validated Sentinel-2 Cloudless 2016 mosaic.
 */
(()=>{
 'use strict';
 if(window.__paranormalWikiEarthTileShim)return;

 const proto=window.HTMLImageElement?.prototype;
 const desc=proto&&Object.getOwnPropertyDescriptor(proto,'src');
 const gibs=/^https:\/\/gibs\.earthdata\.nasa\.gov\/wmts\/epsg3857\/(?:best|all)\/Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual\/default\/2010-12-01\/GoogleMapsCompatible_Level12\/(\d+)\/(\d+)\/(\d+)\.jpg(?:\?.*)?$/;

 if(desc?.get&&desc?.set){
  Object.defineProperty(proto,'src',{
   configurable:desc.configurable!==false,
   enumerable:desc.enumerable,
   get:desc.get,
   set(value){
    let next=value;
    if(typeof value==='string'){
     const match=value.match(gibs);
     if(match){
      const [,z,y,x]=match;
      next=`/api/earth-tile?z=${encodeURIComponent(z)}&x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`;
     }
    }
    return desc.set.call(this,next);
   }
  });
 }

 function addCredit(root){
  if(!root||root.querySelector('.ua-earth-imagery-credit'))return;
  const credit=document.createElement('div');
  credit.className='ua-earth-imagery-credit';
  credit.setAttribute('aria-label','Earth imagery attribution');
  credit.style.cssText='position:absolute;z-index:11;right:5px;bottom:4px;max-width:72%;padding:2px 4px;border:1px dotted #333;background:rgba(0,0,0,.72);color:#777;font:7px/1.25 "Courier New",monospace;text-align:right;pointer-events:auto';
  credit.innerHTML='IMAGERY: <a href="https://s2maps.eu" target="_blank" rel="noopener noreferrer" style="color:#8a8aaa">Sentinel-2 cloudless 2016 / EOX</a> · modified Copernicus Sentinel data 2016 &amp; 2017';
  root.appendChild(credit);
 }

 function scan(){document.querySelectorAll('[data-unseen-earth]').forEach(addCredit);}
 scan();
 const observer=new MutationObserver(scan);
 observer.observe(document.documentElement,{childList:true,subtree:true});
 addEventListener('pagehide',()=>observer.disconnect(),{once:true});
 window.__paranormalWikiEarthTileShim=true;
})();

import('./paranormal-earth-engine-v4.js?v=4.0.1-tileproxy');
