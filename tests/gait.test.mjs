import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalker, updateGait, shoePoint } from '../.test-build/gait.js';
import { Rig } from '../.test-build/rig.js';
import { Camera } from '../.test-build/camera.js';
import { Crowd } from '../.test-build/crowd.js';
import { OpticalField } from '../.test-build/field.js';
import { bodyClearance, capsuleGap, soleCapsule, StepReservations } from '../.test-build/collision.js';
import {SceneInspector} from '../.test-build/inspection.js';
const dt=1/60;
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);

test('sustained forward travel follows commanded pace without cadence deadlock',()=>{
  const p=createWalker(0,0,0,0);p.desiredX=.6;
  for(let i=0;i<1800;i++)updateGait(p,dt);
  assert.ok(p.x>14,`only moved ${p.x}m in 30s`);
  assert.ok(p.speed>.4,`pace collapsed to ${p.speed}m/s`);
});

test('stance locks to its anchor; heel/toe rolls preserve the active contact point',()=>{
  const p=createWalker(0,0,0,.2);p.desiredX=.54;p.desiredY=.09;
  let stance=0,heel=0,toe=0;
  for(let i=0;i<1000;i++){
    const old=p.feet.map(f=>({x:f.ax,y:f.ay,stage:f.stage}));updateGait(p,dt);
    p.feet.forEach((f,k)=>{
      if(f.planted&&f.stage!=='landing'&&old[k].stage!=='swing'){near(f.ax,old[k].x);near(f.ay,old[k].y);}
      if(f.stage==='stance'){near(f.x,f.ax);near(f.y,f.ay);near(f.z,0);stance++;}
      if(f.stage==='toeoff'||f.stage==='landing'){
        const v=f.pitch>=0?-p.shoeLength*.43:p.shoeLength*.57,q=shoePoint(f,p.shoeLength,0,v);
        near(q[0],f.ax+Math.cos(f.yaw)*v);near(q[1],f.ay+Math.sin(f.yaw)*v);near(q[2],0);
        f.stage==='toeoff'?toe++:heel++;
      }
    });
  }
  assert.ok(stance>200&&heel>25&&toe>25);
});

test('alternating strides include double support, positive clearance, and continuous landing',()=>{
  const p=createWalker(0,0,0,0);p.desiredX=.59;
  const departures=[];let doubleSupport=0,clearance=0,maxMove=0;
  for(let i=0;i<1200;i++){
    const stages=p.feet.map(f=>f.stage),positions=p.feet.map(f=>[f.x,f.y,f.z]);updateGait(p,dt);
    p.feet.forEach((f,k)=>{
      if(f.stage==='toeoff'&&stages[k]!=='toeoff')departures.push(k);
      if(f.stage==='swing'&&f.t>f.duration*.2&&f.t<f.duration*.8){assert.ok(f.z>.012);assert.ok(f.z<.13);clearance++;}
      for(const v of [-p.shoeLength*.43,0,p.shoeLength*.57])assert.ok(shoePoint(f,p.shoeLength,0,v)[2]>=0);
      maxMove=Math.max(maxMove,Math.hypot(f.x-positions[k][0],f.y-positions[k][1],f.z-positions[k][2]));
    });
    if(p.feet.every(f=>f.planted))doubleSupport++;
  }
  assert.ok(departures.length>12);for(let i=1;i<departures.length;i++)assert.notEqual(departures[i],departures[i-1]);
  assert.ok(doubleSupport>80&&clearance>100);assert.ok(maxMove<.07,`foot discontinuity ${maxMove}`);
});

test('accelerating, turning both ways, stopping, and restarting preserve leg lengths and finite poses',()=>{
  const p=createWalker(3,0,0,0,1.84),rig=new Rig();let maxError=0;
  for(let i=0;i<3600;i++){
    if(i<600){p.desiredX=.62;p.desiredY=0;}
    else if(i<1200){p.desiredX=.1;p.desiredY=.55;}
    else if(i<1800){p.desiredX=.45;p.desiredY=-.3;}
    else if(i<2400){p.desiredX=0;p.desiredY=0;}
    else {p.desiredX=-.45;p.desiredY=.2;}
    updateGait(p,dt);const j=rig.update(p);
    assert.ok([...j].every(Number.isFinite));
    for(const [a,b]of [[4,5],[5,6],[7,8],[8,9]]){
      const d=Math.hypot(j[a*3]-j[b*3],j[a*3+1]-j[b*3+1],j[a*3+2]-j[b*3+2]);maxError=Math.max(maxError,Math.abs(d-p.leg));
    }
    if(i===2399){assert.ok(p.speed<.001);assert.ok(p.feet.every(f=>f.stage==='stance'));}
  }
  assert.ok(maxError<.002,`leg error ${maxError}m`);
});

