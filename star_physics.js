import * as THREE from 'three';

// =============================================================================
// STAR PHYSICS SYSTEM (Based on Project 7)
// =============================================================================

let canvas, gl;
let physicsStar, meshDrawer;
let rotX = 0.5, rotY = 0.5, transZ = -4;
let mvpMatrix, mvMatrix, normalMatrix;

// --- Main Entry Point ---
function main() {
    canvas = document.getElementById("canvas");
    gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) {
        alert("WebGL not supported!");
        return;
    }

    gl.clearColor(0.1, 0.1, 0.15, 1.0);
    gl.enable(gl.DEPTH_TEST);

    meshDrawer = new MeshDrawer();
    physicsStar = new PhysicsStar();
    
    const starObjData = document.getElementById('star.obj').text;
    physicsStar.setMesh(starObjData);
    
    onWindowResize();
    animate();
}

function animate() {
    if (physicsStar.isSimulationRunning()) {
        physicsStar.simTimeStep();
    }
    drawScene();
    requestAnimationFrame(animate);
}

function drawScene() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    const perspectiveMatrix = getProjectionMatrix(canvas, -transZ);
    mvMatrix = getModelViewMatrix(0, 0, transZ, rotX, rotY);
    mvpMatrix = matrixMult(perspectiveMatrix, mvMatrix);
    
    const mvInverse = matrixInverse(mvMatrix);
    const mvInverseTranspose = matrixTranspose(mvInverse);
    normalMatrix = [
        mvInverseTranspose[0], mvInverseTranspose[1], mvInverseTranspose[2],
        mvInverseTranspose[4], mvInverseTranspose[5], mvInverseTranspose[6],
        mvInverseTranspose[8], mvInverseTranspose[9], mvInverseTranspose[10]
    ];

    meshDrawer.draw(mvpMatrix, mvMatrix, normalMatrix);
}

function onWindowResize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    drawScene();
}

// =============================================================================
// Physics Star Class
// =============================================================================
class PhysicsStar {
    constructor() {
        this.gravity = new Vec3(0, -1.5, 0);
        this.particleMass = 0.1;
        this.stiffness = 40; // RIDOTTO: da 80 per deformazioni più morbide
        this.damping = 1.2; // AUMENTATO: da 0.9 per maggiore smorzamento
        this.restitution = 0.2; // RIDOTTO: da 0.4 per rimbalzi più delicati
        this.timer = undefined;
        this.isSettling = false;
    }

    setMesh(objData) {
        this.mesh = new ObjMesh();
        this.mesh.parse(objData);
        this.reset();
    }

    reset() {
        this.stopSimulation();
        this.isSettling = false;
        
        this.positions = this.mesh.vpos.map(p => new Vec3(p[0], p[1], p[2]));
        this.velocities = this.positions.map(() => new Vec3(0, 0, 0));
        
        this.initSprings();
        this.mesh.computeNormals(this.positions);
        this.updateMeshDrawer();
        drawScene();
    }

    initSprings() {
        this.springs = [];
        const edgeMap = new Map();
        for (const face of this.mesh.face) {
            for (let i = 0; i < face.length; i++) {
                const p0 = face[i];
                const p1 = face[(i + 1) % face.length];
                const key = p0 < p1 ? `${p0}-${p1}` : `${p1}-${p0}`;
                if (!edgeMap.has(key)) {
                    const restLength = this.positions[p0].sub(this.positions[p1]).len();
                    this.springs.push({ p0, p1, rest: restLength });
                    edgeMap.set(key, true);
                }
            }
        }
    }

    updateMeshDrawer() {
        const buffers = this.mesh.getVertexBuffers(this.positions, this.mesh.norm);
        meshDrawer.setMesh(buffers.positionBuffer, buffers.texCoordBuffer, buffers.normalBuffer);
    }
    
    simTimeStep() {
        const dt = 0.016;

        if (this.isSettling) {
            this.updateSettling(dt);
        } else {
            simTimeStep(dt, this.positions, this.velocities, this.springs, this.stiffness, this.damping, this.particleMass, this.gravity, this.restitution);
            this.mesh.computeNormals(this.positions); // Recalculate normals every frame
            this.checkIfShouldSettle();
        }
        
        this.updateMeshDrawer();
    }

