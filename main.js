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

// 🍿 POPCORN MODE VARIABLES
let popcornMode = false;
let ceilingPopcornManager = null;

// ✨ LIGHT SHOW VARIABLES
let lightShowActive = false;
let lightShowTimer = 0;
let originalLightColors = {};

// 🎉 DISCO LIGHT MODE VARIABLES
let discoMode = false;
let discoTimer = 0;
let discoOriginalColors = {};

// 🆕 CLAW CAMERA MODE TRACKING
let clawCameraMode = 'normal'; // 'normal', 'top_down'
let normalCameraPosition = null;
let normalCameraTarget = null;

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
let joystickMesh, buttonMesh, joystickPivot;
let triggerVolume, finalPrizeHelper;
let interactionZones = [];
let machineOffset, candyMachineOffset;

let coins = 5;
let isGameOver = false;

let popcornManager;
let popcornSpawnPoint;

// --- Make newGame function available globally ---
window.newGame = newGame;

// --- Debug functions for claw controller ---
window.debugClaw = function() {
    if (clawController) {
        console.log('Claw Debug State:', clawController.getDebugState());
    } else {
        console.log('ClawController not initialized');
    }
};

window.resetClaw = function() {
    if (clawController) {
        clawController.resetClawState();
        console.log('Claw state reset');
    } else {
        console.log('ClawController not initialized');
    }
};

// Debug function to manually test trigger detection
window.debugTriggers = function() {
    console.log('=== TRIGGER DEBUG ===');
    if (triggerVolume) {
        console.log('TriggerVolume position:', triggerVolume.position);
        const triggerBox = new THREE.Box3().setFromObject(triggerVolume);
        console.log('TriggerVolume bounds:', triggerBox.min, triggerBox.max);
    }
    if (finalPrizeHelper) {
        console.log('FinalPrizeHelper position:', finalPrizeHelper.position);
        const helperBox = new THREE.Box3().setFromObject(finalPrizeHelper);
        console.log('FinalPrizeHelper bounds:', helperBox.min, helperBox.max);
    }
    if (grabbableObjects) {
        console.log('Number of grabbable objects:', grabbableObjects.length);
        grabbableObjects.forEach((obj, i) => {
            console.log(`Star ${i}:`, obj.body.mesh.position, `canFallThrough: ${obj.body.canFallThrough}`);
        });
    }
};

// 🆕 WALL AND CEILING COLOR FUNCTIONS
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

// 🆕 FLOOR COLOR FUNCTIONS
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

// Test function for wall and floor colors
window.testWallColors = function() {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    let index = 0;
    
    const interval = setInterval(() => {
        window.updateWallColor(colors[index]);
        index++;
        if (index >= colors.length) {
            clearInterval(interval);
            setTimeout(() => window.resetWallColor(), 1000);
        }
    }, 1000);
};

window.testFloorColors = function() {
    const colors = ['#8B4513', '#654321', '#228B22', '#4B0082', '#800080', '#006400'];
    let index = 0;
    
    const interval = setInterval(() => {
        window.updateFloorColor(colors[index]);
        index++;
        if (index >= colors.length) {
            clearInterval(interval);
            setTimeout(() => window.resetFloorColor(), 1000);
        }
    }, 1000);
};

window.testAllColors = function() {
    console.log('Testing wall colors...');
    window.testWallColors();
    setTimeout(() => {
        console.log('Testing floor colors...');
        window.testFloorColors();
    }, 7000);
};

// 🍿 POPCORN MODE TOGGLE FUNCTION
window.togglePopcornMode = function() {
    popcornMode = !popcornMode;
    if (popcornMode) {
        updateModeIndicator('popcorn');
        startCeilingPopcorn();
    } else {
        updateModeIndicator('exploration');
        stopCeilingPopcorn();
    }
};

