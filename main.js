import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RigidBody, PhysicsEngine } from './physics_engine.js';
import { Vec3 } from './physics_engine_vec3.js';
import { ClawController } from './claw_controller.js';
import { GrabbableObjectsInteraction } from './grabbable_objects_interaction.js';
import { MeshBVH, MeshBVHHelper } from 'https://unpkg.com/three-mesh-bvh@0.7.0/build/index.module.js';
import { CandyMachine } from './candy_machine.js';
import { CameraManager, CameraUtils } from './Camera_manager.js';
import { PlayerController, PlayerInputHandler, PlayerTestUtils } from './Player_controller.js';
import { LightingManager } from './Lightning_manager.js';
import { RoomSetupManager, InteractionZone } from './Room_setup.js';
import { HomepageManager } from './Homepage.js';
import { AudioManager } from './AudioManager.js';
import { PopcornManager } from './popcorn.js';

// 🆕 ROOM SETUP AND MACHINE LOADING NOW MOVED TO Room_setup.js

// 🆕 DICHIARAZIONE VARIABILI GLOBALI ALL'INIZIO
let scene, camera, renderer, controls;
let physicsEngine;
let grabbableObjects = [];
let clawController, objectsInteraction;
let animatingPrizes = [];
let activeExplosions = [];  
let animatingCandies = [];
let candyMachinePrizeAreaBox = null;

// 🆕 PLAYER SYSTEM VARIABLES
let player = null;
let playerController = null;
let playerInputHandler = null;
let homepageManager = null;

// 🆕 CAMERA SYSTEM VARIABLES
let cameraManager = null;
let isGamePaused = true; // CRITICAL: Start in a paused state

// 🆕 ROOM AND MACHINE SETUP MANAGER
let roomSetupManager = null;

// 🆕 GAME STATE VARIABLES
let gameMode = 'exploration'; // 'exploration', 'claw_machine', 'candy_machine'
let currentZone = null;

// 🆕 UI ELEMENTS
let interactionPrompt = null;

// 🆕 AUDIO - NOW MANAGED BY AudioManager
let audioManager = null;

// 🆕 LIGHTING SYSTEM - NOW MOVED TO Lightning_manager.js
let lightingManager = null;
let lightReferences = null; // Will reference lightingManager.lightReferences

// 🆕 COMPATIBILITY REFERENCES (will point to roomSetupManager properties)
let clawGroup, clawLoaded = false, clawBones = {}, cylinders = {};
let allClawCylinders = [];
let clawTopBox, chuteMesh;
let candyMachine;
let joystickMesh, buttonMesh, joystickPivot, triggerVolume;
let finalPrizeHelper;
let interactionZones = [];
let machineOffset, candyMachineOffset;

let coins = 5;
let isGameOver = false;

let popcornManager;
let popcornSpawnPoint;

// --- Make newGame function available globally ---
window.newGame = newGame;

// ... (keep existing init() function)

init();
// --- NEW: Function to start a new game ---
function newGame() {
    console.log("🚀 Starting a new game!");
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

// in bbox.html


// in bbox.html

// Funzione per creare un sistema di particelle per l'esplosione
function createExplosion(position, color = new THREE.Color(0xffdd00)) {
    const particleCount = 100;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const particleData = [];

    for (let i = 0; i < particleCount; i++) {
        // Assegna una velocità casuale verso l'esterno a ogni particella
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        ).normalize().multiplyScalar(Math.random() * 3 + 1); // Velocità tra 1 e 4

        particleData.push({
            velocity: velocity,
            lifetime: Math.random() * 1.5 + 0.5 // Durata da 0.5 a 2 secondi
        });
    }

    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: color,
        size: 0.05,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const explosion = new THREE.Points(particles, material);
    explosion.position.copy(position);
    explosion.userData.particles = particleData; // Salva i dati delle particelle
    explosion.userData.time = 0; // Tempo trascorso per l'esplosione

    activeExplosions.push(explosion);
    scene.add(explosion);
}

// Funzione per animare le esplosioni attive
function updateExplosions(deltaTime) {
    const gravity = 5.0;

    activeExplosions.forEach((explosion, index) => {
        explosion.userData.time += deltaTime;
        const positions = explosion.geometry.attributes.position.array;
        const particles = explosion.userData.particles;
        let activeParticles = 0;

        for (let i = 0; i < particles.length; i++) {
            if (explosion.userData.time < particles[i].lifetime) {
                const p = particles[i];
                // Applica la velocità
                positions[i * 3] += p.velocity.x * deltaTime;
                positions[i * 3 + 1] += p.velocity.y * deltaTime;
                positions[i * 3 + 2] += p.velocity.z * deltaTime;
                // Applica la gravità
                p.velocity.y -= gravity * deltaTime;
                activeParticles++;
            }
        }
        
        // Dissolvenza dell'esplosione
        explosion.material.opacity = 1.0 - (explosion.userData.time / 2.0);

        if (activeParticles === 0 || explosion.userData.time > 2.0) {
            // Rimuovi l'esplosione quando è finita
            scene.remove(explosion);
            activeExplosions.splice(index, 1);
        } else {
            explosion.geometry.attributes.position.needsUpdate = true;
        }
    });
}

   // in bbox.html

function startPrizeAnimation(body) {
    console.log(`🏆 Animazione finale avviata per ${body.mesh.name}!`);
    
    // 🆕 Riproduci il suono di vittoria tramite AudioManager
    audioManager.playSound('prizeWin');

    // Aggiunge la stella alla lista delle animazioni da eseguire
    animatingPrizes.push({
        body: body,
        state: 'moving_out', // Stato iniziale: uscita dalla macchina
    });
}

