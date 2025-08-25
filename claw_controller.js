import * as THREE from 'three';

export class ClawController {

 constructor(clawGroup, cylinders, clawBones, scene, objectsInteraction, physicsEngine, grabbableObjects, joystickPivot, button) {
        this.clawGroup = clawGroup;
        this.cylinders = cylinders;
        this.clawBones = clawBones;
        this.scene = scene;
        this.objectsInteraction = objectsInteraction;
        this.physicsEngine = physicsEngine;
        this.machineBox = null;
        this.chuteMesh = null;
        

        this.grabbableObjects = grabbableObjects; 
        
        // state Machine 
        this.automationState = 'MANUAL_HORIZONTAL';
        this.returnYPosition = 0;
        this.dropTargetY = 0;       
        
        this.moveState = { left:false, right:false, forward:false, backward:false };
        this.moveSpeed = 1.5;
        this.moveMargin = 0.2;
        this.stopStatus = { A: false, B: false, C: false };
        this.spawnPosition = new THREE.Vector3();     // Posizione iniziale della claw
        this.dropOffPosition = new THREE.Vector3();   

        //all claw machine states
        this.isAnimating = false;
        this.isClosed = false;
        this.isClosing = false;
        this.isGrabbing = false;
        this.grabbedObject = null;
        this.lastClawPosition = new THREE.Vector3();
        this.chuteBox = null;
        this.dropZoneThreshold = 0.3;
        this.dropZoneIndicator = null;
        this.deliveredStars =10;
        this.initialTransforms = {};
        this.releasingObjectStartTime = 0;


        this.joystickPivot = joystickPivot; //we insert a pivot in order to fix the rotation point of the joystick
        this.button = button;
        this.initialJoystickRotation = this.joystickPivot ? this.joystickPivot.rotation.clone() : null;
        this.initialButtonPosition = this.button ? this.button.position.clone() : null;
        this.joystickTiltTarget = new THREE.Euler();
        this.buttonPressTime = 0;
        this.buttonPressDuration = 250; // in ms
        this.joystickTiltAngle = 0.3;

        this.storeInitialTransforms();
    }

    

    setDependencies(machineBox, chuteMesh) {
        this.machineBox = machineBox;
        this.chuteMesh = chuteMesh;
        
//memorize the start position of the claw so that it will return to it
        if(this.spawnPosition.lengthSq() === 0) {
            this.spawnPosition.copy(this.clawGroup.position);
        }

        if (this.machineBox) {

            this.dropOffPosition.set(
                this.machineBox.max.x - this.moveMargin - 0.1,
                0, 
                this.machineBox.max.z - this.moveMargin - 0.1
            );
        }
        

        if (this.chuteMesh) {
            this.chuteMesh.updateWorldMatrix(true, false);
            this.chuteBox = new THREE.Box3().setFromObject(this.chuteMesh);
            this.createDropZoneIndicator();
        }
    }

    createDropZoneIndicator() {
        // placeholder
    }

    storeInitialTransforms() {
        const objectsToStore = [...Object.values(this.clawBones), ...this.cylinders];
        objectsToStore.forEach(obj => {
            if (obj) {
                this.initialTransforms[obj.name] = {
                    position: obj.position.clone(),
                    rotation: obj.rotation.clone(),
                    scale: obj.scale.clone()
                };
            }
        });
    }
//methods used to interact with the claw
    toggleClaw() {
        if (this.isAnimating) {
            return; 
        }

        if (this.isClosed) {
            this.openClaw();
        } else {
            this.closeClaw();
        }
    }



    // wait until all claw fingers have stopped moving
    waitUntilAllStopped(callback) {
        const checkInterval = setInterval(() => {
            if (this.stopStatus.A && this.stopStatus.B && this.stopStatus.C) {
                clearInterval(checkInterval);
                callback();
            }
        }, 50);
    }
    
