import * as THREE from 'three';

/**
 * third Person Camera System
 * follows a target (player) from behind based on their rotation.
 */
export class ThirdPersonCamera {
    // initializes third person camera system that follows a target player from behind
    // sets up camera distance (4.0), height (4.0), and animation state for smooth transitions
    constructor(camera, target) {
        this.camera = camera;
        this.target = target; //the target is the player

        // camera settings
        this.distance = 4.0;
        this.height = 4.0;
        
        this.isAnimatingView = false;
        this.animationProgress = 0;
        this.animationDuration = 1.0;
        this.onAnimationComplete = null;
        this.startOffset = new THREE.Vector3();
        this.endOffset = new THREE.Vector3();
        
    }
    
    // updates camera position every frame to follow the player from behind
    // handles view animations, greeting freeze, and maintains proper camera distance and height
    update(deltaTime) { //the update method is needed in order to keep the camera behind the player every time it rotates or moves
        if (!this.target) return;

        const playerPos = this.target.getPosition(); // at every update we get the position of the player in order for the camera to follow it
        if (this.isAnimatingView) { // if the camera is animating, we interpolate the current position and the desired one, ideally we want the camera to look at a specific location 
            this.animationProgress += deltaTime / this.animationDuration;
            const t = this.easeInOutCubic(this.animationProgress);

            const currentOffset = new THREE.Vector3().lerpVectors(this.startOffset, this.endOffset, t);
            const idealPosition = playerPos.clone().add(currentOffset);
            
            this.camera.position.copy(idealPosition);

            const idealLookAt = playerPos.clone();
            idealLookAt.y += 2.5; // look at the character's face
            this.camera.lookAt(idealLookAt);

            if (this.animationProgress >= 1.0) {
                this.isAnimatingView = false;
                if (this.onAnimationComplete) {
                    this.onAnimationComplete();
                    this.onAnimationComplete = null;
                }
            }
            return;
        }

        // if the player is greeting, hold the camera's position
        if (this.target.isGreeting) {
            return;
        }
        // if the player is moving forward, then use the normal camera
        const playerForward = this.target.getForwardDirection();
        
        // calculate ideal camera position (behind player relative to player's rotation)
        //when rotating, we compute the ideal position of the camera based on the player's forward direction
        const idealPosition = playerPos.clone();
        //we basically compute the difference between the current camera position and the ideal one, namely the one it is currently facing
        const cameraOffset = playerForward.clone().multiplyScalar(-this.distance);
        idealPosition.add(cameraOffset);
        idealPosition.y += this.height;
        
        // calculate ideal look-at point (slightly above player)
        const idealLookAt = playerPos.clone();
        idealLookAt.y += 2.5;
        
        // apply position and look-at directly for a fixed camera without interpolation
        this.camera.position.copy(idealPosition);
        this.camera.lookAt(idealLookAt);


        /*  animation Priority: camera animations override normal following
greeting freeze: camera stays still while player greets NPCs/objects
directional following: camera always stays behind player relative to their rotation
instant response: no smoothing - camera moves immediately with player
*/
    }

    // animates camera from behind player to in front for object interaction
    // smoothly transitions to face direction player is looking with specified duration
    animateToObjectView(duration) { //function needed to animate the camera to a specific object, namely the candy machine and claw machine
        return new Promise(resolve => {
            if (this.isAnimatingView || !this.target) {
                resolve();
                return;
            }

            this.isAnimatingView = true;
            this.animationDuration = duration;
            this.animationProgress = 0;
            this.onAnimationComplete = resolve;

            const playerPos = this.target.getPosition();
            const playerForward = this.target.getForwardDirection();
            
            this.startOffset.copy(this.camera.position).sub(playerPos);
            this.endOffset.copy(playerForward.clone().multiplyScalar(this.distance)).setY(this.height);
        });
    }

