import * as THREE from 'three';
import { GrabbableObjectsInteraction } from './grabbable_objects_interaction.js';
import { ClawController } from './claw_controller.js';
import { startPrizeAnimation, resetAnimations } from './animation.js';
import { startLightShow } from './extras.js';

// prize trigger animation handler - starts the prize win sequence
function startPrizeAnimationLocal(body, clawTopBox, audioManager) {
    body.isAnimating = true;
    audioManager.playSound('prizeWin');
    startLightShow();
    startPrizeAnimation(body, clawTopBox);
}

// we have two triggers, so we check for the second trigger to then trigger the whole animation
function checkFinalPrizeTrigger(finalPrizeHelper, grabbableObjects, clawTopBox, audioManager) {
    if (!finalPrizeHelper || !grabbableObjects) return;

    const helperBox = new THREE.Box3().setFromObject(finalPrizeHelper); // this is basically the second trigger, which allows the star to drop

    grabbableObjects.forEach(objData => {
        const body = objData.body;

        // controlla solo le stelle che stanno cadendo ma non sono ancora bloccate
        if (body && body.canFallThrough && !body.isBlocked) {
            const bodyBox = new THREE.Box3().setFromObject(body.mesh);

            if (helperBox.intersectsBox(bodyBox)) {
                // when the star approaches the helper box, then it completely stop its movement, it becomes a still body
                body.isBlocked = true;
                body.linearVelocity.set(0, 0, 0);
                body.angularVelocity.set(0, 0, 0);
                body.isSleeping = false;
                body.hasTouchedClaw = false;
                body.canFallThrough = false; // the star can basically do nothing, it becomes a still body 

                startPrizeAnimationLocal(body, clawTopBox, audioManager); 
            }
        }
    });
}

// this instead is the first helper, that is used in order to let the star fall in the second helper
// more in detail this function is needed in order to let the star fall through the machine box
function checkChuteTrigger(triggerVolume, grabbableObjects) {
    if (!triggerVolume || !grabbableObjects || grabbableObjects.length === 0) {
        return; // we just do some safety checks in order to avoid errors
    }

    // triggerVolume -> the invisible trigger zone mesh must be loaded
    // grabbableObjects ->  array of stars must exist and contain items

    const triggerBox = new THREE.Box3().setFromObject(triggerVolume); // we define the trigger volume

    let foundCollisions = 0;
    grabbableObjects.forEach((objData, index) => {
        const body = objData.body;

        // check only if objects have been authorized to fall
        if (body && !body.canFallThrough) {
            const bodyBox = new THREE.Box3().setFromObject(body.mesh);
            
            // only log star positions if they're near the trigger area
            const starPos = body.mesh.position;
            const triggerCenter = triggerVolume.position;
            const distance = starPos.distanceTo(triggerCenter);
            
            if (distance < 3.0) { // only log if star is within 3 units of trigger
                console.log(`Star ${index} near trigger - pos:`, starPos, 'distance:', distance.toFixed(2));
            }

            // se la bounding box della stella interseca quella dell'helper...
            if (triggerBox.intersectsBox(bodyBox)) {
                body.canFallThrough = true; // if the star intersect the chute, then it can fall
                foundCollisions++;
            }
        }
    });
}

function tryInitializeClawController(clawLoaded, clawTopBox, joystickPivot, buttonMesh, clawController, allClawCylinders, clawGroup, cylinders, clawBones, scene, physicsEngine, grabbableObjects, chuteMesh, candyMachine) {
    // we check if all the components are loaded, and if so we initialize the claw controller
    if (clawLoaded && clawTopBox && joystickPivot && buttonMesh && !clawController) {
        const objectsInteraction = new GrabbableObjectsInteraction(allClawCylinders);
        
        // we pass to the clawcontroller all the necessary components
        const newClawController = new ClawController(clawGroup, Object.values(cylinders), clawBones, scene, objectsInteraction, physicsEngine, grabbableObjects, joystickPivot, buttonMesh);

        newClawController.setDependencies(clawTopBox, chuteMesh); // we set the dependencies for the claw controller, by adding the chute mesh
        // we basically link each element of the claw controller to the physics engine and we link them together

        // we add all grabbable objects to the interaction system, so this
        // allows the claw controller to interact with them
        grabbableObjects.forEach(objData => {
            if (objData.body) {
                objectsInteraction.addGrabbableObject(objData.body, objData.name);
            }
        });
        

        if (candyMachine && newClawController) {
            candyMachine.setClawController(newClawController);
        }

        return { clawController: newClawController, objectsInteraction };
    }
    return null;
}

