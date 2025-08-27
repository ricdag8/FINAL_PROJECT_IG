import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RigidBody } from './physics_engine.js';
import { Vec3 } from './physics_engine_vec3.js';
import { MeshBVH } from 'https://unpkg.com/three-mesh-bvh@0.7.0/build/index.module.js';
import { CameraUtils } from './Camera_manager.js';
import { PlayerInputHandler } from './Player_controller.js';
import { getExtrasState, updateLightShow, updateDiscoLights, updateCeilingPopcorn } from './extras.js';
import { initializeGame } from './game_initialization.js';
import { 
    updatePrizeAnimations,
    startCandyDisappearanceAnimation,
    updateCandyAnimations,
    updateExplosions
} from './animation.js';
import {
    handleKeyDown as eventHandleKeyDown,
    handleKeyUp as eventHandleKeyUp,
    setEventHandlerState
} from './event_handler.js';
import {
    checkFinalPrizeTrigger,
    checkChuteTrigger,
    tryInitializeClawController,
    resetObjects
} from './prize_trigger_manager.js';
import {
    showInteractionPrompt,
    hideInteractionPrompt,
    updateModeIndicator,
    enterMachineMode,
    exitMachineMode,
    toggleClawCameraMode
} from './ui_manager.js';




let scene, camera, renderer, controls;
let physicsEngine;
let grabbableObjects = [];
let clawController, objectsInteraction;
let candyMachinePrizeAreaBox = null;


let player = null;
let playerController = null;
let playerInputHandler = null;
let homepageManager = null;

// CAMERA SYSTEM VARIABLES
let cameraManager = null;
let isGamePaused = true; //the game starts in a pause condition

// ROOM AND MACHINE SETUP MANAGER
let roomSetupManager = null;

//  GAME STATE VARIABLES
let gameMode = 'exploration'; // 'exploration', 'claw_machine', 'candy_machine'
let currentZone = null;

// Note: Popcorn mode, light show, and disco variables now handled by extras.js

//  CLAW CAMERA MODE TRACKING
let clawCameraMode = 'normal'; // 'normal', 'top_down'
let normalCameraPosition = null;
let normalCameraTarget = null;

//  UI ELEMENTS
let interactionPrompt = null;

// AUDIO - NOW MANAGED BY AudioManager
let audioManager = null;

// LIGHTING SYSTEM - NOW MOVED TO Lightning_manager.js
let lightingManager = null;
let lightReferences = null; // Will reference lightingManager.lightReferences

// COMPATIBILITY REFERENCES (will point to roomSetupManager properties)
let clawGroup, clawLoaded = false, clawBones = {}, cylinders = {};
let allClawCylinders = [];
let clawTopBox, chuteMesh;
let candyMachine;
let joystickMesh, buttonMesh, joystickPivot;
let triggerVolume, finalPrizeHelper;
let interactionZones = [];
let machineOffset, candyMachineOffset;

let coins = 5;
let isGameOver = false;

let popcornManager;
let popcornSpawnPoint;

// Function to update popcornManager when it's loaded asynchronously
window.updatePopcornManager = function(newPopcornManager) {
    console.log('Updating global popcornManager reference:', newPopcornManager);
    popcornManager = newPopcornManager;
};

// --- Make newGame function available globally ---
window.newGame = newGame;


// WALL AND CEILING COLOR FUNCTIONS
window.updateWallColor = function(hexColor) {
    if (roomSetupManager) {
        const roomMaterials = roomSetupManager.getRoomMaterials();
        
        // Update both walls and ceiling
        if (roomMaterials.wall) {
            roomMaterials.wall.color.set(hexColor);
            console.log('Wall color updated to:', hexColor);
        }
        if (roomMaterials.ceiling) {
            roomMaterials.ceiling.color.set(hexColor);
            console.log('Ceiling color updated to:', hexColor);
        }
        
        // Update the preview in the UI
        const preview = document.getElementById('wallColorPreview');
        if (preview) {
            preview.style.backgroundColor = hexColor;
        }
    }
};