// 🍿 CEILING POPCORN FUNCTIONS
function startCeilingPopcorn() {
    if (!scene) return;
    
    // Create a ceiling spawn area across the whole room
    const ceilingHeight = 5.0; // Height above the room
    const roomBounds = {
        minX: -20, maxX: 20,
        minZ: -10, maxZ: 10
    };
    
    // Create virtual ceiling spawn mesh
    const ceilingGeometry = new THREE.PlaneGeometry(
        roomBounds.maxX - roomBounds.minX, 
        roomBounds.maxZ - roomBounds.minZ
    );
    const ceilingMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const ceilingSpawnMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceilingSpawnMesh.position.set(0, ceilingHeight, 0);
    ceilingSpawnMesh.rotation.x = -Math.PI / 2; // Face down
    scene.add(ceilingSpawnMesh);
    
    // Get all static colliders for popcorn collision
    const staticColliders = physicsEngine.staticColliders || [];
    
    // Create ceiling popcorn manager
    ceilingPopcornManager = new PopcornManager({
        scene: scene,
        spawnMesh: ceilingSpawnMesh,
        containerMesh: null, // No container - they fall to the floor
        count: 5000, // Much more popcorn for intense rain effect
        gravity: 0.5, // Much stronger gravity for faster falling
        baseScale: 0.08, // Slightly smaller for more realistic look
        colliders: staticColliders, // Pass all static colliders for collision
        burstSize: 10, // Much larger bursts for heavy rain
        burstInterval: 200 // Much more frequent bursts (every 0.2 seconds)
    });
    
}

function stopCeilingPopcorn() {
    if (ceilingPopcornManager) {
        // Clean up all popcorn particles
        ceilingPopcornManager.particles.forEach(particle => {
            scene.remove(particle.mesh);
        });
        ceilingPopcornManager = null;
    }
}

// ✨ LIGHT SHOW FUNCTIONS
function startLightShow() {
    if (!lightingManager || lightShowActive) return;
    
    lightShowActive = true;
    lightShowTimer = 0;
    
    // Store original light colors
    const lightRefs = lightingManager.getLightReferences();
    if (lightRefs) {
        originalLightColors = {
            ambientLight: lightRefs.ambientLight ? lightRefs.ambientLight.color.clone() : null,
            clawLight: lightRefs.clawLight ? lightRefs.clawLight.color.clone() : null,
            candyLight: lightRefs.candyLight ? lightRefs.candyLight.color.clone() : null,
            sideLight: lightRefs.sideLight ? lightRefs.sideLight.color.clone() : null,
            centerLight: lightRefs.centerLight ? lightRefs.centerLight.color.clone() : null
        };
    }
    
}

function updateLightShow(deltaTime) {
    if (!lightShowActive || !lightingManager) return;
    
    lightShowTimer += deltaTime;
    const flashSpeed = 8; // Flashes per second
    const showDuration = 3.0; // 3 seconds total
    
    // Calculate flash intensity using sine wave
    const flashIntensity = Math.abs(Math.sin(lightShowTimer * flashSpeed * Math.PI));
    const yellowIntensity = 0.5 + flashIntensity * 1.5; // Flash between 0.5 and 2.0 (much brighter!)
    
    // Much brighter yellow colors for the light show
    const brightYellow = new THREE.Color(2, 2, 0); // Super bright yellow (over 1.0 values)
    const dimYellow = new THREE.Color(yellowIntensity, yellowIntensity, 0);
    
    // Apply much brighter yellow flashing to all lights
    const lightRefs = lightingManager.getLightReferences();
    if (lightRefs) {
        if (lightRefs.ambientLight) lightRefs.ambientLight.color.copy(dimYellow);
        if (lightRefs.clawLight) lightRefs.clawLight.color.copy(brightYellow);
        if (lightRefs.candyLight) lightRefs.candyLight.color.copy(brightYellow);
        if (lightRefs.sideLight) lightRefs.sideLight.color.copy(brightYellow);
        if (lightRefs.centerLight) lightRefs.centerLight.color.copy(brightYellow);
    }
    
    // End light show after duration
    if (lightShowTimer >= showDuration) {
        stopLightShow();
    }
}

