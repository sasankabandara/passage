import { angleDelta, angleLerp, clamp, lerp, smooth, smoother } from './math.js';

export type FootStage = 'stance' | 'heelrise' | 'toeoff' | 'swing' | 'landing';
export interface Foot {
  side: number; x: number; y: number; z: number; yaw: number; pitch: number;
  px: number; py: number; pz: number; pyaw: number; ppitch: number;
  ax: number; ay: number; anchorYaw: number;
  fromX: number; fromY: number; toX: number; toY: number; fromYaw: number; toYaw: number;
  stage: FootStage; t: number; duration: number; load: number; pload:number; planted: boolean;
  takeoffPitch:number;
  turning:boolean;
  midX:number; midY:number;
  targetVX:number; targetVY:number;
  minAdvance:number;
}
export interface Walker {
  id: number; x: number; y: number; px: number; py: number; yaw: number; pyaw: number;
  vx: number; vy: number; desiredX: number; desiredY: number; speed: number;
  height: number; scale: number; leg: number; shoeLength: number; shoeWidth: number;
  build: number; pace: number; phase: number; age: number; nextSide: number; sinceStep: number; stepTravel: number;
  feet: [Foot, Foot]; goalX: number; goalY: number; route: number;
  pauseAt: number; pauseFor: number; pausedOnce: boolean; pair: number; hasBeenVisible: boolean;
  sway:number; psway:number; blockedFor:number;
  stepNumber:number; stepPeriod:number; hipZ:number; phipZ:number;
  stillFor:number;
  exiting:boolean;
  turnYaw:number|null;
  turnHoldFor:number; turnHoldYaw:number;
  avoidSide:number;
  pphase:number; settling:number; psettling:number;
  gaitSpeed:number;
  walkStyle:string;strideScale:number;cadenceScale:number;liftScale:number;armScale:number;swayScale:number;
}
export const FOOT_GAP = 0.09;
export function createWalker(id: number, x: number, y: number, yaw: number, height = 1.76): Walker {
  const scale = height / 1.76;
  const feet = [-1, 1].map(side => {
    const fx = x - Math.sin(yaw) * side * FOOT_GAP * scale;
    const fy = y + Math.cos(yaw) * side * FOOT_GAP * scale;
    return {side, x:fx, y:fy, z:0, yaw, pitch:0, px:fx, py:fy, pz:0, pyaw:yaw, ppitch:0,
      ax:fx, ay:fy, anchorYaw:yaw, fromX:fx, fromY:fy, toX:fx, toY:fy, fromYaw:yaw, toYaw:yaw,
      stage:'stance' as FootStage, t:0, duration:0.44, load:1, pload:1, planted:true,takeoffPitch:0,turning:false,midX:fx,midY:fy,targetVX:0,targetVY:0,minAdvance:0};
  }) as [Foot, Foot];
  return {id, x,y,px:x,py:y,yaw,pyaw:yaw,vx:0,vy:0,desiredX:0,desiredY:0,speed:0,
    height,scale,leg:0.434*scale,shoeLength:0.29*scale,shoeWidth:0.108*scale,build:1,pace:0.68,
    phase:0,age:0,nextSide:id%2,sinceStep:0.15+(id%4)*0.045,stepTravel:0,feet,goalX:x+10,goalY:y,route:0,
    pauseAt:12,pauseFor:0,pausedOnce:false,pair:-1,hasBeenVisible:false,sway:0,psway:0,blockedFor:0,
    stepNumber:0,stepPeriod:.62,hipZ:.91*scale,phipZ:.91*scale,stillFor:0,exiting:false,turnYaw:null,turnHoldFor:0,turnHoldYaw:0,avoidSide:1,pphase:0,settling:0,psettling:0,gaitSpeed:0,
    walkStyle:'Regular',strideScale:1,cadenceScale:1,liftScale:1,armScale:1,swayScale:1};
}

export function savePrevious(p: Walker) {
  p.px=p.x; p.py=p.y; p.pyaw=p.yaw;p.psway=p.sway;p.phipZ=p.hipZ;p.pphase=p.phase;p.psettling=p.settling;
  for(const f of p.feet) { f.px=f.x; f.py=f.y; f.pz=f.z; f.pyaw=f.yaw; f.ppitch=f.pitch;f.pload=f.load; }
}

