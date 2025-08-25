import * as THREE from 'three';
import { Vec3 } from './physics_engine_vec3.js';

export class GrabbableObjectsInteraction {
    constructor(cylinders) {
        this.cylinders = cylinders;
        this.objects = []; //array of {body, mesh, name} objects
        this.collisions = { A: false, B: false, C: false };
        this.collisionDetails = { A: null, B: null, C: null }; //store which object each finger is touching
        this.cylinderToFinger = { 'Cylinder': 'A', 'Cylinder003': 'B', 'Cylinder008': 'C' };
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

    update() {
        // Reset collision states
        Object.keys(this.collisions).forEach(k => {
            this.collisions[k] = false;
            this.collisionDetails[k] = null;
        });

        //check collisions with all grabbable objects
        this.objects.forEach(obj => {
            if (!obj.body || !obj.mesh || obj.body.inverseMass === 0 || obj.body.isHeld || obj.body.ignoreClawCollision) {
    return; // Salta le collisioni con la claw se richiesto
}

            
            this.checkCollisionsWithObject(obj);
        });
    }
    //andiamo a controllare se ci siano collisioni tra gli oggetti e i cilindri della claw
    checkCollisionsWithObject(obj) {
        const objectMesh = obj.mesh;
        const objectBVH = objectMesh.geometry.boundsTree;
        
        if (!objectBVH) {
            return;
        }
        
        objectMesh.updateMatrixWorld(true);

        this.cylinders.forEach(fingerMesh => {
            const fingerBVH = fingerMesh.geometry.boundsTree;
            if (!fingerBVH) {
                return;
            }
            
            fingerMesh.updateMatrixWorld(true);

            try {
                // Use intersectsGeometry method
                const fingerToObject = new THREE.Matrix4();
                fingerToObject.copy(objectMesh.matrixWorld).invert().multiply(fingerMesh.matrixWorld);
                
                const intersection = objectBVH.intersectsGeometry(fingerMesh.geometry, fingerToObject);
                
                if (intersection) {
                    const fingerName = this.cylinderToFinger[fingerMesh.name];
                    if (fingerName) {
                        this.collisions[fingerName] = true;
                        this.collisionDetails[fingerName] = obj; // Store which object is being touched
                    }

                    // Calculate contact point and resolve collision
                    const contactInfo = this.calculateContactPoint(objectBVH, fingerMesh, objectMesh);
                    
                    if (contactInfo) {
                        this.resolveCollision(obj.body, contactInfo.contactPoint, contactInfo.normal, contactInfo.penetrationDepth);
                    }
                }
            } catch (error) {
            }
        });
    }

    calculateContactPoint(objectBVH, fingerMesh, objectMesh) {
        // Ensure bounding boxes are computed
        if (!objectMesh.geometry.boundingBox) {
            objectMesh.geometry.computeBoundingBox();
        }
        if (!fingerMesh.geometry.boundingBox) {
            fingerMesh.geometry.computeBoundingBox();
        }

        // Get centers in world space
        const objectCenter = new THREE.Vector3();
        objectMesh.geometry.boundingBox.getCenter(objectCenter).applyMatrix4(objectMesh.matrixWorld);

        const fingerCenter = new THREE.Vector3();
        fingerMesh.geometry.boundingBox.getCenter(fingerCenter).applyMatrix4(fingerMesh.matrixWorld);

        // Calculate direction from finger to object
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
            penetrationDepth: penetrationDepth
        };
    }

    resolveCollision(objectBody, contactPoint, normal, penetrationDepth) {
        objectBody.isSleeping = false;
        objectBody.sleepyTimer = 0;

        // A spring-damper system provides a stable and realistic interaction.
        
        // 1. Spring Force (Penalty Force): Pushes the object out based on penetration depth.
        const springStiffness = 20; // Increased stiffness for a firmer push.
        const penaltyForceMagnitude = penetrationDepth * springStiffness;
        const penaltyForce = new Vec3().copy(normal).multiplyScalar(penaltyForceMagnitude);

        // 2. Damping Force: Resists velocity along the normal to prevent oscillation and bounciness.
        const dampingFactor = 0.8; // A higher damping factor reduces bounciness.
        const relativeVelocity = objectBody.linearVelocity; // Finger's velocity is considered zero.
        const velocityAlongNormal = relativeVelocity.dot(normal);
        const dampingForceMagnitude = velocityAlongNormal * dampingFactor;
        const dampingForce = new Vec3().copy(normal).multiplyScalar(-dampingForceMagnitude);

        // Combine forces
        const totalForce = new Vec3().copy(penaltyForce).add(dampingForce);

        // Apply force and the resulting torque for natural rotation
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

    // Check if any objects are being touched
    hasCollisions() {
        const result = this.collisions.A || this.collisions.B || this.collisions.C;
        if (result) {
        }
        return result;
    }

    // Get which fingers are touching objects
    getCollidingFingers() {
        return Object.keys(this.collisions).filter(finger => this.collisions[finger]);
    }

    getGrabbableCandidate(fingerThreshold = 2) {
        const touchCounts = new Map();
        const touchedObjects = new Map();

        // Count how many *named* fingers are touching each object
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