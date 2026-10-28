import { clamp } from './math.js';
import type { Foot, Walker } from './gait.js';
import {limitSupportMotion} from './gait.js';
import type { Camera } from './camera.js';

function pointSegment(px:number,py:number,ax:number,ay:number,bx:number,by:number){
  const dx=bx-ax,dy=by-ay,t=clamp(((px-ax)*dx+(py-ay)*dy)/Math.max(1e-12,dx*dx+dy*dy));
  return (px-ax-t*dx)**2+(py-ay-t*dy)**2;
}
export function segmentDistanceSquared(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,dx:number,dy:number){
  const abx=bx-ax,aby=by-ay,cdx=dx-cx,cdy=dy-cy,den=abx*cdy-aby*cdx;
  if(Math.abs(den)>1e-10){
    const t=((cx-ax)*cdy-(cy-ay)*cdx)/den,u=((cx-ax)*aby-(cy-ay)*abx)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1)return 0;
  }
  return Math.min(pointSegment(ax,ay,cx,cy,dx,dy),pointSegment(bx,by,cx,cy,dx,dy),pointSegment(cx,cy,ax,ay,bx,by),pointSegment(dx,dy,ax,ay,bx,by));
}

// A conservative sole capsule includes the heel, toe, and lateral shoe edge.
export function soleCapsule(p:Walker,f:Foot,out:Float64Array,x=f.x,y=f.y,yaw=f.yaw){
  const radius=p.shoeWidth*.58,heel=-p.shoeLength*.47+radius,toe=p.shoeLength*.60-radius;
  const fx=Math.cos(yaw),fy=Math.sin(yaw);
  out[0]=x+fx*heel;out[1]=y+fy*heel;out[2]=x+fx*toe;out[3]=y+fy*toe;out[4]=radius;
  return out;
}
export function capsuleGap(a:Float64Array,b:Float64Array){return Math.sqrt(segmentDistanceSquared(a[0],a[1],a[2],a[3],b[0],b[1],b[2],b[3]))-a[4]-b[4];}
export const bodyClearance=(a:Walker,b:Walker)=>1.02*(a.scale+b.scale)*.5;
export function figureEnvelope(p:Walker,camera:Camera,out:Float64Array,x=p.x,y=p.y){
  const k=camera.distance/(camera.distance+p.height+.12);
  out[0]=x;out[1]=y;
  out[2]=camera.eyeX+(x-camera.eyeX)*k;out[3]=camera.eyeY+(y-camera.eyeY)*k;
  // Covers actual foot reach, arms, body diffusion, and the perspective offset
  // toward the camera's vanishing point, rather than only a disc at the hips.
  out[4]=.65*p.scale;return out;
}
const viewA=new Float64Array(5),viewB=new Float64Array(5);
export function figureGap(p:Walker,q:Walker,camera:Camera,px=p.x,py=p.y,qx=q.x,qy=q.y){
  return capsuleGap(figureEnvelope(p,camera,viewA,px,py),figureEnvelope(q,camera,viewB,qx,qy));
}

