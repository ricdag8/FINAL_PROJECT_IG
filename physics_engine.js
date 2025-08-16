// import * as THREE from 'three';
// import { Vec3 } from './physics_engine_vec3.js';

// export class RigidBody {
//     constructor(mesh, mass) {
//         this.mesh = mesh;
//         this.mass = mass;
//         this.inverseMass = mass > 0 ? 1 / mass : 0;
//         this.position = new Vec3().copy(mesh.position);
//         this.linearVelocity = new Vec3();
//         this.orientation = new THREE.Quaternion().copy(mesh.quaternion);
//         this.angularVelocity = new Vec3();
//         this.force = new Vec3();
//         this.torque = new Vec3();
//         this.restitution = 0;
//         this.friction = 0.5;
//         this.collisionEnabled = true;
//         this.isHeld = false; // Flag to indicate if the object is being held by the claw
//         this.justReleased = false; // Grace period flag after being released
//         this.canFallThrough = false;
//         // --- Sleep state ---
//         this.isSleeping = false;
//         this.sleepyTimer = 0;
//         this.SLEEP_THRESHOLD = 0.1;   // ← da 0.04
// this.FRAMES_TO_SLEEP = 30;    // ← da 60
// this.isBlocked = false;

//         this.hasTouchedClaw = false; 
// // raggio bounding-sphere per il broad-phase
// const bb = new THREE.Box3().setFromObject(mesh);
// this.boundingRadius = bb.getSize(new THREE.Vector3()).length() * 0.5;


//     }

//     applyImpulse(impulse, point) {
//         if (this.inverseMass === 0) return;
//         this.isSleeping = false;
//         this.sleepyTimer = 0;
//         this.linearVelocity.add(impulse.clone().multiplyScalar(this.inverseMass));
//         const relativePos = new Vec3().copy(point).sub(this.position);
//         this.angularVelocity.add(relativePos.cross(impulse).multiplyScalar(this.inverseMass));
//     }

//     update(deltaTime) {
//         if (this.inverseMass === 0 || this.isSleeping || this.isBlocked) return;
        
//         const linearAcceleration = new Vec3().copy(this.force).multiplyScalar(this.inverseMass);
//         this.linearVelocity.add(linearAcceleration.multiplyScalar(deltaTime));
//         this.angularVelocity.add(this.torque.multiplyScalar(deltaTime));
        
//         // ✅ Rimuovi il damping duplicato - tieni solo quello più forte
//         // this.linearVelocity.multiplyScalar(0.97);
//         // this.angularVelocity.multiplyScalar(0.97);

//         this.position.add(new Vec3().copy(this.linearVelocity).multiplyScalar(deltaTime));
//         const w = this.angularVelocity;
//         const deltaRotation = new THREE.Quaternion(w.x*deltaTime*0.5, w.y*deltaTime*0.5, w.z*deltaTime*0.5, 0);
//         deltaRotation.multiply(this.orientation);
//         this.orientation.x+=deltaRotation.x; this.orientation.y+=deltaRotation.y; this.orientation.z+=deltaRotation.z; this.orientation.w+=deltaRotation.w;
//         this.orientation.normalize();
//         this.force.set(0,0,0); this.torque.set(0,0,0);
        
//         // ✅ Damping ancora più forte e graduale
//         this.linearVelocity.multiplyScalar(0.92);    // ← ancora più damping
//         this.angularVelocity.multiplyScalar(0.90);   // ← rotazione più smorzata

//         const kineticEnergy = 0.5 * this.mass * this.linearVelocity.lengthSq() + 0.5 * this.angularVelocity.lengthSq();
//         if (kineticEnergy < this.SLEEP_THRESHOLD) {
//             this.sleepyTimer++;
//             if (this.sleepyTimer >= this.FRAMES_TO_SLEEP) {
//                 this.isSleeping = true;
//                 this.linearVelocity.set(0, 0, 0);
//                 this.angularVelocity.set(0, 0, 0);
//             }
//         } else {
//             this.sleepyTimer = 0;
//         }

//         this.mesh.position.copy(this.position);
//         this.mesh.quaternion.copy(this.orientation);
//     }
// }

// export class PhysicsEngine {
//     constructor() {
//         this.bodies = [];
//         this.staticColliders = []; // <-- NUOVO
//         this.gravity = new Vec3(0, -9.81, 0);
//         this.worldBounds = null;
//     }
    
//     setWorldBounds(minVec, maxVec) { 
//         this.worldBounds = { min: minVec, max: maxVec }; 
//     }
    
//     addBody(body) { 
//         this.bodies.push(body); 
//     }

//     // <-- NUOVO
//     addStaticCollider(mesh) {
//         // Assicurati che abbia un BVH
//         if (mesh.geometry.boundsTree) {
//             this.staticColliders.push(mesh);
//             console.log(`Added static collider: ${mesh.name}`);
//         } else {
//             console.warn(`Attempted to add static collider '${mesh.name}' without a BVH.`);
//         }
//     }
    