function resetObjects(clawTopBox, grabbableObjects, chuteMesh, scene) {
    if (!clawTopBox || grabbableObjects.length === 0) return;

    const center = new THREE.Vector3();
    clawTopBox.getCenter(center);
    const size = new THREE.Vector3();
    clawTopBox.getSize(size);

    // we don't want objects to spawn inside the chute
    const chuteBox = chuteMesh ? new THREE.Box3().setFromObject(chuteMesh) : null;
    const starRadius = 0.2; // we add a sef radius to not let the stars spawn inside the chute

    const spawnAreaWidth = size.x * 0.7;
    const spawnAreaDepth = size.z * 0.9;

    // we will spawn objects in a grid-like pattern, centered around the claw machine, in order not to overlap with the chute
    // i did this because i wanted to create a more organized spawning system that did not spawn stars at random, more in particular i didn't want
    // stars to spawn inside the chute, so i created a grid-like system that spawns stars in a grid around the chute, or at least stars go to a grid like structure when we have a lot of them
    const itemsPerLayer = 10;
    const cols = 5;
    const rows = 2;
    const spacingX = spawnAreaWidth / (cols > 1 ? cols - 1 : 1);
    const spacingZ = spawnAreaDepth / (rows > 1 ? rows - 1 : 1);
    const layerHeight = 0.25;

    
    const startX = center.x - spawnAreaWidth / 2;
    // we make the stars spawn on the top left corner of the claw machine, not on the chute
    const startZ = clawTopBox.min.z + 0.3; 
    const baseY = clawTopBox.min.y + 0.1;

    resetAnimations();

    grabbableObjects.forEach((objData, idx) => {
        const b = objData.body;

        const layerIdx = Math.floor(idx / itemsPerLayer);
        const idxInLayer = idx % itemsPerLayer;
        
        const r = Math.floor(idxInLayer / cols);
        const c = idxInLayer % cols;

        const xOffset = (layerIdx % 2 === 1) ? spacingX / 2 : 0;

        const x = startX + c * spacingX + xOffset;
        const z = startZ + r * spacingZ;
        const y = baseY + (layerIdx * layerHeight);
        
        const testPosition = new THREE.Vector3(x, y, z);

        // if the calculated position is inside the chute, place it at a default safe spot.
        if (chuteBox && chuteBox.expandByScalar(starRadius).containsPoint(testPosition)) {
             b.position.set(center.x, baseY, clawTopBox.min.z + 0.3);
        } else {
             b.position.set(x, y, z);
        }
        
        b.linearVelocity.set(0, 0, 0);
        b.orientation.setFromEuler(new THREE.Euler(
            Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI));
        b.angularVelocity.set(0, 0, 0);
        b.mesh.position.copy(b.position);
        b.mesh.quaternion.copy(b.orientation);
        b.isSleeping = false;
        b.hasTouchedClaw = false;
        
        if (!b.mesh.parent) scene.add(b.mesh);
        b.mesh.visible = true;
        
        b.canFallThrough = false;
        b.isBlocked = false;
    });
}

function resetScore(clawController, updateScoreDisplay) {
    if (clawController) {
        clawController.resetScore();
        updateScoreDisplay();
    }
}

export {
    checkFinalPrizeTrigger,
    checkChuteTrigger,
    tryInitializeClawController,
    resetObjects,
    resetScore,
    startPrizeAnimationLocal
};