    checkFingerCollisions() {
        const fingerToCylinder = { 'A': 'Cylinder', 'B': 'Cylinder003', 'C': 'Cylinder008' };
        const keys = ['A', 'B', 'C'];
        //very first method used to check for claw collisions. it uses cylinders that are checked in couple to detect collisions
        
        for (let i = 0; i < keys.length; i++) {
            for (let j = i + 1; j < keys.length; j++) {
                const f1 = keys[i];
                const f2 = keys[j];
    
                const c1 = this.clawGroup.getObjectByName(fingerToCylinder[f1]);
                const c2 = this.clawGroup.getObjectByName(fingerToCylinder[f2]);
    
                if (c1 && c2) {
                    //we basically get new bounding boxes for each cylinders
                    const box1 = new THREE.Box3().setFromObject(c1);
                    const box2 = new THREE.Box3().setFromObject(c2);
    
                    if (box1.intersectsBox(box2)) {
                        this.stopStatus[f1] = true;
                        this.stopStatus[f2] = true;
                    }
                }
            }
        }
    }

    spendStarAsCoin() {
    if (this.deliveredStars > 0) {
        this.deliveredStars--;
        return true;
    } else {
        return false;
    }
}

//function used in order to check which should be the correct drop height for the claw
calculateAndSetDropHeight() {
    const fallbackHeight = this.machineBox ? this.machineBox.min.y + 0.5 : 0;

    //if dont have any grabbable objcects, then we set the drop height to a fallback value, because we need a valid target
    if (!this.grabbableObjects || this.grabbableObjects.length === 0) {
        this.dropTargetY = fallbackHeight;
        return;
    }

    let highestY = -Infinity;
    this.grabbableObjects.forEach(objData => {

        if (objData && objData.body && objData.body.position && !objData.body.isHeld) {
            if (objData.body.position.y > highestY) {
                highestY = objData.body.position.y;
            }
        }
    });


    if (highestY === -Infinity) {
        this.dropTargetY = fallbackHeight;
        return;
    }

    const penetrationOffset = -0.15; //penetration value
    this.dropTargetY = highestY - penetrationOffset; //subtract the offset instead of adding it

    // final safety check: make sure the target is not below the machine's floor
    if (this.machineBox && this.dropTargetY < this.machineBox.min.y) {
        this.dropTargetY = this.machineBox.min.y + 0.1;
    }

}


startDropSequence() {

    if (this.chuteBox) {
        const clawPos = this.clawGroup.position;
        const chuteBounds = this.chuteBox;


        const clawBox = new THREE.Box3().setFromObject(this.clawGroup);
        const clawSize = new THREE.Vector3();
        clawBox.getSize(clawSize);

 
        const safeMarginX = clawSize.x ;
        const safeMarginZ = clawSize.z ;

//we block the claw descent if it intersects with the chute
        const isOverChute =
            clawPos.x >= (chuteBounds.min.x - safeMarginX) &&
            clawPos.x <= (chuteBounds.max.x + safeMarginX) &&
            clawPos.z >= (chuteBounds.min.z - safeMarginZ) &&
            clawPos.z <= (chuteBounds.max.z + safeMarginZ);

        if (isOverChute) {
            return; 
        }
    }



    if (this.automationState === 'MANUAL_HORIZONTAL' && !this.isAnimating) { //
        
        if (this.button) { //
            this.buttonPressTime = Date.now(); //
        }

        this.calculateAndSetDropHeight();  //
        this.isAnimating = true; //
        this.returnYPosition = this.clawGroup.position.y; //
        this.automationState = 'DESCENDING'; //
    }
}


async runCloseSequence() {
    this.automationState = 'OPERATING';

    await this.closeClaw(); 
    

    await new Promise(resolve => setTimeout(resolve, 300));


    this.automationState = 'ASCENDING';
}



async runReleaseAndReturnSequence() {
    this.automationState = 'RELEASING_OBJECT';


    // this is now the only place where the object's state transitions from "held" to "released"
    if (this.isGrabbing && this.grabbedObject) {
        this.deliveredStars++;

        const body = this.grabbedObject.body;
        
        // un-pin the object from the claw controller.
        body.isHeld = false;
        this.isGrabbing = false;
        this.grabbedObject = null;

        // activate the physics engine's "clean release" system.
        body.ignoreClawCollision = true;
        body.isBeingReleased = true;
        body.releaseStartTime = Date.now();

        // reset physics state for a clean vertical drop, so that the star is dropped directly downwards
        body.linearVelocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        body.force.set(0, 0, 0);
        body.torque.set(0, 0, 0);
        body.isSleeping = false;
        
    }

    
    await this.openClaw();
    await new Promise(resolve => setTimeout(resolve, 500)); 
    
    // the state transition to begin returning to the start position
    this.automationState = 'RETURNING_ASCEND';
}


closeClaw() {
    return new Promise(resolve => {
        this.isClosing = true;

        this.stopStatus = { A: false, B: false, C: false };

        const closeStep = 0.03;
        let rotationSteps = 0;
        const maxSteps = 60;

        const grabInterval = setInterval(() => {
            rotationSteps++;

            //we check for collisions and also we add the closing value 
            if (this.clawBones.A && !this.stopStatus.A) {
                this.clawBones.A.rotation.z -= closeStep;
            }
            if (this.clawBones.B && !this.stopStatus.B) {
                this.clawBones.B.rotation.z -= closeStep;
            }
            if (this.clawBones.C && !this.stopStatus.C) {
                this.clawBones.C.rotation.z -= closeStep;
            }
            
            this.cylinders.forEach(c => c.updateMatrixWorld(true));


            this.checkFingerCollisions();


            const allFingersCollided = this.stopStatus.A && this.stopStatus.B && this.stopStatus.C;

            if (rotationSteps >= maxSteps || allFingersCollided) {
                clearInterval(grabInterval);
                this.isClosed = true;
                this.isClosing = false;
                const reason = allFingersCollided ? "finger collision" : "timeout";
                resolve(); // La Promise è risolta
            }
        }, 50);
    });
}


openClaw() {
    return new Promise((resolve, reject) => {
        
        try {
            const openSteps = 30;
            let currentStep = 0;
        
            if (!this.clawBones.A || !this.clawBones.B || !this.clawBones.C) {
                reject(new Error('Missing claw bones'));
                return;
            }

            const startRotations = {
                A: this.clawBones.A.rotation.z,
                B: this.clawBones.B.rotation.z,
                C: this.clawBones.C.rotation.z
            };
            
            // check if initial transforms exist
            if (!this.initialTransforms[this.clawBones.A.name] || 
                !this.initialTransforms[this.clawBones.B.name] || 
                !this.initialTransforms[this.clawBones.C.name]) {

                reject(new Error('Missing initial transforms'));
                return;
            }

            const targetRotations = {
                A: this.initialTransforms[this.clawBones.A.name].rotation.z,
                B: this.initialTransforms[this.clawBones.B.name].rotation.z,
                C: this.initialTransforms[this.clawBones.C.name].rotation.z
            };
            //we basically go back to the initial position by reverting the rotation using lerp
        const openInterval = setInterval(() => {
            currentStep++;
            const progress = currentStep / openSteps;
    
            this.clawBones.A.rotation.z = THREE.MathUtils.lerp(startRotations.A, targetRotations.A, progress);
            this.clawBones.B.rotation.z = THREE.MathUtils.lerp(startRotations.B, targetRotations.B, progress);
            this.clawBones.C.rotation.z = THREE.MathUtils.lerp(startRotations.C, targetRotations.C, progress);
    
            if (currentStep >= openSteps) {
                clearInterval(openInterval);
                this.isClosed = false;
                resolve();
            }
        }, 30);
        
        } catch (error) {
            console.error('ClawController: Error in openClaw():', error);
            reject(error);
        }
    });
}