test('stopped walkers settle without cycling or skating; motion phase is velocity-coupled',()=>{
  const p=createWalker(0,0,0,0);p.desiredX=.6;
  for(let i=0;i<400;i++)updateGait(p,dt);p.desiredX=0;
  for(let i=0;i<600;i++)updateGait(p,dt);
  const phase=p.phase,feet=p.feet.map(f=>[f.x,f.y]);
  for(let i=0;i<300;i++)updateGait(p,dt);
  near(p.phase,phase,1e-6);p.feet.forEach((f,i)=>{near(f.x,feet[i][0]);near(f.y,feet[i][1]);assert.equal(f.stage,'stance');});
});

test('height projects toward the camera vanishing point, not an arbitrary screen-up offset',()=>{
  const c=new Camera();c.resize(400,850);const a=new Float64Array(3),b=new Float64Array(3),v=new Float64Array(3);
  c.project(1,.8,0,a);c.project(1,.8,1,b);c.project(c.eyeX,c.eyeY,0,v);
  assert.ok(Math.hypot(b[0]-v[0],b[1]-v[1])<Math.hypot(a[0]-v[0],a[1]-v[1]));
  near((b[0]-v[0])/(a[0]-v[0]),(b[1]-v[1])/(a[1]-v[1]));assert.ok(b[2]>a[2]);
});

test('crowd crossings, yielding, entrances/exits, and aspect changes stay finite over five minutes',()=>{
  const c=new Camera();c.resize(1440,900);const crowd=new Crowd(c),rig=new Rig();let ids=new Set();
  for(let i=0;i<18000;i++){
    if(i===6000)c.resize(390,844);if(i===12000)c.resize(1920,1080);
    crowd.update(dt);
    if(i%15===0)for(const p of crowd.people){
      ids.add(p.id);assert.ok([p.x,p.y,p.vx,p.vy,p.yaw].every(Number.isFinite));assert.ok([...rig.update(p)].every(Number.isFinite));
      for(const f of p.feet)assert.ok(f.z>=0);
    }
  }
  assert.ok(ids.size>20);assert.equal(crowd.people.length,6);
});

test('camera-depth ordering preserves the nearest contact regardless of insertion order',()=>{
  const f=new OpticalField();f.resize(80,80);const index=12*f.width+12;
  f.clear();f.deposit(index,.025,.35);f.deposit(index,0,.94);f.compose(0);const first=f.density[index];
  f.clear();f.deposit(index,0,.94);f.deposit(index,.025,.35);f.compose(0);const second=f.density[index];
  near(first,second,1e-6);assert.ok(second>=.94);assert.ok(f.bands[0][index]>.93);
});

test('height diffusion broadens a lifted surface continuously while contact stays sharp',()=>{
  const f=new OpticalField();f.resize(120,120);const index=20*f.width+20;
  f.clear();f.deposit(index,0,.8);f.compose(1);const sharp=f.density[index];
  assert.equal(f.density[index+1],0);
  let previous=sharp;
  for(let z=.01;z<=1.6;z+=.01){
    f.clear();f.deposit(index,z,.8);f.compose(1);
    assert.ok([...f.density].every(Number.isFinite));
    assert.ok(Math.abs(f.density[index]-previous)<.15);previous=f.density[index];
  }
  assert.ok(previous<sharp*.08);assert.ok(f.density[index+1]>0);
});

