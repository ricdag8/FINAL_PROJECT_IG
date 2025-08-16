import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RigidBody } from './physics_engine.js';
import { MeshBVH } from 'https://unpkg.com/three-mesh-bvh@0.7.0/build/index.module.js';

export class PlayerController {
    constructor(scene, physicsEngine, roomSetupManager = null, audioManager = null) {
        this.scene = scene;
        this.physicsEngine = physicsEngine;
        this.roomSetupManager = roomSetupManager; // 🆕 Reference to room setup manager
        this.audioManager = audioManager; // 🆕 Store the audio manager
        this.moveSpeed = 3.0; // 🆕 Reduced speed for more controlled movement
        this.rotationSpeed = 3.0;
        
        // Movement state
        this.moveForward = false;
        this.moveLeft = false;
        this.moveRight = false;
        
        // Character model properties
        this.mesh = null;
        this.animations = {};
        this.mixer = null;
        this.currentAnimation = null;
        this.currentAnimationState = 'idle';
        this.isLoaded = false;
        this.debugEnabled = false;
        this.isGreeting = false; // Add this state
        this.characterName = null; // 🆕 To store the character's name for sounds
        
        // Create/load player character
        // REMOVED: this.loadCharacter();
        
        console.log("🚶 Player controller created, awaiting character load.");
    }
    
    loadCharacter(modelUrl, characterName) {
        return new Promise((resolve, reject) => {
            // Try to load the Hoodie Character model
            const loader = new GLTFLoader();
            loader.load(modelUrl, 
                (gltf) => {
                    console.log(`🎭 Character model ${modelUrl} loaded successfully`);
                    // 🆕 Use the provided name directly, this is more robust
                    this.characterName = characterName;
                    this.setupCharacterModel(gltf);
                    resolve();
                },
                (progress) => {
                    console.log("📦 Character loading progress:", progress);
                },
                (error) => {
                    console.warn(`⚠️ Could not load ${modelUrl}, using fallback:`, error);
                    this.createFallbackMesh();
                    reject(error);
                }
            );
        });
    }
    
    setupCharacterModel(gltf) {
        // Remove fallback mesh if it exists
        if (this.mesh && this.scene.getObjectById(this.mesh.id)) {
            this.scene.remove(this.mesh);
        }
        
        this.mesh = gltf.scene;
        this.mesh.position.set(0, 0, 3); // Starting position
        this.mesh.scale.setScalar(2.5); // Adjust scale as needed
        
        // Enable shadows
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        // Setup animations
        if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(this.mesh);
            const loadedAnimationNames = [];
            
            gltf.animations.forEach((clip) => {
                // 🆕 REMOVE PREFIX FROM ANIMATION NAMES
                // Handle names like "characterarmature|idle" -> "idle"
                let cleanName = clip.name.toLowerCase();
                if (cleanName.includes('|')) {
                    cleanName = cleanName.split('|')[1]; // Take part after the '|'
                }
                
                this.animations[cleanName] = this.mixer.clipAction(clip);
                loadedAnimationNames.push(cleanName);
            });
            
            console.log(`✅ Animations processed. Available animations: ${loadedAnimationNames.join(', ')}`);
            
            // Start with idle animation if available
            if (this.animations.idle) {
                this.currentAnimation = this.animations.idle;
                this.currentAnimation.play();
                console.log("▶️ Started with IDLE animation");
            } else {
                console.log("⚠️ No 'idle' animation found after cleanup");
            }
        }
        