    applyDirectLink(deltaTime) {
        if (!this.isGrabbing || !this.grabbedObject) {
            return;
        }

        const objectBody = this.grabbedObject.body;
        objectBody.isSleeping = false;
        
        // --- Position ---
        // The target position is the center of the claw
        const targetPosition = new THREE.Vector3();
        this.clawGroup.getWorldPosition(targetPosition);
        targetPosition.y -= 0.15;

        // Directly set the object's position for a zero-lag connection
        objectBody.position.copy(targetPosition);

        // --- Velocity ---
        // Calculate the claw's current velocity based on its position change
        const clawVelocity = new THREE.Vector3()
            .copy(this.clawGroup.position)
            .sub(this.lastClawPosition)
            .divideScalar(deltaTime);

        // Directly set the object's velocity to match the claw's
        objectBody.linearVelocity.copy(clawVelocity);
        
        // Also, kill any rotation for stability
        objectBody.angularVelocity.set(0, 0, 0);
    }
    
    isInDropZone() {
        if (!this.chuteBox || !this.isGrabbing) {
            return false;
        }
        
        const clawPosition = this.clawGroup.position;
        
        // Check if claw is horizontally above the chute
        const isAboveChute = clawPosition.x >= this.chuteBox.min.x && 
                           clawPosition.x <= this.chuteBox.max.x &&
                           clawPosition.z >= this.chuteBox.min.z && 
                           clawPosition.z <= this.chuteBox.max.z;
        
        // Check if claw is within drop threshold above chute
        const isWithinDropHeight = clawPosition.y <= (this.chuteBox.max.y + this.dropZoneThreshold) &&
                                 clawPosition.y >= this.chuteBox.max.y;
        
        return isAboveChute && isWithinDropHeight;
    }
    
