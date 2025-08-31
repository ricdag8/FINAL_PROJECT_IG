import * as THREE from 'three';
import { Vec3 } from './physics_engine_vec3.js';

export class GrabbableObjectsInteraction {
    constructor(cylinders) {
        this.cylinders = cylinders;
        this.objects = []; //array of {body, mesh, name} objects
        this.collisions = { A: false, B: false, C: false };
        this.collisionDetails = { A: null, B: null, C: null }; //store which object each finger is touching
        this.cylinderToFinger = { 'Cylinder': 'A', 'Cylinder003': 'B', 'Cylinder008': 'C' };
        

        this.makeCylindersInvisible();
    }

    makeCylindersInvisible() {
        this.cylinders.forEach(cylinder => {
            if (cylinder && cylinder.material) {
                cylinder.material.visible = false;
            }
        });
    }


    addGrabbableObject(body, name) {
        this.objects.push({
            body: body,
            mesh: body.mesh,
            name: name
        });
    }

    removeGrabbableObject(name) {
        this.objects = this.objects.filter(obj => obj.name !== name);
    } 


/* 
skips objects that are:
    - missing body/mesh
    - static (inverseMass === 0)
    - already held (body.isHeld)
    - ignoring claw collision (body.ignoreClawCollision)
   check Collisions: Tests each valid object against claw fingers
*/
    
    update() {
        // reset collision states
        Object.keys(this.collisions).forEach(k => {
            this.collisions[k] = false;
            this.collisionDetails[k] = null;
        });

        //check collisions with all grabbable objects
        this.objects.forEach(obj => {
            if (!obj.body || !obj.mesh || obj.body.inverseMass === 0 || obj.body.isHeld || obj.body.ignoreClawCollision) {
    return; //salta le collisioni con la claw 
}            
            this.checkCollisionsWithObject(obj);
        });
    }
    //andiamo a controllare se ci siano collisioni tra gli oggetti e i cilindri della claw
    /*
    tests each finger cylinder against the object uses intersectsGeometry method for precise collision detection
    */
    checkCollisionsWithObject(obj) {
        const objectMesh = obj.mesh;
        const objectBVH = objectMesh.geometry.boundsTree;
        
        if (!objectBVH) {
            return;
        }
        //update world matrices, since BVH relies on them
        objectMesh.updateMatrixWorld(true);


        this.cylinders.forEach(fingerMesh => {
            const fingerBVH = fingerMesh.geometry.boundsTree;
            if (!fingerBVH) {
                return;
            }
            
            fingerMesh.updateMatrixWorld(true);

            try {
                //use intersectsGeometry method to detect collisions
                const fingerToObject = new THREE.Matrix4();
                fingerToObject.copy(objectMesh.matrixWorld).invert().multiply(fingerMesh.matrixWorld);
                
                const intersection = objectBVH.intersectsGeometry(fingerMesh.geometry, fingerToObject);
                
                if (intersection) { //if an intersection is found, then we store the data
                    const fingerName = this.cylinderToFinger[fingerMesh.name];
                    if (fingerName) {
                        this.collisions[fingerName] = true;
                        this.collisionDetails[fingerName] = obj; //store which object is being touched
                    }

                    //calculate contact point and resolve collision
                    //depending on the contact point, we'll have a particular behavior
                    const contactInfo = this.calculateContactPoint(objectBVH, fingerMesh, objectMesh);
                    
                    if (contactInfo) {
                        this.resolveCollision(obj.body, contactInfo.contactPoint, contactInfo.normal, contactInfo.penetrationDepth);
                    }
                }
            } catch (error) {
            }
        });
    }

    /*

compute a robust contact between a claw finger and an object—direction, point, and depth—so you can apply realistic collision/force responses.



bounding boxes
ensure objectmesh.geometry.computeboundingbox() is available (same for the finger if needed) to get reliable centers.

world-space centers
boundingbox.getcenter(vec).applymatrix4(objectmesh.matrixworld) to obtain the object’s center in world coordinates (accounts for position/rotation/scale).

collision normal
normal = objectcenter.clone().sub(fingercenter).normalize() ,push direction from finger toward object.

precise contact point (bvh)
objectbvh.closestpointtopoint(objectlocalpoint, closestpoint) ,exact nearest point on the mesh surface (far more accurate than center-to-center; works for complex shapes).

penetration depth
penetrationdepth = math.max(0.005, fingerradius\*0.5 - actualdistance + 0.01) , how far the finger “sinks” in; clamped with a small minimum to avoid zero-force jitter.

outputs you use: the normal, the closest surface point, and the penetration depth—feed these into your force/impulse or constraint logic for stable, believable contact.
*/