window.resetWallColor = function() {
    const defaultColor = '#3a3a3a';
    window.updateWallColor(defaultColor);
    
    // Reset the color picker
    const colorPicker = document.getElementById('wallColorPicker');
    if (colorPicker) {
        colorPicker.value = defaultColor;
    }
};

// FLOOR COLOR FUNCTIONS
window.updateFloorColor = function(hexColor) {
    if (roomSetupManager) {
        const roomMaterials = roomSetupManager.getRoomMaterials();
        if (roomMaterials.floor) {
            roomMaterials.floor.color.set(hexColor);
            console.log('Floor color updated to:', hexColor);
            
            // Update the preview in the UI
            const preview = document.getElementById('floorColorPreview');
            if (preview) {
                preview.style.backgroundColor = hexColor;
            }
        }
    }
};

window.resetFloorColor = function() {
    const defaultColor = '#2c2c2c';
    window.updateFloorColor(defaultColor);
    
    // Reset the color picker
    const colorPicker = document.getElementById('floorColorPicker');
    if (colorPicker) {
        colorPicker.value = defaultColor;
    }
};









init();
// --- NEW: Function to start a new game ---
function newGame() {
    coins = 5;
    isGameOver = false;
    
    // Reset the score in the controller
    if (clawController) {
        clawController.resetScore(); // This method already exists
    }
    
    // Reset the positions of the stars
    resetObjects(clawTopBox, grabbableObjects, chuteMesh, scene); 

    // Update the display
    updateGameUI();
}

function updateGameUI() {
    if (document.getElementById('coinCounter')) {
        document.getElementById('coinCounter').textContent = coins;
    }

    const currentStars = clawController ? clawController.getDeliveredStars() : 0;
    if (document.getElementById('starCounter')) {
        document.getElementById('starCounter').textContent = currentStars;
    }

    const gameOverMsg = document.getElementById('gameOverMessage');
    if (gameOverMsg) {
        if (isGameOver) {
            document.getElementById('finalScore').textContent = currentStars;
            gameOverMsg.style.display = 'block';
        } else {
            gameOverMsg.style.display = 'none';
        }
    }
}















function updateScoreDisplay() {
    const counterElement = document.getElementById('starCounter');
    if (counterElement && clawController) {
        counterElement.textContent = clawController.getDeliveredStars();
    }
}


function init() {
    // Initialize the game using the new initialization system
    const initializedSystems = initializeGame({
        // Dependencies that the initialization system needs
        setupCompatibilityReferences: () => setupCompatibilityReferences(),
        startCandyDisappearanceAnimation: (candyBody) => startCandyDisappearanceAnimation(candyBody),
        setupPhysicsAndObjects: () => setupPhysicsAndObjects(),
        positionClaw: () => positionClaw(),
        tryInitializeClawController: () => {
            const result = tryInitializeClawController(clawLoaded, clawTopBox, joystickPivot, buttonMesh, clawController, allClawCylinders, clawGroup, cylinders, clawBones, scene, physicsEngine, grabbableObjects, chuteMesh, candyMachine);
            if (result) {
                clawController = result.clawController;
                objectsInteraction = result.objectsInteraction;
            }
        },
        onZoneEnter: (zone) => onZoneEnter(zone),
        onZoneExit: (zone) => onZoneExit(zone),
        onWindowResize: () => onWindowResize(),
        animate: () => animate(),
        initializeGameCallback: initializeGameLogic,
        // References to global variables for compatibility
        get candyMachine() { return candyMachine; }
    });
    
    // Update global variables with initialized systems
    scene = initializedSystems.scene;
    camera = initializedSystems.camera;
    renderer = initializedSystems.renderer;
    controls = initializedSystems.controls;
    physicsEngine = initializedSystems.physicsEngine;
    audioManager = initializedSystems.audioManager;
    lightingManager = initializedSystems.lightingManager;
    roomSetupManager = initializedSystems.roomSetupManager;
    playerController = initializedSystems.playerController;
    cameraManager = initializedSystems.cameraManager;
    homepageManager = initializedSystems.homepageManager;
    popcornManager = initializedSystems.popcornManager;
    machineOffset = initializedSystems.machineOffset;
    candyMachineOffset = initializedSystems.candyMachineOffset;
    interactionZones = initializedSystems.interactionZones;
    interactionPrompt = initializedSystems.interactionPrompt;
    lightReferences = initializedSystems.lightReferences;
    
    // Start animation loop after all systems are initialized
    animate();
}