        this.scene.add(this.mesh);
        this.isLoaded = true;
        console.log("✅ Character setup complete");
    }
    
    createFallbackMesh() {
        // Simple capsule for the player (fallback)
        const geometry = new THREE.CapsuleGeometry(0.3, 1.2, 4, 8);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x4169E1, // Royal blue
            roughness: 0.7,
            metalness: 0.1
        });
        
        // 🆕 CONFIGURE GEOMETRY FOR PHYSICS COLLISIONS
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        
        // Create BVH tree for collision detection
        try {
            geometry.boundsTree = new MeshBVH(geometry);
            console.log("✅ Player BVH tree created successfully");
        } catch (error) {
            console.error("❌ Error creating player BVH tree:", error);
        }
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.position.set(0, 0.5, 3); // Starting position
        this.scene.add(this.mesh);
        this.isLoaded = true;
        
        console.log("🤖 Fallback character mesh created");
    }
    
    setMoving(direction, state) {
        if (this.isGreeting) return;
        
        switch(direction) {
            case 'forward': this.moveForward = state; break;
            case 'left': this.moveLeft = state; break;
            case 'right': this.moveRight = state; break;
        }
        
        // 🆕 DEBUG - Log movement changes (will be reduced after testing)
        if (this.debugEnabled) {
            console.log(`🎮 Movement Debug: ${direction} = ${state}`);
            const isPressingAnyKey = this.moveForward || this.moveLeft || this.moveRight;
            console.log(`🚶 Is pressing a key: ${isPressingAnyKey}`);
        }
    }
    
    switchToAnimation(animationName) {
        if (!this.animations || !this.mixer) {
            console.log("❌ Cannot switch animation - missing animations or mixer");
            return;
        }
        
        const targetAnimation = this.animations[animationName.toLowerCase()];
        
        if (!targetAnimation) {
            console.log(`❌ Animation '${animationName}' not found in available animations:`, Object.keys(this.animations));
            return;
        }
        
        // Fade out current animation
        if (this.currentAnimation && this.currentAnimation !== targetAnimation) {
            this.currentAnimation.fadeOut(0.3);
        }
        
        // Fade in new animation
        targetAnimation.reset().fadeIn(0.3).play();
        this.currentAnimation = targetAnimation;
        
        if (this.debugEnabled) {
            console.log(`🎭 Switched to animation: ${animationName}`);
        }
    }
    
    update(deltaTime) {
        if (!this.mesh || this.isGreeting) return;
        
        // Handle rotation from A/D keys
        let rotation = 0;
        if (this.moveLeft) rotation = 1;  // A key for counter-clockwise rotation (left)
        if (this.moveRight) rotation = -1; // D key for clockwise rotation (right)
        
        this.mesh.rotation.y += rotation * this.rotationSpeed * deltaTime;
            
        // Handle forward movement from W key
        if (this.moveForward) {
            const forward = this.getForwardDirection();
            const velocity = forward.multiplyScalar(this.moveSpeed * deltaTime);
            
            // Store current position before movement
            const previousPosition = this.mesh.position.clone();
            
            // Apply movement
            this.mesh.position.add(velocity);
            
            // Check for collisions and handle them
            this.handleMachineCollisions();
            this.constrainToRoom();
        }
        
        // Handle animations
        const desiredAnimation = this.moveForward ? 'walk' : 'idle';
        if (this.currentAnimationState !== desiredAnimation) {
            this.currentAnimationState = desiredAnimation;
            this.switchToAnimation(this.currentAnimationState);
            }
            
        // REMOVED: mixer update will be handled by the main animate loop
        
        this.mesh.position.y = this.isLoaded && this.animations.idle ? 0 : 0.5;
    }
    
    // 🆕 NEW METHOD TO UPDATE ONLY THE MIXER
    updateAnimation(deltaTime) {
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }
    }

    async performGreeting(cameraManager) {
        if (this.isGreeting || !cameraManager) return;

        this.isGreeting = true;
        this.setMoving('forward', false);
        this.setMoving('left', false);
        this.setMoving('right', false);
        
        this.update(0); 

        await cameraManager.animateCameraToObject(1.0);

        // 🆕 Play sound when greeting
        if (this.audioManager && this.characterName) {
            this.audioManager.playSound(`${this.characterName}_wave`);
        }
        
        await this.playOneShotAnimation('wave');
        await cameraManager.animateCameraToOriginal(1.0);
        
        this.isGreeting = false;
    }

    playOneShotAnimation(animationName) {
        return new Promise((resolve, reject) => {
            const animation = this.animations[animationName.toLowerCase()];
            if (!animation) {
                console.error(`❌ Animation '${animationName}' not found!`);
                reject(`Animation not found: ${animationName}`);
                return;
            }

            const clip = animation.getClip();
            if (clip.duration === 0) {
                console.warn(`⚠️ Animation '${animationName}' has 0 duration.`);
                resolve();
                return;
            }
            
            if (this.currentAnimation) {
                this.currentAnimation.fadeOut(0.2);
            }

            animation.reset()
                .setLoop(THREE.LoopOnce, 1)
                .fadeIn(0.2)
                .play();
            animation.clampWhenFinished = true;
            this.currentAnimation = animation;

            const durationInMs = clip.duration * 1000;
            setTimeout(() => {
                this.switchToAnimation('idle');
                this.currentAnimationState = 'idle';
                resolve();
            }, durationInMs);
        });
    }

    handleMachineCollisions() {
        const playerRadius = 0.5; // Collision radius around player
        
        // Get machine positions dynamically from RoomSetupManager if available
        let machines;
        if (this.roomSetupManager) {
            machines = [
                {
                    name: 'Claw Machine',
                    center: this.roomSetupManager.getMachineOffset(),
                    size: { x: 3, z: 3 }
                },
                {
                    name: 'Candy Machine', 
                    center: this.roomSetupManager.getCandyMachineOffset(),
                    size: { x: 3, z: 3 }
                },
                {
                    name: 'Popcorn Machine',
                    center: new THREE.Vector3(-3, 0.7, -2), // 🍿 Position from main.js:686
                    size: { x: 2, z: 2 } // 🍿 Scaled down size (0.5 scale factor)
                }
            ];
        } else {
            // Fallback to hardcoded positions if no room manager available
            machines = [
                {
                    name: 'Claw Machine',
                    center: new THREE.Vector3(10, 0, 0),
                    size: { x: 3, z: 3 }
                },
                {
                    name: 'Candy Machine', 
                    center: new THREE.Vector3(-15, 0, 0),
                    size: { x: 3, z: 3 }
                },
                {
                    name: 'Popcorn Machine',
                    center: new THREE.Vector3(-3, 0.7, -2),
                    size: { x: 2, z: 2 }
                }
            ];
        }
        
        machines.forEach(machine => {
            const machineMinX = machine.center.x - machine.size.x / 2 - playerRadius;
            const machineMaxX = machine.center.x + machine.size.x / 2 + playerRadius;
            const machineMinZ = machine.center.z - machine.size.z / 2 - playerRadius;
            const machineMaxZ = machine.center.z + machine.size.z / 2 + playerRadius;
            
            // If player is inside the machine's exclusion zone, apply pushback
            if (this.mesh.position.x >= machineMinX && this.mesh.position.x <= machineMaxX &&
                this.mesh.position.z >= machineMinZ && this.mesh.position.z <= machineMaxZ) {
                
                // Calculate penetration distances for each side
                const penetrationLeft = this.mesh.position.x - machineMinX;
                const penetrationRight = machineMaxX - this.mesh.position.x;
                const penetrationFront = this.mesh.position.z - machineMinZ;
                const penetrationBack = machineMaxZ - this.mesh.position.z;
                
                // Find the minimum penetration (closest exit)
                const minPenetration = Math.min(penetrationLeft, penetrationRight, penetrationFront, penetrationBack);
                
                // If penetration is very small, use smooth pushback
                if (minPenetration > 0.05) {
                    const pushbackStrength = 0.15;
                    const maxPushback = 0.2;
                    const pushbackForce = Math.min(minPenetration * pushbackStrength, maxPushback);
                    
                    // Apply gradual pushback in the direction of least resistance
                    if (minPenetration === penetrationLeft) {
                        this.mesh.position.x -= pushbackForce;
                    } else if (minPenetration === penetrationRight) {
                        this.mesh.position.x += pushbackForce;
                    } else if (minPenetration === penetrationFront) {
                        this.mesh.position.z -= pushbackForce;
                    } else if (minPenetration === penetrationBack) {
                        this.mesh.position.z += pushbackForce;
                    }
                } else {
                    // If penetration is deep, use stronger correction
                    const safetyMargin = 0.02;
                    if (minPenetration === penetrationLeft) {
                        this.mesh.position.x = machineMinX - safetyMargin;
                    } else if (minPenetration === penetrationRight) {
                        this.mesh.position.x = machineMaxX + safetyMargin;
                    } else if (minPenetration === penetrationFront) {
                        this.mesh.position.z = machineMinZ - safetyMargin;
                    } else if (minPenetration === penetrationBack) {
                        this.mesh.position.z = machineMaxZ + safetyMargin;
                    }
                }
            }
        });
    }
    
    constrainToRoom() {
        // Define room bounds (adjusted to match new room size: 40x20)
        const roomBounds = {
            minX: -20,  // Half of width (40/2 = 20)
            maxX: 20,   // Half of width
            minZ: -10,  // Half of depth (20/2 = 10) 
            maxZ: 10    // Half of depth
        };
        
        // Smooth boundary constraint with soft pushback
        const boundaryPushback = 0.1; // Gentle pushback force for room boundaries
        const boundaryBuffer = 0.2; // Buffer zone before applying pushback
        
        // Smooth X axis constraint
        if (this.mesh.position.x < roomBounds.minX + boundaryBuffer) {
            const penetration = (roomBounds.minX + boundaryBuffer) - this.mesh.position.x;
            this.mesh.position.x += Math.min(penetration * boundaryPushback, 0.05);
        } else if (this.mesh.position.x > roomBounds.maxX - boundaryBuffer) {
            const penetration = this.mesh.position.x - (roomBounds.maxX - boundaryBuffer);
            this.mesh.position.x -= Math.min(penetration * boundaryPushback, 0.05);
        }
        
        // Smooth Z axis constraint
        if (this.mesh.position.z < roomBounds.minZ + boundaryBuffer) {
            const penetration = (roomBounds.minZ + boundaryBuffer) - this.mesh.position.z;
            this.mesh.position.z += Math.min(penetration * boundaryPushback, 0.05);
        } else if (this.mesh.position.z > roomBounds.maxZ - boundaryBuffer) {
            const penetration = this.mesh.position.z - (roomBounds.maxZ - boundaryBuffer);
            this.mesh.position.z -= Math.min(penetration * boundaryPushback, 0.05);
        }
        
        // Hard boundaries as fallback (in case player somehow gets too far)
        this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, roomBounds.minX, roomBounds.maxX);
        this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, roomBounds.minZ, roomBounds.maxZ);
    }
    
    getPosition() {
        // Return mesh position directly (already THREE.Vector3)
        return this.mesh ? this.mesh.position.clone() : new THREE.Vector3();
    }
    
    getForwardDirection() {
        return this.mesh ? new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion) : new THREE.Vector3(0, 0, 1);
    }
    
    // 🆕 DEBUG AND TESTING METHODS
    enableDebug() {
        this.debugEnabled = true;
        console.log("🔍 Player debug logging enabled");
    }
    
    disableDebug() {
        this.debugEnabled = false;
        console.log("🔇 Player debug logging disabled");
    }
    
    debugAnimationState() {
        if (!this.isLoaded) {
            console.log("❌ Character not loaded yet");
            return;
        }
        
        console.log("🎭 ANIMATION DEBUG STATE:");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`📦 Model loaded: ${this.isLoaded}`);
        console.log(`🎬 Mixer active: ${this.mixer !== null}`);
        console.log(`📚 Available animations:`, Object.keys(this.animations));
        console.log(`▶️ Current animation: ${this.currentAnimation ? this.currentAnimation.getClip().name : 'None'}`);
        console.log(`🚶 Movement state:`, {
            forward: this.moveForward,
            left: this.moveLeft,
            right: this.moveRight
        });
        console.log(`📍 Position:`, this.mesh.position);
        console.log(`🧭 Rotation:`, this.mesh.rotation);
    }
    
    listAvailableAnimations() {
        if (!this.isLoaded || !this.animations) {
            console.log("❌ No animations available (character not loaded)");
            return;
        }
        
        console.log("🎬 AVAILABLE ANIMATIONS:");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━");
        Object.keys(this.animations).forEach((name, index) => {
            const isActive = this.currentAnimation && this.currentAnimation.getClip().name.toLowerCase() === name;
            console.log(`${index + 1}️⃣ ${name} ${isActive ? '(ACTIVE)' : ''}`);
        });
        console.log("");
        console.log("💡 Use setCharacterAnimation('animationName') to test specific animations");
    }
    
    forceAnimation(animationName) {
        if (!this.isLoaded) {
            console.log("❌ Character not loaded yet");
            return;
        }
        
        this.switchToAnimation(animationName);
        console.log(`🎭 Forced animation: ${animationName}`);
    }

    playDeathAnimation(onComplete) {
        const deathAnimationName = 'death'; // Use the cleaned name
        const deathAnimation = this.animations[deathAnimationName];
        
        if (!deathAnimation) {
            console.error(`❌ Animation '${deathAnimationName}' not found! Available animations are:`, Object.keys(this.animations));
            if (onComplete) onComplete();
            return;
        }
        
        const clip = deathAnimation.getClip();
        console.log(`[Animation Info] Found '${deathAnimationName}'. Duration: ${clip.duration} seconds.`);

        if (clip.duration === 0) {
            console.warn("⚠️ This animation has a duration of 0 seconds and will not be visible.");
            if (onComplete) onComplete();
            return;
        }
        
        console.log("▶️ Forcing death animation play...");

        // Force an abrupt switch using fades with zero duration. This is often more reliable.
        if (this.currentAnimation) {
            this.currentAnimation.fadeOut(0);
        }
        
        deathAnimation.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0).play();
        deathAnimation.clampWhenFinished = true; // This will hold the final frame of the animation.
        this.currentAnimation = deathAnimation;

        const durationInMs = clip.duration * 1000;

        setTimeout(() => {
            console.log("✅ Death animation timer finished.");
            if (onComplete) onComplete();
        }, durationInMs);
    }

    // 🆕 QUICK ANIMATION SYSTEM CHECK
    checkAnimationSystem() {
        console.log("🔍 ANIMATION SYSTEM STATUS CHECK:");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`👤 Character loaded: ${this.isLoaded}`);
        console.log(`🎬 Animation mixer: ${!!this.mixer}`);
        console.log(`📚 Available animations: ${Object.keys(this.animations)}`);
        console.log(`▶️ Current animation: ${this.currentAnimation ? this.currentAnimation.getClip().name : 'None'}`);
        console.log(`🎮 Movement states:`);
        console.log(`   Forward: ${this.moveForward}`);
        console.log(`   Left: ${this.moveLeft}`);
        console.log(`   Right: ${this.moveRight}`);
        console.log(`🚶 Is moving: ${this.moveForward || this.moveLeft || this.moveRight}`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        
        if (!this.isLoaded) {
            console.log("❌ ISSUE: Character not loaded");
        }
        if (!this.mixer) {
            console.log("❌ ISSUE: Animation mixer not initialized");
        }
        if (Object.keys(this.animations).length === 0) {
            console.log("❌ ISSUE: No animations found");
        }
        if (!this.animations.walk) {
            console.log("❌ ISSUE: 'walk' animation not found");
        }
        if (!this.animations.idle) {
            console.log("❌ ISSUE: 'idle' animation not found");
        }
        
        if (this.isLoaded && this.mixer && this.animations.walk && this.animations.idle) {
            console.log("✅ Animation system appears to be working correctly");
            console.log("💡 Try pressing WASD to test movement animations");
        }
    }
}

