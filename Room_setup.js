import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshBVH } from 'https://unpkg.com/three-mesh-bvh@0.7.0/build/index.module.js';
import { CandyMachine } from './candy_machine.js';

// 🆕 INTERACTION ZONE CLASS
export class InteractionZone {
    constructor(position, radius, machineType, onEnter, onExit) {
        this.position = position.clone();
        this.radius = radius;
        this.machineType = machineType; // 'claw_machine' or 'candy_machine'
        this.onEnter = onEnter;
        this.onExit = onExit;
        this.playerInside = false;
    }
    
    checkPlayer(playerPosition) {
        const distance = playerPosition.distanceTo(this.position);
        const inside = distance <= this.radius;
        
        if (inside && !this.playerInside) {
            this.playerInside = true;
            if (this.onEnter) this.onEnter(this);
        } else if (!inside && this.playerInside) {
            this.playerInside = false;
            if (this.onExit) this.onExit(this);
        }
    }
}

// 🆕 ROOM AND MACHINE SETUP MANAGER
export class RoomSetupManager {
    constructor() {
        this.scene = null;
        this.physicsEngine = null;
        this.cameraManager = null;
        
        // 🆕 Room Materials
        this.wallMaterial = null;
        this.floorMaterial = null;
        this.ceilingMaterial = null;
        this.paintingSpotlights = []; // 🆕 Per contenere le luci dei quadri
        
        // Machine positions
        this.machineOffset = new THREE.Vector3(10, 0, 0);
        this.candyMachineOffset = new THREE.Vector3(-15, 0, 0);
        
        // Interaction zones
        this.interactionZones = [];
        this.currentZone = null;
        
        // Machine components (global references for compatibility)
        this.clawGroup = null;
        this.clawLoaded = false;
        this.clawBones = {};
        this.cylinders = {};
        this.allClawCylinders = [];
        this.clawTopBox = null;
        this.chuteMesh = null;
        this.joystickMesh = null;
        this.buttonMesh = null;
        this.joystickPivot = null;
        this.candyMachine = null;
        this.triggerVolume = null;
        this.finalPrizeHelper = null;
        
        // Callbacks for machine loading completion
        this.onMachineLoadCallbacks = {
            clawMachine: [],
            claw: [],
            candyMachine: []
        };
        
    }
    
    // 🆕 INITIALIZE WITH DEPENDENCIES
    initialize(scene, physicsEngine, cameraManager) {
        this.scene = scene;
        this.physicsEngine = physicsEngine;
        this.cameraManager = cameraManager;
        
    }
    
    // 🆕 GET MACHINE POSITIONS
    getMachineOffset() {
        return this.machineOffset;
    }
    
    getCandyMachineOffset() {
        return this.candyMachineOffset;
    }
    
    // 🆕 GETTER PER LE LUCI DEI QUADRI
    getPaintingSpotlights() {
        return this.paintingSpotlights;
    }
    
    // 🆕 GET ROOM MATERIALS
    getRoomMaterials() {
        return {
            wall: this.wallMaterial,
            floor: this.floorMaterial,
            ceiling: this.ceilingMaterial
        };
    }
    