    checkIfShouldSettle() {
        let kineticEnergy = 0;
        let lowestY = Infinity;
        for (let i = 0; i < this.positions.length; i++) {
            kineticEnergy += 0.5 * this.particleMass * this.velocities[i].len2();
            if (this.positions[i].y < lowestY) lowestY = this.positions[i].y;
        }
        
        const energyThreshold = 0.001;
        const groundThreshold = -1.0 + 0.05;

        if (kineticEnergy < energyThreshold && lowestY <= groundThreshold) {
            this.isSettling = true;
            const { center, rotation } = this.getCurrentTransform();
            const targetEuler = new THREE.Euler(0, rotation.y, 0);
            this.settleTargetRotation = new THREE.Quaternion().setFromEuler(targetEuler);
            this.settleStartRotation = new THREE.Quaternion().setFromEuler(rotation);
            this.settleCenter = center;
            this.initialPositionsModel = this.mesh.vpos.map(p => new Vec3(p[0], p[1], p[2]));
        }
    }
    
    updateSettling(dt) {
        const settleSpeed = 2.0;
        const lerpFactor = Math.min(settleSpeed * dt, 1.0);
        this.settleStartRotation.slerp(this.settleTargetRotation, lerpFactor);
        
        const q = this.settleStartRotation;
        for (let i = 0; i < this.positions.length; i++) {
            const initialPos = this.initialPositionsModel[i];
            const rotatedPos = initialPos.clone().applyQuaternion(q);
            this.positions[i] = this.settleCenter.add(rotatedPos);
        }

        const angle = this.settleStartRotation.angleTo(this.settleTargetRotation);
        if (angle < 0.01) {
            this.isSettling = false;
            this.stopSimulation();
        }
    }

    getCurrentTransform() {
        let center = new Vec3(0, 0, 0);
        this.positions.forEach(p => center.inc(p));
        center = center.div(this.positions.length);
        
        const p0 = this.positions[0].sub(center);
        const p1 = this.positions[this.positions.length-1].sub(center);
        const p2 = this.positions[Math.floor(this.positions.length/2)].sub(center);

        const zAxis = p1.sub(p0).cross(p2.sub(p0)).unit();
        const xAxis = p0.unit();
        const yAxis = zAxis.cross(xAxis).unit();

        const mat = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
        const rotation = new THREE.Euler().setFromRotationMatrix(mat, 'YXZ');
        
        return { center, rotation };
    }
    
    toggleSimulation(btn) {
        if (this.isSimulationRunning()) {
            this.stopSimulation();
            if(btn) btn.value = "Start Simulation";
        } else {
            this.startSimulation();
            if(btn) btn.value = "Stop Simulation";
        }
    }
    startSimulation() { if (!this.timer) this.timer = true; }
    stopSimulation() { this.timer = undefined; }
    isSimulationRunning() { return this.timer !== undefined; }
}


// =============================================================================
// GLOBAL SIMULATOR
// =============================================================================
function simTimeStep(dt, positions, velocities, springs, stiffness, damping, particleMass, gravity, restitution) {
    const forces = positions.map(() => new Vec3(0, 0, 0));
    for (let i = 0; i < forces.length; i++) forces[i].inc(gravity.mul(particleMass));
    for (const spring of springs) {
        const p1 = spring.p0, p2 = spring.p1;
        const dPos = positions[p2].sub(positions[p1]);
        const springForce = dPos.unit().mul(stiffness * (dPos.len() - spring.rest));
        forces[p1].inc(springForce);
        forces[p2].dec(springForce);
        const dVel = velocities[p2].sub(velocities[p1]);
        const dampingForce = dVel.mul(damping * 0.7); // Applica damping ridotto per movimento più fluido
        forces[p1].inc(dampingForce);
        forces[p2].dec(dampingForce);
    }
    for (let i = 0; i < positions.length; i++) {
        velocities[i].inc(forces[i].div(particleMass).mul(dt));
        positions[i].inc(velocities[i].mul(dt));
    }
    const bounds = 1.0;
    for (let i = 0; i < positions.length; i++) {
        if (positions[i].y < -bounds) { positions[i].y = -bounds; velocities[i].y *= -restitution; }
        if (positions[i].x < -bounds) { positions[i].x = -bounds; velocities[i].x *= -restitution; }
        if (positions[i].x > bounds) { positions[i].x = bounds; velocities[i].x *= -restitution; }
        if (positions[i].z < -bounds) { positions[i].z = -bounds; velocities[i].z *= -restitution; }
        if (positions[i].z > bounds) { positions[i].z = bounds; velocities[i].z *= -restitution; }
    }
}


