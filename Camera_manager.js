import * as THREE from 'three';

/**
 * Third Person Camera System
 * Follows a target (player) from behind based on their rotation.
 */
export class ThirdPersonCamera {
    constructor(camera, target) {
        this.camera = camera;
        this.target = target; // PlayerController
        
        // Camera settings
        this.distance = 4.0;
        this.height = 4.0;
        
        // REMOVED: Properties for smooth following are no longer needed for a fixed camera.
        this.isAnimatingView = false;
        this.animationProgress = 0;
        this.animationDuration = 1.0;
        this.onAnimationComplete = null;
        this.startOffset = new THREE.Vector3();
        this.endOffset = new THREE.Vector3();
        
    }
    
    update(deltaTime) {
        if (!this.target) return;
        
        const playerPos = this.target.getPosition();
        
        if (this.isAnimatingView) {
            this.animationProgress += deltaTime / this.animationDuration;
            const t = this.easeInOutCubic(this.animationProgress);

            const currentOffset = new THREE.Vector3().lerpVectors(this.startOffset, this.endOffset, t);
            const idealPosition = playerPos.clone().add(currentOffset);
            
            this.camera.position.copy(idealPosition);

            const idealLookAt = playerPos.clone();
            idealLookAt.y += 2.5; // Look at the character's face
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

        // If the player is greeting, hold the camera's position
        if (this.target.isGreeting) {
            return;
        }
        
        const playerForward = this.target.getForwardDirection();
        
        // Calculate ideal camera position (behind player relative to player's rotation)
        const idealPosition = playerPos.clone();
        const cameraOffset = playerForward.clone().multiplyScalar(-this.distance);
        idealPosition.add(cameraOffset);
        idealPosition.y += this.height;
        
        // Calculate ideal look-at point (slightly above player)
        const idealLookAt = playerPos.clone();
        idealLookAt.y += 2.5;
        
        // Apply position and look-at directly for a fixed camera without interpolation
        this.camera.position.copy(idealPosition);
        this.camera.lookAt(idealLookAt);
    }

    animateToObjectView(duration) {
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

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    
    // Utility methods for runtime adjustment
    setDistance(distance) {
        this.distance = distance;
    }
    
    setHeight(height) {
        this.height = height;
    }
    
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
 * Camera Transition System
 * Handles smooth transitions between different camera modes/positions
 */
export class CameraTransition {
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
    
    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    setDuration(duration) {
        this.duration = duration;
    }
}

/**
 * Camera Manager
 * Central manager for all camera systems with debug utilities
 */
export class CameraManager {
    constructor(camera) {
        this.camera = camera;
        this.scene = null; // Will be set by initialize()
        this.thirdPersonCamera = null;
        this.cameraTransition = null;
        this.currentMode = 'exploration';
        
        // 🆕 FIRST PERSON SYSTEM
        this.firstPersonPositions = {
            claw_machine: null,
            candy_machine: null
        };
        
    }
    
    // 🆕 INITIALIZE WITH SCENE REFERENCE
    initialize(scene) {
        this.scene = scene;
    }
    
    initThirdPersonCamera(target) {
        // 🔧 INITIALIZE CAMERA TRANSITION FIRST
        this.cameraTransition = new CameraTransition(this.camera);
        
        this.thirdPersonCamera = new ThirdPersonCamera(this.camera, target);
        
        // Initialize camera position (behind player)
        const initialPlayerPos = target.getPosition();
        this.camera.position.set(initialPlayerPos.x, initialPlayerPos.y + 2.5, initialPlayerPos.z + 4);
        this.camera.lookAt(initialPlayerPos.x, initialPlayerPos.y + 1, initialPlayerPos.z);
        
        // Set initial camera state
        // REMOVED: Properties for smooth following are no longer needed for a fixed camera.
        
    }
    
    update(deltaTime) {
        if (this.currentMode === 'exploration' && this.thirdPersonCamera) {
            this.thirdPersonCamera.update(deltaTime);
        }
        
        // 🔧 ALWAYS UPDATE TRANSITION regardless of mode
        if (this.cameraTransition) {
            this.cameraTransition.update(deltaTime);
        }
    }
    
    switchToMachineMode(machineType, machineOffset, onComplete = null) {
        if (!this.cameraTransition) {
            return;
        }
        
        if (this.cameraTransition.isTransitioning) {
            return;
        }
        
        this.currentMode = machineType;
        
        // Use first person positions
        const firstPersonData = this.firstPersonPositions[machineType];
        
        if (!firstPersonData) {
            return;
        }
        
        // Start camera transition to first person position
        this.cameraTransition.startTransition(firstPersonData.position, firstPersonData.target, onComplete);
        
        // Disable third person camera
        if (this.thirdPersonCamera) {
            this.thirdPersonCamera.setEnabled(false);
        }
    }
    
    switchToExplorationMode(target, onComplete = null) {
        if (!this.cameraTransition || this.cameraTransition.isTransitioning) return;
        
        this.currentMode = 'exploration';
        
        // Get current player position for camera transition
        const playerPos = target.getPosition();
        const playerForward = target.getForwardDirection ? target.getForwardDirection() : new THREE.Vector3(0, 0, -1);
        
        // Calculate third person camera position
        const cameraPos = playerPos.clone();
        cameraPos.add(playerForward.clone().multiplyScalar(-4));
        cameraPos.y += 2.5;
        
        const cameraTarget = playerPos.clone();
        cameraTarget.y += 1;
        
        // Start transition back to third person
        this.cameraTransition.startTransition(cameraPos, cameraTarget, () => {
            // Re-enable third person camera
            if (this.thirdPersonCamera) {
                this.thirdPersonCamera.setEnabled(true);
            }
            if (onComplete) onComplete();
        });
    }
    
    // 🆕 FIRST PERSON CAMERA METHODS
    
    /**
     * Set the reference mesh position for first person camera calculation
     * @param {string} machineType - 'claw_machine' or 'candy_machine'
     * @param {THREE.Mesh} referenceMesh - The mesh to base camera position on
     * @param {THREE.Vector3} machineCenter - Center position of the machine
     * @param {number} machineSize - Size of the machine for boundary calculation
     */
    setFirstPersonReference(machineType, referenceMesh, machineCenter, machineSize = 3) {
        if (!referenceMesh) {
            return;
        }
        
        // Get world position of reference mesh
        referenceMesh.updateWorldMatrix(true, false);
        const referenceWorldPos = new THREE.Vector3();
        referenceMesh.getWorldPosition(referenceWorldPos);
        
        
        // Calculate which side of the machine the reference mesh is on
        const sideInfo = this.calculateMachineSide(referenceWorldPos, machineCenter, machineSize);
        
        // 🆕 SPECIAL HANDLING FOR CANDY MACHINE
        if (machineType === 'candy_machine') {
            // Force candy machine camera to be in front (positive Z) with extra distance
            sideInfo.side = 'front';
            sideInfo.direction = 'front';
            sideInfo.offset = new THREE.Vector3(0, 0, 1.5); // 🍬 Extra Z offset to ensure we're well outside
        }
        
        // Calculate first person camera position
        const fpData = this.calculateFirstPersonPosition(machineCenter, sideInfo, machineSize, machineType);
        
        this.firstPersonPositions[machineType] = fpData;
        
    }
    
    /**
     * Calculate which side of the machine a reference point is on
     */
    calculateMachineSide(referencePos, machineCenter, machineSize) {
        const dx = referencePos.x - machineCenter.x;
        const dz = referencePos.z - machineCenter.z;
        
        const absDx = Math.abs(dx);
        const absDz = Math.abs(dz);
        
        // Determine which axis has the greater distance
        if (absDx > absDz) {
            // Reference is more displaced on X axis
            return {
                side: dx > 0 ? 'right' : 'left',
                direction: dx > 0 ? 'right' : 'left',
                offset: new THREE.Vector3(dx > 0 ? 1 : -1, 0, 0)
            };
        } else {
            // Reference is more displaced on Z axis  
            return {
                side: dz > 0 ? 'back' : 'front',
                direction: dz > 0 ? 'back' : 'front', 
                offset: new THREE.Vector3(0, 0, dz > 0 ? 1 : -1)
            };
        }
    }
    
    /**
     * Calculate first person camera position based on machine side
     */
    calculateFirstPersonPosition(machineCenter, sideInfo, machineSize, machineType = null) {
        const playerHeight = 3.8; // 🆕 Elevated first person height for better view
        const baseDistance = machineSize * 0.8; // Increased base distance from machine edge
        
        // 🆕 MACHINE-SPECIFIC DISTANCE ADJUSTMENTS
        let extraDistance = 1.2; // Default additional distance
        
        if (machineType === 'candy_machine') {
            extraDistance = 1.5; // 🍬 Much more distance for candy machine to avoid being inside
        } else if (machineType === 'claw_machine') {
            extraDistance = 1.0; // 🤖 Standard distance for claw machine
        }
        
        const distanceFromMachine = baseDistance + extraDistance;
        
        // Calculate camera position on the same side as reference mesh
        const cameraPos = machineCenter.clone();
        cameraPos.add(sideInfo.offset.clone().multiplyScalar(distanceFromMachine));
        cameraPos.y = playerHeight;
        
        // Camera target is the center of the machine at a reasonable height
        const cameraTarget = machineCenter.clone();
        cameraTarget.y = playerHeight * 0.7; // Standard target for first person view
        
        
        return {
            position: cameraPos,
            target: cameraTarget,
            side: sideInfo.side
        };
    }
    
    /**
     * Check if first person positions are set for both machines
     */
    isFirstPersonReady() {
        return this.firstPersonPositions.claw_machine !== null && 
               this.firstPersonPositions.candy_machine !== null;
    }
    
    // 🆕 DEBUG AND TESTING METHODS
    
    
    
    
    
    
    
    /**
     * Set first person camera height for all machines
     */
    setFirstPersonHeight(height) {
        
        // For each machine, recalculate positions if they exist
        Object.keys(this.firstPersonPositions).forEach(machineType => {
            const fpData = this.firstPersonPositions[machineType];
            if (fpData) {
                // Update position height
                fpData.position.y = height;
                // Update target height (slightly lower)
                fpData.target.y = height * 0.75;
                
            }
        });
        
    }
    
    // Height presets
    setFirstPersonHeightLow() { this.setFirstPersonHeight(2.8); }
    setFirstPersonHeightNormal() { this.setFirstPersonHeight(3.8); }
    setFirstPersonHeightHigh() { this.setFirstPersonHeight(4.5); }
    setFirstPersonHeightTall() { this.setFirstPersonHeight(5.2); }
    setFirstPersonHeightGiant() { this.setFirstPersonHeight(6.5); }
    
    /**
     * Force recalculation of first person positions
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
    
    // Utility methods
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
    
    // REMOVED: setThirdPersonSpeed is no longer needed.
    
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
 * Utility Functions for Camera System
 */
export const CameraUtils = {
    // Initialize global camera control functions for debugging
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
        
        // REMOVED: setCameraSpeed is no longer needed.
        
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
                
                // 🆕 FIRST PERSON DEBUG INFO
                if (cameraManager.firstPersonPositions.claw_machine) {
                    const fp = cameraManager.firstPersonPositions.claw_machine;
                }
                if (cameraManager.firstPersonPositions.candy_machine) {
                    const fp = cameraManager.firstPersonPositions.candy_machine;
                }
            } else {
            }
        };
        
        // 🆕 FIRST PERSON TESTING FUNCTIONS
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
        
        // 🆕 ENHANCED TESTING FUNCTIONS USING CAMERA MANAGER METHODS
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
                // We need to pass machine offsets - these will be provided by the main app
                const machineOffset = new THREE.Vector3(7, 0, 0); // Default claw machine offset
                const candyMachineOffset = new THREE.Vector3(-7, 0, 0); // Default candy machine offset
                
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
        
        // 🆕 FIRST PERSON HEIGHT ADJUSTMENT
        window.setFirstPersonHeight = (height) => {
            if (cameraManager) {
                cameraManager.setFirstPersonHeight(height);
            } else {
            }
        };
        
        // 🆕 QUICK HEIGHT PRESETS - REALISTIC HEIGHTS
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
        
        // 🆕 FORCE RECALCULATION OF POSITIONS
        window.recalculateFirstPersonPositions = () => {
            if (cameraManager) {
                cameraManager.recalculateFirstPersonPositions();
            } else {
            }
        };
        
    }
}; 