    //returns camera from object view back to standard behind-player position and it creates smooth transition animation with easing for natural movement
    animateToOriginalView(duration) {
        //Promise is used to make camera animations asynchronous and thus allowing the calling code to wait for the animation to complete before proceeding the rest of the code
        return new Promise(resolve => {
            if (this.isAnimatingView || !this.target) {
                resolve();
                return;
            }
            
            this.isAnimatingView = true;
            this.animationDuration = duration;
            this.animationProgress = 0;
            this.onAnimationComplete = resolve;
            
            const playerPos = this.target.getPosition();
            const playerForward = this.target.getForwardDirection();

            this.startOffset.copy(this.camera.position).sub(playerPos);
            this.endOffset.copy(playerForward.clone().multiplyScalar(-this.distance)).setY(this.height);
        });
    }

    // basically provides smooth s-curve easing for camera animations and it starts slow, accelerates in middle, decelerates at end for natural feel. this is the function that does all the work
    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    /* 
    easeInOutCubic(t) {
      return t < 0.5
          ? 4 * t * t * t                    // first half: slow start, accelerating
          : 1 - Math.pow(-2 * t + 2, 3) / 2; // second half: decelerating, slow end
  }
          */
    
    // enables or disables the third person camera system used during mode transitions to prevent conflicting camera updates
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    
    // utility methods for runtime adjustment  adjusts how far the camera follows behind the player larger values create more distant third person view, we can easiliy
    //modify thisvalue in the construftor of the class
    setDistance(distance) {
        this.distance = distance;
    }
    
    // changes camera height above the player character
    // higher values give more elevated viewing angle
    setHeight(height) {
        this.height = height;
    }
    
    // debug , remove
    // getDebugInfo() {
    //     if (!this.target) return null;
        
    //     const playerPos = this.target.getPosition();
    //     const cameraPos = this.camera.position;
    //     const playerForward = this.target.getForwardDirection();
        
    //     return {
    //         playerPosition: playerPos,
    //         cameraPosition: cameraPos,
    //         playerForwardDirection: playerForward,
    //         distance: this.distance,
    //         height: this.height,
    //     };
    // }
}

/*
  camera transition system handles smooth transitions between different camera modes
 */
export class CameraTransition {
    // initializes smooth camera transition system between different viewing modes
    // manages interpolation of camera position and look-at target over time
    constructor(camera) {
        this.camera = camera;
        this.isTransitioning = false;
        this.duration = 1.5; // seconds
        this.progress = 0;
        
        this.startPosition = new THREE.Vector3();
        this.endPosition = new THREE.Vector3();
        this.startLookAt = new THREE.Vector3();
        this.endLookAt = new THREE.Vector3();
        
        this.onComplete = null;
    }
    
    //begins camera transition from current position to target position and look-at captures current state and sets up interpolation parameters for animation
    startTransition(endPos, endLookAt, onComplete = null) {
        this.startPosition.copy(this.camera.position);
        this.endPosition.copy(endPos);
        
        // Calculate current lookAt direction
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        this.startLookAt.copy(this.camera.position).add(direction);
        this.endLookAt.copy(endLookAt);
        
        this.progress = 0;
        this.isTransitioning = true;
        this.onComplete = onComplete;
        
    }
    
    // processes ongoing camera transition by interpolating position and look-at applies smooth easing and calls completion callback when finished
    update(deltaTime) {
        if (!this.isTransitioning) return;
        
        const oldProgress = this.progress;
        this.progress += deltaTime / this.duration;
        
        if (this.progress >= 1.0) {
            this.progress = 1.0;
            this.isTransitioning = false;
            
            
            if (this.onComplete) {
                this.onComplete();
            }
        }
        
        //smooth easing
        const t = this.easeInOutCubic(this.progress);
        
        //interpolate position and look-at, so that the camera postion changes, not only the look at, in this way it moves accordingly to the point it should
        //go and it does not just stay still and rotates
        const currentPos = new THREE.Vector3().lerpVectors(this.startPosition, this.endPosition, t);
        const currentLookAt = new THREE.Vector3().lerpVectors(this.startLookAt, this.endLookAt, t);
        
        this.camera.position.copy(currentPos);
        this.camera.lookAt(currentLookAt);
    }
    