function setupCompatibilityReferences() {
    const components = roomSetupManager.getClawMachineComponents();
    
    // Set global references for compatibility with existing code
    clawGroup = components.clawGroup;
    clawLoaded = components.clawLoaded;
    clawBones = components.clawBones;
    cylinders = components.cylinders;
    allClawCylinders = components.allClawCylinders;
    clawTopBox = components.clawTopBox;
    chuteMesh = components.chuteMesh;
    joystickMesh = components.joystickMesh;
    buttonMesh = components.buttonMesh;
    joystickPivot = components.joystickPivot;
    candyMachine = components.candyMachine;
    triggerVolume = components.triggerVolume;
    finalPrizeHelper = components.finalPrizeHelper;
    
}


function initializeGameLogic() {

    document.getElementById('controls').style.display = 'block';
    document.getElementById('modeIndicator').style.display = 'block';
    document.getElementById('toggleLightControls').style.display = 'block';
    
    cameraManager.initThirdPersonCamera(playerController);
    CameraUtils.initGlobalControls(cameraManager);
    
    const gameStateManager = { get currentZone() { return currentZone; } };
    const modeManager = { enterMachineMode: enterMachineModeWrapper };
    playerInputHandler = new PlayerInputHandler(playerController, gameStateManager, modeManager, cameraManager);
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    

    document.getElementById('resumeBtn').onclick = togglePauseMenu;
    document.getElementById('returnToMainMenuBtn').onclick = () => window.location.reload();
    document.getElementById('changeCharacterBtn').onclick = handleChangeCharacter;

    updateModeIndicator('exploration', clawCameraMode);

    // Resume game
    isGamePaused = false;
    // The animate() call is now global and does not need to be here
}

function handleChangeCharacter() {
    if (!playerController) return;

    // hide the menu but keep the game paused
    const pauseMenu = document.getElementById('pauseMenu');
    pauseMenu.style.display = 'none';
    isGamePaused = true;

    playerController.playDeathAnimation(() => {
        // make the old character invisible instead of removing it.
        if (playerController.mesh) {
            playerController.mesh.visible = false;
        }
        
        // show character selection screen again
        homepageManager.showCharacterSelection();
    });
}


function onZoneEnter(zone) {
    currentZone = zone;
    roomSetupManager.setCurrentZone(zone);
    showInteractionPrompt(zone.machineType, interactionPrompt);
}

function onZoneExit(zone) {
    currentZone = null;
    roomSetupManager.setCurrentZone(null);
    hideInteractionPrompt(interactionPrompt);
}




// wrapper functions to maintain compatibility with existing code
function enterMachineModeWrapper(machineType) {
    const result = enterMachineMode(machineType, cameraManager, playerController, machineOffset, candyMachineOffset, interactionPrompt, clawCameraMode);
    if (result.success) {
        gameMode = result.newGameMode;
    }
}

function exitMachineModeWrapper() {
    const result = exitMachineMode(cameraManager, playerController, controls, camera, currentZone, interactionPrompt, clawCameraMode);
    if (result.success) {
        gameMode = result.newGameMode;
        clawCameraMode = result.newClawCameraMode;
        normalCameraPosition = result.normalCameraPosition;
        normalCameraTarget = result.normalCameraTarget;
    }
}

