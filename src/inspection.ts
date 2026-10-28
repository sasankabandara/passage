import {Camera} from './camera.js';
import {type Walker,shoePoint} from './gait.js';
import {BODY_CAPSULES,SHOE_OUTLINE} from './geometry.js';
import {Rig} from './rig.js';
import {segmentDistanceSquared} from './collision.js';

function inside(x:number,y:number,poly:Float64Array){
  let yes=false;for(let i=0,j=poly.length-2;i<poly.length;j=i,i+=2){
    const xi=poly[i],yi=poly[i+1],xj=poly[j],yj=poly[j+1];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)yes=!yes;
  }return yes;
}
function polyGap(a:Float64Array,b:Float64Array){
  if(inside(a[0],a[1],b)||inside(b[0],b[1],a))return -1;
  let d=Infinity;for(let i=0;i<a.length;i+=2)for(let j=0;j<b.length;j+=2){
    const ni=(i+2)%a.length,nj=(j+2)%b.length;
    d=Math.min(d,segmentDistanceSquared(a[i],a[i+1],a[ni],a[ni+1],b[j],b[j+1],b[nj],b[nj+1]));
  }return Math.sqrt(d)-8;
}
function polyPartGap(poly:Float64Array,parts:Float64Array,at:number){
  if(inside(parts[at],parts[at+1],poly)||inside(parts[at+2],parts[at+3],poly))return -parts[at+4];
  let d=Infinity;for(let i=0;i<poly.length;i+=2){
    const ni=(i+2)%poly.length;
    d=Math.min(d,segmentDistanceSquared(poly[i],poly[i+1],poly[ni],poly[ni+1],parts[at],parts[at+1],parts[at+2],parts[at+3]));
  }return Math.sqrt(d)-parts[at+4]-4;
}
function visible(parts:Float64Array,at:number,c:Camera){
  const r=parts[at+4];return Math.max(parts[at],parts[at+2])+r>=0&&Math.min(parts[at],parts[at+2])-r<=c.width&&Math.max(parts[at+1],parts[at+3])+r>=0&&Math.min(parts[at+1],parts[at+3])-r<=c.height;
}
export class SceneInspector {
  private rigs=Array.from({length:10},()=>new Rig());
  private parts=Array.from({length:10},()=>new Float64Array(BODY_CAPSULES.length*5));
  private shoes=Array.from({length:10},()=>[new Float64Array(SHOE_OUTLINE.length*2),new Float64Array(SHOE_OUTLINE.length*2)]);
  private point=new Float64Array(3);private projected=new Float64Array(3);
  minimum=Infinity;shoeMinimum=Infinity;overlaps=0;pair='';
  scan(people:Walker[],camera:Camera,alpha=1){
    this.minimum=Infinity;this.shoeMinimum=Infinity;this.overlaps=0;this.pair='';
    while(this.rigs.length<people.length){
      this.rigs.push(new Rig());this.parts.push(new Float64Array(BODY_CAPSULES.length*5));
      this.shoes.push([new Float64Array(SHOE_OUTLINE.length*2),new Float64Array(SHOE_OUTLINE.length*2)]);
    }
    for(let i=0;i<people.length;i++){
      const p=people[i],rig=this.rigs[i],j=rig.update(p,alpha),q=rig.projected,parts=this.parts[i];
      for(let k=0;k<16;k++)camera.project(j[k*3],j[k*3+1],j[k*3+2],q,k*3);
      BODY_CAPSULES.forEach(([a,b,r],k)=>{
        const at=k*5,z=Math.min(j[a*3+2],j[b*3+2]);
        parts[at]=q[a*3];parts[at+1]=q[a*3+1];parts[at+2]=q[b*3];parts[at+3]=q[b*3+1];
        parts[at+4]=r*p.scale*(k<10?p.build:1)*camera.scale*camera.distance/(camera.distance+z)+3.5+8*Math.min(1,z/1.2);
      });
      for(let s=0;s<2;s++)for(let k=0;k<SHOE_OUTLINE.length;k++){
        const [u,v]=SHOE_OUTLINE[k],f=p.feet[s];
        shoePoint(f,p.shoeLength,u*p.shoeWidth*(f.side<0?-1:1),v*p.shoeLength,alpha,this.point);
        camera.project(this.point[0],this.point[1],this.point[2],this.projected);
        this.shoes[i][s][k*2]=this.projected[0];this.shoes[i][s][k*2+1]=this.projected[1];
      }
    }
    const record=(gap:number,i:number,j:number)=>{if(gap<this.minimum){this.minimum=gap;this.pair=`${people[i].id}/${people[j].id}`;}if(gap<0)this.overlaps++;};
    for(let i=0;i<people.length;i++)for(let j=i+1;j<people.length;j++){
      if(Math.hypot(people[i].x-people[j].x,people[i].y-people[j].y)>3.8)continue;
      const a=this.parts[i],b=this.parts[j];
      for(let u=0;u<a.length;u+=5){
        if(!visible(a,u,camera))continue;
        for(let v=0;v<b.length;v+=5){if(!visible(b,v,camera))continue;
          record(Math.sqrt(segmentDistanceSquared(a[u],a[u+1],a[u+2],a[u+3],b[v],b[v+1],b[v+2],b[v+3]))-a[u+4]-b[v+4],i,j);
        }
        for(const shoe of this.shoes[j])if(shoe.some((x,k)=>k%2===0&&x>=-20&&x<=camera.width+20))record(polyPartGap(shoe,a,u),i,j);
      }
      for(let v=0;v<b.length;v+=5)if(visible(b,v,camera))for(const shoe of this.shoes[i])record(polyPartGap(shoe,b,v),i,j);
      for(const x of this.shoes[i])for(const y of this.shoes[j]){
        const midX=(x[0]+y[0])*.5,midY=(x[1]+y[1])*.5;
        if(midX< -80||midX>camera.width+80||midY< -80||midY>camera.height+80)continue;
        const gap=polyGap(x,y);this.shoeMinimum=Math.min(this.shoeMinimum,gap);record(gap,i,j);
      }
    }
    return this;
  }
}
