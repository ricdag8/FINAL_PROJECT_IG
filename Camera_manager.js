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
        
        console.log("📷 Third person camera created");
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
        console.log(`📷 Camera distance set to: ${distance}`);
    }
    
    setHeight(height) {
        this.height = height;
        console.log(`📷 Camera height set to: ${height}`);
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
        
        console.log("🎬 Camera transition started");
    }
    
    update(deltaTime) {
        if (!this.isTransitioning) return;
        
        const oldProgress = this.progress;
        this.progress += deltaTime / this.duration;
        
        if (this.progress >= 1.0) {
            this.progress = 1.0;
            this.isTransitioning = false;
            
            console.log("✅ Camera transition completed!");
            
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
        console.log(`🎬 Camera transition duration set to: ${duration}s`);
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
        
        console.log("🎥 Camera manager created");
    }
    
    // 🆕 INITIALIZE WITH SCENE REFERENCE
    initialize(scene) {
        this.scene = scene;
        console.log("🎬 Camera manager initialized with scene reference");
    }
    
    initThirdPersonCamera(target) {
        // 🔧 INITIALIZE CAMERA TRANSITION FIRST
        this.cameraTransition = new CameraTransition(this.camera);
        console.log("🎬 Camera transition system initialized");
        
        this.thirdPersonCamera = new ThirdPersonCamera(this.camera, target);
        
        // Initialize camera position (behind player)
        const initialPlayerPos = target.getPosition();
        this.camera.position.set(initialPlayerPos.x, initialPlayerPos.y + 2.5, initialPlayerPos.z + 4);
        this.camera.lookAt(initialPlayerPos.x, initialPlayerPos.y + 1, initialPlayerPos.z);
        
        // Set initial camera state
        // REMOVED: Properties for smooth following are no longer needed for a fixed camera.
        
        console.log("📷 Third person camera initialized with transition system");
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
            console.error("❌ Camera transition system not initialized!");
            return;
        }
        
        if (this.cameraTransition.isTransitioning) {
            console.warn("⚠️ Camera transition already in progress, ignoring request");
            return;
        }
        
        console.log(`🎮 Switching camera to ${machineType} FIRST PERSON mode`);
        this.currentMode = machineType;
        
        // Use first person positions
        const firstPersonData = this.firstPersonPositions[machineType];
        
        if (!firstPersonData) {
            console.error(`❌ First person position not set for ${machineType}`);
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
        
        console.log(`🚶 Switching camera to exploration mode`);
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
            console.error(`❌ Reference mesh not provided for ${machineType}`);
            return;
        }
        
        // Get world position of reference mesh
        referenceMesh.updateWorldMatrix(true, false);
        const referenceWorldPos = new THREE.Vector3();
        referenceMesh.getWorldPosition(referenceWorldPos);
        
        console.log(`🎯 Reference mesh for ${machineType} at: (${referenceWorldPos.x.toFixed(2)}, ${referenceWorldPos.y.toFixed(2)}, ${referenceWorldPos.z.toFixed(2)})`);
        console.log(`🏭 Machine center: (${machineCenter.x.toFixed(2)}, ${machineCenter.y.toFixed(2)}, ${machineCenter.z.toFixed(2)})`);
        
        // Calculate which side of the machine the reference mesh is on
        const sideInfo = this.calculateMachineSide(referenceWorldPos, machineCenter, machineSize);
        console.log(`📍 Reference mesh is on the ${sideInfo.side} side of the machine`);
        
        // 🆕 SPECIAL HANDLING FOR CANDY MACHINE
        if (machineType === 'candy_machine') {
            // Force candy machine camera to be in front (positive Z) with extra distance
            sideInfo.side = 'front';
            sideInfo.direction = 'front';
            sideInfo.offset = new THREE.Vector3(0, 0, 1.5); // 🍬 Extra Z offset to ensure we're well outside
            console.log(`🍬 Forced candy machine camera to FRONT side with extra Z offset`);
        }
        
        // Calculate first person camera position
        const fpData = this.calculateFirstPersonPosition(machineCenter, sideInfo, machineSize, machineType);
        
        this.firstPersonPositions[machineType] = fpData;
        
        console.log(`📷 First person position for ${machineType}:`);
        console.log(`   Camera: (${fpData.position.x.toFixed(2)}, ${fpData.position.y.toFixed(2)}, ${fpData.position.z.toFixed(2)})`);
        console.log(`   Target: (${fpData.target.x.toFixed(2)}, ${fpData.target.y.toFixed(2)}, ${fpData.target.z.toFixed(2)})`);
        console.log(`   👁️ FIRST PERSON HEIGHT: ${fpData.position.y.toFixed(1)}m`);
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
            console.log(`🍬 Using candy machine SAFE distance: ${extraDistance}m`);
        } else if (machineType === 'claw_machine') {
            extraDistance = 1.0; // 🤖 Standard distance for claw machine
            console.log(`🤖 Using claw machine standard distance: ${extraDistance}m`);
        }
        
        const distanceFromMachine = baseDistance + extraDistance;
        
        // Calculate camera position on the same side as reference mesh
        const cameraPos = machineCenter.clone();
        cameraPos.add(sideInfo.offset.clone().multiplyScalar(distanceFromMachine));
        cameraPos.y = playerHeight;
        
        // Camera target is the center of the machine at a reasonable height
        const cameraTarget = machineCenter.clone();
        cameraTarget.y = playerHeight * 0.7; // Standard target for first person view
        
        console.log(`📐 Final distance for ${machineType}: ${distanceFromMachine.toFixed(2)}m (base: ${baseDistance.toFixed(2)} + extra: ${extraDistance})`);
        
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
     * Show visual helpers for first person camera positions
     */
    showFirstPersonHelpers() {
        if (!this.scene) {
            console.log("❌ Scene not available in camera manager");
            return;
        }
        
        // Remove existing helpers first
        this.scene.children.forEach(child => {
            if (child.name && child.name.includes('FirstPersonHelper')) {
                this.scene.remove(child);
            }
        });
        
        // Create helpers for both machines
        Object.keys(this.firstPersonPositions).forEach(machineType => {
            const fpData = this.firstPersonPositions[machineType];
            if (!fpData) return;
            
            // Camera position helper (red sphere)
            const cameraPosGeometry = new THREE.SphereGeometry(0.1, 16, 16);
            const cameraPosMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const cameraPosHelper = new THREE.Mesh(cameraPosGeometry, cameraPosMaterial);
            cameraPosHelper.position.copy(fpData.position);
            cameraPosHelper.name = `${machineType}FirstPersonHelperCamera`;
            this.scene.add(cameraPosHelper);
            
            // Target helper (green sphere)
            const targetGeometry = new THREE.SphereGeometry(0.08, 16, 16);
            const targetMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const targetHelper = new THREE.Mesh(targetGeometry, targetMaterial);
            targetHelper.position.copy(fpData.target);
            targetHelper.name = `${machineType}FirstPersonHelperTarget`;
            this.scene.add(targetHelper);
            
            // Line connecting camera to target
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([fpData.position, fpData.target]);
            const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.name = `${machineType}FirstPersonHelperLine`;
            this.scene.add(line);
            
            console.log(`📍 Added first person helpers for ${machineType}`);
        });
        
        console.log("👁️ First person helpers visible - Red: camera, Green: target, White: direction");
    }
    
    /**
     * Hide all first person visual helpers
     */
    hideFirstPersonHelpers() {
        if (!this.scene) return;
        
        let removed = 0;
        this.scene.children.forEach(child => {
            if (child.name && child.name.includes('FirstPersonHelper')) {
                this.scene.remove(child);
                removed++;
            }
        });
        console.log(`🙈 Removed ${removed} first person helpers`);
    }
    
    /**
     * Test first person camera transition for a specific machine
     */
    testFirstPersonTransition(machineType = 'claw_machine', machineOffset) {
        console.log(`🧪 Testing first person transition for ${machineType}`);
        
        if (!machineOffset) {
            console.error("❌ Machine offset not provided for transition test");
            return;
        }
        
        // Simulate entering machine mode
        this.switchToMachineMode(machineType, machineOffset, () => {
            console.log(`✅ Test transition to ${machineType} completed!`);
            
            // Auto-return to exploration mode after 3 seconds
            setTimeout(() => {
                // For testing, we need a mock player controller
                const mockPlayerController = {
                    getPosition: () => new THREE.Vector3(0, 0, 0),
                    getForwardDirection: () => new THREE.Vector3(0, 0, -1)
                };
                
                this.switchToExplorationMode(mockPlayerController, () => {
                    console.log("✅ Test transition back to exploration completed!");
                });
            }, 3000);
        });
    }
    
    /**
     * Test candy machine position specifically
     */
    testCandyMachinePosition(candyMachineOffset) {
        console.log("🧪 Quick test: Candy machine first person position");
        
        // Show helpers first
        this.showFirstPersonHelpers();
        
        // Wait a bit then test transition
        setTimeout(() => {
            this.testFirstPersonTransition('candy_machine', candyMachineOffset);
        }, 1000);
        
        console.log("👁️ Visual helpers shown, transition will start in 1 second");
    }
    
    /**
     * Test multiple realistic camera heights
     */
    testRealisticHeights(machineOffset) {
        console.log("👁️ Testing realistic camera heights...");
        
        const heights = [2.8, 3.8, 4.5, 5.2, 6.5];
        let currentIndex = 0;
        
        const testNextHeight = () => {
            if (currentIndex >= heights.length) {
                console.log("✅ All height tests completed!");
                this.setFirstPersonHeightNormal(); // Return to normal
                return;
            }
            
            const height = heights[currentIndex];
            console.log(`📏 Testing height: ${height}m`);
            this.setFirstPersonHeight(height);
            
            // Show current position
            this.showFirstPersonHelpers();
            
            // Test transition
            setTimeout(() => {
                this.testFirstPersonTransition('claw_machine', machineOffset);
                
                // Move to next height after 3 seconds
                setTimeout(() => {
                    this.hideFirstPersonHelpers();
                    currentIndex++;
                    testNextHeight();
                }, 3000);
            }, 1000);
        };
        
        testNextHeight();
    }
    
    /**
     * Quick test of new default height (3.8m)
     */
    testNewHeight(machineOffset, candyMachineOffset) {
        console.log("👁️ Testing new default height (3.8m)...");
        
        // Set to new default height
        this.setFirstPersonHeightNormal();
        
        // Show helpers
        this.showFirstPersonHelpers();
        
        // Test both machines quickly
        setTimeout(() => {
            console.log("🤖 Testing claw machine...");
            this.testFirstPersonTransition('claw_machine', machineOffset);
            
            setTimeout(() => {
                console.log("🍬 Testing candy machine...");
                this.testFirstPersonTransition('candy_machine', candyMachineOffset);
                
                setTimeout(() => {
                    this.hideFirstPersonHelpers();
                    console.log("✅ New height test completed!");
                }, 3000);
            }, 4000);
        }, 1000);
    }
    
    /**
     * Set first person camera height for all machines
     */
    setFirstPersonHeight(height) {
        console.log(`🔧 Adjusting first person camera height to: ${height}`);
        
        // For each machine, recalculate positions if they exist
        Object.keys(this.firstPersonPositions).forEach(machineType => {
            const fpData = this.firstPersonPositions[machineType];
            if (fpData) {
                // Update position height
                fpData.position.y = height;
                // Update target height (slightly lower)
                fpData.target.y = height * 0.75;
                
                console.log(`📷 Updated ${machineType} camera height to ${height}m`);
            }
        });
        
        console.log("✅ First person heights updated for all machines");
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
        console.log("🔄 Forcing recalculation of first person positions...");
        
        // Get current positions and machine types
        const machines = Object.keys(this.firstPersonPositions);
        machines.forEach(machineType => {
            const fpData = this.firstPersonPositions[machineType];
            if (fpData) {
                console.log(`🔄 Recalculating ${machineType} position...`);
                console.log(`   Current: (${fpData.position.x.toFixed(2)}, ${fpData.position.y.toFixed(2)}, ${fpData.position.z.toFixed(2)})`);
            }
        });
        
        console.log("💡 Use setFirstPersonHeight() to adjust heights");
        console.log("💡 Reload page to completely recalculate positions");
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
                console.log("❌ Camera manager not found");
            }
        };
        
        window.setCameraHeight = (height) => {
            if (cameraManager) {
                cameraManager.setThirdPersonHeight(height);
            } else {
                console.log("❌ Camera manager not found");
            }
        };
        
        // REMOVED: setCameraSpeed is no longer needed.
        
        window.setTransitionDuration = (duration) => {
            if (cameraManager) {
                cameraManager.setTransitionDuration(duration);
            } else {
                console.log("❌ Camera manager not found");
            }
        };
        
        window.debugCamera = () => {
            if (cameraManager) {
                const info = cameraManager.getDebugInfo();
                console.log("🎥 Camera Debug Info:");
                console.log(`📋 Current mode: ${info.currentMode}`);
                console.log(`📷 Camera position: (${info.cameraPosition.x.toFixed(2)}, ${info.cameraPosition.y.toFixed(2)}, ${info.cameraPosition.z.toFixed(2)})`);
                console.log(`🎬 Is transitioning: ${info.isTransitioning}`);
                
                if (info.thirdPerson) {
                    const tp = info.thirdPerson;
                    console.log(`👤 Player position: (${tp.playerPosition.x.toFixed(2)}, ${tp.playerPosition.y.toFixed(2)}, ${tp.playerPosition.z.toFixed(2)})`);
                    const pfd = tp.playerForwardDirection;
                    console.log(`🎯 Player forward: (${pfd.x.toFixed(2)}, ${pfd.y.toFixed(2)}, ${pfd.z.toFixed(2)})`);
                    console.log(`📏 Distance: ${tp.distance}, Height: ${tp.height}`);
                }
                
                // 🆕 FIRST PERSON DEBUG INFO
                console.log(`🔫 First person ready: ${cameraManager.isFirstPersonReady()}`);
                if (cameraManager.firstPersonPositions.claw_machine) {
                    const fp = cameraManager.firstPersonPositions.claw_machine;
                    console.log(`🤖 Claw FP: Pos(${fp.position.x.toFixed(2)}, ${fp.position.y.toFixed(2)}, ${fp.position.z.toFixed(2)}) Side: ${fp.side}`);
                }
                if (cameraManager.firstPersonPositions.candy_machine) {
                    const fp = cameraManager.firstPersonPositions.candy_machine;
                    console.log(`🍬 Candy FP: Pos(${fp.position.x.toFixed(2)}, ${fp.position.y.toFixed(2)}, ${fp.position.z.toFixed(2)}) Side: ${fp.side}`);
                }
            } else {
                console.log("❌ Camera manager not found");
            }
        };
        
        // 🆕 FIRST PERSON TESTING FUNCTIONS
        window.testFirstPersonClaw = () => {
            if (cameraManager && cameraManager.firstPersonPositions.claw_machine) {
                const fp = cameraManager.firstPersonPositions.claw_machine;
                cameraManager.camera.position.copy(fp.position);
                cameraManager.camera.lookAt(fp.target);
                console.log("📷 Camera moved to claw machine first person position");
            } else {
                console.log("❌ Claw machine first person position not set");
            }
        };
        
        window.testFirstPersonCandy = () => {
            if (cameraManager && cameraManager.firstPersonPositions.candy_machine) {
                const fp = cameraManager.firstPersonPositions.candy_machine;
                cameraManager.camera.position.copy(fp.position);
                cameraManager.camera.lookAt(fp.target);
                console.log("📷 Camera moved to candy machine first person position");
            } else {
                console.log("❌ Candy machine first person position not set");
            }
        };
        
        // 🆕 ENHANCED TESTING FUNCTIONS USING CAMERA MANAGER METHODS
        window.showFirstPersonHelpers = () => {
            if (cameraManager) {
                cameraManager.showFirstPersonHelpers();
            } else {
                console.log("❌ Camera manager not found");
            }
        };
        
        window.hideFirstPersonHelpers = () => {
            if (cameraManager) {
                cameraManager.hideFirstPersonHelpers();
            } else {
                console.log("❌ Camera manager not found");
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
                console.log("❌ Camera manager not found");
            }
        };
        
        window.testCandyMachinePosition = () => {
            if (cameraManager) {
                const candyMachineOffset = new THREE.Vector3(-7, 0, 0);
                cameraManager.testCandyMachinePosition(candyMachineOffset);
            } else {
                console.log("❌ Camera manager not found");
            }
        };
        
        window.testRealisticHeights = () => {
            if (cameraManager) {
                const machineOffset = new THREE.Vector3(7, 0, 0);
                cameraManager.testRealisticHeights(machineOffset);
            } else {
                console.log("❌ Camera manager not found");
            }
        };
        
        window.testNewHeight = () => {
            if (cameraManager) {
                const machineOffset = new THREE.Vector3(7, 0, 0);
                const candyMachineOffset = new THREE.Vector3(-7, 0, 0);
                cameraManager.testNewHeight(machineOffset, candyMachineOffset);
            } else {
                console.log("❌ Camera manager not found");
            }
        };
        
        // 🆕 FIRST PERSON HEIGHT ADJUSTMENT
        window.setFirstPersonHeight = (height) => {
            if (cameraManager) {
                cameraManager.setFirstPersonHeight(height);
            } else {
                console.log("❌ Camera manager not found");
            }
        };
        
        // 🆕 QUICK HEIGHT PRESETS - REALISTIC HEIGHTS
        window.setFirstPersonHeightLow = () => {
            if (cameraManager) {
                cameraManager.setFirstPersonHeightLow();
            } else {
                console.log("❌ Camera manager not found");
            }
        };
        
        window.setFirstPersonHeightNormal = () => {
            if (cameraManager) {
                cameraManager.setFirstPersonHeightNormal();
            } else {
                console.log("❌ Camera manager not found");
            }
        };
        
        window.setFirstPersonHeightHigh = () => {
            if (cameraManager) {
                cameraManager.setFirstPersonHeightHigh();
            } else {
                console.log("❌ Camera manager not found");
            }
        };
        
        window.setFirstPersonHeightTall = () => {
            if (cameraManager) {
                cameraManager.setFirstPersonHeightTall();
            } else {
                console.log("❌ Camera manager not found");
            }
        };
        
        window.setFirstPersonHeightGiant = () => {
            if (cameraManager) {
                cameraManager.setFirstPersonHeightGiant();
            } else {
                console.log("❌ Camera manager not found");
            }
        };
        
        // 🆕 FORCE RECALCULATION OF POSITIONS
        window.recalculateFirstPersonPositions = () => {
            if (cameraManager) {
                cameraManager.recalculateFirstPersonPositions();
            } else {
                console.log("❌ Camera manager not found");
            }
        };
        
        console.log("🎛️ Global camera controls initialized");
        console.log("Available commands: setCameraDistance(), setCameraHeight(), setTransitionDuration(), debugCamera()");
        console.log("🔫 First person commands: testFirstPersonClaw(), testFirstPersonCandy(), testFirstPersonTransition()");
        console.log("🍬 Quick tests: testCandyMachinePosition(), testRealisticHeights(), testNewHeight()");
        console.log("📏 First person settings: setFirstPersonHeight(height), recalculateFirstPersonPositions()");
        console.log("📐 Height presets: setFirstPersonHeightLow(), setFirstPersonHeightNormal(), setFirstPersonHeightHigh(), setFirstPersonHeightTall(), setFirstPersonHeightGiant()");
        console.log("👁️ Visual helpers: showFirstPersonHelpers(), hideFirstPersonHelpers()");
    }
}; 