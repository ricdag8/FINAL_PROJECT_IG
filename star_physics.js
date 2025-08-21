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



/* 
Ecco una documentazione chiara e dettagliata di **tutte** le funzioni (e dei metodi delle classi) presenti nel codice. Ho mantenuto i nomi originali e, dove utile, ho indicato parametri, valore di ritorno ed effetti collaterali.

---

# Flusso principale e gestione del rendering

### `main()`

**Cosa fa:**
Punto d’ingresso dell’app. Inizializza il canvas e il contesto WebGL, imposta lo stato di base (clear color e depth test), crea i gestori di rendering e fisica, carica la mesh `.obj` dallo `<script id="star.obj">`, esegue un reset della simulazione e avvia loop e resize.

**Passi chiave:**

* `canvas = document.getElementById("canvas")` e `gl = canvas.getContext("webgl", { antialias: true })`. Se WebGL non è disponibile, mostra un avviso e interrompe.
* Imposta `gl.clearColor` e `gl.enable(gl.DEPTH_TEST)`.
* Istanzia `meshDrawer` (per disegnare) e `physicsStar` (per la simulazione).
* Legge i dati OBJ inline (`star.obj`), li passa a `physicsStar.setMesh`.
* Chiama `onWindowResize()` per adeguare viewport e `animate()` per partire col loop.

**Effetti collaterali:**
Inizializza variabili globali (`canvas`, `gl`, matrici), crea buffer GPU, avvia animazione.

---

### `animate()`

**Cosa fa:**
Loop di animazione basato su `requestAnimationFrame`.

**Comportamento:**

* Se la simulazione fisica è in esecuzione (`physicsStar.isSimulationRunning()`), avanza di un passo (`physicsStar.simTimeStep()`).
* Disegna la scena (`drawScene()`).
* Pianifica il frame successivo.

**Effetti collaterali:**
Aggiorna posizioni/velocità della mesh, carica nuovi buffer su GPU, ridisegna.

---

### `drawScene()`

**Cosa fa:**
Esegue il rendering della scena corrente.

**Passi chiave:**

* Pulisce i buffer colore e profondità.
* Costruisce la matrice di proiezione (`getProjectionMatrix`) usando la distanza della camera (`-transZ`).
* Costruisce la ModelView (`getModelViewMatrix`) a partire da traslazione globale (`transZ`) e rotazioni globali (`rotX`, `rotY`).
* Calcola `mvpMatrix = matrixMult(perspectiveMatrix, mvMatrix)`.
* Calcola la matrice delle normali come 3×3 estratta da `transpose(inverse(mv))`.
* Chiama `meshDrawer.draw(mvpMatrix, mvMatrix, normalMatrix)`.

**Effetti collaterali:**
Nessuno oltre al rendering. Aggiorna uniform e attributi shader.

---

### `onWindowResize()`

**Cosa fa:**
Adatta il canvas alle dimensioni della finestra e aggiorna il viewport.

**Passi chiave:**

* Imposta `canvas.width/height` a `window.innerWidth/innerHeight`.
* Aggiorna `gl.viewport(0,0,width,height)`.
* Ridisegna la scena per riflettere l’aspect ratio aggiornato.

**Effetti collaterali:**
Modifica dimensioni del buffer di disegno, impatta la proiezione (via `drawScene()`).

---

# Simulazione fisica: `PhysicsStar`

### `constructor()`

**Cosa fa:**
Imposta i parametri fisici di default:

* `gravity = (0, -1.5, 0)`, `particleMass = 0.1`
* `stiffness = 40` (rigidità molle)
* `damping = 1.2` (smorzamento)
* `restitution = 0.2` (rimbalzo contro i bounds)
* Flag per gestione del “settling” (assestamento finale) e “timer” per stato di running.

---

### `setMesh(objData)`

**Cosa fa:**
Crea e popola una `ObjMesh` parsando i dati OBJ, poi chiama `reset()` per inizializzare posizioni/velocità a partire dalla mesh caricata.

**Parametri:**

* `objData`: stringa del contenuto `.obj`.

**Effetti collaterali:**
Sostituisce la mesh corrente, resetta simulazione e buffer.

---

### `reset()`

**Cosa fa:**
Riporta la simulazione allo stato iniziale.

**Passi chiave:**

* Ferma la simulazione, azzera flag di settling.
* Copia le posizioni dei vertici OBJ in `this.positions` come `Vec3`, azzera le velocità.
* Costruisce le molle (`initSprings()`).
* Ricalcola le normali della mesh (`mesh.computeNormals(this.positions)`).
* Aggiorna i buffer della GPU (`updateMeshDrawer()`).
* Ridisegna la scena.

---

### `initSprings()`

**Cosa fa:**
Crea la lista delle molle tra coppie di vertici adiacenti nelle facce, deduplicando gli spigoli.

**Dettagli:**

* Itera le facce e per ogni lato (p0→p1) costruisce una chiave non orientata `min-max`.
* Per ogni spigolo unico, aggiunge una molla `{p0, p1, rest}` dove `rest` è la lunghezza a riposo (distanza iniziale tra i due vertici).

**Effetti collaterali:**
Popola `this.springs`.

---

### `updateMeshDrawer()`

**Cosa fa:**
Genera buffer di vertici e normali dalla mesh decomposta in triangoli e li invia a `meshDrawer`.

**Dettagli:**

* `mesh.getVertexBuffers(this.positions, this.mesh.norm)` produce array flat Float32.
* `meshDrawer.setMesh(...)` carica/aggiorna VBO/NBO.

---

### `simTimeStep()`

**Cosa fa:**
Avanza la simulazione di un passo fisso (`dt = 0.016` ≈ 60 FPS).

**Comportamento:**

* Se in fase di “assestamento” (`isSettling`), interpola la rotazione verso il target (`updateSettling(dt)`).
* Altrimenti:

  * Chiama il **simulatore globale** `simTimeStep(dt, positions, velocities, springs, stiffness, damping, particleMass, gravity, restitution)`.
  * Ricalcola le normali ogni frame.
  * Verifica se passare alla fase di assestamento (`checkIfShouldSettle()`).
* Aggiorna i buffer GPU (`updateMeshDrawer()`).

---

### `checkIfShouldSettle()`

**Cosa fa:**
Decide se interrompere la dinamica molla/gravità per “accompagnare” lentamente l’oggetto verso un orientamento stabile sul piano.

**Criteri:**

* Calcola l’energia cinetica totale (somma su ½ m v²).
* Trova la y minima dei vertici.
* Se `kineticEnergy < 0.001` **e** il punto più basso tocca quasi il suolo (`lowestY <= -1.0 + 0.05`):

  * Attiva `isSettling = true`.
  * Stima trasformazione corrente (`getCurrentTransform()` → centro e rotazione).
  * Imposta:

    * Rotazione target con solo yaw (rotazione attorno a Y) mantenendo l’heading (`targetEuler = (0, rot.y, 0)`).
    * Quaternioni di start/target per slerp.
    * Centro attuale e posizioni di riferimento nel sistema modello (`initialPositionsModel` dai dati OBJ).

**Effetti collaterali:**
Imposta lo stato necessario alla fase di “settling”.

---

### `updateSettling(dt)`

**Cosa fa:**
Esegue una rotazione interpolata (slerp) dell’oggetto attorno al suo centro, dal quaternion iniziale a quello target, per “posarlo” dolcemente.

**Dettagli:**

* `settleSpeed = 2.0`, fattore di interpolazione `min(settleSpeed*dt,1)`.
* Aggiorna `settleStartRotation.slerp(...)` verso il target.
* Applica la rotazione interpolata a **ogni** posizione partendo dalle posizioni modello iniziali, poi trasla sul centro calcolato in `checkIfShouldSettle`.
* Quando l’angolo fra i due quaternioni è < 0.01 rad, termina il settling: `isSettling = false` e `stopSimulation()`.

---

### `getCurrentTransform()`

**Cosa fa:**
Stima centro e orientamento corrente del “solido” deformabile.

**Dettagli:**

* `center`: media delle posizioni.
* Calcola tre vettori (da centro) prendendo tre vertici distanti (0, last, metà).
* Costruisce una terna di assi:

  * `zAxis` = normale al piano formato dai vettori scelti (prodotto vettoriale), normalizzata.
  * `xAxis` = direzione di `p0` normalizzata.
  * `yAxis` = `zAxis × xAxis`, normalizzata.
* Costruisce una `THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis)` e ricava un `THREE.Euler` (ordine `'YXZ'`).
* Ritorna `{ center, rotation }`.

**Nota:** È una stima euristica dell’orientazione (non un PCA completo).

---

### `toggleSimulation(btn)`

**Cosa fa:**
Avvia/ferma la simulazione, aggiornando opzionalmente l’etichetta di un pulsante HTML.

**Parametri:**

* `btn`: elemento `<input>` o simile; se presente, cambia `value` in “Start/Stop Simulation”.

---

### `startSimulation()`, `stopSimulation()`, `isSimulationRunning()`

**Cosa fanno:**

* `startSimulation()`: segna lo stato “in esecuzione” impostando `this.timer = true` se non già attivo.
* `stopSimulation()`: segna lo stato “fermo” con `this.timer = undefined`.
* `isSimulationRunning()`: ritorna `true` se `timer !== undefined`.

**Nota:** qui `timer` è usato come **flag**, non come `setInterval`. Il passo temporale avviene nel loop `requestAnimationFrame`.

---

# Simulatore fisico globale

### `simTimeStep(dt, positions, velocities, springs, stiffness, damping, particleMass, gravity, restitution)`

**Cosa fa:**
Un singolo passo di integrazione **esplicita** (Euler) di un sistema massa–molla con gravità e collisioni contro un box di bounding.

**Passi chiave:**

1. **Forze iniziali:** per ogni particella, forza di gravità `gravity * mass`.
2. **Forze elastiche (molle):** per ogni molla (p1↔p2):

   * `dPos = pos2 - pos1`, direzione `dir = unit(dPos)`.
   * Forza elastica: `Fspring = dir * stiffness * (|dPos| - rest)`, applicata + a p1 e − a p2.
3. **Smorzamento:** aggiunge una forza proporzionale alla differenza di velocità `dVel = vel2 - vel1`, con coefficiente `damping * 0.7`, applicata in modo anti-simmetrico. *(Nota: è uno smorzamento “completo” non proiettato lungo la molla, quindi tende a dissipare energia in tutte le direzioni relative fra le due masse.)*
4. **Integrazione:**

   * Aggiorna velocità: `v += (F/m) * dt`
   * Aggiorna posizioni: `x += v * dt`
5. **Collisioni/limiti:** con un cubo axis-aligned di semilato `bounds = 1.0`. Se un componente supera il limite, viene clampato e la velocità su quell’asse viene invertita e scalata per `restitution`.

**Parametri:** vedi firma.

**Valore di ritorno:**
Nessuno (aggiorna in-place `positions` e `velocities`).

---

# Classi di utilità e mesh

### `class Vec3`

Vettore 3D minimale.

* `constructor(x=0,y=0,z=0)`: inizializza componenti.
* **Metodi che restituiscono un *nuovo* vettore:** `clone`, `add`, `sub`, `mul`, `div`, `cross`, `unit` (se la lunghezza è 0, ritorna (0,0,0)).
* **Metodi *mutanti* (in-place):** `inc`, `dec` (somma/sottrae un altro `Vec3`), `applyQuaternion(q)` (ruota il vettore con il quaternion `{x,y,z,w}` nello stile Three.js).
* **Metodi scalari:** `len2` (norma al quadrato), `len` (norma).

**Nota:** distinzione importante: `add/sub/mul/div` NON modificano l’oggetto; `inc/dec/applyQuaternion` SÌ.

---

### `class ObjMesh`

Gestisce la lettura e la rappresentazione di una mesh `.obj` e la sua triangolazione per il rendering.

* `constructor()`: inizializza array:

  * `vpos` (posizioni dei vertici),
  * `face` (liste di indici per faccia),
  * `norm` (normali per vertice),
  * `nfac` (indici delle normali per faccia, se presenti nel file),
  * `tpos`/`tfac` (coordinate texture e indici, non utilizzate qui nel rendering).

* `parse(objdata)`:
  Analizza riga per riga il testo `.obj`.

  * `v` → aggiunge una posizione in `vpos`.
  * `vn` → aggiunge una normale in `norm`.
  * `f` → aggiunge una faccia in `face` (e, se presenti, gli indici per `nfac` e `tfac`).
    Le facce possono avere N vertici (poligoni).

* `computeNormals(positions)`:
  Calcola normali per vertice **da zero** ignorando eventuali `vn` del file:

  * Azzera `this.norm` (un `Vec3` per vertice).
  * Per ogni faccia, prende i primi tre vertici, calcola la normale di faccia `n = (v1-v0)×(v2-v0)` normalizzata.
  * Somma `n` ai vertici della faccia (smoothing), poi normalizza ogni normale di vertice.

* `getVertexBuffers(positions, normals)`:
  Triangola ogni poligono a **fan** (i triangoli sono `(i0, i1, i2)` con `i0=f[0]` e `i1=f[j+1]`, `i2=f[j+2]`) e produce tre array:

  * `positionBuffer`: float32 flat `[x0,y0,z0, x1,y1,z1, ...]`
  * `normalBuffer`: float32 flat allineato alle posizioni
  * `texCoordBuffer`: **vuoto** qui (tessitura non usata)

  **Ritorna:** `{ positionBuffer, texCoordBuffer, normalBuffer }`.

---

### `class MeshDrawer`

Incapsula gli shader e i buffer WebGL per disegnare la mesh.

* `constructor()`:

  * Compila/collega il programma shader (`InitShaderProgram(meshVS, meshFS)`).
  * Recupera le location di uniform (`mvp`, `mv`, `normalMatrix`, `lightDir`) e attributi (`vertPos`, `vertNormal`).
  * Crea i buffer `vbo` (posizioni) e `nbo` (normali).

* `setMesh(vertPos, texCoords, normals)`:

  * Salva `numVertices = vertPos.length/3`.
  * Carica i dati su GPU con `gl.bufferData(..., gl.DYNAMIC_DRAW)` sia per posizioni che per normali (consentendo aggiornamenti frequenti).

* `draw(mvp, mv, normalMatrix)`:

  * Usa il programma shader, imposta uniform (MVP, MV, matrice delle normali e direzione della luce).
  * Collega VBO e NBO agli attributi, abilita gli array.
  * Esegue `gl.drawArrays(gl.TRIANGLES, 0, numVertices)`.

**Nota:** `lightDir` è fisso (0.577, 0.577, 0.577), cioè direzione normalizzata \~diagonale.

---

# Shader e helper WebGL

### `meshVS` (vertex shader, GLSL)

**Cosa fa:**

* Input: `attribute vec3 vertPos`, `attribute vec3 vertNormal`.
* Uniform: `mat4 mvp`, `mat3 normalMatrix`.
* Output verso il fragment: `varying vec3 fragNormal`.
* `gl_Position = mvp * vec4(vertPos, 1.0)`.
* `fragNormal = normalize(normalMatrix * vertNormal)`.

### `meshFS` (fragment shader, GLSL)

**Cosa fa:**

* Precisione `mediump`.
* Input: `varying vec3 fragNormal`, uniform `vec3 lightDir`.
* Calcola componente diffusiva `diffuse = max(dot(fragNormal, normalize(lightDir)), 0.0)`.
* Colore base giallo/ocra `color = vec3(0.9, 0.7, 0.2)`.
* Uscita: `finalColor = color*(diffuse*0.8 + 0.2)` (un po’ di luce ambientale).

---

### `InitShaderProgram(vs, fs)`

**Cosa fa:**
Crea un `glProgram`, compila i due shader (`compileShader`), li allega, linka il programma e lo ritorna.

**Nota:** Non effettuata alcuna verifica di errori di compilazione/link.

---

### `compileShader(type, source)`

**Cosa fa:**
Crea, assegna sorgente, compila uno shader di tipo `gl.VERTEX_SHADER` o `gl.FRAGMENT_SHADER` e lo ritorna.

**Nota:** Anche qui manca controllo errori (`gl.getShaderParameter(...COMPILE_STATUS)` / `gl.getShaderInfoLog`).

---

# Matrici e algebra

### `getModelViewMatrix(tx, ty, tz, rx, ry)`

**Cosa fa:**
Costruisce una **Model-View** 4×4 applicando nell’ordine:

1. Traslazione (`tM`)
2. Rotazione attorno a Y (`rY`)
3. Rotazione attorno a X (`rX`)

e ritorna `tM * rY * rX` usando `matrixMult`.

**Parametri:**

* `tx, ty, tz`: traslazioni.
* `rx, ry`: rotazioni (radiani).

---

### `getProjectionMatrix(c, z)`

**Cosa fa:**
Costruisce una matrice di proiezione prospettica 4×4 con FOV verticale di 60°, aspect `c.width/c.height`, piani di clip:

* `near = max(z - 10, 0.1)`
* `far = z + 10`

**Parametri:**

* `c`: canvas (usato per l’aspect).
* `z`: distanza (positiva) dalla camera all’oggetto, derivata da `-transZ`.

**Nota:** La scelta di `near/far` dipende da `z`; serve a tenere l’oggetto entro il frustum con un margine di ±10.

---

### `matrixMult(a, b)`

**Cosa fa:**
Moltiplica due matrici 4×4 (rappresentate come array length 16).
Ritorna una nuova matrice `c`.

**Nota:** L’ordinamento degli elementi è coerente con il resto del codice (matrici come array flat). L’indicizzazione è particolare ma auto-consistente nell’app.

---

### `matrixInverse(m)`

**Cosa fa:**
Calcola l’inversa di una 4×4 generica tramite cofattori/adjugata e determinante.
Se `det == 0`, ritorna la **stessa** matrice d’ingresso (quindi niente inversione).

**Valore di ritorno:**
Nuovo array 16 elementi con l’inversa (o `m` se non invertibile).

**Nota:** Non fa check di stabilità numerica; usato qui per la **matrice delle normali**.

---

### `matrixTranspose(m)`

**Cosa fa:**
Ritorna la trasposta di una 4×4.

---

# Dettagli d’integrazione tra fisica e rendering

* **Ciclo:** `animate()` → (se running) `physicsStar.simTimeStep()` → `drawScene()`.
* **Aggiornamento GPU:** a ogni passo fisico/settling, `updateMeshDrawer()` ricarica VBO/NBO con le posizioni aggiornate e le normali ricalcolate.
* **Illuminazione:** semplice diffusiva nel fragment shader usando la `normalMatrix` (corretta per trasformazioni non uniformi).
* **Assestamento (settling):** quando energia bassa e oggetto “a terra”, la dinamica molla/gravità viene soppiantata da una rotazione dolce verso un orientamento “stabile” (solo yaw), usando `THREE.Euler/Quaternion`.

---

# Note e possibili miglioramenti (facoltativi ma utili)

* **Controllo errori shader:** aggiungere check di compilazione/link e log.
* **Smorzamento molle:** per realismo, il damping potrebbe essere proiettato lungo l’asse della molla (dashpot) invece che sull’intero `dVel`.
* **Integrazione:** Euler esplicito può diventare instabile per `stiffness` alta; semi-implicito o RK potrebbe migliorare stabilità.
* **Bounds/Collision:** attualmente AABB fisso di lato 2. Si può sostituire con un piano a `y = -1` e risposta più fisicamente corretta.

Se vuoi, posso trasformare questa descrizione in commenti/docstring direttamente dentro al codice.

*/