export type StepGuard=(p:Walker,f:Foot,x:number,y:number,yaw:number,viaX?:number,viaY?:number)=>boolean;
function planStep(p: Walker, f: Foot, stopping: boolean,guard?:StepGuard,turning=false,releaseSpace=false) {
  const s = p.speed;
  const intent=Math.hypot(p.desiredX,p.desiredY)>.04?Math.atan2(p.desiredY,p.desiredX):p.yaw;
  // Reach constraints can briefly deflect root velocity. Keep placements aligned
  // with the intended walk rather than turning a shoe at every solver correction.
  const travelYaw=turning?intent:p.yaw+clamp(angleDelta(p.yaw,intent),-.30,.30);
  // Reachable orientation changes are distributed across successive foot placements.
  f.toYaw = f.yaw + clamp(angleDelta(f.yaw,travelYaw+f.side*.035),turning?-.55:-.33,turning?.55:.33);
  const supporting=p.feet[f.side<0?1:0];
  f.toYaw=supporting.yaw+clamp(angleDelta(supporting.yaw,f.toYaw),-.60,.60);
  f.fromYaw=f.yaw; f.fromX=f.ax; f.fromY=f.ay;
  const turn = Math.abs(angleDelta(p.yaw,travelYaw));
  f.duration=(turning?.28:clamp(.50-s*.075,.40,.50))/p.cadenceScale;
  const lateral = f.side*Math.max(FOOT_GAP*p.scale,p.shoeWidth*.80+.010);
  // Each walking foot passes the supporting foot. Root-relative targets can
  // settle into a step-to pattern after braking: one leg always leads while
  // the other only catches up. Keep a reachable advance past the support.
  const lead=stopping?0:Math.min(.76*p.scale,(s*(f.duration+.10)+.32*p.scale)*p.strideScale)*(1-clamp(turn/2)*.45);
  f.minAdvance=stopping?0:clamp(p.gaitSpeed*.25,.10*p.scale,.23*p.scale);
  f.toX=p.x+Math.cos(f.toYaw)*lead-Math.sin(f.toYaw)*lateral;
  f.toY=p.y+Math.sin(f.toYaw)*lead+Math.cos(f.toYaw)*lateral;
  if(!stopping){
    const advance=(f.toX-supporting.ax)*Math.cos(f.toYaw)+(f.toY-supporting.ay)*Math.sin(f.toYaw);
    const extra=Math.max(0,f.minAdvance-advance);
    f.toX+=Math.cos(f.toYaw)*extra;f.toY+=Math.sin(f.toYaw)*extra;
  }
  // Limit a single stride instead of stretching either leg to satisfy the route.
  const dx=f.toX-f.ax,dy=f.toY-f.ay,dist=Math.hypot(dx,dy),limit=1.12*p.scale;
  if(dist>limit) { f.toX=f.ax+dx/dist*limit; f.toY=f.ay+dy/dist*limit; }
  if(!stopping)f.minAdvance=Math.min(f.minAdvance,Math.max(.035*p.scale,(f.toX-supporting.ax)*Math.cos(f.toYaw)+(f.toY-supporting.ay)*Math.sin(f.toYaw)));
  const support=p.feet[f.side<0?1:0],sx=f.x-support.x,sy=f.y-support.y,separation=Math.hypot(sx,sy)||1;
  if(releaseSpace){
    f.toX=f.x+sx/separation*.08*p.scale;f.toY=f.y+sy/separation*.08*p.scale;
    const dx=f.toX-p.x,dy=f.toY-p.y,d=Math.hypot(dx,dy),r=.34*p.scale;
    if(d>r){f.toX=p.x+dx/d*r;f.toY=p.y+dy/d*r;}
  }
  turnControl(p,f,support);let midX=turnPoint[0],midY=turnPoint[1];
  if(guard){
    const targetX=f.toX,targetY=f.toY;let found=false;
    // Shorten or gently widen a reachable placement; never edit a planted anchor.
    for(let attempt=0;attempt<(turning?18:9);attempt++){
      const reach=attempt%3===0?1:attempt%3===1?.75:.45,outward=Math.floor(attempt/3)*.025*p.scale;
      f.toX=f.ax+(targetX-f.ax)*reach-Math.sin(f.toYaw)*f.side*outward;
      f.toY=f.ay+(targetY-f.ay)*reach+Math.cos(f.toYaw)*f.side*outward;
      turnControl(p,f,support);midX=turnPoint[0];midY=turnPoint[1];
      if(turning){
        const bend=attempt<3?0:attempt<6?.5:1;
        midX=lerp((f.fromX+f.toX)*.5,midX,bend);midY=lerp((f.fromY+f.toY)*.5,midY,bend);
      }
      if(!stopping&&(f.toX-supporting.ax)*Math.cos(f.toYaw)+(f.toY-supporting.ay)*Math.sin(f.toYaw)<f.minAdvance)continue;
      if(guard(p,f,f.toX,f.toY,f.toYaw,turning?midX:undefined,turning?midY:undefined)){found=true;break;}
    }
    if(!found){p.blockedFor=.22;return false;}
  }
  if(turning)f.duration=clamp((Math.hypot(midX-f.fromX,midY-f.fromY)+Math.hypot(f.toX-midX,f.toY-midY))*.8,.34,.65)/p.cadenceScale;
  f.midX=midX;f.midY=midY;f.turning=turning;f.targetVX=f.targetVY=0;f.takeoffPitch=f.pitch;f.stage='toeoff'; f.t=0; p.sinceStep=0; p.stepTravel=0; p.nextSide=f.side<0?1:0;
  p.stepNumber++;p.stepPeriod=f.duration+.16;
  return true;
}
const turnPoint=new Float64Array(2);
function turnControl(p:Walker,f:Foot,support:Foot){
  const dx=f.toX-f.fromX,dy=f.toY-f.fromY,length=Math.hypot(dx,dy);
  const t=clamp(((support.x-f.fromX)*dx+(support.y-f.fromY)*dy)/Math.max(1e-6,length*length));
  let nx=f.fromX+dx*t-support.x,ny=f.fromY+dy*t-support.y;
  const distance=Math.hypot(nx,ny);
  if(distance>.001){nx/=distance;ny/=distance;}
  else if(length>.001){nx=-dy/length*f.side;ny=dx/length*f.side;}
  else {nx=-Math.sin(p.yaw)*f.side;ny=Math.cos(p.yaw)*f.side;}
  const bow=Math.max(.16*p.scale,(.25*p.scale-distance)*2+.16*p.scale);
  turnPoint[0]=(f.fromX+f.toX)*.5+nx*bow;turnPoint[1]=(f.fromY+f.toY)*.5+ny*bow;
}