    // applies cubic easing function for smooth transition animations creates natural acceleration and deceleration curve
    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    // changes the duration for all future camera transitions shorter durations create faster camera movements
    setDuration(duration) {
        this.duration = duration;
    }
}

/**
 * camera Manager
 * central manager for all camera systems 
 */
export class CameraManager {
    // central camera management system coordinating all camera modes handles third-person exploration, first-person machine views, and smooth transitions
    constructor(camera) {
        this.camera = camera;
        this.scene = null; // will be set by initialize()
        this.thirdPersonCamera = null;
        this.cameraTransition = null;
        this.currentMode = 'exploration';
        
        // FIRST PERSON SYSTEM
        this.firstPersonPositions = {
            claw_machine: null,
            candy_machine: null
        };
        
        // TOP-DOWN CAMERA SYSTEM
        this.clawCameraMode = 'normal'; // 'normal', 'top_down'
        this.normalCameraPosition = null;
        this.normalCameraTarget = null;
        this.clawGroup = null; // Will be set by setClawReference
        
    }
    
    // INITIALIZE WITH SCENE REFERENCE
    // stores scene reference for camera positioning calculations
    // must be called before other camera operations can function properly
    initialize(scene) {
        this.scene = scene;
    }
    
    // creates and configures third-person camera system with transition manager
    // positions camera behind player at initial distance and height
    initThirdPersonCamera(target) {
        // INITIALIZE CAMERA TRANSITION FIRST
        this.cameraTransition = new CameraTransition(this.camera);
        
        this.thirdPersonCamera = new ThirdPersonCamera(this.camera, target);
        
        // initialize camera position (behind player)
        const initialPlayerPos = target.getPosition();
        this.camera.position.set(initialPlayerPos.x, initialPlayerPos.y + 2.5, initialPlayerPos.z + 4); //we set the initial camera position at a distance z and height y from the player
        this.camera.lookAt(initialPlayerPos.x, initialPlayerPos.y + 1, initialPlayerPos.z);
        
    }
    
    // main camera update loop called every frame updates third-person following in exploration mode and processes transitions
    update(deltaTime) {
        if (this.currentMode === 'exploration' && this.thirdPersonCamera) {
            this.thirdPersonCamera.update(deltaTime); //if we are in exploration mode, update the camera system
        }
        

        if (this.cameraTransition) {
            this.cameraTransition.update(deltaTime);
        } //otherwise, if we are in transition mode, then update the ongoing transition
    }
    
    // transitions from exploration to first-person machine interaction view
    // disables third-person system and smoothly moves to pre-calculated machine position
    switchToMachineMode(machineType, machineOffset, onComplete = null) {
        if (!this.cameraTransition) {
            return;
        } 
        
        if (this.cameraTransition.isTransitioning) {
            return;
        }
        
        this.currentMode = machineType;
        
        // use first person positions
        const firstPersonData = this.firstPersonPositions[machineType];
        
        if (!firstPersonData) {
            return;
        }
        
        // start camera transition to first person position
        this.cameraTransition.startTransition(firstPersonData.position, firstPersonData.target, onComplete);
        
        // disable third person camera
        if (this.thirdPersonCamera) {
            this.thirdPersonCamera.setEnabled(false);
        }
    }
    
    // returns from machine view to third-person exploration mode, calculates appropriate behind player position and re-enables third person following
    switchToExplorationMode(target, onComplete = null) {
        if (!this.cameraTransition || this.cameraTransition.isTransitioning) return;
        
        this.currentMode = 'exploration';
        
        // get current player position for camera transition
        const playerPos = target.getPosition();
        const playerForward = target.getForwardDirection ? target.getForwardDirection() : new THREE.Vector3(0, 0, -1);
        
        // calculate third person camera position
        const cameraPos = playerPos.clone();
        cameraPos.add(playerForward.clone().multiplyScalar(-4));
        cameraPos.y += 2.5;
        
        const cameraTarget = playerPos.clone();
        cameraTarget.y += 1;
        
        // start transition back to third person
        this.cameraTransition.startTransition(cameraPos, cameraTarget, () => {
            // re-enable third person camera
            if (this.thirdPersonCamera) {
                this.thirdPersonCamera.setEnabled(true);
            }
            if (onComplete) onComplete();
        });
    }


//function to update the first person camera reference calculates optimal first-person camera positions for each machine based on their control interfaces.