function checkSpacing(people,record){
  const a=new Float64Array(5),b=new Float64Array(5);
  for(const p of people){
    const ownGap=capsuleGap(soleCapsule(p,p.feet[0],a),soleCapsule(p,p.feet[1],b));
    assert.ok(ownGap>=.02,`crossed feet for ${p.id}: ${ownGap}`);
  }
  for(let i=0;i<people.length;i++)for(let j=i+1;j<people.length;j++){
    const p=people[i],q=people[j],body=Math.hypot(p.x-q.x,p.y-q.y)-bodyClearance(p,q);
    assert.ok(body>=-1e-6,`body collision ${p.id}/${q.id}: ${body}`);
    for(const f of p.feet)for(const g of q.feet){
      const gap=capsuleGap(soleCapsule(p,f,a),soleCapsule(q,g,b));
      record.minFootGap=Math.min(record.minFootGap,gap);
      assert.ok(gap>=.02,`shoe overlap ${p.id}/${q.id}: ${gap}, ${f.stage}/${g.stage}`);
    }
  }
}
test('head-on walkers yield and pass with separate bodies and shoe impressions',()=>{
  const camera=new Camera();camera.resize(1440,900);const crowd=new Crowd(camera);
  const p=createWalker(100,-1.25,0,0),q=createWalker(101,1.25,0,Math.PI);
  p.goalX=5;p.goalY=0;q.goalX=-5;q.goalY=0;p.pace=q.pace=.56;p.pauseAt=q.pauseAt=Infinity;
  crowd.people=[p,q];const record={minFootGap:Infinity},view=new SceneInspector();let passed=false;
  for(let i=0;i<1200;i++){crowd.update(dt);checkSpacing(crowd.people,record);if(i%5===0)assert.equal(view.scan(crowd.people,camera,.5).overlaps,0);if(p.x>q.x)passed=true;}
  assert.ok(passed,'walkers failed to negotiate the head-on crossing');
});

test('four-way crossings protect planted feet and reserved swing corridors',()=>{
  const camera=new Camera();camera.resize(1440,900);const crowd=new Crowd(camera);
  const setup=[[-1.6,0,5,0],[1.6,0,-5,0],[0,-1.6,0,5],[0,1.6,0,-5]];
  crowd.people=setup.map(([x,y,gx,gy],i)=>{const p=createWalker(200+i,x,y,Math.atan2(gy-y,gx-x));p.goalX=gx;p.goalY=gy;p.pace=.53;p.pauseAt=Infinity;return p;});
  const record={minFootGap:Infinity},passed=new Set(),view=new SceneInspector();
  for(let i=0;i<1800;i++){
    crowd.update(dt);checkSpacing(crowd.people,record);
    if(i%5===0)assert.equal(view.scan(crowd.people,camera,.5).overlaps,0);
    crowd.people.forEach((p,k)=>{if((p.x*setup[k][2]+p.y*setup[k][3])>4)passed.add(k);});
  }
  assert.equal(passed.size,4,'every walker should make progress through the junction');
});

test('five-minute crowd keeps all shoes separate, including new arrivals and paired walkers',()=>{
  const camera=new Camera();camera.resize(390,844);const crowd=new Crowd(camera),record={minFootGap:Infinity};
  for(let i=0;i<18000;i++){if(i===9000)camera.resize(1440,900);crowd.update(dt);checkSpacing(crowd.people,record);}
});

test('footstep reservations reject a landing on an occupied sole',()=>{
  const p=createWalker(0,0,0,0),q=createWalker(1,.9,0,0),reserved=new StepReservations([p,q]);
  const f=p.feet[0],other=q.feet[0];
  assert.equal(reserved.canStep(p,f,other.x,other.y,other.yaw),false);
  assert.equal(reserved.canStep(p,f,f.x+.3,f.y,f.yaw),true);
});

test('weight transfers to the supporting leg with continuous pelvis sway',()=>{
  const p=createWalker(0,0,0,0);p.desiredX=.52;let singleSupport=0,maxSway=0,previous=0;
  for(let i=0;i<900;i++){
    updateGait(p,dt);near(p.feet[0].load+p.feet[1].load,1,1e-6);
    assert.ok(Math.abs(p.sway-previous)<.006);previous=p.sway;maxSway=Math.max(maxSway,Math.abs(p.sway));
    for(let k=0;k<2;k++)if(p.feet[k].stage==='swing'){near(p.feet[k].load,0);near(p.feet[1-k].load,1);singleSupport++;}
  }
  assert.ok(singleSupport>100&&maxSway>.02);
});