// =============================================================================
// UTILITY CLASSES AND FUNCTIONS
// =============================================================================
class Vec3 {
    constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
    clone(){return new Vec3(this.x,this.y,this.z);}
    inc(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
    dec(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
    add(v){return new Vec3(this.x+v.x,this.y+v.y,this.z+v.z);}
    sub(v){return new Vec3(this.x-v.x,this.y-v.y,this.z-v.z);}
    mul(f){return new Vec3(this.x*f,this.y*f,this.z*f);}
    div(f){return new Vec3(this.x/f,this.y/f,this.z/f);}
    len2(){return this.x*this.x+this.y*this.y+this.z*this.z;}
    len(){return Math.sqrt(this.len2());}
    unit(){const l=this.len();return l>0?this.div(l):new Vec3(0,0,0);}
    cross(v){return new Vec3(this.y*v.z-this.z*v.y,this.z*v.x-this.x*v.z,this.x*v.y-this.y*v.x);}
    applyQuaternion(q){const x=this.x,y=this.y,z=this.z;const qx=q.x,qy=q.y,qz=q.z,qw=q.w;const ix=qw*x+qy*z-qz*y;const iy=qw*y+qz*x-qx*z;const iz=qw*z+qx*y-qy*x;const iw=-qx*x-qy*y-qz*z;this.x=ix*qw+iw*-qx+iy*-qz-iz*-qy;this.y=iy*qw+iw*-qy+iz*-qx-ix*-qz;this.z=iz*qw+iw*-qz+ix*-qy-iy*-qx;return this;}
}

class ObjMesh {
	constructor(){this.vpos=[];this.face=[];this.norm=[];this.nfac=[];this.tpos=[];this.tfac=[];}
	parse(objdata){
		const lines=objdata.split('\n');
		for(let line of lines){
			line=line.trim();const elem=line.split(/\s+/);const type=elem.shift();
			if(type==='v'){this.vpos.push(elem.map(parseFloat));}
            else if(type==='vn'){this.norm.push(elem.map(parseFloat));}
			else if(type==='f'){
				const f=[],nf=[],tf=[];
				for(const part of elem){
					const ids=part.split('/');
					if(ids[0])f.push(parseInt(ids[0])-1);
					if(ids[1])tf.push(parseInt(ids[1])-1);
					if(ids[2])nf.push(parseInt(ids[2])-1);
				}
				this.face.push(f);
				if(nf.length>0)this.nfac.push(nf);
                if(tf.length>0)this.tfac.push(tf);
			}
		}
	}
    computeNormals(positions){
        this.norm=Array(positions.length).fill(0).map(()=>new Vec3(0,0,0));
        for(let i=0;i<this.face.length;i++){
            const f=this.face[i];
            const v0=positions[f[0]],v1=positions[f[1]],v2=positions[f[2]];
            const n=v1.sub(v0).cross(v2.sub(v0)).unit();
            for(let j=0;j<f.length;j++)this.norm[f[j]].inc(n);
        }
        this.norm.forEach(n=>n.unit());
    }
	getVertexBuffers(positions,normals){
		const pBuf=[],nBuf=[],tBuf=[];
		for(let i=0;i<this.face.length;i++){
			const f=this.face[i];
			for(let j=0;j<f.length-2;j++){
				const i0=f[0],i1=f[j+1],i2=f[j+2];
                const p0=positions[i0],p1=positions[i1],p2=positions[i2];
                const n0=normals[i0],n1=normals[i1],n2=normals[i2];
				pBuf.push(p0.x,p0.y,p0.z,p1.x,p1.y,p1.z,p2.x,p2.y,p2.z);
                nBuf.push(n0.x,n0.y,n0.z,n1.x,n1.y,n1.z,n2.x,n2.y,n2.z);
			}
		}
		return {positionBuffer:pBuf,texCoordBuffer:tBuf,normalBuffer:nBuf};
	}
}

class MeshDrawer {
	constructor(){
		this.prog=InitShaderProgram(meshVS,meshFS);
		this.mvpLoc=gl.getUniformLocation(this.prog,"mvp");
        this.mvLoc=gl.getUniformLocation(this.prog,"mv");
		this.normLoc=gl.getUniformLocation(this.prog,"normalMatrix");
        this.lightDirLoc=gl.getUniformLocation(this.prog,"lightDir");
		this.posAttr=gl.getAttribLocation(this.prog,"vertPos");
		this.normAttr=gl.getAttribLocation(this.prog,"vertNormal");
		this.vbo=gl.createBuffer();
		this.nbo=gl.createBuffer();
	}
	setMesh(vertPos,texCoords,normals){
		this.numVertices=vertPos.length/3;
		gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo);
		gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertPos),gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER,this.nbo);
		gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(normals),gl.DYNAMIC_DRAW);
	}
	draw(mvp,mv,normalMatrix){
		gl.useProgram(this.prog);
		gl.uniformMatrix4fv(this.mvpLoc,false,mvp);
        gl.uniformMatrix4fv(this.mvLoc,false,mv);
		gl.uniformMatrix3fv(this.normLoc,false,normalMatrix);
        gl.uniform3f(this.lightDirLoc,0.577,0.577,0.577);
		gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo);
		gl.vertexAttribPointer(this.posAttr,3,gl.FLOAT,false,0,0);
		gl.enableVertexAttribArray(this.posAttr);
        gl.bindBuffer(gl.ARRAY_BUFFER,this.nbo);
		gl.vertexAttribPointer(this.normAttr,3,gl.FLOAT,false,0,0);
		gl.enableVertexAttribArray(this.normAttr);
		gl.drawArrays(gl.TRIANGLES,0,this.numVertices);
	}
}