    // calculates optimal first-person camera positions using machine control interface, analyzes reference mesh position to determine best viewing angle and distance
    setFirstPersonReference(machineType, referenceMesh, machineCenter, machineSize = 3) {
        if (!referenceMesh) {
            return;
        }
        
        // get world position of reference mesh
        referenceMesh.updateWorldMatrix(true, false);
        const referenceWorldPos = new THREE.Vector3();
        referenceMesh.getWorldPosition(referenceWorldPos);
        
        
        // calculate which side of the machine the reference mesh is on
        const sideInfo = this.calculateMachineSide(referenceWorldPos, machineCenter, machineSize);
        
        //  SPECIAL HANDLING FOR CANDY MACHINE
        if (machineType === 'candy_machine') {
            // force candy machine camera to be in front (positive Z) with extra distance
            sideInfo.side = 'front';
            sideInfo.direction = 'front';
            sideInfo.offset = new THREE.Vector3(0, 0, 1); // extra Z offset to ensure we're well outside
        }
        
        // calculate first person camera position
        const fpData = this.calculateFirstPersonPosition(machineCenter, sideInfo, machineSize, machineType);
        
        this.firstPersonPositions[machineType] = fpData;
        
    }
    

    // determines which side of machine the reference point is on (left/right/front/back) compares axis displacement to identify primary direction and create offset vector
   //t his ensures the first-person camera appears where a human would stand to operate the machine, namely on the same side as the controls, not behind or opposite side
    calculateMachineSide(referencePos, machineCenter, machineSize) {
        const dx = referencePos.x - machineCenter.x;
        const dz = referencePos.z - machineCenter.z;
        
        const absDx = Math.abs(dx);
        const absDz = Math.abs(dz);
        
        // determine which axis has the greater distance
        if (absDx > absDz) {
            // reference is more displaced on X axis
            return {
                side: dx > 0 ? 'right' : 'left',
                direction: dx > 0 ? 'right' : 'left',
                offset: new THREE.Vector3(dx > 0 ? 1 : -1, 0, 0)
            };
        } else {
            // reference is more displaced on Z axis  
            return {
                side: dz > 0 ? 'back' : 'front',
                direction: dz > 0 ? 'back' : 'front', 
                offset: new THREE.Vector3(0, 0, dz > 0 ? 1 : -1)
            };
        }
    }
    

    // computes exact first-person camera position and target with machine-specific adjustments 
    calculateFirstPersonPosition(machineCenter, sideInfo, machineSize, machineType = null) {
        const playerHeight = 3.8; // elevated first person height for better view
        const baseDistance = machineSize * 0.8; // Increased base distance from machine edge
        
        // MACHINE-SPECIFIC DISTANCE ADJUSTMENTS
        let extraDistance = 0; //dDefault additional distance
        
        if (machineType === 'candy_machine') {
            extraDistance = 1.5; // much more distance for candy machine to avoid being inside
        } else if (machineType === 'claw_machine') {
            extraDistance = 1.0; // standard distance for claw machine
        }
        
        const distanceFromMachine = baseDistance + extraDistance;
        
        // calculate camera position on the same side as reference mesh
        const cameraPos = machineCenter.clone();
        cameraPos.add(sideInfo.offset.clone().multiplyScalar(distanceFromMachine));
        cameraPos.y = playerHeight;
        
        // camera target is the center of the machine at a reasonable height
        const cameraTarget = machineCenter.clone();
        cameraTarget.y = playerHeight * 0.7; // Standard target for first person view
        
        
        return {
            position: cameraPos,
            target: cameraTarget,
            side: sideInfo.side
        };
    }
    
    /**
     * check if first person positions are set for both machines
     */
    isFirstPersonReady() {
        return this.firstPersonPositions.claw_machine !== null && 
               this.firstPersonPositions.candy_machine !== null;
    }