test('the actual projected bodies, shoe outlines, and glass halos stay separate, including interpolation',()=>{
  const camera=new Camera();camera.resize(390,844);const crowd=new Crowd(camera),inspector=new SceneInspector();
  for(let i=0;i<18000;i++){
    if(i===6000)camera.resize(1440,900);if(i===12000)camera.resize(457,560);
    crowd.update(dt);
    if(i%12===0)for(const alpha of [0,.5,1]){
      const result=inspector.scan(crowd.people,camera,alpha);
      assert.equal(result.overlaps,0,`visible overlap at ${(i/60).toFixed(2)}s, alpha ${alpha}, pair ${result.pair}, gap ${result.minimum}px`);
    }
  }
});

test('heel rise begins before the opposite heel lands, with a fixed toe pivot',()=>{
  const p=createWalker(0,0,0,0);p.desiredX=.82;let count=0;
  for(let i=0;i<1000;i++){
    updateGait(p,dt);
    for(let k=0;k<2;k++)if(p.feet[k].stage==='heelrise'&&p.feet[1-k].stage==='swing'){
      const f=p.feet[k],q=shoePoint(f,p.shoeLength,0,p.shoeLength*.57);
      near(q[0],f.ax+Math.cos(f.yaw)*p.shoeLength*.57);near(q[1],f.ay+Math.sin(f.yaw)*p.shoeLength*.57);near(q[2],0);count++;
    }
  }
  assert.ok(count>50);
});

test('calm walking uses full strides, clears the toes, and keeps knees at fixed length',()=>{
  const p=createWalker(0,0,0,0),rig=new Rig();p.desiredX=.82;const steps=[];let old=-1,lastX=0,stance=0,swing=0,midFlex=0,swingFlex=0,midCount=0;
  for(let i=0;i<1800;i++){
    updateGait(p,dt);const f=p.feet[0],j=rig.update(p);
    if(i>300){if(f.planted)stance++;else swing++;}
    if(f.stage==='landing'&&old!=='landing'){if(i>300)steps.push(f.ax-lastX);lastX=f.ax;}old=f.stage;
    for(const [a,b]of [[4,5],[5,6],[7,8],[8,9]])near(Math.hypot(j[a*3]-j[b*3],j[a*3+1]-j[b*3+1],j[a*3+2]-j[b*3+2]),p.leg,.002);
    const legDistance=Math.hypot(j[4*3]-j[6*3],j[4*3+1]-j[6*3+1],j[4*3+2]-j[6*3+2]);
    const flex=2*Math.acos(Math.min(1,legDistance/(2*p.leg)));
    if(i>300&&f.stage==='stance'&&f.load>.95&&Math.abs(p.x-f.x)<.08){midFlex=Math.max(midFlex,flex);midCount++;}
    if(i>300&&f.stage==='swing')swingFlex=Math.max(swingFlex,flex);
    if(f.stage==='swing'&&f.t/f.duration>.40&&f.t/f.duration<.75)assert.ok(f.pitch>0&&f.z>.02);
  }
  const mean=steps.reduce((a,b)=>a+b,0)/steps.length;
  assert.ok(mean>.80&&mean<1.20,`stride ${mean}m`);
  assert.ok(stance/(stance+swing)>.58&&stance/(stance+swing)<.72);
  assert.ok(midCount>20&&midFlex<.45,`support knee stayed bent: ${midFlex*180/Math.PI} degrees`);
  assert.ok(swingFlex>.70&&swingFlex<1.6,`swing knee flexion ${swingFlex*180/Math.PI} degrees`);
});

test('collision steering preserves planted reach and avoids long-run crowd gridlock',()=>{
  const camera=new Camera();camera.resize(1440,900);const crowd=new Crowd(camera);crowd.targetCount=5;crowd.reset();
  const ids=new Set();
  for(let i=0;i<12000;i++){
    if(i===4000)camera.resize(390,844);if(i===8000)camera.resize(457,560);
    crowd.update(dt);
    for(const p of crowd.people){
      ids.add(p.id);assert.ok(p.stillFor<10,`walker ${p.id} stopped for ${p.stillFor}s`);
      for(const f of p.feet)if(f.planted&&f.stage!=='landing'&&f.stage!=='toeoff')assert.ok(Math.hypot(p.x-f.ax,p.y-f.ay)<.58*p.scale,`body escaped a planted foot for ${p.id}`);
    }
  }
  assert.ok(ids.size>30,`insufficient through traffic: ${ids.size} walkers`);
});