function stopLightShow() {
    if (!lightShowActive || !lightingManager) return;
    
    lightShowActive = false;
    lightShowTimer = 0;
    
    // Restore original light colors
    const lightRefs = lightingManager.getLightReferences();
    if (lightRefs && originalLightColors) {
        if (lightRefs.ambientLight && originalLightColors.ambientLight) {
            lightRefs.ambientLight.color.copy(originalLightColors.ambientLight);
        }
        if (lightRefs.clawLight && originalLightColors.clawLight) {
            lightRefs.clawLight.color.copy(originalLightColors.clawLight);
        }
        if (lightRefs.candyLight && originalLightColors.candyLight) {
            lightRefs.candyLight.color.copy(originalLightColors.candyLight);
        }
        if (lightRefs.sideLight && originalLightColors.sideLight) {
            lightRefs.sideLight.color.copy(originalLightColors.sideLight);
        }
        if (lightRefs.centerLight && originalLightColors.centerLight) {
            lightRefs.centerLight.color.copy(originalLightColors.centerLight);
        }
    }
    
}

// 🎉 DISCO LIGHT MODE FUNCTIONS
window.toggleDiscoMode = function() {
    discoMode = !discoMode;
    if (discoMode) {
        updateModeIndicator('disco');
        startDiscoLights();
    } else {
        updateModeIndicator('exploration');
        stopDiscoLights();
    }
};

function startDiscoLights() {
    if (!lightingManager || discoMode === false) return;
    
    discoTimer = 0;
    
    // Store original light colors
    const lightRefs = lightingManager.getLightReferences();
    if (lightRefs) {
        discoOriginalColors = {
            ambientLight: lightRefs.ambientLight ? lightRefs.ambientLight.color.clone() : null,
            clawLight: lightRefs.clawLight ? lightRefs.clawLight.color.clone() : null,
            candyLight: lightRefs.candyLight ? lightRefs.candyLight.color.clone() : null,
            sideLight: lightRefs.sideLight ? lightRefs.sideLight.color.clone() : null,
            centerLight: lightRefs.centerLight ? lightRefs.centerLight.color.clone() : null
        };
    }
    
}

function updateDiscoLights(deltaTime) {
    if (!discoMode || !lightingManager) return;
    
    discoTimer += deltaTime;
    
    // Different speed patterns for each light
    const speed1 = 4; // Fast flashing
    const speed2 = 3; // Medium flashing  
    const speed3 = 2; // Slow flashing
    const speed4 = 5; // Very fast flashing
    
    // Generate different colors using different sine wave frequencies
    const red = Math.abs(Math.sin(discoTimer * speed1));
    const green = Math.abs(Math.sin(discoTimer * speed2 + 2));
    const blue = Math.abs(Math.sin(discoTimer * speed3 + 4));
    const purple = Math.abs(Math.sin(discoTimer * speed4 + 1));
    
    // Create vibrant disco colors (boosted intensity)
    const discoColor1 = new THREE.Color(red * 2, 0, blue * 2); // Red-Blue
    const discoColor2 = new THREE.Color(0, green * 2, purple * 2); // Green-Purple
    const discoColor3 = new THREE.Color(red * 2, green * 2, 0); // Red-Green
    const discoColor4 = new THREE.Color(purple * 2, 0, green * 2); // Purple-Green
    const discoColor5 = new THREE.Color(blue * 2, red * 2, purple * 2); // Blue-Red-Purple
    
    // Apply different colors to different lights for variety
    const lightRefs = lightingManager.getLightReferences();
    if (lightRefs) {
        if (lightRefs.ambientLight) lightRefs.ambientLight.color.copy(discoColor5);
        if (lightRefs.clawLight) lightRefs.clawLight.color.copy(discoColor1);
        if (lightRefs.candyLight) lightRefs.candyLight.color.copy(discoColor2);
        if (lightRefs.sideLight) lightRefs.sideLight.color.copy(discoColor3);
        if (lightRefs.centerLight) lightRefs.centerLight.color.copy(discoColor4);
    }
}

function stopDiscoLights() {
    if (!lightingManager) return;
    
    discoMode = false;
    discoTimer = 0;
    
    // Restore original light colors
    const lightRefs = lightingManager.getLightReferences();
    if (lightRefs && discoOriginalColors) {
        if (lightRefs.ambientLight && discoOriginalColors.ambientLight) {
            lightRefs.ambientLight.color.copy(discoOriginalColors.ambientLight);
        }
        if (lightRefs.clawLight && discoOriginalColors.clawLight) {
            lightRefs.clawLight.color.copy(discoOriginalColors.clawLight);
        }
        if (lightRefs.candyLight && discoOriginalColors.candyLight) {
            lightRefs.candyLight.color.copy(discoOriginalColors.candyLight);
        }
        if (lightRefs.sideLight && discoOriginalColors.sideLight) {
            lightRefs.sideLight.color.copy(discoOriginalColors.sideLight);
        }
        if (lightRefs.centerLight && discoOriginalColors.centerLight) {
            lightRefs.centerLight.color.copy(discoOriginalColors.centerLight);
        }
    }
    
}


