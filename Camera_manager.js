import * as THREE from 'three';

/**
 * Third Person Camera System
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
        const idealPosition = playerPos.clone();
        const cameraOffset = playerForward.clone().multiplyScalar(-this.distance);
        idealPosition.add(cameraOffset);
        idealPosition.y += this.height;
        
        // calculate ideal look-at point (slightly above player)
        const idealLookAt = playerPos.clone();
        idealLookAt.y += 2.5;
        
        // apply position and look-at directly for a fixed camera without interpolation
        this.camera.position.copy(idealPosition);
        this.camera.lookAt(idealLookAt);


        /*  - Animation Priority: Camera animations override normal following
  - Greeting Freeze: Camera stays still while player greets NPCs/objects
  - Directional Following: Camera always stays behind player relative to their rotation
  - Instant Response: No smoothing - camera moves immediately with player
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

    // returns camera from object view back to standard behind-player position
    // creates smooth transition animation with easing for natural movement
    animateToOriginalView(duration) {
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

    // provides smooth s-curve easing for camera animations
    // starts slow, accelerates in middle, decelerates at end for natural feel
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
    
    // enables or disables the third person camera system
    // used during mode transitions to prevent conflicting camera updates
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    
    // utility methods for runtime adjustment
    // adjusts how far the camera follows behind the player
    // larger values create more distant third person view
    setDistance(distance) {
        this.distance = distance;
    }
    
    // changes camera height above the player character
    // higher values give more elevated viewing angle
    setHeight(height) {
        this.height = height;
    }
    
    // returns comprehensive debug information about camera state
    // includes player position, camera position, forward direction, distance and height
    getDebugInfo() {
        if (!this.target) return null;
        
        const playerPos = this.target.getPosition();
        const cameraPos = this.camera.position;
        const playerForward = this.target.getForwardDirection();
        
        return {
            playerPosition: playerPos,
            cameraPosition: cameraPos,
            playerForwardDirection: playerForward,
            distance: this.distance,
            height: this.height,
        };
    }
}

/**
  camera transition system
 handles smooth transitions between different camera modes

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
    
    // begins smooth camera transition from current position to target position and look-at
    // captures current state and sets up interpolation parameters for animation
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
    
    // processes ongoing camera transition by interpolating position and look-at
    // applies smooth easing and calls completion callback when finished
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
        
        // Smooth easing
        const t = this.easeInOutCubic(this.progress);
        
        // Interpolate position and look-at
        const currentPos = new THREE.Vector3().lerpVectors(this.startPosition, this.endPosition, t);
        const currentLookAt = new THREE.Vector3().lerpVectors(this.startLookAt, this.endLookAt, t);
        
        this.camera.position.copy(currentPos);
        this.camera.lookAt(currentLookAt);
    }
    
    // applies cubic easing function for smooth transition animations
    // creates natural acceleration and deceleration curve
    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    // changes the duration for all future camera transitions
    // shorter durations create faster camera movements
    setDuration(duration) {
        this.duration = duration;
    }
}

/**
 * camera Manager
 * central manager for all camera systems 
 */
export class CameraManager {
    // central camera management system coordinating all camera modes
    // handles third-person exploration, first-person machine views, and smooth transitions
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
        
        // Initialize camera position (behind player)
        const initialPlayerPos = target.getPosition();
        this.camera.position.set(initialPlayerPos.x, initialPlayerPos.y + 2.5, initialPlayerPos.z + 4); //we set the initial camera position at a distance z and height y from the player
        this.camera.lookAt(initialPlayerPos.x, initialPlayerPos.y + 1, initialPlayerPos.z);
        
    }
    
    // main camera update loop called every frame
    // updates third-person following in exploration mode and processes transitions
    update(deltaTime) {
        if (this.currentMode === 'exploration' && this.thirdPersonCamera) {
            this.thirdPersonCamera.update(deltaTime); //if we are in exploration mode, update the camera system
        }
        

        if (this.cameraTransition) {
            this.cameraTransition.update(deltaTime);
        }
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
    
    // returns from machine view to third-person exploration mode
    // calculates appropriate behind-player position and re-enables third-person following
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
        
        // Start transition back to third person
        this.cameraTransition.startTransition(cameraPos, cameraTarget, () => {
            // re-enable third person camera
            if (this.thirdPersonCamera) {
                this.thirdPersonCamera.setEnabled(true);
            }
            if (onComplete) onComplete();
        });
    }


