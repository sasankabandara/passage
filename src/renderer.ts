import { Camera } from './camera.js';
import { OpticalField } from './field.js';
import { type Walker, shoePoint } from './gait.js';
import { clamp, lerp } from './math.js';
import { BONES, Rig } from './rig.js';
import { SHOE_OUTLINE as OUTLINE } from './geometry.js';

export interface RenderOptions {diffusion:number;frosted:boolean;skeleton:boolean;anchors:boolean;bands:boolean;projection:boolean;}
const LIMBS=[[4,5,.084],[5,6,.057],[7,8,.084],[8,9,.057],[10,11,.055],[11,12,.043],[13,14,.055],[14,15,.043]];
export class Renderer {
  context:CanvasRenderingContext2D;
  field=new OpticalField();rigs:Rig[]=Array.from({length:10},()=>new Rig());
  background=document.createElement('canvas');bgctx=this.background.getContext('2d')!;
  atlas=document.createElement('canvas');atlasCtx=this.atlas.getContext('2d',{willReadFrequently:true})!;
  glyphs=['.',':',';','o','O','0','8','@'];coverage:number[]=[];
  cellX=4.6;cellY=5.8;cols=1;rows=1;history=new Int8Array(1);previousDensity=new Float32Array(1);
  projected=new Float64Array(3);shoeWorld=new Float64Array(17*5);shoeScreen=new Float64Array(17*5);
  point=new Float64Array(3);dpr=1;width=1;height=1;frameCost=0;
  private performanceMode=false;
  private tileCols=1;private tileRows=1;
  private occupiedTiles=new Uint8Array(1);private activeTiles=new Uint8Array(1);
  constructor(public canvas:HTMLCanvasElement,public camera:Camera){
    this.context=canvas.getContext('2d',{alpha:false})!;
    this.createAtlas();
  }
  resize(w:number,h:number){
    this.performanceMode=false;
    this.width=w;this.height=h;this.dpr=Math.min(window.devicePixelRatio||1,2);
    this.canvas.width=Math.round(w*this.dpr);this.canvas.height=Math.round(h*this.dpr);
    this.context.setTransform(this.dpr,0,0,this.dpr,0,0);this.context.imageSmoothingEnabled=false;
    this.camera.resize(w,h);this.field.resize(w,h,w<600,this.performanceMode?1.25:1);
    this.cellX=w<600?3.8:4.6;this.cellY=w<600?5.0:5.8;
    this.cols=Math.ceil(w/this.cellX);this.rows=Math.ceil(h/this.cellY);
    this.tileCols=Math.ceil(this.cols/4);this.tileRows=Math.ceil(this.rows/3);
    this.occupiedTiles=new Uint8Array(this.tileCols*this.tileRows);this.activeTiles=new Uint8Array(this.occupiedTiles.length);
    this.history=new Int8Array(this.cols*this.rows);this.history.fill(-1);this.previousDensity=new Float32Array(this.history.length);
    this.createBackground();this.createAtlas();
  }
  setPerformanceMode(){
    if(this.performanceMode)return;
    this.performanceMode=true;this.field.resize(this.width,this.height,this.width<600,1.25);
  }
  private createAtlas(){
    const dpr=this.dpr,slot=14;
    this.atlas.width=slot*this.glyphs.length*dpr;this.atlas.height=slot*2*dpr;
    const a=this.atlasCtx;a.setTransform(dpr,0,0,dpr,0,0);a.clearRect(0,0,this.atlas.width,this.atlas.height);
    a.font=`${this.cellY+2.2}px 'Courier New',monospace`;a.textAlign='center';a.textBaseline='middle';
    for(let row=0;row<2;row++){
      a.fillStyle=row===0?'#162c38':'#5a7688';
      for(let i=0;i<this.glyphs.length;i++)a.fillText(this.glyphs[i],i*slot+slot/2,row*slot+slot/2);
    }
    this.coverage.length=0;
    for(let i=0;i<this.glyphs.length;i++){
      const pixels=a.getImageData(i*slot*dpr,0,slot*dpr,slot*dpr).data;let sum=0;
      for(let p=3;p<pixels.length;p+=4)sum+=pixels[p]/255;
      this.coverage.push(sum/(dpr*dpr*this.cellX*this.cellY));
    }
    // Measured ink coverage gives stable tone thresholds even across DPI/font engines.
    const max=Math.max(...this.coverage);for(let i=0;i<this.coverage.length;i++)this.coverage[i]/=max;
  }
  private createBackground(){
    const w=this.width,h=this.height,d=this.dpr;
    this.background.width=w*d;this.background.height=h*d;
    const c=this.bgctx;c.setTransform(d,0,0,d,0,0);c.fillStyle='#e8eff2';c.fillRect(0,0,w,h);
    const shade=c.createRadialGradient(w*.43,h*.4,0,w*.5,h*.5,Math.max(w,h)*.75);
    shade.addColorStop(0,'#f4f7f64d');shade.addColorStop(1,'#bbd1df30');c.fillStyle=shade;c.fillRect(0,0,w,h);
    // Static illuminated joints: a quiet halo with a narrow continuous core.
    const vx=w*.54,hy=[h*.26,h*.74];
    const seam=(pos:number,vertical:boolean)=>{
      const radius=vertical?37:28;
      const g=vertical?c.createLinearGradient(pos-radius,0,pos+radius,0):c.createLinearGradient(0,pos-radius,0,pos+radius);
      g.addColorStop(0,'#e8b66b00');g.addColorStop(.3,'#e8b66b0a');g.addColorStop(.46,'#e99d4125');g.addColorStop(.5,'#eaa45644');g.addColorStop(.54,'#e99d4125');g.addColorStop(.7,'#e8b66b0a');g.addColorStop(1,'#e8b66b00');
      c.fillStyle=g;if(vertical)c.fillRect(pos-radius,0,radius*2,h);else c.fillRect(0,pos-radius,w,radius*2);
      c.strokeStyle=vertical?'#d85e3eb5':'#d99b54a6';c.lineWidth=vertical?1.3:.8;c.beginPath();
      if(vertical){c.moveTo(pos,0);c.lineTo(pos,h);}else{c.moveTo(0,pos);c.lineTo(w,pos);}c.stroke();
      c.strokeStyle='#fff5d9ba';c.lineWidth=.55;c.beginPath();if(vertical){c.moveTo(pos+1.1,0);c.lineTo(pos+1.1,h);}else{c.moveTo(0,pos+.8);c.lineTo(w,pos+.8);}c.stroke();
    };
    seam(vx,true);for(const y of hy)seam(y,false);
    c.fillStyle='#607f9733';c.beginPath();
    const spacing=this.width<600?5.6:6.4;
    for(let y=2.7;y<h;y+=spacing)for(let x=2.7;x<w;x+=spacing){c.moveTo(x+.43,y);c.arc(x,y,.43,0,Math.PI*2);}c.fill();
    c.strokeStyle='#75919e19';c.lineWidth=1;c.strokeRect(12.5,12.5,w-25,h-25);
  }
  render(people:Walker[],alpha:number,options:RenderOptions){
    const start=performance.now(),f=this.field;f.clear();
    while(this.rigs.length<people.length)this.rigs.push(new Rig());
    for(let i=0;i<people.length;i++){
      const p=people[i],rig=this.rigs[i];rig.update(p,alpha);
      const j=rig.joints;
      for(let k=0;k<16;k++)this.camera.project(j[k*3],j[k*3+1],j[k*3+2],rig.projected,k*3);
      for(const [a,b,r]of LIMBS)this.capsule(rig,a,b,r*p.scale*p.build,options.frosted?.47:.74);
      this.capsule(rig,0,1,.155*p.scale*p.build,options.frosted?.49:.82);
      this.capsule(rig,1,2,.13*p.scale*p.build,options.frosted?.44:.8);
      this.capsule(rig,2,3,.09*p.scale,options.frosted?.38:.75);
      this.capsule(rig,3,3,.107*p.scale,options.frosted?.43:.8);
      this.capsule(rig,12,12,.045*p.scale,options.frosted?.44:.7);this.capsule(rig,15,15,.045*p.scale,options.frosted?.44:.7);
      for(let foot=0;foot<2;foot++)this.shoe(p,foot,alpha,options.frosted);
    }
    f.compose(options.frosted?options.diffusion:0,options.bands);
    const c=this.context;c.globalAlpha=1;c.drawImage(this.background,0,0,this.background.width,this.background.height,0,0,this.width,this.height);
    this.ascii();
    if(options.skeleton||options.anchors||options.projection)this.debug(people,options);
    this.frameCost=lerp(this.frameCost,performance.now()-start,.06);
  }
  private capsule(rig:Rig,a:number,b:number,radius:number,opacity:number){
    const j=rig.joints,q=rig.projected,f=this.field,px=f.pixel;
    const ax=q[a*3]/px,ay=q[a*3+1]/px,bx=q[b*3]/px,by=q[b*3+1]/px;
    const az=j[a*3+2],bz=j[b*3+2];
    const r0=radius*this.camera.scale*this.camera.distance/(this.camera.distance+az)/px;
    const r1=radius*this.camera.scale*this.camera.distance/(this.camera.distance+bz)/px;
    const r=Math.max(r0,r1),x0=Math.max(0,Math.floor(Math.min(ax,bx)-r-1)),x1=Math.min(f.width-1,Math.ceil(Math.max(ax,bx)+r+1));
    const y0=Math.max(0,Math.floor(Math.min(ay,by)-r-1)),y1=Math.min(f.height-1,Math.ceil(Math.max(ay,by)+r+1));
    const dx=bx-ax,dy=by-ay,dist=dx*dx+dy*dy;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const t=dist>0?clamp(((x+.5-ax)*dx+(y+.5-ay)*dy)/dist):0;
      const rr=lerp(r0,r1,t),dd=Math.hypot(x+.5-ax-dx*t,y+.5-ay-dy*t),coverage=clamp(rr-dd+.65);
      if(coverage<=0)continue;
      const z=Math.max(.07,lerp(az,bz,t)-radius*Math.sqrt(Math.max(0,1-(dd/rr)**2)));
      f.deposit(y*f.width+x,z,opacity*Math.exp(-z*.69)*coverage);
    }
  }
  private shoe(p:Walker,footIndex:number,alpha:number,frosted:boolean){
    const foot=p.feet[footIndex],len=p.shoeLength,width=p.shoeWidth,w=this.shoeWorld,s=this.shoeScreen;
    for(let i=0;i<=OUTLINE.length;i++){
      const u=i===0?0:OUTLINE[i-1][0]*width*(foot.side===-1?-1:1),v=i===0?.03*len:OUTLINE[i-1][1]*len;
      shoePoint(foot,len,u,v,alpha,this.point);const at=i*5;
      w[at]=this.point[0];w[at+1]=this.point[1];w[at+2]=this.point[2];w[at+3]=u;w[at+4]=v;
      this.camera.project(w[at],w[at+1],w[at+2],this.projected);
      s[at]=this.projected[0]/this.field.pixel;s[at+1]=this.projected[1]/this.field.pixel;s[at+2]=w[at+2];s[at+3]=u;s[at+4]=v;
    }
    for(let i=1;i<=OUTLINE.length;i++)this.triangle(0,i,i===OUTLINE.length?1:i+1,p,lerp(foot.pload,foot.load,alpha),frosted);
  }
  private triangle(ai:number,bi:number,ci:number,p:Walker,load:number,frosted:boolean){
    const v=this.shoeScreen,a=ai*5,b=bi*5,c=ci*5,f=this.field;
    const ax=v[a],ay=v[a+1],bx=v[b],by=v[b+1],cx=v[c],cy=v[c+1];
    const den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<1e-6)return;
    const x0=Math.max(0,Math.floor(Math.min(ax,bx,cx)-1)),x1=Math.min(f.width-1,Math.ceil(Math.max(ax,bx,cx)+1));
    const y0=Math.max(0,Math.floor(Math.min(ay,by,cy)-1)),y1=Math.min(f.height-1,Math.ceil(Math.max(ay,by,cy)+1));
    const edgeScale=Math.abs(den)/Math.max(1e-6,Math.hypot(bx-cx,by-cy));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const wa=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/den;
      const wb=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/den,wc=1-wa-wb;
      // Only the outer edge gets coverage; internal fan edges remain seamless.
      // This lets a sole cross optical pixels gradually instead of blinking a
      // whole pixel on/off at each edge, while the character grid stays fixed.
      const coverage=clamp(wa*edgeScale+.5);
      if(wb<0||wc<0||coverage<=0)continue;
      const z=Math.max(0,wa*v[a+2]+wb*v[b+2]+wc*v[c+2]),u=wa*v[a+3]+wb*v[b+3]+wc*v[c+3],t=wa*v[a+4]+wb*v[b+4]+wc*v[c+4];
      const local=t/p.shoeLength,across=u/p.shoeWidth;
      // Restrained chevron grooves and heel blocks are fixed in shoe space.
      const chevron=Math.abs(Math.sin(t*168+Math.abs(u)*108));
      const groove=chevron<.18&&Math.abs(across)<.37;
      const arch=local>-.12&&local<.08&&Math.abs(across)<.25;
      const heelSplit=local<-.19&&Math.abs(across)<.045;
      const tread=groove?.6:arch?.68:heelSplit?.55:1;
      const darkness=frosted?(.13+.84*Math.exp(-z*23))*(.85+load*.15):.96;
      f.deposit(y*f.width+x,z,darkness*tread*coverage);
    }
  }
  private ascii(){
    const c=this.context,f=this.field,cw=this.cellX,ch=this.cellY,slot=14,d=this.dpr;
    // Most of the floor is empty. Mark small occupied tiles once, then expand
    // by a tile so every bilinear edge sample remains covered. This avoids
    // sampling the blank floor four times per character without adding trails.
    const occupied=this.occupiedTiles,active=this.activeTiles,tc=this.tileCols,tr=this.tileRows;
    occupied.fill(0);active.fill(0);
    for(let y=0;y<f.height;y++){
      const ty=Math.min(tr-1,Math.floor(y*f.pixel/(ch*3))),row=y*f.width;
      for(let x=0;x<f.width;x++)if(f.density[row+x]>.010){
        const tx=Math.min(tc-1,Math.floor(x*f.pixel/(cw*4)));occupied[ty*tc+tx]=1;
      }
    }
    for(let y=0;y<tr;y++)for(let x=0;x<tc;x++)if(occupied[y*tc+x]){
      for(let yy=Math.max(0,y-1);yy<=Math.min(tr-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(tc-1,x+1);xx++)active[yy*tc+xx]=1;
    }
    for(let row=0;row<this.rows;row++)for(let col=0;col<this.cols;col++){
      const x=col*cw+cw*.5,y=row*ch+ch*.5,index=row*this.cols+col;
      if(!active[Math.floor(row/3)*tc+(col>>2)]){this.history[index]=-1;this.previousDensity[index]=0;continue;}
      // Four bilinear sub-cell samples smooth the silhouette, keeping glyphs crisp.
      const density=(f.sample(x-cw*.22,y-ch*.22)+f.sample(x+cw*.22,y-ch*.22)+f.sample(x-cw*.22,y+ch*.22)+f.sample(x+cw*.22,y+ch*.22))*.25;
      if(density<.024){this.history[index]=-1;this.previousDensity[index]=density;continue;}
      const target=clamp(Math.pow(density,.64));let level=0;
      let distance=Infinity;
      for(let i=0;i<this.coverage.length;i++){const dd=Math.abs(this.coverage[i]-target);if(dd<distance){distance=dd;level=i;}}
      const previous=this.history[index];
      if(previous>=0&&Math.abs(this.coverage[previous]-target)<distance+.035)level=previous;
      this.history[index]=level;this.previousDensity[index]=density;
      const palette=density>.42?0:1;
      c.globalAlpha=clamp(.16+density*1.12,.19,1);
      c.drawImage(this.atlas,level*slot*d,palette*slot*d,slot*d,slot*d,x-slot/2,y-slot/2,slot,slot);
    }
    c.globalAlpha=1;
  }
  private debug(people:Walker[],options:RenderOptions){
    const c=this.context;c.save();c.lineWidth=.8;
    for(let i=0;i<people.length;i++){
      const rig=this.rigs[i],j=rig.projected,p=people[i];
      if(options.skeleton){
        c.strokeStyle='#486b8ba6';c.fillStyle='#375b79';
        for(const [a,b]of BONES){c.beginPath();c.moveTo(j[a*3],j[a*3+1]);c.lineTo(j[b*3],j[b*3+1]);c.stroke();}
        for(let k=0;k<16;k++){c.beginPath();c.arc(j[k*3],j[k*3+1],1.6,0,Math.PI*2);c.fill();}
      }
      if(options.anchors)for(const foot of p.feet){
        if(!foot.planted)continue;
        const pivot=foot.pitch>0?-p.shoeLength*.43:foot.pitch<0?p.shoeLength*.57:0;
        const x=foot.ax+Math.cos(foot.yaw)*pivot,y=foot.ay+Math.sin(foot.yaw)*pivot;
        this.camera.project(x,y,0,this.point);const sx=this.point[0],sy=this.point[1];
        c.strokeStyle='#ce6037';c.beginPath();c.arc(sx,sy,5,0,Math.PI*2);c.moveTo(sx-8,sy);c.lineTo(sx+8,sy);c.moveTo(sx,sy-8);c.lineTo(sx,sy+8);c.stroke();
        c.fillStyle='#98634f';c.font='8px monospace';c.fillText(foot.stage.toUpperCase(),sx+10,sy+3);
      }
      if(options.projection){
        const world=rig.joints;c.strokeStyle='#a87c5866';c.setLineDash([2,4]);
        for(let k=0;k<16;k+=3){this.camera.project(world[k*3],world[k*3+1],0,this.point);c.beginPath();c.moveTo(j[k*3],j[k*3+1]);c.lineTo(this.point[0],this.point[1]);c.stroke();}c.setLineDash([]);
      }
    }
    c.restore();
  }
}
