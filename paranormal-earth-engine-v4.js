/* THE PARANORMAL WIKI — Earth Observation Engine v4
 * iPhone-first visibility + regional detail pass.
 * Earth rendering only. No paranormal/entity coordinates are loaded here.
 */
(function(){
'use strict';

const VERSION='4.0.0-iphone-observation';
const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
const EARTH_RADIUS_KM=6371.0088;
const TAU=Math.PI*2;
const mounted=new WeakMap();
let threePromise=null;

const ASSETS={
 day:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_atmos_2048.jpg',
 water:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_specular_2048.jpg',
 clouds:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_clouds_1024.png',
 night:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_lights_2048.png',
 nasaGlobal:'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg'
};
const LOD={
 layer:'Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual',time:'2010-12-01',matrix:'GoogleMapsCompatible_Level12',max:12,
 tile(z,x,y){return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${this.layer}/default/${this.time}/${this.matrix}/${z}/${y}/${x}.jpg`;},
 terrain(z,x,y){return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;}
};

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rad=d=>d*Math.PI/180;
const deg=r=>r*180/Math.PI;
const mod=(v,n)=>((v%n)+n)%n;
const wrap=a=>{while(a>Math.PI)a-=TAU;while(a<-Math.PI)a+=TAU;return a;};
const lerpExp=(a,b,k,dt)=>a+(b-a)*(1-Math.pow(k,dt));
const loadThree=()=>threePromise||(threePromise=import(THREE_URL));
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

function profile(){
 const mobile=matchMedia('(max-width:680px)').matches;
 const save=!!navigator.connection?.saveData;
 const mem=Number(navigator.deviceMemory||4),cores=Number(navigator.hardwareConcurrency||4);
 if(save)return {name:'DATA SAVER',tier:'SAVER',segments:64,dpr:1.2,maxLod:6,radius:1,cache:18,concurrency:2,terrain:false,globalWidth:2048};
 if(mobile)return {name:'ADAPTIVE / MOBILE',tier:'MOBILE',segments:96,dpr:1.65,maxLod:11,radius:2,cache:48,concurrency:4,terrain:true,globalWidth:4096};
 if(mem>=8&&cores>=6)return {name:'HIGH / DESKTOP',tier:'HIGH',segments:160,dpr:2,maxLod:12,radius:3,cache:84,concurrency:7,terrain:true,globalWidth:5400};
 return {name:'ADAPTIVE / DESKTOP',tier:'ADAPTIVE',segments:128,dpr:1.8,maxLod:11,radius:2,cache:60,concurrency:5,terrain:true,globalWidth:4096};
}

function solar(THREE,date=new Date()){
 const start=Date.UTC(date.getUTCFullYear(),0,0),now=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
 const n=Math.floor((now-start)/86400000),h=date.getUTCHours()+date.getUTCMinutes()/60+date.getUTCSeconds()/3600;
 const decl=23.44*Math.sin((TAU/365)*(n-81)),lon=180-h*15,dr=rad(decl),lr=rad(lon);
 return {date,decl,lon,dir:new THREE.Vector3(Math.cos(dr)*Math.cos(lr),Math.sin(dr),-Math.cos(dr)*Math.sin(lr)).normalize()};
}
function latLonVec(THREE,lat,lon,r=1){const la=rad(lat),lo=rad(lon),c=Math.cos(la);return new THREE.Vector3(c*Math.cos(lo)*r,Math.sin(la)*r,-c*Math.sin(lo)*r);}
function vecLatLon(v){const r=v.length()||1;return {lat:deg(Math.asin(clamp(v.y/r,-1,1))),lon:deg(Math.atan2(-v.z,v.x))};}
function lonLatTile(lon,lat,z){const n=2**z,l=rad(clamp(lat,-85.05112878,85.05112878));return {x:mod(Math.floor((lon+180)/360*n),n),y:clamp(Math.floor((1-Math.asinh(Math.tan(l))/Math.PI)/2*n),0,n-1)};}
function tileLat(y,z){return deg(Math.atan(Math.sinh(Math.PI*(1-2*y/(2**z)))));}
function tileLon(x,z){return x/(2**z)*360-180;}

function ensureUi(root){
 if(root.querySelector('.ua-observation-panel'))return;
 const panel=document.createElement('div');panel.className='ua-observation-panel';panel.setAttribute('aria-label','Earth observation controls');
 panel.innerHTML=`<div class="ua-observation-title">THE PARANORMAL WIKI // GLOBAL OBSERVATION SYSTEM</div>
 <div class="ua-observation-buttons">
  <button type="button" class="ua-globe-btn" data-earth-toggle="clouds">[ CLOUDS: ON ]</button>
  <button type="button" class="ua-globe-btn" data-earth-toggle="lights">[ CITY LIGHTS: ON ]</button>
  <button type="button" class="ua-globe-btn" data-earth-toggle="atmosphere">[ ATMOSPHERE: ON ]</button>
  <button type="button" class="ua-globe-btn" data-earth-toggle="realtime">[ REAL-TIME SUN: OFF ]</button>
  <button type="button" class="ua-globe-btn" data-earth-detail-view>[ SURFACE DETAIL ]</button>
  <button type="button" class="ua-globe-btn" data-earth-observation-reset>[ RESET VIEW ]</button>
  <button type="button" class="ua-globe-btn" data-earth-observation-close>[ CLOSE ]</button>
 </div>
 <div class="ua-observation-diagnostics mono">
  ILLUMINATION: <span data-earth-illum>OBSERVATION</span><br>
  UTC: <span data-earth-utc>--</span><br>
  APPROX. SUBSOLAR LON: <span data-earth-sunlon>--</span> · DECL: <span data-earth-decl>--</span><br>
  APPROX. ALTITUDE: <span data-earth-altitude>--</span><br>
  SURFACE LOD: <span data-earth-lod>GLOBAL</span> · ACTIVE TILES: <span data-earth-tiles>0</span><br>
  REGIONAL DETAIL: <span data-earth-detail>STANDBY</span><br>
  RENDER: <span data-earth-render>--</span> · FPS: <span data-earth-fps>--</span>
 </div>
 <div class="ua-observation-note">OBSERVATION LIGHT IS DEFAULT FOR VISIBILITY // REAL-TIME SUN OPTIONAL // ENTITY LAYER STANDBY</div>`;
 root.appendChild(panel);
 const boot=document.createElement('div');boot.className='ua-observation-boot';boot.innerHTML='<div><b>THE PARANORMAL WIKI</b><br>GLOBAL OBSERVATION SYSTEM<br><br>GEOSPHERE LINK ........ ONLINE<br>DISPLAY ILLUMINATION .. READY<br>REGIONAL IMAGERY ...... STANDBY<br>ARCHIVE ENTITY LAYER .. STANDBY</div>';root.appendChild(boot);
}

async function mount(root){
 if(mounted.has(root))return mounted.get(root);
 root.dataset.earthVersion=VERSION;ensureUi(root);
 const canvas=root.querySelector('.ua-globe-canvas'),fallback=root.querySelector('.ua-globe-fallback'),starsCanvas=root.querySelector('.ua-globe-stars');
 const resetBtn=root.querySelector('[data-globe-reset]'),fsBtn=root.querySelector('[data-globe-fullscreen]'),qualityNode=root.querySelector('.ua-globe-quality');
 if(!canvas)throw new Error('Earth canvas missing');if(starsCanvas)starsCanvas.style.display='none';
 if(fallback&&!fallback.getAttribute('src')){fallback.src=ASSETS.nasaGlobal;fallback.setAttribute('data-fallback-source','NASA global surface image');}
 const p=profile();if(qualityNode)qualityNode.textContent=p.name+' · STARTING';
 const d={illum:root.querySelector('[data-earth-illum]'),utc:root.querySelector('[data-earth-utc]'),lon:root.querySelector('[data-earth-sunlon]'),decl:root.querySelector('[data-earth-decl]'),alt:root.querySelector('[data-earth-altitude]'),lod:root.querySelector('[data-earth-lod]'),tiles:root.querySelector('[data-earth-tiles]'),detail:root.querySelector('[data-earth-detail]'),render:root.querySelector('[data-earth-render]'),fps:root.querySelector('[data-earth-fps]')};
 const clean=[];let disposed=false,raf=0,inView=true,visible=!document.hidden,pseudo=false,last=performance.now(),lastDiag=0,lastSun=0,lastLod=0,frames=0,fps=0,fpsStart=performance.now();
 let THREE,renderer,scene,camera,earth,clouds,atmos,stars,surfaceU,cloudU,atmoU,astro;
 const overlays=new Set();
 const state={clouds:true,lights:true,atmosphere:true,realtime:false};
 let az=rad(25),el=rad(13),dist=2.9,tAz=az,tEl=el,tDist=dist,vAz=0,vEl=0,lastMove=performance.now(),cloudOff=0,globalLabel='2K GLOBAL';
 const pointers=new Map();let dragId=null,lastX=0,lastY=0,lastPinch=0,lastTouchPinch=0;
 const on=(el,type,fn,opt)=>{if(!el)return;el.addEventListener(type,fn,opt);clean.push(()=>el.removeEventListener(type,fn,opt));};
 const isFull=()=>document.fullscreenElement===root||pseudo;
 const minDist=()=>1+(isFull()?120:250)/EARTH_RADIUS_KM;
 const capDist=v=>clamp(v,minDist(),5.2);
 const markMove=()=>{lastMove=performance.now();};

 function setFallback(err){console.warn('[PARANORMAL WIKI EARTH]',err);root.classList.remove('ua-ready');root.classList.add('ua-fallback');if(fallback)fallback.style.opacity='1';}
 function setReady(){root.classList.remove('ua-fallback');root.classList.add('ua-ready');}
 function resetView(){tAz=rad(25);tEl=rad(13);tDist=2.9;vAz=vEl=0;markMove();}
 function detailView(){const center=camera?vecLatLon(camera.position):{lat:13,lon:25};tEl=rad(clamp(center.lat,-75,75));tAz=wrap(rad(center.lon));tDist=capDist(1+650/EARTH_RADIUS_KM);vAz=vEl=0;markMove();}
 async function enterFull(){try{if(root.requestFullscreen)await root.requestFullscreen();else throw new Error();}catch(_){pseudo=true;root.classList.add('ua-pseudo-fullscreen','ua-observation-mode');document.body.classList.add('ua-earth-lock');root.style.touchAction='none';}root.classList.add('ua-observation-mode','ua-observation-booting');setTimeout(()=>root.classList.remove('ua-observation-booting'),reduced()?80:600);resize();}
 async function leaveFull(){try{if(document.fullscreenElement===root)await document.exitFullscreen();}catch(_){}pseudo=false;root.classList.remove('ua-pseudo-fullscreen','ua-observation-mode');document.body.classList.remove('ua-earth-lock');root.style.touchAction='pan-y';resize();}
 function toggleFull(){isFull()?leaveFull():enterFull();}
 function updateFs(){if(fsBtn)fsBtn.textContent=isFull()?'[ CLOSE FULL EARTH VIEW ]':'[ OPEN FULL EARTH VIEW ]';}
 function labels(){root.querySelectorAll('[data-earth-toggle]').forEach(b=>{const k=b.dataset.earthToggle,n={clouds:'CLOUDS',lights:'CITY LIGHTS',atmosphere:'ATMOSPHERE',realtime:'REAL-TIME SUN'};b.textContent=`[ ${n[k]}: ${state[k]?'ON':'OFF'} ]`;});}
 function toggle(k){state[k]=!state[k];if(k==='clouds'&&clouds)clouds.visible=state.clouds;if(k==='atmosphere'&&atmos)atmos.visible=state.atmosphere;if(k==='lights'&&surfaceU)surfaceU.uLights.value=state.lights?1:0;labels();markMove();}

 on(resetBtn,'click',resetView);on(fsBtn,'click',toggleFull);on(root.querySelector('[data-earth-observation-reset]'),'click',resetView);on(root.querySelector('[data-earth-observation-close]'),'click',leaveFull);on(root.querySelector('[data-earth-detail-view]'),'click',detailView);root.querySelectorAll('[data-earth-toggle]').forEach(b=>on(b,'click',()=>toggle(b.dataset.earthToggle)));
 on(document,'fullscreenchange',()=>{const active=document.fullscreenElement===root;root.classList.toggle('ua-observation-mode',active||pseudo);root.style.touchAction=(active||pseudo)?'none':'pan-y';updateFs();resize();});
 on(document,'visibilitychange',()=>{visible=!document.hidden;if(visible)requestFrame();});
 on(root,'wheel',e=>{e.preventDefault();const a=Math.max(.004,tDist-1);tDist=capDist(1+a*Math.exp(clamp(e.deltaY,-120,120)*.0016));markMove();},{passive:false});
 on(root,'keydown',e=>{const alt=Math.max(1,(tDist-1)*EARTH_RADIUS_KM),s=.075*clamp(alt/6500,.04,1);if(e.key==='ArrowLeft')tAz-=s;else if(e.key==='ArrowRight')tAz+=s;else if(e.key==='ArrowUp')tEl=clamp(tEl+s,-1.45,1.45);else if(e.key==='ArrowDown')tEl=clamp(tEl-s,-1.45,1.45);else if(e.key==='+'||e.key==='=')tDist=capDist(1+(tDist-1)*.72);else if(e.key==='-'||e.key==='_')tDist=capDist(1+(tDist-1)*1.30);else return;e.preventDefault();markMove();});

 const pinch=()=>{const a=[...pointers.values()];return a.length<2?0:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);};
 on(root,'pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});root.setPointerCapture?.(e.pointerId);markMove();if(pointers.size===1){dragId=e.pointerId;lastX=e.clientX;lastY=e.clientY;root.classList.add('ua-dragging');}else{dragId=null;lastPinch=pinch();}},{passive:true});
 on(root,'pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});markMove();if(pointers.size>=2){const pd=pinch();if(lastPinch&&pd){const ratio=lastPinch/pd;tDist=capDist(1+Math.max(.004,tDist-1)*ratio);}lastPinch=pd;return;}if(dragId===e.pointerId){const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;const alt=Math.max(1,(tDist-1)*EARTH_RADIUS_KM),s=clamp(alt/6500,.03,1);tAz-=dx*.006*s;tEl=clamp(tEl+dy*.005*s,-1.45,1.45);vAz=-dx*.00045*s;vEl=dy*.00038*s;}},{passive:true});
 const end=e=>{pointers.delete(e.pointerId);if(e.pointerId===dragId)dragId=null;if(pointers.size<2)lastPinch=0;if(!pointers.size)root.classList.remove('ua-dragging');markMove();};on(root,'pointerup',end);on(root,'pointercancel',end);on(root,'lostpointercapture',end);
 on(root,'touchstart',e=>{if(e.touches.length===2){lastTouchPinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(isFull())e.preventDefault();}},{passive:false});
 on(root,'touchmove',e=>{if(e.touches.length===2){const q=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(lastTouchPinch&&q){tDist=capDist(1+Math.max(.004,tDist-1)*(lastTouchPinch/q));}lastTouchPinch=q;markMove();if(isFull())e.preventDefault();}},{passive:false});
 on(root,'touchend',()=>{lastTouchPinch=0;},{passive:true});

 try{
  THREE=await loadThree();if(disposed)return;
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping||THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=p.tier==='MOBILE'?1.22:1.16;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(32,1,.001,80);astro=solar(THREE);
  const loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');const maxAniso=renderer.capabilities.getMaxAnisotropy();
  const loadTex=(url,color=false)=>new Promise((resolve,reject)=>loader.load(url,t=>{if(color)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(maxAniso,p.tier==='MOBILE'?6:10);t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;resolve(t);},undefined,reject));
  const base=await Promise.allSettled([loadTex(ASSETS.day,true),loadTex(ASSETS.water),loadTex(ASSETS.clouds,true),loadTex(ASSETS.night,true)]);if(disposed)return;
  const [day,water,cloud,night]=base.map(x=>x.status==='fulfilled'?x.value:null);if(!day)throw new Error('base Earth texture unavailable');
  const neutral=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat);neutral.needsUpdate=true;
  const geo=new THREE.SphereGeometry(1,p.segments,p.segments);
  surfaceU={tDay:{value:day},tWater:{value:water||neutral},tNight:{value:night||neutral},uLightDir:{value:new THREE.Vector3(1,0,0)},uCam:{value:new THREE.Vector3()},uLights:{value:1}};
  const surfaceMat=new THREE.ShaderMaterial({uniforms:surfaceU,vertexShader:`varying vec2 vUv;varying vec3 vN;varying vec3 vP;void main(){vUv=uv;vN=normalize(mat3(modelMatrix)*normal);vec4 wp=modelMatrix*vec4(position,1.0);vP=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
   fragmentShader:`precision highp float;uniform sampler2D tDay;uniform sampler2D tWater;uniform sampler2D tNight;uniform vec3 uLightDir;uniform vec3 uCam;uniform float uLights;varying vec2 vUv;varying vec3 vN;varying vec3 vP;float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}void main(){vec3 N=normalize(vN),L=normalize(uLightDir),V=normalize(uCam-vP);float ndl=dot(N,L),gate=smoothstep(-.16,.18,ndl),diff=pow(max(ndl,0.0),.40);vec3 day=texture2D(tDay,vUv).rgb;float water=smoothstep(.18,.58,lum(texture2D(tWater,vUv).rgb));float illum=.018+gate*(.50+1.06*diff);vec3 col=day*illum;vec3 H=normalize(L+V);float glint=pow(max(dot(N,H),0.0),210.0)*water*smoothstep(.10,.34,ndl);col+=vec3(.72,.86,1.0)*glint*.16;vec3 n=texture2D(tNight,vUv).rgb;float dark=1.0-smoothstep(-.17,.10,ndl);col+=mix(n,n*vec3(1.18,.84,.56),.45)*dark*uLights*.78;float fres=pow(1.0-max(dot(N,V),0.0),4.2)*water*gate;col+=vec3(.02,.10,.18)*fres*.20;gl_FragColor=vec4(col,1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
  earth=new THREE.Mesh(geo,surfaceMat);scene.add(earth);

  if(cloud){cloudU={tCloud:{value:cloud},uLightDir:{value:new THREE.Vector3(1,0,0)},uOff:{value:0}};const m=new THREE.ShaderMaterial({uniforms:cloudU,transparent:true,depthWrite:false,vertexShader:`varying vec2 vUv;varying vec3 vN;void main(){vUv=uv;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`precision mediump float;uniform sampler2D tCloud;uniform vec3 uLightDir;uniform float uOff;varying vec2 vUv;varying vec3 vN;float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}void main(){vec4 s=texture2D(tCloud,vec2(fract(vUv.x+uOff),vUv.y));float mask=clamp(min(lum(s.rgb),s.a),0.0,1.0);float lit=.18+.82*smoothstep(-.22,.32,dot(normalize(vN),normalize(uLightDir)));gl_FragColor=vec4(mix(vec3(.20,.24,.31),vec3(1.0),lit),pow(mask,1.15)*(.045+.29*lit));
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});clouds=new THREE.Mesh(new THREE.SphereGeometry(1.004,p.segments,p.segments),m);scene.add(clouds);}
  atmoU={uLightDir:{value:new THREE.Vector3(1,0,0)},uCam:{value:new THREE.Vector3()}};const am=new THREE.ShaderMaterial({uniforms:atmoU,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,vertexShader:`varying vec3 vN;varying vec3 vP;void main(){vN=normalize(mat3(modelMatrix)*normal);vec4 wp=modelMatrix*vec4(position,1.0);vP=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,fragmentShader:`precision mediump float;uniform vec3 uLightDir;uniform vec3 uCam;varying vec3 vN;varying vec3 vP;void main(){vec3 N=normalize(vN),V=normalize(uCam-vP),L=normalize(uLightDir);float rim=pow(1.0-max(dot(N,V),0.0),5.1),sun=smoothstep(-.25,.28,dot(N,L));vec3 c=mix(vec3(.025,.12,.48),vec3(.12,.64,1.0),sun);gl_FragColor=vec4(c*rim*(.15+.70*sun),rim*(.025+.34*sun));}`});atmos=new THREE.Mesh(new THREE.SphereGeometry(1.019,p.segments,p.segments),am);scene.add(atmos);

  const sg=new THREE.BufferGeometry(),pts=[];for(let i=0;i<(p.tier==='MOBILE'?520:1100);i++){const r=8+Math.random()*22,u=Math.random()*2-1,a=Math.random()*TAU,q=Math.sqrt(1-u*u);pts.push(r*q*Math.cos(a),r*u,r*q*Math.sin(a));}sg.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));stars=new THREE.Points(sg,new THREE.PointsMaterial({color:0xffffff,size:.016,transparent:true,opacity:.55,depthWrite:false}));scene.add(stars);

  const lodGroup=new THREE.Group();scene.add(lodGroup);const cache=new Map(),queue=[],pending=new Set();let running=0,lodLevel=0,lodState='GLOBAL',tileErrors=0;
  const tileVS=`varying vec2 vUv;varying vec3 vN;void main(){vUv=uv;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
  const tileFS=`precision mediump float;uniform sampler2D tMap;uniform vec3 uLightDir;uniform float uOpacity;varying vec2 vUv;varying vec3 vN;void main(){float ndl=dot(normalize(vN),normalize(uLightDir)),gate=smoothstep(-.15,.16,ndl),diff=pow(max(ndl,0.0),.42);vec3 c=texture2D(tMap,vUv).rgb*(.05+gate*(.48+1.02*diff));gl_FragColor=vec4(c,uOpacity*gate);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
  function image(url){return new Promise((res,rej)=>{const im=new Image();im.crossOrigin='anonymous';im.decoding='async';im.onload=()=>res(im);im.onerror=rej;im.src=url;});}
  function geometry(z,x,y,elev){const seg=p.tier==='MOBILE'?18:24,pos=[],uv=[],idx=[],baseR=1.00016;for(let iy=0;iy<=seg;iy++){const fy=iy/seg,lat=tileLat(y+fy,z);for(let ix=0;ix<=seg;ix++){const fx=ix/seg,lon=tileLon(x+fx,z);let e=0;if(elev){const px=clamp(Math.round(fx*255),0,255),py=clamp(Math.round(fy*255),0,255),ii=(py*256+px)*4;e=(elev[ii]*256+elev[ii+1]+elev[ii+2]/256)-32768;e=clamp(e,-500,9000);}const v=latLonVec(THREE,lat,lon,baseR+e/(EARTH_RADIUS_KM*1000));pos.push(v.x,v.y,v.z);uv.push(fx,1-fy);}}for(let iy=0;iy<seg;iy++)for(let ix=0;ix<seg;ix++){const a=iy*(seg+1)+ix,b=a+1,c=a+seg+1,d=c+1;idx.push(a,c,b,b,c,d);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;}
  async function terrain(z,x,y){if(!p.terrain||z<7||z>11)return null;try{const im=await image(LOD.terrain(z,x,y)),c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0,256,256);return ctx.getImageData(0,0,256,256).data;}catch(_){return null;}}
  const pump=()=>{while(running<p.concurrency&&queue.length){running++;Promise.resolve().then(queue.shift()).catch(()=>{}).finally(()=>{running--;pump();});}};const enqueue=f=>{queue.push(f);pump();};
  async function loadTile(z,x,y){const key=`${z}/${x}/${y}`;pending.delete(key);if(cache.has(key))return;const entry={key,z,x,y,mesh:null,opacity:0,target:1,last:performance.now(),state:'loading'};cache.set(key,entry);try{const im=await image(LOD.tile(z,x,y));if(disposed)return;const tex=new THREE.Texture(im);tex.needsUpdate=true;tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(maxAniso,p.tier==='MOBILE'?6:10);tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;const mat=new THREE.ShaderMaterial({uniforms:{tMap:{value:tex},uLightDir:{value:new THREE.Vector3(1,0,0)},uOpacity:{value:0}},vertexShader:tileVS,fragmentShader:tileFS,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});const mesh=new THREE.Mesh(geometry(z,x,y,null),mat);mesh.renderOrder=4;entry.mesh=mesh;entry.state='ready';lodGroup.add(mesh);if(p.terrain)enqueue(async()=>{const e=await terrain(z,x,y);if(!e||disposed||!entry.mesh)return;const old=entry.mesh.geometry;entry.mesh.geometry=geometry(z,x,y,e);old.dispose();});}catch(_){entry.state='error';tileErrors++;lodState='ERROR';}}
  function chooseLod(alt){if(alt>9000)return 0;if(alt>5500)return 4;if(alt>3200)return 5;if(alt>1800)return 6;if(alt>1000)return 7;if(alt>600)return 8;if(alt>380)return 9;if(alt>240)return 10;if(alt>160)return Math.min(11,p.maxLod);return p.maxLod;}
  function updateLod(){const alt=Math.max(0,(dist-1)*EARTH_RADIUS_KM),z=chooseLod(alt);lodLevel=z;if(!z){lodState='GLOBAL';for(const e of cache.values())e.target=0;return;}const c=vecLatLon(camera.position),tc=lonLatTile(c.lon,c.lat,z),n=2**z,r=(p.tier==='SAVER'?1:p.radius),want=new Set();for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const x=mod(tc.x+dx,n),y=tc.y+dy;if(y<0||y>=n)continue;const k=`${z}/${x}/${y}`;want.add(k);const e=cache.get(k);if(e){e.last=performance.now();e.target=1;}else if(!pending.has(k)){pending.add(k);enqueue(()=>loadTile(z,x,y));}}const ready=[...want].filter(k=>cache.get(k)?.state==='ready').length;lodState=tileErrors&&ready===0?'ERROR':ready===want.size?'ONLINE':ready?'ENHANCING':'LOADING';if(ready){for(const e of cache.values())if(!want.has(e.key))e.target=0;}if(cache.size>p.cache){const victims=[...cache.values()].filter(e=>!want.has(e.key)).sort((a,b)=>a.last-b.last);while(cache.size>p.cache&&victims.length){const e=victims.shift();if(e.mesh){lodGroup.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.uniforms.tMap.value.dispose();e.mesh.material.dispose();}cache.delete(e.key);}}}
  function animateTiles(dt,lightDir){for(const e of cache.values()){if(e.state!=='ready'||!e.mesh)continue;e.opacity=lerpExp(e.opacity,e.target,.008,dt);e.mesh.material.uniforms.uOpacity.value=e.opacity;e.mesh.material.uniforms.uLightDir.value.copy(lightDir);e.mesh.visible=e.opacity>.003||e.target>0;}}

  async function highGlobal(){if(p.globalWidth<=2048||navigator.connection?.saveData)return;await new Promise(r=>setTimeout(r,650));if(disposed)return;try{const im=await image(ASSETS.nasaGlobal),max=renderer.capabilities.maxTextureSize||4096,w=Math.min(p.globalWidth,max,5400),h=Math.round(w/2);let tex;if(im.width<=w){tex=new THREE.Texture(im);}else{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(im,0,0,w,h);tex=new THREE.CanvasTexture(c);}tex.needsUpdate=true;tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(maxAniso,p.tier==='MOBILE'?6:10);tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;const old=surfaceU.tDay.value;surfaceU.tDay.value=tex;globalLabel=`${Math.round(w/1024)}K NASA GLOBAL`;old?.dispose?.();}catch(err){console.info('[PARANORMAL WIKI EARTH] NASA global enhancement skipped',err?.message||err);}}

  function observationLight(){const v=camera.position.clone().normalize();const angle=rad(-28),x=v.x*Math.cos(angle)-v.z*Math.sin(angle),z=v.x*Math.sin(angle)+v.z*Math.cos(angle);return new THREE.Vector3(x,clamp(v.y+.08,-.85,.85),z).normalize();}
  function applyLight(dir){surfaceU.uLightDir.value.copy(dir);cloudU?.uLightDir.value.copy(dir);atmoU.uLightDir.value.copy(dir);}
  function updateCamera(){const ce=Math.cos(el);camera.position.set(Math.cos(az)*ce*dist,Math.sin(el)*dist,-Math.sin(az)*ce*dist);camera.lookAt(0,0,0);surfaceU.uCam.value.copy(camera.position);atmoU.uCam.value.copy(camera.position);}
  function resize(){if(!renderer||disposed)return;const r=root.getBoundingClientRect();renderer.setPixelRatio(Math.min(devicePixelRatio||1,p.dpr+(isFull()?.15:0)));renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(.1,r.width/r.height);camera.fov=isFull()?(r.width<r.height?38:29):(r.width<520?36:31);camera.updateProjectionMatrix();}
  const ro=new ResizeObserver(resize);ro.observe(root);clean.push(()=>ro.disconnect());resize();
  if('IntersectionObserver'in window){const io=new IntersectionObserver(es=>{inView=!!es[0]?.isIntersecting;if(inView||isFull())requestFrame();},{rootMargin:'160px 0px'});io.observe(root);clean.push(()=>io.disconnect());}

  function diagnostics(t){if(t-lastDiag<250)return;lastDiag=t;const alt=Math.max(0,(dist-1)*EARTH_RADIUS_KM),active=[...cache.values()].filter(e=>e.state==='ready'&&e.opacity>.04).length;if(d.illum)d.illum.textContent=state.realtime?'REAL-TIME SUN':'OBSERVATION';if(d.utc)d.utc.textContent=astro.date.toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC');if(d.lon)d.lon.textContent=astro.lon.toFixed(1)+'°';if(d.decl)d.decl.textContent=astro.decl.toFixed(1)+'°';if(d.alt)d.alt.textContent=alt>=10000?Math.round(alt/100)*100+' KM':Math.round(alt)+' KM';if(d.lod)d.lod.textContent=lodLevel?String(lodLevel):'GLOBAL';if(d.tiles)d.tiles.textContent=String(active);if(d.detail)d.detail.textContent=lodState+(tileErrors?` / ERR ${tileErrors}`:'');if(d.render)d.render.textContent=p.name;if(d.fps)d.fps.textContent=fps?String(Math.round(fps)):'--';if(qualityNode)qualityNode.textContent=`${p.name} · ${lodLevel?'LOD '+lodLevel:globalLabel} · ${state.realtime?'REAL SUN':'OBS LIGHT'}`;}
  function frame(t){raf=0;if(disposed||!visible||(!inView&&!isFull()))return;const dt=Math.min(.05,(t-last)/1000||.016);last=t;if(!pointers.size){tAz+=vAz*60*dt;tEl=clamp(tEl+vEl*60*dt,-1.45,1.45);vAz*=Math.pow(dist<1.2?.80:.90,dt*60);vEl*=Math.pow(dist<1.2?.80:.90,dt*60);}if(!reduced()&&t-lastMove>6500&&dist>1.3)tAz+=dt*.006;az=lerpExp(az,tAz,.0008,dt);el=lerpExp(el,tEl,.0008,dt);dist=lerpExp(dist,capDist(tDist),.001,dt);az=wrap(az);tAz=wrap(tAz);updateCamera();if(!reduced())cloudOff=(cloudOff+dt*.00040)%1;if(cloudU)cloudU.uOff.value=cloudOff;if(t-lastSun>1000){lastSun=t;astro=solar(THREE,new Date());}const light=state.realtime?astro.dir:observationLight();applyLight(light);if(t-lastLod>180){lastLod=t;updateLod();}animateTiles(dt,light);for(const draw of overlays){try{draw({THREE,camera,earth,root,altitudeKm:Math.max(0,(dist-1)*EARTH_RADIUS_KM),isFull:isFull()})}catch(error){console.warn('[PARANORMAL WIKI EARTH] overlay error',error);}}frames++;const e=t-fpsStart;if(e>=1000){fps=frames*1000/e;frames=0;fpsStart=t;}diagnostics(t);renderer.render(scene,camera);requestFrame();}
  function requestFrame(){if(disposed||raf||!visible||(!inView&&!isFull()))return;raf=requestAnimationFrame(frame);}

  on(canvas,'webglcontextlost',e=>{e.preventDefault();if(raf)cancelAnimationFrame(raf);raf=0;setFallback('WebGL context lost');});
  on(canvas,'webglcontextrestored',()=>{setReady();requestFrame();});
  const api={version:VERSION,reset:resetView,detailView,flyTo(o={}){tEl=rad(clamp(Number(o.lat)||0,-84,84));tAz=wrap(rad(Number(o.lon)||0));if(Number.isFinite(o.altitude))tDist=capDist(1+Math.max(isFull()?120:250,o.altitude)/EARTH_RADIUS_KM);markMove();},focusRegion(o){this.flyTo(o);},projectPoint(lat,lon){if(!camera||!THREE)return null;camera.updateMatrixWorld(true);earth?.updateMatrixWorld(true);const world=latLonVec(THREE,Number(lat),Number(lon));earth?.localToWorld(world);const normal=world.clone().normalize(),toCamera=camera.position.clone().sub(world).normalize(),facing=normal.dot(toCamera);world.project(camera);const rr=root.getBoundingClientRect(),cr=canvas.getBoundingClientRect(),px=cr.left-rr.left+(world.x+1)*.5*cr.width,py=cr.top-rr.top+(1-world.y)*.5*cr.height;return {x:px/Math.max(1,rr.width)*100,y:py/Math.max(1,rr.height)*100,visible:facing>.02&&world.z>=-1&&world.z<=1&&px>-4&&px<rr.width+4&&py>-4&&py<rr.height+4};},getObservationState(){return {altitudeKm:Math.max(0,(dist-1)*EARTH_RADIUS_KM),lod:lodLevel,detail:lodState,center:vecLatLon(camera.position),activeTiles:[...cache.values()].filter(e=>e.state==='ready'&&e.opacity>.04).length,illumination:state.realtime?'real-time':'observation'};},addOverlay(draw){if(typeof draw!=='function')return()=>{};overlays.add(draw);requestFrame();return()=>overlays.delete(draw);},destroy(){if(disposed)return;disposed=true;if(raf)cancelAnimationFrame(raf);overlays.clear();for(const f of clean.splice(0))try{f()}catch{}document.body.classList.remove('ua-earth-lock');root.style.touchAction='pan-y';for(const e of cache.values())if(e.mesh){e.mesh.geometry.dispose();e.mesh.material.uniforms.tMap.value.dispose();e.mesh.material.dispose();}renderer?.dispose?.();mounted.delete(root);},addMarker(){return null;},removeMarker(){return false;},setMarkerLayer(){return true;},setOverlay(draw){return this.addOverlay(draw);}};
  mounted.set(root,api);labels();updateFs();setReady();requestFrame();highGlobal();return api;
 }catch(err){setFallback(err);const api={version:VERSION,destroy(){disposed=true;},reset:resetView,flyTo(){},focusRegion(){},projectPoint(lat,lon){const rr=root.getBoundingClientRect(),iw=Math.max(rr.width,rr.height*2),ih=iw/2,ox=(rr.width-iw)/2,oy=(rr.height-ih)/2;return {x:(ox+(Number(lon)+180)/360*iw)/Math.max(1,rr.width)*100,y:(oy+(90-Number(lat))/180*ih)/Math.max(1,rr.height)*100,visible:true};},getObservationState(){return {altitudeKm:12000,lod:0,detail:'FALLBACK',center:{lat:13,lon:25},activeTiles:0,illumination:'observation'};}};mounted.set(root,api);return api;}
}

function watch(){
 const io='IntersectionObserver'in window?new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){io.unobserve(e.target);mount(e.target);}},{rootMargin:'220px 0px'}):null;
 function scan(){document.querySelectorAll('[data-unseen-earth]').forEach(el=>{if(mounted.has(el)||el.dataset.uaV4Observed)return;el.dataset.uaV4Observed='1';if(io)io.observe(el);else mount(el);});}
 const mo=new MutationObserver(scan);mo.observe(document.documentElement,{childList:true,subtree:true});scan();
}
window.UnseenEarth={version:VERSION,mount,get:r=>mounted.get(r)||null,flyTo:(r,o)=>mounted.get(r)?.flyTo?.(o),focusRegion:(r,o)=>mounted.get(r)?.focusRegion?.(o),detailView:r=>mounted.get(r)?.detailView?.()};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
})();
