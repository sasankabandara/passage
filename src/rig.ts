import { angleLerp, lerp } from './math.js';
import { shoePoint, type Walker } from './gait.js';

export const J={pelvis:0,chest:1,neck:2,head:3,lhip:4,lknee:5,lankle:6,rhip:7,rknee:8,rankle:9,lshoulder:10,lelbow:11,lhand:12,rshoulder:13,relbow:14,rhand:15};
export const BONES = [[0,1],[1,2],[2,3],[4,5],[5,6],[7,8],[8,9],[10,11],[11,12],[13,14],[14,15],[10,13],[4,7]];
export class Rig {
  joints=new Float64Array(16*3);
  projected=new Float64Array(16*3);
  private ankle=new Float64Array(3);
  private set(i:number,x:number,y:number,z:number){const o=i*3;this.joints[o]=x;this.joints[o+1]=y;this.joints[o+2]=z;}
  update(p:Walker,alpha=1){
    const yaw=angleLerp(p.pyaw,p.yaw,alpha),fx=Math.cos(yaw),fy=Math.sin(yaw),rx=-fy,ry=fx;
    const sway=lerp(p.psway,p.sway,alpha);
    const x=lerp(p.px,p.x,alpha)+rx*sway,y=lerp(p.py,p.y,alpha)+ry*sway,s=p.scale;
    const feet=p.feet;
    const twist=Math.sin(lerp(p.pphase,p.phase,alpha)*Math.PI*2)*0.027*s;
    let hipZ=lerp(p.phipZ,p.hipZ,alpha)-lerp(p.psettling,p.settling,alpha);
    for(const f of feet){
      shoePoint(f,p.shoeLength,0,-p.shoeLength*0.14,alpha,this.ankle);
      const dx=x+rx*f.side*0.09*s+fx*twist*f.side-this.ankle[0],dy=y+ry*f.side*0.09*s+fy*twist*f.side-this.ankle[1];
      hipZ=Math.min(hipZ,this.ankle[2]+0.065*s+Math.sqrt(Math.max(.02,(p.leg*2-.002*s)**2-dx*dx-dy*dy)));
    }
    this.set(0,x,y,hipZ);
    this.set(1,x+fx*0.035*s,y+fy*0.035*s,hipZ+0.39*s);
    this.set(2,x+fx*0.025*s,y+fy*0.025*s,hipZ+0.56*s);
    this.set(3,x+fx*0.025*s,y+fy*0.025*s,hipZ+0.73*s);
    for(let i=0;i<2;i++){
      const f=feet[i],side=f.side,h=4+i*3,k=h+1,a=h+2;
      this.set(h,x+rx*side*0.09*s+fx*twist*side,y+ry*side*0.09*s+fy*twist*side,hipZ);
      shoePoint(f,p.shoeLength,0,-p.shoeLength*0.14,alpha,this.ankle);
      this.set(a,this.ankle[0],this.ankle[1],this.ankle[2]+0.065*s);
      this.solveKnee(h,a,k,p.leg,p.leg,fx,fy);
      const sh=10+i*3,el=sh+1,hand=sh+2;
      const footProgress=(lerp(f.px,f.x,alpha)-x)*fx+(lerp(f.py,f.y,alpha)-y)*fy;
      const swing=Math.max(-0.27,Math.min(0.27,-footProgress*0.8))*p.armScale;
      const shoulderZ=hipZ+0.47*s;
      this.set(sh,x+rx*side*0.19*s-fx*twist*side,y+ry*side*0.19*s-fy*twist*side,shoulderZ);
      const armAngle=swing*1.6;
      const ex=this.joints[sh*3]+fx*Math.sin(armAngle)*0.28*s+rx*side*0.025*s;
      const ey=this.joints[sh*3+1]+fy*Math.sin(armAngle)*0.28*s+ry*side*0.025*s;
      const ez=shoulderZ-Math.cos(armAngle)*0.28*s;
      this.set(el,ex,ey,ez);
      this.set(hand,ex+fx*Math.sin(armAngle+0.28)*0.25*s,ey+fy*Math.sin(armAngle+0.28)*0.25*s,ez-Math.cos(armAngle+0.28)*0.25*s);
    }
    return this.joints;
  }
  private solveKnee(hi:number,ai:number,ki:number,l1:number,l2:number,fx:number,fy:number){
    const j=this.joints,h=hi*3,a=ai*3;
    const dx=j[a]-j[h],dy=j[a+1]-j[h+1],dz=j[a+2]-j[h+2];
    const d=Math.max(1e-6,Math.hypot(dx,dy,dz)),reach=Math.min(d,l1+l2-1e-7);
    const ux=dx/d,uy=dy/d,uz=dz/d;
    const dot=fx*ux+fy*uy;
    let bx=fx-dot*ux,by=fy-dot*uy,bz=-dot*uz;
    const b=Math.hypot(bx,by,bz)||1;bx/=b;by/=b;bz/=b;
    const along=(l1*l1-l2*l2+reach*reach)/(2*reach),bend=Math.sqrt(Math.max(0,l1*l1-along*along));
    this.set(ki,j[h]+ux*along+bx*bend,j[h+1]+uy*along+by*bend,j[h+2]+uz*along+bz*bend);
  }
}
