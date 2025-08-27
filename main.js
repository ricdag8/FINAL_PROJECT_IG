import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RigidBody } from './physics_engine.js';
import { Vec3 } from './physics_engine_vec3.js';
import { ClawController } from './claw_controller.js';
import { GrabbableObjectsInteraction } from './grabbable_objects_interaction.js';
import { MeshBVH } from 'https://unpkg.com/three-mesh-bvh@0.7.0/build/index.module.js';
import { CameraUtils } from './Camera_manager.js';
import { PlayerInputHandler } from './Player_controller.js';
import { getExtrasState, startLightShow, updateLightShow, updateDiscoLights, updateCeilingPopcorn } from './extras.js';
import { initializeGame } from './game_initialization.js';
import { 
    startPrizeAnimation,
    updatePrizeAnimations,
    startCandyDisappearanceAnimation,
    updateCandyAnimations,
    updateExplosions,
    resetAnimations
} from './animation.js';
import {
    handleKeyDown as eventHandleKeyDown,
    handleKeyUp as eventHandleKeyUp,
    setEventHandlerState
} from './event_handler.js';




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
    resetObjects(); 

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







function startPrizeAnimationLocal(body) {
    body.isAnimating = true;
    audioManager.playSound('prizeWin');
    startLightShow();
    startPrizeAnimation(body, clawTopBox);
}








//we have two triggers, so we check for the second trigger to then trigger the whole animation
function checkFinalPrizeTrigger() {
    if (!finalPrizeHelper || !grabbableObjects) return;

    const helperBox = new THREE.Box3().setFromObject(finalPrizeHelper); //this is basically the second trigger, which allows the star to drop

    grabbableObjects.forEach(objData => {
        const body = objData.body;

        // Controlla solo le stelle che stanno cadendo ma non sono ancora bloccate
        if (body && body.canFallThrough && !body.isBlocked) {
            const bodyBox = new THREE.Box3().setFromObject(body.mesh);

            if (helperBox.intersectsBox(bodyBox)) {
                // when the star approaches the helper box, then it completely stop its movement, it becomes a still body
                body.isBlocked = true;
                body.linearVelocity.set(0, 0, 0);
                body.angularVelocity.set(0, 0, 0);
                body.isSleeping = false;
                body.hasTouchedClaw = false;
                body.canFallThrough = false; //the star can basically do nothing, it becomes a still body 


                startPrizeAnimationLocal(body); 
            }
        }
    });
}





//this instead is the first helper, that is used in order to let the star fall in the second helper
//more in detail this function is needed in order to let the star fall through the machine box
function checkChuteTrigger() {
    if (!triggerVolume || !grabbableObjects || grabbableObjects.length === 0) {
        return; //we just do some safety checks in order to avoid errors
    }

      //triggerVolume -> the invisible trigger zone mesh must be loaded
      //grabbableObjects ->  array of stars must exist and contain items

    const triggerBox = new THREE.Box3().setFromObject(triggerVolume); //we define the trigger volume

    let foundCollisions = 0;
    grabbableObjects.forEach((objData, index) => {
        const body = objData.body;

        // check only if objects have been authorized to fall
        if (body && !body.canFallThrough) {
            const bodyBox = new THREE.Box3().setFromObject(body.mesh);
            
            // Only log star positions if they're near the trigger area
            const starPos = body.mesh.position;
            const triggerCenter = triggerVolume.position;
            const distance = starPos.distanceTo(triggerCenter);
            
            if (distance < 3.0) { // Only log if star is within 3 units of trigger
                console.log(`Star ${index} near trigger - pos:`, starPos, 'distance:', distance.toFixed(2));
            }

            // Se la bounding box della stella interseca quella dell'helper...
            if (triggerBox.intersectsBox(bodyBox)) {

                body.canFallThrough = true; //if the star intersect the chute, then it can fall
                foundCollisions++;
            }
        }
    });
}



function tryInitializeClawController() {
    //we check if all the components are loaded, and if so we initialize the claw controller
    if (clawLoaded && clawTopBox && joystickPivot && buttonMesh && !clawController) {
        objectsInteraction = new GrabbableObjectsInteraction(allClawCylinders);
        
        //we pass to the clawcontroller all the necessary components
        clawController = new ClawController(clawGroup, Object.values(cylinders), clawBones, scene, objectsInteraction, physicsEngine, grabbableObjects, joystickPivot, buttonMesh);

        clawController.setDependencies(clawTopBox, chuteMesh); //we set the dependencies for the claw controller, by adding the chute mesh
        //we basically link each element of the claw controller to the physics engine and we link them together

        //we add all grabbable objects to the interaction system, so this
        //allows the claw controller to interact with them
        grabbableObjects.forEach(objData => {
            if (objData.body) {
                objectsInteraction.addGrabbableObject(objData.body, objData.name);
            }
        });
        

        if (candyMachine && clawController) {
            candyMachine.setClawController(clawController);
        }
    }
}

