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

//resets and neatly respawns all grabbable objects inside the machine, avoiding the chute
function resetObjects(clawTopBox, grabbableObjects, chuteMesh, scene) {
    //early exit if we have no bounds or no objects
    if (!clawTopBox || grabbableObjects.length === 0) return;

    //get center and size of the allowed area
    const center = new THREE.Vector3();
    clawTopBox.getCenter(center);
    const size = new THREE.Vector3();
    clawTopBox.getSize(size);

    //build a box for the chute to avoid spawning inside it
    const chuteBox = chuteMesh ? new THREE.Box3().setFromObject(chuteMesh) : null;
    const starRadius = 0.2; //we add a small radius so stars do not spawn too close to the chute

    //define a spawn area smaller than the full bounds for safety margins
    const spawnAreaWidth = size.x * 0.7;
    const spawnAreaDepth = size.z * 0.6;

    //define a grid layout to place objects in layers
    const itemsPerLayer = 10; //total items per layer
    const cols = 5; //number of columns in the grid
    const rows = 2; //number of rows in the grid
    const spacingX = spawnAreaWidth / (cols > 1 ? cols - 1 : 1); //horizontal spacing
    const spacingZ = spawnAreaDepth / (rows > 1 ? rows - 1 : 1); //depth spacing
    const layerHeight = 0.25; //vertical spacing between layers

    //compute the top-left start of the grid in world space
    const startX = center.x - spawnAreaWidth / 2;
    const startZ = clawTopBox.min.z + 0.3; //bias away from the chute side
    const baseY = clawTopBox.min.y + 0.1; //slightly above the floor

    //stop any running star animations before resetting states
    resetAnimations();

    //place each object on the grid with layered stacking
    grabbableObjects.forEach((objData, idx) => {
        const b = objData.body;

        //compute current layer and position within the layer
        const layerIdx = Math.floor(idx / itemsPerLayer);
        const idxInLayer = idx % itemsPerLayer;
        const r = Math.floor(idxInLayer / cols); //row index
        const c = idxInLayer % cols; //column index

        //offset every other layer for better packing
        const xOffset = (layerIdx % 2 === 1) ? spacingX / 2 : 0;

        //final grid position for this object
        const x = startX + c * spacingX + xOffset;
        const z = startZ + r * spacingZ;
        const y = baseY + (layerIdx * layerHeight);

        //candidate position to test against the chute
        const testPosition = new THREE.Vector3(x, y, z);

        //warning:this expands the chute box in place, so repeated calls may grow it over time
        //note:if this is unwanted, clone the box before expanding
        if (chuteBox && chuteBox.expandByScalar(starRadius).containsPoint(testPosition)) {
            //fallback safe spot if inside chute
            b.position.set(center.x, baseY, clawTopBox.min.z + 0.3);
        } else {
            //use the planned grid position
            b.position.set(x, y, z);
        }

        //reset linear and angular velocities for a clean start
        b.linearVelocity.set(0, 0, 0);
        b.orientation.setFromEuler(new THREE.Euler(
            Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI
        )); //give a random relaxed orientation
        b.angularVelocity.set(0, 0, 0);

        //sync the visible mesh with the physics body
        b.mesh.position.copy(b.position);
        b.mesh.quaternion.copy(b.orientation);

        //wake the body and clear contact flags
        b.isSleeping = false;
        b.hasTouchedClaw = false;

        //ensure the mesh is in the scene and visible
        if (!b.mesh.parent) scene.add(b.mesh);
        b.mesh.visible = true;

        //reset custom gameplay flags
        b.canFallThrough = false;
        b.isBlocked = false;
    });
}

//resets the score on the controller and updates the ui
function resetScore(clawController, updateScoreDisplay) {
    //only proceed if a controller exists
    if (clawController) {
        //set score to zero on the controller
        clawController.resetScore();
        //refresh the on-screen score display
        updateScoreDisplay();
    }
}

export {
    checkFinalPrizeTrigger, //exports an external function for final prize detection
    checkChuteTrigger, //exports an external function to detect chute interactions
    tryInitializeClawController, //exports an external function to init the claw controller
    resetObjects, //exports the reset objects utility
    resetScore, //exports the reset score utility
    startPrizeAnimationLocal //exports an external function for local prize animation
};
