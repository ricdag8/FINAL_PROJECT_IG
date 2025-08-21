import * as THREE from 'three';
import { RigidBody } from './physics_engine.js';
import { Vec3 } from './physics_engine_vec3.js';
import { MeshBVH, MeshBVHHelper } from 'https://unpkg.com/three-mesh-bvh@0.7.0/build/index.module.js';

export class ClawController {
    // AGGIUNTA: Il costruttore ora accetta 'grabbableObjects'
 constructor(clawGroup, cylinders, clawBones, scene, objectsInteraction, physicsEngine, grabbableObjects, joystickPivot, button) {
        this.clawGroup = clawGroup;
        this.cylinders = cylinders;
        this.clawBones = clawBones;
        this.scene = scene;
        this.objectsInteraction = objectsInteraction;
        this.physicsEngine = physicsEngine;
        this.machineBox = null;
        this.chuteMesh = null;
        
        // AGGIUNTA: Memorizza l'array di oggetti
        this.grabbableObjects = grabbableObjects; 
        
        // --- State Machine ---
        this.automationState = 'MANUAL_HORIZONTAL';
        this.returnYPosition = 0;
        this.dropTargetY = 0;       // Questa verrà calcolata dinamicamente
        
        this.moveState = { left:false, right:false, forward:false, backward:false };
        this.moveSpeed = 1.5;
        this.moveMargin = 0.2;
        this.stopStatus = { A: false, B: false, C: false };
        this.spawnPosition = new THREE.Vector3();     // Posizione iniziale della claw
        this.dropOffPosition = new THREE.Vector3();   

        // ... (il resto del costruttore rimane invariato)
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


        this.joystickPivot = joystickPivot; // Rinominiamo la proprietà per chiarezza
        this.button = button;
        this.initialJoystickRotation = this.joystickPivot ? this.joystickPivot.rotation.clone() : null;
        this.initialButtonPosition = this.button ? this.button.position.clone() : null;
        this.joystickTiltTarget = new THREE.Euler();
        this.buttonPressTime = 0;
        this.buttonPressDuration = 250; // in ms
        this.joystickTiltAngle = 0.3; // Manteniamo l'angolo piccolo

        this.storeInitialTransforms();
    }

    

    setDependencies(machineBox, chuteMesh) {
        this.machineBox = machineBox;
        this.chuteMesh = chuteMesh;
        
        // Memorizziamo la posizione di spawn iniziale della claw
        if(this.spawnPosition.lengthSq() === 0) {
            this.spawnPosition.copy(this.clawGroup.position);
        }

        if (this.machineBox) {
            // Definiamo il punto di rilascio in un angolo della macchina (es. in alto a destra)
            // Puoi cambiare 'max.x' e 'max.z' con 'min.x' e 'min.z' per scegliere un altro angolo
            this.dropOffPosition.set(
                this.machineBox.max.x - this.moveMargin - 0.1,
                0, // La Y verrà impostata al momento
                this.machineBox.max.z - this.moveMargin - 0.1
            );
        }
        
        // La logica della drop zone non è più necessaria per il rilascio automatico,
        // ma la lasciamo per usi futuri se necessario.
        if (this.chuteMesh) {
            this.chuteMesh.updateWorldMatrix(true, false);
            this.chuteBox = new THREE.Box3().setFromObject(this.chuteMesh);
            this.createDropZoneIndicator();
        }
    }