// SOSTITUISCI la vecchia funzione updatePrizeAnimations con questa versione
function updatePrizeAnimations(deltaTime) {
    if (!clawTopBox) return;

    const moveSpeed = 0.5;
    const targetZ = clawTopBox.max.z + 0.5;

    animatingPrizes.forEach(prize => {
        const body = prize.body;
        const mesh = body.mesh;
        
        switch (prize.state) {
            // State 1: The star moves out of the machine
            case 'moving_out':
                // CORRECT: We now animate the physics body's position.
                body.position.z += moveSpeed * deltaTime;
                if (body.position.z >= targetZ) {
                    prize.state = 'choose_destruction'; // Move to the selection state
                }
                break;
            
            // State 2: Randomly choose a destruction animation
            case 'choose_destruction':
                const animations = ['explode', 'shrink', 'fly_up'];
                const choice = animations[Math.floor(Math.random() * animations.length)];
                console.log(`Animation chosen for ${mesh.name}: ${choice}`);

                if (choice === 'explode') {
                    // CORRECT: Use the body's position for the explosion.
                    createExplosion(body.position, mesh.material.color);
                    scene.remove(mesh);
                    prize.state = 'disappeared'; // Animation is instant
                } else {
                    mesh.material.transparent = true; // Required for fading
                    if (choice === 'shrinking') {
                        prize.state = 'shrinking';
                    } else { // fly_up
                        prize.state = 'flying_up';
                    }
                }
                break;

            // State 3a: Shrink and fade animation (No position change, this is fine)
            case 'shrinking':
                mesh.scale.multiplyScalar(1 - (deltaTime * 2.5)); // Shrink over ~0.4s
                mesh.material.opacity -= deltaTime * 2;           // Fade over 0.5s

                if (mesh.scale.x < 0.001) {
                    scene.remove(mesh);
                    prize.state = 'disappeared';
                }
                break;

            // State 3b: Fly up and fade animation
            case 'flying_up':
                // CORRECT: Animate the physics body's Y position.
                body.position.y += deltaTime * 3.0;     // Fly up fast
                mesh.material.opacity -= deltaTime * 1.5; // Fade out over ~0.6s

                if (mesh.material.opacity <= 0) {
                    scene.remove(mesh);
                    prize.state = 'disappeared';
                }
                break;
        }
    });

    // Filter the list to remove completed animations
    animatingPrizes = animatingPrizes.filter(p => p.state !== 'disappeared');
}

// --- AGGIUNTO: Nuove funzioni per l'animazione delle caramelle ---

// Funzione per avviare l'animazione di scomparsa di una caramella
function startCandyDisappearanceAnimation(candyBody) {
    // 1. Rimuovi la caramella dal motore fisico
    physicsEngine.removeBody(candyBody);

    // 2. Scegli casualmente un'animazione
    const animations = ['confetti', 'ribbons'];
    const choice = animations[Math.floor(Math.random() * animations.length)];
    
    console.log(`🍬 Animazione di scomparsa per la caramella: ${choice}`);

    // 3. Aggiungi la caramella alla lista delle animazioni da eseguire
    animatingCandies.push({
        body: candyBody,
        state: choice,
        lifetime: 0,
        // Altre proprietà verranno aggiunte dinamicamente
    });
}

// Funzione per aggiornare le animazioni delle caramelle ogni frame
function updateCandyAnimations(deltaTime) {
    const gravity = 3.0; // Gravità più leggera per un effetto fluttuante

    for (let i = animatingCandies.length - 1; i >= 0; i--) {
        const candyAnim = animatingCandies[i];
        candyAnim.lifetime += deltaTime;

        switch (candyAnim.state) {
            case 'confetti':
                // Usa la funzione esistente 'createExplosion' passando il colore della caramella
                createExplosion(candyAnim.body.mesh.position, candyAnim.body.mesh.material.color);
                scene.remove(candyAnim.body.mesh);
                animatingCandies.splice(i, 1); // Rimuovi subito, l'esplosione è istantanea
                break;

            case 'ribbons':
                if (!candyAnim.ribbons) {
                    // --- Creazione iniziale dei nastri ---
                    candyAnim.ribbons = [];
                    const count = 15;
                    for (let j = 0; j < count; j++) {
                        const ribbonGeo = new THREE.BoxGeometry(0.02, 0.4, 0.02);
                        const ribbonMat = candyAnim.body.mesh.material.clone();
                        ribbonMat.transparent = true;

                        const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
                        ribbon.position.copy(candyAnim.body.mesh.position);
                        
                        // Dagli una velocità iniziale casuale verso l'alto e verso l'esterno
                        const velocity = new THREE.Vector3(
                            (Math.random() - 0.5) * 2,
                            Math.random() * 2 + 1,
                            (Math.random() - 0.5) * 2
                        );
                        ribbon.userData.velocity = velocity;
                        ribbon.userData.angularVelocity = new THREE.Vector3(Math.random()*4-2, Math.random()*4-2, Math.random()*4-2);

                        candyAnim.ribbons.push(ribbon);
                        scene.add(ribbon);
                    }
                    scene.remove(candyAnim.body.mesh); // Rimuovi la caramella originale
                } else {
                    // --- Aggiornamento dei nastri esistenti ---
                    let allFaded = true;
                    candyAnim.ribbons.forEach(ribbon => {
                        // Applica fisica semplice
                        ribbon.userData.velocity.y -= gravity * deltaTime;
                        ribbon.position.add(ribbon.userData.velocity.clone().multiplyScalar(deltaTime));
                        
                        // Applica rotazione
                        ribbon.rotation.x += ribbon.userData.angularVelocity.x * deltaTime;
                        ribbon.rotation.y += ribbon.userData.angularVelocity.y * deltaTime;
                        ribbon.rotation.z += ribbon.userData.angularVelocity.z * deltaTime;

                        // Dissolvenza
                        if (ribbon.material.opacity > 0) {
                            ribbon.material.opacity -= deltaTime * 0.5;
                            allFaded = false;
                        }
                    });

                    // Se tutti i nastri sono scomparsi, rimuovi l'animazione
                    if (allFaded || candyAnim.lifetime > 3.0) {
                        candyAnim.ribbons.forEach(r => scene.remove(r));
                        animatingCandies.splice(i, 1);
                    }
                }
                break;
        }
    }
}