    // 🆕 CREATE GAME ROOM WITH ENHANCED MATERIALS
    createGameRoom() {
        const roomSize = { width: 40, height: 8, depth: 20 };
        
        // 🆕 ENHANCED MATERIALS FOR BETTER LIGHT REFLECTION
        this.wallMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x3a3a3a, // Lighter for better reflection
            shininess: 30,
            specular: 0x222222
        });
        
        this.floorMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x2c2c2c, // Lighter for better reflection
            shininess: 50,
            specular: 0x333333
        });
        
        this.ceilingMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x1a1a2e,
            shininess: 20
        });
        
        // FLOOR
        const floorGeometry = new THREE.PlaneGeometry(roomSize.width, roomSize.depth);
        const floor = new THREE.Mesh(floorGeometry, this.floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.1;
        floor.receiveShadow = true;
        this.scene.add(floor);
        
        // CEILING
        const ceilingGeometry = new THREE.PlaneGeometry(roomSize.width, roomSize.depth);
        const ceiling = new THREE.Mesh(ceilingGeometry, this.ceilingMaterial);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = roomSize.height;
        this.scene.add(ceiling);
        
        // BACK WALL
        const backWallGeometry = new THREE.PlaneGeometry(roomSize.width, roomSize.height);
        const backWall = new THREE.Mesh(backWallGeometry, this.wallMaterial);
        backWall.position.set(0, roomSize.height / 2, -roomSize.depth / 2);
        backWall.receiveShadow = true;
        this.scene.add(backWall);
        
        // LEFT WALL
        const leftWallGeometry = new THREE.PlaneGeometry(roomSize.depth, roomSize.height);
        const leftWall = new THREE.Mesh(leftWallGeometry, this.wallMaterial);
        leftWall.rotation.y = Math.PI / 2;
        leftWall.position.set(-roomSize.width / 2, roomSize.height / 2, 0);
        leftWall.receiveShadow = true;
        this.scene.add(leftWall);
        
        // RIGHT WALL
        const rightWallGeometry = new THREE.PlaneGeometry(roomSize.depth, roomSize.height);
        const rightWall = new THREE.Mesh(rightWallGeometry, this.wallMaterial);
        rightWall.rotation.y = -Math.PI / 2;
        rightWall.position.set(roomSize.width / 2, roomSize.height / 2, 0);
        rightWall.receiveShadow = true;
        this.scene.add(rightWall);
        
        // FRONT WALL (fixed orientation)
        const frontWallGeometry = new THREE.PlaneGeometry(roomSize.width, roomSize.height);
        const frontWall = new THREE.Mesh(frontWallGeometry, this.wallMaterial);
        frontWall.rotation.y = Math.PI; // Rotate 180 degrees to face inward
        frontWall.position.set(0, roomSize.height / 2, roomSize.depth / 2);
        frontWall.receiveShadow = true;
        this.scene.add(frontWall);
        
        // ADD DECORATIVE ELEMENTS
        this.createDecorativePanels(roomSize);
        this.createWallPaintings(roomSize);
        
    }
    
    // 🆕 CREATE DECORATIVE PANELS
    createDecorativePanels(roomSize) {
        const panelMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x16a085,
            emissive: 0x0a4f44,
            emissiveIntensity: 0.2
        });
        
        // Panels on back wall
        for (let i = 0; i < 3; i++) {
            const panelGeometry = new THREE.PlaneGeometry(2, 1);
            const panel = new THREE.Mesh(panelGeometry, panelMaterial);
            panel.position.set(
                -6 + i * 6, 
                3, 
                -roomSize.depth / 2 + 0.01
            );
            this.scene.add(panel);
        }
        
        // Side panels
        const sidePanelGeometry = new THREE.PlaneGeometry(1.5, 0.8);
        
        // Left side
        const leftPanel = new THREE.Mesh(sidePanelGeometry, panelMaterial);
        leftPanel.rotation.y = Math.PI / 2;
        leftPanel.position.set(-roomSize.width / 2 + 0.01, 3, -3);
        this.scene.add(leftPanel);
        
        // Right side
        const rightPanel = new THREE.Mesh(sidePanelGeometry, panelMaterial);
        rightPanel.rotation.y = -Math.PI / 2;
        rightPanel.position.set(roomSize.width / 2 - 0.01, 3, -3);
        this.scene.add(rightPanel);
    }
    
    // 🆕 CREATE WALL PAINTINGS FROM GLB MODELS
    createWallPaintings(roomSize) {
        const loader = new GLTFLoader();
        
        // Definisci qui i tuoi quadri: file, posizione, rotazione e scala
        const paintings = [
            { 
                file: 'paintings/painting1.glb', 
                position: new THREE.Vector3(-roomSize.width / 2 + 0.1, 4, -5), 
                rotationY: -Math.PI/2, 
                scale: 5 
            },
            { 
                file: 'paintings/painting2.glb', 
                position: new THREE.Vector3(roomSize.width / 2 - 0.1, 4.5, 5), 
                rotationY: Math.PI / 2, 
                scale: 5.0
            },
            { 
                file: 'paintings/painting3.glb', 
                position: new THREE.Vector3(0, 4, -roomSize.depth / 2 + 0.1), 
                rotationY: Math.PI, 
                scale: 5.0
            },
        ];

        paintings.forEach(p => {
            loader.load(p.file, (gltf) => {
                const model = gltf.scene;

                // Applica trasformazioni
                model.position.copy(p.position);
                model.rotation.y = p.rotationY;
                model.scale.setScalar(p.scale);

                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                this.scene.add(model);

                // --- 🆕 Aggiungi uno spotlight per il quadro ---
                const spotlight = new THREE.SpotLight(0xffffff, 2.5, 15, Math.PI / 6, 0.4);
                
                // Posiziona la luce sopra il quadro e un po' in avanti
                const lightPosition = p.position.clone();
                lightPosition.y += 2.5;
                
                // Calcola la normale della parete per spostare la luce in avanti
                const wallNormal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rotationY + Math.PI);
                lightPosition.add(wallNormal.multiplyScalar(0.5));

                spotlight.position.copy(lightPosition);
                spotlight.target = model; // La luce punta al modello del quadro
                spotlight.castShadow = true;

                this.scene.add(spotlight);
                this.scene.add(spotlight.target);

                // Salva lo spotlight per la gestione centralizzata
                this.paintingSpotlights.push(spotlight);

            }, undefined, (error) => {
            });
        });

    }
    
    // 🆕 LOAD CLAW MACHINE
    loadMachine() {
        const loader = new GLTFLoader();
        
        return new Promise((resolve, reject) => {
            loader.load('glbmodels/claw_no_obj.glb', 
                (gltf) => {
                    const model = gltf.scene;
                    model.position.copy(this.machineOffset);
                    
                    // Enable shadows for the machine
                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });
                    
                    this.scene.add(model);
                    
                    let foundMachineBox = false;
                    let localChuteMesh = null;

                    model.traverse(child => {
                        if (child.isMesh && child.name === 'polySurface24_lambert11_0') {
                            foundMachineBox = true;
                            child.updateWorldMatrix(true, false);
                            this.clawTopBox = new THREE.Box3().setFromObject(child);
                        }

                        if (child.isMesh && child.name === 'Joystick') {
                            this.joystickMesh = child;
                            
                            // Set first person camera reference for claw machine
                            if (this.cameraManager) {
                                this.cameraManager.setFirstPersonReference(
                                    'claw_machine', 
                                    child, 
                                    this.machineOffset,
                                    3.0
                                );
                            }
                        }
                        
                        if (child.isMesh && child.name === 'Button') {
                            this.buttonMesh = child;
                        }
                        
                        if (child.isMesh && child.name === 'polySurface42_blinn4_0') {
                            localChuteMesh = child;
                            this.setupChuteHelpers(child, model);
                        }
                    });

                    // Setup joystick pivot
                    this.setupJoystickPivot();
                    
                    if (!foundMachineBox) {
                        reject(new Error('Machine box not found'));
                        return;
                    }

                    
                    this.chuteMesh = localChuteMesh;
                    if (this.chuteMesh) {
                        this.physicsEngine.addStaticCollider(this.chuteMesh);
                    }
                    
                    // Trigger callbacks
                    this.onMachineLoadCallbacks.clawMachine.forEach(callback => callback());
                    
                    resolve({
                        model,
                        clawTopBox: this.clawTopBox,
                        chuteMesh: this.chuteMesh,
                        joystickMesh: this.joystickMesh,
                        buttonMesh: this.buttonMesh,
                        joystickPivot: this.joystickPivot
                    });
                }, 
                undefined, 
                (error) => {
                    reject(error);
                }
            );
        });
    }
    
    // 🆕 SETUP CHUTE HELPERS
    setupChuteHelpers(chuteChild, model) {
        const chuteBox = new THREE.Box3().setFromObject(chuteChild);
        const size = new THREE.Vector3();
        chuteBox.getSize(size);
        const center = new THREE.Vector3();
        chuteBox.getCenter(center);


        // Create physics collider for chute
        const physicsChuteGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        physicsChuteGeometry.computeBoundingBox();

        const physicsChuteMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const physicsChuteMesh = new THREE.Mesh(physicsChuteGeometry, physicsChuteMaterial);
        physicsChuteMesh.position.copy(center);

        // Update world matrix before building BVH
        physicsChuteMesh.updateMatrixWorld(true);
        physicsChuteGeometry.boundsTree = new MeshBVH(physicsChuteGeometry);

        model.add(physicsChuteMesh);
        this.physicsEngine.addStaticCollider(physicsChuteMesh);

        // Create trigger volume for chute detection
        const triggerGeometry = new THREE.BoxGeometry(size.x * 1.2, size.y * 0.5, size.z * 1.2);
        const triggerMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00, 
            transparent: true, 
            opacity: 0.3,
            visible: true 
        });
        this.triggerVolume = new THREE.Mesh(triggerGeometry, triggerMaterial);
        this.triggerVolume.position.copy(center);
        this.triggerVolume.position.y = center.y; // Position at chute center, not above it
        model.add(this.triggerVolume);

        // Create final prize helper for prize collection detection
        const finalPrizeGeometry = new THREE.BoxGeometry(size.x * 0.8, size.y * 0.4, size.z * 0.8);
        const finalPrizeMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            transparent: true, 
            opacity: 0.3,
            visible: true 
        });
        this.finalPrizeHelper = new THREE.Mesh(finalPrizeGeometry, finalPrizeMaterial);
        this.finalPrizeHelper.position.copy(center);
        this.finalPrizeHelper.position.y = center.y - size.y * 1.2; // Lowered even more to catch stars after they fall through
        model.add(this.finalPrizeHelper);

    }
    
    // 🆕 SETUP JOYSTICK PIVOT
    setupJoystickPivot() {
        if (!this.joystickMesh) return;
        

        // Calculate joystick base position in global coordinates
        this.joystickMesh.geometry.computeBoundingBox();
        const bbox = this.joystickMesh.geometry.boundingBox;
        const localBasePosition = new THREE.Vector3(
            (bbox.min.x + bbox.max.x) / 2,
            bbox.min.y,
            (bbox.min.z + bbox.max.z) / 2
        );
        const worldBasePosition = this.joystickMesh.localToWorld(localBasePosition.clone());

        // Create pivot and position it at the base
        this.joystickPivot = new THREE.Group();
        this.joystickPivot.position.copy(worldBasePosition);
        
        // Add pivot to scene (not to joystick parent)
        this.scene.add(this.joystickPivot);
        
        // Attach joystick to pivot
        this.joystickPivot.attach(this.joystickMesh);

    }
    
    // 🆕 LOAD CLAW
    loadClaw() {
        const loader = new GLTFLoader();
        
        return new Promise((resolve, reject) => {
            loader.load('glbmodels/claw_collider.glb', 
                (gltf) => {
                    this.clawGroup = gltf.scene;
                    this.clawGroup.scale.setScalar(1.2);

                    // Enable shadows for claw
                    this.clawGroup.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    const fingerCylinderMap = {'Cylinder':'A', 'Cylinder003':'B', 'Cylinder008':'C'};

                    this.clawGroup.traverse(obj => {
                        if (/^Claw_([ABC])_0_DEF$/.test(obj.name)) {
                            const letter = obj.name.charAt(5);
                            this.clawBones[letter] = obj;
                        }
                        
                        // Check if the object is any cylinder
                        if (obj.isMesh && obj.name.startsWith('Cylinder')) {
                            this.allClawCylinders.push(obj);

                            // Check if it's one of the specific finger cylinders
                            if (fingerCylinderMap[obj.name]) {
                                const letter = fingerCylinderMap[obj.name];
                                this.cylinders[letter] = obj;
                            }

                            // Ensure bounding box is computed before creating BVH
                            obj.geometry.computeBoundingBox();
                            try {
                                obj.geometry.boundsTree = new MeshBVH(obj.geometry);
                            } catch (error) {
                            }
                        }
                    });
                    
                    this.clawLoaded = true;
                    
                    this.scene.add(this.clawGroup);
                    
                    // Trigger callbacks
                    this.onMachineLoadCallbacks.claw.forEach(callback => callback());
                    
                    resolve({
                        clawGroup: this.clawGroup,
                        clawBones: this.clawBones,
                        cylinders: this.cylinders,
                        allClawCylinders: this.allClawCylinders
                    });
                }, 
                undefined, 
                (error) => {
                    reject(error);
                }
            );
        });
    }
    
    // 🆕 LOAD CANDY MACHINE
    loadCandyMachine() {
        const loader = new GLTFLoader();
        
        return new Promise((resolve, reject) => {
            loader.load('glbmodels/candy_machine_con_gate5.glb', 
                (gltf) => { 
                    const model = gltf.scene;
                    model.scale.setScalar(0.5);
                    model.position.copy(this.candyMachineOffset);
                    
                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });
                    
                    this.scene.add(model);

                    let candyContainerMesh = null;
                    let releaseDoorMesh = null;

                    model.traverse(child => {
                        if (child.isMesh) {
                            // 🍬 ADD COLLISION TO ALL CANDY MACHINE MESHES (except specific exclusions)
                            const excludedMeshes = ['Object_2']; // Container mesh - keep this traversable
                            if (!excludedMeshes.includes(child.name)) {
                                child.geometry.computeVertexNormals();
                                child.geometry.computeBoundingBox();
                                child.geometry.boundsTree = new MeshBVH(child.geometry);
                                this.physicsEngine.addStaticCollider(child);
                            }

                            if (child.name === 'Object_2') {
                                candyContainerMesh = child;
                                
                                // Set first person camera reference for candy machine
                                if (this.cameraManager) {
                                    this.cameraManager.setFirstPersonReference(
                                        'candy_machine', 
                                        child, 
                                        this.candyMachineOffset,
                                        3.0
                                    );
                                }
                            }

                            if (child.name === 'Object_3') {
                                releaseDoorMesh = child;
                            }
                        }
                    });

                    this.candyMachine = new CandyMachine(model, this.physicsEngine, this.scene);
                    
                    if (releaseDoorMesh) {
                        this.candyMachine.setReleaseDoor(releaseDoorMesh);
                    }

                    const candyGeometry = new THREE.SphereGeometry(0.12, 16, 16);
                    candyGeometry.computeVertexNormals();
                    candyGeometry.computeBoundingBox();
                    candyGeometry.boundsTree = new MeshBVH(candyGeometry);

                    if (candyContainerMesh) {
                        this.candyMachine.populate(candyContainerMesh, 20, candyGeometry, this.scene);
                    } else {
                    }
                    
                    // Trigger callbacks
                    this.onMachineLoadCallbacks.candyMachine.forEach(callback => callback());
                    
                    resolve({
                        model,
                        candyMachine: this.candyMachine,
                        candyContainerMesh,
                        releaseDoorMesh
                    });
                },
                undefined,
                (error) => {
                    reject(error);
                }
            );
        });
    }
    
    // 🆕 SETUP INTERACTION ZONES
    setupInteractionZones(onZoneEnter, onZoneExit) {
        // Claw Machine Zone
        const clawZone = new InteractionZone(
            this.machineOffset,
            2.5,
            'claw_machine',
            onZoneEnter,
            onZoneExit
        );
        
        // Candy Machine Zone
        const candyZone = new InteractionZone(
            this.candyMachineOffset,
            2.5,
            'candy_machine',
            onZoneEnter,
            onZoneExit
        );
        
        this.interactionZones = [clawZone, candyZone];
        
        return this.interactionZones;
    }
    
    
    // 🆕 CHECK INTERACTION ZONES
    checkInteractionZones(playerController) {
        if (!playerController || !this.interactionZones) return;
        
        const playerPos = playerController.getPosition();
        this.interactionZones.forEach(zone => {
            zone.checkPlayer(playerPos);
        });
    }
    
    // 🆕 LOAD ALL MACHINES SEQUENTIALLY
    async loadAllMachines() {
        try {
            
            // Load machines in parallel for better performance
            const machinePromises = [
                this.loadMachine(),
                this.loadClaw(),
                this.loadCandyMachine()
            ];
            
            const results = await Promise.all(machinePromises);
            
            return {
                clawMachine: results[0],
                claw: results[1],
                candyMachine: results[2]
            };
        } catch (error) {
            throw error;
        }
    }
    
    // 🆕 ADD CALLBACK FOR MACHINE LOADING
    onMachineLoad(machineType, callback) {
        if (this.onMachineLoadCallbacks[machineType]) {
            this.onMachineLoadCallbacks[machineType].push(callback);
        }
    }
    
    // 🆕 GET MACHINE COMPONENTS (for compatibility)
    getClawMachineComponents() {
        return {
            clawGroup: this.clawGroup,
            clawTopBox: this.clawTopBox,
            chuteMesh: this.chuteMesh,
            clawBones: this.clawBones,
            cylinders: this.cylinders,
            allClawCylinders: this.allClawCylinders,
            joystickMesh: this.joystickMesh,
            buttonMesh: this.buttonMesh,
            joystickPivot: this.joystickPivot,
            candyMachine: this.candyMachine,
            clawLoaded: this.clawLoaded,
            triggerVolume: this.triggerVolume,
            finalPrizeHelper: this.finalPrizeHelper
        };
    }
    
    // 🆕 GET INTERACTION ZONES
    getInteractionZones() {
        return this.interactionZones;
    }
    
    // 🆕 GET/SET CURRENT ZONE
    getCurrentZone() {
        return this.currentZone;
    }
    
    setCurrentZone(zone) {
        this.currentZone = zone;
    }
} 