//     update(deltaTime) {
//         /* 1. Applica la gravità */
//         this.bodies.forEach(body => {
//             if (body.inverseMass > 0 && !body.isSleeping)
//                 body.force.add(this.gravity.clone().multiplyScalar(body.mass));
//         });

//         /* 2. Collisioni fra i premi - SOLO correzione posizionale */
//         this.resolveBodyCollisions();

//         /* NUOVO STEP */
//         this.resolveStaticCollisions();

//         /* 3. Collisioni con le pareti della macchina */
//         if (this.worldBounds) this.handleCollisions();

//         /* 4. Integrazione del moto */
//         this.bodies.forEach(body => body.update(deltaTime));
//     }
    

//     handleCollisions() {
//         this.bodies.forEach(body => {
//             if (body.inverseMass === 0 || body.isSleeping ) return;
    
//             // Calcola la bounding box del corpo
//             const bodyBox = new THREE.Box3().setFromObject(body.mesh);
    
//             // ✅ CAMBIA: rileva solo se esce FUORI dalla macchina, non quando è dentro
//             if (!body.hasTouchedClaw && this.worldBounds && !bodyBox.intersectsBox(this.worldBounds)) {
//                 body.touchedFrameCount = (body.touchedFrameCount || 0) + 1;
//             } else if (!body.hasTouchedClaw) {
//                 body.touchedFrameCount = 0;
//             }
    
//             // Se ha toccato per 2 frame consecutivi → fermalo
//             if (!body.hasTouchedClaw && body.touchedFrameCount > 1) {
//                 console.log(`${body.mesh.name} ha toccato la claw. Fermato.`);
//                 body.linearVelocity.set(0, 0, 0);
//                 body.angularVelocity.set(0, 0, 0);
//                 body.isSleeping = true;
//                 body.hasTouchedClaw = true;
    
//                 setTimeout(() => {
//                     body.isSleeping = false;
//                 }, 150);
//             }
    
//             // Continua a gestire le collisioni per i bordi
//             const geometry = body.mesh.geometry;
//             const vertices = geometry.attributes.position.array;
//             const scale = body.mesh.scale;
    
//             for (let i = 0; i < vertices.length; i += 3) {
//                 const localVertex = new Vec3(
//                     vertices[i] * scale.x,
//                     vertices[i + 1] * scale.y,
//                     vertices[i + 2] * scale.z
//                 );
//                 localVertex.applyQuaternion(body.orientation).add(body.position);
    
//                 ['x', 'y', 'z'].forEach(axis => {
//                     [1, -1].forEach(dir => {
//                         this.checkCollision(body, localVertex, axis, dir);
//                     });
//                 });
//             }
//         });
//     }
    
    
//     checkCollision(body, vertex, axis, dir) {
//        // ✅ INIZIO MODIFICA: Aggiungi questa condizione all'inizio della funzione
//         // Se il corpo può cadere e la collisione è con il pavimento (asse Y, direzione verso il basso),
//         // allora ignora completamente questa collisione.
//         if (body.canFallThrough && axis === 'y' && dir === -1) {
//             return; // Salta il controllo di collisione con il pavimento
//         }
//         const bounds = this.worldBounds;
//         const limit = dir > 0 ? bounds.max[axis] : bounds.min[axis];
//         if ((dir > 0 && vertex[axis] > limit) || (dir < 0 && vertex[axis] < limit)) {
//             const penetration = limit - vertex[axis];
//             body.position[axis] += penetration * 1.01;
            
//             const relativePos = new Vec3().copy(vertex).sub(body.position);
//             const contactVelocity = new Vec3().copy(body.linearVelocity).add(body.angularVelocity.cross(relativePos));
            
//             const closingSpeed = contactVelocity[axis] * dir;
//             if (closingSpeed <= 0) return;
//             if (closingSpeed < 0.01) return;

//             const impulseMag = -closingSpeed;
//             const normalImpulse = new Vec3();
//             normalImpulse[axis] = impulseMag * dir;
//             if (closingSpeed > 0.1) {
//                 const bounceImpulseMag = -closingSpeed * body.restitution;
//                 const bounceImpulse = new Vec3();
//                 bounceImpulse[axis] = bounceImpulseMag * dir;
//                 normalImpulse.add(bounceImpulse);
//             }
//             const tangentVel = new Vec3().copy(contactVelocity);
//             tangentVel[axis] = 0;
//             const maxFriction = Math.abs(impulseMag) * body.friction;
//             const frictionImpulseMag = Math.min(tangentVel.length(), maxFriction);
//             const frictionImpulse = tangentVel.normalize().multiplyScalar(-frictionImpulseMag);
//             const totalImpulse = normalImpulse.add(frictionImpulse);
//             body.applyImpulse(totalImpulse, vertex);
//         }
//     }



//     getBodyPairsToCheck() {
//         const pairs = [];
//         for (let i = 0; i < this.bodies.length; i++) {
//             const A = this.bodies[i];
//             if (A.inverseMass === 0) continue;                // skip statici / presi
    
