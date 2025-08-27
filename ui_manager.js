import * as THREE from 'three';

//ui and camera management functions for the game interface and camera controls

//shows the interaction prompt when player approaches a machine
function showInteractionPrompt(machineType, interactionPrompt) {
    if (interactionPrompt) {
        //determine which machine name to display based on type
        const machineName = machineType === 'claw_machine' ? 'Claw Machine' : 'Candy Machine';
        //update prompt html with colored key indicator and machine name
        interactionPrompt.innerHTML = `Press <span style="color: #ffd700;">E</span> to use ${machineName}`;
        interactionPrompt.style.display = 'block'; //make the prompt visible
    }
}

//hides the interaction prompt when player moves away from machines
function hideInteractionPrompt(interactionPrompt) {
    if (interactionPrompt) {
        interactionPrompt.style.display = 'none'; //make the prompt invisible
    }
}

//updates the on-screen mode indicator with instructions and background color
function updateModeIndicator(mode, clawCameraMode) {
    const indicator = document.getElementById('modeIndicator'); //get the ui element
    if (!indicator) return; //safety check if element doesn't exist
    
    //different text and colors for each game mode
    switch(mode) {
        case 'exploration':
            indicator.textContent = 'Exploration Mode - WASD to move, E to interact';
            indicator.style.background = 'rgba(0,0,0,0.7)'; //dark background
            break;
        case 'claw_machine':
            //show current camera mode in the text
            const cameraMode = clawCameraMode === 'top_down' ? 'TOP-DOWN' : 'FIRST PERSON';
            indicator.textContent = `${cameraMode} - Claw Machine: WASD to move claw, ↓ to grab, P to toggle camera, ESC to exit`;
            indicator.style.background = 'rgba(255,68,68,0.8)'; //red background for claw machine
            break;
        case 'candy_machine':
            indicator.textContent = 'FIRST PERSON - Candy Machine: C to insert coin, M to dispense, ESC to exit';
            indicator.style.background = 'rgba(68,68,255,0.8)'; //blue background for candy machine
            break;
        case 'popcorn':
            indicator.textContent = 'POPCORN MODE ACTIVE - X to toggle popcorn rain, WASD to move';
            indicator.style.background = 'rgba(255,215,0,0.8)'; //gold background for popcorn mode
            break;
        case 'disco':
            indicator.textContent = 'DISCO MODE ACTIVE - L to toggle party lights, WASD to move';
            indicator.style.background = 'rgba(255,0,255,0.8)'; //magenta background for disco mode
            break;
    }
}

//switches the player from exploration mode to machine interaction mode
function enterMachineMode(machineType, cameraManager, playerController, machineOffset, candyMachineOffset, interactionPrompt, clawCameraMode) {
    if (!cameraManager || !playerController?.mesh) return { success: false }; //safety checks
    
    playerController.mesh.visible = false; //hide the player character model
    
    //use the camera manager to switch view in first person 
    const targetMachineOffset = machineType === 'claw_machine' ? machineOffset : candyMachineOffset;
    cameraManager.switchToMachineMode(machineType, targetMachineOffset, () => {
        updateModeIndicator(machineType, clawCameraMode); //update ui to show machine controls
        hideInteractionPrompt(interactionPrompt); //hide the interaction prompt
    });
    
    return { success: true, newGameMode: machineType }; //return new game state
}

//switches the player back from machine interaction mode to exploration mode
function exitMachineMode(cameraManager, playerController, controls, camera, currentZone, interactionPrompt, clawCameraMode) {
    if (!cameraManager || !playerController?.mesh) return { success: false }; //safety checks
    
    //reset camera settings
    camera.userData.followClaw = false; //stop camera from following the claw
    
    playerController.mesh.visible = true; //show the player character model again
    
    //disable machine controls
    controls.enabled = false; //turn off machine interaction controls
    
    //use camera manager to switch back to exploration mode
    cameraManager.switchToExplorationMode(playerController, () => {
        updateModeIndicator('exploration', clawCameraMode); //update ui to show exploration controls
        
        //check if player is still in a zone
        if (currentZone) {
            showInteractionPrompt(currentZone.machineType, interactionPrompt); //show interaction prompt if still near machine
        }
    });
    
    return { 
        success: true, 
        newGameMode: 'exploration', //back to exploration mode
        newClawCameraMode: 'normal', //reset camera mode
        normalCameraPosition: null, //clear saved camera position
        normalCameraTarget: null //clear saved camera target
    };
}

