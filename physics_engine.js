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
            
            this.linearVelocity.multiplyScalar(0.95); // RIDOTTO damping: da 0.92 per movimento più fluido
            this.angularVelocity.multiplyScalar(0.93); // RIDOTTO damping: da 0.90 per rotazione più fluida

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
    }
    
    setCandyBounds(minVec, maxVec) {
        this.candyBounds = { min: minVec, max: maxVec };
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
        } else {
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
                    
                }
                
                // Debug logging only if enabled
                if (window.cleanReleaseDebug && Math.floor(timeSinceRelease / 300) > Math.floor((timeSinceRelease - 16) / 300)) {
                    const progress = Math.min(100, (timeSinceRelease / cleanReleaseTimeout) * 100);
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
            body.position[axis] += penetration * 0.8; // RIDOTTO: da 1.01 per correzione più dolce
            
            const relativePos = new Vec3().copy(vertex).sub(body.position);
            const contactVelocity = new Vec3().copy(body.linearVelocity).add(body.angularVelocity.cross(relativePos));
            
            const closingSpeed = contactVelocity[axis] * dir;
            if (closingSpeed <= 0) return;
            if (closingSpeed < 0.01) return;

            const impulseMag = -closingSpeed;
            const normalImpulse = new Vec3();
            normalImpulse[axis] = impulseMag * dir;
            if (closingSpeed > 0.05) { // RIDOTTO: soglia più bassa per rimbalzi più delicati
                const bounceImpulseMag = -closingSpeed * body.restitution * 0.6; // RIDOTTO: moltiplicatore per rimbalzi più morbidi
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
    const dynamicCorrectionFactor = 0.02; // ULTERIORMENTE RIDOTTO: per interazioni ancora più morbide
    // Fattore di correzione quando un oggetto cinematico ne spinge uno dinamico (alto per effetto "aratro")
    const kinematicCorrectionFactor = 0.4; // RIDOTTO: da 0.8 per spinte più delicate
    // Tolleranza (slop): una piccolissima sovrapposizione permessa per evitare instabilità.
    const slop = 0.005; // AUMENTATO: da 0.001 per permettere sovrapposizioni maggiori e interazioni più dolci 

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
        const velocityRestitutionThreshold = 0.2; // AUMENTATO: soglia più alta per contatti più gentili
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
        return true;
    } else {
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
                    body.linearVelocity.set(0, -2, 0); // spinta in giù
                    body.angularVelocity.set(0, 0, 0);
                }

                // Applica forze di risposta morbide
                const springStiffness = 500; // RIDOTTO: da 1000 per forze più delicate
                const dampingFactor = 1.2; // AUMENTATO: da 0.9 per maggiore smorzamento

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

                // Sposta la caramella sul bordo della zona PIÙ DOLCEMENTE
                const gentleFactor = 0.3; // Fattore per movimento più graduale
                body.position.x += pushoutX * overlap * gentleFactor;
                body.position.z += pushoutZ * overlap * gentleFactor;

                // Riduce dolcemente la velocità verso il centro invece di annullarla
                const dot = body.linearVelocity.x * pushoutX + body.linearVelocity.z * pushoutZ;
                if (dot < 0) {
                    const dampingFactor = 0.7; // Riduzione graduale invece di azzeramento
                    body.linearVelocity.x -= dot * pushoutX * dampingFactor;
                    body.linearVelocity.z -= dot * pushoutZ * dampingFactor;
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

/* 
certissimo! ecco una lettura “guidata” anche per questo file: ti spiego cosa sono le classi, ogni proprietà importante, e a cosa servono **tutte** le funzioni/metodi, con note su edge case e (dove emergono) possibili bug/incongruenze da sistemare.

---

# Panoramica

```js
import * as THREE from 'three';
import { Vec3 } from './physics_engine_vec3.js';
```

* **Three.js**: per quaternioni, box di bounding, trasformazioni e BVH (usato indirettamente).
* **Vec3**: il tuo vettore 3D “leggero” (x,y,z + utility), usato per velocità/forze ecc.

Il file espone:

* `RigidBody`: wrapper fisico di una mesh (posizione/orientazione, forze, integrazione, sleep).
* `PhysicsEngine`: step di simulazione, gravità, collisioni (tra oggetti, con limiti e con ostacoli statici BVH), “clean release”.
* `CLAW_CONFIG`: costanti per la pinza (anche se semanticamente starebbero meglio vicino al controller).

---

# Classe `RigidBody`

## Scopo

Rappresenta un corpo rigido associato a una `mesh` Three.js: mantiene stato dinamico (posizione, orientazione, velocità, forze), integra nel tempo e sincronizza la mesh.

## Proprietà principali (costruttore)

* `mesh`: la mesh visuale da sincronizzare.
* `mass`, `inverseMass`: massa (se 0 → statico/kinematico), inverseMass = 1/mass o 0.
* **Stato lineare**:
  `position: Vec3` (copiata da `mesh.position`),
  `linearVelocity: Vec3`,
  `force: Vec3`.
* **Stato angolare**:
  `orientation: THREE.Quaternion` (copiato dalla mesh),
  `angularVelocity: Vec3`,
  `torque: Vec3`.
* **Materiale**: `restitution` (rimbalzo), `friction`.
* **Flag di interazione**:
  `collisionEnabled`, `isHeld` (tenuto dalla pinza), `justReleased`, `canFallThrough` (può “passare” attraverso il pavimento/chute).
* **Sleep**: `isSleeping`, `sleepyTimer`, soglie `SLEEP_THRESHOLD = 0.1`, `FRAMES_TO_SLEEP = 30`.
* **Altri flag**: `isBlocked` (per animazioni/scripts che temporaneamente escludono la fisica), `hasTouchedClaw`.
* **Broad-phase**: `boundingRadius` stimato da Box3 della mesh: metà della diagonale (veloce, conservativo).

> Nota: `justReleased` qui non viene usato altrove; `isBeingDispensed/isBeingReleased/ignoreClawCollision/releaseStartTime` sono citati dal motore e attesi sul body, anche se non dichiarati nel costruttore (verranno aggiunti a runtime).

## `applyImpulse(impulse, point)`

Applica un impulso istantaneo:

* aggiorna `linearVelocity += impulse * inverseMass`;
* calcola leva `relativePos = point - position`;
* aggiorna `angularVelocity += (relativePos × impulse) * inverseMass`;
* resetta lo sleep (riattiva il corpo).

**Perché serve:** risposta impulsiva ai contatti/urti e alla risoluzione delle collisioni.

## `update(deltaTime)`

Passo di integrazione del corpo:

1. **Short-circuit**: se `inverseMass==0 || isSleeping || isBlocked || isBeingDispensed || isHeld` → salta solo la **fisica**, ma **NON** la sincronizzazione visiva (vedi sotto).
2. Calcola accelerazioni da `force/torque` e integra **velocità** e **posizione**:

   * `linearVelocity += (force*inverseMass) * dt`
   * `angularVelocity += torque * dt`
   * `position += linearVelocity * dt`
3. **Integrazione orientazione** (quaternioni): implementa `q_dot = 0.5 * ω * q`:

   * costruisce un quat “omega” `(wx*dt/2, wy*dt/2, wz*dt/2, 0)`,
   * lo moltiplica per l’orientazione, poi somma ai componenti e normalizza.
4. **Damping** (più morbido del solito):

   * `linearVelocity *= 0.95`, `angularVelocity *= 0.93`.
5. **Sleep**: calcola energia cinetica approssimata (senza tensore d’inerzia), se < soglia per `FRAMES_TO_SLEEP` frame → `isSleeping=true` e azzera velocità; altrimenti azzera il timer.
6. **Sync visuale (SEMPRE)**: copia `position` e `orientation` nella mesh, così:

   * quando è **in mano** alla pinza (posizione imposta altrove) la mesh segue,
   * quando è **bloccato/dormiente** la mesh resta coerente.

---

# Classe `PhysicsEngine`

## Scopo

Gestisce l’elenco dei corpi, applica gravità e stati speciali (dispensing/clean-release), risolve collisioni:

* **body-body** (pairwise, broad-phase bounding-sphere + narrow-phase BVH),
* **body-static** (con BVH e closest point),
* **body-bounds** (vincoli con pareti/pavimento soffitto),
* **vincoli “candy”** (contenitore + zona di sicurezza distributore).

## Stato (costruttore)

* `bodies: RigidBody[]`
* `staticColliders: THREE.Mesh[]` (con `geometry.boundsTree` pronto)
* `gravity = (0, -9.81, 0)`
* Limiti: `worldBounds`, `prizeBounds`, `candyBounds` (tutti come `{min: Vec3, max: Vec3}`)
* Dispenser: `dispenserCenter: Vec3`, `dispenserSafetyRadius` (+ `…Sq`)

### Configurazione

* `setWorldBounds(minVec, maxVec)` → limiti “generali”.
* `setPrizeBounds(box3)` → converte un `THREE.Box3` in `{min,max}` con piccolo **margine** (±0.01) contro stick sugli spigoli.
* `setCandyBounds(minVec, maxVec)` → limiti specifici per caramelle.
* `setDispenserSafetyZone(center, radius)` → zona cilindrica di “no-go” per caramelle.
* `addBody(body)` / `removeBody(body)` → gestione lista corpi.
* `addStaticCollider(mesh)` → registra ostacoli statici **solo se** hanno `geometry.boundsTree`.

> ⚠️ Ricorda: per usare BVH devi aver preprocessato le geometrie (es. `geometry.computeBoundsTree()` o build equivalente), altrimenti `boundsTree` è assente.

## `update(deltaTime)`

Ordine del passo fisico:

1. **Clean release**: `updateCleanReleaseSystem()` (gestione temporizzata del rilascio “pulito”: vincola movimento e riabilita collisioni alla fine).
2. **Gravità**: aggiunge `m*g` a `force` dei corpi dinamici **non** dormienti **e** non in dispensing.
   Se `isBeingReleased`: applica **solo gravità verticale**, azzera velocità orizzontale e rotazione (caduta a piombo).
3. **Collisioni tra corpi**: `resolveBodyCollisions()`
4. **Collisioni con statici**: `resolveStaticCollisions()` (BVH + closest point)
5. **Collisioni con pareti**: `handleCollisions()` (contro `{min,max}` attivi)
6. **Integrazione**: chiama `body.update(dt)` per ciascun body (salta dormienti).
   Se `body.isCandy` → applica vincoli `_applyCandyConstraints(body)`.

---

## “Clean Release” – `updateCleanReleaseSystem()`

* Timeout: \~1200 ms da `releaseStartTime`.
* Durante il periodo: `isBeingReleased=true`, `ignoreClawCollision=true` (utile per evitare contatti con la pinza e tra rilasci simultanei, vedi anche `getBodyPairsToCheck()`).
* Dopo il timeout: ripristina `ignoreClawCollision=false`, `isBeingReleased=false`, pulisce `releaseStartTime`.
* Ha un piccolo hook di debug (`window.cleanReleaseDebug`).

**Perché serve:** quando la pinza rilascia, gli oggetti cadono dritti e non si disturbano tra loro/col gancio per un attimo, riducendo incastri/glitch.

---

## Collisioni con i limiti – `handleCollisions()`

Per ciascun `body` attivo (non statico, non dormiente, non dispensing/release, non blocked):

1. **Sceglie i bounds**:

   * `body.isCandy` → `candyBounds`;
   * altrimenti `prizeBounds` se impostato, altrimenti `worldBounds`.

2. **Heuristic “touchedClaw”** (anti-incastro agli spigoli):
   crea `bodyBox = new THREE.Box3().setFromObject(body.mesh)` e se **fuori** dai bounds per 2 frame di fila, ferma il corpo brevemente mettendolo a dormire, poi lo risveglia dopo 150 ms.

   > ⚠️ **Possibile bug**: qui si chiama `bodyBox.intersectsBox(boundsToUse)`, ma `boundsToUse` **non è** un `THREE.Box3` – è un oggetto `{min: Vec3, max: Vec3}`. Dovresti costruire un `THREE.Box3` equivalente:
   >
   > ```js
   > const b = new THREE.Box3(
   >   new THREE.Vector3(boundsToUse.min.x, boundsToUse.min.y, boundsToUse.min.z),
   >   new THREE.Vector3(boundsToUse.max.x, boundsToUse.max.y, boundsToUse.max.z)
   > );
   > bodyBox.intersectsBox(b)
   > ```

3. **Contatto vertice-contro-parete**: per ogni vertice della geometria del body (scalato), lo porta in world (`applyQuaternion` + `+ position`) e testa ciascun asse/direzione con `checkCollision(...)`.

### `checkCollision(body, vertex, axis, dir, bounds)`

* **Filtro “passa sotto”**: se `body.canFallThrough` e stai controllando pavimento (asse `y`, direzione `-1`) → **ignora** la collisione (serve a far passare nello scivolo).
* Trova il **limite** lungo l’asse (`bounds.max[axis]` o `bounds.min[axis]`); se il vertice lo supera, calcola una piccola correzione posizionale (80% della penetrazione), poi:

  * stima la **velocità di contatto** (`linearVelocity + ω×r`),
  * se è “chiudente” oltre soglia, calcola impulso normale (+ eventuale rimbalzo attenuato) e **attrito** tangenziale limitato da `friction`,
  * applica `applyImpulse` al body.

**Perché serve:** gestione “manuale” dei limiti con un modello semplice ma stabile (correzione + impulso).

---

## Broad-phase tra corpi – `getBodyPairsToCheck()`

* Salta coppie che coinvolgono statici (a meno che `isBeingDispensed`), corpi **held** o **blocked**.
* **Salta** corpi in “clean release” (evita che i rilasci si disturbino).
* Test **sfera-sfera** su `boundingRadius` (rapido): se dist² < (rA+rB)² → aggiunge la coppia.

**Perché serve:** riduce il numero di test costosi (narrow-phase).

---

## Narrow-phase e risoluzione – `resolveBodyCollisions()`

Per ciascuna coppia:

1. **Narrow-phase BVH**:
   costruisce `matAB = inv(B) * A` e usa `A.mesh.geometry.boundsTree.intersectsGeometry(B.mesh.geometry, matAB)`. Se **no**, esce (niente contatto reale).

2. **Direzione e penetrazione** (approssimata):
   `n = (B.pos - A.pos)`, `dist = |n|`, `penetration = rA + rB - dist`. Se penetrazione ≤ **slop** (0.005) → ignora (evita jitter).

3. **Correzione posizionale** (distribuita per massa):

   * fattore diverso se collisione con un **kinematico** (`inverseMass==0`) → `kinematicCorrectionFactor = 0.4` (effetto “aratro” smorzato), altrimenti `dynamicCorrectionFactor = 0.02` (molto morbido),
   * applica solo l’eccedenza sopra `slop`.

4. **Impulso di collisione**:

   * proiezione della velocità relativa lungo `n`,
   * se si avvicinano: restituzione `e = min(restitution)` ma **annullata** se l’urto è *morbido* (|velAlongNormal| < 0.2) per farli assestare senza saltellare,
   * calcola impulso `j` e aggiorna le **velocità lineari**,
   * risveglia entrambi (azzera sleepyTimer).

**Perché serve:** contatti credibili ma **morbidi** (slop + fattori ridotti) per pile stabili.

---

## Collider statici BVH – `resolveStaticCollisions()`

Prerequisito: `staticColliders[]` contiene mesh con `geometry.boundsTree`.

Per ogni `body` attivo (non statico/dormiente/blocked/dispensed/released/held) **e** non `canFallThrough`:

1. **Intersezione** `body.geometry` vs `staticMesh.geometry` (matrice inv(static) \* body).

2. Se interseca:

   * risveglia il body,
   * trova il **closest point** sulla mesh statica (in locale), lo riporta in world,
   * calcola normale `n = normalize(bodyPos - closestWorld)`,
   * **penetrazione** = `boundingRadius - dist`.

3. Se penetrazione > 0:

   * **correzione aggressiva**: sposta il body lungo `n` di `penetration * 2.0` (esce subito dall’incastro),
   * se *quasi completamente* incastrato (> 90% del raggio): forza una spinta verso il basso (`linearVelocity.y = -2`) e azzera rotazioni,
   * **forza penalità** tipo molla + smorzamento (stiffness 500, damping 1.2) applicata come `force` + relativa **coppia** (`torque = r × F`).

**Perché serve:** contatti robusti con la macchina (piani inclinati, scivolo, bordi complessi) sfruttando la geometria reale via BVH.

---

## Vincoli “candy” – `_applyCandyConstraints(body)`

* **Muri contenitore**: se esistono `candyBoundsMin/Max`, clamp della posizione dentro i limiti (x/y/z).
* **Zona di sicurezza distributore** (se definita e il body **non** è quello in dispensing):

  * se dentro il raggio, lo spinge **dolcemente** verso il bordo (`gentleFactor=0.3`) e riduce la velocità **verso** il centro (`dampingFactor=0.7`), senza azzerarla di botto.

> ⚠️ **Incongruenza**: nel costruttore imposti `this.candyBounds = {min,max}`, ma qui controlli `this.candyBoundsMin/Max` (che non esistono). O usi `candyBounds.min/max` **ovunque**, o definisci `candyBoundsMin/Max` coerentemente.

---

# Altre funzioni / note sparse

## `spendStarAsCoin()`

```js
spendStarAsCoin() {
  if (this.deliveredStars > 0) { this.deliveredStars--; return true; }
  else { return false; }
}
```

> ⚠️ **Probabile refuso**: questa funzione è **fuori** dalla classe e usa `this.deliveredStars`, ma `PhysicsEngine` non ha tale proprietà. Sembra copiata dal controller della pinza. Se ti serve, spostala nella classe corretta o aggiungi la proprietà a chi la usa.

---

# `CLAW_CONFIG`

```js
export const CLAW_CONFIG = {
  STOP_ROT_RAD: 0.7,
  GRAB_THRESHOLD: 2,
  MOVEMENT_SUB_STEPS: 5,
};
```

Parametri della **pinza** (non del motore):

* rotazione massima dita prima di fermarsi,
* quante dita devono toccare per considerare “preso”,
* sub-step per il movimento (anti-tunnelling).

---

# Consigli & punti di attenzione

1. **BVH obbligatorio**: prima di usare `intersectsGeometry`/`closestPointToPoint` assicurati che **tutte** le geometrie rilevanti abbiano `boundsTree` (preprocess).
2. **Bug bounds**: in `handleCollisions()` costruisci un `THREE.Box3` dai tuoi `{min,max}` prima di chiamare `intersectsBox`.
3. **Candy bounds**: unifica `candyBounds` vs `candyBoundsMin/Max`.
4. **Flag runtime**: `isBeingReleased`, `releaseStartTime`, `ignoreClawCollision`, `isBeingDispensed` non sono inizializzati in `RigidBody` ma usati dal motore. Valuta di inizializzarli nel costruttore per chiarezza.
5. **Energia angolare**: la stima usa `0.5*|ω|²` senza tensore d’inerzia: va bene per arcade; se vuoi più realismo, serve `ωᵀ I ω`.
6. **Correzione posizionale**: usi bounding-sphere per la **quantità** di correzione anche quando la narrow-phase BVH rileva contatto: è stabile e semplice, ma non sempre accurato. Va bene per premi morbidi; per rigidità maggiore potresti proiettare sul punto di contatto reale.
7. **Heuristic touchedClaw**: quella logica di “2 frame fuori bounds → sleep breve” è una pezza anti-tremolio. Se dopo il fix di `intersectsBox` vedi ancora jitter agli spigoli, valuta di aumentare `slop` o usare un **continuous collision** sul movimento verticale.

---

se vuoi, posso prepararti anche un **diagramma del flusso `update()`** del motore o commentare inline il file originale con TODO/fix puntuali (es. costruzione Box3, unificazione candy bounds, inizializzazione flag).


*/