const meshVS=`attribute vec3 vertPos;attribute vec3 vertNormal;uniform mat4 mvp;uniform mat3 normalMatrix;varying vec3 fragNormal;void main(){gl_Position=mvp*vec4(vertPos,1.0);fragNormal=normalize(normalMatrix*vertNormal);}`;
const meshFS=`precision mediump float;varying vec3 fragNormal;uniform vec3 lightDir;void main(){float diffuse=max(dot(fragNormal,normalize(lightDir)),0.0);vec3 color=vec3(0.9,0.7,0.2);vec3 finalColor=color*(diffuse*0.8+0.2);gl_FragColor=vec4(finalColor,1.0);}`;

function InitShaderProgram(vs,fs){const p=gl.createProgram();gl.attachShader(p,compileShader(gl.VERTEX_SHADER,vs));gl.attachShader(p,compileShader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);return p;}
function compileShader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);return s;}
function getModelViewMatrix(tx,ty,tz,rx,ry){const cx=Math.cos(rx),sx=Math.sin(rx);const cy=Math.cos(ry),sy=Math.sin(ry);const rX=[1,0,0,0,0,cx,sx,0,0,-sx,cx,0,0,0,0,1];const rY=[cy,0,-sy,0,0,1,0,0,sy,0,cy,0,0,0,0,1];const tM=[1,0,0,0,0,1,0,0,0,0,1,0,tx,ty,tz,1];return matrixMult(matrixMult(tM,rY),rX);}
function getProjectionMatrix(c,z){const r=c.width/c.height;const n=Math.max(z-10,0.1);const f=z+10;const s=1/Math.tan(60*Math.PI/360);return[s/r,0,0,0,0,s,0,0,0,0,-(f+n)/(f-n),-1,0,0,-2*f*n/(f-n),0];}
function matrixMult(a,b){let c=Array(16).fill(0);for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)c[i*4+j]+=a[k*4+j]*b[i*4+k];return c;}
function matrixInverse(m){let r=Array(16),det=0;r[0]=m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];r[4]=-m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];r[8]=m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];r[12]=-m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];r[1]=-m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];r[5]=m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];r[9]=-m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];r[13]=m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];r[2]=m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];r[6]=-m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];r[10]=m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];r[14]=-m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];r[3]=-m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];r[7]=m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];r[11]=-m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];r[15]=m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];det=m[0]*r[0]+m[1]*r[4]+m[2]*r[8]+m[3]*r[12];if(det==0)return m;det=1/det;for(let i=0;i<16;i++)r[i]*=det;return r;}
function matrixTranspose(m){return[m[0],m[4],m[8],m[12],m[1],m[5],m[9],m[13],m[2],m[6],m[10],m[14],m[3],m[7],m[11],m[15]];} 