    triggerAutoDrop() {
        if (!this.isGrabbing || !this.grabbedObject) {
            return;
        }
        
        
        // Increment delivered counter
        this.deliveredStars++;
        
        // Release the object
        this.grabbedObject.body.isHeld = false;
        
        // Give it a slight downward velocity to ensure it falls into the chute
        this.grabbedObject.body.linearVelocity.set(0, -1, 0);
        this.grabbedObject.body.angularVelocity.set(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        );
        
        // Clear grab state
        this.isGrabbing = false;
        this.grabbedObject = null;
        
        // Automatically open the claw
        if (this.isClosed) {
            this.openClaw();
        }
    }

        // NUOVO: Metodo per animare il pulsante
    updateButtonAnimation() {
        if (!this.button || this.buttonPressTime === 0) return;

        const elapsed = Date.now() - this.buttonPressTime;
        const pressDepth = -0.05; // Quanto scende il pulsante

        if (elapsed < this.buttonPressDuration) {
            // Usa una curva sinusoidale per un movimento di andata e ritorno fluido
            const progress = Math.sin((elapsed / this.buttonPressDuration) * Math.PI);
            this.button.position.y = this.initialButtonPosition.y + progress * pressDepth;
        } else {
            // Resetta alla fine dell'animazione
            this.button.position.copy(this.initialButtonPosition);
            this.buttonPressTime = 0;
        }
    }

 updateJoystickTilt() {
        // MODIFICATO: Controlliamo e ruotiamo 'joystickPivot'
        if (!this.joystickPivot) return;
        
        let targetTiltX = 0;
        if (this.moveState.forward) {
            targetTiltX = -this.joystickTiltAngle;
        } else if (this.moveState.backward) {
            targetTiltX = this.joystickTiltAngle;
        }

        let targetTiltZ = 0;
        if (this.moveState.left) {
            targetTiltZ = this.joystickTiltAngle;
        } else if (this.moveState.right) {
            targetTiltZ = -this.joystickTiltAngle;
        }
        
        this.joystickTiltTarget.x = targetTiltX;
        this.joystickTiltTarget.z = targetTiltZ;

        // MODIFICATO: Applichiamo la rotazione al PIVOT
        this.joystickPivot.rotation.x = THREE.MathUtils.lerp(this.joystickPivot.rotation.x, this.joystickTiltTarget.x, 0.1);
        this.joystickPivot.rotation.z = THREE.MathUtils.lerp(this.joystickPivot.rotation.z, this.joystickTiltTarget.z, 0.1);
    }