//toggles between normal first-person view and top-down view when using claw machine
function toggleClawCameraMode(gameMode, cameraManager, clawGroup, camera, normalCameraPosition, normalCameraTarget, clawCameraMode) {
    if (gameMode !== 'claw_machine' || !cameraManager || !clawGroup) return { success: false }; //only works in claw machine mode
    
    if (clawCameraMode === 'normal') {
        //save current camera position and target before switching
        const newNormalCameraPosition = camera.position.clone(); //save where camera is now
        const newNormalCameraTarget = new THREE.Vector3();
        camera.getWorldDirection(newNormalCameraTarget); //get camera direction
        newNormalCameraTarget.add(camera.position); //calculate target point
        
        //switch to top-down view
        switchToTopDownView(clawGroup, camera); //move camera above claw
        updateModeIndicator('claw_machine', 'top_down'); //update ui indicator
        
        return { 
            success: true,
            newClawCameraMode: 'top_down',
            normalCameraPosition: newNormalCameraPosition, //remember old position
            normalCameraTarget: newNormalCameraTarget //remember old target
        };
    } else {
        //switch back to normal view
        switchToNormalView(normalCameraPosition, normalCameraTarget, camera); //restore saved position
        updateModeIndicator('claw_machine', 'normal'); //update ui indicator
        
        return { 
            success: true,
            newClawCameraMode: 'normal',
            normalCameraPosition, //keep the saved positions
            normalCameraTarget
        };
    }
}

//moves camera to top-down position above the claw for bird's eye view
function switchToTopDownView(clawGroup, camera) {
    if (!clawGroup) return; //safety check
    
    //get the claw's current position
    const clawPosition = clawGroup.position.clone(); //copy current claw location
    
    //position camera above the claw
    const cameraHeight = 1.5; //height above the claw in 3d units
    const cameraPos = new THREE.Vector3(
        clawPosition.x, //same x position as claw
        clawPosition.y + cameraHeight, //elevated y position
        clawPosition.z //same z position as claw
    );
    
    //set camera position and look down at the claw
    camera.position.copy(cameraPos); //move camera to calculated position
    camera.lookAt(clawPosition); //point camera down at the claw
    
    //update camera each frame to follow the claw
    camera.userData.followClaw = true; //enable automatic claw following
}

//restores camera to normal first-person view from top-down mode
function switchToNormalView(normalCameraPosition, normalCameraTarget, camera) {
    if (!normalCameraPosition || !normalCameraTarget) return; //safety check for saved positions
    
    //restore the original camera position and target
    camera.position.copy(normalCameraPosition); //move camera back to saved position
    camera.lookAt(normalCameraTarget); //point camera at saved target
    
    //stop following the claw
    camera.userData.followClaw = false; //disable automatic claw following
}

//export all ui and camera management functions for use in other game modules
export {
    showInteractionPrompt,    //shows interaction prompts to the player
    hideInteractionPrompt,    //hides interaction prompts from the player
    updateModeIndicator,      //updates the on-screen mode indicator with instructions
    enterMachineMode,         //switches player from exploration to machine interaction
    exitMachineMode,          //switches player from machine interaction back to exploration
    toggleClawCameraMode,     //toggles between first-person and top-down camera views
    switchToTopDownView,      //moves camera above claw for bird's eye view
    switchToNormalView        //restores camera to normal first-person view
};