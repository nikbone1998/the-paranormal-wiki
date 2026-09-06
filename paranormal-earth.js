/* THE UNSEEN ARCHIVE — Phase 1 hyper-realistic Earth engine
 * No entity coordinates, markers, dossier links, cases, or geographic entity layer.
 * Three.js is lazy-loaded only when a globe enters the viewport.
 */
(function(){
'use strict';
const VERSION='1.1.1-phase1';
const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
const TEX={
 day:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_atmos_2048.jpg',
 normal:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_normal_2048.jpg',
 specular:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_specular_2048.jpg',
 clouds:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_clouds_1024.png',
 night:'https://raw.githubusercontent.com/mrdoob/three.js/4ee6c2bb5a02e3bcf5e99338e0fd93a6c38559fd/examples/textures/planets/earth_lights_2048.png'
};
let threePromise=null;
const mounted=new WeakMap();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function loadThree(){return threePromise||(threePromise=import(THREE_URL));}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function fallbackSvg(){
 const s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700"><defs><radialGradient id="b"><stop stop-color="#06153f"/><stop offset=".62" stop-color="#020619"/><stop offset="1"/></radialGradient><radialGradient id="e" cx="37%" cy="30%"><stop stop-color="#70c7ff"/><stop offset=".22" stop-color="#1767b8"/><stop offset=".66" stop-color="#06316f"/><stop offset="1" stop-color="#001028"/></radialGradient><filter id="g"><feGaussianBlur stdDeviation="18"/></filter></defs><rect width="1200" height="700" fill="url(#b)"/><g fill="#fff" opacity=".65">${Array.from({length:90},(_,i)=>`<circle cx="${(i*137)%1180+10}" cy="${(i*83)%680+10}" r="${i%7===0?1.6:.8}"/>`).join('')}</g><circle cx="600" cy="350" r="236" fill="#2aaeff" opacity=".18" filter="url(#g)"/><circle cx="600" cy="350" r="210" fill="url(#e)" stroke="#7ad8ff" stroke-opacity=".6"/><path d="M463 242l57-49 73 18 20 45-34 22-49-11-35 29-54-10zm148 58l45-23 57 20 42 66-31 41-29-14-26 60-41 28-18-44 19-54-40-31zm-126 98l44-52 31 22-11 52-28 43-42-21z" fill="#278653" opacity=".85"/><path d="M454 225c65-48 164-70 253-26" fill="none" stroke="#fff" stroke-opacity=".48" stroke-width="8"/><ellipse cx="527" cy="269" rx="77" ry="18" fill="#fff" opacity=".32"/><ellipse cx="681" cy="375" rx="88" ry="15" fill="#fff" opacity=".25"/></svg>`;
 return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(s);
}
function paintStars(canvas){
 const ctx=canvas.getContext('2d'); if(!ctx)return()=>{};
 let w=0,h=0,dpr=1,raf=0,start=performance.now();
 const stars=Array.from({length:180},(_,i)=>({x:(Math.sin(i*12.9898)*43758.5453)%1,y:(Math.sin(i*78.233)*12741.371)%1,s:i%23===0?1.7:(i%7===0?1.15:.65),p:(i*1.618)%6.28})).map(s=>({...s,x:Math.abs(s.x),y:Math.abs(s.y)}));
 function resize(){const r=canvas.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,1.6);w=Math.max(1,Math.round(r.width*dpr));h=Math.max(1,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}}
 function draw(t){resize();ctx.clearRect(0,0,w,h);const tt=(t-start)/1000;for(const s of stars){let a=reduced.matches?.55:(.42+.25*Math.sin(tt*.42+s.p));ctx.globalAlpha=a;ctx.fillStyle=s.s>1.3?'#d8e6ff':'#aebeff';ctx.fillRect(s.x*w,s.y*h,s.s*dpr,s.s*dpr)}ctx.globalAlpha=1;raf=requestAnimationFrame(draw)}
 raf=requestAnimationFrame(draw);return()=>cancelAnimationFrame(raf);
}
function sunVector(THREE,date=new Date()){
 const y=date.getUTCFullYear(), start=Date.UTC(y,0,0), now=Date.UTC(y,date.getUTCMonth(),date.getUTCDate());
 const n=Math.floor((now-start)/86400000); const hour=date.getUTCHours()+date.getUTCMinutes()/60+date.getUTCSeconds()/3600;
 const decl=23.44*Math.sin((2*Math.PI/365)*(n-81))*Math.PI/180;
 const lon=(180-hour*15)*Math.PI/180;
 return new THREE.Vector3(Math.cos(decl)*Math.cos(lon),Math.sin(decl),Math.cos(decl)*Math.sin(lon)).normalize();
}
function qualityLabel(){const mobile=matchMedia('(max-width:680px)').matches;const mem=navigator.deviceMemory||4;return mobile||mem<=4?'ADAPTIVE / MOBILE':'HIGH / DESKTOP'}
async function mount(root){
 if(mounted.has(root))return mounted.get(root); root.dataset.earthVersion=VERSION;
 const canvas=root.querySelector('.ua-globe-canvas'), stars=root.querySelector('.ua-globe-stars'), fallback=root.querySelector('.ua-globe-fallback');
 const reset=root.querySelector('[data-globe-reset]'), fs=root.querySelector('[data-globe-fullscreen]'), q=root.querySelector('.ua-globe-quality');
 if(fallback)fallback.src=fallbackSvg();if(q)q.textContent=qualityLabel();
 const stopStars=stars?paintStars(stars):()=>{};
 const cleanup=[]; let disposed=false,raf=0,resizeObs=null,THREE,renderer,scene,camera,earth,clouds,atmo,night,light,ambient;
 let rotX=.15,rotY=-.55,targetX=rotX,targetY=rotY,zoom=3.05,targetZoom=zoom,vx=0,vy=0,lastT=performance.now();
 let pointers=new Map(),dragId=null,lastX=0,lastY=0,lastPinch=0,lastMove=0;const idleDelay=4200;
 function fail(err){console.warn('[UNSEEN EARTH] fallback',err);if(disposed)return;root.classList.remove('ua-ready');root.classList.add('ua-fallback');}
 function setReady(){root.classList.remove('ua-fallback');root.classList.add('ua-ready');}
 function on(el,type,fn,opt){el.addEventListener(type,fn,opt);cleanup.push(()=>el.removeEventListener(type,fn,opt))}
 function resetView(){targetX=.15;targetY=-.55;targetZoom=3.05;vx=vy=0;lastMove=performance.now()}
 on(reset,'click',resetView);
 on(fs,'click',async()=>{try{if(document.fullscreenElement===root)await document.exitFullscreen();else await root.requestFullscreen()}catch(e){}});
 on(document,'fullscreenchange',()=>{if(fs)fs.textContent=document.fullscreenElement===root?'[ CLOSE FULL EARTH VIEW ]':'[ OPEN FULL EARTH VIEW ]'});
 on(root,'keydown',e=>{const s=.075;if(e.key==='ArrowLeft')targetY-=s;else if(e.key==='ArrowRight')targetY+=s;else if(e.key==='ArrowUp')targetX=clamp(targetX-s,-1.18,1.18);else if(e.key==='ArrowDown')targetX=clamp(targetX+s,-1.18,1.18);else if(e.key==='+'||e.key==='=')targetZoom=clamp(targetZoom-.18,1.72,5.4);else if(e.key==='-'||e.key==='_')targetZoom=clamp(targetZoom+.18,1.72,5.4);else return;e.preventDefault();lastMove=performance.now()});
 on(root,'wheel',e=>{e.preventDefault();targetZoom=clamp(targetZoom+e.deltaY*.0024,1.72,5.4);lastMove=performance.now()},{passive:false});
 function dist(){const a=[...pointers.values()];return a.length<2?0:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}
 on(root,'pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});root.setPointerCapture?.(e.pointerId);lastMove=performance.now();if(pointers.size===1){dragId=e.pointerId;lastX=e.clientX;lastY=e.clientY;root.classList.add('ua-dragging')}else if(pointers.size===2){lastPinch=dist();dragId=null}}, {passive:true});
 on(root,'pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});lastMove=performance.now();if(pointers.size>=2){const d=dist();if(lastPinch){targetZoom=clamp(targetZoom-(d-lastPinch)*.006,1.72,5.4)}lastPinch=d;return}if(dragId===e.pointerId){const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;targetY+=dx*.0063;targetX=clamp(targetX+dy*.0055,-1.18,1.18);vy=dx*.00048;vx=dy*.00042}}, {passive:true});
 function endPointer(e){pointers.delete(e.pointerId);if(e.pointerId===dragId)dragId=null;if(pointers.size<2)lastPinch=0;if(!pointers.size)root.classList.remove('ua-dragging');lastMove=performance.now()}
 on(root,'pointerup',endPointer);on(root,'pointercancel',endPointer);on(root,'lostpointercapture',endPointer);
 try{
   THREE=await loadThree(); if(disposed)return;
   renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance',premultipliedAlpha:false});
   renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
   scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(34,1,.1,50);camera.position.z=zoom;
   const mobile=matchMedia('(max-width:680px)').matches;const mem=navigator.deviceMemory||4;const seg=(mobile||mem<=4)?72:112;
   const loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
   const load=(url,color=false)=>new Promise((resolve,reject)=>loader.load(url,t=>{if(color)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());resolve(t)},undefined,reject));
   const results=await Promise.allSettled([load(TEX.day,true),load(TEX.normal),load(TEX.specular),load(TEX.clouds,true),load(TEX.night,true)]);if(disposed)return;
   const [dayTex,normalTex,specTex,cloudTex,nightTex]=results.map(r=>r.status==='fulfilled'?r.value:null); if(!dayTex)throw new Error('Earth day texture unavailable');
   const geo=new THREE.SphereGeometry(1,seg,seg);
   const mat=new THREE.MeshPhongMaterial({map:dayTex,normalMap:normalTex||null,normalScale:new THREE.Vector2(.52,.52),specularMap:specTex||null,specular:new THREE.Color(0x4488aa),shininess:28,color:0xffffff});
   earth=new THREE.Mesh(geo,mat);scene.add(earth);
   const sun=sunVector(THREE);light=new THREE.DirectionalLight(0xffffff,3.25);light.position.copy(sun).multiplyScalar(6);scene.add(light);ambient=new THREE.AmbientLight(0x1b2d55,.55);scene.add(ambient);
   if(cloudTex){const cg=new THREE.SphereGeometry(1.012,seg,seg);const cm=new THREE.MeshPhongMaterial({map:cloudTex,transparent:true,opacity:.47,depthWrite:false,blending:THREE.NormalBlending});clouds=new THREE.Mesh(cg,cm);scene.add(clouds)}
   if(nightTex){const ng=new THREE.SphereGeometry(1.003,seg,seg);night=new THREE.Mesh(ng,new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{tNight:{value:nightTex},sunDir:{value:sun.clone()}},vertexShader:`varying vec2 vUv;varying vec3 vN;void main(){vUv=uv;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`precision mediump float;uniform sampler2D tNight;uniform vec3 sunDir;varying vec2 vUv;varying vec3 vN;void main(){float d=dot(normalize(vN),normalize(sunDir));float dark=1.0-smoothstep(-0.16,0.15,d);vec3 c=texture2D(tNight,vUv).rgb;float lum=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*1.5,dark*smoothstep(.08,.55,lum)*.82);}`}));scene.add(night)}
   const ag=new THREE.SphereGeometry(1.07,seg,seg);atmo=new THREE.Mesh(ag,new THREE.ShaderMaterial({side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,vertexShader:`varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,fragmentShader:`precision mediump float;varying vec3 vN;varying vec3 vV;void main(){float rim=pow(1.0-max(dot(vN,vV),0.0),2.5);vec3 c=mix(vec3(.08,.25,.72),vec3(.22,.72,1.0),rim);gl_FragColor=vec4(c,rim*.62);}`}));scene.add(atmo);
   const starGeo=new THREE.BufferGeometry(),arr=[];for(let i=0;i<900;i++){const r=8+Math.random()*13,th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1);arr.push(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph),r*Math.sin(ph)*Math.sin(th))}starGeo.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));const starMat=new THREE.PointsMaterial({color:0xbfd7ff,size:.022,sizeAttenuation:true,transparent:true,opacity:.6,depthWrite:false});const pts=new THREE.Points(starGeo,starMat);scene.add(pts);
   function resize(){if(!renderer)return;const r=root.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,document.fullscreenElement===root?2.1:(mobile?1.55:1.9));renderer.setPixelRatio(dpr);renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(.1,r.width/r.height);camera.updateProjectionMatrix()}
   resizeObs=new ResizeObserver(resize);resizeObs.observe(root);cleanup.push(()=>resizeObs.disconnect());resize();
   on(canvas,'webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);root.classList.remove('ua-ready');root.classList.add('ua-fallback')});
   on(canvas,'webglcontextrestored',()=>{root.classList.remove('ua-fallback');setReady();lastT=performance.now();raf=requestAnimationFrame(frame)});
   function frame(t){if(disposed)return;const dt=Math.min(.05,(t-lastT)/1000||.016);lastT=t;const dragging=pointers.size>0;const idle=!dragging&&!reduced.matches&&(t-lastMove>idleDelay);if(idle)targetY+=dt*.045;if(!dragging){targetY+=vy*60*dt;targetX=clamp(targetX+vx*60*dt,-1.18,1.18);vx*=Math.pow(.91,dt*60);vy*=Math.pow(.91,dt*60)}rotX+=(targetX-rotX)*(1-Math.pow(.0008,dt));rotY+=(targetY-rotY)*(1-Math.pow(.0008,dt));zoom+=(targetZoom-zoom)*(1-Math.pow(.0012,dt));earth.rotation.set(rotX,rotY,0,'YXZ');if(night)night.rotation.copy(earth.rotation);if(clouds){clouds.rotation.x=rotX*.995;clouds.rotation.y=rotY+(reduced.matches?0:(t*.0000065));clouds.rotation.z=.002*Math.sin(t*.00008)}camera.position.z=zoom;renderer.render(scene,camera);raf=requestAnimationFrame(frame)}
   setReady();lastT=performance.now();raf=requestAnimationFrame(frame);
 }catch(err){fail(err)}
 const api={destroy(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);stopStars();for(const f of cleanup.splice(0))try{f()}catch{};if(scene)scene.traverse(o=>{o.geometry?.dispose?.();if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){for(const k of ['map','normalMap','specularMap','alphaMap'])m[k]?.dispose?.();m.dispose?.()}}});renderer?.dispose?.();mounted.delete(root)},reset:resetView};mounted.set(root,api);return api;
}
function watch(){
 const io='IntersectionObserver'in window?new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){io.unobserve(e.target);mount(e.target)}},{rootMargin:'220px 0px'}):null;
 function scan(){document.querySelectorAll('[data-unseen-earth]').forEach(el=>{if(mounted.has(el)||el.dataset.uaObserved)return;el.dataset.uaObserved='1';if(io)io.observe(el);else mount(el)})}
 const mo=new MutationObserver(scan);mo.observe(document.documentElement,{childList:true,subtree:true});scan();
 addEventListener('pagehide',()=>{document.querySelectorAll('[data-unseen-earth]').forEach(el=>mounted.get(el)?.destroy?.());mo.disconnect();io?.disconnect?.()},{once:true});
}
window.UnseenEarth={mount,version:VERSION};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
})();
