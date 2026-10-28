export class Camera {
  width=1;height=1;scale=200;distance=8;eyeX=-0.2;eyeY=0.18;
  resize(w:number,h:number){this.width=w;this.height=h;this.scale=Math.min(Math.sqrt(w*h/85),w/6);}
  project(x:number,y:number,z:number,out:Float64Array,offset=0){
    const k=this.distance/(this.distance+z);
    out[offset]=this.width*0.52+(this.eyeX+(x-this.eyeX)*k)*this.scale;
    out[offset+1]=this.height*0.51+(this.eyeY+(y-this.eyeY)*k)*this.scale;
    out[offset+2]=this.distance+z;
  }
  get worldWidth(){return this.width/this.scale;}
  get worldHeight(){return this.height/this.scale;}
}
