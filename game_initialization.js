// game_initialization.js - Game initialization and setup
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PhysicsEngine } from './physics_engine.js';
import { MeshBVH } from 'https://unpkg.com/three-mesh-bvh@0.7.0/build/index.module.js';
import { CameraManager } from './Camera_manager.js';
import { PlayerController } from './Player_controller.js';
import { LightingManager } from './Lightning_manager.js';
import { RoomSetupManager } from './Room_setup.js';
import { HomepageManager } from './Homepage.js';
import { MainHomepage } from './MainHomepage.js';
import { AudioManager } from './AudioManager.js';
import { PopcornManager } from './popcorn.js';
import { initializeExtras } from './extras.js';

// Global variables that will be initialized
let scene, camera, renderer, controls;
let physicsEngine, audioManager, lightingManager, roomSetupManager;
let playerController, cameraManager, homepageManager, mainHomepage;
let machineOffset, candyMachineOffset, interactionZones;
let interactionPrompt, lightReferences;
let popcornManager;

// Dependencies that need to be passed in
let dependencies = {};

export function initializeGame(gameDependencies) {
    // Store dependencies
    dependencies = gameDependencies;
    
    // Core Three.js setup
    setupThreeJS();
    
    // Audio system setup
    setupAudioSystem();
    
    // Core game systems
    setupCoreGameSystems();
    
    // Room and machine setup
    setupRoomAndMachines();
    
    // Start the loading process
    loadGameAssets();
    
    // Setup window resize handler
    window.addEventListener('resize', dependencies.onWindowResize);
    
    // Note: Animation loop will be started by main.js after all systems are initialized
    
    // Return initialized systems for main.js to access
    return {
        scene,
        camera,
        renderer,
        controls,
        physicsEngine,
        audioManager,
        lightingManager,
        roomSetupManager,
        playerController,
        cameraManager,
        homepageManager,
        popcornManager,
        machineOffset,
        candyMachineOffset,
        interactionZones,
        interactionPrompt,
        lightReferences
    };
}

function setupThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e); // Dark color for arcade room
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 100);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    document.body.appendChild(renderer.domElement);
    
    // Setup orbit controls (disabled by default)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = false; // Will be enabled only in machine modes
}

function setupAudioSystem() {
    audioManager = new AudioManager();
    audioManager.initialize(camera);
    
    // Load prize win sounds
    audioManager.loadSound('prizeWin', 'sounds/win sounds/success-1-6297.mp3');
    audioManager.loadSound('prizeWin', 'sounds/win sounds/goodresult-82807.mp3');
    audioManager.loadSound('prizeWin', 'sounds/win sounds/winner-bell-game-show-91932.mp3');
    
    // Load background music (loop = true)
    audioManager.loadSound('arcade', 'sounds/background music/bgm-arcade.mp3', 0.2, true);
    audioManager.loadSound('neon', 'sounds/background music/bgm-neon.mp3', 0.2, true);
    audioManager.loadSound('warm', 'sounds/background music/bgm-warm.mp3', 0.2, true);
    audioManager.loadSound('cool', 'sounds/background music/bgm-cool.mp3', 0.8, true);
    audioManager.loadSound('dark', 'sounds/background music/bgm-dark.mp3', 0.2, true);
    
    // Load character-specific sounds
    audioManager.loadSound('Businessman_wave', 'sounds/character/businessman_hello.mp3', 0.8);
    audioManager.loadSound('Hoodie_wave', 'sounds/character/hoodie_hey.mp3', 0.8);
    audioManager.loadSound('Worker_wave', 'sounds/character/worker_hey.mp3', 0.8);
}

function setupCoreGameSystems() {
    // Initialize physics engine first
    physicsEngine = new PhysicsEngine();
    
    // Setup camera system first
    cameraManager = new CameraManager(camera);
    cameraManager.initialize(scene);
    
    // Initialize room setup manager
    roomSetupManager = new RoomSetupManager();
    roomSetupManager.initialize(scene, physicsEngine, cameraManager);
    
    // Setup player system (but don't load character yet)
    playerController = new PlayerController(scene, physicsEngine, roomSetupManager, audioManager);
    
    // Setup homepage manager
    homepageManager = new HomepageManager(playerController, cameraManager, dependencies.initializeGameCallback, audioManager);
    
    // Setup main homepage
    mainHomepage = new MainHomepage(() => {
        // When user clicks "Enter Arcade", show character selection
        homepageManager.showCharacterSelection();
    });
    
    // Get machine positions from room manager
    machineOffset = roomSetupManager.getMachineOffset();
    candyMachineOffset = roomSetupManager.getCandyMachineOffset();
    
    // Setup interaction zones
    interactionZones = roomSetupManager.setupInteractionZones(dependencies.onZoneEnter, dependencies.onZoneExit);
    
    // Setup UI elements
    interactionPrompt = document.getElementById('interactionPrompt');
}