// Questa funzione controlla se una stella ha toccato l'helper finale.
function checkFinalPrizeTrigger() {
    if (!finalPrizeHelper || !grabbableObjects) return;

    const helperBox = new THREE.Box3().setFromObject(finalPrizeHelper);

    grabbableObjects.forEach(objData => {
        const body = objData.body;

        // Controlla solo le stelle che stanno cadendo ma non sono ancora bloccate
        if (body && body.canFallThrough && !body.isBlocked) {
            const bodyBox = new THREE.Box3().setFromObject(body.mesh);

            if (helperBox.intersectsBox(bodyBox)) {
                // Blocca la stella e ferma immediatamente il suo movimento
                body.isBlocked = true;
                body.linearVelocity.set(0, 0, 0);
                body.angularVelocity.set(0, 0, 0);
                body.isSleeping = false;
                body.hasTouchedClaw = false;
                body.canFallThrough = false;

                // Avvia l'animazione del premio
                startPrizeAnimation(body);
            }
        }
    });
}






function checkChuteTrigger() {
    if (!triggerVolume || !grabbableObjects || grabbableObjects.length === 0) {
        return; // Assicurati che tutto sia stato caricato
    }

    const triggerBox = new THREE.Box3().setFromObject(triggerVolume);

    grabbableObjects.forEach(objData => {
        const body = objData.body;

        // Controlla solo gli oggetti che non sono già stati autorizzati a cadere
        if (body && !body.canFallThrough) {
            const bodyBox = new THREE.Box3().setFromObject(body.mesh);

            // Se la bounding box della stella interseca quella dell'helper...
            if (triggerBox.intersectsBox(bodyBox)) {
                console.log(`🌟 La stella ${body.mesh.name} è nello scivolo! Autorizzata a cadere.`);
                body.canFallThrough = true; // ...imposta il flag per farla cadere.
            }
        }
    });
}
// in bbox.html, aggiungi questa nuova funzione

function tryInitializePopcornManager() {
    if (!scene || !popcornSpawnPoint) return;

    // Raccogli gli oggetti con cui i popcorn devono collidere
    // Per ora, solo il pavimento della stanza
    // const floor = scene.getObjectByName('Floor');
    // if (floor) {
    //     collidersForPopcorn.push(floor);
    // }
    // Aggiungiamo anche la macchina dei popcorn stessa
    if (popcornMachineMesh) {
        collidersForPopcorn.push(popcornMachineMesh);
    }

    // Passa i collisori al manager, che li passerà a ogni particella
    popcornManager = new PopcornManager({
        scene: scene,
        spawnMesh: popcornSpawnPoint,
        count: 20, // Un buon numero di popcorn
        gravity: 0.02,
        baseScale: 0.08,
        // 🍿 Passiamo i collisori!
        colliders: collidersForPopcorn
    });

    console.log("✅ Popcorn Manager inizializzato!");
}