function toggleClawCameraModeWrapper() {
    const result = toggleClawCameraMode(gameMode, cameraManager, clawGroup, camera, normalCameraPosition, normalCameraTarget, clawCameraMode);
    if (result.success) {
        clawCameraMode = result.newClawCameraMode;
        normalCameraPosition = result.normalCameraPosition;
        normalCameraTarget = result.normalCameraTarget;
    }
}

window.updateModeIndicator = (mode) => updateModeIndicator(mode, clawCameraMode);


function setupPhysicsAndObjects() {
    if (!clawTopBox || !physicsEngine) return;
    const margin = 0.15;
    const floorOffset = 0.10; 
    
    // set the specific bounds for prizes within the claw machine.
    physicsEngine.setPrizeBounds(clawTopBox);
    

    const expandedMin = new Vec3(
        -10, // Espandi per includere la candy machine a sinistra
        clawTopBox.min.y - floorOffset, 
        clawTopBox.min.z + margin
    );
    const expandedMax = new Vec3(
        10, // Espandi per includere la claw machine a destra
        clawTopBox.max.y - margin, 
        clawTopBox.max.z - margin
    );



    
    physicsEngine.setWorldBounds(expandedMin, expandedMax);
    
    // Load multiple objects
    // const objectsToLoad = [
    //     { file: 'glbmodels/star_prize.glb', name: 'Star', scale: 0.16, targetMeshName: 'star' },
    //     //file: 'perfect_football__soccer_ball.glb', name: 'Ball', scale: 0.003, targetMeshName: null }
    // ];
    
    // let loadedCount = 0;
    const loader = new GLTFLoader();
   

loader.load('glbmodels/star_prize.glb', (gltf) => {


let starMesh;
gltf.scene.traverse(node => {
    if (node.isMesh && node.name.toLowerCase().includes('star')) starMesh = node;
});
if (!starMesh) { return; }

//we prepare meshbvh
starMesh.geometry.computeVertexNormals();
starMesh.geometry.computeBoundingBox();
starMesh.geometry.boundsTree = new MeshBVH(starMesh.geometry);

/* 2. crea 20 copie (la prima è l'originale) */
const STAR_COUNT = 20;
for (let i = 0; i < STAR_COUNT; i++) {


const mesh = i === 0 ? starMesh : starMesh.clone();

// give each star its own material instance ---
mesh.material = starMesh.material.clone();

mesh.name = `Star_${i}`;
mesh.scale.setScalar(0.16);
scene.add(mesh);

// rigid-body
const body = new RigidBody(mesh, 1.0);
physicsEngine.addBody(body);

// register the body and mesh in the grabbableObjects array
grabbableObjects.push({ body, name: mesh.name });
objectsInteraction?.addGrabbableObject(body, mesh.name);
}


resetObjects(clawTopBox, grabbableObjects, chuteMesh, scene);
const result = tryInitializeClawController(clawLoaded, clawTopBox, joystickPivot, buttonMesh, clawController, allClawCylinders, clawGroup, cylinders, clawBones, scene, physicsEngine, grabbableObjects, chuteMesh, candyMachine);
if (result) {
    clawController = result.clawController;
    objectsInteraction = result.objectsInteraction;
}
}, undefined, err => {});

    

}

function positionClaw() {
  if (!clawGroup || !clawTopBox) return;
  const margin = 0.1;
  const startPos = new THREE.Vector3(
    clawTopBox.min.x + 0.1 + margin,
    clawTopBox.max.y - 0.3,
    clawTopBox.max.z - 1.5
  );
  clawGroup.position.copy(startPos);
  

  const center = new THREE.Vector3(0, 1, 0);
  controls.target.copy(center);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  // also update the selection camera
  if (homepageManager) {
    homepageManager.onWindowResize();
  }
}