//             for (let j = i + 1; j < this.bodies.length; j++) {
//                 const B = this.bodies[j];
//                 if (B.inverseMass === 0) continue;
    
//                 // broad phase: sfera vs sfera
//                 const maxDist = A.boundingRadius + B.boundingRadius;
//                 if (A.position.clone().sub(B.position).lengthSq() < maxDist*maxDist)
//                     pairs.push([A, B]);
//             }
//         }
//         return pairs;
//     }
    
//    resolveBodyCollisions() {
//     const pairs = this.getBodyPairsToCheck();

//     pairs.forEach(([A, B]) => {
//         const matAB = new THREE.Matrix4()
//             .copy(B.mesh.matrixWorld).invert()
//             .multiply(A.mesh.matrixWorld);

//         if (!A.mesh.geometry.boundsTree.intersectsGeometry(B.mesh.geometry, matAB)) return;

//         const n = new Vec3().copy(B.position).sub(A.position);
//         let dist = n.length();
//         if (dist < 1e-6) {
//             n.set(1, 0, 0);
//             dist = 0.001;
//         }
//         const penetration = (A.boundingRadius + B.boundingRadius) - dist;
//         if (penetration <= 0) return;

//         n.normalize();

//         // 🧩 Sposta i corpi per risolvere la penetrazione
//         const correction = n.clone().multiplyScalar(penetration * 0.5); // metà ciascuno
//         A.position.add(correction.clone().multiplyScalar(-1));
//         B.position.add(correction);

//         // 💥 Ferma entrambi per evitare oscillazioni
//         A.linearVelocity.set(0, 0, 0);
//         B.linearVelocity.set(0, 0, 0);
//         A.angularVelocity.set(0, 0, 0);
//         B.angularVelocity.set(0, 0, 0);

//         // 😴 Optional: metti in sleep
//         A.isSleeping = true;
//         B.isSleeping = true;
//     });
// }

// spendStarAsCoin() {
//     if (this.deliveredStars > 0) {
//         this.deliveredStars--;
//         console.log(`🪙 Star spent! Remaining stars: ${this.deliveredStars}`);
//         return true;
//     } else {
//         console.warn("Not enough stars to insert a coin.");
//         return false;
//     }
// }


//     // physics_engine.js -> dentro la classe PhysicsEngine

//     removeBody(bodyToRemove) {
//         this.bodies = this.bodies.filter(body => body !== bodyToRemove);
//     }


//   resolveStaticCollisions() {
//     if (this.staticColliders.length === 0) return;

//     const bodyWorldPos = new THREE.Vector3();
//     const bodyLocalPos = new THREE.Vector3();
//     const closestPoint = new THREE.Vector3();
//     const worldClosestPoint = new THREE.Vector3();
//     const normal = new Vec3();
//     const invStaticMatrix = new THREE.Matrix4();

//     this.bodies.forEach(body => {
//         if (body.inverseMass === 0 || body.isSleeping || body.isBlocked) return;

//         bodyWorldPos.copy(body.position);

//         this.staticColliders.forEach(staticMesh => {
//             const matrix = new THREE.Matrix4()
//                 .copy(staticMesh.matrixWorld).invert()
//                 .multiply(body.mesh.matrixWorld);

//             const intersects = body.mesh.geometry.boundsTree
//                 .intersectsGeometry(staticMesh.geometry, matrix);

//             if (!intersects) return;

//             body.isSleeping = false;
//             body.sleepyTimer = 0;

//             invStaticMatrix.copy(staticMesh.matrixWorld).invert();
//             bodyLocalPos.copy(bodyWorldPos).applyMatrix4(invStaticMatrix);

//             staticMesh.geometry.boundsTree.closestPointToPoint(bodyLocalPos, closestPoint);
//             worldClosestPoint.copy(closestPoint).applyMatrix4(staticMesh.matrixWorld);

//             normal.copy(bodyWorldPos).sub(worldClosestPoint);
//             const dist = normal.length();

//             if (dist < 1e-6) {
//                 normal.set(0, 1, 0); // fallback normale verso l'alto
//             } else {
//                 normal.normalize();
//             }

//             const penetrationDepth = body.boundingRadius - dist;
//             if (penetrationDepth > 0) {
//                 // ✅ Sovra-correzione aggressiva
//                 const correctionFactor = 2.0;
//                 const correctionVector = normal.clone().multiplyScalar(penetrationDepth * correctionFactor);
//                 body.position.add(correctionVector);

//                 // ⚠️ Se molto incastrato → forzatura
//                 if (penetrationDepth > body.boundingRadius * 0.9) {
//                     console.warn(`${body.mesh.name} profondamente incastrato nella staticMesh ${staticMesh.name}`);
//                     body.linearVelocity.set(0, -2, 0); // spinta in giù
//                     body.angularVelocity.set(0, 0, 0);
//                 }

//                 // Applica forze di risposta morbide
//                 const springStiffness = 1000;
//                 const dampingFactor = 0.9;

//                 const penaltyForceMag = penetrationDepth * springStiffness;
//                 const penaltyForce = normal.clone().multiplyScalar(penaltyForceMag);