// ... (keep existing init() function)

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
    
    // 🆕 Riproduci il suono di vittoria tramite AudioManager
    audioManager.playSound('prizeWin');

    // ✨ TRIGGER YELLOW LIGHT SHOW FOR STAR COLLECTION!
    startLightShow();

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
    
    // Only log when there are active objects to check
    let activeObjects = grabbableObjects.filter(obj => obj.body && !obj.body.canFallThrough);
    
    if (activeObjects.length > 0) {
        console.log('checkChuteTrigger: checking', activeObjects.length, 'active objects');
        console.log('triggerBox bounds:', triggerBox.min, triggerBox.max);
    }

    let foundCollisions = 0;
    grabbableObjects.forEach((objData, index) => {
        const body = objData.body;

        // Controlla solo gli oggetti che non sono già stati autorizzati a cadere
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
                console.log(`🟢 TRIGGER HIT: Star ${index} hit triggerVolume!`, starPos);
                body.canFallThrough = true; // ...imposta il flag per farla cadere.
                foundCollisions++;
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
        
        // 🆕 LINK CANDY MACHINE TO CLAW CONTROLLER
        if (candyMachine && clawController) {
            candyMachine.setClawController(clawController);
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
loader.load('glbmodels/popcorn_machine.glb', (gltf) => {
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
            // 🍿 EXCLUDE SPECIFIC MESH FROM COLLISION
            const excludedMeshes = ['Cylinder056_07_-_Default_0']; // Mesh to ignore for collision
            const shouldAddCollision = !excludedMeshes.includes(child.name);
            
            child.geometry.computeVertexNormals();
            child.geometry.boundsTree = new MeshBVH(child.geometry);
            
            if (shouldAddCollision) {
                physicsEngine.addStaticCollider(child);
            }

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

        // Create invisible container for physics bounds only
        const invisibleMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const smallerContainerHelper = new THREE.Mesh(smallerGeometry, invisibleMaterial);

        smallerContainerHelper.position.copy(originalCenter);
        smallerContainerHelper.quaternion.copy(popcornContainerMesh.quaternion);
        
        scene.add(smallerContainerHelper);
        finalContainer = smallerContainerHelper;


    } else {
    }

    if (popcornSpawnPoint) {
        popcornManager = new PopcornManager({
            scene: scene,
            spawnMesh: popcornSpawnPoint,
            containerMesh: finalContainer,
            count: 100
        });
    } else {
    }

}, undefined, (error) => {
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
    candyMachine = components.candyMachine;
    triggerVolume = components.triggerVolume;
    finalPrizeHelper = components.finalPrizeHelper;
    
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
}

function onZoneExit(zone) {
    currentZone = null;
    roomSetupManager.setCurrentZone(null);
    hideInteractionPrompt();
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

// 🆕 ROOM SETUP AND MACHINE LOADING NOW MOVED TO Room_setup.js

// 🆕 ROOM CREATION AND MACHINE LOADING NOW MOVED TO Room_setup.js

function setupPhysicsAndObjects() {
    if (!clawTopBox || !physicsEngine) return;
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
    
    physicsEngine.setWorldBounds(expandedMin, expandedMax);
    
    // Load multiple objects
    const objectsToLoad = [
        { file: 'glbmodels/star_prize.glb', name: 'Star', scale: 0.16, targetMeshName: 'star' },
        //file: 'perfect_football__soccer_ball.glb', name: 'Ball', scale: 0.003, targetMeshName: null }
    ];
    
    let loadedCount = 0;
    const loader = new GLTFLoader();
    /* carica il modello star_prize.glb UNA volta */

loader.load('glbmodels/star_prize.glb', (gltf) => {

/* 0. trova la mesh "star" */
let starMesh;
gltf.scene.traverse(node => {
    if (node.isMesh && node.name.toLowerCase().includes('star')) starMesh = node;
});
if (!starMesh) { return; }

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
      
      // ✨ UPDATE LIGHT SHOW (victory yellow flashing)
      if (lightShowActive) {
          updateLightShow(deltaTime);
      }
      
      // 🎉 UPDATE DISCO LIGHTS (party mode)
      if (discoMode) {
          updateDiscoLights(deltaTime);
      }

      if (popcornManager) {
          popcornManager.update(deltaTime);
      }
      
      // 🍿 UPDATE CEILING POPCORN WHEN IN POPCORN MODE
      if (popcornMode && ceilingPopcornManager) {
          ceilingPopcornManager.update(deltaTime);
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
              
              // 🆕 UPDATE TOP-DOWN CAMERA TO FOLLOW CLAW
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
              
              // Check game over for claw machine
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
    }
};

// 🆕 INTERACTION ZONES AND UI MANAGEMENT NOW MOVED TO Room_setup.js

// 🆕 MODE TRANSITION FUNCTIONS
function enterMachineMode(machineType) {
    if (!cameraManager || !playerController?.mesh) return;
    
    gameMode = machineType;
    
    // 🆕 HIDE PLAYER MODEL
    playerController.mesh.visible = false;
    
    // Use the camera manager to switch to machine mode (FIRST PERSON)
    const targetMachineOffset = machineType === 'claw_machine' ? machineOffset : candyMachineOffset;
    cameraManager.switchToMachineMode(machineType, targetMachineOffset, () => {
        // 🆕 NO ORBIT CONTROLS IN FIRST PERSON MODE
        // controls.enabled = false; // Keep orbit controls disabled for first person
        
        updateModeIndicator(machineType);
        hideInteractionPrompt();
    });
}

function exitMachineMode() {
    if (!cameraManager || !playerController?.mesh) return;
    
    const oldMode = gameMode;
    gameMode = 'exploration';
    
    // 🆕 RESET CLAW CAMERA MODE
    clawCameraMode = 'normal';
    camera.userData.followClaw = false;
    normalCameraPosition = null;
    normalCameraTarget = null;
    
    // 🆕 SHOW PLAYER MODEL
    playerController.mesh.visible = true;
    
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

// 🆕 CLAW CAMERA MODE TOGGLE
function toggleClawCameraMode() {
    if (gameMode !== 'claw_machine' || !cameraManager || !clawGroup) return;
    
    if (clawCameraMode === 'normal') {
        // Save current camera position and target
        normalCameraPosition = camera.position.clone();
        normalCameraTarget = new THREE.Vector3();
        camera.getWorldDirection(normalCameraTarget);
        normalCameraTarget.add(camera.position);
        
        // Switch to top-down view
        switchToTopDownView();
        clawCameraMode = 'top_down';
        updateModeIndicator('claw_machine');
    } else {
        // Switch back to normal view
        switchToNormalView();
        clawCameraMode = 'normal';
        updateModeIndicator('claw_machine');
    }
}

function switchToTopDownView() {
    if (!clawGroup) return;
    
    // Get the claw's current position
    const clawPosition = clawGroup.position.clone();
    
    // Position camera above the claw
    const cameraHeight = 1.5; // Height above the claw
    const cameraPos = new THREE.Vector3(
        clawPosition.x,
        clawPosition.y + cameraHeight,
        clawPosition.z
    );
    
    // Set camera position and look down at the claw
    camera.position.copy(cameraPos);
    camera.lookAt(clawPosition);
    
    // Update camera each frame to follow the claw
    camera.userData.followClaw = true;
}

function switchToNormalView() {
    if (!normalCameraPosition || !normalCameraTarget) return;
    
    // Restore the original camera position and target
    camera.position.copy(normalCameraPosition);
    camera.lookAt(normalCameraTarget);
    
    // Stop following the claw
    camera.userData.followClaw = false;
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
    if (['ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyP', 'Escape'].includes(e.code)) {
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
        case 'KeyP':
            if (!e.repeat) {
                toggleClawCameraMode();
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