function animate() {
    requestAnimationFrame(animate);
    const deltaTime = 1 / 30;


    if (homepageManager && homepageManager.isActive) {
        homepageManager.update(deltaTime);
        renderer.render(homepageManager.selectionScene, homepageManager.selectionCamera);
        return;
    }


    playerController?.updateAnimation(deltaTime);

    if (!isGamePaused) {

      cameraManager?.update(deltaTime);
      

      lightingManager?.update(deltaTime);
      

      const extrasState = getExtrasState();
      if (extrasState.lightShowActive) {
          updateLightShow(deltaTime);
      }
      

      if (extrasState.discoMode) {
          updateDiscoLights(deltaTime);
      }

      if (popcornManager) {
          popcornManager.update(deltaTime);
      }
      

      updateCeilingPopcorn(deltaTime);
      


      // different game modes 
      switch(gameMode) {
          case 'exploration':
              // Update player in exploration mode
              playerController?.update(deltaTime);
              roomSetupManager.checkInteractionZones(playerController);
              break;
              
          case 'claw_machine':
              // Update claw controller when in claw machine mode
              clawController?.update(deltaTime);
              objectsInteraction?.update();

              //function to change the camera view from normal to claw
              if (camera.userData.followClaw && clawGroup) {
                  const clawPosition = clawGroup.position.clone();
                  const cameraHeight = 0.03;
                  camera.position.set(
                      clawPosition.x,
                      clawPosition.y + cameraHeight,
                      clawPosition.z
                  );
                  camera.lookAt(clawPosition);
              }
              
              // check game over for claw machine
              if (coins <= 0 && clawController && !clawController.isAnimating && !isGameOver) {
                  isGameOver = true;
              }
              
              // Check claw-specific triggers
              if (triggerVolume) {
                  checkChuteTrigger(triggerVolume, grabbableObjects);
              }
              if (finalPrizeHelper) {
                  checkFinalPrizeTrigger(finalPrizeHelper, grabbableObjects, clawTopBox, audioManager);
              }
              break;
              
          case 'candy_machine':
              // Update candy machine when in candy machine mode
              candyMachine?.update(deltaTime);
              break;
      }
      
    
      updatePrizeAnimations(deltaTime, clawTopBox, scene, physicsEngine);
      updateCandyAnimations(deltaTime, scene);
      updateExplosions(deltaTime, scene);
      

      physicsEngine?.update(deltaTime);
      

      updateGameUI();
      

      if (controls.enabled) {
          controls.update();
      }
    }
  
  renderer.render(scene, camera);
}



// 
window.applyLightPreset = function(presetName) {
    if (lightingManager) {
        lightingManager.applyLightPreset(presetName);


        if (audioManager) {
            if (presetName === 'dark') {
                audioManager.stopAllBGM();
            } else {
                audioManager.playBGM(presetName);
            }
        }
    } else {
    }
};





function handleKeyDown(e) {
    const callbacks = {
        togglePauseMenu,
        toggleClawCameraMode: toggleClawCameraModeWrapper,
        exitMachineMode: exitMachineModeWrapper,
        updateCoinsDisplay: (newCoins) => { coins = newCoins; }
    };
    
    setEventHandlerState({
        gameMode,
        isGamePaused,
        clawController,
        playerInputHandler,
        candyMachine,
        coins,
        isGameOver
    });
    
    eventHandleKeyDown(e, callbacks);
}

function handleKeyUp(e) {
    setEventHandlerState({
        gameMode,
        isGamePaused,
        clawController,
        playerInputHandler,
        candyMachine,
        coins,
        isGameOver
    });
    
    eventHandleKeyUp(e);
}






function togglePauseMenu() {
    isGamePaused = !isGamePaused;
    const pauseMenu = document.getElementById('pauseMenu');
    pauseMenu.style.display = isGamePaused ? 'flex' : 'none';

    if (!isGamePaused) {

        animate();
    }
}



