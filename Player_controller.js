import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RigidBody } from './physics_engine.js';
import { MeshBVH } from 'https://unpkg.com/three-mesh-bvh@0.7.0/build/index.module.js';

export class PlayerController {
    constructor(scene, physicsEngine, roomSetupManager = null, audioManager = null) {
        this.scene = scene;
        this.physicsEngine = physicsEngine;
        this.roomSetupManager = roomSetupManager; // Reference to room setup manager
        this.audioManager = audioManager; //  Store the audio manager
        this.moveSpeed = 3.0; //  Reduced speed for more controlled movement
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
        this.characterName = null; //  To store the character's name for sounds

        
    }
    
    loadCharacter(modelUrl, characterName) {
        return new Promise((resolve, reject) => {
            // Try to load the Hoodie Character model
            const loader = new GLTFLoader();
            loader.load(modelUrl, 
                (gltf) => {
                    //  Use the provided name directly, this is more robust
                    this.characterName = characterName;
                    this.setupCharacterModel(gltf);
                    resolve();
                },
                (progress) => {
                },
                (error) => {
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
        
        // setup animations
        if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(this.mesh);
            const loadedAnimationNames = [];
            
            gltf.animations.forEach((clip) => {
                // handle names like "characterarmature|idle" -> "idle"
                let cleanName = clip.name.toLowerCase();
                if (cleanName.includes('|')) {
                    cleanName = cleanName.split('|')[1]; // take part after the '|', we are basically normalizing the name
                }
                
                this.animations[cleanName] = this.mixer.clipAction(clip);
                loadedAnimationNames.push(cleanName);
            });
            
            
            // Start with idle animation if available
            if (this.animations.idle) {
                this.currentAnimation = this.animations.idle;
                this.currentAnimation.play();
            } else {
            }
        }
        
        this.scene.add(this.mesh);
        this.isLoaded = true;
    }

    
    setMoving(direction, state) {
        if (this.isGreeting) return;
        
        switch(direction) {
            case 'forward': this.moveForward = state; break;
            case 'left': this.moveLeft = state; break;
            case 'right': this.moveRight = state; break;
        }
        
    }
    
    switchToAnimation(animationName) {
        if (!this.animations || !this.mixer) {
            return;
        }
        
        const targetAnimation = this.animations[animationName.toLowerCase()];
        
        if (!targetAnimation) {
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
        }
    }
    
    update(deltaTime) {
        if (!this.mesh || this.isGreeting) return;
        
        // Handle rotation from A/D keys
        let rotation = 0;
        if (this.moveLeft) rotation = 1;  // A key for counter-clockwise rotation 
        if (this.moveRight) rotation = -1; // D key for clockwise rotation
        
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
        
        this.mesh.position.y = 0;
    }
    
    //mixer advances all active animations by 0.016 seconds
   //  Advances animations: Moves animation forward by deltaTime seconds
  //Handles transitions: Smoothly blends between different animations
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

        // Play sound when greeting
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
                reject(`Animation not found: ${animationName}`);
                return;
            }

            const clip = animation.getClip();
            if (clip.duration === 0) {
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
        const playerRadius = 0.7; // collision radius around player
        
        //get machine positions dynamically from RoomSetupManager 
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
                    center: new THREE.Vector3(-3, 0.7, -2), // position from main.js
                    size: { x: 2, z: 2 } 
                }
            ];
        } else {
            // fallback to hardcoded positions if no room manager available
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
            
            // ff player is inside the machine's exclusion zone, apply pushback
            if (this.mesh.position.x >= machineMinX && this.mesh.position.x <= machineMaxX &&
                this.mesh.position.z >= machineMinZ && this.mesh.position.z <= machineMaxZ) {
                
                // calculate penetration distances for each side
                const penetrationLeft = this.mesh.position.x - machineMinX;
                const penetrationRight = machineMaxX - this.mesh.position.x;
                const penetrationFront = this.mesh.position.z - machineMinZ;
                const penetrationBack = machineMaxZ - this.mesh.position.z;
                
                // find the minimum penetration (closest exit)
                const minPenetration = Math.min(penetrationLeft, penetrationRight, penetrationFront, penetrationBack);
                
                // if penetration is very small, use smooth pushback
                if (minPenetration > 0.05) {
                    const pushbackStrength = 0.15;
                    const maxPushback = 0.2;
                    const pushbackForce = Math.min(minPenetration * pushbackStrength, maxPushback);
                    
                    // apply gradual pushback in the direction of least resistance, thus we are applying a sort of soft collision response/friction that makes the player slide
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
                    // if penetration is deep, use stronger correction
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

        const roomBounds = {
            minX: -20,  
            maxX: 20,
            minZ: -10,
            maxZ: 10    
        };
        
        // smooth boundary constraint with soft pushback
        const boundaryPushback = 0.1; //gentle pushback force for room boundaries
        const boundaryBuffer = 0.2; //buffer zone before applying pushback
        
        //smooth X axis constraint
        if (this.mesh.position.x < roomBounds.minX + boundaryBuffer) {
            const penetration = (roomBounds.minX + boundaryBuffer) - this.mesh.position.x;
            this.mesh.position.x += Math.min(penetration * boundaryPushback, 0.05);
        } else if (this.mesh.position.x > roomBounds.maxX - boundaryBuffer) {
            const penetration = this.mesh.position.x - (roomBounds.maxX - boundaryBuffer);
            this.mesh.position.x -= Math.min(penetration * boundaryPushback, 0.05);
        }
        
        //smooth Z axis constraint
        if (this.mesh.position.z < roomBounds.minZ + boundaryBuffer) {
            const penetration = (roomBounds.minZ + boundaryBuffer) - this.mesh.position.z;
            this.mesh.position.z += Math.min(penetration * boundaryPushback, 0.05);
        } else if (this.mesh.position.z > roomBounds.maxZ - boundaryBuffer) {
            const penetration = this.mesh.position.z - (roomBounds.maxZ - boundaryBuffer);
            this.mesh.position.z -= Math.min(penetration * boundaryPushback, 0.05);
        }
        
        //hard boundaries as fallback (in case player somehow gets too far)
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

    
    listAvailableAnimations() {
        if (!this.isLoaded || !this.animations) {

            return;
        }
        
        
        Object.keys(this.animations).forEach((name, index) => {
            const isActive = this.currentAnimation && this.currentAnimation.getClip().name.toLowerCase() === name;

        });

    }
    
    forceAnimation(animationName) {
        if (!this.isLoaded) {
            return;
        }
        
        this.switchToAnimation(animationName);
    }

    playDeathAnimation(onComplete) {
        const deathAnimationName = 'death'; // use the cleaned name
        const deathAnimation = this.animations[deathAnimationName];
        
        if (!deathAnimation) {
            if (onComplete) onComplete();
            return;
        }
        
        const clip = deathAnimation.getClip();

        if (clip.duration === 0) {
            if (onComplete) onComplete();
            return;
        }

        // force an abrupt switch using fades with zero duration. This is often more reliable.
        if (this.currentAnimation) {
            this.currentAnimation.fadeOut(0);
        }
        
        deathAnimation.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0).play();
        deathAnimation.clampWhenFinished = true; //this will hold the final frame of the animation.
        this.currentAnimation = deathAnimation;

        const durationInMs = clip.duration * 1000;

        setTimeout(() => {
            if (onComplete) onComplete();
        }, durationInMs);
    }
    
}

//  INPUT HANDLING FOR EXPLORATION MODE
export class PlayerInputHandler {
    constructor(playerController, gameStateManager, modeManager, cameraManager) {
        this.playerController = playerController;
        this.gameStateManager = gameStateManager;
        this.modeManager = modeManager;
        this.cameraManager = cameraManager;
    }
    
    handleKeyDown(e) {
        if (!this.playerController) return;
        
        if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyE', 'Escape', 'KeyT', 'KeyX', 'KeyL'].includes(e.code)) {
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
                    //  Only activate popcorn mode when not near machines
                    this.togglePopcornMode();
                }
                break;
            case 'KeyL':
                if (!e.repeat && this.gameStateManager.currentZone === null) {
                    // Only activate disco mode when not near machines
                    this.toggleDiscoMode();
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
    
    // TOGGLE POPCORN MODE
    togglePopcornMode() {
        // Call global function to toggle popcorn mode
        if (window.togglePopcornMode) {
            window.togglePopcornMode();
        } else {

        }
    }
 

    toggleDiscoMode() {

        if (window.toggleDiscoMode) {
            window.toggleDiscoMode();
        } else {

        }
    }
}

export class PlayerTestUtils {
    static setPlayerSpeed(playerController, speed) {
        if (playerController) {
            playerController.moveSpeed = speed;
        }
    }
}












/*

# What this module does (and how it all fits together)

This code implements a **player character system for a Three.js scene** with three main pieces:

1. a **PlayerController** that loads (or falls back to) a model, drives movement and rotation, swaps animations with fades, keeps the avatar inside a rectangular room, and prevents walking into nearby “machines” (claw/candy/popcorn);
2. a **PlayerInputHandler** that maps keyboard events to the controller and to game-mode toggles/interactions;
3. a small **PlayerTestUtils** helper for quick testing (speed tweaks, animation cycling, status/diagnostics).

It also defines a few **integration points** (room layout, camera rails, audio hooks, game state) and lists some **gotchas** you should be aware of.

---

## 1) PlayerController — the brain of the avatar

**Purpose & state**

* Holds references to `scene`, an external `physicsEngine` (not used directly here), optional `roomSetupManager` (machine positions), and optional `audioManager`.
* Tracks input flags (`moveForward/Left/Right`), movement speeds, animation dictionary (`this.animations`), current `THREE.AnimationMixer` and action, and utility flags (`isLoaded`, `isGreeting`, `debugEnabled`).

**Loading & model setup**

* `loadCharacter(modelUrl, characterName)` loads a GLTF; on success it calls `setupCharacterModel`, on failure creates a **capsule fallback** via `createFallbackMesh()` and rejects.
* `setupCharacterModel(gltf)` inserts the model, enables shadows, builds an `AnimationMixer`, and **normalizes clip names** to lowercase and (if present) strips any prefix before `|` (e.g., `"armature|idle"` → `"idle"`). Starts on `idle` if available.
* `createFallbackMesh()` makes a royal-blue **CapsuleGeometry** with shadows and tries to attach a **MeshBVH** to the geometry (prepping it for potential geometric collision queries). This mesh is placed in the scene so the avatar still “exists” if loading fails.

**Movement, rotation, and constraints**

* `setMoving(direction, state)` flips movement flags unless a greeting scene is in progress.
* `update(deltaTime)` is the per-frame logic:

  * rotates left/right with **A/D**;
  * moves forward along the avatar’s quaternion with **W**;
  * applies **machine collision avoidance** (`handleMachineCollisions`) and **room bounds** (`constrainToRoom`);
  * switches animation between `'walk'` and `'idle'` with a fade via `switchToAnimation`;
  * pins `position.y` to `0` (if `idle` exists) or `0.5` (fallback mesh height).
  * **Note:** it does **not** tick the mixer; that’s done in `updateAnimation`.
* `constrainToRoom()` keeps the player inside a **40×20** area (X ∈ \[−20, 20], Z ∈ \[−10, 10]) with a gentle pushback near edges plus a hard clamp.
* `handleMachineCollisions()` defines **axis-aligned exclusion rectangles** around machines. Machine centers are read from `roomSetupManager` when present (else hardcoded), expanded by a small **playerRadius**. If inside, the controller either nudges the player **out softly** (small penetration) or **snaps** to the nearest safe edge (deep penetration).

**Animation system**

* `switchToAnimation(name)` fades out the current action and fades in the target over **0.3s**.
* `updateAnimation(deltaTime)` advances the `AnimationMixer` and should be called every frame by your main loop.
* **One-shot clips & scenes**

  * `playOneShotAnimation(name)` plays a clip once (`LoopOnce`, clamped on finish), then returns to `idle`. It uses a **setTimeout** equal to the clip’s nominal duration to decide when to switch back.
  * `performGreeting(cameraManager)` runs a **mini cut-scene**: stops input, animates the camera in/out via `cameraManager`, plays `${characterName}_wave` on the `audioManager` (if present), plays the `wave` animation once, then restores normal control.
  * `playDeathAnimation(onComplete)` hard-switches to `'death'` (LoopOnce, clamped) and calls `onComplete` after the clip’s duration. It **does not** return to `idle`.

**Utilities**

* `getPosition()` returns a clone of the current position; `getForwardDirection()` returns the avatar’s “forward” vector from its quaternion.
* `enableDebug()/disableDebug()`, `debugAnimationState()`, `listAvailableAnimations()`, `forceAnimation(name)`, `checkAnimationSystem()` exist for logging/diagnostics (most logs are currently stubbed out).

---

## 2) PlayerInputHandler — keyboard → game actions

**Purpose**

* Bridges user input to the controller and to the wider game (mode changes, special effects, camera greeting).

**Key bindings**

* Prevents default browser behavior for **W/S/A/D/E/Esc/T/X/L**.
* **W/A/D:** set/unset movement flags on keydown/keyup (no backward move on **S**—it’s prevented but unused).
* **E:** when `gameStateManager.currentZone` exists and it’s not an auto-repeat, calls
  `modeManager.enterMachineMode(currentZone.machineType)`.
* **T:** triggers `playerController.performGreeting(cameraManager)` (single-shot).
* **X / L:** when **not** near a machine (`currentZone === null`), call global `window.togglePopcornMode()` / `window.toggleDiscoMode()` if defined.

---

## 3) PlayerTestUtils — quick testing helpers

* `setPlayerSpeed(controller, speed)`: change run speed on the fly.
* `testCharacterAnimations(controller)`: cycles `'idle' → 'walk' → 'run'` every 2 seconds (if clips exist), useful to sanity-check retargeted clips.
* `getCharacterStatus(controller)`: (stubbed) intended to log load state, active animation, position, and movement flags.
* `checkAnimationSystem(controller)`: proxies to the controller’s diagnostics.

---

## Integration contracts & data flow

* **Main loop:** call **both** `playerController.update(dt)` (movement/constraints/anim switching) **and** `playerController.updateAnimation(dt)` (mixer tick) every frame.
* **Room/Machines:** if you have a `roomSetupManager`, it should expose
  `getMachineOffset()` and `getCandyMachineOffset()` (and ideally one for the popcorn machine—currently hardcoded).
* **Camera:** a `cameraManager` with
  `animateCameraToObject(duration)` and `animateCameraToOriginal(duration)` powers the greeting scene rails.
* **Audio:** an `audioManager` with `playSound(name)` lets greetings auto-play `${characterName}_wave`.
* **Game state & modes:** `gameStateManager.currentZone` (with a `machineType`) enables **E** to enter machine mode via a `modeManager`.

---

## Notable limitations & gotchas (called out in the notes)

* **No backward walking:** key **S** is prevented but there’s no logic to move backward.
* **Timing of one-shots:** `playOneShotAnimation` and `playDeathAnimation` use **real time** (`setTimeout`) instead of animation-mixer time/events. If you change the mixer playback rate, these timers may **desync**. (Best practice: listen for `finished` events on the action or mixer.)
* **Animation name matching:** `listAvailableAnimations()` compares using `action.getClip().name.toLowerCase()`; if your raw clip names still include prefixes (e.g., `"armature|idle"`), the “active” indication can appear inconsistent relative to the cleaned keys.
* **Physics isn’t driving motion:** despite importing `RigidBody`, movement and collisions here are **kinematic** (AABB pushbacks and clamps). Gravity is faked by forcing `y` rather than simulating.
* **Fallback specifics:** the fallback capsule sets `y ≈ 0.5` and attaches a BVH to the **geometry** (helpful if you later use triangle-level queries), but the controller currently only uses rectangle-based exclusion zones.
* **Minor stubs:** some debug/status methods and logs are placeholders; `previousPosition` is computed then unused in `update`.

---

## Quick mental model

* **Press W/A/D** → `PlayerInputHandler` sets movement flags → `PlayerController.update(dt)` rotates and moves, pushes you out of machine rectangles, keeps you in bounds, and swaps `'idle'`/`'walk'` with fades → `PlayerController.updateAnimation(dt)` advances the mixer so the clips actually play.
* **Press E** near a machine → game switches to that machine’s mode.
* **Press T** → short greeting cut-scene (camera in, wave + sound, camera out).
* **Press X/L** away from machines → global popcorn/disco effects toggle if provided.

That’s the whole system: **model/animation management**, **kinematic locomotion with soft collision fences**, **room confinement**, **scripted greeting**, **key mapping**, and **small test hooks**—cleanly separated so you can swap in your own room/camera/audio/game-mode implementations.


*/