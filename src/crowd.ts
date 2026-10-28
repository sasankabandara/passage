import { Camera } from './camera.js';
import { createWalker, gaitVelocity, updateGait, type Walker } from './gait.js';
import { clamp, Random } from './math.js';
import { Rig } from './rig.js';
import { bodyClearance, constrainCrowdMotion, figureGap, StepReservations } from './collision.js';
const HEADINGS=[0,.28,.55,.85,1.18,1.50,-.28,-.55,-.85,-1.18,-1.50];
const HORIZONS=[.55,1.15,1.9];
const LANE_SPACING=2.3,ARRIVAL_SPACING=3.15,FOLLOWING_DISTANCE=3.05;

export class Crowd {
  people:Walker[]=[];random=new Random(88713);time=0;solo=false;targetCount=6;
  autoPopulation=false;
  randomness=false;
  private nextId=0;
  private nextRoute=0;private arrivalCheck=0;
  private cullRig=new Rig();private projected=new Float64Array(3);
  private motion=new Float64Array(24);private reservations=new StepReservations();
  private preferred=new Float64Array(2);
  private verticalRoutes=new Map<number,number>();
  get laneCount(){return this.camera.worldWidth>=10.7?5:3;}
  get recommendedCount(){return this.randomness?this.laneCount*2+2:this.laneCount*4;}
  constructor(public camera:Camera){this.reservations.camera=camera;this.reset();}
  reset(){this.random=new Random(this.randomness?45127:88713);this.nextId=0;this.time=0;this.people.length=0;this.verticalRoutes.clear();this.nextRoute=this.targetCount;this.arrivalCheck=0;for(let i=0;i<this.targetCount;i++)this.people.push(this.spawn(i,true)!);}
  private spawn(index:number,initial=false,reuse?:Walker){
    if(this.randomness)return this.spawnRandom(index,initial,reuse);
    const h=this.camera.worldHeight,r=this.random;
    // Add parallel lanes as the floor widens, retaining room for whole strides
    // and for the body shadow projected inward from each outer lane.
    const lanes=this.laneCount,laneIndex=index%lanes,column=laneIndex-(lanes-1)/2;
    // Lane positions and directions remain consistent through a resize. New
    // arrivals must never oppose existing walkers in the same physical lane.
    const direction=column%2===0?1:-1;
    const x=column*LANE_SPACING+r.range(-.025,.025);
    const extent=h*.56+1.4;
    const rows=Math.ceil(this.targetCount/lanes);
    let y=initial?(Math.floor(index/lanes)-(rows-1)/2)*ARRIVAL_SPACING+(laneIndex%2)*.5:-direction*extent;
    const gx=x,gy=direction*extent;
    // Reserve complete figure space before admitting an arrival. A blocked
    // entrance waits offstage; it must not create a long physical queue whose
    // projected shadows can obstruct the entrance from outside the viewport.
    let clear=false;
    for(let attempt=0;attempt<(initial?256:1);attempt++){
      const candidate={x,y,height:1.91,scale:1.1} as Walker;
      if(this.people.every(q=>q===reuse||figureGap(candidate,q,this.camera)>.18)){clear=true;break;}
      y-=direction*.25;
    }
    if(!clear)return undefined;
    const p=createWalker(this.nextId++,x,y,Math.atan2(gy-y,gx-x),r.range(1.61,1.91));
    if(reuse)this.verticalRoutes.delete(reuse.id);
    this.verticalRoutes.set(p.id,direction);
    p.goalX=gx;p.goalY=gy;p.route=index;p.pace=r.range(.72,.92);p.build=r.range(.85,1.18);
    p.shoeWidth*=r.range(.92,1.12);p.shoeLength*=r.range(.95,1.08);p.pauseAt=r.range(7,15);p.pair=index===0||index===2?1:-1;
    if(reuse){Object.assign(reuse,p);return reuse;}return p;
  }
  private spawnRandom(index:number,initial:boolean,reuse?:Walker){
    const r=this.random,w=this.camera.worldWidth,h=this.camera.worldHeight,margin=1.8;
    let x:number,y:number,gx:number,gy:number;
    if(initial){
      const lanes=this.laneCount,lane=index%lanes,rows=Math.ceil(this.targetCount/lanes);
      x=(lane-(lanes-1)/2)*LANE_SPACING+r.range(-.025,.025);
      y=(Math.floor(index/lanes)-(rows-1)/2)*ARRIVAL_SPACING+(lane%2)*.5;
      let clear=false;
      for(let attempt=0;attempt<256;attempt++){
        const candidate={x,y,height:1.91,scale:1.1} as Walker;
        if(this.people.every(q=>q===reuse||figureGap(candidate,q,this.camera)>.25)){clear=true;break;}
        y+=(index%2?1:-1)*.25;
      }
      if(!clear)return undefined;
      let yaw=Math.floor(r.range(0,8))*Math.PI/4+r.range(-.12,.12);
      if(Math.abs(y)>h*.38||Math.abs(x)>w*.4)yaw=Math.atan2(-y,-x)+r.range(-.55,.55);
      const distance=Math.max(w,h)*2+4;gx=x+Math.cos(yaw)*distance;gy=y+Math.sin(yaw)*distance;
    }else{
      const edge=Math.floor(r.range(0,4));
      if(edge<2){x=(edge===0?-1:1)*(w*.5+margin);y=r.range(-h*.4,h*.4);gx=-x;gy=r.range(-h*.4,h*.4);}
      else {y=(edge===2?-1:1)*(h*.5+margin);x=r.range(-w*.4,w*.4);gy=-y;gx=r.range(-w*.4,w*.4);}
      const candidate={x,y,height:1.91,scale:1.1} as Walker;
      if(!this.people.every(q=>q===reuse||figureGap(candidate,q,this.camera)>.25))return undefined;
    }
    const p=createWalker(this.nextId++,x,y,Math.atan2(gy-y,gx-x),r.range(1.61,1.91));
    if(reuse)this.verticalRoutes.delete(reuse.id);
    p.goalX=gx;p.goalY=gy;p.route=index;p.build=r.range(.85,1.15);p.pauseAt=r.range(12,24);
    const style=Math.floor(r.range(0,3));
    if(style===0){p.walkStyle='Relaxed';p.pace=r.range(.56,.73);p.strideScale=.94;p.cadenceScale=.92;p.liftScale=.95;p.armScale=.78;p.swayScale=.9;}
    else if(style===1){p.walkStyle='Brisk';p.pace=r.range(.86,1.03);p.strideScale=1.04;p.cadenceScale=1.10;p.liftScale=1.08;p.armScale=1.15;p.swayScale=.85;}
    else {p.walkStyle='Easy';p.pace=r.range(.70,.87);p.strideScale=1;p.cadenceScale=1;p.liftScale=1.02;p.armScale=1.03;p.swayScale=1.10;}
    p.shoeWidth*=r.range(.94,1.08);p.shoeLength*=r.range(.96,1.06);
    if(reuse){Object.assign(reuse,p);return reuse;}return p;
  }
  update(dt:number){
    this.time+=dt;
    const n=this.people.length;
    if(this.motion.length<n*2)this.motion=new Float64Array(n*2);
    for(let i=0;i<n;i++){
      const p=this.people[i];let dx=p.goalX-p.x,dy=p.goalY-p.y,d=Math.hypot(dx,dy);
      if(d<.45){
        p.exiting=true;
        // Keep the same exit direction until the entire projected body leaves.
        // A resize must not strand a walker at an old, now-visible destination.
        const extension=Math.max(this.camera.worldWidth,this.camera.worldHeight)+2;
        p.goalX+=(d>1e-6?dx/d:Math.cos(p.yaw))*extension;p.goalY+=(d>1e-6?dy/d:Math.sin(p.yaw))*extension;
        dx=p.goalX-p.x;dy=p.goalY-p.y;d=Math.hypot(dx,dy)||1;
      }
      if(p.age>p.pauseAt&&!p.pausedOnce&&p.route%3===1){p.pauseFor=1.6;p.pausedOnce=true;}
      if(p.pauseFor>0){p.pauseFor-=dt;p.desiredX=0;p.desiredY=0;}
      else {this.chooseVelocity(p,n,dx/d,dy/d);p.desiredX=this.preferred[0];p.desiredY=this.preferred[1];}
      gaitVelocity(p,dt,this.motion,i*2);
    }
    constrainCrowdMotion(this.people,this.motion,n,dt,this.camera);
    // Lane traffic has one degree of freedom. Reach corrections may slow a
    // stride, but must not turn into a lateral dodge when following gets tight.
    for(let i=0;i<n;i++){
      const p=this.people[i];if(!this.verticalRoutes.has(p.id))continue;
      this.motion[i*2]=0;
      for(const f of p.feet){
        if(!f.planted||(f.stage==='toeoff'&&f.load<.12))continue;
        const reach=Math.max(.52*p.scale,Math.hypot(p.x-f.ax,p.y-f.ay));
        const along=Math.sqrt(Math.max(0,reach*reach-(p.x-f.ax)**2));
        this.motion[i*2+1]=clamp(this.motion[i*2+1],(f.ay-along-p.y)/dt,(f.ay+along-p.y)/dt);
      }
    }
    this.reservations.people=this.people;
    // Alternate deterministic planning priority to avoid starving a waiting step.
    const first=Math.floor(this.time*.7)%Math.max(1,n);
    const retire:number[]=[];
    for(let k=0;k<n;k++){
      const i=(k+first)%n,p=this.people[i];
      updateGait(p,dt,this.reservations.canStep,this.motion,i*2);
      const offscreen=this.outsideFrame(p);
      if(!offscreen)p.hasBeenVisible=true;
      // Recycle only when every projected joint, body radius, and both shoes
      // have left the glass. New arrivals keep their persistent destination.
      if(p.age>3&&offscreen&&(p.hasBeenVisible||p.exiting)){
        if(this.people.length-retire.length>this.targetCount)retire.push(i);
        else this.spawn(p.route,false,p);
      }
    }
    for(const i of retire.sort((a,b)=>b-a)){this.verticalRoutes.delete(this.people[i].id);this.people.splice(i,1);}
    if(this.autoPopulation&&this.people.length<this.targetCount&&this.time>=this.arrivalCheck){
      this.arrivalCheck=this.time+.25;
      const lanes=this.laneCount;
      const entries=Array.from({length:lanes},(_,lane)=>({lane,count:this.people.filter(p=>Math.abs(p.x-(lane-(lanes-1)/2)*LANE_SPACING)<.75).length}));
      for(const {lane} of entries.sort((a,b)=>a.count-b.count)){
        const route=this.nextRoute+(lane-this.nextRoute%lanes+lanes)%lanes;
        const arrival=this.spawn(route,false);
        if(arrival){this.people.push(arrival);this.nextRoute=route+1;break;}
      }
    }
  }
  private chooseVelocity(p:Walker,n:number,fx:number,fy:number){
    const vertical=this.verticalRoutes.get(p.id);
    if(vertical!==undefined){
      let pace=p.pace;
      // Follow a slower or paused person in the same lane instead of choosing
      // a diagonal passing route. The shared collision solver still checks feet.
      for(let j=0;j<n;j++){
        const q=this.people[j],ahead=(q.y-p.y)*vertical;
        if(q===p||ahead<=0||Math.abs(q.x-p.x)>.75)continue;
        pace=Math.min(pace,Math.max(0,q.vy*vertical)+Math.max(0,ahead-FOLLOWING_DISTANCE)*.8);
      }
      this.preferred[0]=0;this.preferred[1]=vertical*pace;return;
    }
    if(p.turnHoldFor>0&&p.turnYaw===null){this.preferred[0]=Math.cos(p.turnHoldYaw)*p.pace*.60;this.preferred[1]=Math.sin(p.turnHoldYaw)*p.pace*.60;return;}
    if(p.turnYaw!==null){
      if(Math.abs(Math.atan2(Math.sin(p.turnYaw-p.yaw),Math.cos(p.turnYaw-p.yaw)))<.18){p.turnHoldYaw=p.turnYaw;p.turnHoldFor=1.6;p.turnYaw=null;this.preferred[0]=Math.cos(p.turnHoldYaw)*p.pace*.60;this.preferred[1]=Math.sin(p.turnHoldYaw)*p.pace*.60;return;}
      else {this.preferred[0]=Math.cos(p.turnYaw)*.13;this.preferred[1]=Math.sin(p.turnYaw)*.13;return;}
    }
    const goalYaw=Math.atan2(fy,fx);let best=Infinity,bx=0,by=0,bestSide=p.avoidSide;
    const headingError=Math.atan2(Math.sin(goalYaw-p.yaw),Math.cos(goalYaw-p.yaw));
    if(Math.abs(headingError)<.35){
      let clear=true;
      for(let j=0;j<n&&clear;j++){
        const q=this.people[j];if(q===p||Math.hypot(p.x-q.x,p.y-q.y)>3.7)continue;
        for(const t of HORIZONS)if(figureGap(p,q,this.camera,p.x+fx*p.pace*t,p.y+fy*p.pace*t,q.x+q.vx*t,q.y+q.vy*t)<.27){clear=false;break;}
      }
      if(clear){this.preferred[0]=fx*p.pace;this.preferred[1]=fy*p.pace;return;}
    }
    for(let option=0;option<=HEADINGS.length*2;option++){
      const stop=option===HEADINGS.length*2,offset=stop?0:HEADINGS[Math.floor(option/2)],yaw=goalYaw+offset;
      const turn=Math.atan2(Math.sin(yaw-p.yaw),Math.cos(yaw-p.yaw));
      const pace=stop?0:p.pace*(option%2===0?1:.48)*(.28+.72*Math.max(0,Math.cos(turn)));
      const vx=Math.cos(yaw)*pace,vy=Math.sin(yaw)*pace;
      let cost=stop?.75:-(vx*fx+vy*fy)*2.2+Math.abs(offset)*.12+(offset*p.avoidSide<0?.80:0)+Math.hypot(vx-p.desiredX,vy-p.desiredY)*.12;
      for(let j=0;j<n;j++){
        const q=this.people[j];if(q===p||Math.hypot(p.x-q.x,p.y-q.y)>3.7)continue;
        const now=figureGap(p,q,this.camera),required=Math.min(.22,Math.max(.075,now));
        let furthest=now;
        for(const t of HORIZONS){
          const gap=figureGap(p,q,this.camera,p.x+vx*t,p.y+vy*t,q.x+q.vx*t,q.y+q.vy*t);
          if(gap<required)cost+=(required-gap)*(gap<0?60:16)*(t<1?1.8:1);
          furthest=Math.max(furthest,gap);
        }
        if(p.stillFor>1)cost-=Math.min(.65,p.stillFor*.07)*Math.min(1.5,furthest-now);
      }
      if(cost<best){best=cost;bx=vx;by=vy;bestSide=Math.abs(offset)>.50?Math.sign(offset):p.avoidSide;}
    }
    this.preferred[0]=bx;this.preferred[1]=by;
    p.avoidSide=bestSide;
    if(p.speed<.08&&Math.hypot(bx,by)>.05&&Math.abs(Math.atan2(Math.sin(Math.atan2(by,bx)-p.yaw),Math.cos(Math.atan2(by,bx)-p.yaw)))>.70)p.turnYaw=Math.atan2(by,bx);
  }
  private outsideFrame(p:Walker){
    const j=this.cullRig.update(p),q=this.projected,c=this.camera;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(let i=0;i<16;i++){
      c.project(j[i*3],j[i*3+1],j[i*3+2],q);
      const radius=.21*p.scale*c.scale*c.distance/(c.distance+j[i*3+2]);
      minX=Math.min(minX,q[0]-radius);maxX=Math.max(maxX,q[0]+radius);
      minY=Math.min(minY,q[1]-radius);maxY=Math.max(maxY,q[1]+radius);
    }
    for(const f of p.feet){
      c.project(f.x,f.y,f.z,q);const r=p.shoeLength*c.scale*.8;
      minX=Math.min(minX,q[0]-r);maxX=Math.max(maxX,q[0]+r);minY=Math.min(minY,q[1]-r);maxY=Math.max(maxY,q[1]+r);
    }
    return maxX<-8||maxY<-8||minX>c.width+8||minY>c.height+8;
  }
  get visiblePeople(){return this.solo?this.people.slice(0,1):this.people;}
}
