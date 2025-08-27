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
        this.restitution = 0; // Keep at 0 for gentle, non-bouncy collisions
        this.friction = 0.5;
        this.collisionEnabled = true;
        this.isHeld = false; // flag to indicate if the object is being held by the claw
        this.justReleased = false; // flag to indicate if the object was just released
        this.canFallThrough = false;
        this.isSleeping = false;
        this.sleepyTimer = 0;
        this.SLEEP_THRESHOLD = 0.15;   // Increased from 0.1 - objects sleep more easily
this.FRAMES_TO_SLEEP = 20;    // Decreased from 30 - objects sleep faster
this.isBlocked = false;

        this.hasTouchedClaw = false; 
// raggio bounding-sphere per il broad-phase
const bb = new THREE.Box3().setFromObject(mesh);
this.boundingRadius = bb.getSize(new THREE.Vector3()).length() * 0.5;


    }

    //wake up condition for objects that are sleeping
    applyImpulse(impulse, point) {
        if (this.inverseMass === 0) return;
        this.isSleeping = false;
        this.sleepyTimer = 0;
        this.linearVelocity.add(impulse.clone().multiplyScalar(this.inverseMass));
        const relativePos = new Vec3().copy(point).sub(this.position);
        this.angularVelocity.add(relativePos.cross(impulse).multiplyScalar(this.inverseMass));
    }

    update(deltaTime) {

        /*
    

  physics simulation is skipped if the object is:
   static (inverseMass === 0) - walls, machine parts
  sleeping - stable objects to save CPU
  blocked - temporarily disabled for animations
  being dispensed - controlled by candy machine logic
  held - grabbed by the claw

        */


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
            
            //damping factors in order to slow objects down - increased for gentler interactions
            this.linearVelocity.multiplyScalar(0.92); // Increased damping from 0.95
            this.angularVelocity.multiplyScalar(0.90); // Increased damping from 0.93 
            this.force.set(0,0,0); this.torque.set(0,0,0);


            //sleep logic if objects get below a certain threshold after some frames
            const kineticEnergy = 0.5 * this.mass * this.linearVelocity.lengthSq() + 0.5 * this.angularVelocity.lengthSq();
            if (kineticEnergy < this.SLEEP_THRESHOLD) {
                this.sleepyTimer++;
                if (this.sleepyTimer >= this.FRAMES_TO_SLEEP) {
                    /* 
                      
  no force/torque calculations
  no velocity updates
  no position changes from physics
                    */
                    this.isSleeping = true;
                    this.linearVelocity.set(0, 0, 0);
                    this.angularVelocity.set(0, 0, 0);
                    
                }
            } else {
                this.sleepyTimer = 0;
            }
        }
        
        this.mesh.position.copy(this.position);
        this.mesh.quaternion.copy(this.orientation);
    }
}

//class where we basically define every object in the scene and where we set up the physics basically

export class PhysicsEngine {
    constructor() {
        this.bodies = []; //stars candies and everything else
        this.staticColliders = []; //we are initializing both static objects and dynamic objects. static objects use BVH for collision detection
        this.gravity = new Vec3(0, -9.81, 0);
        this.worldBounds = null;
        this.prizeBounds = null; // prizes in the claw machine
        this.candyBounds = null; // bounds for candy container
        this.dispenserCenter = null;
        this.dispenserSafetyRadius = 0;
        this.dispenserSafetyRadiusSq = 0;
        this.chuteCenter = null;
        this.chuteSafetyRadius = 0;
        this.chuteSafetyRadiusSq = 0;
    }
    
    setWorldBounds(minVec, maxVec) { 
        this.worldBounds = { min: minVec, max: maxVec }; 
    }
    
    setPrizeBounds(box3) {
        // define the prize bounds
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
        //we define a zone in the candy dispenser in order to candies to now go into it 
        this.dispenserCenter = new Vec3(center.x, center.y, center.z);
        this.dispenserSafetyRadius = radius;
        this.dispenserSafetyRadiusSq = radius * radius;
    }

    setChuteSafetyZone(center, radius) {
        //we define a zone around the claw machine chute to prevent objects from falling into it
        this.chuteCenter = new Vec3(center.x, center.y, center.z);
        this.chuteSafetyRadius = radius;
        this.chuteSafetyRadiusSq = radius * radius;
    }
    
    addBody(body) { 
        this.bodies.push(body); 
    }


    addStaticCollider(mesh) {
        // register static colliders for collision detection with BVH
        if (mesh.geometry.boundsTree) {
            this.staticColliders.push(mesh);
        } else {
        }
    }
    