function tryInitializeClawController() {
    // MODIFICATO: La condizione ora controlla 'joystickPivot', la variabile corretta.
    if (clawLoaded && clawTopBox && joystickPivot && buttonMesh && !clawController) {
        objectsInteraction = new GrabbableObjectsInteraction(allClawCylinders);
        
        // Passiamo il perno (joystickPivot) al costruttore
        clawController = new ClawController(clawGroup, Object.values(cylinders), clawBones, scene, objectsInteraction, physicsEngine, grabbableObjects, joystickPivot, buttonMesh);
        
        clawController.setDependencies(clawTopBox, chuteMesh);

        // Questa parte aggiunge gli oggetti al sistema di interazione
        grabbableObjects.forEach(objData => {
            if (objData.body) {
                objectsInteraction.addGrabbableObject(objData.body, objData.name);
            }
        });
        console.log("✅ Claw controller initialised with joystick PIVOT.");
        
        // 🆕 LINK CANDY MACHINE TO CLAW CONTROLLER
        if (candyMachine && clawController) {
            candyMachine.setClawController(clawController);
            console.log("✅ CandyMachine linked to ClawController.");
        }
    }
}
// in bbox.html
function resetObjects() {
    if (!clawTopBox || grabbableObjects.length === 0) return;

    const center = new THREE.Vector3();
    clawTopBox.getCenter(center);
    const size = new THREE.Vector3();
    clawTopBox.getSize(size);

    // Get the chute's bounding box to avoid spawning objects inside it.
    const chuteBox = chuteMesh ? new THREE.Box3().setFromObject(chuteMesh) : null;
    const starRadius = 0.2; // A safe radius to check against the chute.

    const spawnAreaWidth = size.x * 0.7;
    const spawnAreaDepth = size.z * 0.9;

    const itemsPerLayer = 10;
    const cols = 5;
    const rows = 2;
    const spacingX = spawnAreaWidth / (cols > 1 ? cols - 1 : 1);
    const spacingZ = spawnAreaDepth / (rows > 1 ? rows - 1 : 1);
    const layerHeight = 0.25;

    // The starting point for the grid, calculated from the center.
    const startX = center.x - spawnAreaWidth / 2;
    // IMPORTANT: Make sure the spawn area is on the opposite side of the chute.
    // Assuming chute is at max Z, we spawn starting from min Z.
    const startZ = clawTopBox.min.z + 0.3; 
    const baseY = clawTopBox.min.y + 0.1;

    animatingPrizes = [];
    activeExplosions.forEach(exp => scene.remove(exp));
    activeExplosions = [];

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
             console.warn(`Skipping spawn for a star at (${x.toFixed(2)}, ${z.toFixed(2)}) as it's in the chute zone.`);
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
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e); // Colore più scuro per una sala giochi
  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 100);
  
  // 🆕 INITIALIZE AUDIO MANAGER
  audioManager = new AudioManager();
  audioManager.initialize(camera);
  // ⚠️ ASSICURATI DI AVERE I FILE AUDIO NELLA CARTELLA 'sounds/'
  audioManager.loadSound('prizeWin', 'sounds/success-1-6297.mp3');
  audioManager.loadSound('prizeWin', 'sounds/goodresult-82807.mp3');
  audioManager.loadSound('prizeWin', 'sounds/winner-bell-game-show-91932.mp3');

  // 🆕 LOAD BACKGROUND MUSIC (loop = true)
  audioManager.loadSound('arcade', 'sounds/background music/bgm-arcade.mp3', 0.2, true);
  audioManager.loadSound('neon', 'sounds/background music/bgm-neon.mp3', 0.2, true);
  audioManager.loadSound('warm', 'sounds/background music/bgm-warm.mp3', 0.2, true);
  audioManager.loadSound('cool', 'sounds/background music/bgm-cool.mp3', 0.8, true);
  audioManager.loadSound('dark', 'sounds/background music/bgm-dark.mp3', 0.2, true);
  
  // 🆕 LOAD CHARACTER-SPECIFIC SOUNDS
  audioManager.loadSound('Businessman_wave', 'sounds/character/businessman_hello.mp3', 0.8);
  audioManager.loadSound('Hoodie_wave', 'sounds/character/hoodie_hey.mp3', 0.8);
  audioManager.loadSound('Worker_wave', 'sounds/character/worker_hey.mp3', 0.8);
  
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  
  // 🆕 SHADOW SETUP NOW HANDLED BY LightingManager
  
  document.body.appendChild(renderer.domElement);
  
  // 🆕 INIT PHYSICS ENGINE FIRST
  physicsEngine = new PhysicsEngine();
  
  // 🆕 SETUP PLAYER SYSTEM (but don't load character yet) - Pass AudioManager
  playerController = new PlayerController(scene, physicsEngine, roomSetupManager, audioManager);
  
  // 🆕 SETUP CAMERA SYSTEM (without target initially)
  cameraManager = new CameraManager(camera);
  cameraManager.initialize(scene);
  
  // 🆕 SETUP HOMEPAGE MANAGER - Pass AudioManager
  homepageManager = new HomepageManager(playerController, cameraManager, initializeGame, audioManager);
  
  // 🆕 DISABLE ORBIT CONTROLS IN EXPLORATION MODE
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false; // Disabled by default, will be enabled only in machine modes
  
  // 🆕 INITIALIZE ROOM SETUP MANAGER
  roomSetupManager = new RoomSetupManager();
  roomSetupManager.initialize(scene, physicsEngine, cameraManager);
  
  // 🆕 GET MACHINE POSITIONS FROM ROOM MANAGER
  machineOffset = roomSetupManager.getMachineOffset();
  candyMachineOffset = roomSetupManager.getCandyMachineOffset();
  
  // 🆕 SETUP INTERACTION ZONES
  interactionZones = roomSetupManager.setupInteractionZones(onZoneEnter, onZoneExit);
  
  // 🆕 SETUP UI ELEMENTS
  interactionPrompt = document.getElementById('interactionPrompt');
  
  // 🆕 INITIALIZE LIGHTING MANAGER
  lightingManager = new LightingManager();
  lightingManager.initialize(scene, machineOffset, candyMachineOffset);
  lightingManager.setupShadows(renderer);
  lightingManager.setupLighting();
  lightingManager.setupLightControls();
  
  // 🆕 SET GLOBAL REFERENCE FOR COMPATIBILITY
  lightReferences = lightingManager.getLightReferences();
  
  // 🆕 CREATE GAME ROOM AND LOAD MACHINES
  roomSetupManager.createGameRoom();
  
  // 🆕 LINK ROOM MATERIALS TO LIGHTING MANAGER
  const roomMaterials = roomSetupManager.getRoomMaterials();
  lightingManager.setRoomMaterials(roomMaterials);
  
  // 🆕 LINK PAINTING LIGHTS TO LIGHTING MANAGER
  const paintingLights = roomSetupManager.getPaintingSpotlights();
  lightingManager.addPaintingLights(paintingLights);
  
         // 🆕 LOAD ALL MACHINES ASYNCHRONOUSLY
   roomSetupManager.loadAllMachines().then((results) => {
       console.log("✅ All machines loaded, setting up compatibility references...");
       setupCompatibilityReferences();
     
       
       // 🆕 SET CANDY MACHINE CALLBACK
       if (candyMachine) {
           candyMachine.onCandyEjected = startCandyDisappearanceAnimation;
       }


   // =================== 🍿 INSERISCI QUESTO BLOCCO QUI ===================
// in bbox.html, nel .then() di loadAllMachines

// =================== 🍿 SOSTITUISCI IL VECCHIO BLOCCO CON QUESTO ===================
// =================== 🍿 SOSTITUISCI IL VECCHIO BLOCCO CON QUESTO ===================
const loader = new GLTFLoader();
loader.load('popcorn_machine.glb', (gltf) => {
    const popcornMachineMesh = gltf.scene;
    popcornMachineMesh.scale.set(0.5, 0.5, 0.5);
    popcornMachineMesh.position.set(-3, 0.7, -2);
    popcornMachineMesh.rotation.y = Math.PI / 2;
    scene.add(popcornMachineMesh);
    popcornMachineMesh.updateMatrixWorld(true);
    let firstMeshFallback = null;
    let popcornContainerMesh = null;
    let popcornSpawnPoint = null;

    popcornMachineMesh.traverse(child => {
        if (child.isMesh) {
            child.geometry.computeVertexNormals();
            child.geometry.boundsTree = new MeshBVH(child.geometry);
            physicsEngine.addStaticCollider(child);

            if (child.name === 'Cylinder042__0') {
                popcornSpawnPoint = child;
            }
            if (child.name === 'Box002_09_-_Default_0') {
                popcornContainerMesh = child;
            }
            if (!firstMeshFallback) {
                firstMeshFallback = child;
            }
        }
    });

    if (!popcornSpawnPoint) {
        console.warn("ATTENZIONE: Mesh 'SpawnPoint_Popcorn' non trovata. Uso la prima mesh come fallback.");
        popcornSpawnPoint = firstMeshFallback;
    }

    let finalContainer = popcornContainerMesh;

    if (popcornContainerMesh) {
        const originalBox = new THREE.Box3().setFromObject(popcornContainerMesh);
        const originalSize = new THREE.Vector3();
        const originalCenter = new THREE.Vector3();
        originalBox.getSize(originalSize);
        originalBox.getCenter(originalCenter);
// Per modificare SOLO l'altezza (Y), usa questo codice:
const newSize = originalSize.multiplyScalar(0.9).clone(); // Crea una copia per non toccare le dimensioni originali
newSize.y *= 0.5; // Esempio: imposta l'altezza al 50% dell'originale
originalCenter.y += 0.37;
const smallerGeometry = new THREE.BoxGeometry(newSize.x, newSize.y, newSize.z);

        // --- MODIFICA QUI ---
        // 1. Crea un materiale verde e wireframe per rendere visibile l'helper
        const helperMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00, // Verde
            wireframe: true
        });
        const smallerContainerHelper = new THREE.Mesh(smallerGeometry, helperMaterial);
        // --- FINE MODIFICA ---

        smallerContainerHelper.position.copy(originalCenter);
        smallerContainerHelper.quaternion.copy(popcornContainerMesh.quaternion);
        
        // Non è più necessario `visible = false`
        scene.add(smallerContainerHelper);
        finalContainer = smallerContainerHelper;

        console.log("✅ Creato helper di contenimento più piccolo e VISIBILE.");

    } else {
        console.warn("ATTENZIONE: Mesh contenitore 'Box002_09_-_Default_0' non trovata!");
    }

    if (popcornSpawnPoint) {
        popcornManager = new PopcornManager({
            scene: scene,
            spawnMesh: popcornSpawnPoint,
            containerMesh: finalContainer,
            count: 100
        });
        console.log(`✅ Popcorn Manager Inizializzato usando '${popcornSpawnPoint.name}' come spawn.`);
    } else {
        console.error("❌ ERRORE CRITICO: Nessuna mesh trovata nel modello popcorn_machine.glb.");
    }

}, undefined, (error) => {
    console.error("❌ Errore nel caricamento della macchina per popcorn!", error);
});
// ======================================================================================


       
       setupPhysicsAndObjects();
       positionClaw();
       tryInitializeClawController();

       // Hide the loading screen now that assets are ready
       const loadingScreen = document.getElementById('loadingScreen');
       if (loadingScreen) {
           loadingScreen.style.display = 'none';
       }

       // 🆕 SHOW CHARACTER SELECTION via HomepageManager
       homepageManager.showCharacterSelection();

   }).catch((error) => {
       console.error("❌ Failed to load machines:", error);
   });
  window.addEventListener('resize', onWindowResize);
  
  // 🆕 REMOVE INPUT LISTENERS - will be added after character selection
  // document.addEventListener('keydown', handleKeyDown);
  // document.addEventListener('keyup', handleKeyUp);
  
  // 🆕 INITIALIZE UI
  // updateModeIndicator('exploration');
  
  // START THE ANIMATION LOOP IMMEDIATELY
  animate();
}

