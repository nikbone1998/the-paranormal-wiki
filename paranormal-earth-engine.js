/* THE PARANORMAL WIKI — Earth Observation Engine v3.1
 * Earth rendering only: no entity coordinates, case markers, dossier links, or paranormal overlays.
 * Regional detail uses NASA GIBS Landsat WELD; optional true-scale relief uses AWS Open Data Terrain Tiles.
 */
(function(){
'use strict';

const VERSION='3.1.0-visible-lod';
const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
const EARTH_RADIUS_KM=6371.0088;
const TAU=Math.PI*2;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const mounted=new WeakMap();
let threePromise=null;

const TEXTURES={
  base:{
    day:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_atmos_2048.jpg',
    water:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_specular_2048.jpg',
    clouds:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_clouds_1024.png',
    night:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_lights_2048.png'
  },
  high:{
    day:'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg',
    night:'https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg',
    clouds:'https://matteason.github.io/daily-cloud-maps/4096x2048-clouds-alpha.png',
    water:'https://matteason.github.io/daily-cloud-maps/4096x2048-specular.jpg'
  }
};

const LOD_SOURCE={
  layer:'Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual',
  time:'2010-12-01',
  matrixSet:'GoogleMapsCompatible_Level12',
  maxZoom:12,
  image(z,x,y){return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${this.layer}/default/${this.time}/${this.matrixSet}/${z}/${y}/${x}.jpg`;},
  terrain(z,x,y){return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;}
};

function loadThree(){return threePromise||(threePromise=import(THREE_URL));}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function rad(d){return d*Math.PI/180;}
function deg(r){return r*180/Math.PI;}
function smooth(current,target,rate,dt){return current+(target-current)*(1-Math.pow(rate,dt));}
function wrapRadians(v){while(v>Math.PI)v-=TAU;while(v<-Math.PI)v+=TAU;return v;}
function mod(v,n){return ((v%n)+n)%n;}

function fallbackSvg(){
 const s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700"><defs><radialGradient id="b"><stop stop-color="#071a45"/><stop offset=".62" stop-color="#020619"/><stop offset="1"/></radialGradient><radialGradient id="e" cx="34%" cy="28%"><stop stop-color="#9addff"/><stop offset=".20" stop-color="#2381d2"/><stop offset=".66" stop-color="#0b3d7c"/><stop offset="1" stop-color="#001129"/></radialGradient><filter id="g"><feGaussianBlur stdDeviation="18"/></filter></defs><rect width="1200" height="700" fill="url(#b)"/><g fill="#fff" opacity=".65">${Array.from({length:90},(_,i)=>`<circle cx="${(i*137)%1180+10}" cy="${(i*83)%680+10}" r="${i%7===0?1.6:.8}"/>`).join('')}</g><circle cx="600" cy="350" r="236" fill="#2aaeff" opacity=".18" filter="url(#g)"/><circle cx="600" cy="350" r="210" fill="url(#e)" stroke="#7ad8ff" stroke-opacity=".6"/></svg>`;
 return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(s);
}

function qualityProfile(){
 const mobile=matchMedia('(max-width:680px)').matches;
 const mem=Number(navigator.deviceMemory||4);
 const cores=Number(navigator.hardwareConcurrency||4);
 const saveData=!!navigator.connection?.saveData;
 if(saveData)return {tier:'SAVER',label:'DATA SAVER',segments:64,dpr:1.25,stars:[260,160,80],hiGlobal:false,maxLod:6,tileRadius:1,cache:18,concurrency:2,terrain:false,exposure:1.18};
 if(mobile)return {tier:'MOBILE',label:'ADAPTIVE / MOBILE',segments:88,dpr:1.6,stars:[380,250,130],hiGlobal:true,maxLod:11,tileRadius:2,cache:46,concurrency:4,terrain:true,exposure:1.34};
 if(mem>=8&&cores>=6)return {tier:'HIGH',label:'HIGH / DESKTOP',segments:144,dpr:2.0,stars:[760,480,240],hiGlobal:true,maxLod:12,tileRadius:3,cache:72,concurrency:7,terrain:true,exposure:1.28};
 return {tier:'ADAPTIVE',label:'ADAPTIVE / DESKTOP',segments:112,dpr:1.75,stars:[520,340,180],hiGlobal:true,maxLod:11,tileRadius:2,cache:54,concurrency:5,terrain:true,exposure:1.28};
}

function solarState(THREE,date=new Date()){
 const start=Date.UTC(date.getUTCFullYear(),0,0);
 const now=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
 const n=Math.floor((now-start)/86400000);
 const h=date.getUTCHours()+date.getUTCMinutes()/60+date.getUTCSeconds()/3600;
 const decl=23.44*Math.sin((TAU/365)*(n-81));
 const lon=180-h*15;
 const dr=rad(decl),lr=rad(lon);
 const dir=new THREE.Vector3(Math.cos(dr)*Math.cos(lr),Math.sin(dr),-Math.cos(dr)*Math.sin(lr)).normalize();
 return {dir,decl,lon,date};
}

function latLonToVector(THREE,lat,lon,r=1){
 const la=rad(lat),lo=rad(lon),c=Math.cos(la);
 return new THREE.Vector3(c*Math.cos(lo)*r,Math.sin(la)*r,-c*Math.sin(lo)*r);
}
function vectorToLatLon(v){const r=v.length()||1;return {lat:deg(Math.asin(clamp(v.y/r,-1,1))),lon:deg(Math.atan2(-v.z,v.x))};}
function lonLatToTile(lon,lat,z){const n=2**z,x=Math.floor((lon+180)/360*n),l=rad(clamp(lat,-85.05112878,85.05112878)),y=Math.floor((1-Math.asinh(Math.tan(l))/Math.PI)/2*n);return {x:mod(x,n),y:clamp(y,0,n-1)};}
function tileYToLat(y,z){const n=2**z;return deg(Math.atan(Math.sinh(Math.PI*(1-2*y/n))));}
function tileXToLon(x,z){return x/(2**z)*360-180;}
function seeded(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}

function makeStarLayer(THREE,count,minR,maxR,size,opacity,seed,band=false){
 const rnd=seeded(seed),pos=[],colors=[];
 for(let i=0;i<count;i++){
  const r=minR+rnd()*(maxR-minR),th=rnd()*TAU,y=band?clamp((rnd()+rnd()+rnd()-1.5)*.20,-.46,.46):rnd()*2-1,rr=Math.sqrt(Math.max(0,1-y*y));
  pos.push(r*rr*Math.cos(th),r*y,r*rr*Math.sin(th));
  const t=rnd();if(t<.08)colors.push(.72,.82,1);else if(t>.94)colors.push(1,.82,.64);else colors.push(.88,.91,1);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 return new THREE.Points(g,new THREE.PointsMaterial({size,sizeAttenuation:true,transparent:true,opacity,vertexColors:true,depthWrite:false}));
}

function ensureObservationUi(root){
 if(root.querySelector('.ua-observation-panel'))return;
 const panel=document.createElement('div');
 panel.className='ua-observation-panel';
 panel.setAttribute('aria-label','Earth observation controls');
 panel.innerHTML=`<div class="ua-observation-title">THE PARANORMAL WIKI // GLOBAL OBSERVATION SYSTEM</div>
 <div class="ua-observation-buttons">
  <button type="button" class="ua-globe-btn" data-earth-toggle="clouds">[ CLOUDS: ON ]</button>
  <button type="button" class="ua-globe-btn" data-earth-toggle="lights">[ CITY LIGHTS: ON ]</button>
  <button type="button" class="ua-globe-btn" data-earth-toggle="atmosphere">[ ATMOSPHERE: ON ]</button>
  <button type="button" class="ua-globe-btn" data-earth-toggle="aurora">[ AURORA: ON ]</button>
  <button type="button" class="ua-globe-btn" data-earth-toggle="realtime">[ REAL-TIME SUN: ON ]</button>
  <button type="button" class="ua-globe-btn" data-earth-toggle="auto">[ AUTO ORBIT: ON ]</button>
  <button type="button" class="ua-globe-btn" data-earth-observation-reset>[ RESET VIEW ]</button>
  <button type="button" class="ua-globe-btn" data-earth-observation-close>[ CLOSE ]</button>
 </div>
 <div class="ua-observation-diagnostics mono">
  UTC: <span data-earth-utc>--</span><br>
  APPROX. SUBSOLAR LON: <span data-earth-sunlon>--</span><br>
  APPROX. SOLAR DECLINATION: <span data-earth-decl>--</span><br>
  APPROX. ALTITUDE: <span data-earth-altitude>--</span><br>
  SURFACE LOD: <span data-earth-lod>GLOBAL</span> · ACTIVE TILES: <span data-earth-tiles>0</span><br>
  REGIONAL DETAIL: <span data-earth-detail>STANDBY</span><br>
  RENDER: <span data-earth-render>--</span> · FPS: <span data-earth-fps>--</span>
 </div>
 <div class="ua-observation-note">NASA LANDSAT REGIONAL DETAIL // VISUALIZATION ONLY // ENTITY LAYER STANDBY</div>`;
 root.appendChild(panel);
 const boot=document.createElement('div');
 boot.className='ua-observation-boot';
 boot.setAttribute('aria-hidden','true');
 boot.innerHTML=`<div><b>THE PARANORMAL WIKI</b><br>GLOBAL OBSERVATION SYSTEM<br><br>GEOSPHERE LINK ........ ONLINE<br>PLANETARY MODEL ....... LOADED<br>SUN VECTOR ............ CALCULATED<br>REGIONAL LOD .......... STANDBY<br>ARCHIVE ENTITY LAYER .. STANDBY</div>`;
 root.appendChild(boot);
}

async function mount(root){
 if(mounted.has(root))return mounted.get(root);
 root.dataset.earthVersion=VERSION;
 const canvas=root.querySelector('.ua-globe-canvas');
 const starsCanvas=root.querySelector('.ua-globe-stars');
 const fallback=root.querySelector('.ua-globe-fallback');
 const reset=root.querySelector('[data-globe-reset]');
 const fs=root.querySelector('[data-globe-fullscreen]');
 const qualityNode=root.querySelector('.ua-globe-quality');
 if(!canvas)throw new Error('Earth canvas missing');
 ensureObservationUi(root);
 if(fallback)fallback.src=fallbackSvg();
 const profile=qualityProfile();
 if(qualityNode)qualityNode.textContent=profile.label;
 if(starsCanvas)starsCanvas.style.display='none';

 const diag={
  utc:root.querySelector('[data-earth-utc]'),lon:root.querySelector('[data-earth-sunlon]'),decl:root.querySelector('[data-earth-decl]'),
  altitude:root.querySelector('[data-earth-altitude]'),lod:root.querySelector('[data-earth-lod]'),tiles:root.querySelector('[data-earth-tiles]'),
  detail:root.querySelector('[data-earth-detail]'),render:root.querySelector('[data-earth-render]'),fps:root.querySelector('[data-earth-fps]')
 };
 const boot=root.querySelector('.ua-observation-boot');
 const cleanup=[];
 let disposed=false,raf=0,resizeObs=null,visibilityIo=null;
 let THREE,renderer,scene,camera,earth,clouds,atmosphere,aurora,starGroup,surfaceUniforms,cloudUniforms,atmoUniforms,auroraUniforms;
 let lastT=performance.now(),lastMove=performance.now(),lastSunUpdate=0,lastDiag=0,lastLodUpdate=0;
 let inView=true,visible=!document.hidden,pseudoFullscreen=false,frames=0,fpsValue=0,fpsStart=performance.now();
 const toggles={clouds:true,lights:true,atmosphere:true,aurora:true,realtime:true,auto:true};
 let azimuth=0,elevation=.15,distance=2.92,targetAzimuth=0,targetElevation=.15,targetDistance=2.92,velAz=0,velEl=0,cloudOffset=0,sunFrozen=null,sunInfo=null;
 const idleDelay=5200,pointers=new Map();
 let dragId=null,lastX=0,lastY=0,lastPinch=0,userInteracted=false,globalDetail='2K GLOBAL';

 function on(el,type,fn,opt){if(!el)return;el.addEventListener(type,fn,opt);cleanup.push(()=>el.removeEventListener(type,fn,opt));}
 function setReady(){root.classList.remove('ua-fallback');root.classList.add('ua-ready');}
 function fail(err){console.warn('[PARANORMAL WIKI EARTH] fallback',err);if(disposed)return;root.classList.remove('ua-ready');root.classList.add('ua-fallback');}
 function isFullscreen(){return document.fullscreenElement===root||pseudoFullscreen;}
 function minDistance(){return isFullscreen()?1+120/EARTH_RADIUS_KM:1+250/EARTH_RADIUS_KM;}
 function clampDistance(v){return clamp(v,minDistance(),5.2);}
 function daylitAzimuth(){return wrapRadians(rad((sunInfo?.lon||0)+18));}
 function daylitElevation(){return rad(clamp((sunInfo?.decl||0)*.30+10,-22,22));}
 function resetView(){
  targetAzimuth=daylitAzimuth();targetElevation=daylitElevation();targetDistance=2.92;velAz=velEl=0;userInteracted=false;lastMove=performance.now();
 }
 function bootObservation(){if(!boot)return;root.classList.add('ua-observation-booting');setTimeout(()=>{if(!disposed)root.classList.remove('ua-observation-booting')},reduced.matches?80:850);}
 async function enterObservation(){try{if(root.requestFullscreen)await root.requestFullscreen();else throw 0;}catch(_){pseudoFullscreen=true;root.classList.add('ua-pseudo-fullscreen','ua-observation-mode');document.body.classList.add('ua-earth-lock');bootObservation();resize();}}
 async function leaveObservation(){try{if(document.fullscreenElement===root)await document.exitFullscreen();}catch(_){}if(pseudoFullscreen){pseudoFullscreen=false;root.classList.remove('ua-pseudo-fullscreen','ua-observation-mode');document.body.classList.remove('ua-earth-lock');resize();}}
 function toggleObservation(){if(isFullscreen())leaveObservation();else enterObservation();}
 function updateFsLabel(){if(fs)fs.textContent=isFullscreen()?'[ CLOSE FULL EARTH VIEW ]':'[ OPEN FULL EARTH VIEW ]';}
 function refreshToggleLabels(){root.querySelectorAll('[data-earth-toggle]').forEach(btn=>{const key=btn.dataset.earthToggle,names={clouds:'CLOUDS',lights:'CITY LIGHTS',atmosphere:'ATMOSPHERE',aurora:'AURORA',realtime:'REAL-TIME SUN',auto:'AUTO ORBIT'};btn.textContent=`[ ${names[key]}: ${toggles[key]?'ON':'OFF'} ]`;});}
 function applyToggle(key){
  toggles[key]=!toggles[key];
  if(key==='clouds'&&clouds)clouds.visible=toggles.clouds;
  if(key==='atmosphere'&&atmosphere)atmosphere.visible=toggles.atmosphere;
  if(key==='aurora'&&aurora)aurora.visible=toggles.aurora;
  if(key==='lights'&&surfaceUniforms)surfaceUniforms.uLightsOn.value=toggles.lights?1:0;
  if(key==='realtime'&&!toggles.realtime&&sunInfo)sunFrozen={...sunInfo,dir:sunInfo.dir.clone()};
  if(key==='realtime'&&toggles.realtime)sunFrozen=null;
  refreshToggleLabels();lastMove=performance.now();
 }

 on(reset,'click',resetView);on(fs,'click',toggleObservation);on(root.querySelector('[data-earth-observation-reset]'),'click',resetView);on(root.querySelector('[data-earth-observation-close]'),'click',leaveObservation);
 root.querySelectorAll('[data-earth-toggle]').forEach(btn=>on(btn,'click',()=>applyToggle(btn.dataset.earthToggle)));
 on(document,'fullscreenchange',()=>{const active=document.fullscreenElement===root;root.classList.toggle('ua-observation-mode',active||pseudoFullscreen);if(active)bootObservation();targetDistance=clampDistance(targetDistance);updateFsLabel();resize();});
 on(document,'visibilitychange',()=>{visible=!document.hidden;if(visible)requestFrame();else if(raf){cancelAnimationFrame(raf);raf=0;}});

 on(root,'keydown',e=>{
  const altitude=Math.max(1,(targetDistance-1)*EARTH_RADIUS_KM),scale=clamp(altitude/7000,.06,1),s=.075*scale;
  if(e.key==='ArrowLeft')targetAzimuth-=s;else if(e.key==='ArrowRight')targetAzimuth+=s;else if(e.key==='ArrowUp')targetElevation=clamp(targetElevation+s,-1.45,1.45);else if(e.key==='ArrowDown')targetElevation=clamp(targetElevation-s,-1.45,1.45);
  else if(e.key==='+'||e.key==='=')targetDistance=clampDistance(1+Math.max(.005,(targetDistance-1)*.82));else if(e.key==='-'||e.key==='_')targetDistance=clampDistance(1+(targetDistance-1)*1.20);else return;
  e.preventDefault();userInteracted=true;lastMove=performance.now();
 });
 on(root,'wheel',e=>{e.preventDefault();const alt=Math.max(.006,targetDistance-1),factor=Math.exp(clamp(e.deltaY,-120,120)*.0015);targetDistance=clampDistance(1+alt*factor);userInteracted=true;lastMove=performance.now();},{passive:false});
 function pinchDistance(){const a=[...pointers.values()];return a.length<2?0:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);}
 on(root,'pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});root.setPointerCapture?.(e.pointerId);userInteracted=true;lastMove=performance.now();if(pointers.size===1){dragId=e.pointerId;lastX=e.clientX;lastY=e.clientY;root.classList.add('ua-dragging');}else if(pointers.size===2){lastPinch=pinchDistance();dragId=null;}},{passive:true});
 on(root,'pointermove',e=>{
  if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});lastMove=performance.now();
  if(pointers.size>=2){const d=pinchDistance();if(lastPinch){const ratio=lastPinch/Math.max(1,d),alt=Math.max(.006,targetDistance-1);targetDistance=clampDistance(1+alt*ratio);}lastPinch=d;return;}
  if(dragId===e.pointerId){const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;const altKm=Math.max(1,(targetDistance-1)*EARTH_RADIUS_KM),control=clamp(altKm/7000,.035,1);targetAzimuth-=dx*.0060*control;targetElevation=clamp(targetElevation+dy*.0050*control,-1.45,1.45);velAz=-dx*.00045*control;velEl=dy*.00038*control;}
 },{passive:true});
 function endPointer(e){pointers.delete(e.pointerId);if(e.pointerId===dragId)dragId=null;if(pointers.size<2)lastPinch=0;if(!pointers.size)root.classList.remove('ua-dragging');lastMove=performance.now();}
 on(root,'pointerup',endPointer);on(root,'pointercancel',endPointer);on(root,'lostpointercapture',endPointer);

 try{
  THREE=await loadThree();if(disposed)return;
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance',premultipliedAlpha:false});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=profile.exposure;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(31,1,.0015,80);
  const loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
  const maxAniso=renderer.capabilities.getMaxAnisotropy();
  const loadTexture=(url,color=false)=>new Promise((resolve,reject)=>loader.load(url,t=>{if(color)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(profile.tier==='MOBILE'?6:10,maxAniso);t.wrapS=THREE.RepeatWrapping;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;resolve(t);},undefined,reject));
  const base=await Promise.allSettled([loadTexture(TEXTURES.base.day,true),loadTexture(TEXTURES.base.water,false),loadTexture(TEXTURES.base.clouds,true),loadTexture(TEXTURES.base.night,true)]);
  if(disposed)return;
  const [dayTex,waterTex,cloudTex,nightTex]=base.map(r=>r.status==='fulfilled'?r.value:null);if(!dayTex)throw new Error('Earth day texture unavailable');
  const neutral=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat);neutral.needsUpdate=true;
  const geo=new THREE.SphereGeometry(1,profile.segments,profile.segments);sunInfo=solarState(THREE,new Date());

  azimuth=targetAzimuth=daylitAzimuth();elevation=targetElevation=daylitElevation();

  surfaceUniforms={tDay:{value:dayTex},tWater:{value:waterTex||neutral},tCloud:{value:cloudTex||neutral},tNight:{value:nightTex||neutral},uSunDir:{value:sunInfo.dir.clone()},uCameraPos:{value:new THREE.Vector3()},uCloudOffset:{value:0},uLightsOn:{value:1},uCloudShadowsOn:{value:cloudTex?1:0}};
  const surfaceMaterial=new THREE.ShaderMaterial({
   uniforms:surfaceUniforms,
   vertexShader:`varying vec2 vUv;varying vec3 vWorldNormal;varying vec3 vWorldPos;void main(){vUv=uv;vWorldNormal=normalize(mat3(modelMatrix)*normal);vec4 wp=modelMatrix*vec4(position,1.0);vWorldPos=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
   fragmentShader:`precision highp float;uniform sampler2D tDay;uniform sampler2D tWater;uniform sampler2D tCloud;uniform sampler2D tNight;uniform vec3 uSunDir;uniform vec3 uCameraPos;uniform float uCloudOffset;uniform float uLightsOn;uniform float uCloudShadowsOn;varying vec2 vUv;varying vec3 vWorldNormal;varying vec3 vWorldPos;float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}void main(){vec3 N=normalize(vWorldNormal),S=normalize(uSunDir),V=normalize(uCameraPos-vWorldPos);float ndl=dot(N,S),sun=max(ndl,0.0);vec3 day=texture2D(tDay,vUv).rgb;float water=smoothstep(.18,.58,lum(texture2D(tWater,vUv).rgb));vec2 suv=vec2(fract(vUv.x+uCloudOffset+uSunDir.z*.0030),clamp(vUv.y-uSunDir.y*.0022,.001,.999));vec4 cs=texture2D(tCloud,suv);float cloud=clamp(min(lum(cs.rgb),cs.a),0.0,1.0);float dayGate=smoothstep(-.11,.20,ndl);float diffuse=pow(max(ndl,0.0),.48);float illumination=.012+dayGate*(.30+.92*diffuse);float shadow=pow(cloud,1.16)*uCloudShadowsOn*dayGate*.045;vec3 surface=day*illumination*(1.0-shadow);vec3 H=normalize(S+V);float oceanGlint=pow(max(dot(N,H),0.0),210.0)*water*smoothstep(.05,.32,ndl);float oceanFresnel=pow(1.0-max(dot(N,V),0.0),4.2)*water*dayGate;surface+=vec3(.74,.88,1.0)*oceanGlint*.20;surface+=vec3(.035,.13,.21)*oceanFresnel*.22;vec3 ntex=texture2D(tNight,vUv).rgb;float nl=lum(ntex);vec3 warm=mix(ntex,ntex*vec3(1.24,.88,.58),.42);float darkness=1.0-smoothstep(-.20,.08,ndl);vec3 city=warm*(.47+smoothstep(.045,.52,nl)*.68)*darkness*uLightsOn;vec3 color=surface+city;float limb=pow(1.0-max(dot(N,V),0.0),3.2);color+=vec3(.045,.16,.34)*limb*dayGate*.32;gl_FragColor=vec4(color,1.0);}`
  });
  earth=new THREE.Mesh(geo,surfaceMaterial);scene.add(earth);

  if(cloudTex){
   cloudUniforms={tCloud:{value:cloudTex},uSunDir:{value:sunInfo.dir.clone()},uCloudOffset:{value:0}};
   const cloudMaterial=new THREE.ShaderMaterial({uniforms:cloudUniforms,transparent:true,depthWrite:false,side:THREE.FrontSide,
    vertexShader:`varying vec2 vUv;varying vec3 vWorldNormal;void main(){vUv=uv;vWorldNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`precision mediump float;uniform sampler2D tCloud;uniform vec3 uSunDir;uniform float uCloudOffset;varying vec2 vUv;varying vec3 vWorldNormal;float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}void main(){vec2 uv=vec2(fract(vUv.x+uCloudOffset),vUv.y);vec4 s=texture2D(tCloud,uv);float mask=clamp(min(lum(s.rgb),s.a),0.0,1.0);float a=pow(mask,1.12);float sun=smoothstep(-.25,.30,dot(normalize(vWorldNormal),normalize(uSunDir)));vec3 c=mix(vec3(.18,.22,.30),vec3(1.0),.28+.72*sun);gl_FragColor=vec4(c,a*(.055+.31*sun));}`
   });
   clouds=new THREE.Mesh(new THREE.SphereGeometry(1.004,profile.segments,profile.segments),cloudMaterial);scene.add(clouds);
  }

  atmoUniforms={uSunDir:{value:sunInfo.dir.clone()},uCameraPos:{value:new THREE.Vector3()}};
  const atmoMaterial=new THREE.ShaderMaterial({uniforms:atmoUniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.FrontSide,
   vertexShader:`varying vec3 vN;varying vec3 vP;void main(){vN=normalize(mat3(modelMatrix)*normal);vec4 wp=modelMatrix*vec4(position,1.0);vP=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
   fragmentShader:`precision mediump float;uniform vec3 uSunDir;uniform vec3 uCameraPos;varying vec3 vN;varying vec3 vP;void main(){vec3 N=normalize(vN),V=normalize(uCameraPos-vP),S=normalize(uSunDir);float rim=pow(1.0-max(dot(N,V),0.0),5.0),sd=dot(N,S),day=smoothstep(-.28,.25,sd),terminator=(1.0-smoothstep(.02,.18,abs(sd)))*smoothstep(-.20,.07,sd);vec3 blue=mix(vec3(.025,.11,.42),vec3(.12,.60,1.0),pow(day,.72)),warm=vec3(1.0,.28,.055)*terminator;float a=rim*(.025+.45*day)+rim*terminator*.15;gl_FragColor=vec4(blue*rim*(.09+.62*day)+warm*rim*.40,clamp(a,0.0,.56));}`
  });
  atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.0185,profile.segments,profile.segments),atmoMaterial);scene.add(atmosphere);

  auroraUniforms={uSunDir:{value:sunInfo.dir.clone()},uTime:{value:0}};
  const auroraMaterial=new THREE.ShaderMaterial({uniforms:auroraUniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
   vertexShader:`varying vec3 vLocal;varying vec3 vWorldNormal;void main(){vLocal=normalize(position);vWorldNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
   fragmentShader:`precision mediump float;uniform vec3 uSunDir;uniform float uTime;varying vec3 vLocal;varying vec3 vWorldNormal;void main(){float lat=abs(vLocal.y),band=smoothstep(.70,.78,lat)*(1.0-smoothstep(.94,.995,lat)),lon=atan(vLocal.z,vLocal.x),wave=.5+.5*sin(lon*7.0+uTime*.17+sin(lon*3.0-uTime*.09)*1.7),fine=.5+.5*sin(lon*19.0-uTime*.11+vLocal.y*28.0),curtain=smoothstep(.30,.92,wave*.68+fine*.32),night=1.0-smoothstep(-.12,.16,dot(normalize(vWorldNormal),normalize(uSunDir))),pole=smoothstep(.84,.96,lat);vec3 color=mix(vec3(.05,1.0,.42),vec3(1.0,.12,.08),pole*.22);float alpha=band*curtain*night*.10;gl_FragColor=vec4(color*alpha*1.8,alpha);}`
  });
  aurora=new THREE.Mesh(new THREE.SphereGeometry(1.025,profile.segments,profile.segments),auroraMaterial);scene.add(aurora);

  starGroup=new THREE.Group();
  const sa=makeStarLayer(THREE,profile.stars[0],7,11,.012,.50,81031),sb=makeStarLayer(THREE,profile.stars[1],12,20,.017,.40,22091),sc=makeStarLayer(THREE,profile.stars[2],18,32,.021,.28,99173),milky=makeStarLayer(THREE,profile.tier==='HIGH'?800:420,19,34,.024,.08,61297,true);
  milky.rotation.z=.54;milky.rotation.x=.31;starGroup.add(sa,sb,sc,milky);scene.add(starGroup);

  const lodGroup=new THREE.Group();scene.add(lodGroup);
  const tileCache=new Map(),queue=[],pendingKeys=new Set();
  let running=0,lodLevel=0,lodState='STANDBY',terrainState=profile.terrain?'READY':'OFF';
  const tileVertexShader=`varying vec2 vUv;varying vec3 vWorldNormal;void main(){vUv=uv;vWorldNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
  const tileFragmentShader=`precision mediump float;uniform sampler2D tMap;uniform vec3 uSunDir;uniform float uOpacity;varying vec2 vUv;varying vec3 vWorldNormal;void main(){vec3 N=normalize(vWorldNormal),S=normalize(uSunDir);float ndl=dot(N,S),dayGate=smoothstep(-.10,.16,ndl),diffuse=pow(max(ndl,0.0),.50);float light=.22+dayGate*(.22+.82*diffuse);vec3 c=texture2D(tMap,vUv).rgb*light;gl_FragColor=vec4(c,uOpacity*dayGate);}`;
  function loadImage(url){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.decoding='async';img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});}
  function makeTileGeometry(z,x,y,elevData=null){
   const seg=profile.tier==='MOBILE'?16:20,positions=[],uvs=[],indices=[],baseRadius=1.00011+z*.0000015;
   for(let iy=0;iy<=seg;iy++){
    const fy=iy/seg,lat=tileYToLat(y+fy,z);
    for(let ix=0;ix<=seg;ix++){
     const fx=ix/seg,lon=tileXToLon(x+fx,z);let elev=0;
     if(elevData){const px=clamp(Math.round(fx*255),0,255),py=clamp(Math.round(fy*255),0,255),i=(py*256+px)*4;elev=(elevData[i]*256+elevData[i+1]+elevData[i+2]/256)-32768;elev=clamp(elev,-500,9000);}
     const rr=baseRadius+Math.max(-.00005,elev/(EARTH_RADIUS_KM*1000)),p=latLonToVector(THREE,lat,lon,rr);positions.push(p.x,p.y,p.z);uvs.push(fx,1-fy);
    }
   }
   for(let iy=0;iy<seg;iy++)for(let ix=0;ix<seg;ix++){const a=iy*(seg+1)+ix,b=a+1,c=a+(seg+1),d=c+1;indices.push(a,c,b,b,c,d);}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  async function decodeTerrain(z,x,y){if(!profile.terrain||z>11)return null;try{const img=await loadImage(LOD_SOURCE.terrain(z,x,y)),c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,256,256);return ctx.getImageData(0,0,256,256).data;}catch(_){terrainState='UNAVAILABLE';return null;}}
  function enqueue(task){queue.push(task);pump();}
  function pump(){while(running<profile.concurrency&&queue.length){const task=queue.shift();running++;Promise.resolve().then(task).catch(()=>{}).finally(()=>{running--;pump();});}}
  async function loadTile(z,x,y){
   const key=`${z}/${x}/${y}`;pendingKeys.delete(key);if(tileCache.has(key))return tileCache.get(key);
   const entry={key,z,x,y,state:'loading',mesh:null,lastUsed:performance.now(),targetOpacity:1,opacity:0};tileCache.set(key,entry);
   try{
    const img=await loadImage(LOD_SOURCE.image(z,x,y));if(disposed)return entry;
    const tex=new THREE.Texture(img);tex.needsUpdate=true;tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(profile.tier==='MOBILE'?6:10,maxAniso);tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;
    const mat=new THREE.ShaderMaterial({uniforms:{tMap:{value:tex},uSunDir:{value:sunInfo.dir.clone()},uOpacity:{value:0}},vertexShader:tileVertexShader,fragmentShader:tileFragmentShader,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const mesh=new THREE.Mesh(makeTileGeometry(z,x,y,null),mat);mesh.renderOrder=3;entry.mesh=mesh;entry.state='ready';lodGroup.add(mesh);
    if(profile.terrain&&z>=6)enqueue(async()=>{const data=await decodeTerrain(z,x,y);if(!data||disposed||entry.state!=='ready'||!entry.mesh)return;const old=entry.mesh.geometry;entry.mesh.geometry=makeTileGeometry(z,x,y,data);old.dispose();});
   }catch(_){entry.state='error';lodState='PARTIAL';}
   return entry;
  }
  function chooseLod(altKm){
   if(altKm>7000)return 0;
   if(altKm>4800)return 4;
   if(altKm>3000)return 5;
   if(altKm>1800)return 6;
   if(altKm>1050)return 7;
   if(altKm>620)return 8;
   if(altKm>390)return 9;
   if(altKm>260)return 10;
   if(altKm>175)return Math.min(11,profile.maxLod);
   return Math.min(isFullscreen()?profile.maxLod:Math.min(profile.maxLod,11),LOD_SOURCE.maxZoom);
  }
  function tileRadiusFor(z){
   if(profile.tier==='SAVER')return 1;
   if(z<=5)return 2;
   if(profile.tier==='MOBILE'&&z>=11)return isFullscreen()?3:2;
   return profile.tileRadius;
  }
  function updateLod(){
   const altKm=Math.max(0,(distance-1)*EARTH_RADIUS_KM),z=chooseLod(altKm);lodLevel=z;
   if(!z){lodState='GLOBAL';for(const e of tileCache.values())e.targetOpacity=0;return;}
   const center=vectorToLatLon(camera.position),tc=lonLatToTile(center.lon,center.lat,z),n=2**z,radius=tileRadiusFor(z),wanted=new Set();
   for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const x=mod(tc.x+dx,n),y=tc.y+dy;if(y<0||y>=n)continue;const key=`${z}/${x}/${y}`;wanted.add(key);
    const e=tileCache.get(key);if(e){e.lastUsed=performance.now();e.targetOpacity=1;}else if(!pendingKeys.has(key)){pendingKeys.add(key);enqueue(()=>loadTile(z,x,y));}
   }
   const ready=[...wanted].filter(k=>tileCache.get(k)?.state==='ready').length,threshold=Math.max(1,Math.ceil(wanted.size*.34));
   if(ready>=threshold){for(const e of tileCache.values())if(!wanted.has(e.key))e.targetOpacity=0;lodState=ready===wanted.size?'ONLINE':'ENHANCING';}else lodState='LOADING';
   if(tileCache.size>profile.cache){const victims=[...tileCache.values()].filter(e=>!wanted.has(e.key)).sort((a,b)=>a.lastUsed-b.lastUsed);while(tileCache.size>profile.cache&&victims.length){const e=victims.shift();if(e.mesh){lodGroup.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.uniforms.tMap.value.dispose();e.mesh.material.dispose();}tileCache.delete(e.key);}}
  }
  function animateTiles(dt){for(const e of tileCache.values()){if(e.state!=='ready'||!e.mesh)continue;e.opacity=smooth(e.opacity,e.targetOpacity,.009,dt);e.mesh.material.uniforms.uOpacity.value=e.opacity;e.mesh.material.uniforms.uSunDir.value.copy(sunInfo.dir);e.mesh.visible=!(e.opacity<.004&&e.targetOpacity===0);}}
  function disposeLod(){for(const e of tileCache.values())if(e.mesh){lodGroup.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.uniforms.tMap.value.dispose();e.mesh.material.dispose();}tileCache.clear();pendingKeys.clear();queue.length=0;}
  function applySun(state){sunInfo=state;surfaceUniforms.uSunDir.value.copy(state.dir);cloudUniforms?.uSunDir.value.copy(state.dir);atmoUniforms.uSunDir.value.copy(state.dir);auroraUniforms.uSunDir.value.copy(state.dir);}

  async function progressiveTextures(){
   if(!profile.hiGlobal||navigator.connection?.saveData)return;
   await new Promise(resolve=>(window.requestIdleCallback||((cb)=>setTimeout(cb,700)))(()=>resolve(),{timeout:1500}));if(disposed)return;
   const max=renderer.capabilities.maxTextureSize||4096;
   const jobs=[];
   if(max>=8192)jobs.push(['day',TEXTURES.high.day,true]);
   if(profile.tier!=='MOBILE'&&max>=4096)jobs.push(['clouds',TEXTURES.high.clouds,true],['water',TEXTURES.high.water,false]);
   if(profile.tier==='HIGH'&&max>=16384)jobs.push(['night',TEXTURES.high.night,true]);
   for(const [kind,url,color] of jobs){
    if(disposed)break;
    try{
     const tex=await loadTexture(url,color);if(disposed){tex.dispose();break;}
     const map={day:'tDay',night:'tNight',water:'tWater',clouds:'tCloud'}[kind],old=surfaceUniforms[map].value;surfaceUniforms[map].value=tex;
     if(kind==='clouds'&&cloudUniforms)cloudUniforms.tCloud.value=tex;if(kind==='day')globalDetail='5K NASA GLOBAL';if(old!==neutral)old.dispose?.();
    }catch(error){console.info('[PARANORMAL WIKI EARTH] high-resolution texture skipped',kind,error?.message||error);}
   }
  }

  function resize(){
   if(!renderer||disposed)return;const r=root.getBoundingClientRect(),full=isFullscreen(),cap=full?Math.min(profile.dpr+.12,2.05):profile.dpr;
   renderer.setPixelRatio(Math.min(devicePixelRatio||1,cap));renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(.1,r.width/r.height);
   const close=distance<1.25;camera.fov=full?(r.width<r.height?(close?46:35):(close?39:28)):(r.width<520?(close?48:34):(close?42:30));camera.updateProjectionMatrix();
  }
  resizeObs=new ResizeObserver(resize);resizeObs.observe(root);cleanup.push(()=>resizeObs.disconnect());resize();
  if('IntersectionObserver'in window){visibilityIo=new IntersectionObserver(entries=>{inView=!!entries[0]?.isIntersecting;if(inView||isFullscreen())requestFrame();else if(raf){cancelAnimationFrame(raf);raf=0;}},{rootMargin:'160px 0px'});visibilityIo.observe(root);cleanup.push(()=>visibilityIo.disconnect());}
  on(canvas,'webglcontextlost',e=>{e.preventDefault();if(raf){cancelAnimationFrame(raf);raf=0;}root.classList.remove('ua-ready');root.classList.add('ua-fallback');});
  on(canvas,'webglcontextrestored',()=>{root.classList.remove('ua-fallback');setReady();lastT=performance.now();requestFrame();});

  function updateDiagnostics(t){
   if(t-lastDiag<300)return;lastDiag=t;const d=sunInfo?.date||new Date(),alt=Math.max(0,(distance-1)*EARTH_RADIUS_KM),active=[...tileCache.values()].filter(e=>e.state==='ready'&&e.opacity>.03).length;
   if(diag.utc)diag.utc.textContent=d.toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC');if(diag.lon)diag.lon.textContent=(sunInfo?.lon??0).toFixed(1)+'°';if(diag.decl)diag.decl.textContent=(sunInfo?.decl??0).toFixed(1)+'°';
   if(diag.altitude)diag.altitude.textContent=alt>=10000?`${Math.round(alt/100)*100} KM`:`${Math.round(alt)} KM`;if(diag.lod)diag.lod.textContent=lodLevel?String(lodLevel):'GLOBAL';if(diag.tiles)diag.tiles.textContent=String(active);if(diag.detail)diag.detail.textContent=`${lodState}${terrainState==='UNAVAILABLE'?' / RELIEF FALLBACK':''}`;if(diag.render)diag.render.textContent=profile.label;if(diag.fps)diag.fps.textContent=fpsValue?String(Math.round(fpsValue)):'--';
   if(qualityNode)qualityNode.textContent=lodLevel?`${profile.label} · LOD ${lodLevel}`:`${profile.label} · ${globalDetail}`;
  }
  function updateCamera(){const ce=Math.cos(elevation);camera.position.set(Math.cos(azimuth)*ce*distance,Math.sin(elevation)*distance,-Math.sin(azimuth)*ce*distance);camera.lookAt(0,0,0);surfaceUniforms.uCameraPos.value.copy(camera.position);atmoUniforms.uCameraPos.value.copy(camera.position);}
  function frame(t){
   raf=0;if(disposed||!visible||(!inView&&!isFullscreen()))return;const dt=Math.min(.05,(t-lastT)/1000||.016);lastT=t;const dragging=pointers.size>0,idle=!dragging&&!reduced.matches&&(t-lastMove>idleDelay);
   if(idle&&toggles.auto&&distance>1.20)targetAzimuth+=dt*.008;
   if(!dragging){targetAzimuth+=velAz*60*dt;targetElevation=clamp(targetElevation+velEl*60*dt,-1.45,1.45);const damping=distance<1.2?.80:.90;velAz*=Math.pow(damping,dt*60);velEl*=Math.pow(damping,dt*60);}
   azimuth=smooth(azimuth,targetAzimuth,.0008,dt);elevation=smooth(elevation,targetElevation,.0008,dt);distance=smooth(distance,clampDistance(targetDistance),.0011,dt);azimuth=wrapRadians(azimuth);targetAzimuth=wrapRadians(targetAzimuth);updateCamera();
   if(!reduced.matches)cloudOffset=(cloudOffset+dt*.00042)%1;surfaceUniforms.uCloudOffset.value=cloudOffset;if(cloudUniforms)cloudUniforms.uCloudOffset.value=cloudOffset;if(auroraUniforms)auroraUniforms.uTime.value=t/1000;
   if(t-lastSunUpdate>1000){lastSunUpdate=t;const s=toggles.realtime?solarState(THREE,new Date()):(sunFrozen||sunInfo);if(s)applySun(s);}
   if(t-lastLodUpdate>220){lastLodUpdate=t;updateLod();}animateTiles(dt);
   if(starGroup&&!reduced.matches){starGroup.position.x=-camera.position.x*.0035;starGroup.position.y=-camera.position.y*.0035;starGroup.position.z=-camera.position.z*.0035;}
   frames++;const elapsed=t-fpsStart;if(elapsed>=1000){fpsValue=frames*1000/elapsed;frames=0;fpsStart=t;if(fpsValue<22&&profile.tier==='MOBILE'&&profile.maxLod>9)profile.maxLod--;}
   updateDiagnostics(t);renderer.render(scene,camera);requestFrame();
  }
  function requestFrame(){if(disposed||raf||!visible||(!inView&&!isFullscreen()))return;raf=requestAnimationFrame(frame);}

  const future={markers:new Map(),layers:new Map(),overlays:new Map()};
  const api={
   version:VERSION,
   destroy(){if(disposed)return;disposed=true;if(raf)cancelAnimationFrame(raf);for(const f of cleanup.splice(0))try{f()}catch{}document.body.classList.remove('ua-earth-lock');disposeLod();if(scene)scene.traverse(o=>{o.geometry?.dispose?.();if(o.material){for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.dispose?.();}});const seen=new Set();for(const u of [surfaceUniforms?.tDay,surfaceUniforms?.tWater,surfaceUniforms?.tCloud,surfaceUniforms?.tNight]){const tex=u?.value;if(tex&&!seen.has(tex)){seen.add(tex);tex.dispose?.();}}renderer?.dispose?.();mounted.delete(root);},
   reset:resetView,
   flyTo(target={}){const lat=clamp(Number(target.lat)||0,-84,84),lon=Number(target.lon)||0;targetElevation=rad(lat);targetAzimuth=wrapRadians(rad(lon));if(Number.isFinite(target.altitude))targetDistance=clampDistance(1+Math.max(isFullscreen()?120:250,target.altitude)/EARTH_RADIUS_KM);else if(Number.isFinite(target.distance))targetDistance=clampDistance(target.distance);userInteracted=true;lastMove=performance.now();requestFrame();},
   focusRegion(target){this.flyTo(target);},
   addMarker(marker={}){const id=String(marker.id||`future-${future.markers.size+1}`);future.markers.set(id,{...marker,id});return id;},
   removeMarker(id){return future.markers.delete(String(id));},setMarkerLayer(name,value){future.layers.set(String(name),value);return true;},setOverlay(name,value){future.overlays.set(String(name),value);return true;},
   getFutureState(){return {markers:new Map(future.markers),layers:new Map(future.layers),overlays:new Map(future.overlays)};},
   getObservationState(){return {altitudeKm:Math.max(0,(distance-1)*EARTH_RADIUS_KM),lod:lodLevel,detail:lodState,activeTiles:[...tileCache.values()].filter(e=>e.state==='ready'&&e.opacity>.03).length,center:vectorToLatLon(camera.position),globalDetail};}
  };
  mounted.set(root,api);setReady();refreshToggleLabels();updateFsLabel();lastT=performance.now();requestFrame();progressiveTextures();return api;
 }catch(err){fail(err);const api={version:VERSION,destroy(){disposed=true;},reset:resetView};mounted.set(root,api);return api;}
}

function watch(){
 const io='IntersectionObserver'in window?new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){io.unobserve(e.target);mount(e.target)}},{rootMargin:'220px 0px'}):null;
 function scan(){document.querySelectorAll('[data-unseen-earth]').forEach(el=>{if(mounted.has(el)||el.dataset.uaObserved)return;el.dataset.uaObserved='1';if(io)io.observe(el);else mount(el);});}
 const mo=new MutationObserver(scan);mo.observe(document.documentElement,{childList:true,subtree:true});scan();
 addEventListener('pagehide',()=>{document.querySelectorAll('[data-unseen-earth]').forEach(el=>mounted.get(el)?.destroy?.());mo.disconnect();io?.disconnect?.();},{once:true});
}

window.UnseenEarth={version:VERSION,mount,get(root){return mounted.get(root)||null;},addMarker(root,marker){return mounted.get(root)?.addMarker?.(marker);},removeMarker(root,id){return mounted.get(root)?.removeMarker?.(id);},setMarkerLayer(root,name,value){return mounted.get(root)?.setMarkerLayer?.(name,value);},flyTo(root,target){return mounted.get(root)?.flyTo?.(target);},focusRegion(root,target){return mounted.get(root)?.focusRegion?.(target);},setOverlay(root,name,value){return mounted.get(root)?.setOverlay?.(name,value);}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
})();