export function gaitVelocity(p:Walker,dt:number,out:Float64Array,offset=0){
  const response=1-Math.exp(-dt*2.3);
  let vx=lerp(p.vx,p.desiredX,response),vy=lerp(p.vy,p.desiredY,response);
  out[offset]=vx;out[offset+1]=vy;
  if(p.turnYaw!==null){out[offset]=0;out[offset+1]=0;}
  limitSupportMotion(p,dt,out,offset);
}
export function limitSupportMotion(p:Walker,dt:number,out:Float64Array,offset=0){
  let changed=false;
  const speed=Math.hypot(out[offset],out[offset+1]);
  if(speed>.000001){
    const delta=angleDelta(p.yaw,Math.atan2(out[offset+1],out[offset]));
    if(Math.abs(delta)>.40){
      const yaw=p.yaw+clamp(delta,-.40,.40),component=Math.max(0,out[offset]*Math.cos(yaw)+out[offset+1]*Math.sin(yaw));
      out[offset]=Math.cos(yaw)*component;out[offset+1]=Math.sin(yaw)*component;changed=true;
    }
  }
  for(let iteration=0;iteration<4;iteration++)for(const f of p.feet){
    if(!f.planted||(f.stage==='toeoff'&&f.load<.12))continue;
    const ex=p.x+out[offset]*dt,ey=p.y+out[offset+1]*dt,dx=ex-f.ax,dy=ey-f.ay,d=Math.hypot(dx,dy);
    const limit=Math.max(.52*p.scale,Math.hypot(p.x-f.ax,p.y-f.ay));
    if(d>limit){out[offset]=(f.ax+dx/d*limit-p.x)/dt;out[offset+1]=(f.ay+dy/d*limit-p.y)/dt;changed=true;}
  }
  return changed;
}
const temporaryMotion=new Float64Array(2);
export function updateGait(p: Walker, dt: number,guard?:StepGuard,motion?:Float64Array,offset=0) {
  savePrevious(p); p.age+=dt;p.blockedFor=Math.max(0,p.blockedFor-dt);p.turnHoldFor=Math.max(0,p.turnHoldFor-dt);
  p.gaitSpeed=lerp(p.gaitSpeed,Math.hypot(p.desiredX,p.desiredY),1-Math.exp(-dt*2.3));
  if(!motion){gaitVelocity(p,dt,temporaryMotion);motion=temporaryMotion;offset=0;}
  const vx=motion[offset],vy=motion[offset+1];
  p.vx=vx;p.vy=vy;p.speed=Math.hypot(vx,vy);p.x+=vx*dt;p.y+=vy*dt;
  p.stillFor=p.speed<.05?p.stillFor+dt:Math.max(0,p.stillFor-dt*2);
  if(Math.hypot(p.desiredX,p.desiredY)>.02) {
    const yaw=Math.atan2(p.desiredY,p.desiredX),delta=clamp(angleDelta(p.yaw,yaw),-dt*.65,dt*.65);
    const feetYaw=angleLerp(p.feet[0].yaw,p.feet[1].yaw,.5);
    p.yaw=feetYaw+clamp(angleDelta(feetYaw,p.yaw+delta),-.35,.35);
  }
  const halfPeriod=clamp((.38+.12*Math.min(p.gaitSpeed,1))/Math.max(p.gaitSpeed,.08),.54,1.10)/p.cadenceScale;
  p.sinceStep+=dt; p.stepTravel+=p.speed*dt;
  for(const f of p.feet) {
    f.t+=dt;
    const opposite=p.feet[f.side===-1?1:0];
    const trailing=(p.x-f.x)*Math.cos(p.yaw)+(p.y-f.y)*Math.sin(p.yaw);
    if(f.stage==='stance'&&opposite.stage==='swing'&&opposite.t/opposite.duration>.50&&trailing>.055*p.scale){f.stage='heelrise';f.t=0;}
    if(f.stage==='toeoff') {
      const t=clamp(f.t/0.10);f.pitch=lerp(f.takeoffPitch,f.turning?-.30:-.54,smooth(t));f.z=0;f.load=1-t*0.95;
      if(t>=1){f.stage='swing';f.t=0;f.planted=false;}
    } else if(f.stage==='swing') {
      const t=clamp(f.t/f.duration),u=smoother(t);
      if(!f.turning&&t<.78){
        const remaining=f.duration-f.t,bodyX=p.x+p.vx*remaining,bodyY=p.y+p.vy*remaining;
        const dx=f.toX-bodyX,dy=f.toY-bodyY,d=Math.hypot(dx,dy),reach=.37*p.scale;
        const desiredX=d>reach?bodyX+dx/d*reach:f.toX,desiredY=d>reach?bodyY+dy/d*reach:f.toY;
        // A bounded spring changes the landing gradually, then eases to a
        // committed target. Directly replacing it made the swing jerk on braking.
        f.targetVX+=clamp(144*(desiredX-f.toX)-24*f.targetVX,-4*p.scale,4*p.scale)*dt;
        f.targetVY+=clamp(144*(desiredY-f.toY)-24*f.targetVY,-4*p.scale,4*p.scale)*dt;
        const fade=1-smoother((t-.40)/.38),targetX=f.toX+f.targetVX*fade*dt,targetY=f.toY+f.targetVY*fade*dt;
        const advance=(targetX-opposite.ax)*Math.cos(f.toYaw)+(targetY-opposite.ay)*Math.sin(f.toYaw);
        if((Math.hypot(p.desiredX,p.desiredY)<.05||advance>=f.minAdvance)&&(!guard||guard(p,f,targetX,targetY,f.toYaw))){f.toX=targetX;f.toY=targetY;}
        else {f.targetVX*=.5;f.targetVY*=.5;}
      }
      f.yaw=angleLerp(f.fromYaw,f.toYaw,u);
      f.pitch=t<.32?lerp(f.turning?-.30:-.54,.055,smoother(t/.32)):t<.78?.055:lerp(.055,.18,smoother((t-.78)/.22));
      // Animate the physical shoe centre. Animating its flat contact anchor
      // instead made unrolling retract the shoe immediately after toe-off.
      const startPitch=f.turning?-.30:-.54,startOffset=rollOffset(p.shoeLength,startPitch),endOffset=rollOffset(p.shoeLength,.18);
      const startX=f.fromX+Math.cos(f.fromYaw)*startOffset,startY=f.fromY+Math.sin(f.fromYaw)*startOffset;
      const endX=f.toX+Math.cos(f.toYaw)*endOffset,endY=f.toY+Math.sin(f.toYaw)*endOffset;
      const offset=rollOffset(p.shoeLength,f.pitch);
      if(f.turning){
        // One rounded arc, with no full stop at the outward control point.
        f.x=(1-u)**2*startX+2*(1-u)*u*f.midX+u*u*endX;
        f.y=(1-u)**2*startY+2*(1-u)*u*f.midY+u*u*endY;
      }else{f.x=lerp(startX,endX,u);f.y=lerp(startY,endY,u);}
      f.x-=Math.cos(f.yaw)*offset;f.y-=Math.sin(f.yaw)*offset;
      const startZ=-p.shoeLength*.57*Math.sin(startPitch),endZ=p.shoeLength*.43*Math.sin(.18);
      const centreZ=lerp(startZ,endZ,u)+(f.turning?.025:.055)*p.scale*p.liftScale*(729/16)*t*t*(1-t)**4;
      const pivot=f.pitch>=0?-p.shoeLength*.43:p.shoeLength*.57;
      f.z=Math.max(0,centreZ+pivot*Math.sin(f.pitch));f.load=0;
      if(t>=1){f.ax=f.toX;f.ay=f.toY;f.anchorYaw=f.toYaw;f.x=f.ax;f.y=f.ay;f.yaw=f.anchorYaw;f.z=0;f.pitch=.18;f.stage='landing';f.t=0;f.planted=true;}
    } else if(f.stage==='landing') {
      const t=clamp(f.t/0.12);f.pitch=.18*(1-smooth(t));f.load=smooth(t);
      if(t>=1){f.stage='stance';f.t=0;f.pitch=0;f.load=1;}
    } else if(f.stage==='heelrise'){
      const target=p.speed>.04?-.23*smooth(trailing/(.30*p.scale)):0;
      f.pitch=lerp(f.pitch,target,1-Math.exp(-dt*12));f.z=0;
      if(p.speed<.04&&Math.abs(f.pitch)<.002){f.stage='stance';f.pitch=0;}
    } else {f.x=f.ax;f.y=f.ay;f.yaw=f.anchorYaw;f.z=0;f.pitch=0;f.load=1;}
  }
  const busy=p.feet.some(f=>f.stage==='toeoff'||f.stage==='swing');
  const f=p.feet[p.nextSide],support=p.feet[1-p.nextSide];
  const transferred=support.stage==='stance'||support.stage==='landing'&&support.t>=.06;
  if(!busy&&(f.stage==='stance'||f.stage==='heelrise')&&transferred) {
    const trailing=(p.x-f.ax)*Math.cos(p.yaw)+(p.y-f.ay)*Math.sin(p.yaw);
    const steering=Math.hypot(p.desiredX,p.desiredY)>.04?Math.atan2(p.desiredY,p.desiredX):p.yaw;
    if(p.speed<.18&&Math.abs(angleDelta(f.yaw,steering))>.25&&p.sinceStep>.20){
      const began=planStep(p,f,true,guard,true);
      // Begin a tight turn with the free outside foot when the selected foot's
      // route would cross the supporting shoe. Its anchor is never dragged.
      if(!began&&(support.stage==='stance'||support.stage==='heelrise'))planStep(p,support,true,guard,true,true);
    }
    else if((p.speed>.045||p.gaitSpeed>.06&&Math.hypot(p.desiredX,p.desiredY)>.05)&&((p.stepNumber===0&&p.sinceStep>.13)||p.sinceStep>=halfPeriod||p.stepTravel>.43*p.scale||trailing>.30*p.scale)){
      if(!planStep(p,f,false,guard)&&p.speed<.12&&!planStep(p,f,true,guard))planStep(p,f,true,guard,true);
    }
    else if(p.speed<0.045&&Math.hypot(p.desiredX,p.desiredY)<.05&&p.sinceStep>0.35){
      // Complete a final closing step; don't keep cycling while stationary.
      const lateral=f.side*Math.max(FOOT_GAP*p.scale,p.shoeWidth*.80+.010);
      const tx=p.x-Math.sin(p.yaw)*lateral,ty=p.y+Math.cos(p.yaw)*lateral;
      if(Math.hypot(f.ax-tx,f.ay-ty)>0.07*p.scale) planStep(p,f,true,guard);
      else {
        const other=p.feet[1-p.nextSide],ol=other.side*FOOT_GAP*p.scale;
        if(Math.hypot(other.ax-p.x+Math.sin(p.yaw)*ol,other.ay-p.y-Math.cos(p.yaw)*ol)>0.07*p.scale) p.nextSide=1-p.nextSide;
      }
    }
  }
  let totalLoad=0,weightedSide=0;
  const fx=Math.cos(p.yaw),fy=Math.sin(p.yaw),rx=-fy,ry=fx;
  for(const f of p.feet){
    const progress=((f.x-p.x)*fx+(f.y-p.y)*fy)/p.scale;
    let weight=clamp(.5+progress*1.8,.16,.88);
    if(f.stage==='swing')weight=0;
    else if(f.stage==='toeoff')weight*=1-smooth(f.t/.10)*.97;
    else if(f.stage==='landing')weight*=smooth(f.t/.12);
    f.load=weight;totalLoad+=weight;
  }
  for(const f of p.feet){f.load/=Math.max(totalLoad,1e-6);weightedSide+=f.load*((f.x-p.x)*rx+(f.y-p.y)*ry);}
  p.sway=lerp(p.sway,clamp(weightedSide,-.037*p.scale*p.swayScale,.037*p.scale*p.swayScale),1-Math.exp(-dt*5));
  const phaseTarget=p.stepNumber>0?(p.stepNumber-1+Math.min(p.sinceStep/p.stepPeriod,1))*.5:0;
  p.phase=lerp(p.phase,phaseTarget,1-Math.exp(-dt*12));
  p.settling=0;for(const f of p.feet)if(f.stage==='landing')p.settling+=Math.sin(Math.PI*Math.min(1,f.t/.12))*.012*p.scale;
  let idealHeight=0;
  for(const f of p.feet){
    shoePoint(f,p.shoeLength,0,-p.shoeLength*.14,1,temporaryAnkle);
    const hx=p.x+rx*(p.sway+f.side*.09*p.scale),hy=p.y+ry*(p.sway+f.side*.09*p.scale);
    const horizontal=(hx-temporaryAnkle[0])**2+(hy-temporaryAnkle[1])**2;
    const span=p.leg*1.995;
    idealHeight+=f.load*(temporaryAnkle[2]+.065*p.scale+Math.sqrt(Math.max(.22,span*span-horizontal)));
  }
  p.hipZ=lerp(p.hipZ,clamp(idealHeight,.80*p.scale,.94*p.scale),1-Math.exp(-dt*11));
}
const temporaryAnkle=new Float64Array(3);
function rollOffset(length:number,pitch:number){return (pitch>=0?-length*.43:length*.57)*(1-Math.cos(pitch));}

// Local shoe coordinates: u across, v forward. Rotation is around a fixed heel/toe
// contact, so rolling changes perspective without moving the support anchor.
export function shoePoint(f: Foot, length: number, u: number, v: number, alpha=1, out=new Float64Array(3)) {
  const yaw=angleLerp(f.pyaw,f.yaw,alpha),pitch=lerp(f.ppitch,f.pitch,alpha);
  const x=lerp(f.px,f.x,alpha),y=lerp(f.py,f.y,alpha),lift=lerp(f.pz,f.z,alpha);
  const heel=-length*0.43,toe=length*0.57;
  const pivot=pitch>=0?heel:toe;
  const forward=pivot+(v-pivot)*Math.cos(pitch);
  out[0]=x+Math.cos(yaw)*forward-Math.sin(yaw)*u;
  out[1]=y+Math.sin(yaw)*forward+Math.cos(yaw)*u;
  out[2]=Math.max(0,lift+(v-pivot)*Math.sin(pitch));
  return out;
}