test('the physical shoe centre swings forward without an unrolling kick or vertical velocity snap',()=>{
  for(const hz of [60,120]){
    const p=createWalker(0,0,0,0);p.desiredX=.82;const previous=[null,null];let samples=0,maxVelocityChange=0;
    for(let i=0;i<hz*15;i++){
      updateGait(p,1/hz);
      p.feet.forEach((f,k)=>{
        const q=Array.from(shoePoint(f,p.shoeLength,0,0)),old=previous[k];
        const velocity=old?q.map((v,j)=>(v-old.q[j])*hz):[0,0,0];
        if(old&&old.stage==='swing'&&f.stage==='swing'){
          assert.ok(q[0]>=old.q[0]-1e-7,`shoe centre kicked backward at ${hz}Hz, swing ${f.t/f.duration}`);
          if(i>hz*2){maxVelocityChange=Math.max(maxVelocityChange,Math.hypot(...velocity.map((v,j)=>v-old.velocity[j])));samples++;}
        }
        previous[k]={q,velocity,stage:f.stage};
      });
    }
    assert.ok(samples>hz*4);
    assert.ok(maxVelocityChange<40/hz,`velocity changed ${maxVelocityChange}m/s in one ${hz}Hz frame`);
  }
});

test('a turning shoe follows its rounded arc without stopping at the outward waypoint',()=>{
  const p=createWalker(0,0,0,0);p.desiredY=.13;p.sinceStep=.3;
  p.feet[0].x=p.feet[0].px=p.feet[0].ax=-.28;
  p.feet[1].x=p.feet[1].px=p.feet[1].ax=.20;
  const f=p.feet[0],speeds=[];let old=null,finished=false;
  for(let i=0;i<180;i++){
    updateGait(p,dt);const q=Array.from(shoePoint(f,p.shoeLength,0,0));
    if(f.stage==='swing'&&old){
      const speed=Math.hypot(q[0]-old[0],q[1]-old[1])/dt;
      if(f.t/f.duration>.35&&f.t/f.duration<.65)speeds.push(speed);
    }
    old=q;
    if(f.stage==='landing'){finished=true;break;}
  }
  assert.ok(finished&&f.turning&&speeds.length>=4);
  assert.ok(Math.min(...speeds)>.25,`turning foot paused mid-arc: ${Math.min(...speeds)}m/s`);
});

test('render interpolation starts at the complete prior pose through lift-off and landing',()=>{
  const p=createWalker(0,0,0,0),rig=new Rig();p.desiredX=.82;
  let previous=Array.from(rig.update(p));
  for(let i=0;i<900;i++){
    if(i===450)p.desiredX=0;
    updateGait(p,dt);const start=rig.update(p,0);
    for(let j=0;j<start.length;j++)near(start[j],previous[j],1e-9);
    previous=Array.from(rig.update(p,1));
    for(const f of p.feet)assert.ok(Number.isFinite(f.pload)&&f.pload>=0&&f.pload<=1);
  }
});

test('busy vertical traffic stays populated and separate through viewport and population changes',()=>{
  const camera=new Camera();camera.resize(1440,900);const crowd=new Crowd(camera),view=new SceneInspector();
  crowd.autoPopulation=true;crowd.targetCount=crowd.recommendedCount;crowd.reset();
  const ids=new Set(),record={minFootGap:Infinity};let visibleTotal=0,peakVisible=0;
  for(let i=0;i<10800;i++){
    if(i===3600||i===7200){camera.resize(i===3600?390:1440,i===3600?844:900);crowd.targetCount=crowd.recommendedCount;}
    crowd.update(dt);let visible=0;
    for(const p of crowd.people){
      ids.add(p.id);assert.ok(Math.abs(p.vx)<.25,'a walker left the vertical flow');
      if(Math.abs(p.x)<camera.worldWidth*.48&&Math.abs(p.y)<camera.worldHeight*.5){
        visible++;assert.ok(p.stillFor<5,'visible traffic stalled behind an entrance');
      }
    }
    visibleTotal+=visible;peakVisible=Math.max(peakVisible,visible);
    if(i%15===0)checkSpacing(crowd.people,record);
    if(i%30===0)for(const alpha of [0,.5,1]){
      const scan=view.scan(crowd.people,camera,alpha);
      assert.equal(scan.overlaps,0,`busy-floor overlap at ${i/60}s, ${scan.pair}: ${scan.minimum}px`);
    }
    if(i===7199)assert.equal(crowd.people.length,12,'narrow viewport did not retire excess walkers');
  }
  assert.equal(crowd.people.length,20,'wide viewport did not admit more walkers');
  assert.ok(visibleTotal/10800>7&&peakVisible>=14,'the floor did not stay busy');
  assert.ok(ids.size>70,'busy traffic stopped admitting new arrivals');
});