//                 const velocityAlongNormal = body.linearVelocity.dot(normal);
//                 const dampingForceMag = velocityAlongNormal * dampingFactor;
//                 const dampingForce = normal.clone().multiplyScalar(-dampingForceMag);

//                 const totalForce = penaltyForce.add(dampingForce);
//                 const contactPointRelative = new Vec3().copy(worldClosestPoint).sub(body.position);
//                 const torque = new Vec3().crossVectors(contactPointRelative, totalForce);

//                 body.force.add(totalForce);
//                 body.torque.add(torque);
//             }
//         });
//     });
// }
// }



// export const CLAW_CONFIG = {
//     // Maximum rotation in radians for a finger before it stops closing if it doesn't hit anything.
//     STOP_ROT_RAD: 0.7,
//     // Number of fingers that must touch the star to consider it "grabbed".
//     GRAB_THRESHOLD: 2, 
//     // Sub-steps for claw movement to prevent tunnelling through the prize.
//     MOVEMENT_SUB_STEPS: 5,
// }; 



import * as THREE from 'three';
import { Vec3 } from './physics_engine_vec3.js';

export class RigidBody {
    constructor(mesh, mass) {
        this.mesh = mesh;
        this.mass = mass;
        this.inverseMass = mass > 0 ? 1 / mass : 0;
        this.position = new Vec3().copy(mesh.position);
        this.linearVelocity = new Vec3();
        this.orientation = new THREE.Quaternion().copy(mesh.quaternion);
        this.angularVelocity = new Vec3();
        this.force = new Vec3();
        this.torque = new Vec3();
        this.restitution = 0;
        this.friction = 0.5;
        this.collisionEnabled = true;
        this.isHeld = false; // Flag to indicate if the object is being held by the claw
        this.justReleased = false; // Grace period flag after being released
        this.canFallThrough = false;
        // --- Sleep state ---
        this.isSleeping = false;
        this.sleepyTimer = 0;
        this.SLEEP_THRESHOLD = 0.1;   // ← da 0.04
this.FRAMES_TO_SLEEP = 30;    // ← da 60
this.isBlocked = false;

        this.hasTouchedClaw = false; 
// raggio bounding-sphere per il broad-phase
const bb = new THREE.Box3().setFromObject(mesh);
this.boundingRadius = bb.getSize(new THREE.Vector3()).length() * 0.5;


    }

    applyImpulse(impulse, point) {
        if (this.inverseMass === 0) return;
        this.isSleeping = false;
        this.sleepyTimer = 0;
        this.linearVelocity.add(impulse.clone().multiplyScalar(this.inverseMass));
        const relativePos = new Vec3().copy(point).sub(this.position);
        this.angularVelocity.add(relativePos.cross(impulse).multiplyScalar(this.inverseMass));
    }

    update(deltaTime) {
        // Only skip the physics simulation, not the entire function.
        if ( !(this.inverseMass === 0 || this.isSleeping || this.isBlocked || this.isBeingDispensed || this.isHeld) ) {
            const linearAcceleration = new Vec3().copy(this.force).multiplyScalar(this.inverseMass);
            this.linearVelocity.add(linearAcceleration.multiplyScalar(deltaTime));
            this.angularVelocity.add(this.torque.multiplyScalar(deltaTime));
            
            this.position.add(new Vec3().copy(this.linearVelocity).multiplyScalar(deltaTime));
            const w = this.angularVelocity;
            const deltaRotation = new THREE.Quaternion(w.x*deltaTime*0.5, w.y*deltaTime*0.5, w.z*deltaTime*0.5, 0);
            deltaRotation.multiply(this.orientation);
            this.orientation.x+=deltaRotation.x; this.orientation.y+=deltaRotation.y; this.orientation.z+=deltaRotation.z; this.orientation.w+=deltaRotation.w;
            this.orientation.normalize();
            this.force.set(0,0,0); this.torque.set(0,0,0);
            
            this.linearVelocity.multiplyScalar(0.92);
            this.angularVelocity.multiplyScalar(0.90);

            const kineticEnergy = 0.5 * this.mass * this.linearVelocity.lengthSq() + 0.5 * this.angularVelocity.lengthSq();
            if (kineticEnergy < this.SLEEP_THRESHOLD) {
                this.sleepyTimer++;
                if (this.sleepyTimer >= this.FRAMES_TO_SLEEP) {
                    this.isSleeping = true;
                    this.linearVelocity.set(0, 0, 0);
                    this.angularVelocity.set(0, 0, 0);
                }
            } else {
                this.sleepyTimer = 0;
            }
        }
        
        // This visual sync now runs ALWAYS.
        // When the claw holds the star, claw_controller updates body.position,
        // and this code updates the visual mesh's position to match.
        this.mesh.position.copy(this.position);
        this.mesh.quaternion.copy(this.orientation);
    }
}

