import './style.css';
import './overlay.css';
import { Camera } from './camera.js';
import { Crowd } from './crowd.js';
import { Renderer, type RenderOptions } from './renderer.js';

const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const camera=new Camera();camera.resize(innerWidth||400,innerHeight||800);
const crowd=new Crowd(camera),renderer=new Renderer(el<HTMLCanvasElement>('scene'),camera);
crowd.autoPopulation=true;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const options:RenderOptions={diffusion:1,frosted:true,skeleton:false,anchors:false,bands:false,projection:false};
const stillRequested=new URLSearchParams(location.search).has('still');
let playing=!reduced.matches&&!stillRequested,speed=1,last=0,accumulator=0,frames=0,lastMetrics=0,qualityReduced=false;
let slowSeconds=0;
let displayedPopulation=-1;
const fixed=1/60;
const playbackSpeeds=[1,1.5,2,3,4,.5,.25];
function composedStart(){
  crowd.targetCount=crowd.recommendedCount;crowd.reset();
  for(let i=0;i<240;i++)crowd.update(fixed);
  accumulator=0;
}
function resize(){renderer.resize(el('experience').clientWidth||innerWidth||400,el('experience').clientHeight||innerHeight||800);crowd.targetCount=crowd.recommendedCount;qualityReduced=false;slowSeconds=0;}
resize();composedStart();
let resizeTimer=0;
addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=window.setTimeout(()=>{resize();if(!playing)render(1);},90);});
// Embedded previews may load before their panel has a nonzero layout size.
new ResizeObserver(entries=>{
  const box=entries[0].contentRect;
  if(box.width>0&&box.height>0&&(Math.abs(box.width-renderer.width)>.5||Math.abs(box.height-renderer.height)>.5)){
    resize();if(!playing)render(1);
  }
}).observe(el('experience'));
function updatePlay(){
  const button=el<HTMLButtonElement>('play');
  button.setAttribute('aria-label',playing?'Pause animation':'Play animation');
  button.innerHTML=playing?'<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6 4v10M12 4v10"/></svg><span>Pause</span>':'<svg viewBox="0 0 18 18" aria-hidden="true"><path d="m6 4 8 5-8 5Z"/></svg><span>Play</span>';
  el('status-text').textContent=`${String(crowd.solo?1:crowd.people.length).padStart(2,'0')} ${playing?'PASSING STRANGERS':'STILL OBSERVATION'}`;
  el('motion-note').hidden=!reduced.matches||playing;
}
function togglePlay(){playing=!playing;last=performance.now();accumulator=0;updatePlay();}
el('play').addEventListener('click',togglePlay);
el('speed').addEventListener('click',()=>{
  speed=playbackSpeeds[(playbackSpeeds.indexOf(speed)+1)%playbackSpeeds.length];
  el('speed').innerHTML=`${speed===.5?'½':speed===.25?'¼':speed}× <span class="control-label">pace</span>`;
  el('speed').setAttribute('aria-label',`Playback speed, ${speed} times`);
});
el('glass').addEventListener('click',()=>{
  options.frosted=!options.frosted;el('glass').setAttribute('aria-pressed',String(options.frosted));
  el('glass').innerHTML=`<span class="glass-icon" aria-hidden="true">${options.frosted?'▧':'□'}</span> <span>${options.frosted?'Frosted':'Clear'}</span>`;
  if(!playing)render(1);
});
el('solo').addEventListener('click',()=>{
  crowd.solo=!crowd.solo;el('solo').setAttribute('aria-pressed',String(crowd.solo));updatePlay();if(!playing)render(1);
});
el('randomness').addEventListener('click',()=>{
  crowd.randomness=!crowd.randomness;
  el('randomness').setAttribute('aria-pressed',String(crowd.randomness));
  el('random-state').textContent=crowd.randomness?'On':'Off';
  composedStart();last=performance.now();updatePlay();render(1);
});
const about=el<HTMLDialogElement>('about');
el('about-open').addEventListener('click',()=>about.showModal());
el('about-close').addEventListener('click',()=>about.close());
about.addEventListener('click',e=>{if(e.target===about){const r=about.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)about.close();}});
const toggleDebug=()=>{el('debug').hidden=!el('debug').hidden;};
el('debug-toggle').addEventListener('click',toggleDebug);el('debug-close').addEventListener('click',toggleDebug);
for(const key of ['skeleton','anchors','bands','projection'] as const)el<HTMLInputElement>(key).addEventListener('change',e=>{options[key]=(e.target as HTMLInputElement).checked;if(!playing)render(1);});
el<HTMLInputElement>('diffusion').addEventListener('input',e=>{options.diffusion=Number((e.target as HTMLInputElement).value);if(!playing)render(1);});
el('step').addEventListener('click',()=>{playing=false;crowd.update(fixed);updatePlay();render(1);});
el('restart').addEventListener('click',()=>{composedStart();updatePlay();if(!playing)render(1);});
el('phase').addEventListener('input',e=>{
  playing=false;crowd.solo=true;el('solo').setAttribute('aria-pressed','true');
  const target=Number((e.target as HTMLInputElement).value);
  crowd.reset();for(let i=0;i<240&&crowd.people[0].phase<target;i++)crowd.update(fixed);
  updatePlay();render(1);
});
document.querySelector('.wordmark')!.addEventListener('click',e=>{e.preventDefault();composedStart();if(!playing)render(1);});
addEventListener('keydown',e=>{
  if((e.target as HTMLElement).matches('input,button,a')||about.open)return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}if(e.key.toLowerCase()==='d')toggleDebug();
});
document.addEventListener('visibilitychange',()=>{last=0;accumulator=0;});
reduced.addEventListener('change',()=>{if(reduced.matches){playing=false;updatePlay();render(1);}});
function render(alpha:number){renderer.render(crowd.visiblePeople,alpha,options);}
function frame(now:number){
  requestAnimationFrame(frame);
  if(document.hidden){last=0;return;}
  const elapsed=last?Math.min((now-last)/1000,.1):0;last=now;
  if(playing){
    accumulator+=elapsed*speed;let catchup=0;
    const maxCatchup=Math.ceil(5*Math.max(1,speed));
    while(accumulator>=fixed&&catchup<maxCatchup){crowd.update(fixed);accumulator-=fixed;catchup++;}
    if(catchup===maxCatchup)accumulator=Math.min(accumulator,fixed);
    render(accumulator/fixed);
    frames++;
  }
  if(now-lastMetrics>1000){
    const fps=frames*1000/(now-lastMetrics||1000);frames=0;lastMetrics=now;
    const p=crowd.people[0];
    if(displayedPopulation!==crowd.people.length){displayedPopulation=crowd.people.length;updatePlay();}
    el('metrics').textContent=`${fps.toFixed(0)} fps · ${renderer.frameCost.toFixed(1)} ms / frame\n${renderer.field.width} × ${renderer.field.height} optical field\n${renderer.cols} × ${renderer.rows} character lattice\nL: ${p.feet[0].stage} / R: ${p.feet[1].stage}\nLoad L ${(p.feet[0].load*100).toFixed(0)}% / R ${(p.feet[1].load*100).toFixed(0)}%\n${p.speed.toFixed(2)} m/s · phase ${(p.phase%1).toFixed(2)}${qualityReduced?'\nAdaptive optical resolution':''}`;
    const t=Math.floor(crowd.time);el('time-text').textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
    slowSeconds=playing&&renderer.frameCost>18?slowSeconds+1:0;
    if(!qualityReduced&&crowd.time>8&&slowSeconds>=3){renderer.setPerformanceMode();qualityReduced=true;}
  }
}
updatePlay();render(1);requestAnimationFrame(frame);

// Read-only diagnostics support reproducible browser inspection without a UI dependency.
Object.defineProperty(window,'passage',{value:{
  get snapshot(){return {time:crowd.time,playing,speed,renderMs:renderer.frameCost,people:crowd.visiblePeople.map(p=>({id:p.id,x:p.x,y:p.y,speed:p.speed,feet:p.feet.map(f=>({stage:f.stage,x:f.x,y:f.y,z:f.z,planted:f.planted}))}))};},
},writable:false});