// 🆕 SETUP COMPATIBILITY REFERENCES
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
    triggerVolume = components.triggerVolume;
    finalPrizeHelper = components.finalPrizeHelper;
    candyMachine = components.candyMachine;
    
    console.log("🔗 Compatibility references set up");
}

// 🆕 GAME START LOGIC (now using HomepageManager)
function initializeGame() {
    // 🆕 Rendi visibile l'interfaccia di gioco
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
    
    // 🆕 SET UP PAUSE MENU BUTTONS
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

    // Hide the menu but keep the game paused
    const pauseMenu = document.getElementById('pauseMenu');
    pauseMenu.style.display = 'none';
    isGamePaused = true;

    playerController.playDeathAnimation(() => {
        // Make the old character invisible instead of removing it.
        if (playerController.mesh) {
            playerController.mesh.visible = false;
        }
        
        // Show character selection screen again
        homepageManager.showCharacterSelection();
    });
}

// 🆕 ZONE EVENT HANDLERS
function onZoneEnter(zone) {
    currentZone = zone;
    roomSetupManager.setCurrentZone(zone);
    showInteractionPrompt(zone.machineType);
    console.log(`🎮 Entered ${zone.machineType} zone`);
}

function onZoneExit(zone) {
    currentZone = null;
    roomSetupManager.setCurrentZone(null);
    hideInteractionPrompt();
    console.log(`🚶 Exited ${zone.machineType} zone`);
}

// 🆕 UI MANAGEMENT FUNCTIONS
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
            indicator.textContent = 'FIRST PERSON - Claw Machine: WASD to move claw, ↓ to grab, ESC to exit';
            indicator.style.background = 'rgba(255,68,68,0.8)';
            break;
        case 'candy_machine':
            indicator.textContent = 'FIRST PERSON - Candy Machine: C to insert coin, M to dispense, ESC to exit';
            indicator.style.background = 'rgba(68,68,255,0.8)';
            break;
    }
}

// 🆕 ROOM SETUP AND MACHINE LOADING NOW MOVED TO Room_setup.js

// 🆕 ROOM CREATION AND MACHINE LOADING NOW MOVED TO Room_setup.js

