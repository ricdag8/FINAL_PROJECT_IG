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

        // Cable system
        this.cable = null;
        this.cableTopPosition = new THREE.Vector3();
        this.cableSegments = 20;

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

        //we compute then the drop-off position
        if (this.machineBox) {

            this.dropOffPosition.set(
                this.machineBox.max.x - this.moveMargin - 0.1,
                0, 
                this.machineBox.max.z - this.moveMargin - 0.1
            );
        }

        //create a chute box in order to detect when objects fall into the chute
        if (this.chuteMesh) {
            this.chuteMesh.updateWorldMatrix(true, false);
            this.chuteBox = new THREE.Box3().setFromObject(this.chuteMesh);
            this.createDropZoneIndicator();
            
            // Set up chute safety zone in physics engine to prevent objects from falling into chute
            const chuteCenter = new THREE.Vector3();
            this.chuteBox.getCenter(chuteCenter);
            const chuteSize = new THREE.Vector3();
            this.chuteBox.getSize(chuteSize);
            
           
            // Use a smaller, more precise safety radius to avoid interfering with claw operation, so that claw does not interfer with the chute
            const safetyRadius = Math.max(chuteSize.x, chuteSize.z) * 0.4; // 40% of the larger dimension
            this.physicsEngine.setChuteSafetyZone(chuteCenter, safetyRadius);
        }
        
        // initialize cable after spawn position is set
        this.createCable();
    }

    createDropZoneIndicator() {
        // placeholder
    }

    createCable() {
        // Only create cable if spawn position is set
        if (this.spawnPosition.lengthSq() === 0) {

            return;
        }
        
        // set cable top position - inside machine near the ceiling
        this.cableTopPosition.copy(this.spawnPosition);
        if (this.machineBox) {
            this.cableTopPosition.y = this.machineBox.max.y ; // just inside the machine ceiling
        } 
        
        // create initial cable points - straight vertical line
        const points = [];
        const clawPosition = this.clawGroup.position;
        
        // cable extends/retracts based on claw height - only as long as needed
        const cableLength = this.cableTopPosition.y - clawPosition.y;
        const segmentsToUse = Math.max(2, Math.floor(this.cableSegments * (cableLength / 4.0))); // dynamic segments
        
        for (let i = 0; i <= segmentsToUse; i++) {
            const t = i / segmentsToUse;
            // straight vertical line
            // we basically build a line between the top position and the claw position
            const point = new THREE.Vector3().lerpVectors(this.cableTopPosition, clawPosition, t);
            points.push(point);
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        // create cable material - dark steel cable color
        const material = new THREE.LineBasicMaterial({ 
            color: 0x404040,  // Dark steel gray
            linewidth: 7
        });
        
        // create cable mesh
        this.cable = new THREE.Line(geometry, material);
        this.scene.add(this.cable);
        

    }

    //si prende la distanza verticale attuale, si decide quanti segmenti servono (più è lungo, più segmenti), 
    // si generano punti equispaziati tra “soffitto” e claw usando l’interpolazione 
    // lineare (lerpVectors), e questi punti diventano la geometria della linea (il cavo).

    updateCable() {
        // create cable if it doesn't exist and spawn position is now available
        if (!this.cable && this.spawnPosition.lengthSq() > 0) {
            this.createCable();
        }
        
        if (!this.cable) return;
        
        //gGet current claw position
        const clawPosition = this.clawGroup.position.clone();
        
        // update cable top position to follow claw horizontally but stay at machine ceiling
        this.cableTopPosition.x = clawPosition.x;
        this.cableTopPosition.z = clawPosition.z;
        
        // calculate actual cable length needed (distance from ceiling to claw)
        const cableLength = this.cableTopPosition.y - clawPosition.y;
        
        // !!!!!!!!!!!!!!!!!!only show cable if it needs to extend (claw is below ceiling)
        if (cableLength <= 0) {
            // hide cable when claw is at or above ceiling
            this.cable.visible = false;
            return;
        }
        
        this.cable.visible = true;
        
        // calculate number of segments based on cable length (more segments for longer cables)
        const segmentsNeeded = Math.max(2, Math.min(this.cableSegments, Math.floor(cableLength * 5)));
        
        // create cable points - straight vertical line from ceiling to claw
        const points = [];
        for (let i = 0; i <= segmentsNeeded; i++) {
            const t = i / segmentsNeeded;
            /*
            Top = (0, 10, 0), Claw = (0, 6, 0), segments = 4
            t = 0, 0.25, 0.5, 0.75, 1 → y = 10, 9, 8, 7, 6
            */
            const point = new THREE.Vector3().lerpVectors(this.cableTopPosition, clawPosition, t);
            points.push(point);
        }
        
        // update cable geometry with new points
        this.cable.geometry.setFromPoints(points);
        this.cable.geometry.attributes.position.needsUpdate = true;
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

// calculates a safe drop target y for the claw by scanning unheld grabbable objects and clamping above the floor.

calculateAndSetDropHeight() {
    const fallbackHeight = this.machineBox ? this.machineBox.min.y + 0.5 : 0;

    //if we dont have any grabbable objcects, then we set the drop height to a fallback value, because we need a valid target
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

    // apply a small penetration offset to ensure the claw goes slightly below the object's top
    const penetrationOffset = 0.15; // FIXED: Changed to positive to go ABOVE the object
    this.dropTargetY = highestY + penetrationOffset; // FIXED: Add offset to go above the object

    // final safety check: make sure the target is not below the machine's floor
    if (this.machineBox && this.dropTargetY < this.machineBox.min.y) {
        this.dropTargetY = this.machineBox.min.y + 0.1;

    }

    // MOST IMPORTANT FIX: Ensure we always drop DOWN from current position
    // The drop target should always be BELOW the current claw position
    if (this.dropTargetY >= this.clawGroup.position.y) {
        this.dropTargetY = fallbackHeight;

    }

}

// before starting a drop, blocks the descent if the claw is horizontally over the chute (with a safety margin).
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

    //when in drop sequence, we basically start the automation progress, and at every update call we let the machine state advance


    if (this.automationState === 'MANUAL_HORIZONTAL' && !this.isAnimating) { //

        
        if (this.button) { //
            this.buttonPressTime = Date.now(); //
        }
        //we save our current position along the y, we pass to the next state descending after we've started the drop animation

        this.calculateAndSetDropHeight();  //
        this.isAnimating = true; //
        this.returnYPosition = this.clawGroup.position.y; //
        this.automationState = 'DESCENDING'; //
    } else {

    }
}


async runCloseSequence() {

    this.automationState = 'OPERATING';
//this new state is operating, and we need to close the claw

    await this.closeClaw(); 
//we have to wait for the claw to close before proceeding, also setting a small timer before proceeding

    await new Promise(resolve => setTimeout(resolve, 300));


    this.automationState = 'ASCENDING';
}


async runReleaseAndReturnSequence() {
    this.automationState = 'RELEASING_OBJECT';


    //this is now the only place where the object's state transitions from "held" to "released"
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

    //we then open the claw
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

            //we continue rotating fingers until they stop
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

            // check for collisions if we don't collect anything
            this.checkFingerCollisions();

            // if all fingers have collided, or we've reached max steps, we stop
            //so basically either ways we are going to stop
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
            // we store the starting rotations, in fact these are the ones we want to go back to
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
            //we basically go back to the initial position by reverting the rotation using lerp, thus interpolating up to the initial value
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

            reject(error);
        }
    });
}

    //now we set a direct link between the claw and the grabbed object, so that it follows the claw without lag
    // i had problems in implementing this, so i had to basically fix it also to get deliver something inside the chute
    applyDirectLink(deltaTime) {
        if (!this.isGrabbing || !this.grabbedObject) {
            return;
        }

        const objectBody = this.grabbedObject.body;
        objectBody.isSleeping = false;
        

        // the target position is the center of the claw
        const targetPosition = new THREE.Vector3();
        this.clawGroup.getWorldPosition(targetPosition);
        targetPosition.y -= 0.15;

        // directly set the object's position for a zero-lag connection
        objectBody.position.copy(targetPosition);


        //calculate the claw's current velocity based on its position change
        const clawVelocity = new THREE.Vector3()
            .copy(this.clawGroup.position)
            .sub(this.lastClawPosition)
            .divideScalar(deltaTime);

        //directly set the object's velocity to match the claw's, so that it will follow the claw
        objectBody.linearVelocity.copy(clawVelocity);
        
        //also, kill any rotation for stability
        objectBody.angularVelocity.set(0, 0, 0);
    }
    
    isInDropZone() {
        if (!this.chuteBox || !this.isGrabbing) {
            return false;
        }
        
        const clawPosition = this.clawGroup.position;
        
        //check if claw is horizontally above the chute
        const isAboveChute = clawPosition.x >= this.chuteBox.min.x && 
                           clawPosition.x <= this.chuteBox.max.x &&
                           clawPosition.z >= this.chuteBox.min.z && 
                           clawPosition.z <= this.chuteBox.max.z;
        
        //check if claw is within drop threshold above chute
        const isWithinDropHeight = clawPosition.y <= (this.chuteBox.max.y + this.dropZoneThreshold) &&
                                 clawPosition.y >= this.chuteBox.max.y;
        
        return isAboveChute && isWithinDropHeight;
    }
    
    triggerAutoDrop() {
        if (!this.isGrabbing || !this.grabbedObject) {
            return;
        }
        
        
        //increment delivered counter
        this.deliveredStars++;
        
        //release the object
        this.grabbedObject.body.isHeld = false;
        
        //give it a slight downward velocity to ensure it falls into the chute
        this.grabbedObject.body.linearVelocity.set(0, -1, 0);
        this.grabbedObject.body.angularVelocity.set(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        );
        
        //clear grab state
        this.isGrabbing = false;
        this.grabbedObject = null;
        
        //automatically open the claw
        if (this.isClosed) {
            this.openClaw();
        }
    }


    updateButtonAnimation() {
        if (!this.button || this.buttonPressTime === 0) return;

        const elapsed = Date.now() - this.buttonPressTime;
        const pressDepth = -0.02; ////quanto scende il pulsante

        if (elapsed < this.buttonPressDuration) {
            //use a sinusoidal curve for smooth in-out movement, so that the button
            //goes up and down in a singular movement without stopping
            const progress = Math.sin((elapsed / this.buttonPressDuration) * Math.PI);
            this.button.position.y = this.initialButtonPosition.y + progress * pressDepth;
        } else {
            // go back to initial position
            this.button.position.copy(this.initialButtonPosition);
            this.buttonPressTime = 0;
        }
    }

 updateJoystickTilt() {

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

        // move the pivoy
        this.joystickPivot.rotation.x = THREE.MathUtils.lerp(this.joystickPivot.rotation.x, this.joystickTiltTarget.x, 0.1); //we also add a smoothing factor in order to have a better result
        this.joystickPivot.rotation.z = THREE.MathUtils.lerp(this.joystickPivot.rotation.z, this.joystickTiltTarget.z, 0.1);
    }




    update(deltaTime) {

        this.lastClawPosition.copy(this.clawGroup.position);
        this.updateButtonAnimation();
        this.updateJoystickTilt();
        this.updateCable();
        
        if (this.isClosing && !this.isGrabbing) {
            const potentialObject = this.objectsInteraction.getGrabbableCandidate(2); //so if at least 2 fingers are touching the object, we grab it
            if (potentialObject) {
                // don't grab objects that are being released
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
//the job is done by the closeClaw function
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

                        // Immediately reset state for unsuccessful grabs to prevent getting stuck
                        this.automationState = 'MANUAL_HORIZONTAL';
                        this.isAnimating = false;
                        this.isClosed = false;
                        this.isClosing = false;
                        this.isGrabbing = false;
                        this.grabbedObject = null;

                        
                        // Open claw asynchronously without blocking state reset
                        this.openClaw().then(() => {

                        }).catch((error) => {

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
                    // ensure clean state after return
                    this.isClosed = false;
                    this.isClosing = false;
                    this.isGrabbing = false;
                    this.grabbedObject = null;
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
    
        // this matrix transforms points from world space to the chute's local space
        const worldToChuteMatrix = new THREE.Matrix4().copy(this.chuteMesh.matrixWorld).invert();
    
        // test each axis of movement independently
        ['x', 'y', 'z'].forEach(axis => {
            if (velocity[axis] === 0) return;
    
            // get the claw's bounding box in its potential new position
            clawBBox.setFromObject(this.clawGroup);
            const moveVector = new THREE.Vector3();
            moveVector[axis] = velocity[axis];
            clawBBox.translate(moveVector);
    
            // check for collision
            if (chuteBVH.intersectsBox(clawBBox, worldToChuteMatrix)) {
                // if a collision would occur, nullify the movement on this axis
                velocity[axis] = 0;
                collisionDetected = true;
            }
        });
    
        // apply the corrected velocity vector (some components might be zero)
        this.clawGroup.position.add(velocity);
    
        // return true if any collision was detected and prevented
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