export class PhysicsEngine {
    constructor() {
        this.bodies = [];
        this.staticColliders = []; // <-- NUOVO
        this.gravity = new Vec3(0, -9.81, 0);
        this.worldBounds = null;
        this.prizeBounds = null; // For prizes in the claw machine
        this.candyBounds = null; // NEW: Separate bounds for candy container
        this.dispenserCenter = null;
        this.dispenserSafetyRadius = 0;
        this.dispenserSafetyRadiusSq = 0;
    }
    
    setWorldBounds(minVec, maxVec) { 
        this.worldBounds = { min: minVec, max: maxVec }; 
    }
    
    setPrizeBounds(box3) {
        // We add a small margin to prevent objects from getting stuck exactly on the edge.
        const margin = 0.01;
        this.prizeBounds = { 
            min: new Vec3(box3.min.x + margin, box3.min.y + margin, box3.min.z + margin), 
            max: new Vec3(box3.max.x - margin, box3.max.y - margin, box3.max.z - margin) 
        };
        console.log("🏆 Prize container bounds set.");
    }
    
    setCandyBounds(minVec, maxVec) {
        this.candyBounds = { min: minVec, max: maxVec };
        console.log("🍬 Candy bounds set:", minVec, "to", maxVec);
    }

    setDispenserSafetyZone(center, radius) {
        this.dispenserCenter = new Vec3(center.x, center.y, center.z);
        this.dispenserSafetyRadius = radius;
        this.dispenserSafetyRadiusSq = radius * radius;
    }
    
    addBody(body) { 
        this.bodies.push(body); 
    }

    // <-- NUOVO
    addStaticCollider(mesh) {
        // Assicurati che abbia un BVH
        if (mesh.geometry.boundsTree) {
            this.staticColliders.push(mesh);
            console.log(`Added static collider: ${mesh.name}`);
        } else {
            console.warn(`Attempted to add static collider '${mesh.name}' without a BVH.`);
        }
    }
    
    update(deltaTime) {
        /* 🆕 CLEAN RELEASE MANAGEMENT */
        this.updateCleanReleaseSystem();

        /* 1. Applica la gravità */
        this.bodies.forEach(body => {
            // Skip gravity for bodies being manually controlled during dispensing
            if (body.inverseMass > 0 && !body.isSleeping && !body.isBeingDispensed) {
                body.force.add(this.gravity.clone().multiplyScalar(body.mass));
            }
            
            // 🆕 CLEAN RELEASE: Apply only vertical gravity during release
            if (body.isBeingReleased && body.inverseMass > 0) {
                // Apply only gravity, ignore other forces
                body.force.set(0, this.gravity.y * body.mass, 0);
                
                // Constrain horizontal movement to zero
                body.linearVelocity.x = 0;
                body.linearVelocity.z = 0;
                body.angularVelocity.set(0, 0, 0);
            }
        });

        /* 2. Collisioni fra i premi - SOLO correzione posizionale */
        this.resolveBodyCollisions();

        /* NUOVO STEP */
        this.resolveStaticCollisions();

        /* 3. Collisioni con le pareti della macchina */
        if (this.worldBounds) this.handleCollisions();

        /* 4. Integrazione del moto */
        this.bodies.forEach(body => {
            if (body.isSleeping) return; // MODIFICATO: `continue` non è valido in forEach, si usa `return`.
            body.update(deltaTime);
            if (body.isCandy) {
                this._applyCandyConstraints(body);
            }
        });
    }
    
    // 🆕 CLEAN RELEASE SYSTEM MANAGEMENT
    updateCleanReleaseSystem() {
        const cleanReleaseTimeout = 1200; // 1.2 seconds of clean release
        const currentTime = Date.now();
        
        this.bodies.forEach(body => {
            if (body.isBeingReleased && body.releaseStartTime) {
                const timeSinceRelease = currentTime - body.releaseStartTime;
                
                // Safety check: if release time is invalid, reset immediately
                if (timeSinceRelease < 0 || timeSinceRelease > cleanReleaseTimeout * 2) {
                    console.warn(`⚠️ Invalid release time for ${body.mesh.name}, resetting`);
                    body.ignoreClawCollision = false;
                    body.isBeingReleased = false;
                    body.releaseStartTime = null;
                    return;
                }
                
                // Check if clean release period is over
                if (timeSinceRelease > cleanReleaseTimeout) {
                    // Re-enable collisions and normal physics
                    body.ignoreClawCollision = false;
                    body.isBeingReleased = false;
                    body.releaseStartTime = null;
                    
                    console.log(`✅ CLEAN RELEASE COMPLETE: ${body.mesh.name} (${(timeSinceRelease/1000).toFixed(1)}s)`);
                }
                
                // Debug logging only if enabled
                if (window.cleanReleaseDebug && Math.floor(timeSinceRelease / 300) > Math.floor((timeSinceRelease - 16) / 300)) {
                    const progress = Math.min(100, (timeSinceRelease / cleanReleaseTimeout) * 100);
                    console.log(`🕐 Clean release: ${body.mesh.name} ${progress.toFixed(0)}%`);
                }
            }
        });
    }

