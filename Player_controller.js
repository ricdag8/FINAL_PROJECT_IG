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
        
    }
    
    loadCharacter(modelUrl, characterName) {
        return new Promise((resolve, reject) => {
            // Try to load the Hoodie Character model
            const loader = new GLTFLoader();
            loader.load(modelUrl, 
                (gltf) => {
                    // 🆕 Use the provided name directly, this is more robust
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
        } catch (error) {
        }
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.position.set(0, 0.5, 3); // Starting position
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
        
        // DEBUG - Log movement changes (will be reduced after testing)
        if (this.debugEnabled) {
            const isPressingAnyKey = this.moveForward || this.moveLeft || this.moveRight;
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
                    center: new THREE.Vector3(-3, 0.7, -2), // Position from main.js:686
                    size: { x: 2, z: 2 } //  Scaled down size (0.5 scale factor)
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
    
    // DEBUG AND TESTING METHODS
    enableDebug() {
        this.debugEnabled = true;
    }
    
    disableDebug() {
        this.debugEnabled = false;
    }
    
    debugAnimationState() {
        if (!this.isLoaded) {

            return;
        }      

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
        const deathAnimationName = 'death'; // Use the cleaned name
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

        // Force an abrupt switch using fades with zero duration. This is often more reliable.
        if (this.currentAnimation) {
            this.currentAnimation.fadeOut(0);
        }
        
        deathAnimation.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0).play();
        deathAnimation.clampWhenFinished = true; // This will hold the final frame of the animation.
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

        } else {

        }
    }
    
    static testCharacterAnimations(playerController) {
        if (!playerController || !playerController.isLoaded) {

            return;
        } 

        playerController.listAvailableAnimations();
        
        const animations = ['idle', 'walk', 'run'];
        let index = 0;
        
        function testNext() {
            if (index >= animations.length) {

                return;
            }
            
            const animName = animations[index];

            playerController.forceAnimation(animName);
            
            index++;
            setTimeout(testNext, 2000);
        }
        
        testNext();
    }
    
    static getCharacterStatus(playerController) {
        if (!playerController) {
            return;
        }
        const movement = [];
        if (playerController.moveForward) movement.push('Forward');
        if (playerController.moveLeft) movement.push('Left');
        if (playerController.moveRight) movement.push('Right');
    }

    static checkAnimationSystem(playerController) {
        if (!playerController) {  
            return;
        }
        playerController.checkAnimationSystem();
    }
}

/* 
Di seguito trovi, funzione per funzione, cosa fa, con parametri, valore di ritorno ed effetti collaterali (quando rilevanti). Ho raggruppato per classe.

# PlayerController

### constructor(scene, physicsEngine, roomSetupManager = null, audioManager = null)

* **Scopo:** inizializza il controller del personaggio e tutti gli stati interni (movimento, animazioni, riferimenti a scena/physics/room/audio).
* **Parametri:**
  `scene` (THREE.Scene), `physicsEngine` (istanza del tuo motore fisico), `roomSetupManager` (opzionale), `audioManager` (opzionale).
* **Ritorno:** nessuno.
* **Note:** imposta velocità di movimento/rotazione, stato animazioni e flag utili (es. `isGreeting`).

### loadCharacter(modelUrl, characterName)

* **Scopo:** carica un modello GLTF del personaggio e ne prepara animazioni e mesh.
* **Parametri:** `modelUrl` (string), `characterName` (string, usato anche per gli effetti audio).
* **Ritorno:** `Promise<void>`.
* **Effetti:** su successo chiama `setupCharacterModel(gltf)`; su errore crea un “fallback” con `createFallbackMesh()` e **reject**.

### setupCharacterModel(gltf)

* **Scopo:** inserisce il modello GLTF nella scena, abilita ombre, prepara il mixer e le clip di animazione.
* **Parametri:** `gltf` (GLTF result del loader).
* **Ritorno:** nessuno.
* **Effetti:** rimuove eventuale mesh di fallback, posiziona e scala il modello, crea `THREE.AnimationMixer`, pulisce i nomi delle animazioni (rimuove il prefisso prima di `|`, e lowercase) e salva le azioni in `this.animations`. Se esiste, parte da `idle`. Imposta `isLoaded = true`.

### createFallbackMesh()

* **Scopo:** crea un mesh di emergenza (capsula) quando il GLTF non si carica.
* **Parametri:** nessuno.
* **Ritorno:** nessuno.
* **Effetti:** genera `THREE.CapsuleGeometry`, abilita ombre, la posiziona, prova a costruire un BVH (`MeshBVH`) per eventuali collisioni geometriche, e aggiunge alla scena. Imposta `isLoaded = true`.

### setMoving(direction, state)

* **Scopo:** accende/spegne le flag di movimento in base ai tasti (W, A, D).
* **Parametri:** `direction` ('forward' | 'left' | 'right'), `state` (boolean).
* **Ritorno:** nessuno.
* **Effetti:** ignorata se `isGreeting` è true (durante l’animazione di saluto).

### switchToAnimation(animationName)

* **Scopo:** gestisce il passaggio morbido (fade) tra animazioni.
* **Parametri:** `animationName` (string, es. 'idle', 'walk', 'wave', 'death'… **minuscolo**).
* **Ritorno:** nessuno.
* **Effetti:** fa fade-out dell’azione corrente e fade-in della nuova (`0.3s`), aggiorna `currentAnimation`.

### update(deltaTime)

* **Scopo:** aggiorna rotazione, movimento, collisioni e stato animazione in ogni frame.
* **Parametri:** `deltaTime` (secondi).
* **Ritorno:** nessuno.
* **Effetti:**

  * Ruota con A/D.
  * Se W è premuto: avanza nella direzione di `getForwardDirection()`.
  * Poi chiama `handleMachineCollisions()` e `constrainToRoom()` per tenere il player fuori dalle macchine e dentro la stanza.
  * Cambia animazione tra `walk` e `idle` a seconda del movimento.
  * Forza `position.y` a `0` (se c’è animazione `idle`) altrimenti `0.5`.
  * **Nota:** il mixer **non** viene aggiornato qui (vedi `updateAnimation`).

### updateAnimation(deltaTime)

* **Scopo:** aggiorna solo il mixer delle animazioni.
* **Parametri:** `deltaTime` (secondi).
* **Ritorno:** nessuno.
* **Effetti:** `this.mixer.update(deltaTime)` se il mixer esiste. Da chiamare nel loop principale di rendering.

### async performGreeting(cameraManager)

* **Scopo:** esegue una “scena di saluto”: ferma i movimenti, anima la camera, riproduce suono e animazione `wave`, poi ripristina la camera.
* **Parametri:** `cameraManager` (oggetto con `animateCameraToObject(dur)` e `animateCameraToOriginal(dur)`).
* **Ritorno:** `Promise<void>`.
* **Effetti:** imposta `isGreeting` a true per bloccare altri input, riproduce suono `${characterName}_wave` tramite `audioManager`, torna a `idle` alla fine.

### playOneShotAnimation(animationName)

* **Scopo:** riproduce una clip **una sola volta** e poi torna a `idle`.
* **Parametri:** `animationName` (string).
* **Ritorno:** `Promise<void>`.
* **Effetti:** setta l’azione in `LoopOnce`, `clampWhenFinished = true`, fa fade in/out rapido e usa un `setTimeout` lungo quanto la durata della clip per tornare a `idle`.
  **Nota:** il timer è a tempo reale; se cambi la velocità del mixer, il timeout non si aggiorna di conseguenza.

### handleMachineCollisions()

* **Scopo:** impedisce al player di entrare in zone rettangolari intorno alle macchine (claw, candy, popcorn) con “spinta” morbida o correzione dura.
* **Parametri:** nessuno.
* **Ritorno:** nessuno.
* **Effetti:**

  * Costruisce una lista di “macchine” (da `roomSetupManager` se presente, altrimenti posizioni hardcoded).
  * Calcola un riquadro per ciascuna (con raggio giocatore `playerRadius = 0.5`).
  * Se il player entra, applica una piccola spinta nella via di fuga più vicina; se è “dentro parecchio”, corregge la posizione con un margine di sicurezza.

### constrainToRoom()

* **Scopo:** mantiene il player entro i limiti della stanza (40×20 → X: -20..20, Z: -10..10).
* **Parametri:** nessuno.
* **Ritorno:** nessuno.
* **Effetti:**

  * Applica una “spinta” morbida quando il player si avvicina ai bordi (buffer 0.2).
  * Poi esegue un clamping duro con `THREE.MathUtils.clamp`.

### getPosition()

* **Scopo:** ottenere la posizione attuale del personaggio.
* **Parametri:** nessuno.
* **Ritorno:** `THREE.Vector3` (clone).

### getForwardDirection()

* **Scopo:** ottenere il vettore avanti del personaggio in base alla sua rotazione.
* **Parametri:** nessuno.
* **Ritorno:** `THREE.Vector3` (0,0,1) trasformato dalla `quaternion` della mesh.

### enableDebug() / disableDebug()

* **Scopo:** abilita/disabilita messaggi di debug interni.
* **Parametri:** nessuno.
* **Ritorno:** nessuno.

### debugAnimationState()

* **Scopo:** stampa a console alcune info diagnostiche sulle animazioni (placeholder).
* **Parametri:** nessuno.
* **Ritorno:** nessuno.
* **Nota:** al momento stampa solo separatori; sembra pensata per essere estesa.

### listAvailableAnimations()

* **Scopo:** elenca le animazioni caricate e indica quella attiva.
* **Parametri:** nessuno.
* **Ritorno:** nessuno (log in console).
* **Nota:** il confronto “attiva/non attiva” usa `getClip().name.toLowerCase()`; se i nomi originali avevano il prefisso `"armature|..."`, il match con il nome “pulito” potrebbe non coincidere visivamente.

### forceAnimation(animationName)

* **Scopo:** forza il passaggio a una specifica animazione (comodo per test).
* **Parametri:** `animationName` (string).
* **Ritorno:** nessuno (logga l’azione).

### playDeathAnimation(onComplete)

* **Scopo:** riproduce l’animazione di morte (`'death'`) una volta e poi esegue un callback.
* **Parametri:** `onComplete` (funzione opzionale).
* **Ritorno:** nessuno.
* **Effetti:** fa uno switch “brusco” (fade 0) sull’animazione `'death'`, imposta `LoopOnce` + `clampWhenFinished`. Al termine del timer chiama `onComplete`.
  **Nota:** non torna automaticamente a `idle`.

### checkAnimationSystem()

* **Scopo:** stampa un report diagnostico sul sistema animazioni.
* **Parametri:** nessuno.
* **Ritorno:** nessuno (log a console con suggerimenti).

---

# PlayerInputHandler

### constructor(playerController, gameStateManager, modeManager, cameraManager)

* **Scopo:** collega la gestione input a controller, stato di gioco, modal manager e camera.
* **Parametri:** istanze dei 4 componenti.
* **Ritorno:** nessuno.

### handleKeyDown(e)

* **Scopo:** gestisce la pressione tasti.
* **Parametri:** `e` (KeyboardEvent).
* **Ritorno:** nessuno.
* **Effetti:**

  * Previene il default su: W, S, A, D, E, Esc, T, X, L.
  * **W:** `forward = true`.
  * **A:** `left = true`.
  * **D:** `right = true`.
  * **E:** se `gameStateManager.currentZone` esiste e non è un auto-repeat, entra in modalità macchina: `modeManager.enterMachineMode(currentZone.machineType)`.
  * **T:** (non repeat) avvia `performGreeting` sul controller.
  * **X:** (non repeat, e solo se **non** vicino a una macchina) chiama `togglePopcornMode()`.
  * **L:** (non repeat, e solo se **non** vicino a una macchina) chiama `toggleDiscoMode()`.
    **Note:** “KeyS” e “Escape” sono prevenuti ma non hanno logica associata qui; non c’è movimento indietro.

### handleKeyUp(e)

* **Scopo:** gestisce il rilascio tasti.
* **Parametri:** `e` (KeyboardEvent).
* **Ritorno:** nessuno.
* **Effetti:** **W/A/D** → imposta a `false` i rispettivi flag di movimento.

### togglePopcornMode()

* **Scopo:** abilita/disabilita la “modalità popcorn” globale.
* **Parametri:** nessuno.
* **Ritorno:** nessuno.
* **Effetti:** chiama `window.togglePopcornMode()` se presente; altrimenti logga un messaggio.

### toggleDiscoMode()

* **Scopo:** abilita/disabilita la “modalità disco” globale.
* **Parametri:** nessuno.
* **Ritorno:** nessuno.
* **Effetti:** chiama `window.toggleDiscoMode()` se presente; altrimenti logga un messaggio.

---

# PlayerTestUtils (metodi statici)

### setPlayerSpeed(playerController, speed)

* **Scopo:** cambia la velocità di movimento del player (comodo per test).
* **Parametri:** `playerController`, `speed` (numero).
* **Ritorno:** nessuno (logga la nuova velocità).

### testCharacterAnimations(playerController)

* **Scopo:** sequenza di test che prova in loop le animazioni `idle`, `walk`, `run` ogni 2s.
* **Parametri:** `playerController`.
* **Ritorno:** nessuno (log a console).
* **Note:** se `run` non esiste, `switchToAnimation` non farà nulla per quella voce; serve modello con clip corrispondenti.

### getCharacterStatus(playerController)

* **Scopo:** stampa un riepilogo dello stato del personaggio (caricamento, numero animazioni, animazione attuale, posizione, movimento).
* **Parametri:** `playerController`.
* **Ritorno:** nessuno (log a console con alcuni “comandi suggeriti”).

### checkAnimationSystem(playerController)

* **Scopo:** “proxy” verso `playerController.checkAnimationSystem()`.
* **Parametri:** `playerController`.
* **Ritorno:** nessuno.

---

## Appunti e piccole insidie

* L’import `RigidBody` non è usato in questo file.
* La marcatura dell’animazione attiva in `listAvailableAnimations()` può non combaciare se il nome originale del clip contiene prefisso (il confronto usa il nome **non** pulito).
* `playOneShotAnimation` e `playDeathAnimation` basano la fine sull’orologio reale (`setTimeout`), non sul tempo del mixer: cambi di playbackRate non sono considerati.
* In `update`, la variabile `previousPosition` è calcolata ma non utilizzata.
* Non c’è supporto per camminare all’indietro; “S” è solo nel preventDefault.



*/