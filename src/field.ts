import { clamp, lerp } from './math.js';

// Optical-density bands are mixed continuously in height before filtering.
// The z buffers resolve local surface overlap; translucent layers compose by
// transmission, with the undiffused contact band always nearest the camera.
export class OpticalField {
  width=1;height=1;pixel=2.7;size=1;
  readonly centers=[0,0.065,0.19,0.46,0.95,1.65];
  readonly radii=[0,0.55,1.35,2.5,4.6,7.0];
  bands:Float32Array[]=[];depths:Float32Array[]=[];
  scratch=new Float32Array(1);filtered=new Float32Array(1);density=new Float32Array(1);
  resize(w:number,h:number,small=false,qualityScale=1){
    this.pixel=(small?2.5:3.1)*qualityScale;this.width=Math.ceil(w/this.pixel);this.height=Math.ceil(h/this.pixel);this.size=this.width*this.height;
    this.bands=this.centers.map(()=>new Float32Array(this.size));
    this.depths=this.centers.map(()=>new Float32Array(this.size));
    this.scratch=new Float32Array(this.size);this.filtered=new Float32Array(this.size);this.density=new Float32Array(this.size);
  }
  clear(){for(let i=0;i<this.bands.length;i++){this.bands[i].fill(0);this.depths[i].fill(Infinity);}this.density.fill(0);}
  deposit(index:number,z:number,value:number){
    let band=0;while(band<this.centers.length-2&&z>this.centers[band+1])band++;
    const mix=clamp((z-this.centers[band])/(this.centers[band+1]-this.centers[band]));
    this.write(band,index,z,value*(1-mix));this.write(band+1,index,z,value*mix);
  }
  private write(band:number,index:number,z:number,value:number){
    if(value<.001)return;
    const depth=this.depths[band][index];
    if(z<depth-.025){this.depths[band][index]=z;this.bands[band][index]=value;}
    else if(z<depth+.025){this.depths[band][index]=Math.min(z,depth);this.bands[band][index]=Math.max(value,this.bands[band][index]);}
  }
  compose(diffusion:number,showBands=false){
    for(let b=this.bands.length-1;b>=0;b--){
      const radius=this.radii[b]*diffusion*2.7/this.pixel;
      const source=this.bands[b];
      if(radius>.25){
        // Small kernels use a separable box. Broad body diffusion gets a second
        // pair for a Gaussian approximation, keeping contact detail inexpensive.
        const r=Math.max(1,Math.round(radius*(b<4?.9:.68)));
        this.box(source,this.scratch,r,true);this.box(this.scratch,this.filtered,r,false);
        if(b>=4){this.box(this.filtered,this.scratch,r,true);this.box(this.scratch,this.filtered,r,false);}
      }
      const filtered=radius>.25?this.filtered:source,d=this.density;
      const weight=showBands?1+(b%2)*.8:1;
      for(let i=0;i<this.size;i++){const v=clamp(filtered[i]*weight);d[i]=1-(1-d[i])*(1-v);}
    }
  }
  private box(src:Float32Array,dst:Float32Array,r:number,horizontal:boolean){
    const w=this.width,h=this.height,span=2*r+1;
    if(horizontal){
      for(let y=0;y<h;y++){
        const row=y*w;let sum=0;for(let x=-r;x<=r;x++)sum+=src[row+clamp(x,0,w-1)];
        for(let x=0;x<w;x++){dst[row+x]=sum/span;sum+=src[row+Math.min(w-1,x+r+1)]-src[row+Math.max(0,x-r)];}
      }
    } else {
      for(let x=0;x<w;x++){
        let sum=0;for(let y=-r;y<=r;y++)sum+=src[clamp(y,0,h-1)*w+x];
        for(let y=0;y<h;y++){dst[y*w+x]=sum/span;sum+=src[Math.min(h-1,y+r+1)*w+x]-src[Math.max(0,y-r)*w+x];}
      }
    }
  }
  sample(x:number,y:number){
    const fx=clamp(x/this.pixel,0,this.width-1.001),fy=clamp(y/this.pixel,0,this.height-1.001);
    const ix=Math.floor(fx),iy=Math.floor(fy),u=fx-ix,v=fy-iy,i=iy*this.width+ix,d=this.density;
    return lerp(lerp(d[i],d[i+1],u),lerp(d[i+this.width],d[i+this.width+1],u),v);
  }
}