function inTriangle(x:number,y:number,p:Float64Array,a:number,b:number,c:number){
  const ax=p[a],ay=p[a+1],bx=p[b],by=p[b+1],cx=p[c],cy=p[c+1];
  const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);if(Math.abs(area)<1e-10)return false;
  const u=((bx-x)*(cy-y)-(by-y)*(cx-x))/area;
  const v=((cx-x)*(ay-y)-(cy-y)*(ax-x))/area;
  return u>=0&&v>=0&&u+v<=1;
}
function insideHull(x:number,y:number,p:Float64Array){
  if(p.length===13){
    for(let a=0;a<12;a+=2)for(let b=a+2;b<12;b+=2)for(let c=b+2;c<12;c+=2)if(inTriangle(x,y,p,a,b,c))return true;
    return false;
  }
  return inTriangle(x,y,p,0,2,4)||inTriangle(x,y,p,0,2,6)||inTriangle(x,y,p,0,4,6)||inTriangle(x,y,p,2,4,6);
}
function sweepGap(a:Float64Array,b:Float64Array){
  const an=(a.length-1)/2,bn=(b.length-1)/2,radius=a[a.length-1]+b[b.length-1];
  for(let i=0;i<an*2;i+=2)if(insideHull(a[i],a[i+1],b))return -radius;
  for(let i=0;i<bn*2;i+=2)if(insideHull(b[i],b[i+1],a))return -radius;
  let distance=Infinity;
  // All six edges of four points include the convex hull boundary. Interior
  // diagonals are harmless and avoid allocating/sorting a polygon per step.
  for(let i=0;i<an;i++)for(let j=i+1;j<an;j++)for(let k=0;k<bn;k++)for(let l=k+1;l<bn;l++){
    distance=Math.min(distance,segmentDistanceSquared(a[i*2],a[i*2+1],a[j*2],a[j*2+1],b[k*2],b[k*2+1],b[l*2],b[l*2+1]));
    if(distance===0)return -radius;
  }
  return Math.sqrt(distance)-radius;
}