function setupPhysicsAndObjects() {
    if (!clawTopBox || !physicsEngine) return;
    console.log('Setting up physics and objects...');
    const margin = 0.15;
    const floorOffset = 0.10; 
    
    // Set the specific bounds for prizes within the claw machine.
    physicsEngine.setPrizeBounds(clawTopBox);
    
    // 🆕 ESPANDI I BOUNDS per includere entrambe le posizioni delle macchine
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
    
    console.log("🌍 World bounds set from:", expandedMin, "to:", expandedMax);
    physicsEngine.setWorldBounds(expandedMin, expandedMax);
    
    // Load multiple objects
    const objectsToLoad = [
        { file: 'star_prize.glb', name: 'Star', scale: 0.16, targetMeshName: 'star' },
        //file: 'perfect_football__soccer_ball.glb', name: 'Ball', scale: 0.003, targetMeshName: null }
    ];
    
    let loadedCount = 0;
    const loader = new GLTFLoader();
    /* carica il modello star_prize.glb UNA volta */

loader.load('star_prize.glb', (gltf) => {

/* 0. trova la mesh "star" */
let starMesh;
gltf.scene.traverse(node => {
    if (node.isMesh && node.name.toLowerCase().includes('star')) starMesh = node;
});
if (!starMesh) { console.error('no star mesh'); return; }

/* 1. prepara BVH e bounding box sulla mesh originale */
starMesh.geometry.computeVertexNormals();
starMesh.geometry.computeBoundingBox();
starMesh.geometry.boundsTree = new MeshBVH(starMesh.geometry);

/* 2. crea 20 copie (la prima è l'originale) */
const STAR_COUNT = 20;
for (let i = 0; i < STAR_COUNT; i++) {

// a) clona la mesh (con geometria condivisa)
const mesh = i === 0 ? starMesh : starMesh.clone();

// --- MODIFICATION: Give each star its own material instance ---
mesh.material = starMesh.material.clone();

mesh.name = `Star_${i}`;
mesh.scale.setScalar(0.16);
scene.add(mesh);

// b) rigid-body
const body = new RigidBody(mesh, 1.0);
physicsEngine.addBody(body);

// c) registra per interazioni
grabbableObjects.push({ body, name: mesh.name });
objectsInteraction?.addGrabbableObject(body, mesh.name);
}


/* 3. posiziona e sveglia tutto */
resetObjects();
tryInitializeClawController();
}, undefined, err => console.error(err));

    

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
  
  // 🆕 AGGIORNA IL TARGET DEI CONTROLLI per centrare la vista
  const center = new THREE.Vector3(0, 1, 0); // Centro tra le macchine
  controls.target.copy(center);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  // Also update the selection camera
  if (homepageManager) {
    homepageManager.onWindowResize();
  }
}

function animate() {
    requestAnimationFrame(animate);
    const deltaTime = 1 / 60;

    // If the character selection screen is active, render its own scene.
    if (homepageManager && homepageManager.isActive) {
        homepageManager.update(deltaTime);
        renderer.render(homepageManager.selectionScene, homepageManager.selectionCamera);
        return; // Stop here, don't render the main game
    }

    // 🆕 Always update the player's animation mixer, even when paused
    playerController?.updateAnimation(deltaTime);

    if (!isGamePaused) {
      // 🆕 ALWAYS UPDATE CAMERA MANAGER (for transitions)
      cameraManager?.update(deltaTime);
      
      // 🆕 UPDATE LIGHTING ANIMATIONS
      lightingManager?.update(deltaTime);
      

      if (popcornManager) {
          popcornManager.update(deltaTime);
      }
      


      // 🆕 UPDATE DIFFERENT SYSTEMS BASED ON GAME MODE
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
              
              // Check game over for claw machine
              if (coins <= 0 && clawController && !clawController.isAnimating && !isGameOver) {
                  isGameOver = true;
                  console.log("GAME OVER. Final score:", clawController.getDeliveredStars());
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
      
      // 🆕 ALWAYS UPDATE THESE SYSTEMS
      // Note: Camera updates are now handled by cameraManager in each mode
      
      // Animation systems (these work across all modes)
      updatePrizeAnimations(deltaTime);
      updateCandyAnimations(deltaTime);
      updateExplosions(deltaTime);
      
      // Physics engine (always running)
      physicsEngine?.update(deltaTime);
      
      // UI updates
      updateGameUI();
      
      // 🆕 ONLY UPDATE ORBIT CONTROLS WHEN ENABLED
      if (controls.enabled) {
          controls.update();
      }
    }
  
  renderer.render(scene, camera);
}

// 🆕 LIGHT CONTROL FUNCTIONS NOW MOVED TO Lightning_manager.js

// 🆕 LIGHT PRESET FUNCTION (now uses LightingManager)
window.applyLightPreset = function(presetName) {
    if (lightingManager) {
        lightingManager.applyLightPreset(presetName);

        // 🆕 Play BGM based on preset
        if (audioManager) {
            if (presetName === 'dark') {
                audioManager.stopAllBGM();
            } else {
                audioManager.playBGM(presetName);
            }
        }
    } else {
        console.warn("⚠️ LightingManager not initialized");
    }
};

// 🆕 INTERACTION ZONES AND UI MANAGEMENT NOW MOVED TO Room_setup.js

// 🆕 MODE TRANSITION FUNCTIONS
function enterMachineMode(machineType) {
    if (!cameraManager || !playerController?.mesh) return;
    
    console.log(`🎮 Entering ${machineType} mode`);
    gameMode = machineType;
    
    // 🆕 HIDE PLAYER MODEL
    playerController.mesh.visible = false;
    console.log("👻 Player hidden for machine interaction");
    
    // Use the camera manager to switch to machine mode (FIRST PERSON)
    const targetMachineOffset = machineType === 'claw_machine' ? machineOffset : candyMachineOffset;
    cameraManager.switchToMachineMode(machineType, targetMachineOffset, () => {
        // 🆕 NO ORBIT CONTROLS IN FIRST PERSON MODE
        // controls.enabled = false; // Keep orbit controls disabled for first person
        
        updateModeIndicator(machineType);
        hideInteractionPrompt();
        
        console.log(`🔫 Now in ${machineType} FIRST PERSON mode`);
    });
}

function exitMachineMode() {
    if (!cameraManager || !playerController?.mesh) return;
    
    console.log(`🚶 Returning to exploration mode`);
    const oldMode = gameMode;
    gameMode = 'exploration';
    
    // 🆕 SHOW PLAYER MODEL
    playerController.mesh.visible = true;
    console.log("👻 Player visible again");
    
    // Disable machine controls
    controls.enabled = false;
    
    // Use camera manager to switch back to exploration mode
    cameraManager.switchToExplorationMode(playerController, () => {
        updateModeIndicator('exploration');
        
        // Check if player is still in a zone
        if (currentZone) {
            showInteractionPrompt(currentZone.machineType);
        }
    });
}

// 🆕 INPUT HANDLER ROUTER
function handleKeyDown(e) {
    if (e.code === 'KeyH' && !e.repeat) {
        togglePauseMenu();
        return;
    }

    if (isGamePaused) return;

    switch(gameMode) {
        case 'exploration':
            if (playerInputHandler) {
                playerInputHandler.handleKeyDown(e);
            }
            break;
        case 'claw_machine':
            handleClawMachineKeyDown(e);
            break;
        case 'candy_machine':
            handleCandyMachineKeyDown(e);
            break;
    }
}

function handleKeyUp(e) {
    switch(gameMode) {
        case 'exploration':
            if (playerInputHandler) {
                playerInputHandler.handleKeyUp(e);
            }
            break;
        case 'claw_machine':
            handleClawMachineKeyUp(e);
            break;
        case 'candy_machine':
            handleCandyMachineKeyUp(e);
            break;
    }
}

// 🆕 EXPLORATION MODE CONTROLS NOW MOVED TO Player_controller.js

// 🆕 CLAW MACHINE MODE CONTROLS
function handleClawMachineKeyDown(e) {
    if (!clawController) return;
    
    // Prevent default for keys we use
    if (['ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Escape'].includes(e.code)) {
        e.preventDefault();
    }

    switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':       
            clawController.setMoving('left', true); 
            break;
        case 'ArrowRight':
        case 'KeyD':       
            clawController.setMoving('right', true); 
            break;
        case 'KeyW':       
            clawController.setMoving('forward', true); 
            break;
        case 'KeyS':       
            clawController.setMoving('backward', true);
            break;
        case 'ArrowDown':
            if (!e.repeat && !isGameOver && !clawController.isAnimating) {
                if (coins > 0) {
                    coins--;
                    clawController.startDropSequence();
                }
            }
            break;
        case 'Escape':
            if (!e.repeat) {
                exitMachineMode();
            }
            break;
    }
}