    createDropZoneIndicator() {
        // Placeholder method - no visual indicator needed
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
    
        for (let i = 0; i < keys.length; i++) {
            for (let j = i + 1; j < keys.length; j++) {
                const f1 = keys[i];
                const f2 = keys[j];
    
                const c1 = this.clawGroup.getObjectByName(fingerToCylinder[f1]);
                const c2 = this.clawGroup.getObjectByName(fingerToCylinder[f2]);
    
                if (c1 && c2) {
                    // Usa bounding box aggiornate per ciascun cilindro
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


calculateAndSetDropHeight() {
    const fallbackHeight = this.machineBox ? this.machineBox.min.y + 0.5 : 0;

    // Fallback 1: L'array di oggetti non esiste o è vuoto.
    if (!this.grabbableObjects || this.grabbableObjects.length === 0) {
        this.dropTargetY = fallbackHeight;
        return;
    }

    let highestY = -Infinity;
    this.grabbableObjects.forEach(objData => {
        // Controlla che il corpo fisico e la sua posizione siano validi
        if (objData && objData.body && objData.body.position && !objData.body.isHeld) {
            if (objData.body.position.y > highestY) {
                highestY = objData.body.position.y;
            }
        }
    });

    // Fallback 2: Gli oggetti esistono, ma nessuno ha fornito una coordinata Y valida.
    if (highestY === -Infinity) {
        this.dropTargetY = fallbackHeight;
        return;
    }

    const penetrationOffset = -0.15; // Valore di penetrazione
    this.dropTargetY = highestY - penetrationOffset; // SOTTRAIAMO l'offset invece di aggiungerlo

    // Controllo di sicurezza finale: assicurati che il target non sia sotto il pavimento della macchina
    if (this.machineBox && this.dropTargetY < this.machineBox.min.y) {
        this.dropTargetY = this.machineBox.min.y + 0.1;
    }

}



// in claw_controller.js


startDropSequence() {
    // --- INIZIO LOGICA DI BLOCCO CON MARGINE DI SICUREZZA ---
    if (this.chuteBox) {
        const clawPos = this.clawGroup.position;
        const chuteBounds = this.chuteBox;

        // --- NUOVO: Calcoliamo dinamicamente le dimensioni della claw ---
        const clawBox = new THREE.Box3().setFromObject(this.clawGroup);
        const clawSize = new THREE.Vector3();
        clawBox.getSize(clawSize);

        // Il margine di sicurezza è la metà della dimensione della claw su ciascun asse.
        // In questo modo, il blocco scatta quando il *bordo* della claw tocca la zona di rispetto.
        const safeMarginX = clawSize.x ;
        const safeMarginZ = clawSize.z ;

        // --- MODIFICATO: La condizione ora usa i margini di sicurezza ---
        // Controlliamo se il centro della claw entra in un'area "gonfiata" delle dimensioni del margine.
        const isOverChute =
            clawPos.x >= (chuteBounds.min.x - safeMarginX) &&
            clawPos.x <= (chuteBounds.max.x + safeMarginX) &&
            clawPos.z >= (chuteBounds.min.z - safeMarginZ) &&
            clawPos.z <= (chuteBounds.max.z + safeMarginZ);

        if (isOverChute) {
            return; // Esce dalla funzione, impedendo l'avvio della sequenza.
        }
    }
    // --- ✅ FINE LOGICA DI BLOCCO ---

    // Il resto della funzione originale viene eseguito solo se il controllo precedente passa
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

// --- NUOVO CICLO DI PRESA ASINCRONO ---
async runCloseSequence() {
    this.automationState = 'OPERATING';

    await this.closeClaw(); // Chiudi la claw
    
    // Pausa per stabilizzare la presa (se c'è)
    await new Promise(resolve => setTimeout(resolve, 300));

    // Passa subito allo stato di risalita, SENZA aprire la claw
    this.automationState = 'ASCENDING';
}

// in claw_controller.js

async runReleaseAndReturnSequence() {
    this.automationState = 'RELEASING_OBJECT';

    // --- NEW RELEASE LOGIC ---
    // This is now the *only* place where the object's state transitions from "held" to "released".
    if (this.isGrabbing && this.grabbedObject) {
        this.deliveredStars++;

        const body = this.grabbedObject.body;
        
        // 1. Un-pin the object from the claw controller.
        body.isHeld = false;
        this.isGrabbing = false;
        this.grabbedObject = null;

        // 2. Activate the physics engine's "clean release" system.
        body.ignoreClawCollision = true;
        body.isBeingReleased = true;
        body.releaseStartTime = Date.now();

        // 3. Reset physics state for a clean vertical drop.
        body.linearVelocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
        body.force.set(0, 0, 0);
        body.torque.set(0, 0, 0);
        body.isSleeping = false;
        
    }
    // --- END NEW LOGIC ---

    
    await this.openClaw();
    await new Promise(resolve => setTimeout(resolve, 500)); 
    
    // The state transition to begin returning to the start position
    this.automationState = 'RETURNING_ASCEND';
}
// --- closeClaw E openClaw MODIFICATI PER RESTITUIRE PROMISES ---
closeClaw() {
    return new Promise(resolve => {
        this.isClosing = true;
        // Resetta lo stato di stop all'inizio di ogni chiusura
        this.stopStatus = { A: false, B: false, C: false };

        const closeStep = 0.03;
        let rotationSteps = 0;
        const maxSteps = 60;

        const grabInterval = setInterval(() => {
            rotationSteps++;

            // Ruota le dita solo se non sono state fermate da una collisione
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

            // Esegui il controllo delle collisioni ad ogni passo
            this.checkFingerCollisions();

            // Condizioni di stop: timeout OPPURE tutte le dita si sono fermate
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


// in claw_controller.js

openClaw() {
    return new Promise((resolve, reject) => {
        // --- SIMPLIFIED: This function no longer manages the grabbed object's state. ---
        
        try {
            const openSteps = 30;
            let currentStep = 0;
        
            // Check if required objects exist
            if (!this.clawBones.A || !this.clawBones.B || !this.clawBones.C) {
                console.error('ClawController: Missing claw bones for openClaw()');
                reject(new Error('Missing claw bones'));
                return;
            }

            const startRotations = {
                A: this.clawBones.A.rotation.z,
                B: this.clawBones.B.rotation.z,
                C: this.clawBones.C.rotation.z
            };
            
            // Check if initial transforms exist
            if (!this.initialTransforms[this.clawBones.A.name] || 
                !this.initialTransforms[this.clawBones.B.name] || 
                !this.initialTransforms[this.clawBones.C.name]) {
                console.error('ClawController: Missing initial transforms for openClaw()');
                reject(new Error('Missing initial transforms'));
                return;
            }

            const targetRotations = {
                A: this.initialTransforms[this.clawBones.A.name].rotation.z,
                B: this.initialTransforms[this.clawBones.B.name].rotation.z,
                C: this.initialTransforms[this.clawBones.C.name].rotation.z
            };
    
        const openInterval = setInterval(() => {
            currentStep++;
            const progress = currentStep / openSteps;
    
            this.clawBones.A.rotation.z = THREE.MathUtils.lerp(startRotations.A, targetRotations.A, progress);
            this.clawBones.B.rotation.z = THREE.MathUtils.lerp(startRotations.B, targetRotations.B, progress);
            this.clawBones.C.rotation.z = THREE.MathUtils.lerp(startRotations.C, targetRotations.C, progress);
    
            if (currentStep >= openSteps) {
                clearInterval(openInterval);
                this.isClosed = false;
                resolve(); // The Promise is resolved
            }
        }, 30);
        
        } catch (error) {
            console.error('ClawController: Error in openClaw():', error);
            reject(error);
        }
    });
}

    // Debug method to check and reset claw state
    resetClawState() {
        console.log('ClawController: Forcing reset to MANUAL_HORIZONTAL state');
        this.automationState = 'MANUAL_HORIZONTAL';
        this.isAnimating = false;
        this.isGrabbing = false;
        this.grabbedObject = null;
        if (this.isClosed) {
            this.openClaw().catch(error => {
                console.error('Error opening claw during reset:', error);
            });
        }
    }

    // Debug method to get current state
    getDebugState() {
        return {
            automationState: this.automationState,
            isAnimating: this.isAnimating,
            isGrabbing: this.isGrabbing,
            isClosed: this.isClosed,
            hasGrabbedObject: !!this.grabbedObject
        };
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


```js
import * as THREE from 'three';
import { RigidBody } from './physics_engine.js';
import { Vec3 } from './physics_engine_vec3.js';
import { MeshBVH, MeshBVHHelper } from 'three-mesh-bvh';
```

* Usa **Three.js** per geometrie, matrici, box di bounding ecc.
* Importa tipi del motore fisico (`RigidBody`, `Vec3`) — in questo file non sono usati direttamente, ma i *body* degli oggetti presi/restituiti seguono quel modello (campi come `position`, `linearVelocity`, `isHeld`…).
* Facoltativamente usa **three-mesh-bvh**: serve quando la geometria ha un `boundsTree` per collisioni veloci (vedi `checkClawCollision`).

---


# Proprietà principali del controller

Nel costruttore ricevi:

* `clawGroup`: gruppo 3D della pinza (usato per posizionamento globale).
* `cylinders`: lista di mesh cilindriche che compongono le dita/attuatori (usate anche per collisioni fra dita).
* `clawBones`: oggetto con le tre “ossa”/giunti delle dita `{A,B,C}` (ruotate su `rotation.z` per aprire/chiudere).
* `scene`: scena Three.js (qui non è usata direttamente).
* `objectsInteraction`: helper esterno che fornisce un **candidato afferrabile** vicino alla pinza (`getGrabbableCandidate`).
* `physicsEngine`: riferimento al motore fisico (non usato direttamente qui).
* `grabbableObjects`: array di oggetti afferrabili, ciascuno con `{ body: RigidBody-like }`.
* `joystickPivot`, `button`: mesh per animazioni decorative (joystick e pulsante).

Stato interno (i più importanti):

* **Macchina a stati**: `automationState` con valori come
  `MANUAL_HORIZONTAL → DESCENDING → OPERATING → ASCENDING → (delivery…) → MANUAL_HORIZONTAL`.
* `moveState`: input (sinistra/destra/avanti/indietro).
* `moveSpeed`, `moveMargin`: velocità e margine dai bordi.
* `stopStatus {A,B,C}`: flag di “urto/limite” per ciascuna dita durante la chiusura.
* `spawnPosition`: dove si trova la pinza al primo avvio (usato per il ritorno).
* `dropOffPosition`: angolo della macchina dove rilasciare l’oggetto consegnato.
* `isAnimating`, `isClosed`, `isClosing`, `isGrabbing`, `grabbedObject`: stato della pinza e della presa.
* `machineBox`: **Box3** dei limiti interni della macchina.
* `chuteMesh`/`chuteBox`: mesh e bounding box dello **scivolo** (chute) per la consegna automatica.
* `deliveredStars`: contatore “punti/monete” (incrementa quando consegni).
* `initialTransforms`: pose iniziali di ossa e cilindri (usate per riaprire la pinza).
* `buttonPressTime`, `buttonPressDuration`, `joystickTiltAngle`: per le piccole animazioni UI.

---

# Macchina a stati (riassunto rapido)

* `MANUAL_HORIZONTAL`: movimento libero su X/Z dentro `machineBox`.
* `DESCENDING`: discesa verticale fino a `dropTargetY`.
* `OPERATING`: attesa mentre le dita si chiudono.
* `ASCENDING`: risalita fino all’altezza iniziale (`returnYPosition`).

  * Se *sta* afferrando → passa alla sequenza di consegna: `DELIVERING_MOVE_X → DELIVERING_MOVE_Z → DELIVERING_DESCEND`.
  * Se *non* afferra → `RELEASING_OBJECT` (apre e torna manuale).
* `DELIVERING_MOVE_X/Z`: movimentazione orizzontale verso `dropOffPosition`.
* `DELIVERING_DESCEND`: piccola discesa e rilascio programmato.
* `RELEASING_OBJECT`: fase di apertura pinza e “rilascio pulito”.
* `RETURNING_ASCEND → RETURNING_MOVE_Z → RETURNING_MOVE_X`: ritorno alla posizione di spawn.

---

# Metodi (funzioni): cosa fanno e perché

## Costruttore

Inizializza tutte le proprietà sopra, imposta gli stati iniziali e salva le trasformazioni iniziali di ossa/cilindri (per riaprire la pinza con precisione). Prepara anche parametri per animazioni di joystick e pulsante.

---

## `setDependencies(machineBox, chuteMesh)`

* Imposta i riferimenti a **box della macchina** e **mesh dello scivolo**.
* Memorizza `spawnPosition` alla prima chiamata.
* Calcola `dropOffPosition` (angolo interno della macchina con un piccolo margine).
* Se c’è lo scivolo, costruisce `chuteBox` (Box3 dallo scivolo) e chiama `createDropZoneIndicator` (qui è un no-op).

**Perché serve:** separa la costruzione della classe dalla conoscenza dei limiti della macchina; senza `machineBox` non può limitare/clampare né scegliere l’angolo di consegna.

---

## `storeInitialTransforms()`

* Salva `position`, `rotation`, `scale` di **tutte le ossa** e **tutti i cilindri** in `initialTransforms` (chiave = `obj.name`).

**Perché serve:** quando apri la pinza (`openClaw`) interpoli verso la posa **esatta** iniziale, indipendentemente da come si è chiusa.

---

## `toggleClaw()`

* Se non sta animando, apre o chiude la pinza in base a `isClosed`.

**Perché serve:** comodo “toggle” per input/DEBUG.

---

## `waitUntilAllStopped(callback)`

* Controlla periodicamente `stopStatus.{A,B,C}` e chiama `callback()` quando tutte e tre sono true.

**Perché serve:** utility per aspettare la condizione “tutte le dita hanno urtato/si sono fermate”. (Nel flusso attuale, la chiusura già si ferma autonomamente; questa è più da debug/retrocompatibilità).

---

## `checkFingerCollisions()`

* Prende le tre mesh dei cilindri associati a dita A/B/C.
* Costruisce la **Box3** di ciascuna e, per ogni coppia, se si **intersecano** marca `stopStatus` per entrambe.

**Perché serve:** impedisce che le dita si compenetrino; la chiusura di ciascuna dita si ferma “per contatto” con un’altra.

---

## `spendStarAsCoin()`

* Se `deliveredStars > 0`, lo decrementa e ritorna `true`, altrimenti `false`.

**Perché serve:** meccanica “usa un punto come moneta”.

---

## `calculateAndSetDropHeight()`

* Sceglie la quota `dropTargetY` dove **fermarsi in discesa**:

  * Se non ci sono oggetti afferrabili → fallback (`machineBox.min.y + 0.5`).
  * Altrimenti prende l’**oggetto più alto** non in mano (`!isHeld`), usa la sua `y` e **sottrae** un offset di penetrazione (`-0.15`) per calare leggermente **dentro** la pila.
  * Clampa sopra il pavimento (`machineBox.min.y + 0.1`).

**Perché serve:** posizione di “attacco” credibile sulla pila di oggetti, senza bucare il pavimento.

---

## `startDropSequence()`

* **Blocco sicurezza scivolo:** calcola la **Box3 della pinza** e, con un margine dinamico (metà dimensione pinza), evita di avviare la discesa se la pinza è sopra o troppo vicino alla **chute**.
* Se lo stato è `MANUAL_HORIZONTAL` e non sta già animando:

  * registra l’istante di pressione del pulsante (per l’animazione),
  * calcola `dropTargetY`,
  * imposta `isAnimating`, salva `returnYPosition` (quota di partenza),
  * passa a `DESCENDING`.

**Perché serve:** innesca la sequenza automatica di presa, ma impedisce errori vicino allo scivolo.

---

## `async runCloseSequence()`

* Imposta lo stato `OPERATING`.
* **Attende** la chiusura (`await closeClaw()`), poi aspetta 300 ms per stabilizzare e passa a `ASCENDING`.

**Perché serve:** sequenza atomica e ordinata: chiudi → risali (senza aprire).

---

## `async runReleaseAndReturnSequence()`

* Entra in `RELEASING_OBJECT`.
* Se stava afferrando:

  * incrementa `deliveredStars`,
  * rimuove il “pin” logico (`isHeld=false`, `isGrabbing=false`, `grabbedObject=null`),
  * attiva uno **stato di rilascio pulito** sul corpo (`ignoreClawCollision`, `isBeingReleased`, `releaseStartTime`),
  * azzera velocità/forze/coppie e sveglia il body.
* **Apre** la pinza (`await openClaw()`), attende 500 ms, poi passa a `RETURNING_ASCEND`.

**Perché serve:** punto **unico** in cui l’oggetto passa da “in mano” a “rilasciato” in modo fisicamente pulito.

---

## `closeClaw() : Promise`

* Imposta `isClosing=true`, azzera `stopStatus`.
* Ogni 50 ms:

  * ruota ciascuna dita di `-0.03` su `z` **solo se** non è stata fermata da collisioni,
  * aggiorna le matrici, chiama `checkFingerCollisions()`,
  * termina a **timeout** (60 step) **o** quando tutte e tre le dita sono in collisione.
* Alla fine: `isClosed=true`, `isClosing=false`, **resolve** della Promise.

**Perché serve:** animazione di chiusura **autonoma** e autolimitata dalle collisioni tra dita.

---

## `openClaw() : Promise`

* Verifica la presenza di ossa e delle pose iniziali memorizzate.
* Interpola in 30 step (ogni 30 ms) le `rotation.z` di A/B/C dalla posa corrente alla posa iniziale registrata (in `initialTransforms`).
* Alla fine: `isClosed=false`, **resolve**; se mancano dati, **reject**.

**Perché serve:** riapre la pinza in modo consistente con la posa “di fabbrica”.

---

## `resetClawState()`

* Forza lo stato a `MANUAL_HORIZONTAL`, azzera flag di animazione/presa, rilascia il riferimento all’oggetto.
* Se la pinza è chiusa, prova ad aprirla (con gestione errori).

**Perché serve:** pulsante “PANIC/RESET” per tornare a mano.

---

## `getDebugState()`

* Ritorna un piccolo snapshot dello stato interno (stato, flag, presenza oggetto).

**Perché serve:** debug/logging.

---

## `applyDirectLink(deltaTime)`

* Se sta afferrando:

  * imposta `isSleeping=false` sul body,
  * **teletrasporta** la posizione del body al centro della pinza (leggermente sotto: `y - 0.15`),
  * calcola la velocità della pinza come `(pos - lastClawPosition)/deltaTime` e la copia su `linearVelocity`,
  * azzera `angularVelocity`.

**Perché serve:** legame “rigido” pinza-oggetto senza ritardi (zero-lag).

---

## `isInDropZone()`

* Se non ha oggetto → `false`.
* Controlla:

  * proiezione **orizzontale** della pinza **dentro** `chuteBox`,
  * **altezza** della pinza entro `dropZoneThreshold` sopra `chuteBox.max.y`.
* Ritorna `true` se entrambe vere.

**Perché serve:** rilevare quando è sicuro lasciare cadere **direttamente** nello scivolo.

---

## `triggerAutoDrop()`

* Se sta afferrando:

  * incrementa `deliveredStars`,
  * mette `isHeld=false` sull’oggetto,
  * gli dà una leggera **velocità verso il basso** e un po’ di **spin** random,
  * azzera lo stato di presa e, se la pinza era chiusa, la **apre**.

**Perché serve:** rilascio immediato “assistito” nella chute quando la pinza è nella zona corretta.

---

## `createDropZoneIndicator()` / `updateDropZoneIndicator()`

* Placeholder: nessun indicatore visivo, tutta logica.

**Perché serve:** lasciato per futuri overlay/marker.

---

## `updateButtonAnimation()`

* Se è stato “premuto” (ha `buttonPressTime`), anima la `y` del pulsante con una sinusoide **di andata e ritorno** su `buttonPressDuration` (default 250 ms), poi ripristina.

**Perché serve:** feedback visivo della pressione.

---

## `updateJoystickTilt()`

* Legge `moveState` e calcola una rotazione target:

  * avanti/indietro → tilt su **x**,
  * sinistra/destra → tilt su **z**,
* Interpola (`lerp`) la rotazione del **pivot** verso i target.

**Perché serve:** feedback visivo del joystick in base al movimento voluto.

---

## `update(deltaTime)`

Loop per frame. Esegue, nell’ordine:

1. Aggiorna `lastClawPosition`, animazioni pulsante/joystick.
2. **Hook presa durante la chiusura**: se `isClosing` e non sta già afferrando, chiede a `objectsInteraction.getGrabbableCandidate(2)` un oggetto vicino; se c’è e **non** è nella fase di rilascio (`isBeingReleased`), setta presa (`isGrabbing=true`, `isHeld=true`).
3. Se sta afferrando → `applyDirectLink(deltaTime)`.
4. **Macchina a stati**:

   * `MANUAL_HORIZONTAL`
     Calcola vettore da `moveState`, muove su X/Z e **clampa** dentro `machineBox` con `moveMargin`.
   * `DESCENDING`
     Scende fino a `dropTargetY`, poi chiama `runCloseSequence()`.
   * `OPERATING`
     Attesa (la chiusura è asincrona).
   * `ASCENDING`
     Risale a `returnYPosition`; se ha un oggetto → `DELIVERING_MOVE_X`, altrimenti → `RELEASING_OBJECT` e avvia `openClaw()` con fallback (al termine torna manuale).
   * `DELIVERING_MOVE_X / _Z`
     Interpola posizione verso `dropOffPosition.x` poi `.z` (threshold 0.01).
   * `DELIVERING_DESCEND`
     Scende di \~0.5 rispetto a `returnYPosition`, poi avvia `runReleaseAndReturnSequence()`.
   * `RELEASING_OBJECT`
     Time-out di sicurezza (3 s) per forzare il ritorno a `MANUAL_HORIZONTAL` se `openClaw()` non risolvesse.
   * `RETURNING_ASCEND / _MOVE_Z / _MOVE_X`
     Ritorna in quota, poi **lerp** su Z e X fino a `spawnPosition`, quindi `MANUAL_HORIZONTAL` e `isAnimating=false`.
5. Aggiorna le matrici dei `cylinders` (coerenza trasformazioni).

**Perché serve:** è il “cervello” per frame: input, presa, fisica “link”, stati, animazioni, movimenti vincolati.

---

## `checkClawCollision(velocity)`

* Se non c’è `chuteMesh` → `false`.
* Recupera `chuteBVH = chuteMesh.geometry.boundsTree` (richiede che la geometria sia stata **preprocessata** con MeshBVH).
* Per ciascun asse `x/y/z`:

  * costruisce la **Box3** della pinza **spostata** di `velocity[axis]`,
  * trasforma in locale della chute (`worldToChuteMatrix` invertendo `matrixWorld` della chute),
  * se il BVH **interseca** la box, azzera la componente di velocità su quell’asse.
* Applica la **velocità corretta** alla pinza e ritorna `true` se ha bloccato qualcosa.

**Perché serve:** evitare compenetrazioni con la chute in movimenti proposti (utile per controlli “analogici” o AI).

> Nota: perché funzioni, da qualche parte bisogna avere eseguito `MeshBVH.assignBVH(geometry)` (o `geometry.computeBoundsTree()` nella lib), così `geometry.boundsTree` esiste.

---

## `setMoving(direction, state)`

* Aggiorna `moveState[direction]` (es. `'left'`, `'right'`, `'forward'`, `'backward'`) con `true/false`.

**Perché serve:** API semplice per input (keydown/keyup o touch).

---

## `getDeliveredStars()`

* Ritorna il contatore `deliveredStars`.

**Perché serve:** mostrare il punteggio/monete guadagnate.

---

## `resetScore()`

* Azzera `deliveredStars`.

**Perché serve:** ripartenza della partita.

---

# Note di comportamento e integrazione

* **Apertura/chiusura** sono **Promise-based**: le sequenze asincrone (`runCloseSequence`, `runReleaseAndReturnSequence`) usano `await` per orchestrare.
* La presa **avviene** quando `isClosing` e un candidato è disponibile; l’oggetto viene “pinzato” **subito** impostando `isHeld=true` e lo si collega rigidamente con `applyDirectLink`.
* Il **rilascio pulito** centralizza i cambi di stato del body (`isBeingReleased`, `ignoreClawCollision`, azzeramento velocità/forze) in un unico posto.
* La **sicurezza** include:

  * stop su **collisione tra dita** durante la chiusura;
  * **blocco** dell’avvio discesa se la pinza è sopra la **chute** (con margine proporzionale alla dimensione della pinza);
  * **timeout** durante `RELEASING_OBJECT`.
* Il movimento manuale è **clampato** dentro `machineBox` con margine `moveMargin`.

---

Se vuoi, posso anche aggiungere un **diagramma di stato** compatto o annotare il codice con commenti “riga per riga”.


*/