export class StepReservations {
  private a=new Float64Array(5);private b=new Float64Array(5);
  private ownSweep=new Float64Array(9);private otherSweep=new Float64Array(9);
  private ownCurve=new Float64Array(13);private otherCurve=new Float64Array(13);
  private activeSweep=this.ownSweep;
  private curvePadding=0;
  private startSole=new Float64Array(9);private endSole=new Float64Array(9);
  private otherFigure=new Float64Array(9);private figure=new Float64Array(5);
  camera?:Camera;
  constructor(public people:Walker[]=[]){ }
  private sweep(p:Walker,f:Foot,x:number,y:number,yaw:number,out:Float64Array,sx=f.x,sy=f.y,syaw=f.yaw,viaX?:number,viaY?:number){
    const a=soleCapsule(p,f,this.a,sx,sy,syaw),b=soleCapsule(p,f,this.b,x,y,yaw);
    out[0]=a[0];out[1]=a[1];out[2]=a[2];out[3]=a[3];
    out[4]=b[0];out[5]=b[1];out[6]=b[2];out[7]=b[3];
    if(viaX!==undefined&&viaY!==undefined){
      const control=soleCapsule(p,f,this.a,viaX,viaY,syaw+Math.atan2(Math.sin(yaw-syaw),Math.cos(yaw-syaw))*.5);
      out[8]=control[0];out[9]=control[1];out[10]=control[2];out[11]=control[3];
    }
    out[out.length-1]=p.shoeWidth*.58+.008;
  }
  private staticSole(p:Walker,f:Foot,x:number,y:number,yaw:number,out:Float64Array){
    const a=soleCapsule(p,f,this.a,x,y,yaw);
    out[0]=out[4]=a[0];out[1]=out[5]=a[1];out[2]=out[6]=a[2];out[3]=out[7]=a[3];out[8]=a[4]+.008;
  }
  private clearPath(other:Float64Array,required:number){
    const baseline=sweepGap(this.startSole,other),gap=sweepGap(this.activeSweep,other);
    if(baseline>=required)return gap>=required;
    // A close but separate foot may leave its current margin, provided the
    // whole path preserves separation and the landing restores full clearance.
    return gap>=Math.max(.003,baseline-1e-7)&&sweepGap(this.endSole,other)>=required;
  }
  canStep=(p:Walker,f:Foot,x:number,y:number,yaw:number,viaX?:number,viaY?:number)=>{
    this.curvePadding=0;
    if(viaX===undefined||viaY===undefined)return this.canSegment(p,f,f.x,f.y,f.yaw,x,y,yaw);
    // Check the swept arc itself. Its full convex hull includes the shortcut
    // across a standing shoe and can incorrectly forbid walking around it.
    const segments=8,angle=Math.atan2(Math.sin(yaw-f.yaw),Math.cos(yaw-f.yaw));
    this.curvePadding=Math.hypot(f.x-2*viaX+x,f.y-2*viaY+y)/(4*segments*segments)+p.shoeLength*angle*angle/(8*segments*segments);
    let sx=f.x,sy=f.y,syaw=f.yaw;
    for(let i=1;i<=segments;i++){
      const u=i/segments,nx=(1-u)**2*f.x+2*(1-u)*u*viaX+u*u*x,ny=(1-u)**2*f.y+2*(1-u)*u*viaY+u*u*y,nyaw=f.yaw+angle*u;
      if(!this.canSegment(p,f,sx,sy,syaw,nx,ny,nyaw)){this.curvePadding=0;return false;}
      sx=nx;sy=ny;syaw=nyaw;
    }
    this.curvePadding=0;return true;
  };
  private canSegment(p:Walker,f:Foot,sx:number,sy:number,syaw:number,x:number,y:number,yaw:number,viaX?:number,viaY?:number){
    // A quadratic turn lies inside its start/control/end hull. Reserve that
    // entire hull, including its interior, rather than two stopping segments.
    const own=viaX===undefined?this.ownSweep:this.ownCurve,other=this.otherSweep;this.activeSweep=own;
    this.sweep(p,f,x,y,yaw,own,sx,sy,syaw,viaX,viaY);
    own[own.length-1]+=this.curvePadding;
    this.staticSole(p,f,sx,sy,syaw,this.startSole);this.staticSole(p,f,x,y,yaw,this.endSole);
    for(const q of this.people){
      if(q===p){
        // A turning step must stay on its own side of the supporting leg.
        const support=q.feet[f.side===-1?1:0];this.sweep(q,support,support.x,support.y,support.yaw,other);
        if(!this.clearPath(other,.018))return false;
        continue;
      }
      if(Math.hypot(q.x-p.x,q.y-p.y)>3.2)continue;
      if(this.camera){
        const a=figureEnvelope(q,this.camera,this.figure),b=this.otherFigure;
        b[0]=b[4]=a[0];b[1]=b[5]=a[1];b[2]=b[6]=a[2];b[3]=b[7]=a[3];b[8]=a[4]+.04;
        if(!this.clearPath(b,.04))return false;
      }
      for(const shoe of q.feet){
        const moving=shoe.stage==='swing'||shoe.stage==='toeoff';
        const curved=moving&&shoe.turning,reserved=curved?this.otherCurve:other;
        this.sweep(q,shoe,moving?shoe.toX:shoe.x,moving?shoe.toY:shoe.y,moving?shoe.toYaw:shoe.yaw,reserved,
          curved?shoe.fromX:shoe.x,curved?shoe.fromY:shoe.y,curved?shoe.fromYaw:shoe.yaw,curved?shoe.midX:undefined,curved?shoe.midY:undefined);
        if(!this.clearPath(reserved,.035))return false;
      }
    }
    return true;
  }
}