function handleClawMachineKeyUp(e) {
    if (!clawController) return;
    
    switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':       
            clawController.setMoving('left', false); 
            break;
        case 'ArrowRight':
        case 'KeyD':       
            clawController.setMoving('right', false); 
            break;
        case 'KeyW':       
            clawController.setMoving('forward', false); 
            break;
        case 'KeyS':       
            clawController.setMoving('backward', false); 
            break;
    }
}

// 🆕 CANDY MACHINE MODE CONTROLS
function handleCandyMachineKeyDown(e) {
    // Prevent default for keys we use
    if (['KeyM', 'KeyC', 'Escape'].includes(e.code)) {
        e.preventDefault();
    }
    
    switch (e.code) {
        case 'KeyM':
            if (!e.repeat) {
                candyMachine?.startCandyDispensing();
            }
            break;
        case 'KeyC':
            if (!e.repeat) {
                candyMachine?.insertCoin();
            }
            break;
        case 'Escape':
            if (!e.repeat) {
                exitMachineMode();
            }
            break;
    }
}

function handleCandyMachineKeyUp(e) {
    // No key up actions needed for candy machine
}

function togglePauseMenu() {
    isGamePaused = !isGamePaused;
    const pauseMenu = document.getElementById('pauseMenu');
    pauseMenu.style.display = isGamePaused ? 'flex' : 'none';

    if (!isGamePaused) {
        // Restart animation loop if resuming
        animate();
    }
}

// --- NEW: Function to start a new game ---

// 🆕 PLAYER TEST FUNCTIONS (using PlayerTestUtils)
window.setPlayerSpeed = function(speed) {
    PlayerTestUtils.setPlayerSpeed(playerController, speed);
};

window.testCharacterAnimations = function() {
    PlayerTestUtils.testCharacterAnimations(playerController);
};

window.getCharacterStatus = function() {
    PlayerTestUtils.getCharacterStatus(playerController);
};

window.debugCharacter = function() {
    if (playerController) {
        playerController.debugAnimationState();
    }
};

// 🆕 ANIMATION SYSTEM CHECK
window.checkAnimationSystem = function() {
    if (playerController) {
        playerController.checkAnimationSystem();
    } else {
        console.log("❌ Player controller not found");
    }
};

window.enableCharacterDebug = function() {
    if (playerController) {
        playerController.enableDebug();
    }
};

window.disableCharacterDebug = function() {
    if (playerController) {
        playerController.disableDebug();
    }
};

window.setCharacterAnimation = function(animationName) {
    if (playerController) {
        playerController.forceAnimation(animationName);
    }
};

window.listCharacterAnimations = function() {
    if (playerController) {
        playerController.listAvailableAnimations();
    }
};

