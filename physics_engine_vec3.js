export class Vec3 {
    constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
    clone(){return new Vec3(this.x,this.y,this.z);}
    copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
    set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
    add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
    sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
    multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
    dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
    cross(v){return this.clone().crossVectors(this,v);}
    crossVectors(a,b){this.x=a.y*b.z-a.z*b.y;this.y=a.z*b.x-a.x*b.z;this.z=a.x*b.y-a.y*b.x;return this;}
    lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}
    length(){return Math.sqrt(this.lengthSq());}
    normalize(){const l=this.length();if(l>0)this.multiplyScalar(1/l);return this;}
    applyQuaternion(q){const x=this.x,y=this.y,z=this.z;const qx=q.x,qy=q.y,qz=q.z,qw=q.w;const ix=qw*x+qy*z-qz*y,iy=qw*y+qz*x-qx*z,iz=qw*z+qx*y-qy*x,iw=-qx*x-qy*y-qz*z;this.x=ix*qw+iw*-qx+iy*-qz-iz*-qy;this.y=iy*qw+iw*-qy+iz*-qx-ix*-qz;this.z=iz*qw+iw*-qz+ix*-qy-iy*-qx;return this;}
} 