    update(deltaTime) {
        // La logica prima dello switch non cambia
        this.lastClawPosition.copy(this.clawGroup.position);
        this.updateButtonAnimation();
        this.updateJoystickTilt();
        
        if (this.isClosing && !this.isGrabbing) {
            const potentialObject = this.objectsInteraction.getGrabbableCandidate(2);
            if (potentialObject) {
                // 🆕 SAFETY CHECK: Don't grab objects that are being released
                if (potentialObject.body.isBeingReleased) {
                    return;
                }
                
                this.isGrabbing = true;
                this.grabbedObject = potentialObject;
                this.grabbedObject.body.isHeld = true;
            }
        }
        if (this.isGrabbing) {
            this.applyDirectLink(deltaTime);
        }

        // --- VERSIONE COMPLETA E CORRETTA DELLO SWITCH ---
        switch (this.automationState) {

            case 'MANUAL_HORIZONTAL': {
                if (this.machineBox) {
                    const v = new THREE.Vector3();
                    if (this.moveState.left)      v.x -= 1;
                    if (this.moveState.right)     v.x += 1;
                    if (this.moveState.forward)   v.z -= 1;
                    if (this.moveState.backward)  v.z += 1;

                    if (v.lengthSq() > 0) {
                        v.normalize().multiplyScalar(this.moveSpeed * deltaTime);
                        this.clawGroup.position.add(v);
                    }
        
                    const minX = this.machineBox.min.x + this.moveMargin;
                    const maxX = this.machineBox.max.x - this.moveMargin;
                    const minZ = this.machineBox.min.z + this.moveMargin;
                    const maxZ = this.machineBox.max.z - this.moveMargin;
                    this.clawGroup.position.x = THREE.MathUtils.clamp(this.clawGroup.position.x, minX, maxX);
                    this.clawGroup.position.z = THREE.MathUtils.clamp(this.clawGroup.position.z, minZ, maxZ);
                }
                break;
            }

            case 'DESCENDING': {
                if (this.clawGroup.position.y > this.dropTargetY) {
                    this.clawGroup.position.y -= this.moveSpeed * deltaTime;
                } else {
                    this.clawGroup.position.y = this.dropTargetY;
                    this.runCloseSequence();
                }
                break;
            }

            case 'OPERATING': {
                // Stato di attesa, corretto che sia vuoto
                break;
            }

            case 'ASCENDING': {
                if (this.clawGroup.position.y < this.returnYPosition) {
                    this.clawGroup.position.y += this.moveSpeed * deltaTime;
                } else {
                    this.clawGroup.position.y = this.returnYPosition;
    
                    if (this.isGrabbing && this.grabbedObject) {
                        this.automationState = 'DELIVERING_MOVE_X';
                    } else {
                        this.automationState = 'RELEASING_OBJECT';
                        this.releasingObjectStartTime = Date.now();
                        this.openClaw().then(() => {
                            this.automationState = 'MANUAL_HORIZONTAL';
                            this.isAnimating = false;
                        }).catch(() => {
                            // Fallback in case openClaw() fails
                            this.automationState = 'MANUAL_HORIZONTAL';
                            this.isAnimating = false;
                        });
                    }
                }
                break;
            }

            case 'DELIVERING_MOVE_X': {
                const targetX = this.dropOffPosition.x;
                const currentX = this.clawGroup.position.x;
                this.clawGroup.position.x = THREE.MathUtils.lerp(currentX, targetX, 0.05);
                if (Math.abs(currentX - targetX) < 0.01) {
                    this.clawGroup.position.x = targetX;
                    this.automationState = 'DELIVERING_MOVE_Z';
                }
                break;
            }

            case 'DELIVERING_MOVE_Z': {
                const targetZ = this.dropOffPosition.z;
                const currentZ = this.clawGroup.position.z;
                this.clawGroup.position.z = THREE.MathUtils.lerp(currentZ, targetZ, 0.05);
                if (Math.abs(currentZ - targetZ) < 0.01) {
                    this.clawGroup.position.z = targetZ;
                    this.automationState = 'DELIVERING_DESCEND';
                }
                break;
            }

            case 'DELIVERING_DESCEND': {
                const descendTargetY = this.returnYPosition - 0.5;
                if (this.clawGroup.position.y > descendTargetY) {
                    this.clawGroup.position.y -= this.moveSpeed * deltaTime;
                } else {
                    this.runReleaseAndReturnSequence();
                }
                break;
            }
                
            case 'RELEASING_OBJECT': {
                // Safety timeout in case the openClaw() promise doesn't resolve
                if (Date.now() - this.releasingObjectStartTime > 3000) {
                    console.warn('RELEASING_OBJECT timeout - forcing reset to MANUAL_HORIZONTAL');
                    this.automationState = 'MANUAL_HORIZONTAL';
                    this.isAnimating = false;
                }
                break;
            }

            case 'RETURNING_ASCEND': {
                if (this.clawGroup.position.y < this.returnYPosition) {
                    this.clawGroup.position.y += this.moveSpeed * deltaTime;
                } else {
                    this.clawGroup.position.y = this.returnYPosition;
                    this.automationState = 'RETURNING_MOVE_Z';
                }
                break;
            }

            case 'RETURNING_MOVE_Z': {
                const spawnZ = this.spawnPosition.z;
                const currentZ = this.clawGroup.position.z;
                this.clawGroup.position.z = THREE.MathUtils.lerp(currentZ, spawnZ, 0.05);
                if (Math.abs(currentZ - spawnZ) < 0.01) {
                    this.clawGroup.position.z = spawnZ;
                    this.automationState = 'RETURNING_MOVE_X';
                }
                break;
            }

            case 'RETURNING_MOVE_X': {
                const spawnX = this.spawnPosition.x;
                const currentX = this.clawGroup.position.x;
                this.clawGroup.position.x = THREE.MathUtils.lerp(currentX, spawnX, 0.05);
                if (Math.abs(currentX - spawnX) < 0.01) {
                    this.clawGroup.position.copy(this.spawnPosition);
                    this.automationState = 'MANUAL_HORIZONTAL';
                    this.isAnimating = false;
                }
                break;
            }
        }
        
        if (this.cylinders) {
            this.cylinders.forEach(cyl => cyl.updateMatrixWorld(true));
        }
    } 
        
    
    checkClawCollision(velocity) {
        if (!this.chuteMesh) return false;
    
        const chuteBVH = this.chuteMesh.geometry.boundsTree;
        const clawBBox = new THREE.Box3();
        let collisionDetected = false;
    
        // This matrix transforms points from world space to the chute's local space
        const worldToChuteMatrix = new THREE.Matrix4().copy(this.chuteMesh.matrixWorld).invert();
    
        // Test each axis of movement independently
        ['x', 'y', 'z'].forEach(axis => {
            if (velocity[axis] === 0) return;
    
            // Get the claw's bounding box in its potential new position
            clawBBox.setFromObject(this.clawGroup);
            const moveVector = new THREE.Vector3();
            moveVector[axis] = velocity[axis];
            clawBBox.translate(moveVector);
    
            // Check for collision
            if (chuteBVH.intersectsBox(clawBBox, worldToChuteMatrix)) {
                // If a collision would occur, nullify the movement on this axis
                velocity[axis] = 0;
                collisionDetected = true;
            }
        });
    
        // Apply the corrected velocity vector (some components might be zero)
        this.clawGroup.position.add(velocity);
    
        // Return true if any collision was detected and prevented
        return collisionDetected;
    }