function resetObjects() {
    if (!clawTopBox || grabbableObjects.length === 0) return;

    const center = new THREE.Vector3();
    clawTopBox.getCenter(center);
    const size = new THREE.Vector3();
    clawTopBox.getSize(size);

    //we don't want objects to spawn inside the chute
    const chuteBox = chuteMesh ? new THREE.Box3().setFromObject(chuteMesh) : null;
    const starRadius = 0.2; //we add a sef radius to not let the stars spawn inside the chute

    const spawnAreaWidth = size.x * 0.7;
    const spawnAreaDepth = size.z * 0.9;

    // we will spawn objects in a grid-like pattern, centered around the claw machine, in order not to overlap with the chute
    //i did this because i wanted to create a more organized spawning system that did not spawn stars at random, more in particular i didn't want
    //stars to spawn inside the chute, so i created a grid-like system that spawns stars in a grid around the chute, or at least stars go to a grid like structure when we have a lot of them
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

        // If the calculated position is inside the chute, place it at a default safe spot.
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
function resetScore() {
    if (clawController) {
        clawController.resetScore();
        updateScoreDisplay();
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
        tryInitializeClawController: () => tryInitializeClawController(),
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
    const modeManager = { enterMachineMode: enterMachineMode };
    playerInputHandler = new PlayerInputHandler(playerController, gameStateManager, modeManager, cameraManager);
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    

    document.getElementById('resumeBtn').onclick = togglePauseMenu;
    document.getElementById('returnToMainMenuBtn').onclick = () => window.location.reload();
    document.getElementById('changeCharacterBtn').onclick = handleChangeCharacter;

    updateModeIndicator('exploration');

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
    showInteractionPrompt(zone.machineType);
}

function onZoneExit(zone) {
    currentZone = null;
    roomSetupManager.setCurrentZone(null);
    hideInteractionPrompt();
}


function showInteractionPrompt(machineType) {
    if (interactionPrompt) {
        const machineName = machineType === 'claw_machine' ? 'Claw Machine' : 'Candy Machine';
        interactionPrompt.innerHTML = `Press <span style="color: #ffd700;">E</span> to use ${machineName}`;
        interactionPrompt.style.display = 'block';
    }
}

function hideInteractionPrompt() {
    if (interactionPrompt) {
        interactionPrompt.style.display = 'none';
    }
}

function updateModeIndicator(mode) {
    const indicator = document.getElementById('modeIndicator');
    if (!indicator) return;
    
    switch(mode) {
        case 'exploration':
            indicator.textContent = 'Exploration Mode - WASD to move, E to interact';
            indicator.style.background = 'rgba(0,0,0,0.7)';
            break;
        case 'claw_machine':
            const cameraMode = clawCameraMode === 'top_down' ? 'TOP-DOWN' : 'FIRST PERSON';
            indicator.textContent = `${cameraMode} - Claw Machine: WASD to move claw, ↓ to grab, P to toggle camera, ESC to exit`;
            indicator.style.background = 'rgba(255,68,68,0.8)';
            break;
        case 'candy_machine':
            indicator.textContent = 'FIRST PERSON - Candy Machine: C to insert coin, M to dispense, ESC to exit';
            indicator.style.background = 'rgba(68,68,255,0.8)';
            break;
        case 'popcorn':
            indicator.textContent = 'POPCORN MODE ACTIVE - X to toggle popcorn rain, WASD to move';
            indicator.style.background = 'rgba(255,215,0,0.8)';
            break;
        case 'disco':
            indicator.textContent = 'DISCO MODE ACTIVE - L to toggle party lights, WASD to move';
            indicator.style.background = 'rgba(255,0,255,0.8)';
            break;
    }
}


window.updateModeIndicator = updateModeIndicator;


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




/*
  The physics engine uses worldBounds to create invisible walls that prevent objects from falling into the void.

  Look at this code from physics_engine.js:
  if (this.worldBounds) this.handleCollisions();

  The physics engine collides objects with these boundaries like invisible walls.

  Why Just clawTopBox Isn't Enough:

  Scenario 1: Player Movement

  Player walks from [Claw Machine] → [Candy Machine]
  - With only clawTopBox: Player hits invisible wall at X=0, can't reach candy machine
  - With expanded bounds: Player can move freely across entire room

  Scenario 2: Objects Falling from Claw

  Star falls from claw and bounces toward candy machine area
  - With only clawTopBox: Star hits invisible wall and gets stuck
  - With expanded bounds: Star can bounce naturally around the room

  Scenario 3: Candy Machine Objects

  Candies dispense from candy machine at X=-5
  - With only clawTopBox: Candies immediately fall through the floor (no physics bounds)
  - With expanded bounds: Candies can exist and be collected

  The Two-Boundary System:

  physicsEngine.setPrizeBounds(clawTopBox);        // Stars stay inside claw machine
  physicsEngine.setWorldBounds(expandedMin, expandedMax); // Everything else uses room bounds

  - prizeBounds: Tight boundaries for stars (keeps them in claw machine)
  - worldBounds: Room-wide boundaries for everything else (player, candies, fallen objects)

  Without Expanded Bounds:

  - Player can't explore the full room
  - Objects disappear when they leave the claw machine
  - Candy machine doesn't work properly
  - No physics collision with room walls

  The expanded bounds create the "physics room" that matches the visual room the player sees.

⏺ Now I understand the physics system! Let me explain exactly why the expanded bounds are needed:

  What World Bounds Do:

  The physics engine uses worldBounds to create invisible walls that prevent objects from falling into the void.

  Look at this code from physics_engine.js:
  if (this.worldBounds) this.handleCollisions();

  The physics engine collides objects with these boundaries like invisible walls.

  Why Just clawTopBox Isn't Enough:

  Scenario 1: Player Movement

  Player walks from [Claw Machine] → [Candy Machine]
  - With only clawTopBox: Player hits invisible wall at X=0, can't reach candy machine
  - With expanded bounds: Player can move freely across entire room

  Scenario 2: Objects Falling from Claw

  Star falls from claw and bounces toward candy machine area
  - With only clawTopBox: Star hits invisible wall and gets stuck
  - With expanded bounds: Star can bounce naturally around the room

  Scenario 3: Candy Machine Objects

  Candies dispense from candy machine at X=-5
  - With only clawTopBox: Candies immediately fall through the floor (no physics bounds)
  - With expanded bounds: Candies can exist and be collected

  The Two-Boundary System:

  physicsEngine.setPrizeBounds(clawTopBox);        // Stars stay inside claw machine
  physicsEngine.setWorldBounds(expandedMin, expandedMax); // Everything else uses room bounds

  - prizeBounds: Tight boundaries for stars (keeps them in claw machine)
  - worldBounds: Room-wide boundaries for everything else (player, candies, fallen objects)

  Without Expanded Bounds:

  - Player can't explore the full room
  - Objects disappear when they leave the claw machine
  - Candy machine doesn't work properly
  - No physics collision with room walls

  The expanded bounds create the "physics room" that matches the visual room the player sees.*/





    
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


resetObjects();
tryInitializeClawController();
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
                  checkChuteTrigger();
              }
              if (finalPrizeHelper) {
                  checkFinalPrizeTrigger();
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




function enterMachineMode(machineType) {
    if (!cameraManager || !playerController?.mesh) return;
    
    gameMode = machineType;
    

    playerController.mesh.visible = false;
    
    // use the camera manager to switch view in first person 
    const targetMachineOffset = machineType === 'claw_machine' ? machineOffset : candyMachineOffset;
    cameraManager.switchToMachineMode(machineType, targetMachineOffset, () => {
      
        
        updateModeIndicator(machineType);
        hideInteractionPrompt();
    });
}

function exitMachineMode() {
    if (!cameraManager || !playerController?.mesh) return;
    
    const oldMode = gameMode;
    gameMode = 'exploration';
    

    clawCameraMode = 'normal';
    camera.userData.followClaw = false;
    normalCameraPosition = null;
    normalCameraTarget = null;
    

    playerController.mesh.visible = true;
    
    // disable machine controls
    controls.enabled = false;
    
    // use camera manager to switch back to exploration mode
    cameraManager.switchToExplorationMode(playerController, () => {
        updateModeIndicator('exploration');
        
        // check if player is still in a zone
        if (currentZone) {
            showInteractionPrompt(currentZone.machineType);
        }
    });
}


function toggleClawCameraMode() {
    if (gameMode !== 'claw_machine' || !cameraManager || !clawGroup) return;
    
    if (clawCameraMode === 'normal') {
        // save current camera position and target
        normalCameraPosition = camera.position.clone();
        normalCameraTarget = new THREE.Vector3();
        camera.getWorldDirection(normalCameraTarget);
        normalCameraTarget.add(camera.position);
        
        // switch to top-down view
        switchToTopDownView();
        clawCameraMode = 'top_down';
        updateModeIndicator('claw_machine');
    } else {
        // switch back to normal view
        switchToNormalView();
        clawCameraMode = 'normal';
        updateModeIndicator('claw_machine');
    }
}

function switchToTopDownView() {
    if (!clawGroup) return;
    
    // get the claw's current position
    const clawPosition = clawGroup.position.clone();
    
    // position camera above the claw
    const cameraHeight = 1.5; // Height above the claw
    const cameraPos = new THREE.Vector3(
        clawPosition.x,
        clawPosition.y + cameraHeight,
        clawPosition.z
    );
    
    // set camera position and look down at the claw
    camera.position.copy(cameraPos);
    camera.lookAt(clawPosition);
    
    // update camera each frame to follow the claw
    camera.userData.followClaw = true;
}

function switchToNormalView() {
    if (!normalCameraPosition || !normalCameraTarget) return;
    
    // restore the original camera position and target
    camera.position.copy(normalCameraPosition);
    camera.lookAt(normalCameraTarget);
    
    // Stop following the claw
    camera.userData.followClaw = false;
}


function handleKeyDown(e) {
    const callbacks = {
        togglePauseMenu,
        toggleClawCameraMode,
        exitMachineMode,
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



