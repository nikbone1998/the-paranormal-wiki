/* THE PARANORMAL WIKI — Earth Observation Engine v2
 * Earth rendering only: no entity coordinates, case markers, dossier links, or paranormal overlays.
 * Three.js is lazy-loaded after the existing homepage globe enters the viewport.
 */
(function(){
'use strict';

const VERSION='2.0.0-observation';
const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const TEXTURES={
  base:{
    day:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_atmos_2048.jpg',
    water:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_specular_2048.jpg',
    clouds:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_clouds_1024.png',
    night:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_lights_2048.png'
  },
  high:{
    // NASA Blue Marble Next Generation / Black Marble imagery. High-resolution loads are opportunistic.
    day:'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg',
    night:'https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg',
    // CC0 daily cloud/specular maps generated from NASA imagery; GitHub Pages explicitly permits CORS.
    clouds:'https://matteason.github.io/daily-cloud-maps/4096x2048-clouds-alpha.png',
    water:'https://matteason.github.io/daily-cloud-maps/4096x2048-specular.jpg'
  }
};

let threePromise=null;
const mounted=new WeakMap();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const TAU=Math.PI*2;

function loadThree(){return threePromise||(threePromise=import(THREE_URL));}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function rad(d){return d*Math.PI/180;}
function deg(r){return r*180/Math.PI;}
function smooth(current,target,rate,dt){return current+(target-current)*(1-Math.pow(rate,dt));}
function wrapRadians(v){while(v>Math.PI)v-=TAU;while(v<-Math.PI)v+=TAU;return v;}

function fallbackSvg(){
 const s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700"><defs><radialGradient id="b"><stop stop-color="#06153f"/><stop offset=".62" stop-color="#020619"/><stop offset="1"/></radialGradient><radialGradient id="e" cx="37%" cy="30%"><stop stop-color="#70c7ff"/><stop offset=".22" stop-color="#1767b8"/><stop offset=".66" stop-color="#06316f"/><stop offset="1" stop-color="#001028"/></radialGradient><filter id="g"><feGaussianBlur stdDeviation="18"/></filter></defs><rect width="1200" height="700" fill="url(#b)"/><g fill="#fff" opacity=".65">${Array.from({length:90},(_,i)=>`<circle cx="${(i*137)%1180+10}" cy="${(i*83)%680+10}" r="${i%7===0?1.6:.8}"/>`).join('')}</g><circle cx="600" cy="350" r="236" fill="#2aaeff" opacity=".18" filter="url(#g)"/><circle cx="600" cy="350" r="210" fill="url(#e)" stroke="#7ad8ff" stroke-opacity=".6"/><path d="M463 242l57-49 73 18 20 45-34 22-49-11-35 29-54-10zm148 58l45-23 57 20 42 66-31 41-29-14-26 60-41 28-18-44 19-54-40-31zm-126 98l44-52 31 22-11 52-28 43-42-21z" fill="#278653" opacity=".85"/><path d="M454 225c65-48 164-70 253-26" fill="none" stroke="#fff" stroke-opacity=".48" stroke-width="8"/><ellipse cx="527" cy="269" rx="77" ry="18" fill="#fff" opacity=".32"/><ellipse cx="681" cy="375" rx="88" ry="15" fill="#fff" opacity=".25"/></svg>`;
 return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(s);
}

function qualityProfile(){
 const mobile=matchMedia('(max-width:680px)').matches;
 const mem=Number(navigator.deviceMemory||4);
 const cores=Number(navigator.hardwareConcurrency||4);
 const saveData=!!navigator.connection?.saveData;
 if(mobile||mem<=4||cores<=4)return {tier:'MOBILE',label:'ADAPTIVE / MOBILE',segments:72,dpr:1.45,stars:[320,220,120],hi:false};
 if(!saveData&&mem>=8&&cores>=6)return {tier:'HIGH',label:'HIGH / DESKTOP',segments:128,dpr:1.9,stars:[700,440,220],hi:true};
 return {tier:'ADAPTIVE',label:'ADAPTIVE / DESKTOP',segments:96,dpr:1.65,stars:[480,300,160],hi:false};
}

function solarState(THREE,date=new Date()){
 // Approximate subsolar longitude/declination for visualization, not navigation.
 const start=Date.UTC(date.getUTCFullYear(),0,0);
 const now=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
 const n=Math.floor((now-start)/86400000);
 const h=date.getUTCHours()+date.getUTCMinutes()/60+date.getUTCSeconds()/3600;
 const decl=23.44*Math.sin((TAU/365)*(n-81));
 const lon=180-h*15;
 const dr=rad(decl),lr=rad(lon);
 const dir=new THREE.Vector3(Math.cos(dr)*Math.sin(lr),Math.sin(dr),Math.cos(dr)*Math.cos(lr)).normalize();
 return {dir,decl,lon,date};
}

function seeded(seed){
 let s=seed>>>0;
 return function(){
   s=(s*1664525+1013904223)>>>0;
   return s/4294967296;
 };
}

function makeStarLayer(THREE,count,minR,maxR,size,opacity,seed,band=false){
 const rnd=seeded(seed),pos=[],colors=[];
 for(let i=0;i<count;i++){
   const r=minR+rnd()*(maxR-minR);
   const th=rnd()*TAU;
   let y;
   if(band){
     const spread=(rnd()+rnd()+rnd()-1.5)*.20;
     y=clamp(spread,-.46,.46);
   }else{
     y=rnd()*2-1;
   }
   const rr=Math.sqrt(Math.max(0,1-y*y));
   pos.push(r*rr*Math.cos(th),r*y,r*rr*Math.sin(th));
   const t=rnd();
   if(t<.08)colors.push(.72,.82,1.0);
   else if(t>.94)colors.push(1.0,.82,.64);
   else colors.push(.88,.91,1.0);
 }
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const m=new THREE.PointsMaterial({size,sizeAttenuation:true,transparent:true,opacity,vertexColors:true,depthWrite:false});
 return new THREE.Points(g,m);
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
  CAMERA DISTANCE: <span data-earth-distance>--</span><br>
  RENDER: <span data-earth-render>--</span> · FPS: <span data-earth-fps>--</span>
 </div>
 <div class="ua-observation-note">VISUALIZATION ONLY // ENTITY LAYER STANDBY // NO LIVE PARANORMAL DETECTION</div>`;
 root.appendChild(panel);

 const boot=document.createElement('div');
 boot.className='ua-observation-boot';
 boot.setAttribute('aria-hidden','true');
 boot.innerHTML=`<div><b>THE PARANORMAL WIKI</b><br>GLOBAL OBSERVATION SYSTEM<br><br>
 GEOSPHERE LINK ........ ONLINE<br>
 PLANETARY MODEL ....... LOADED<br>
 SUN VECTOR ............ CALCULATED<br>
 CLOUD LAYER ........... ONLINE<br>
 ARCHIVE ENTITY LAYER .. STANDBY</div>`;
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

 const panel=root.querySelector('.ua-observation-panel');
 const boot=root.querySelector('.ua-observation-boot');
 const diag={
   utc:root.querySelector('[data-earth-utc]'),
   lon:root.querySelector('[data-earth-sunlon]'),
   decl:root.querySelector('[data-earth-decl]'),
   distance:root.querySelector('[data-earth-distance]'),
   render:root.querySelector('[data-earth-render]'),
   fps:root.querySelector('[data-earth-fps]')
 };

 const cleanup=[];
 let disposed=false,raf=0,resizeObs=null,visibilityIo=null;
 let THREE,renderer,scene,camera,earth,clouds,atmosphere,aurora,starGroup,surfaceUniforms,cloudUniforms,atmoUniforms,auroraUniforms;
 let lastT=performance.now(),lastMove=performance.now(),lastSunUpdate=0,lastDiag=0;
 let inView=true,visible=!document.hidden,pseudoFullscreen=false;
 let frames=0,fpsValue=0,fpsStart=performance.now();

 const toggles={clouds:true,lights:true,atmosphere:true,aurora:true,realtime:true,auto:true};
 let azimuth=-.42,elevation=.14,distance=3.03;
 let targetAzimuth=azimuth,targetElevation=elevation,targetDistance=distance;
 let velAz=0,velEl=0,cloudOffset=0;
 const idleDelay=4200;
 let sunFrozen=null,sunInfo=null;
 const pointers=new Map();
 let dragId=null,lastX=0,lastY=0,lastPinch=0;

 function on(el,type,fn,opt){
   if(!el)return;
   el.addEventListener(type,fn,opt);
   cleanup.push(()=>el.removeEventListener(type,fn,opt));
 }
 function setReady(){
   root.classList.remove('ua-fallback');
   root.classList.add('ua-ready');
 }
 function fail(err){
   console.warn('[PARANORMAL WIKI EARTH] fallback',err);
   if(disposed)return;
   root.classList.remove('ua-ready');
   root.classList.add('ua-fallback');
 }
 function resetView(){
   targetAzimuth=-.42;
   targetElevation=.14;
   targetDistance=3.03;
   velAz=velEl=0;
   lastMove=performance.now();
 }
 function isFullscreen(){
   return document.fullscreenElement===root||pseudoFullscreen;
 }
 function bootObservation(){
   if(!boot)return;
   root.classList.add('ua-observation-booting');
   const delay=reduced.matches?80:980;
   setTimeout(()=>{if(!disposed)root.classList.remove('ua-observation-booting')},delay);
 }
 async function enterObservation(){
   try{
     if(root.requestFullscreen){
       await root.requestFullscreen();
     }else{
       pseudoFullscreen=true;
       root.classList.add('ua-pseudo-fullscreen','ua-observation-mode');
       document.body.classList.add('ua-earth-lock');
       bootObservation();
       resize();
     }
   }catch(_error){
     pseudoFullscreen=true;
     root.classList.add('ua-pseudo-fullscreen','ua-observation-mode');
     document.body.classList.add('ua-earth-lock');
     bootObservation();
     resize();
   }
 }
 async function leaveObservation(){
   try{
     if(document.fullscreenElement===root)await document.exitFullscreen();
   }catch(_error){}
   if(pseudoFullscreen){
     pseudoFullscreen=false;
     root.classList.remove('ua-pseudo-fullscreen','ua-observation-mode');
     document.body.classList.remove('ua-earth-lock');
     resize();
   }
 }
 function toggleObservation(){
   if(isFullscreen())leaveObservation();else enterObservation();
 }
 function updateFsLabel(){
   if(fs)fs.textContent=isFullscreen()?'[ CLOSE FULL EARTH VIEW ]':'[ OPEN FULL EARTH VIEW ]';
 }
 function refreshToggleLabels(){
   root.querySelectorAll('[data-earth-toggle]').forEach(btn=>{
     const key=btn.dataset.earthToggle;
     const names={clouds:'CLOUDS',lights:'CITY LIGHTS',atmosphere:'ATMOSPHERE',aurora:'AURORA',realtime:'REAL-TIME SUN',auto:'AUTO ORBIT'};
     btn.textContent=`[ ${names[key]}: ${toggles[key]?'ON':'OFF'} ]`;
   });
 }
 function applyToggle(key){
   toggles[key]=!toggles[key];
   if(key==='clouds'&&clouds)clouds.visible=toggles.clouds;
   if(key==='atmosphere'&&atmosphere)atmosphere.visible=toggles.atmosphere;
   if(key==='aurora'&&aurora)aurora.visible=toggles.aurora;
   if(key==='lights'&&surfaceUniforms)surfaceUniforms.uLightsOn.value=toggles.lights?1:0;
   if(key==='realtime'&&!toggles.realtime&&sunInfo)sunFrozen={...sunInfo,dir:sunInfo.dir.clone()};
   if(key==='realtime'&&toggles.realtime)sunFrozen=null;
   refreshToggleLabels();
   lastMove=performance.now();
 }

 on(reset,'click',resetView);
 on(fs,'click',toggleObservation);
 on(root.querySelector('[data-earth-observation-reset]'),'click',resetView);
 on(root.querySelector('[data-earth-observation-close]'),'click',leaveObservation);
 root.querySelectorAll('[data-earth-toggle]').forEach(btn=>on(btn,'click',()=>applyToggle(btn.dataset.earthToggle)));

 on(document,'fullscreenchange',()=>{
   const active=document.fullscreenElement===root;
   root.classList.toggle('ua-observation-mode',active||pseudoFullscreen);
   if(active)bootObservation();
   updateFsLabel();
   resize();
 });
 on(document,'visibilitychange',()=>{
   visible=!document.hidden;
   if(visible)requestFrame();
   else if(raf){cancelAnimationFrame(raf);raf=0;}
 });

 on(root,'keydown',e=>{
   const s=.075;
   if(e.key==='ArrowLeft')targetAzimuth-=s;
   else if(e.key==='ArrowRight')targetAzimuth+=s;
   else if(e.key==='ArrowUp')targetElevation=clamp(targetElevation+s,-1.22,1.22);
   else if(e.key==='ArrowDown')targetElevation=clamp(targetElevation-s,-1.22,1.22);
   else if(e.key==='+'||e.key==='=')targetDistance=clamp(targetDistance-.18,1.48,5.2);
   else if(e.key==='-'||e.key==='_')targetDistance=clamp(targetDistance+.18,1.48,5.2);
   else return;
   e.preventDefault();
   lastMove=performance.now();
 });

 on(root,'wheel',e=>{
   e.preventDefault();
   targetDistance=clamp(targetDistance+e.deltaY*.00225,1.48,5.2);
   lastMove=performance.now();
 },{passive:false});

 function pinchDistance(){
   const a=[...pointers.values()];
   return a.length<2?0:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
 }
 on(root,'pointerdown',e=>{
   pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   root.setPointerCapture?.(e.pointerId);
   lastMove=performance.now();
   if(pointers.size===1){
     dragId=e.pointerId;lastX=e.clientX;lastY=e.clientY;
     root.classList.add('ua-dragging');
   }else if(pointers.size===2){
     lastPinch=pinchDistance();dragId=null;
   }
 },{passive:true});
 on(root,'pointermove',e=>{
   if(!pointers.has(e.pointerId))return;
   pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   lastMove=performance.now();
   if(pointers.size>=2){
     const d=pinchDistance();
     if(lastPinch)targetDistance=clamp(targetDistance-(d-lastPinch)*.0062,1.48,5.2);
     lastPinch=d;
     return;
   }
   if(dragId===e.pointerId){
     const dx=e.clientX-lastX,dy=e.clientY-lastY;
     lastX=e.clientX;lastY=e.clientY;
     targetAzimuth-=dx*.0061;
     targetElevation=clamp(targetElevation+dy*.0052,-1.22,1.22);
     velAz=-dx*.0005;
     velEl=dy*.00042;
   }
 },{passive:true});
 function endPointer(e){
   pointers.delete(e.pointerId);
   if(e.pointerId===dragId)dragId=null;
   if(pointers.size<2)lastPinch=0;
   if(!pointers.size)root.classList.remove('ua-dragging');
   lastMove=performance.now();
 }
 on(root,'pointerup',endPointer);
 on(root,'pointercancel',endPointer);
 on(root,'lostpointercapture',endPointer);

 try{
   THREE=await loadThree();
   if(disposed)return;

   renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance',premultipliedAlpha:false});
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   renderer.toneMapping=THREE.ACESFilmicToneMapping;
   renderer.toneMappingExposure=1.0;

   scene=new THREE.Scene();
   camera=new THREE.PerspectiveCamera(31,1,.04,80);

   const loader=new THREE.TextureLoader();
   loader.setCrossOrigin('anonymous');
   const loadTexture=(url,color=false)=>new Promise((resolve,reject)=>loader.load(url,t=>{
     if(color)t.colorSpace=THREE.SRGBColorSpace;
     t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
     t.wrapS=THREE.RepeatWrapping;
     resolve(t);
   },undefined,reject));

   const base=await Promise.allSettled([
     loadTexture(TEXTURES.base.day,true),
     loadTexture(TEXTURES.base.water,false),
     loadTexture(TEXTURES.base.clouds,true),
     loadTexture(TEXTURES.base.night,true)
   ]);
   if(disposed)return;
   const [dayTex,waterTex,cloudTex,nightTex]=base.map(r=>r.status==='fulfilled'?r.value:null);
   if(!dayTex)throw new Error('Earth day texture unavailable');

   const neutral=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat);
   neutral.needsUpdate=true;
   const geo=new THREE.SphereGeometry(1,profile.segments,profile.segments);

   sunInfo=solarState(THREE,new Date());

   surfaceUniforms={
     tDay:{value:dayTex},
     tWater:{value:waterTex||neutral},
     tCloud:{value:cloudTex||neutral},
     tNight:{value:nightTex||neutral},
     uSunDir:{value:sunInfo.dir.clone()},
     uCameraPos:{value:new THREE.Vector3()},
     uCloudOffset:{value:0},
     uLightsOn:{value:1},
     uCloudShadowsOn:{value:cloudTex?1:0}
   };

   const surfaceMaterial=new THREE.ShaderMaterial({
     uniforms:surfaceUniforms,
     vertexShader:`varying vec2 vUv;varying vec3 vWorldNormal;varying vec3 vWorldPos;
       void main(){
         vUv=uv;
         vWorldNormal=normalize(mat3(modelMatrix)*normal);
         vec4 wp=modelMatrix*vec4(position,1.0);
         vWorldPos=wp.xyz;
         gl_Position=projectionMatrix*viewMatrix*wp;
       }`,
     fragmentShader:`precision highp float;
       uniform sampler2D tDay;uniform sampler2D tWater;uniform sampler2D tCloud;uniform sampler2D tNight;
       uniform vec3 uSunDir;uniform vec3 uCameraPos;uniform float uCloudOffset;uniform float uLightsOn;uniform float uCloudShadowsOn;
       varying vec2 vUv;varying vec3 vWorldNormal;varying vec3 vWorldPos;
       float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
       void main(){
         vec3 N=normalize(vWorldNormal);
         vec3 S=normalize(uSunDir);
         vec3 V=normalize(uCameraPos-vWorldPos);
         float ndl=dot(N,S);
         float sun=max(ndl,0.0);
         vec3 day=texture2D(tDay,vUv).rgb;
         float water=smoothstep(.18,.58,lum(texture2D(tWater,vUv).rgb));
         vec2 cuv=vec2(fract(vUv.x+uCloudOffset),clamp(vUv.y,0.001,.999));
         vec2 suv=vec2(fract(vUv.x+uCloudOffset+uSunDir.x*.0035),clamp(vUv.y-uSunDir.y*.0025,.001,.999));
         vec4 cs=texture2D(tCloud,suv);
         float cloud=max(lum(cs.rgb),cs.a*.82);
         float shadow=smoothstep(.18,.82,cloud)*uCloudShadowsOn*sun*.115;
         float ambient=.025+.035*(1.0-water);
         vec3 surface=day*(ambient+sun*.975);
         surface*=1.0-shadow;
         vec3 H=normalize(S+V);
         float oceanGlint=pow(max(dot(N,H),0.0),110.0)*water*smoothstep(-.03,.22,ndl);
         float oceanFresnel=pow(1.0-max(dot(N,V),0.0),4.0)*water*smoothstep(-.04,.35,ndl);
         surface+=vec3(.72,.86,1.0)*oceanGlint*.75;
         surface+=vec3(.03,.12,.19)*oceanFresnel*.32;
         vec3 ntex=texture2D(tNight,vUv).rgb;
         float nl=lum(ntex);
         vec3 warm=mix(ntex,ntex*vec3(1.22,.88,.60),.38);
         float darkness=1.0-smoothstep(-.18,.12,ndl);
         float cityGate=smoothstep(.045,.52,nl);
         vec3 city=warm*(.55+cityGate*.8)*darkness*uLightsOn;
         vec3 color=surface+city;
         float limb=pow(1.0-max(dot(N,V),0.0),3.0);
         color+=vec3(.035,.12,.24)*limb*smoothstep(-.05,.45,ndl)*.32;
         gl_FragColor=vec4(color,1.0);
       }`
   });
   earth=new THREE.Mesh(geo,surfaceMaterial);
   scene.add(earth);

   if(cloudTex){
     cloudUniforms={
       tCloud:{value:cloudTex},
       uSunDir:{value:sunInfo.dir.clone()},
       uCloudOffset:{value:0}
     };
     const cloudMaterial=new THREE.ShaderMaterial({
       uniforms:cloudUniforms,transparent:true,depthWrite:false,side:THREE.FrontSide,
       vertexShader:`varying vec2 vUv;varying vec3 vWorldNormal;
         void main(){vUv=uv;vWorldNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
       fragmentShader:`precision mediump float;uniform sampler2D tCloud;uniform vec3 uSunDir;uniform float uCloudOffset;
         varying vec2 vUv;varying vec3 vWorldNormal;
         float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
         void main(){
           vec2 uv=vec2(fract(vUv.x+uCloudOffset),vUv.y);
           vec4 s=texture2D(tCloud,uv);
           float a=smoothstep(.07,.78,max(lum(s.rgb),s.a*.8));
           float day=.12+.88*smoothstep(-.28,.30,dot(normalize(vWorldNormal),normalize(uSunDir)));
           vec3 c=mix(vec3(.20,.24,.31),vec3(1.0,.99,.97),day);
           gl_FragColor=vec4(c,a*(.17+.54*day));
         }`
     });
     clouds=new THREE.Mesh(new THREE.SphereGeometry(1.013,profile.segments,profile.segments),cloudMaterial);
     scene.add(clouds);
   }

   atmoUniforms={uSunDir:{value:sunInfo.dir.clone()},uCameraPos:{value:new THREE.Vector3()}};
   const atmoMaterial=new THREE.ShaderMaterial({
     uniforms:atmoUniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.FrontSide,
     vertexShader:`varying vec3 vN;varying vec3 vP;void main(){vN=normalize(mat3(modelMatrix)*normal);vec4 wp=modelMatrix*vec4(position,1.0);vP=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,
     fragmentShader:`precision mediump float;uniform vec3 uSunDir;uniform vec3 uCameraPos;varying vec3 vN;varying vec3 vP;
       void main(){
         vec3 N=normalize(vN),V=normalize(uCameraPos-vP),S=normalize(uSunDir);
         float rim=pow(1.0-max(dot(N,V),0.0),4.7);
         float sd=dot(N,S);
         float day=smoothstep(-.30,.26,sd);
         float terminator=(1.0-smoothstep(.015,.20,abs(sd)))*smoothstep(-.22,.08,sd);
         vec3 blue=mix(vec3(.025,.10,.40),vec3(.10,.52,1.0),pow(day,.7));
         vec3 warm=vec3(1.0,.24,.045)*terminator;
         float a=rim*(.035+.50*day)+rim*terminator*.19;
         gl_FragColor=vec4(blue*rim*(.11+.64*day)+warm*rim*.48,clamp(a,0.0,.63));
       }`
   });
   atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.036,profile.segments,profile.segments),atmoMaterial);
   scene.add(atmosphere);

   auroraUniforms={uSunDir:{value:sunInfo.dir.clone()},uTime:{value:0}};
   const auroraMaterial=new THREE.ShaderMaterial({
     uniforms:auroraUniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
     vertexShader:`varying vec3 vLocal;varying vec3 vWorldNormal;void main(){vLocal=normalize(position);vWorldNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
     fragmentShader:`precision mediump float;uniform vec3 uSunDir;uniform float uTime;varying vec3 vLocal;varying vec3 vWorldNormal;
       void main(){
         float lat=abs(vLocal.y);
         float band=smoothstep(.70,.78,lat)*(1.0-smoothstep(.94,.995,lat));
         float lon=atan(vLocal.z,vLocal.x);
         float wave=.5+.5*sin(lon*7.0+uTime*.17+sin(lon*3.0-uTime*.09)*1.7);
         float fine=.5+.5*sin(lon*19.0-uTime*.11+vLocal.y*28.0);
         float curtain=smoothstep(.30,.92,wave*.68+fine*.32);
         float night=1.0-smoothstep(-.12,.16,dot(normalize(vWorldNormal),normalize(uSunDir)));
         float pole=smoothstep(.84,.96,lat);
         vec3 color=mix(vec3(.05,1.0,.42),vec3(1.0,.12,.08),pole*.22);
         float alpha=band*curtain*night*.115;
         gl_FragColor=vec4(color*alpha*1.8,alpha);
       }`
   });
   aurora=new THREE.Mesh(new THREE.SphereGeometry(1.025,profile.segments,profile.segments),auroraMaterial);
   scene.add(aurora);

   starGroup=new THREE.Group();
   const a=makeStarLayer(THREE,profile.stars[0],7,11,.012,.50,81031,false);
   const b=makeStarLayer(THREE,profile.stars[1],12,20,.017,.40,22091,false);
   const c=makeStarLayer(THREE,profile.stars[2],18,32,.021,.28,99173,false);
   const milky=makeStarLayer(THREE,profile.tier==='HIGH'?800:420,19,34,.024,.085,61297,true);
   milky.rotation.z=.54;milky.rotation.x=.31;
   starGroup.add(a,b,c,milky);
   scene.add(starGroup);

   function applySun(state){
     sunInfo=state;
     surfaceUniforms.uSunDir.value.copy(state.dir);
     cloudUniforms?.uSunDir.value.copy(state.dir);
     atmoUniforms.uSunDir.value.copy(state.dir);
     auroraUniforms.uSunDir.value.copy(state.dir);
   }

   async function progressiveTextures(){
     if(!profile.hi||navigator.connection?.saveData)return;
     await new Promise(resolve=>(window.requestIdleCallback||((cb)=>setTimeout(cb,1200)))(()=>resolve(),{timeout:2200}));
     if(disposed)return;
     const max=renderer.capabilities.maxTextureSize||4096;
     const jobs=[];
     if(max>=8192)jobs.push(['day',TEXTURES.high.day,true]);
     if(max>=4096)jobs.push(['clouds',TEXTURES.high.clouds,true],['water',TEXTURES.high.water,false]);
     if(max>=16384)jobs.push(['night',TEXTURES.high.night,true]);
     for(const [kind,url,color] of jobs){
       if(disposed)break;
       try{
         const tex=await loadTexture(url,color);
         if(disposed){tex.dispose();break;}
         if(kind==='day'){
           const old=surfaceUniforms.tDay.value;surfaceUniforms.tDay.value=tex;if(old!==neutral)old.dispose?.();
         }else if(kind==='night'){
           const old=surfaceUniforms.tNight.value;surfaceUniforms.tNight.value=tex;if(old!==neutral)old.dispose?.();
         }else if(kind==='water'){
           const old=surfaceUniforms.tWater.value;surfaceUniforms.tWater.value=tex;if(old!==neutral)old.dispose?.();
         }else if(kind==='clouds'){
           const old=surfaceUniforms.tCloud.value;surfaceUniforms.tCloud.value=tex;
           if(cloudUniforms)cloudUniforms.tCloud.value=tex;
           if(old!==neutral)old.dispose?.();
         }
       }catch(error){
         console.info('[PARANORMAL WIKI EARTH] high-resolution texture skipped',kind,error?.message||error);
       }
     }
   }

   function resize(){
     if(!renderer||disposed)return;
     const r=root.getBoundingClientRect();
     const full=isFullscreen();
     const cap=full?Math.min(profile.dpr+.18,2.05):profile.dpr;
     renderer.setPixelRatio(Math.min(devicePixelRatio||1,cap));
     renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);
     camera.aspect=Math.max(.1,r.width/r.height);
     camera.fov=full?(r.width<r.height?36:29):(r.width<520?35:31);
     camera.updateProjectionMatrix();
   }

   resizeObs=new ResizeObserver(resize);resizeObs.observe(root);cleanup.push(()=>resizeObs.disconnect());
   resize();

   if('IntersectionObserver'in window){
     visibilityIo=new IntersectionObserver(entries=>{
       const entry=entries[0];
       inView=!!entry?.isIntersecting;
       if(inView||isFullscreen())requestFrame();
       else if(raf){cancelAnimationFrame(raf);raf=0;}
     },{rootMargin:'160px 0px',threshold:0});
     visibilityIo.observe(root);
     cleanup.push(()=>visibilityIo.disconnect());
   }

   on(canvas,'webglcontextlost',e=>{
     e.preventDefault();
     if(raf){cancelAnimationFrame(raf);raf=0;}
     root.classList.remove('ua-ready');
     root.classList.add('ua-fallback');
   });
   on(canvas,'webglcontextrestored',()=>{
     root.classList.remove('ua-fallback');
     setReady();lastT=performance.now();requestFrame();
   });

   function updateDiagnostics(t){
     if(t-lastDiag<400)return;
     lastDiag=t;
     const d=sunInfo?.date||new Date();
     if(diag.utc)diag.utc.textContent=d.toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC');
     if(diag.lon)diag.lon.textContent=(sunInfo?.lon??0).toFixed(1)+'°';
     if(diag.decl)diag.decl.textContent=(sunInfo?.decl??0).toFixed(1)+'°';
     if(diag.distance)diag.distance.textContent=distance.toFixed(2)+' R';
     if(diag.render)diag.render.textContent=profile.label;
     if(diag.fps)diag.fps.textContent=fpsValue?String(Math.round(fpsValue)):'--';
   }

   function updateCamera(){
     const ce=Math.cos(elevation);
     camera.position.set(
       Math.sin(azimuth)*ce*distance,
       Math.sin(elevation)*distance,
       Math.cos(azimuth)*ce*distance
     );
     camera.lookAt(0,0,0);
     surfaceUniforms.uCameraPos.value.copy(camera.position);
     atmoUniforms.uCameraPos.value.copy(camera.position);
   }

   function frame(t){
     raf=0;
     if(disposed||!visible||(!inView&&!isFullscreen()))return;
     const dt=Math.min(.05,(t-lastT)/1000||.016);lastT=t;
     const dragging=pointers.size>0;
     const idle=!dragging&&!reduced.matches&&(t-lastMove>idleDelay);

     if(idle&&toggles.auto)targetAzimuth+=dt*.030;
     if(!dragging){
       targetAzimuth+=velAz*60*dt;
       targetElevation=clamp(targetElevation+velEl*60*dt,-1.22,1.22);
       velAz*=Math.pow(.90,dt*60);velEl*=Math.pow(.90,dt*60);
     }

     azimuth=smooth(azimuth,targetAzimuth,.0008,dt);
     elevation=smooth(elevation,targetElevation,.0008,dt);
     distance=smooth(distance,targetDistance,.0012,dt);
     azimuth=wrapRadians(azimuth);targetAzimuth=wrapRadians(targetAzimuth);
     updateCamera();

     if(!reduced.matches)cloudOffset=(cloudOffset+dt*.00045)%1;
     surfaceUniforms.uCloudOffset.value=cloudOffset;
     if(cloudUniforms)cloudUniforms.uCloudOffset.value=cloudOffset;
     if(auroraUniforms)auroraUniforms.uTime.value=t/1000;

     if(t-lastSunUpdate>1000){
       lastSunUpdate=t;
       const s=toggles.realtime?solarState(THREE,new Date()):(sunFrozen||sunInfo);
       if(s)applySun(s);
     }

     if(starGroup&&!reduced.matches){
       starGroup.position.x=-camera.position.x*.0035;
       starGroup.position.y=-camera.position.y*.0035;
       starGroup.position.z=-camera.position.z*.0035;
     }

     frames++;
     const elapsed=t-fpsStart;
     if(elapsed>=1000){fpsValue=frames*1000/elapsed;frames=0;fpsStart=t;}
     updateDiagnostics(t);

     renderer.render(scene,camera);
     requestFrame();
   }

   function requestFrame(){
     if(disposed||raf||!visible||(!inView&&!isFullscreen()))return;
     raf=requestAnimationFrame(frame);
   }

   const future={markers:new Map(),layers:new Map(),overlays:new Map()};
   const api={
     version:VERSION,
     destroy(){
       if(disposed)return;
       disposed=true;
       if(raf)cancelAnimationFrame(raf);
       for(const f of cleanup.splice(0))try{f()}catch{}
       document.body.classList.remove('ua-earth-lock');
       if(scene)scene.traverse(o=>{
         o.geometry?.dispose?.();
         if(o.material){
           const ms=Array.isArray(o.material)?o.material:[o.material];
           for(const m of ms)m.dispose?.();
         }
       });
       const seen=new Set();
       for(const u of [surfaceUniforms?.tDay,surfaceUniforms?.tWater,surfaceUniforms?.tCloud,surfaceUniforms?.tNight]){
         const tex=u?.value;if(tex&&!seen.has(tex)){seen.add(tex);tex.dispose?.();}
       }
       renderer?.dispose?.();
       mounted.delete(root);
     },
     reset:resetView,
     flyTo(target={}){
       const lat=clamp(Number(target.lat)||0,-82,82),lon=Number(target.lon)||0;
       targetElevation=rad(lat);
       targetAzimuth=wrapRadians(-rad(lon));
       if(Number.isFinite(target.distance))targetDistance=clamp(target.distance,1.48,5.2);
       lastMove=performance.now();
       requestFrame();
     },
     focusRegion(target){this.flyTo(target);},
     addMarker(marker={}){
       const id=String(marker.id||`future-${future.markers.size+1}`);
       future.markers.set(id,{...marker,id});
       return id;
     },
     removeMarker(id){return future.markers.delete(String(id));},
     setMarkerLayer(name,value){future.layers.set(String(name),value);return true;},
     setOverlay(name,value){future.overlays.set(String(name),value);return true;},
     getFutureState(){return {markers:new Map(future.markers),layers:new Map(future.layers),overlays:new Map(future.overlays)};}
   };

   mounted.set(root,api);
   setReady();
   refreshToggleLabels();
   updateFsLabel();
   lastT=performance.now();
   requestFrame();
   progressiveTextures();
   return api;
 }catch(err){
   fail(err);
   const api={version:VERSION,destroy(){disposed=true;},reset:resetView};
   mounted.set(root,api);
   return api;
 }
}

function watch(){
 const io='IntersectionObserver'in window?new IntersectionObserver(entries=>{
   for(const e of entries)if(e.isIntersecting){io.unobserve(e.target);mount(e.target)}
 },{rootMargin:'220px 0px'}):null;
 function scan(){
   document.querySelectorAll('[data-unseen-earth]').forEach(el=>{
     if(mounted.has(el)||el.dataset.uaObserved)return;
     el.dataset.uaObserved='1';
     if(io)io.observe(el);else mount(el);
   });
 }
 const mo=new MutationObserver(scan);
 mo.observe(document.documentElement,{childList:true,subtree:true});
 scan();
 addEventListener('pagehide',()=>{
   document.querySelectorAll('[data-unseen-earth]').forEach(el=>mounted.get(el)?.destroy?.());
   mo.disconnect();io?.disconnect?.();
 },{once:true});
}

window.UnseenEarth={
 version:VERSION,
 mount,
 get(root){return mounted.get(root)||null;},
 addMarker(root,marker){return mounted.get(root)?.addMarker?.(marker);},
 removeMarker(root,id){return mounted.get(root)?.removeMarker?.(id);},
 setMarkerLayer(root,name,value){return mounted.get(root)?.setMarkerLayer?.(name,value);},
 flyTo(root,target){return mounted.get(root)?.flyTo?.(target);},
 focusRegion(root,target){return mounted.get(root)?.focusRegion?.(target);},
 setOverlay(root,name,value){return mounted.get(root)?.setOverlay?.(name,value);}
};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
})();