//function to update the first person camera reference
// calculates optimal first-person camera positions for each machine based on their control interfaces.

    // calculates optimal first-person camera positions using machine control interfaces
    // analyzes reference mesh position to determine best viewing angle and distance
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
            sideInfo.offset = new THREE.Vector3(0, 0, 1.5); // extra Z offset to ensure we're well outside
        }
        
        // calculate first person camera position
        const fpData = this.calculateFirstPersonPosition(machineCenter, sideInfo, machineSize, machineType);
        
        this.firstPersonPositions[machineType] = fpData;
        
    }
    
    /**
     * calculate which side of the machine a reference point is on
     */
    // determines which side of machine the reference point is on (left/right/front/back)
    // compares axis displacement to identify primary direction and create offset vector
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
    
    /**
     * calculate first person camera position based on machine side
     */
    // computes exact first-person camera position and target with machine-specific adjustments
    // sets realistic human height (3.8 units) with natural viewing angle towards machine center
    calculateFirstPersonPosition(machineCenter, sideInfo, machineSize, machineType = null) {
        const playerHeight = 3.8; // 🆕 Elevated first person height for better view
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

    /**
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
        
        window.debugCamera = () => {
            if (cameraManager) {
                const info = cameraManager.getDebugInfo();
                
                if (info.thirdPerson) {
                    const tp = info.thirdPerson;
                    const pfd = tp.playerForwardDirection;
                }
                
                // FIRST PERSON DEBUG INFO
                if (cameraManager.firstPersonPositions.claw_machine) {
                    const fp = cameraManager.firstPersonPositions.claw_machine;
                }
                if (cameraManager.firstPersonPositions.candy_machine) {
                    const fp = cameraManager.firstPersonPositions.candy_machine;
                }
            } else {
            }
        };
        
        // FIRST PERSON TESTING FUNCTIONS
        window.testFirstPersonClaw = () => {
            if (cameraManager && cameraManager.firstPersonPositions.claw_machine) {
                const fp = cameraManager.firstPersonPositions.claw_machine;
                cameraManager.camera.position.copy(fp.position);
                cameraManager.camera.lookAt(fp.target);
            } else {
            }
        };
        
        window.testFirstPersonCandy = () => {
            if (cameraManager && cameraManager.firstPersonPositions.candy_machine) {
                const fp = cameraManager.firstPersonPositions.candy_machine;
                cameraManager.camera.position.copy(fp.position);
                cameraManager.camera.lookAt(fp.target);
            } else {
            }
        };
        
        // ENHANCED TESTING FUNCTIONS USING CAMERA MANAGER METHODS
        window.showFirstPersonHelpers = () => {
            if (cameraManager) {
                cameraManager.showFirstPersonHelpers();
            } else {
            }
        };
        
        window.hideFirstPersonHelpers = () => {
            if (cameraManager) {
                cameraManager.hideFirstPersonHelpers();
            } else {
            }
        };
        
        window.testFirstPersonTransition = (machineType = 'claw_machine') => {
            if (cameraManager) {
                // we need to pass machine offsets - these will be provided by the main app
                const machineOffset = new THREE.Vector3(7, 0, 0); // default claw machine offset
                const candyMachineOffset = new THREE.Vector3(-7, 0, 0); // default candy machine offset
                
                const targetOffset = machineType === 'claw_machine' ? machineOffset : candyMachineOffset;
                cameraManager.testFirstPersonTransition(machineType, targetOffset);
            } else {
            }
        };
        
        window.testCandyMachinePosition = () => {
            if (cameraManager) {
                const candyMachineOffset = new THREE.Vector3(-7, 0, 0);
                cameraManager.testCandyMachinePosition(candyMachineOffset);
            } else {
            }
        };
        
        window.testRealisticHeights = () => {
            if (cameraManager) {
                const machineOffset = new THREE.Vector3(7, 0, 0);
                cameraManager.testRealisticHeights(machineOffset);
            } else {
            }
        };
        
        window.testNewHeight = () => {
            if (cameraManager) {
                const machineOffset = new THREE.Vector3(7, 0, 0);
                const candyMachineOffset = new THREE.Vector3(-7, 0, 0);
                cameraManager.testNewHeight(machineOffset, candyMachineOffset);
            } else {
            }
        };
        
        // FIRST PERSON HEIGHT ADJUSTMENT
        window.setFirstPersonHeight = (height) => {
            if (cameraManager) {
                cameraManager.setFirstPersonHeight(height);
            } else {
            }
        };
        
        // QUICK HEIGHT PRESETS - REALISTIC HEIGHTS
        window.setFirstPersonHeightLow = () => {
            if (cameraManager) {
                cameraManager.setFirstPersonHeightLow();
            } else {
            }
        };
        
        window.setFirstPersonHeightNormal = () => {
            if (cameraManager) {
                cameraManager.setFirstPersonHeightNormal();
            } else {
            }
        };
        
        window.setFirstPersonHeightHigh = () => {
            if (cameraManager) {
                cameraManager.setFirstPersonHeightHigh();
            } else {
            }
        };
        
        window.setFirstPersonHeightTall = () => {
            if (cameraManager) {
                cameraManager.setFirstPersonHeightTall();
            } else {
            }
        };
        
        window.setFirstPersonHeightGiant = () => {
            if (cameraManager) {
                cameraManager.setFirstPersonHeightGiant();
            } else {
            }
        };
        
        // FORCE RECALCULATION OF POSITIONS
        window.recalculateFirstPersonPositions = () => {
            if (cameraManager) {
                cameraManager.recalculateFirstPersonPositions();
            } else {
            }
        };
        
    }
}; 


/* 

  constructor(camera) Initializes the camera manager with Three.js camera reference, sets up state variables for third-person and first-person systems,
  creates storage for pre-calculated machine positions, and establishes 'exploration' as the default camera mode.

  initialize(scene) Stores the Three.js scene reference for future camera calculations and positioning operations. Essential setup method that must be
  called before other camera operations can function properly.

  initThirdPersonCamera(target)Creates and configures the third-person camera system and transition manager. Positions camera 4 units behind and 2.5 units
   above the player target, with initial view aimed at player's torso level.

  ** Update & Mode Management

  update(deltaTime) Main update loop that runs every frame. Updates third-person camera positioning when in exploration mode and processes ongoing camera
  transitions between modes. Ensures smooth camera behavior across all systems.

  switchToMachineMode(machineType, machineOffset, onComplete) Smoothly transitions camera from third-person exploration to first-person machine interaction
   view. Disables third-person system, retrieves pre-calculated first-person position, and initiates transition animation with completion callback
  support.

  switchToExplorationMode(target, onComplete) Returns camera from machine interaction to third-person exploration mode. Calculates appropriate third-person
   position behind player, starts smooth transition animation, and re-enables third-person following system upon completion.

  ** First-Person Position Calculation

  setFirstPersonReference(machineType, referenceMesh, machineCenter, machineSize)Calculates optimal first-person camera positions using machine control
  interfaces (joystick/button) as reference points. Special handling for candy machine positioning. Stores calculated positions for later use during mode
  switching.

  calculateMachineSide(referencePos, machineCenter, machineSize)Analyzes reference point position relative to machine center to determine optimal camera
  placement side (left/right/front/back). Uses axis displacement comparison to identify primary direction and creates positioning offset vector.

  calculateFirstPersonPosition(machineCenter, sideInfo, machineSize, machineType)Computes exact first-person camera position and target using machine
  center, side information, and machine-specific distance adjustments. Sets camera height at 3.8 units with target at 70% of that height for natural
  viewing angle.

  ** Utility & Configuration Functions

  isFirstPersonReady()Validation check that returns true when first-person positions are calculated and stored for both claw machine and candy machine.
  Ensures system readiness before allowing mode transitions.

  setFirstPersonHeight(height)Updates camera height for all calculated first-person positions. Adjusts both camera position Y-coordinate and target height
   (75% of camera height) to maintain natural viewing angles across all machines.

  setFirstPersonHeightLow() through setFirstPersonHeightGiant()Preset height adjustment methods that set first-person camera heights to predefined values:
   Low (2.8), Normal (3.8), High (4.5), Tall (5.2), Giant (6.5). Convenient shortcuts for testing different viewing heights.

  recalculateFirstPersonPositions()Forces recalculation of all stored first-person camera positions. Currently iterates through existing positions but
  implementation is placeholder for future dynamic position updates based on changed machine configurations.

  setThirdPersonDistance(distance)Adjusts the distance between camera and player in third-person mode by calling the underlying ThirdPersonCamera system's
   setDistance method. Allows runtime adjustment of camera following behavior.

  setThirdPersonHeight(height)Modifies the height of third-person camera above the player by calling the underlying ThirdPersonCamera system's setHeight
  method. Enables dynamic adjustment of camera elevation during gameplay.

  setTransitionDuration(duration)Configures the speed of camera transitions between different modes by setting the duration parameter in the
  CameraTransition system. Shorter durations create faster, snappier transitions.

  ** Animation Functions

  animateCameraToObject(duration)Triggers camera animation to focus on objects during third-person exploration mode. Delegates to ThirdPersonCamera's
  animateToObjectView method and returns Promise for completion handling. Only functions in exploration mode.

  animateCameraToOriginal(duration)Returns camera from object-focused view back to normal third-person following position. Uses ThirdPersonCamera's
  animateToOriginalView method and returns Promise. Restores standard exploration camera behavior.

  Debug Functions

  getDebugInfo()Returns comprehensive debugging information including current camera mode, position coordinates, transition status, and third-person
  camera details. Provides snapshot of entire camera system state for development and troubleshooting.


*/






/* 


# ThirdPersonCamera

### `constructor(camera, target)`

* **Cosa fa:** inizializza il sistema di camera in terza persona che segue un “target” (il player).
* **Parametri:**

  * `camera`: istanza `THREE.Camera`.
  * `target`: oggetto “player” che deve esporre almeno `getPosition()` e `getForwardDirection()`, ed opzionalmente la flag `isGreeting`.
* **Imposta:** distanza dietro al player (`distance = 4`), altezza da terra (`height = 4`), stato dell’animazione di “vista speciale” (da/verso l’oggetto), easing, offset iniziale/finale dell’animazione.

### `update(deltaTime)`

* **Cosa fa:** aggiorna *ogni frame* la posizione/orientamento della camera.
* **Flusso:**

  1. Se non c’è `target`, esce.
  2. Se è in corso un’animazione “di vista” (`isAnimatingView`):

     * Avanza il progresso con easing *easeInOutCubic*.
     * Interpola un offset tra `startOffset` ed `endOffset`, lo somma alla posizione del player e posiziona lì la camera.
     * Fa il `lookAt` verso la testa del personaggio (`+2.5` in Y).
     * Alla fine dell’animazione chiama `onAnimationComplete` (se presente).
     * **Ritorna** subito (salta la logica “normale”).
  3. Se il player sta salutando (`target.isGreeting`), **blocca** la camera dov’è (non aggiorna).
  4. Altrimenti, calcola la posizione ideale **dietro** al player:
     `idealPosition = playerPos + (-forward * distance) + (0, height, 0)`
  5. Imposta la camera su `idealPosition` e `lookAt` leggermente sopra il player (`+2.5`).
* **Parametri:** `deltaTime` in **secondi** (coerente con `animationDuration`).
* **Nota:** niente smoothing nella modalità “normale”: la camera risponde istantaneamente.

### `animateToObjectView(duration)`

* **Cosa fa:** avvia un’animazione che porta la camera **davanti** al player (verso la direzione in cui guarda), utile per inquadrare un oggetto/macchina.
* **Parametri:** `duration` in secondi.
* **Dettagli:**

  * Salva l’offset attuale della camera rispetto al player (`startOffset`).
  * Imposta `endOffset` **in avanti**: `playerForward * distance`, poi forza `Y = height`.
  * Anima da `startOffset` a `endOffset` con l’easing del `update`.
* **Ritorno:** `Promise` risolta alla fine dell’animazione.

### `animateToOriginalView(duration)`

* **Cosa fa:** animazione inversa per tornare alla vista **dietro** al player (terza persona “normale”).
* **Parametri:** `duration` in secondi.
* **Dettagli:** come sopra, ma `endOffset` = `-playerForward * distance`, Y = `height`.
* **Ritorno:** `Promise` risolta a fine animazione.

### `easeInOutCubic(t)`

* **Cosa fa:** funzione di easing S-curve (accelerazione/decelerazione) per le animazioni.
* **Parametri:** `t` ∈ \[0, 1].
* **Ritorno:** valore interpolato ∈ \[0, 1].

### `setEnabled(enabled)`

* **Cosa fa:** setta una flag interna `this.enabled`.
* **Nota:** **nel codice attuale la flag non viene letta** dentro `update`. La “disattivazione” effettiva avviene perché il `CameraManager` *non chiama* `update` quando non siamo in `exploration`. (Questa funzione è quindi ridondante allo stato attuale.)

### `setDistance(distance)` / `setHeight(height)`

* **Cosa fa:** aggiorna i parametri di follow in terza persona (distanza dietro e altezza).

### `getDebugInfo()`

* **Cosa fa:** restituisce un oggetto con stato utile al debug: posizioni di player/camera, direzione forward del player, `distance`, `height`.
* **Ritorno:** oggetto o `null` se non c’è `target`.

---

# CameraTransition

Gestisce **transizioni morbide** (posizione + lookAt) tra due inquadrature qualsiasi.

### `constructor(camera)`

* **Cosa fa:** salva la camera, prepara stato di transizione, durata (`1.5s` di default), buffer per posizione/target iniziali e finali e callback `onComplete`.

### `startTransition(endPos, endLookAt, onComplete = null)`

* **Cosa fa:** prepara una nuova transizione.
* **Parametri:**

  * `endPos`: `THREE.Vector3` posizione finale.
  * `endLookAt`: `THREE.Vector3` punto di mira finale.
  * `onComplete`: callback opzionale.
* **Dettagli:**

  * `startPosition` = posizione attuale della camera.
  * `startLookAt` = `camera.position + camera.getWorldDirection()`.
  * `endPosition`/`endLookAt` come da parametri.
  * Azzera `progress` e abilita `isTransitioning`.

### `update(deltaTime)`

* **Cosa fa:** se c’è una transizione in corso, avanza l’interpolazione.
* **Dettagli:**

  * Avanza `progress` con `deltaTime / duration`, clamp a 1.
  * Applica `easeInOutCubic` al progresso.
  * Interpola **posizione** e **lookAt** tra start e end.
  * Alla fine chiama `onComplete`, se presente.

### `easeInOutCubic(t)`

* **Come sopra:** funzione S-curve per la transizione.

### `setDuration(duration)`

* **Cosa fa:** modifica la durata di tutte le prossime transizioni.

---

# CameraManager

“Regista” centrale: istanzia e coordina terza persona, transizioni e viste “first-person” per le macchine.

### `constructor(camera)`

* **Cosa fa:** salva la camera, inizializza stato:

  * `scene` (da settare con `initialize`),
  * `thirdPersonCamera`, `cameraTransition`,
  * `currentMode = 'exploration'`,
  * slot per posizioni first-person: `{ claw_machine: null, candy_machine: null }`.

### `initialize(scene)`

* **Cosa fa:** salva il riferimento alla scena (`THREE.Scene`). Necessario se in futuro servono query sul mondo.

### `initThirdPersonCamera(target)`

* **Cosa fa:** crea `CameraTransition`, crea e configura `ThirdPersonCamera` e **posiziona** la camera iniziale dietro/above il player.
* **Dettagli:**

  * Posizione iniziale: `playerPos + (0, +2.5, +4)` e `lookAt` al busto (`+1` in Y).
    *(Nota: qui usa un offset in Z “+4”, non legato al forward; serve solo per lo start.)*

### `update(deltaTime)`

* **Cosa fa:** loop per frame del manager.
* **Dettagli:**

  * Se `currentMode === 'exploration'` e c’è la terza persona, chiama `thirdPersonCamera.update(deltaTime)`.
  * A prescindere dalla modalità, chiama `cameraTransition.update(deltaTime)` se esiste.

### `switchToMachineMode(machineType, machineOffset, onComplete = null)`

* **Cosa fa:** passa dalla modalità “esplorazione” a una vista **first-person** verso una macchina (`'claw_machine'` o `'candy_machine'`).
* **Parametri:**

  * `machineType`: chiave di `firstPersonPositions`.
  * `machineOffset`: (non usato nel codice corrente).
  * `onComplete`: callback a fine transizione.
* **Flusso:**

  * Se non c’è `cameraTransition` o è già in transizione -> esce.
  * Setta `currentMode = machineType`.
  * Legge `firstPersonPositions[machineType]` (deve essere stato calcolato prima con `setFirstPersonReference`).
  * Avvia `cameraTransition.startTransition(fp.position, fp.target, onComplete)`.
  * Chiama `thirdPersonCamera.setEnabled(false)` (non influisce davvero, vedi nota in ThirdPersonCamera).

### `switchToExplorationMode(target, onComplete = null)`

* **Cosa fa:** ritorna alla vista in terza persona “dietro al player”.
* **Dettagli:**

  * Calcola una posizione **dietro** al player (`-4` lungo il forward, `+2.5` in Y).
  * Target = `playerPos` con `+1` in Y.
  * Avvia una `CameraTransition` verso questi valori; al termine riabilita la terza persona (via `setEnabled(true)`, comunque la terza persona tornerà a ricevere `update` perché `currentMode` diventa `'exploration'`).
  * Chiama `onComplete` se passato.

### `setFirstPersonReference(machineType, referenceMesh, machineCenter, machineSize = 3)`

* **Cosa fa:** calcola e memorizza **posizione e target** “first-person” per una macchina, usando un *reference mesh* (es. joystick pulsanti) per capire il lato utile.
* **Parametri:**

  * `referenceMesh`: un `Object3D` posizionato sul lato “interfaccia” della macchina.
  * `machineCenter`: centro in mondo della macchina (`THREE.Vector3`).
  * `machineSize`: lato “unitario” della macchina (default 3).
* **Passi:**

  1. Converte `referenceMesh` in world space.
  2. Chiama `calculateMachineSide(...)` per sapere se il reference è a sinistra/destra/fronte/retro.
  3. **Eccezione per `candy_machine`:** forza il lato a **fronte** e aggiunge un offset Z extra per stare più lontani.
  4. Calcola la posizione finale con `calculateFirstPersonPosition(...)`.
  5. Salva il risultato in `firstPersonPositions[machineType]`.

### `calculateMachineSide(referencePos, machineCenter, machineSize)`

* **Cosa fa:** determina su **quale lato** della macchina si trova il `referencePos` rispetto al `machineCenter`.
* **Ritorno:** oggetto `{ side, direction, offset }` dove

  * `side`/`direction` ∈ { `'left'|'right'|'front'|'back'` },
  * `offset` è un `Vector3` unitario su X o Z (±1, 0, 0) o (0, 0, ±1) che punta verso quel lato.
* **Logica:** confronta |dx| e |dz| e sceglie l’asse con scostamento maggiore.

### `calculateFirstPersonPosition(machineCenter, sideInfo, machineSize, machineType = null)`

* **Cosa fa:** genera **posizione** e **target** ideali per la first-person di una macchina.
* **Dettagli:**

  * Altezza camera “umana”: `playerHeight = 3.8`.
  * Distanza base dalla macchina: `baseDistance = machineSize * 0.8`.
  * `extraDistance`: +1.5 per `candy_machine`, +1.0 per `claw_machine`, altrimenti 0.
  * Posizione = `machineCenter + sideInfo.offset * (baseDistance + extraDistance)`, con `y = playerHeight`.
  * Target = `machineCenter` con `y = playerHeight * 0.7`.
* **Ritorno:** `{ position, target, side }`.

### `isFirstPersonReady()`

* **Cosa fa:** ritorna `true` se **entrambi** i punti first-person (claw e candy) sono stati calcolati (non null).

### `setFirstPersonHeight(height)`

* **Cosa fa:** aggiorna l’altezza `y` **di tutte** le posizioni first-person memorizzate e alza il target al `75%` dell’altezza (`target.y = height * 0.75`).

### Preset altezza first-person

`setFirstPersonHeightLow()` (2.8), `setFirstPersonHeightNormal()` (3.8), `setFirstPersonHeightHigh()` (4.5), `setFirstPersonHeightTall()` (5.2), `setFirstPersonHeightGiant()` (6.5)

* **Cosa fanno:** shortcut per `setFirstPersonHeight(...)` con valori predefiniti.

### `recalculateFirstPersonPositions()`

* **Cosa fa:** **placeholder** per ricalcolare i punti first-person già presenti (attualmente non implementa la logica di ricalcolo).

### `setThirdPersonDistance(distance)` / `setThirdPersonHeight(height)`

* **Cosa fa:** inoltra i parametri alla `ThirdPersonCamera` (distanza/altezza).

### `setTransitionDuration(duration)`

* **Cosa fa:** imposta la durata delle transizioni in `CameraTransition`.

### `animateCameraToObject(duration)` / `animateCameraToOriginal(duration)`

* **Cosa fa:** wrapper che, **solo in modalità `exploration`**, avviano le animazioni “in avanti” (verso l’oggetto) e “indietro” (vista standard) della `ThirdPersonCamera`.
* **Ritorno:** `Promise` (o `Promise.resolve()` se non applicabile).

### `getDebugInfo()`

* **Cosa fa:** restituisce uno snapshot dello stato della camera (modalità corrente, posizione, se sta transitando) e, se presente, il `getDebugInfo()` della terza persona.

---

# CameraUtils

Espone funzioni globali su `window.*` per test/debug rapido.

### `initGlobalControls(cameraManager)`

* **Cosa fa:** registra vari helper nel `window` che chiamano i metodi del `CameraManager`.
* **Espone:**

  * `window.setCameraDistance(distance)` → `cameraManager.setThirdPersonDistance(...)`
  * `window.setCameraHeight(height)` → `cameraManager.setThirdPersonHeight(...)`
  * `window.setTransitionDuration(duration)` → `cameraManager.setTransitionDuration(...)`
  * `window.debugCamera()` → stampa info di debug (al momento non logga realmente; la funzione crea variabili ma non le usa).
  * **Test first-person diretti (senza transizione):**

    * `window.testFirstPersonClaw()` / `window.testFirstPersonCandy()`
      Copiano posizione/target memorizzati direttamente sulla camera.
  * **Helper “ENHANCED” (attenzione, vedi nota):**

    * `window.showFirstPersonHelpers()` / `window.hideFirstPersonHelpers()`
    * `window.testFirstPersonTransition(machineType)`
    * `window.testCandyMachinePosition()`
    * `window.testRealisticHeights()`
    * `window.testNewHeight()`

    > **Nota importante:** queste funzioni chiamano metodi **non presenti** nel `CameraManager` (`showFirstPersonHelpers`, `testFirstPersonTransition`, ecc.). Così come sono, genereranno errori a runtime se usate. Servono implementazioni corrispondenti nel `CameraManager` o vanno rimosse.
  * **Altezze first-person:**

    * `window.setFirstPersonHeight(height)`
    * `window.setFirstPersonHeightLow/Normal/High/Tall/Giant()`
  * **Ricalcolo posizioni:**

    * `window.recalculateFirstPersonPositions()` (chiama il placeholder nel manager).

---

## Note e piccoli accorgimenti

* **`ThirdPersonCamera.setEnabled(...)`**: la flag non viene letta in `update()`. Non è dannoso (il `CameraManager` già controlla la modalità prima di chiamare `update`), ma è ridondante; o la si usa in `update` con `if (!this.enabled) return;`, oppure la si può eliminare.
* **Funzioni `CameraUtils` non implementate nel manager:** come detto, diverse funzioni globali referenziano metodi inesistenti. Implementale oppure rimuovile per evitare eccezioni.
* **Coerenza altezze first-person:** in `calculateFirstPersonPosition` il target è a `0.7 * height`, mentre in `setFirstPersonHeight` è a `0.75 * height`. Va benissimo se è voluto (target un po’ più alto quando si cambia a runtime), altrimenti uniforma.
* **`machineOffset` in `switchToMachineMode`**: è passato ma non usato. Se non serve, toglilo per chiarezza.
* **Delta time:** assicurati che `deltaTime` sia in **secondi** (non millisecondi), perché le durate sono in secondi.

Se vuoi, posso anche aggiungere dei commenti JSDoc sopra ogni funzione direttamente nel codice così li hai “in linea” con l’editor.

*/