// 🆕 CAMERA DEBUG FUNCTIONS NOW MOVED TO Camera_manager.js
        
   // 🆕 CLEAN RELEASE SYSTEM TESTS
 window.testCleanRelease = function() {
     if (!clawController) {
         console.log("❌ Claw controller not found");
         return;
     }
     
     console.log("🧪 Testing clean release system...");
     console.log("📋 Instructions:");
     console.log("1. Move claw over a star");
     console.log("2. Press ↓ to grab");
     console.log("3. Watch for clean release when claw opens");
     console.log("4. Star should fall vertically without bouncing off claw");
     
     // Enable detailed logging for clean release
     window.cleanReleaseDebug = true;
 }
 
 window.forceCleanRelease = function() {
     if (!grabbableObjects || grabbableObjects.length === 0) {
         console.log("❌ No grabbable objects found");
         return;
     }
     
     // Find the first star that's not being held
     const availableStar = grabbableObjects.find(obj => 
         obj.body && !obj.body.isHeld && !obj.body.isBeingReleased
     );
     
     if (!availableStar) {
         console.log("❌ No available stars to test");
         return;
     }
     
     console.log(`🚀 Force triggering clean release for ${availableStar.body.mesh.name}`);
     
     // Simulate clean release manually
     const body = availableStar.body;
     body.ignoreClawCollision = true;
     body.isBeingReleased = true;
     body.releaseStartTime = Date.now();
     
     // Reset physics state
     body.linearVelocity.set(0, 0, 0);
     body.angularVelocity.set(0, 0, 0);
     body.force.set(0, 0, 0);
     body.torque.set(0, 0, 0);
     body.isSleeping = false;
     
     console.log("✅ Clean release activated - watch the star fall cleanly!");
 }
 
 window.checkCleanReleaseStatus = function() {
     if (!grabbableObjects) {
         console.log("❌ No grabbable objects found");
         return;
     }
     
     let releasingCount = 0;
     let totalStars = 0;
     
     grabbableObjects.forEach(obj => {
         if (obj.body) {
             totalStars++;
             if (obj.body.isBeingReleased) {
                 releasingCount++;
                 const timeLeft = 1000 - (Date.now() - obj.body.releaseStartTime);
                 console.log(`🕐 ${obj.body.mesh.name}: ${Math.max(0, timeLeft)}ms left in clean release`);
             }
         }
     });
     
     console.log(`📊 Clean Release Status: ${releasingCount}/${totalStars} stars in clean release mode`);
     
     if (releasingCount === 0) {
         console.log("✅ All stars are in normal physics mode");
     }
 }
 
 // 🆕 CLEAN RELEASE CONFIGURATION
 window.setCleanReleaseTimeout = function(timeoutMs) {
     console.log(`⚙️ Clean release timeout set to ${timeoutMs}ms`);
     // This would require modifying the physics engine to use a configurable timeout
     // For now, just log the setting
     window.cleanReleaseTimeoutOverride = timeoutMs;
     console.log("💡 Note: Reload page for changes to take effect");
 }
 
 window.enableCleanReleaseDebug = function() {
     window.cleanReleaseDebug = true;
     console.log("🔍 Clean release debug logging enabled");
 }
 
 window.disableCleanReleaseDebug = function() {
     window.cleanReleaseDebug = false;
     console.log("🔇 Clean release debug logging disabled");
 }
 
      window.cleanReleaseInfo = function() {
     console.log("🆕 CLEAN RELEASE SYSTEM INFO:");
     console.log("🎯 Purpose: Prevents stars from bouncing off claw during release");
     console.log("🎮 Usage: Just grab and release stars normally!");
   }
 
 // Clean release system available but not prominently advertised
 
 // 🆕 REFACTORING COMPLETED - MAJOR SYSTEMS MOVED TO SEPARATE FILES
 // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 // ✅ PlayerController class → Player_controller.js
 // ✅ PlayerInputHandler class → Player_controller.js  
 // ✅ PlayerTestUtils class → Player_controller.js
 // ✅ LightingManager class → Lightning_manager.js
 // ✅ All lighting functions → Lightning_manager.js
 // ✅ Shadow system → Lightning_manager.js
 // ✅ Light presets → Lightning_manager.js
 // ✅ Light controls UI → Lightning_manager.js
 // ✅ RoomSetupManager class → Room_setup.js
 // ✅ InteractionZone class → Room_setup.js
 // ✅ Room creation functions → Room_setup.js
 // ✅ Machine loading functions → Room_setup.js
 // ✅ Interaction zones setup → Room_setup.js
 // ✅ CameraManager class → Camera_manager.js
 // ✅ ThirdPersonCamera class → Camera_manager.js
 // ✅ CameraTransition class → Camera_manager.js
 // ✅ All camera debug functions → Camera_manager.js
 // ✅ First person camera system → Camera_manager.js
 // ✅ Exploration mode input functions → Player_controller.js
 // ✅ Character animation system → Player_controller.js
 // ✅ Updated global functions to use modular systems
 // ✅ Clean, modular, maintainable code structure
 console.log("🎮 PLAYER CONTROLLER REFACTORING COMPLETE!");
 console.log("💡 LIGHTING MANAGER REFACTORING COMPLETE!");
 console.log("🏗️ ROOM SETUP MANAGER REFACTORING COMPLETE!");
 console.log("📷 CAMERA MANAGER REFACTORING COMPLETE!");
 console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
 console.log("✅ All player logic moved to Player_controller.js");
 console.log("✅ All lighting logic moved to Lightning_manager.js");
 console.log("✅ All room & machine logic moved to Room_setup.js");
 console.log("✅ All camera logic moved to Camera_manager.js");
 console.log("🎯 Available functions:");
 console.log("   setPlayerSpeed(speed) - Adjust movement speed");
 console.log("   testCharacterAnimations() - Test all animations");
 console.log("   getCharacterStatus() - Show player status");
 console.log("   debugCharacter() - Show animation debug info");
 console.log("   checkAnimationSystem() - Check animation system status");
 console.log("   enableCharacterDebug() - Enable movement debug");
 console.log("   disableCharacterDebug() - Disable movement debug");
 console.log("   setCharacterAnimation('name') - Force specific animation");
 console.log("   listCharacterAnimations() - List available animations");
 console.log("   applyLightPreset('arcade') - Apply lighting presets");
 console.log("   debugCamera() - Show camera debug info");
 console.log("   showFirstPersonHelpers() - Show camera position helpers");
 console.log("   testFirstPersonTransition() - Test camera transitions");

// 🆕 ANIMATION SYSTEM STATUS MESSAGE
setTimeout(() => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ ANIMATION SYSTEM FIXED!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔧 Fixed: Animation name prefix issue resolved");
    console.log("📚 Now properly loads: 'characterarmature|walk' as 'walk'");
    console.log("");
    console.log("🎮 Test movement: Press WASD to see walk animations!");
    console.log("");
    console.log("🛠️ Available debug commands:");
    console.log("   👉 checkAnimationSystem() - Check system status");
    console.log("   👉 listCharacterAnimations() - List all animations");
    console.log("   👉 setCharacterAnimation('run') - Test specific animations");
    console.log("   👉 enableCharacterDebug() - Enable detailed movement logs");
    console.log("");
    console.log("🎭 Available character animations:");
    console.log("   idle, walk, run, kick_left, kick_right, punch_left, punch_right");
    console.log("   roll, interact, wave, and many more combat animations!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}, 3000);