    /*
     *set first person camera height for all machines
     */
    setFirstPersonHeight(height) {
        
        // for each machine, recalculate positions if they exist
        Object.keys(this.firstPersonPositions).forEach(machineType => {
            const fpData = this.firstPersonPositions[machineType];
            if (fpData) {
                // update position height
                fpData.position.y = height;
                // update target height (slightly lower)
                fpData.target.y = height * 0.75;
                
            }
        });
        
    }
    
    // height presets
    setFirstPersonHeightLow() { this.setFirstPersonHeight(2.8); }
    setFirstPersonHeightNormal() { this.setFirstPersonHeight(3.8); }
    setFirstPersonHeightHigh() { this.setFirstPersonHeight(4.5); }
    setFirstPersonHeightTall() { this.setFirstPersonHeight(5.2); }
    setFirstPersonHeightGiant() { this.setFirstPersonHeight(6.5); }
    
    /**
     * force recalculation of first person positions
     */
    recalculateFirstPersonPositions() {
        
        // Get current positions and machine types
        const machines = Object.keys(this.firstPersonPositions);
        machines.forEach(machineType => {
            const fpData = this.firstPersonPositions[machineType];
            if (fpData) {
            }
        });
        
    }
    
    // utility methods
    setThirdPersonDistance(distance) {
        if (this.thirdPersonCamera) {
            this.thirdPersonCamera.setDistance(distance);
        }
    }
    
    setThirdPersonHeight(height) {
        if (this.thirdPersonCamera) {
            this.thirdPersonCamera.setHeight(height);
        }
    }
    
    // REMOVED!!!!!!!!!!!!!!!!!!: setThirdPersonSpeed is no longer needed.
    
    setTransitionDuration(duration) {
        if (this.cameraTransition) {
            this.cameraTransition.setDuration(duration);
        }
    }

    animateCameraToObject(duration) {
        if (this.currentMode === 'exploration' && this.thirdPersonCamera) {
            return this.thirdPersonCamera.animateToObjectView(duration);
        }
        return Promise.resolve();
    }

    animateCameraToOriginal(duration) {
        if (this.currentMode === 'exploration' && this.thirdPersonCamera) {
            return this.thirdPersonCamera.animateToOriginalView(duration);
        }
        return Promise.resolve();
    }
    
    getDebugInfo() {
        const info = {
            currentMode: this.currentMode,
            cameraPosition: this.camera.position.clone(),
            isTransitioning: this.cameraTransition ? this.cameraTransition.isTransitioning : false
        };
        
        if (this.thirdPersonCamera) {
            info.thirdPerson = this.thirdPersonCamera.getDebugInfo();
        }
        
        return info;
    }
    
    // TOP-DOWN CAMERA SYSTEM METHODS
    
    // Set reference to claw group for top-down camera functionality
    setClawReference(clawGroup) {
        this.clawGroup = clawGroup;
    }
    
    // Toggle between normal first-person view and top-down view when in claw machine mode
    toggleClawCameraMode() {
        if (this.currentMode !== 'claw_machine' || !this.clawGroup) {
            console.warn('Cannot toggle claw camera: not in claw machine mode or claw reference missing');
            return false;
        }
        
        if (this.clawCameraMode === 'normal') {
            // Save current camera position and target
            this.normalCameraPosition = this.camera.position.clone();
            this.normalCameraTarget = new THREE.Vector3();
            this.camera.getWorldDirection(this.normalCameraTarget);
            this.normalCameraTarget.add(this.camera.position);
            
            // Switch to top-down view
            this.switchToTopDownView();
            this.clawCameraMode = 'top_down';
        } else {
            // Switch back to normal view
            this.switchToNormalView();
            this.clawCameraMode = 'normal';
        }
        
        return true; // Successfully toggled
    }
    