    handleCollisions() {
        this.bodies.forEach(body => {
            // Skip collision handling for special states, including animation-blocked bodies.
            if (body.inverseMass === 0 || body.isSleeping || body.isBeingDispensed || body.isBeingReleased || body.isBlocked) return;
    
            // Choose which bounds to use based on whether it's a candy or a prize
            let boundsToUse = null;
            if (body.isCandy) {
                boundsToUse = this.candyBounds;
            } else if (this.prizeBounds) { // Assumes non-candy objects are prizes
                boundsToUse = this.prizeBounds;
            } else {
                boundsToUse = this.worldBounds; // Fallback
            }

            if (!boundsToUse) return;
    
            // Calcola la bounding box del corpo
            const bodyBox = new THREE.Box3().setFromObject(body.mesh);
    
            // ✅ CAMBIA: rileva solo se esce FUORI dalla macchina, non quando è dentro
            if (!body.hasTouchedClaw && boundsToUse && !bodyBox.intersectsBox(boundsToUse)) {
                body.touchedFrameCount = (body.touchedFrameCount || 0) + 1;
            } else if (!body.hasTouchedClaw) {
                body.touchedFrameCount = 0;
            }
    
            // Se ha toccato per 2 frame consecutivi → fermalo
            if (!body.hasTouchedClaw && body.touchedFrameCount > 1) {
                console.log(`${body.mesh.name} ha toccato la claw. Fermato.`);
                body.linearVelocity.set(0, 0, 0);
                body.angularVelocity.set(0, 0, 0);
                body.isSleeping = true;
                body.hasTouchedClaw = true;
    
                setTimeout(() => {
                    body.isSleeping = false;
                }, 150);
            }
    
            // Continua a gestire le collisioni per i bordi
            const geometry = body.mesh.geometry;
            const vertices = geometry.attributes.position.array;
            const scale = body.mesh.scale;
    
            for (let i = 0; i < vertices.length; i += 3) {
                const localVertex = new Vec3(
                    vertices[i] * scale.x,
                    vertices[i + 1] * scale.y,
                    vertices[i + 2] * scale.z
                );
                localVertex.applyQuaternion(body.orientation).add(body.position);
    
                ['x', 'y', 'z'].forEach(axis => {
                    [1, -1].forEach(dir => {
                        this.checkCollision(body, localVertex, axis, dir, boundsToUse);
                    });
                });
            }
        });
    }
    
    
    checkCollision(body, vertex, axis, dir, bounds) {
       // ✅ INIZIO MODIFICA: Aggiungi questa condizione all'inizio della funzione
        // Se il corpo può cadere e la collisione è con il pavimento (asse Y, direzione verso il basso),
        // allora ignora completamente questa collisione.
        if (body.canFallThrough && axis === 'y' && dir === -1) {
            return; // Salta il controllo di collisione con il pavimento
        }
        // Use the bounds parameter instead of this.worldBounds
        const limit = dir > 0 ? bounds.max[axis] : bounds.min[axis];
        if ((dir > 0 && vertex[axis] > limit) || (dir < 0 && vertex[axis] < limit)) {
            const penetration = limit - vertex[axis];
            body.position[axis] += penetration * 1.01;
            
            const relativePos = new Vec3().copy(vertex).sub(body.position);
            const contactVelocity = new Vec3().copy(body.linearVelocity).add(body.angularVelocity.cross(relativePos));
            
            const closingSpeed = contactVelocity[axis] * dir;
            if (closingSpeed <= 0) return;
            if (closingSpeed < 0.01) return;

            const impulseMag = -closingSpeed;
            const normalImpulse = new Vec3();
            normalImpulse[axis] = impulseMag * dir;
            if (closingSpeed > 0.1) {
                const bounceImpulseMag = -closingSpeed * body.restitution;
                const bounceImpulse = new Vec3();
                bounceImpulse[axis] = bounceImpulseMag * dir;
                normalImpulse.add(bounceImpulse);
            }
            const tangentVel = new Vec3().copy(contactVelocity);
            tangentVel[axis] = 0;
            const maxFriction = Math.abs(impulseMag) * body.friction;
            const frictionImpulseMag = Math.min(tangentVel.length(), maxFriction);
            const frictionImpulse = tangentVel.normalize().multiplyScalar(-frictionImpulseMag);
            const totalImpulse = normalImpulse.add(frictionImpulse);
            body.applyImpulse(totalImpulse, vertex);
        }
    }