    update(deltaTime) {

        this.updateCleanReleaseSystem();


        this.bodies.forEach(body => {
            //skip gravity for bodies being manually controlled during dispensing
            if (body.inverseMass > 0 && !body.isSleeping && !body.isBeingDispensed) {
                body.force.add(this.gravity.clone().multiplyScalar(body.mass));
            }
            
            //apply only vertical gravity during release, needed in order to not let bodies behave strangely
            if (body.isBeingReleased && body.inverseMass > 0) {
                //we apply only gravity on the y axis
                body.force.set(0, this.gravity.y * body.mass, 0);
                
                body.linearVelocity.x = 0;
                body.linearVelocity.z = 0;
                body.angularVelocity.set(0, 0, 0);
            }
        });


        this.resolveBodyCollisions();
/* // for each collision pair:
      // narrow-phase BVH intersection test
      // calculate penetration and normal
      // apply position correction
      // calculate and apply collision impulse
      // wake up both objects
      // 
 */



        //handle collisions with machine parts using closest-point queries
        this.resolveStaticCollisions();

      /*
// for each body vs static collider:
      // BVH intersection test
      // find closest point on static mesh
      // calculate penetration
      // apply aggressive correction
      // apply penalty forces (spring-damper)
  }
  purpose: handle collisions with machine parts using closest-point queries
*/


        if (this.worldBounds) this.handleCollisions();

     
        this.bodies.forEach(body => {
            if (body.isSleeping) return;
            body.update(deltaTime);
            if (body.isCandy) {
                this._applyCandyConstraints(body);
            } else {
                this._applyPrizeConstraints(body);
            }
        });
    }
    
    /*    //timeout: ~1200ms from releaseStartTime
      //during period: vertical-only gravity, no horizontal forces
      //after timeout: restore normal physics
  }
  Purpose: Ensures smooth vertical dropping when claw releases objects
  */

    updateCleanReleaseSystem() {
        const cleanReleaseTimeout = 1200; // 1.2 seconds of clean release
        const currentTime = Date.now();
        
        this.bodies.forEach(body => {
            if (body.isBeingReleased && body.releaseStartTime) {
                const timeSinceRelease = currentTime - body.releaseStartTime;
                

                if (timeSinceRelease < 0 || timeSinceRelease > cleanReleaseTimeout * 2) {
                    body.ignoreClawCollision = false;
                    body.isBeingReleased = false;
                    body.releaseStartTime = null;
                    return;
                }
                

                if (timeSinceRelease > cleanReleaseTimeout) {
                    // re-enable collisions and normal physics
                    body.ignoreClawCollision = false;
                    body.isBeingReleased = false;
                    body.releaseStartTime = null;
                    
                }
                
            }
        });
    }



/*

  handleCollisions() {
      // For each body:
      // 1. Choose appropriate bounds (world/prize/candy)
      // 2. Anti-sticking heuristic for edge cases
      // 3. Per-vertex boundary checking
      // 4. Position correction and impulse response
  }
  Purpose: Keep objects within designated boundaries

*/