// Resolve all proposed body velocities together, before any root is advanced.
// Only cancel inward motion: stationary people are never pushed or teleported.
export function constrainCrowdMotion(people:Walker[],motion:Float64Array,n:number,dt:number,camera?:Camera){
  for(let iteration=0;iteration<20;iteration++){
    let changed=false;
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
      const p=people[i],q=people[j],dx=p.x-q.x,dy=p.y-q.y,d=Math.hypot(dx,dy);
      if(d>3.2||d<1e-9)continue;
      const nx=dx/d,ny=dy/d,clear=bodyClearance(p,q);
      const vp=motion[i*2]*nx+motion[i*2+1]*ny,vq=motion[j*2]*nx+motion[j*2+1]*ny;
      const allowed=-Math.max(0,d-clear-.002)/dt,deficit=allowed-(vp-vq);
      if(deficit<=1e-9)continue;
      const inwardP=Math.max(0,-vp),inwardQ=Math.max(0,vq),sum=inwardP+inwardQ;
      if(sum<1e-12)continue;
      const cp=Math.min(inwardP,deficit*inwardP/sum),cq=Math.min(inwardQ,deficit*inwardQ/sum);
      motion[i*2]+=nx*cp;motion[i*2+1]+=ny*cp;motion[j*2]-=nx*cq;motion[j*2+1]-=ny*cq;changed=true;
    }
    for(let k=0;k<n;k++)if(limitSupportMotion(people[k],dt,motion,k*2))changed=true;
    if(!changed)break;
  }
  if(camera){
    for(let iteration=0;iteration<24;iteration++){
      let changed=false;
      for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
        const p=people[i],q=people[j];if(Math.hypot(p.x-q.x,p.y-q.y)>3.2)continue;
        const before=figureGap(p,q,camera),margin=Math.min(.075,Math.max(0,before));
        const px=motion[i*2]*dt,py=motion[i*2+1]*dt,qx=motion[j*2]*dt,qy=motion[j*2+1]*dt;
        if(figureGap(p,q,camera,p.x+px,p.y+py,q.x+qx,q.y+qy)>=margin-1e-9)continue;
        // Project away only the inward component, retaining tangential motion
        // so walkers can pass around each other instead of freezing face to face.
        const e=.0001;
        const gx=(figureGap(p,q,camera,p.x+e,p.y)-figureGap(p,q,camera,p.x-e,p.y))/(2*e);
        const gy=(figureGap(p,q,camera,p.x,p.y+e)-figureGap(p,q,camera,p.x,p.y-e))/(2*e);
        const hx=(figureGap(p,q,camera,p.x,p.y,q.x+e,q.y)-figureGap(p,q,camera,p.x,p.y,q.x-e,q.y))/(2*e);
        const hy=(figureGap(p,q,camera,p.x,p.y,q.x,q.y+e)-figureGap(p,q,camera,p.x,p.y,q.x,q.y-e))/(2*e);
        const vp=gx*motion[i*2]+gy*motion[i*2+1],vq=hx*motion[j*2]+hy*motion[j*2+1];
        const inwardP=Math.max(0,-vp),inwardQ=Math.max(0,-vq),sum=inwardP+inwardQ;
        const deficit=-(before-margin)/dt-vp-vq;
        if(deficit<=1e-9||sum<1e-10)continue;
        const cp=Math.min(inwardP,deficit*inwardP/sum)/Math.max(.01,gx*gx+gy*gy);
        const cq=Math.min(inwardQ,deficit*inwardQ/sum)/Math.max(.01,hx*hx+hy*hy);
        motion[i*2]+=gx*cp;motion[i*2+1]+=gy*cp;
        motion[j*2]+=hx*cq;motion[j*2+1]+=hy*cq;changed=true;
      }
      for(let k=0;k<n;k++)if(limitSupportMotion(people[k],dt,motion,k*2))changed=true;
      if(!changed)break;
    }
  }
  // A swept-disc fallback catches multi-person constraints at dense junctions.
  let fraction=1;
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    const p=people[i],q=people[j],rx=p.x-q.x,ry=p.y-q.y;
    const dx=(motion[i*2]-motion[j*2])*dt,dy=(motion[i*2+1]-motion[j*2+1])*dt;
    const a=dx*dx+dy*dy,b=2*(rx*dx+ry*dy),r=bodyClearance(p,q),c=rx*rx+ry*ry-r*r;
    if(a<1e-14||b>=0)continue;
    const disc=b*b-4*a*c;if(disc<0)continue;
    const hit=(-b-Math.sqrt(disc))/(2*a);
    if(hit>=0&&hit<fraction)fraction=Math.max(0,hit-.0001);
  }
  if(fraction<1)for(let i=0;i<n*2;i++)motion[i]*=fraction;
}