test('arrivals and slowdowns do not trap one leg in a step-to dragging cycle',()=>{
  const camera=new Camera();camera.resize(564,680);const crowd=new Crowd(camera);crowd.targetCount=crowd.recommendedCount;crowd.reset();
  const records=new Map();
  for(let i=0;i<7200;i++){
    crowd.update(dt);
    for(const p of crowd.people){
      let r=records.get(p.id);
      if(!r){r={count:[0,0],trail:[0,0],stage:p.feet.map(f=>f.stage)};records.set(p.id,r);}
      p.feet.forEach((f,k)=>{
        if(Math.abs(p.y)<camera.worldHeight*.48){
          if(f.stage==='toeoff'&&r.stage[k]!=='toeoff')r.count[k]++;
          if(f.planted&&p.speed>.15)r.trail[k]=Math.max(r.trail[k],((p.x-f.x)*Math.cos(p.yaw)+(p.y-f.y)*Math.sin(p.yaw))/p.scale);
        }
        r.stage[k]=f.stage;
      });
    }
  }
  let checked=0;
  for(const [id,r]of records)if(Math.min(...r.count)>4){
    checked++;assert.ok(Math.abs(r.trail[0]-r.trail[1])<.25,`walker ${id} kept one leg ahead: ${r.trail}`);
  }
  assert.ok(checked>15,'not enough complete gait sequences were examined');
});

test('random walking retains styles and varied routes while preserving clear, finite poses',()=>{
  const camera=new Camera();camera.resize(1440,900);const crowd=new Crowd(camera),inspector=new SceneInspector(),rig=new Rig();
  crowd.randomness=true;crowd.autoPopulation=true;crowd.targetCount=crowd.recommendedCount;crowd.reset();
  const initial=crowd.people.map(p=>({style:p.walkStyle,pace:p.pace,yaw:p.yaw}));
  assert.equal(new Set(initial.map(p=>p.style)).size,3);
  assert.ok(Math.max(...initial.map(p=>p.pace))-Math.min(...initial.map(p=>p.pace))>.3);
  assert.ok(new Set(initial.map(p=>Math.floor((p.yaw+Math.PI)*4/Math.PI))).size>=4);
  const ids=new Set(),holds=new Map(),record={minFootGap:Infinity};
  for(let i=0;i<7200;i++){
    if(i===3600){camera.resize(390,844);crowd.targetCount=crowd.recommendedCount;}
    crowd.update(dt);
    for(const p of crowd.people){
      ids.add(p.id);holds.set(p.id,p.speed<.05?(holds.get(p.id)||0)+dt:0);
      if(Math.abs(p.x)<camera.worldWidth*.48&&Math.abs(p.y)<camera.worldHeight*.48)assert.ok(holds.get(p.id)<12,`walker ${p.id} remained stuck`);
    }
    if(i%15===0){
      checkSpacing(crowd.people,record);
      for(const p of crowd.people){
        const j=rig.update(p);assert.ok([...j].every(Number.isFinite));
        for(const [a,b]of [[4,5],[5,6],[7,8],[8,9]])near(Math.hypot(j[a*3]-j[b*3],j[a*3+1]-j[b*3+1],j[a*3+2]-j[b*3+2]),p.leg,.002);
      }
    }
    if(i%30===0)for(const alpha of [0,.5,1]){
      const s=inspector.scan(crowd.people,camera,alpha);assert.equal(s.overlaps,0,`random overlap ${i/60}s ${s.pair}: ${s.minimum}px`);
    }
  }
  assert.ok(ids.size>30,'mixed-direction traffic stopped progressing');
  crowd.randomness=false;crowd.targetCount=crowd.recommendedCount;crowd.reset();
  assert.ok(crowd.people.every(p=>p.walkStyle==='Regular'&&Math.abs(p.goalX-p.x)<1e-6));
});
