/* THE PARANORMAL WIKI — Earth regional tile transport shim.
 * Rewrites only the NASA GIBS Landsat WMTS image URLs used by the Earth renderer.
 */
(()=>{
 'use strict';
 if(window.__paranormalWikiEarthTileShim)return;
 const proto=window.HTMLImageElement?.prototype;
 const desc=proto&&Object.getOwnPropertyDescriptor(proto,'src');
 if(!desc?.get||!desc?.set)return;
 const pattern=/^https:\/\/gibs\.earthdata\.nasa\.gov\/wmts\/epsg3857\/(?:best|all)\/Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual\/default\/2010-12-01\/GoogleMapsCompatible_Level12\/(\d+)\/(\d+)\/(\d+)\.jpg(?:\?.*)?$/;
 Object.defineProperty(proto,'src',{
  configurable:desc.configurable!==false,
  enumerable:desc.enumerable,
  get:desc.get,
  set(value){
   let next=value;
   if(typeof value==='string'){
    const match=value.match(pattern);
    if(match){
     const [,z,y,x]=match;
     next=`/api/earth-tile?z=${encodeURIComponent(z)}&x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`;
    }
   }
   return desc.set.call(this,next);
  }
 });
 window.__paranormalWikiEarthTileShim=true;
})();

import('./paranormal-earth-engine-v4.js?v=4.0.1-tileproxy');