// 🆕 INPUT HANDLING FOR EXPLORATION MODE
export class PlayerInputHandler {
    constructor(playerController, gameStateManager, modeManager, cameraManager) {
        this.playerController = playerController;
        this.gameStateManager = gameStateManager;
        this.modeManager = modeManager;
        this.cameraManager = cameraManager;
    }
    
    handleKeyDown(e) {
        if (!this.playerController) return;
        
        // Prevent default for movement keys
        if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyE', 'Escape', 'KeyT', 'KeyX'].includes(e.code)) {
            e.preventDefault();
        }
        
        switch(e.code) {
            case 'KeyW':
                this.playerController.setMoving('forward', true);
                break;
            case 'KeyA':
                this.playerController.setMoving('left', true);
                break;
            case 'KeyD':
                this.playerController.setMoving('right', true);
                break;
            case 'KeyE':
                if (this.gameStateManager.currentZone && !e.repeat) {
                    this.modeManager.enterMachineMode(this.gameStateManager.currentZone.machineType);
                }
                break;
            case 'KeyT':
                if (!e.repeat && this.playerController && this.cameraManager) {
                    this.playerController.performGreeting(this.cameraManager);
                }
                break;
            case 'KeyX':
                if (!e.repeat && this.gameStateManager.currentZone === null) {
                    // 🍿 Only activate popcorn mode when not near machines
                    this.togglePopcornMode();
                }
                break;
        }
    }
    
    handleKeyUp(e) {
        if (!this.playerController) return;
        
        switch(e.code) {
            case 'KeyW':
                this.playerController.setMoving('forward', false);
                break;
            case 'KeyA':
                this.playerController.setMoving('left', false);
                break;
            case 'KeyD':
                this.playerController.setMoving('right', false);
                break;
        }
    }
    
    // 🍿 TOGGLE POPCORN MODE
    togglePopcornMode() {
        // Call global function to toggle popcorn mode
        if (window.togglePopcornMode) {
            window.togglePopcornMode();
        } else {
            console.log("🍿 Popcorn mode not available yet");
        }
    }
}