    handleCollisions() {
        this.bodies.forEach(body => {
            //skip collision handling for special states, including animation-blocked bodies.
            if (body.inverseMass === 0 || body.isSleeping || body.isBeingDispensed || body.isBeingReleased || body.isBlocked) return;
    
            //choose which bounds to use based on whether it's a candy or a prize
            let boundsToUse = null;
            if (body.isCandy) {
                boundsToUse = this.candyBounds;
            } else if (this.prizeBounds) {
                boundsToUse = this.prizeBounds;
            } else {
                boundsToUse = this.worldBounds; 
            }

            if (!boundsToUse) return;

            //compute body bounding box, we are basically handling collisions with the boxes
            // const bodyBox = new THREE.Box3().setFromObject(body.mesh);
            // if (!body.hasTouchedClaw && boundsToUse && !bodyBox.intersectsBox(boundsToUse)) {
            //     body.touchedFrameCount = (body.touchedFrameCount || 0) + 1;
            // } else if (!body.hasTouchedClaw) {
            //     body.touchedFrameCount = 0;
            // }

            // if (!body.hasTouchedClaw && body.touchedFrameCount > 1) {
            //     body.linearVelocity.set(0, 0, 0);
            //     body.angularVelocity.set(0, 0, 0);
            //     body.isSleeping = true;
            //     body.hasTouchedClaw = true;
    
            //     setTimeout(() => {
            //         body.isSleeping = false;
            //     }, 150);
            // }
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
        //in this function, we check for collisions on each axis and direction with the bounds provided

        //if the body can fall, then we are going to skip every collision check on the y axis
        if (body.canFallThrough && axis === 'y' && dir === -1) {
            return;
        }
        //get the current bounds parameters
        const limit = dir > 0 ? bounds.max[axis] : bounds.min[axis];
        //we check if the object has penetrated the box
        if ((dir > 0 && vertex[axis] > limit) || (dir < 0 && vertex[axis] < limit)) {
            //if so, we calculate the penetration depth in order to apply a proper response
            const penetration = limit - vertex[axis];
            body.position[axis] += penetration * 0.8; 
            
            //we then get the velocity of the response
            const relativePos = new Vec3().copy(vertex).sub(body.position);
            const contactVelocity = new Vec3().copy(body.linearVelocity).add(body.angularVelocity.cross(relativePos));
            const closingSpeed = contactVelocity[axis] * dir;
            if (closingSpeed <= 0) return;
            if (closingSpeed < 0.01) return;

            //in the end we compute the impulse to apply to the body in response to the contact
            const impulseMag = -closingSpeed;
            const normalImpulse = new Vec3();
            normalImpulse[axis] = impulseMag * dir;
            //we then apply a bounce impulse if the closing speed is above a certain threshold in order to cause a bounce effect
            if (closingSpeed > 0.05) { 
                const bounceImpulseMag = -closingSpeed * body.restitution * 0.6; 
                const bounceImpulse = new Vec3();
                bounceImpulse[axis] = bounceImpulseMag * dir;
                normalImpulse.add(bounceImpulse);
            }
            //once we have applied the normal impulse, we also apply a friction impulse tangent to the contact normal so that the object doesn't slide indefinitely
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
                
                // CLEAN RELEASE: Skip collisions between objects during clean release
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
    
//bodytobody collisions resolution, this is where objects interact one another 

resolveBodyCollisions() {
    const pairs = this.getBodyPairsToCheck(); //we check which objects are potentially colliding 

    const dynamicCorrectionFactor = 0.01; // Reduced from 0.02 for gentler star-star collisions

    const kinematicCorrectionFactor = 0.25; // Reduced from 0.4 for gentler wall interactions

    const slop = 0.005; 

    //we compute collision normal and penetration depth using BVH intersection tests
    pairs.forEach(([A, B]) => {
        const matAB = new THREE.Matrix4().copy(B.mesh.matrixWorld).invert()
        .multiply(A.mesh.matrixWorld);

        if (!A.mesh.geometry.boundsTree.intersectsGeometry(B.mesh.geometry, matAB)) return;

        const n = new Vec3().copy(B.position).sub(A.position);
        let dist = n.length();
        if (dist < 1e-6) {
            n.set(0, 1, 0);
            dist = 1e-6;
        }
        
        const penetration = (A.boundingRadius + B.boundingRadius) - dist;
        
        if (penetration <= slop) return;

        n.normalize();

        //we are checking if one of the two objects is kinematic (static or infinite mass), depending on this situation we'll have different behaviours
        const isKinematicCollision = (A.inverseMass === 0 || B.inverseMass === 0);
        const correctionFactor = isKinematicCollision ? kinematicCorrectionFactor : dynamicCorrectionFactor;

        //we compute the correction amount and apply it
        const correctionAmount = Math.max(0, penetration - slop);
        const correction = n.clone().multiplyScalar(correctionAmount * correctionFactor);

        //we apply the correction depending on the inverse mass
        A.position.add(correction.clone().multiplyScalar(-A.inverseMass / (A.inverseMass + B.inverseMass)));
        B.position.add(correction.clone().multiplyScalar(B.inverseMass / (A.inverseMass + B.inverseMass)));

        // we compute the relative velocity along the collision normal in order to apply an impulse response
        const rv = new Vec3().copy(B.linearVelocity).sub(A.linearVelocity);
        const velAlongNormal = rv.dot(n);


        if (velAlongNormal > 0) return;

        //we compute the restitution based on the two objects, we also apply a threshold to avoid small bounces
        let e = Math.min(A.restitution, B.restitution);

        const velocityRestitutionThreshold = 0.5; //increased from 0.2, more collisions become non-bouncy
        //when we have bounces below this threshold, we set restitution to 0
        if (Math.abs(velAlongNormal) < velocityRestitutionThreshold) {
            e = 0;
        }

        let j = -(1 + e) * velAlongNormal;
        j /= (A.inverseMass + B.inverseMass);

        const impulse = n.clone().multiplyScalar(j);
        A.linearVelocity.add(impulse.clone().multiplyScalar(-A.inverseMass));
        B.linearVelocity.add(impulse.clone().multiplyScalar(B.inverseMass));
        

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

    removeBody(bodyToRemove) {
        this.bodies = this.bodies.filter(body => body !== bodyToRemove);
    }




    //collisions between dynamic bodies and static machine parts
  resolveStaticCollisions() {
    if (this.staticColliders.length === 0) return;

    const bodyWorldPos = new THREE.Vector3();
    const bodyLocalPos = new THREE.Vector3();
    const closestPoint = new THREE.Vector3();
    const worldClosestPoint = new THREE.Vector3();
    const normal = new Vec3();
    const invStaticMatrix = new THREE.Matrix4();

    this.bodies.forEach(body => {
        //if a body is allowed to fall through the chute, we must disable
        //all its collisions with static machine parts to let it pass.
        if (body.canFallThrough) {
            return;
        }

        //skip bodies in special states (including clean release and being held)
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

            //we find the local position of the body within the static mesh
            invStaticMatrix.copy(staticMesh.matrixWorld).invert();
            bodyLocalPos.copy(bodyWorldPos).applyMatrix4(invStaticMatrix);

            //find the closest point on the static mesh to the body
            staticMesh.geometry.boundsTree.closestPointToPoint(bodyLocalPos, closestPoint);
            worldClosestPoint.copy(closestPoint).applyMatrix4(staticMesh.matrixWorld);

            normal.copy(bodyWorldPos).sub(worldClosestPoint);
            const dist = normal.length();

            if (dist < 1e-6) {
                normal.set(0, 1, 0);
            } else {
                normal.normalize();
            }

            const penetrationDepth = body.boundingRadius - dist;
            if (penetrationDepth > 0) {

                const correctionFactor = 2.0;
                const correctionVector = normal.clone().multiplyScalar(penetrationDepth * correctionFactor);
                body.position.add(correctionVector);


                if (penetrationDepth > body.boundingRadius * 0.9) {
                    body.linearVelocity.set(0, -2, 0); 
                    body.angularVelocity.set(0, 0, 0);
                }


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

        if (this.candyBounds && this.candyBounds.min && this.candyBounds.max) {
            // Esempio: assicurati che il corpo rimanga nei limiti
            body.position.x = Math.max(this.candyBounds.min.x, Math.min(this.candyBounds.max.x, body.position.x));
            body.position.y = Math.max(this.candyBounds.min.y, Math.min(this.candyBounds.max.y, body.position.y));
            body.position.z = Math.max(this.candyBounds.min.z, Math.min(this.candyBounds.max.z, body.position.z));
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

    _applyPrizeConstraints(body) {
        // Chute safety zone for prize objects (stars)
        // Only apply to objects that are likely to be loose stars (not held, not being released, not sleeping)
        // Also skip if object has very low kinetic energy (likely settled)
        if (this.chuteCenter && !body.isHeld && !body.isBeingReleased && !body.isSleeping) {
            const dx = body.position.x - this.chuteCenter.x;
            const dz = body.position.z - this.chuteCenter.z;
            const distanceSq = dx * dx + dz * dz;

            if (distanceSq < this.chuteSafetyRadiusSq && distanceSq > 1e-6) {
                // Only apply constraint if object is moving toward the chute center
                const velocityTowardCenter = body.linearVelocity.x * (-dx) + body.linearVelocity.z * (-dz);
                
                if (velocityTowardCenter > 0.1) { // Only if moving toward center with some speed
                    const distance = Math.sqrt(distanceSq);
                    const overlap = this.chuteSafetyRadius - distance;

                    const pushoutX = dx / distance;
                    const pushoutZ = dz / distance;

                    // Very gentle push to avoid interfering with normal physics
                    const gentleFactor = 0.1; // Much gentler than before
                    body.position.x += pushoutX * overlap * gentleFactor;
                    body.position.z += pushoutZ * overlap * gentleFactor;

                    // Gentle velocity dampening
                    const dampingFactor = 0.3; // Much lighter dampening
                    body.linearVelocity.x -= velocityTowardCenter * pushoutX * dampingFactor;
                    body.linearVelocity.z -= velocityTowardCenter * pushoutZ * dampingFactor;
                }
            }
        }
    }
}



export const CLAW_CONFIG = {

    STOP_ROT_RAD: 0.7,

    GRAB_THRESHOLD: 2, 

    MOVEMENT_SUB_STEPS: 5,
}; 