    // Switch camera to top-down view positioned above the claw
    switchToTopDownView() {
        if (!this.clawGroup) return;
        
        // Get the claw's current position
        const clawPosition = this.clawGroup.position.clone();
        
        // Position camera above the claw
        const cameraHeight = 1.5; // Height above the claw
        const cameraPos = new THREE.Vector3(
            clawPosition.x,
            clawPosition.y + cameraHeight,
            clawPosition.z
        );
        
        // Set camera position and look down at the claw
        this.camera.position.copy(cameraPos);
        this.camera.lookAt(clawPosition);
        
        // Enable camera following for real-time claw tracking
        this.camera.userData.followClaw = true;
    }
    
    // Restore camera to the saved normal view position and orientation
    switchToNormalView() {
        if (!this.normalCameraPosition || !this.normalCameraTarget) return;
        
        // Restore the original camera position and target
        this.camera.position.copy(this.normalCameraPosition);
        this.camera.lookAt(this.normalCameraTarget);
        
        // Stop following the claw
        this.camera.userData.followClaw = false;
    }
    
    // Update camera position when in top-down following mode (call this in main render loop)
    updateTopDownCamera() {
        if (this.camera.userData.followClaw && this.clawGroup) {
            const clawPosition = this.clawGroup.position.clone();
            const cameraHeight = 0.03; // Very close to claw in follow mode
            this.camera.position.set(
                clawPosition.x,
                clawPosition.y + cameraHeight,
                clawPosition.z
            );
            this.camera.lookAt(clawPosition);
        }
    }
    
    // Get current claw camera mode for UI display
    getClawCameraMode() {
        return this.clawCameraMode;
    }
    
    // Reset claw camera to normal mode when exiting machine
    resetClawCamera() {
        this.clawCameraMode = 'normal';
        this.camera.userData.followClaw = false;
        this.normalCameraPosition = null;
        this.normalCameraTarget = null;
    }
}

/**
 * utility Functions for Camera System
 */
export const CameraUtils = {
    // initialize global camera control functions for debugging
    // exposes camera control functions globally for development and debugging
    // creates window functions for runtime camera adjustment and testing
    initGlobalControls(cameraManager) {
        window.setCameraDistance = (distance) => {
            if (cameraManager) {
                cameraManager.setThirdPersonDistance(distance);
            } else {
            }
        };
        
        window.setCameraHeight = (height) => {
            if (cameraManager) {
                cameraManager.setThirdPersonHeight(height);
            } else {
            }
        };
        
        //!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! REMOVED!!!!!!!!!: setCameraSpeed is no longer needed.
        
        window.setTransitionDuration = (duration) => {
            if (cameraManager) {
                cameraManager.setTransitionDuration(duration);
            } else {
            }
        };
        
        
    }
}; 






