// 🆕 UTILITY FUNCTIONS FOR PLAYER TESTING
export class PlayerTestUtils {
    static setPlayerSpeed(playerController, speed) {
        if (playerController) {
            playerController.moveSpeed = speed;
            console.log(`🎮 Player speed set to: ${speed}`);
        } else {
            console.log("❌ Player controller not found");
        }
    }
    
    static testCharacterAnimations(playerController) {
        if (!playerController || !playerController.isLoaded) {
            console.log("❌ Character not loaded yet");
            return;
        }
        
        console.log("🎭 Testing character animations...");
        playerController.listAvailableAnimations();
        
        const animations = ['idle', 'walk', 'run'];
        let index = 0;
        
        function testNext() {
            if (index >= animations.length) {
                console.log("✅ Animation test complete!");
                return;
            }
            
            const animName = animations[index];
            console.log(`${index + 1}️⃣ Testing ${animName} animation`);
            playerController.forceAnimation(animName);
            
            index++;
            setTimeout(testNext, 2000);
        }
        
        testNext();
    }
    
    static getCharacterStatus(playerController) {
        if (!playerController) {
            console.log("❌ Player controller not found");
            return;
        }
        
        console.log("🎮 CHARACTER STATUS:");
        console.log("━━━━━━━━━━━━━━━━━━━━");
        console.log(`📦 Model loaded: ${playerController.isLoaded ? '✅' : '❌'}`);
        console.log(`🎭 Animations available: ${playerController.animations ? Object.keys(playerController.animations).length : 0}`);
        console.log(`▶️ Current animation: ${playerController.currentAnimation ? 'Active' : 'None'}`);
        console.log(`📍 Position: (${playerController.mesh?.position.x.toFixed(2)}, ${playerController.mesh?.position.y.toFixed(2)}, ${playerController.mesh?.position.z.toFixed(2)})`);
        
        const movement = [];
        if (playerController.moveForward) movement.push('Forward');
        if (playerController.moveLeft) movement.push('Left');
        if (playerController.moveRight) movement.push('Right');
        
        console.log(`🚶 Movement: ${movement.length > 0 ? movement.join('+') : 'Idle'}`);
        
        if (playerController.isLoaded) {
            console.log("");
            console.log("🎬 Commands:");
            console.log("  testCharacterAnimations() - Test all animations");
            console.log("  listCharacterAnimations() - Show available animations");
            console.log("  setCharacterAnimation('walk') - Set specific animation");
        }
    }

    static checkAnimationSystem(playerController) {
        if (!playerController) {
            console.log("❌ Player controller not provided");
            console.log("💡 Usage: checkAnimationSystem(playerController)");
            return;
        }
        
        playerController.checkAnimationSystem();
    }
}