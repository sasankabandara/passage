import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createWalker,updateGait,shoePoint} from '../.test-build/gait.js';
import {Rig,BONES} from '../.test-build/rig.js';
import {BODY_CAPSULES,SHOE_OUTLINE} from '../.test-build/geometry.js';
const p=createWalker(0,0,0,0),rig=new Rig(),point=new Float64Array(3),poses=[];p.desiredX=.82;
let old='',started=false,startAnchor=0;
const round=x=>Math.round(x*100000)/100000;
for(let i=0;i<1800;i++){
  updateGait(p,1/60);
  const strike=p.feet[0].stage==='landing'&&old!=='landing';old=p.feet[0].stage;
  const ending=strike&&started;
  if(strike&&i>300&&!started){started=true;startAnchor=p.feet[0].ax;}
  if(started){
    const j=Array.from(rig.update(p),round),shoes=p.feet.map(f=>SHOE_OUTLINE.flatMap(([u,v])=>Array.from(shoePoint(f,p.shoeLength,u*p.shoeWidth*(f.side<0?-1:1),v*p.shoeLength,1,point),round)));
    poses.push({j,shoes,x:p.x,y:p.y,hip:p.hipZ,feet:p.feet.map(f=>({stage:f.stage,pitch:f.pitch,z:f.z,load:f.load,planted:f.planted,t:f.t,duration:f.duration}))});
  }
  if(ending)break;
}
const cycle=(poses.length-1)/60,stance=poses.slice(0,-1).filter(x=>x.feet[0].planted).length/(poses.length-1),stride=p.feet[0].ax-startAnchor;
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Passage — Walking study</title>
<style>*{box-sizing:border-box}body{margin:0;background:#e8eff2;color:#304853;font:14px/1.6 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:38px 32px}small,.mono{font:10px/1.7 monospace;letter-spacing:.08em;color:#71858e}header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #bccbd0;padding-bottom:18px}h1{font:400 clamp(38px,5vw,62px)/1.1 Georgia,serif;letter-spacing:-.04em;margin:26px 0 15px}p{max-width:730px;color:#6b8089;font-size:13px}.metrics{display:flex;gap:40px;margin:26px 0 30px}.metrics strong{display:block;font:26px Georgia,serif;font-weight:400}.panes{display:grid;grid-template-columns:1fr 1fr;gap:18px}.pane{background:#f5f8f7a0;border:1px solid #bccbd077;border-radius:5px;padding:18px}.pane h2{font:10px monospace;letter-spacing:.12em;font-weight:400;margin:0 0 12px}.pane canvas{display:block;width:100%;height:auto}.controls{display:flex;align-items:center;gap:20px;padding:25px 0}button{border:1px solid #aabdc4;background:#edf3f1;color:#34505d;padding:10px 18px;font:12px system-ui;border-radius:4px;cursor:pointer}button.primary{background:#304c59;color:white;border-color:#304c59;min-width:78px}input[type=range]{flex:1;accent-color:#b8714f}.states{display:grid;grid-template-columns:1fr 1fr;gap:18px}.state{display:flex;justify-content:space-between;gap:14px;border-top:1px solid #bdcbd0;padding:15px 0;font-size:12px}.state strong{font-weight:500}footer{border-top:1px solid #bdcbd0;margin-top:25px;padding-top:18px;font-size:10px;color:#7b9098}a{color:#a2674c}@media(max-width:700px){main{padding:24px 18px}.panes{grid-template-columns:1fr}.metrics{gap:20px}.states{grid-template-columns:1fr}.pane{padding:12px}.controls{gap:12px}header>span{display:none}}</style>
<main><header><small>FIELDWORK / PASSAGE / GAIT EXAMINATION</small><span class="mono">60 HZ · ACTUAL RIG POSES</span></header>
<h1>One stride, examined.</h1><p>Scrub the cycle to inspect heel contact, weight acceptance, the body passing over a planted foot, heel rise, toe-off, and swing. These frames are sampled from the same rig used in Passage. The side camera stays fixed relative to the floor.</p>
<div class="metrics"><div><strong>${stride.toFixed(2)} m</strong><small>STRIDE AT 0.82 M/S</small></div><div><strong>${(stance*100).toFixed(0)}% / ${((1-stance)*100).toFixed(0)}%</strong><small>SUPPORT / SWING</small></div><div><strong>${cycle.toFixed(2)} s</strong><small>ONE GAIT CYCLE</small></div></div>
<div class="panes"><section class="pane"><h2>SIDE VIEW / CONTACT WITH THE GLASS</h2><canvas id="side" width="1000" height="740"></canvas></section><section class="pane"><h2>BELOW THE FLOOR / PROJECTED SHOE CONTOURS</h2><canvas id="below" width="1000" height="740"></canvas></section></div>
<div class="controls"><button class="primary" id="play">Play ½×</button><button id="back" aria-label="Previous frame">←</button><input id="frame" type="range" min="0" max="${poses.length-1}" step="1" value="0" aria-label="Gait frame"><button id="next" aria-label="Next frame">→</button><span id="time" class="mono"></span></div>
<div class="states"><div class="state"><strong id="left"></strong><span id="left-load"></span></div><div class="state"><strong id="right"></strong><span id="right-load"></span></div></div>
<footer>Phase and rocker reference: <a href="https://www.ouhsc.edu/bserdac/dthompso/web/gait/terms.htm">University of Oklahoma gait terminology</a> · <a href="https://engcourses-uofa.ca/books/ortho/gait-analysis/">University of Alberta gait analysis</a>. The animation retains a heel/toe anchor through each supporting roll; lifted feet are softened by their actual height.</footer></main>
<script>const poses=${JSON.stringify(poses)},bones=${JSON.stringify(BONES)},parts=${JSON.stringify(BODY_CAPSULES)},base=poses[0].x;let current=0,playing=false,last=0;const slider=document.getElementById('frame'),side=document.getElementById('side').getContext('2d'),below=document.getElementById('below').getContext('2d');
const color=['#c16f48','#457f98'];function path(ctx,points,project){ctx.beginPath();for(let i=0;i<points.length;i+=3){const q=project(points[i],points[i+1],points[i+2]);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);}ctx.closePath();}
function label(f){if(f.stage==='stance')return 'Foot flat / body progression';if(f.stage==='heelrise')return 'Terminal stance / heel rise';if(f.stage==='toeoff')return 'Pre-swing / toe-off';if(f.stage==='landing')return 'Heel contact / loading';return f.t/f.duration<.35?'Initial swing':f.t/f.duration<.78?'Mid-swing / toe clearance':'Terminal swing / heel preparation';}
function draw(){const p=poses[current],j=p.j;side.clearRect(0,0,1000,740);below.clearRect(0,0,1000,740);const scale=300,floor=675;
 const sx=x=>220+(x-base)*scale,sy=z=>floor-z*scale;
 side.strokeStyle='#b6c8ce';side.lineWidth=1;for(let t=-1;t<3;t+=.2){side.beginPath();side.moveTo(sx(base+t),floor-4);side.lineTo(sx(base+t),floor+5);side.stroke();}
 side.strokeStyle='#c6784f';side.lineWidth=2;side.beginPath();side.moveTo(15,floor);side.lineTo(985,floor);side.stroke();
 for(const [a,b,r]of parts){side.strokeStyle=a>=4&&a<=9?'#476d7eaa':'#8399a46a';side.lineCap='round';side.lineWidth=Math.max(4,r*scale*1.2);side.beginPath();side.moveTo(sx(j[a*3]),sy(j[a*3+2]));side.lineTo(sx(j[b*3]),sy(j[b*3+2]));side.stroke();if(a===b){side.fillStyle='#819ba475';side.beginPath();side.arc(sx(j[a*3]),sy(j[a*3+2]),r*scale,0,Math.PI*2);side.fill();}}
 for(let k=0;k<16;k++){side.fillStyle='#eaf0ef';side.beginPath();side.arc(sx(j[k*3]),sy(j[k*3+2]),3.5,0,Math.PI*2);side.fill();}
 const project=(x,y,z)=>{const q=8/(8+z),local=x-base-.50;return [500+(-.2+(local+.2)*q)*scale,410+(.18+(y-.18)*q)*scale];};
 below.fillStyle='#829ba52f';for(let x=9;x<1000;x+=14)for(let y=8;y<740;y+=14){below.beginPath();below.arc(x,y,.8,0,Math.PI*2);below.fill();}
 for(const [a,b,r]of parts){const x=project(j[a*3],j[a*3+1],j[a*3+2]),y=project(j[b*3],j[b*3+1],j[b*3+2]),z=Math.min(j[a*3+2],j[b*3+2]);below.strokeStyle='rgba(90,126,145,'+(.20*Math.exp(-z*.7))+')';below.lineWidth=r*scale*2*8/(8+z);below.lineCap='round';below.beginPath();below.moveTo(...x);below.lineTo(...y);below.stroke();}
 for(let k=0;k<2;k++){const shoe=p.shoes[k],f=p.feet[k];side.strokeStyle=color[k];side.fillStyle=color[k]+'30';side.lineWidth=4;path(side,shoe,(x,y,z)=>[sx(x),sy(z)]);side.fill();side.stroke();
   if(f.planted){let min=Infinity,at=0;for(let z=2;z<shoe.length;z+=3)if(shoe[z]<min){min=shoe[z];at=z-2;}side.fillStyle=color[k];side.beginPath();side.arc(sx(shoe[at]),floor,5,0,Math.PI*2);side.fill();}
   const heel=project(...shoe.slice(0,3)),toe=project(...shoe.slice(21,24)),g=below.createLinearGradient(...heel,...toe);
   for(const t of [0,.25,.5,.75,1]){const z=shoe[2]*(1-t)+shoe[23]*t;g.addColorStop(t,'rgba(26,50,63,'+(.10+.85*Math.exp(-z*23))+')');}
   below.fillStyle=g;path(below,shoe,project);below.fill();below.strokeStyle=color[k]+'77';below.lineWidth=1.4;below.stroke();
 }
 side.font='18px monospace';side.fillStyle='#82969f';side.fillText('z = 0 / glass plane',25,floor+32);document.getElementById('left').textContent='LEFT · '+label(p.feet[0]);document.getElementById('right').textContent='RIGHT · '+label(p.feet[1]);document.getElementById('left-load').textContent=Math.round(p.feet[0].load*100)+'% support load';document.getElementById('right-load').textContent=Math.round(p.feet[1].load*100)+'% support load';document.getElementById('time').textContent=Math.round(current/(poses.length-1)*100)+'%';slider.value=current;
}
slider.oninput=()=>{playing=false;document.getElementById('play').textContent='Play ½×';current=+slider.value;draw();};document.getElementById('back').onclick=()=>{current=Math.max(0,current-1);draw();};document.getElementById('next').onclick=()=>{current=Math.min(poses.length-1,current+1);draw();};document.getElementById('play').onclick=()=>{if(current===poses.length-1)current=0;playing=!playing;document.getElementById('play').textContent=playing?'Pause':'Play ½×';};function tick(t){if(playing&&t-last>1000/30){current=Math.min(current+1,poses.length-1);last=t;draw();if(current===poses.length-1){playing=false;document.getElementById('play').textContent='Replay ½×';}}requestAnimationFrame(tick);}draw();requestAnimationFrame(tick);</script></html>`;
await writeFile(fileURLToPath(new URL('../gait-study.html',import.meta.url)),html);
console.log(JSON.stringify({frames:poses.length,cycleSeconds:cycle,stride,stanceFraction:stance}));
