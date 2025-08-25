// extras.js - Light show, popcorn mode, and special effects functionality
import * as THREE from 'three';
import { PopcornManager } from './popcorn.js';

// Global variables that will be set by main.js
let scene, lightingManager, physicsEngine, ceilingPopcornManager;
let lightShowActive = false, lightShowTimer = 0, originalLightColors = {};
let discoMode = false, discoTimer = 0, discoOriginalColors = {};
let popcornMode = false;

// Initialize function to receive dependencies from main.js
export function initializeExtras(dependencies) {
    scene = dependencies.scene;
    lightingManager = dependencies.lightingManager;
    physicsEngine = dependencies.physicsEngine;
}

// Export getters for state variables
export function getExtrasState() {
    return {
        lightShowActive,
        discoMode,
        popcornMode
    };
}

// 🍿 POPCORN MODE TOGGLE FUNCTION
export function togglePopcornMode(updateModeIndicator) {
    popcornMode = !popcornMode;
    if (popcornMode) {
        updateModeIndicator('popcorn');
        startCeilingPopcorn();
    } else {
        updateModeIndicator('exploration');
        stopCeilingPopcorn();
    }
}

//CEILING POPCORN FUNCTIONS
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

// Update function for popcorn manager
export function updateCeilingPopcorn(deltaTime) {
    if (popcornMode && ceilingPopcornManager) {
        ceilingPopcornManager.update(deltaTime);
    }
}

// LIGHT SHOW FUNCTIONS
export function startLightShow() {
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

export function updateLightShow(deltaTime) {
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
export function toggleDiscoMode(updateModeIndicator) {
    discoMode = !discoMode;
    if (discoMode) {
        updateModeIndicator('disco');
        startDiscoLights();
    } else {
        updateModeIndicator('exploration');
        stopDiscoLights();
    }
}

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

export function updateDiscoLights(deltaTime) {
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

// Make toggle functions available globally
window.togglePopcornMode = () => togglePopcornMode(window.updateModeIndicator);
window.toggleDiscoMode = () => toggleDiscoMode(window.updateModeIndicator);