    calculateContactPoint(objectBVH, fingerMesh, objectMesh) {
        // Ensure bounding boxes are computed
        if (!objectMesh.geometry.boundingBox) {
            objectMesh.geometry.computeBoundingBox();
        }
        if (!fingerMesh.geometry.boundingBox) {
            fingerMesh.geometry.computeBoundingBox();
        }

        // Get centers in world space of both finger and object
        const objectCenter = new THREE.Vector3();
        objectMesh.geometry.boundingBox.getCenter(objectCenter).applyMatrix4(objectMesh.matrixWorld);

        const fingerCenter = new THREE.Vector3();
        fingerMesh.geometry.boundingBox.getCenter(fingerCenter).applyMatrix4(fingerMesh.matrixWorld);

        // Calculate direction from finger to object, in order to get a proper response thanks to the physics
        const normal = objectCenter.clone().sub(fingerCenter);
        const distance = normal.length();
        normal.normalize();
        
        // Use BVH to find more accurate contact point
        let contactPoint = fingerCenter.clone().lerp(objectCenter, 0.6); // Bias toward object
        let penetrationDepth = 0.02;
        
        try {
            // Find closest point on object surface to finger center
            const objectLocalPoint = fingerCenter.clone();
            objectLocalPoint.applyMatrix4(objectMesh.matrixWorld.clone().invert());
            
            const closestPoint = new THREE.Vector3();
            objectBVH.closestPointToPoint(objectLocalPoint, closestPoint);
            closestPoint.applyMatrix4(objectMesh.matrixWorld);
            
            // Use the closest point as contact point
            contactPoint = closestPoint;
            
            // Calculate penetration based on finger radius and actual distance
            const fingerRadius = fingerMesh.geometry.boundingBox.max.x - fingerMesh.geometry.boundingBox.min.x;
            const actualDistance = fingerCenter.distanceTo(closestPoint);
            penetrationDepth = Math.max(0.005, fingerRadius * 0.5 - actualDistance + 0.01);
            
        } catch (error) {
            // Use geometric approach as fallback
            penetrationDepth = Math.max(0.005, 0.15 - distance);
        }
        
        return {
            contactPoint: contactPoint,
            normal: normal,
            penetrationDepth: penetrationDepth // we basically return this informations in order to get a more precise response
        };
    }




//THIS METHOD IS USEFUL NOW, BUT BEFORE IT WAS MORE USEFUL SINCE THE CLAW WAS ALLOWED TO MOVE 
//ALSO AT THE STARS LEVEL   

/*apply a spring–damper collision response so objects are pushed away from claw fingers with stable forces and realistic spin.

key inputs: objectbody (pos/vel/sleep), normal (unit, from finger → object), penetrationdepth, relativevelocity, contactpoint, constants springstiffness=20, damping=0.8.

main steps / methods:

wake the body objectbody.issleeping = false; objectbody.sleepytimer = 0;
ensures the object reacts immediately (no “stuck asleep” bodies).

spring (penalty) force -> penaltyforce = normal \* (penetrationdepth \* springstiffness)
deeper penetration ⇒ stronger push along the collision normal.

damping along the normal -> velocityalongnormal = relativevelocity · normal
dampingforce = -normal \* (damping \* velocityalongnormal)
opposes motion toward the finger, removing bounce/oscillation.

total force e torque ->totalforce = penaltyforce + dampingforce
r = contactpoint - objectbody.position
torque = r × totalforce
off-center pushes induce realistic rotation/tumbling.

applies force (push out) and torque (spin if off-center) for a firm, non-bouncy response that quickly settles.*/


    
    resolveCollision(objectBody, contactPoint, normal, penetrationDepth) {
        objectBody.isSleeping = false;
        objectBody.sleepyTimer = 0;

        // spring-damper system provides the  interaction.
        
        // 1 spring Force (penalty force): pushes the object out based on penetration depth.
        const springStiffness = 20; // increased stiffness for a firmer push
        const penaltyForceMagnitude = penetrationDepth * springStiffness;
        const penaltyForce = new Vec3().copy(normal).multiplyScalar(penaltyForceMagnitude);

        // 2 damping force:  velocity along the normal to prevent oscillation and bounciness
        const dampingFactor = 0.9; // a higher damping factor reduces bounciness
        const relativeVelocity = objectBody.linearVelocity; // finger's velocity is considered zero.
        const velocityAlongNormal = relativeVelocity.dot(normal);
        const dampingForceMagnitude = velocityAlongNormal * dampingFactor;
        const dampingForce = new Vec3().copy(normal).multiplyScalar(-dampingForceMagnitude);

        // combine forces, where we combine both damping and penalty/spring to produce the resulting force
        const totalForce = new Vec3().copy(penaltyForce).add(dampingForce);

        // spply force and the resulting torque for natural rotation
        const contactPointRelative = new Vec3().copy(contactPoint).sub(objectBody.position);
        const torque = new Vec3().crossVectors(contactPointRelative, totalForce);
        
        objectBody.force.add(totalForce);
        objectBody.torque.add(torque);
    }

    // Get all objects that are currently being touched
    getTouchedObjects() {
        const touchedObjects = new Set();
        Object.values(this.collisionDetails).forEach(obj => {
            if (obj) {
                touchedObjects.add(obj);
            }
        });
        return Array.from(touchedObjects);
    }

    // // Check if any objects are being touched
    // hasCollisions() {
    //     const result = this.collisions.A || this.collisions.B || this.collisions.C;
    //     if (result) {
    //     }
    //     return result;
    // }

    // Get which fingers are touching objects
    getCollidingFingers() {
        return Object.keys(this.collisions).filter(finger => this.collisions[finger]);
    }

    getGrabbableCandidate(fingerThreshold = 2) {
        const touchCounts = new Map();
        const touchedObjects = new Map();

        // Count how many named fingers are touching each object
        for (const finger in this.cylinderToFinger) {
            const fingerName = this.cylinderToFinger[finger]; // A, B, or C
            const object = this.collisionDetails[fingerName];
            
            if (object) {
                if (!touchCounts.has(object.name)) {
                    touchCounts.set(object.name, 0);
                    touchedObjects.set(object.name, object);
                }
                touchCounts.set(object.name, touchCounts.get(object.name) + 1);
            }
        }

        // Find the first object that meets the threshold
        for (const [name, count] of touchCounts) {
            if (count >= fingerThreshold) {
                return touchedObjects.get(name);
            }
        }

        return null; // No object is grabbable
    }
} 