    getBodyPairsToCheck() {
        const pairs = [];
        for (let i = 0; i < this.bodies.length; i++) {
            const A = this.bodies[i];
            // Skip static, held, or animation-blocked bodies from consideration.
            if ((A.inverseMass === 0 && !A.isBeingDispensed) || A.isHeld || A.isBlocked) continue;
    
            for (let j = i + 1; j < this.bodies.length; j++) {
                const B = this.bodies[j];
                // Also skip pairs involving another static, held, or blocked body.
                if ((B.inverseMass === 0 && !B.isBeingDispensed) || B.isHeld || B.isBlocked) continue;
                
                // 🆕 CLEAN RELEASE: Skip collisions between objects during clean release
                // This prevents released stars from interfering with each other
                if ((A.isBeingReleased || B.isBeingReleased)) {
                    continue; // Skip collision resolution for releasing objects
                }
    
                // broad phase: sfera vs sfera
                const maxDist = A.boundingRadius + B.boundingRadius;
                if (A.position.clone().sub(B.position).lengthSq() < maxDist*maxDist)
                    pairs.push([A, B]);
            }
        }
        return pairs;
    }
    
// in physics_engine.js

resolveBodyCollisions() {
    const pairs = this.getBodyPairsToCheck();

    // --- MODIFICATO: Fattori di correzione differenziati ---
    // Fattore di correzione per collisioni tra oggetti dinamici (basso per stabilità)
    const dynamicCorrectionFactor = 0.05; // RIDOTTO: da 0.1 per interazioni più morbide
    // Fattore di correzione quando un oggetto cinematico ne spinge uno dinamico (alto per effetto "aratro")
    const kinematicCorrectionFactor = 0.8;
    // Tolleranza (slop): una piccolissima sovrapposizione permessa per evitare instabilità.
    const slop = 0.001; 

    pairs.forEach(([A, B]) => {
        const matAB = new THREE.Matrix4()
            .copy(B.mesh.matrixWorld).invert()
            .multiply(A.mesh.matrixWorld);

        if (!A.mesh.geometry.boundsTree.intersectsGeometry(B.mesh.geometry, matAB)) return;

        const n = new Vec3().copy(B.position).sub(A.position);
        let dist = n.length();
        if (dist < 1e-6) {
            n.set(0, 1, 0);
            dist = 1e-6;
        }
        
        const penetration = (A.boundingRadius + B.boundingRadius) - dist;
        
        // Se la penetrazione è inferiore alla nostra tolleranza, non fare nulla.
        if (penetration <= slop) return;

        n.normalize();

        // --- CORREZIONE DELLA POSIZIONE (ORA CONDIZIONALE) ---
        // Seleziona il fattore di correzione corretto in base al tipo di collisione
        const isKinematicCollision = (A.inverseMass === 0 || B.inverseMass === 0);
        const correctionFactor = isKinematicCollision ? kinematicCorrectionFactor : dynamicCorrectionFactor;

        // Calcola l'ammontare della correzione tenendo conto della tolleranza.
        const correctionAmount = Math.max(0, penetration - slop);
        const correction = n.clone().multiplyScalar(correctionAmount * correctionFactor);
        
        // Applica la correzione (distribuita in base alla massa)
        A.position.add(correction.clone().multiplyScalar(-A.inverseMass / (A.inverseMass + B.inverseMass)));
        B.position.add(correction.clone().multiplyScalar(B.inverseMass / (A.inverseMass + B.inverseMass)));

        // --- RISOLUZIONE DELL'IMPULSO (INVARIATA) ---
        const rv = new Vec3().copy(B.linearVelocity).sub(A.linearVelocity);
        const velAlongNormal = rv.dot(n);

        if (velAlongNormal > 0) return;

        let e = Math.min(A.restitution, B.restitution);

        // --- NUOVA MODIFICA: Smorzamento per Contatti Leggeri ---
        // Se gli oggetti si toccano delicatamente, annulliamo la "restituzione" (il rimbalzo)
        // per farli assestare più dolcemente, invece di farli continuare a tremare.
        const velocityRestitutionThreshold = 0.1;
        if (Math.abs(velAlongNormal) < velocityRestitutionThreshold) {
            e = 0;
        }

        let j = -(1 + e) * velAlongNormal;
        j /= (A.inverseMass + B.inverseMass);

        const impulse = n.clone().multiplyScalar(j);
        A.linearVelocity.add(impulse.clone().multiplyScalar(-A.inverseMass));
        B.linearVelocity.add(impulse.clone().multiplyScalar(B.inverseMass));
        
        // RIPRISTINATO: Risveglio standard e incondizionato
        A.isSleeping = false;
        B.isSleeping = false;
        A.sleepyTimer = 0;
        B.sleepyTimer = 0;
    });
}

spendStarAsCoin() {
    if (this.deliveredStars > 0) {
        this.deliveredStars--;
        console.log(`🪙 Star spent! Remaining stars: ${this.deliveredStars}`);
        return true;
    } else {
        console.warn("Not enough stars to insert a coin.");
        return false;
    }
}


    // physics_engine.js -> dentro la classe PhysicsEngine

    removeBody(bodyToRemove) {
        this.bodies = this.bodies.filter(body => body !== bodyToRemove);
    }