    setMoving(direction, state) {
        this.moveState[direction] = state;
    }
    
    getDeliveredStars() {
        return this.deliveredStars;
    }
    
    resetScore() {
        this.deliveredStars = 0;
    }
} 

/*

# Big picture

* Controls a claw crane head inside a bounded machine volume.
* Two layers:

  1. **Manual movement** on X/Z within `machineBox`; drop sequence on button.
  2. **Automations** (descend → close → lift → deliver/release → return).
* Integrates with external systems:

  * `objectsInteraction` for finding a nearby grabbable during closing,
  * physics-like bodies on objects (`isHeld`, velocities, flags),
  * optional **BVH** on the chute for precise collision checks.

# Key inputs & deps

* Constructor gets: `clawGroup` (transform root), finger **bones** `{A,B,C}`, finger **cylinders** (collision between fingers), `scene`, `objectsInteraction`, `physicsEngine` (ref), `grabbableObjects`, and UI meshes (`joystickPivot`, `button`).
* `setDependencies(machineBox, chuteMesh)`:

  * Stores machine bounds (`Box3`), first `spawnPosition`, computes `dropOffPosition` (corner), builds `chuteBox` (and uses `geometry.boundsTree` if present).

# State machine (high level)

`MANUAL_HORIZONTAL → DESCENDING → OPERATING → ASCENDING → (deliver or release) → RETURNING_* → MANUAL_HORIZONTAL`

* **MANUAL\_HORIZONTAL**: free X/Z move (clamped to `machineBox` with `moveMargin`).
* **DESCENDING**: go to `dropTargetY` (computed above the highest unheld object; clamped off the floor).
* **OPERATING**: wait for fingers to finish closing (async).
* **ASCENDING**: rise to `returnYPosition`. If holding → **DELIVERING\_MOVE\_X/Z** then **DELIVERING\_DESCEND**; else → **RELEASING\_OBJECT**.
* **DELIVERING\_\*:** move to `dropOffPosition` (X then Z), short descend, then release.
* **RELEASING\_OBJECT:** open, clean release, safety timeout.
* **RETURNING\_ASCEND/MOVE\_Z/MOVE\_X:** go back to `spawnPosition`.

# Grabbing & releasing

* **Close** (`closeClaw()`): every 50 ms rotate each finger (`rotation.z -= 0.03`) unless that finger has collided; stop when all three report contact or timeout. Sets `isClosed`.
* **Grab hook** (during close): query `objectsInteraction.getGrabbableCandidate(2)`; if found and not `isBeingReleased`, mark `isGrabbing=true`, `isHeld=true`.
* **Rigid link** while held (`applyDirectLink(dt)`): snap object below claw, copy claw linear velocity, zero angular.
* **Release** (`runReleaseAndReturnSequence()` / `triggerAutoDrop()`):

  * Clear hold flags, increment `deliveredStars`, mark body for clean release (`ignoreClawCollision`, `isBeingReleased`, `releaseStartTime`), zero velocities/forces, open if needed.

# Safety & collision

* **Finger-finger**: AABB checks between finger cylinders; per-finger stop flags prevent interpenetration.
* **Chute safety**:

  * `startDropSequence()` blocks descent if claw’s AABB overlaps (or too near) `chuteBox`.
  * `checkClawCollision(velocity)`: predictive AABB sweep per axis; transforms to chute local and queries **BVH** (`geometry.boundsTree`). Zeros offending velocity components.
* **Drop zone check** (`isInDropZone()`): requires horizontal overlap with `chuteBox` and claw height within a small threshold above it → enables immediate auto-drop.

# Per-frame `update(dt)`

1. Cache last position; update **button** bounce (press-timed) and **joystick** tilt (lerped from `moveState`).
2. If `isClosing` and not already grabbing, try to grab via `objectsInteraction`.
3. If holding, apply rigid link.
4. Run the **state machine** (movement, interpolations, async steps).
5. Refresh transforms on finger cylinders.

# Public API (practical)

* **Setup:**
  `setDependencies(machineBox, chuteMesh)` → bounds & chute;
  `storeInitialTransforms()` → capture base finger poses.
* **Control:**
  `setMoving(dir, bool)` for input; `startDropSequence()` to begin a grab attempt; `toggleClaw()`, `resetClawState()`.
* **Animation helpers:**
  `openClaw()` / `closeClaw()` return Promises; button/joystick visuals auto-update in `update`.
* **Scoring:**
  `getDeliveredStars()`, `resetScore()`, `spendStarAsCoin()`.
* **Debug/inspect:**
  `getDebugState()`.
* **Collision utility:**
  `checkClawCollision(velocity)` (needs `chuteMesh.geometry.boundsTree`).

# Typical usage (minimal)

```js
controller.setDependencies(machineBox, chuteMesh);
controller.storeInitialTransforms();

// game loop
controller.update(dt);

// input
controller.setMoving('left', keyLeftDown);
controller.setMoving('forward', keyUpDown);

// on drop button
controller.startDropSequence();
```

# Notes & gotchas

* Closing/opening are **async**; higher-level flows await them.
* Grab occurs during the **closing window** only.
* Descent is **blocked near the chute**; delivering uses a fixed corner path then releases.
* BVH chute collisions require preprocessing (e.g., `geometry.computeBoundsTree()` in three-mesh-bvh).

*/