/* 


Here’s a compact, developer-oriented summary of how the camera system works.

# Big picture

* The **CameraManager** is the conductor. It owns:

  * a **ThirdPersonCamera** (live follow of the player),
  * a **CameraTransition** (smooth blends between viewpoints),
  * and precomputed **first-person “machine” viewpoints** (for claw/candy machines).
* Two main modes:

  * **`exploration`** → third-person follow.
  * **`claw_machine` / `candy_machine`** → first-person, fixed viewpoint facing a machine.

# Lifecycle & flow

1. **Setup**

   * `new CameraManager(camera)` → sets defaults.
   * `initialize(scene)` → stores scene (future queries).
   * `initThirdPersonCamera(target)` → creates ThirdPerson + Transition and places the camera behind/above the player (seed position).

2. **Per-frame update**

   * `CameraManager.update(dt)`:

     * If in **exploration**, calls `ThirdPersonCamera.update(dt)` to follow the player.
     * Always calls `CameraTransition.update(dt)` to advance any ongoing blend.

3. **Mode switches**

   * **To a machine (first-person):**
     `switchToMachineMode(machineType, machineOffset?, onComplete?)`

     * Reads a precomputed first-person `{position,target}` for that machine.
     * Starts a smooth **CameraTransition** to it.
     * Disables third-person updates (manager stops calling its update).
   * **Back to exploration:**
     `switchToExplorationMode(target, onComplete?)`

     * Computes a point **behind** the player (−distance on forward, +height in Y).
     * Transitions there and resumes third-person updates.

# ThirdPersonCamera (follow system)

* **State:** `distance = 4`, `height = 4`, object-view animation flags, easing.
* **`update(dt)` logic:**

  * If an **object-view animation** is active, it eases the camera from current offset to a target offset (and looks slightly above the player), then returns.
  * If the player is greeting, it holds the camera.
  * Otherwise it snaps the camera to `playerPos + (-forward * distance) + (0, height, 0)` and looks slightly above the player.
* **Helpers:**

  * `animateToObjectView(duration)` → move camera **in front** of the player.
  * `animateToOriginalView(duration)` → restore the **behind** view.
  * `setDistance(d)`, `setHeight(h)`.
  * `setEnabled(...)` exists but isn’t read inside `update` (the manager handles enabling by mode).

# CameraTransition (smooth blends)

* Holds start/end **position** and **lookAt** and a duration (default \~1.5s).
* `startTransition(endPos, endLookAt, onComplete?)` captures current pos/look as start, sets targets, and arms the transition.
* `update(dt)` eases `t` (easeInOutCubic), interpolates pos & lookAt, calls `onComplete` at the end.
* `setDuration(seconds)` to globally change the blend speed.

# First-person (machine) viewpoints

* **Goal:** pick a natural “human height” camera spot facing the machine’s controls.
* **Pipeline:**

  1. `setFirstPersonReference(machineType, referenceMesh, machineCenter, machineSize=3)`

     * Converts `referenceMesh` to world space to know **which side** of the machine the interface sits on.
     * For **candy\_machine**, forces the **front** and adds extra Z distance.
     * Stores the computed `{ position, target, side }` for later transitions.
  2. `calculateMachineSide(referencePos, machineCenter, machineSize)`

     * Chooses `left/right/front/back` by comparing |dx| vs |dz|; returns a unit offset vector.
  3. `calculateFirstPersonPosition(machineCenter, sideInfo, machineSize, machineType?)`

     * Height: **3.8** (human eye level).
     * Distance: `machineSize * 0.8` + extra (candy +1.5, claw +1.0).
     * **Target** height \~70% of camera height for a natural downward gaze.
* **Utilities:**

  * `isFirstPersonReady()` → true when both claw & candy positions are stored.
  * `setFirstPersonHeight(h)` → updates stored positions (target set to **75%** of `h`).
  * Presets: Low(2.8), Normal(3.8), High(4.5), Tall(5.2), Giant(6.5).
  * `recalculateFirstPersonPositions()` → placeholder (future dynamic recompute).

# Manager convenience APIs

* `setThirdPersonDistance(d)` / `setThirdPersonHeight(h)` → forwarders to ThirdPersonCamera.
* `setTransitionDuration(s)` → updates CameraTransition.
* `animateCameraToObject(duration)` / `animateCameraToOriginal(duration)`

  * Work **only in exploration** (wrap ThirdPersonCamera’s animations).
* `getDebugInfo()` → snapshot of mode, position, transition state, plus third-person debug if present.

# Notes & gotchas

* The manager’s mode gate is what truly “disables” third-person updates; `setEnabled` on ThirdPersonCamera is currently redundant.
* Some **CameraUtils** globals reference **non-existent** manager methods (would throw). Either implement those or remove them.
* There’s a minor inconsistency: first-person target height is **70%** during initial compute but **75%** when adjusted via `setFirstPersonHeight`. Align if desired.
* `machineOffset` is passed into `switchToMachineMode` but isn’t used.

# Typical usage (minimal)

```js
const manager = new CameraManager(camera);
manager.initialize(scene);
manager.initThirdPersonCamera(player);

// per-frame
manager.update(deltaTime);

// precompute first-person spots (once per machine)
manager.setFirstPersonReference('claw_machine', clawJoystick, clawCenter, clawSize);
manager.setFirstPersonReference('candy_machine', candyButtons, candyCenter, candySize);

// later: switch views
manager.switchToMachineMode('claw_machine');
manager.switchToExplorationMode(player);
```

That’s the system in a nutshell: third-person follow for exploration, precomputed first-person anchors for machines, and a single transition engine to tie it all together.








*/