  resolveStaticCollisions() {
    if (this.staticColliders.length === 0) return;

    const bodyWorldPos = new THREE.Vector3();
    const bodyLocalPos = new THREE.Vector3();
    const closestPoint = new THREE.Vector3();
    const worldClosestPoint = new THREE.Vector3();
    const normal = new Vec3();
    const invStaticMatrix = new THREE.Matrix4();

    this.bodies.forEach(body => {
        // If a body is allowed to fall through the chute, we must disable
        // all its collisions with static machine parts to let it pass.
        if (body.canFallThrough) {
            return;
        }

        // Skip bodies in special states (including clean release and being held)
        if (body.inverseMass === 0 || body.isSleeping || body.isBlocked || body.isBeingDispensed || body.isBeingReleased || body.isHeld) return;

        bodyWorldPos.copy(body.position);

        this.staticColliders.forEach(staticMesh => {
            const matrix = new THREE.Matrix4()
                .copy(staticMesh.matrixWorld).invert()
                .multiply(body.mesh.matrixWorld);

            const intersects = body.mesh.geometry.boundsTree
                .intersectsGeometry(staticMesh.geometry, matrix);

            if (!intersects) return;

            body.isSleeping = false;
            body.sleepyTimer = 0;

            invStaticMatrix.copy(staticMesh.matrixWorld).invert();
            bodyLocalPos.copy(bodyWorldPos).applyMatrix4(invStaticMatrix);

            staticMesh.geometry.boundsTree.closestPointToPoint(bodyLocalPos, closestPoint);
            worldClosestPoint.copy(closestPoint).applyMatrix4(staticMesh.matrixWorld);

            normal.copy(bodyWorldPos).sub(worldClosestPoint);
            const dist = normal.length();

            if (dist < 1e-6) {
                normal.set(0, 1, 0); // fallback normale verso l'alto
            } else {
                normal.normalize();
            }

            const penetrationDepth = body.boundingRadius - dist;
            if (penetrationDepth > 0) {
                // ✅ Sovra-correzione aggressiva
                const correctionFactor = 2.0;
                const correctionVector = normal.clone().multiplyScalar(penetrationDepth * correctionFactor);
                body.position.add(correctionVector);

                // ⚠️ Se molto incastrato → forzatura
                if (penetrationDepth > body.boundingRadius * 0.9) {
                    console.warn(`${body.mesh.name} profondamente incastrato nella staticMesh ${staticMesh.name}`);
                    body.linearVelocity.set(0, -2, 0); // spinta in giù
                    body.angularVelocity.set(0, 0, 0);
                }

                // Applica forze di risposta morbide
                const springStiffness = 1000;
                const dampingFactor = 0.9;

                const penaltyForceMag = penetrationDepth * springStiffness;
                const penaltyForce = normal.clone().multiplyScalar(penaltyForceMag);

                const velocityAlongNormal = body.linearVelocity.dot(normal);
                const dampingForceMag = velocityAlongNormal * dampingFactor;
                const dampingForce = normal.clone().multiplyScalar(-dampingForceMag);

                const totalForce = penaltyForce.add(dampingForce);
                const contactPointRelative = new Vec3().copy(worldClosestPoint).sub(body.position);
                const torque = new Vec3().crossVectors(contactPointRelative, totalForce);

                body.force.add(totalForce);
                body.torque.add(torque);
            }
        });
    });
}

    _applyCandyConstraints(body) {
        // Vincolo 1: Muri del contenitore (la tua logica esistente va qui)
        if (this.candyBoundsMin && this.candyBoundsMax) {
            // Esempio: assicurati che il corpo rimanga nei limiti
            body.position.x = Math.max(this.candyBoundsMin.x, Math.min(this.candyBoundsMax.x, body.position.x));
            body.position.y = Math.max(this.candyBoundsMin.y, Math.min(this.candyBoundsMax.y, body.position.y));
            body.position.z = Math.max(this.candyBoundsMin.z, Math.min(this.candyBoundsMax.z, body.position.z));
        }

        // Vincolo 2: Zona di sicurezza del distributore
        // Si applica solo se la caramella NON è quella in fase di erogazione.
        if (this.dispenserCenter && !body.isBeingDispensed) {
            const dx = body.position.x - this.dispenserCenter.x;
            const dz = body.position.z - this.dispenserCenter.z;
            const distanceSq = dx * dx + dz * dz;

            if (distanceSq < this.dispenserSafetyRadiusSq && distanceSq > 1e-6) {
                const distance = Math.sqrt(distanceSq);
                const overlap = this.dispenserSafetyRadius - distance;

                const pushoutX = dx / distance;
                const pushoutZ = dz / distance;

                // Sposta la caramella sul bordo della zona
                body.position.x += pushoutX * overlap;
                body.position.z += pushoutZ * overlap;

                // Annulla la componente di velocità che punta verso il centro
                const dot = body.linearVelocity.x * pushoutX + body.linearVelocity.z * pushoutZ;
                if (dot < 0) {
                    body.linearVelocity.x -= dot * pushoutX;
                    body.linearVelocity.z -= dot * pushoutZ;
                }
            }
        }
    }
}



export const CLAW_CONFIG = {
    // Maximum rotation in radians for a finger before it stops closing if it doesn't hit anything.
    STOP_ROT_RAD: 0.7,
    // Number of fingers that must touch the star to consider it "grabbed".
    GRAB_THRESHOLD: 2, 
    // Sub-steps for claw movement to prevent tunnelling through the prize.
    MOVEMENT_SUB_STEPS: 5,
}; 