function setupRoomAndMachines() {
    // Initialize lighting manager
    lightingManager = new LightingManager();
    lightingManager.initialize(scene, machineOffset, candyMachineOffset);
    lightingManager.setupShadows(renderer);
    lightingManager.setupLighting();
    lightingManager.setupLightControls();
    
    // Initialize extras system
    initializeExtras({
        scene: scene,
        lightingManager: lightingManager,
        physicsEngine: physicsEngine
    });
    
    // Set global reference for compatibility
    lightReferences = lightingManager.getLightReferences();
    
    // Create game room and setup materials
    roomSetupManager.createGameRoom();
    
    // Link room materials to lighting manager
    const roomMaterials = roomSetupManager.getRoomMaterials();
    lightingManager.setRoomMaterials(roomMaterials);
    
    // Link painting lights to lighting manager
    const paintingLights = roomSetupManager.getPaintingSpotlights();
    lightingManager.addPaintingLights(paintingLights);
}

function loadGameAssets() {
    // Load all machines asynchronously
    roomSetupManager.loadAllMachines().then((results) => {
        dependencies.setupCompatibilityReferences();
        
        // Set candy machine callback (will be properly set later in main.js with physicsEngine)
        // if (dependencies.candyMachine) {
        //     dependencies.candyMachine.onCandyEjected = dependencies.startCandyDisappearanceAnimation;
        // }
        
        // Load popcorn machine
        loadPopcornMachine();
        
        // Setup physics and objects
        dependencies.setupPhysicsAndObjects();
        dependencies.positionClaw();
        dependencies.tryInitializeClawController();
        
        // Hide loading screen
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        // Show homepage first
        mainHomepage.show();
        
    }).catch((error) => {
        console.error('Error loading game assets:', error);
    });
}


function loadPopcornMachine() {
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
                // Exclude specific mesh from collision
                const excludedMeshes = ['Cylinder056_07_-_Default_0'];
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
            
            // Modify only height (Y)
            const newSize = originalSize.multiplyScalar(0.9).clone();
            newSize.y *= 0.5; // Set height to 50% of original
            originalCenter.y += 0.37;
            const smallerGeometry = new THREE.BoxGeometry(newSize.x, newSize.y, newSize.z);

            // Create invisible container for physics bounds only
            const invisibleMaterial = new THREE.MeshBasicMaterial({ visible: false });
            const smallerContainerHelper = new THREE.Mesh(smallerGeometry, invisibleMaterial);

            smallerContainerHelper.position.copy(originalCenter);
            smallerContainerHelper.quaternion.copy(popcornContainerMesh.quaternion);
            
            scene.add(smallerContainerHelper);
            finalContainer = smallerContainerHelper;
        }

        if (popcornSpawnPoint) {
            console.log('Creating PopcornManager with spawn point:', popcornSpawnPoint.name);
            popcornManager = new PopcornManager({
                scene: scene,
                spawnMesh: popcornSpawnPoint,
                containerMesh: finalContainer,
                count: 300,
                gravity: 2.5, // VERY fast falling inside machine
                burstSize: 20, // Slightly more particles per burst
                burstInterval: 300 // More frequent bursts (every 0.3 seconds)
            });
            console.log('PopcornManager created successfully:', popcornManager);
            
            // Update the main.js global reference to popcornManager
            if (window.updatePopcornManager) {
                window.updatePopcornManager(popcornManager);
            }
        } else {
            console.warn('No popcorn spawn point found - popcorn machine will not work');
        }

    }, undefined, (error) => {
        console.error('Error loading popcorn machine:', error);
    });
}

// Export getters for initialized systems
export function getInitializedSystems() {
    return {
        scene,
        camera,
        renderer,
        controls,
        physicsEngine,
        audioManager,
        lightingManager,
        roomSetupManager,
        playerController,
        cameraManager,
        homepageManager,
        mainHomepage,
        popcornManager,
        machineOffset,
        candyMachineOffset,
        interactionZones,
        interactionPrompt,
        lightReferences
    };
}