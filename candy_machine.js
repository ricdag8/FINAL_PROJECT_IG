// candy_machine.js


/* 

⏺ Complete Overview of Candy Machine File

  The candy_machine.js file implements a complex, interactive candy dispensing system with realistic mechanical animations. Here's a comprehensive breakdown:

  Class Structure & Properties

  CandyMachine class manages a complete candy vending machine with:
  - Coin insertion system with visual coin flying animation
  - Multi-stage dispensing mechanism with gate lowering, candy selection, and door opening
  - Physics integration for realistic candy behavior and collision detection
  - Complex animation state machine managing sequential mechanical operations

  Key Properties:

  - Animation State: isAnimating, isDispensing, dispensingStage
  - Coin System: hasCoinInserted, coinMesh, coinFlyProgress
  - Mechanical Parts: knob, gate, releaseDoor, gateSidePlanes
  - Physics Bodies: candiesInMachine[], physicsEngine
  - Animation Targets: Multiple 3D vectors for precise positioning

  Core Functions Breakdown

  1. Initialization & Setup Functions

  constructor(model, physicsEngine, scene)
  Initializes candy machine with 3D model, physics integration, and scene reference. Sets up all mechanical components, animation properties, and coin system. Calls helper functions to
  find machine parts and create coin mesh.

  _findParts()
  Traverses the 3D model hierarchy to locate essential mechanical components by name. Finds knob (Object_6), gate, side planes (Plane2-4), and calculates their positions. Sets up knob
  geometry centering and initial rotations for proper animation.

  _createCoin()
  Creates a golden cylindrical coin mesh with metallic material and emissive properties. Initially hidden, positioned ready for coin insertion animations. Uses realistic proportions and
  shiny gold appearance.

  _calculateDispenseCenter(gateMeshes)
  Calculates the optimal center point of the gate area for candy targeting. Creates bounding box from all gate-related meshes and determines world coordinates where candies should be
  directed during dispensing.

  2. Machine Setup & Configuration

  setReleaseDoor(mesh)
  Configures the release door mechanism with pivot-based rotation system. Creates door pivot point at hinge location, calculates descent targets, and defines candy exit path coordinates
  (intermediate and final positions).

  setClawController(controller)
  Links candy machine to claw controller for star-to-coin conversion system. Enables spending collected stars as coins for candy purchases, creating economic game loop.

  populate(containerMesh, count, candyGeometry, scene)
  Spawns specified number of colorful candy objects within container bounds. Uses safety zones around dispenser, assigns random colors from predefined palette, creates physics bodies,
  and establishes candy-specific collision boundaries.

  3. Core Interaction Functions

  insertCoin()
  Handles coin insertion process when player has available stars. Converts star to coin, initiates coin flying animation from world position to knob location, makes coin visible, and
  sets up animation progress tracking.

  startCandyDispensing()
  Triggers the complete candy dispensing sequence when coin is inserted. Initiates both mechanical dispensing animation and knob rotation, selects random candy, and begins multi-stage
  animation state machine.

  4. Animation State Machine Functions

  _updateDispensingAnimation(deltaTime)
  Master animation controller managing 8 sequential dispensing stages:

  - lowering_gate: Animates gate and side planes downward to create dispensing opening
  - moving_candy: Moves selected candy horizontally to gate center with kinematic physics
  - descending: Lowers candy vertically to door level with collision physics
  - opening_door: Rotates release door upward using pivot system
  - ejecting_candy: Complex two-part animation with parabolic trajectory for realistic candy exit
  - closing_door: Returns door to closed position
  - raising_gate: Restores gate and planes to original positions
  - waiting_for_knob: Synchronization stage waiting for knob animation completion

  _completeDispensingSequence()
  Resets all animation states, removes dispensed candy from machine inventory, restores knob rotation, clears coin insertion flag, and removes coin mesh from scene.

  5. Update & Management Functions

  update(deltaTime)
  Main update loop managing three parallel systems:

  1. Coin Animation: Handles coin flying trajectory with parabolic arc, attachment to knob, position/rotation adjustments, and timed disappearance
  2. Dispensing Animation: Processes current dispensing stage with state machine progression
  3. Knob Animation: Manages 360-degree knob rotation with precise timing, completion detection, and sequence synchronization

  Key Technical Features

  Advanced Animation System

  - State-driven animations with precise timing and sequencing
  - Kinematic physics integration for realistic candy movement and collision
  - Pivot-based rotations for mechanical door opening
  - Parabolic trajectories for natural candy ejection paths

  Physics Integration

  - Dynamic candy physics with individual collision bodies
  - Kinematic dispensing allowing pushed candies to affect others
  - Safety zones preventing candy spawn conflicts
  - Boundary enforcement keeping candies within machine container

  Visual Polish

  - Synchronized mechanical animations (gate + side planes moving together)
  - Realistic material properties (metallic coins, colorful candies)
  - Complex motion paths with intermediate waypoints
  - Timed visual effects (coin disappearance, door operations)

  Game Integration

  - Economic system linking star collection to candy purchases
  - Callback system for candy ejection events triggering external animations
  - Inventory management tracking candies remaining in machine
  - State persistence maintaining machine status between interactions

  This candy machine implementation provides a highly realistic and engaging mechanical experience with sophisticated animations, physics interactions, and game system integration,
  creating an authentic vending machine simulation within the arcade environment

*/








import * as THREE from 'three';
import { RigidBody } from './physics_engine.js';
import { Vec3 } from './physics_engine_vec3.js';

export class CandyMachine {
    constructor(model, physicsEngine, scene) {
        this.model = model;
        this.physicsEngine = physicsEngine;
        this.scene = scene;
        this.knob = null;
        this.isAnimating = false;
        this.rotationProgress = 0;
        this.rotationDuration = 2;
        this.candiesInMachine = [];

        // Define properties before they are used
        this.candyWorldTargetPos = new THREE.Vector3(); // The destination for the candy
        this.targetSphere = null; // The green helper sphere

        // --- PROPERTIES FOR DISPENSING MECHANISM ---
        this.gate = null; // Reference to the Gate mesh
        this.gateSidePlanes = []; // Per animare Plane2, Plane3, Plane4
        this.gateSidePlanesOriginalPositions = [];
        this.gateSidePlanesTargetPositions = [];
        this.gateOriginalPosition = null; // Store original gate position
        this.isDispensing = false; // Track if dispensing is in progress
        this.dispensingCandy = null; // The candy being dispensed
        this.onCandyEjected = null; // AGGIUNTO: Callback per quando la caramella è espulsa
        this.gateTargetPosition = null; // Target position for gate lowering
        this.gateAnimationProgress = 0;
        this.dispensingStage = 'idle'; // 'lowering_gate', 'moving_candy', 'descending', 'opening_door', 'ejecting_candy', 'closing_door', 'raising_gate', 'idle'
        this.candyMoveProgress = 0;
        this.candyStartPos = new THREE.Vector3();
        this.releaseDoor = null;
        this.releaseDoorPivot = null; // A pivot group for correct rotation
        this.doorAnimationProgress = 0;
        this.candyDescentTargetPos = new THREE.Vector3(); // New target for the descent phase
        this.candyIntermediateExitPos = new THREE.Vector3(); // Punto intermedio per l'espulsione
        this.candyFinalExitPos = new THREE.Vector3();       // Punto di uscita finale
        this.releaseMechanismPosition = new THREE.Vector3(); // To store Object_6's position

        // --- NEW PROPERTIES FOR COIN LOGIC ---
        this.clawController = null; // reference to the claw controller
        this.hasCoinInserted = false; // state to check if a coin is ready to be used
        this.coinMesh = null; // the visual mesh for the coin

        this._findParts();
        this._createCoin(); // create the coin mesh at startup
        this.coinFlyProgress = 0;
this.coinStartPos = new THREE.Vector3();
this.coinTargetPos = new THREE.Vector3();
this.coinIsFlying = false;
        this.coinHasReachedKnob = false;
        this.coinDisappearTimer = 0;
        this.knobAnimationComplete = false; // track if knob has completed 360° rotation
        this.knobInitialRotationY = 0; // for a precise knob rotation
    }

    setReleaseDoor(mesh) {
        this.releaseDoor = mesh;
        
        //create a pivot for the door to rotate around its hinge
        // calculate the pivot point in the door's local coordinates.
        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox;
        const pivotPointLocal = new THREE.Vector3(
            (bbox.min.x + bbox.max.x) / 2,
            (bbox.min.y + bbox.max.y) / 2,
            bbox.max.z 
        );

        // create the pivot Group and position it where the hinge should be in the world.
        this.releaseDoorPivot = new THREE.Group();
        mesh.localToWorld(pivotPointLocal); // this updates pivotPointLocal to world coords
        this.releaseDoorPivot.position.copy(pivotPointLocal);
        this.scene.add(this.releaseDoorPivot);

        // attach the door to the pivot, this makes the door a child of the pivot
        // while maintaining its current world position.
        this.releaseDoorPivot.attach(this.releaseDoor);

        // calculate descent target and create its helper here 
        this.candyDescentTargetPos.copy(this.candyWorldTargetPos); // keep X/Z from the upper target point
        this.candyDescentTargetPos.y = this.releaseDoorPivot.position.y - 0.9; // use the correct Y from the door pivot and lower it slightly so that it basically corresponds to the exit point



        // define the intermediate and final exit positions 
        const pivotPos = this.releaseDoorPivot.position;

        //the intermediate point (yellow helper) is slightly below the pivot and further back
        this.candyIntermediateExitPos.set(
            pivotPos.x,
            pivotPos.y - 0.5,
            pivotPos.z + 1.0  
        );

        // the final exit position (blue helper) is higher than the intermediate, the blue one is the finish line basically when then the animation is executed
        this.candyFinalExitPos.set(
            pivotPos.x,
            this.candyIntermediateExitPos.y + 2.0, // positioned higher than the intermediate
            pivotPos.z + 0.5
        );



    }

    /*
      creates the coin mesh and keeps it hidden, ready for use.
     */
    _createCoin() {
        const coinGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.008, 16);
        const coinMaterial = new THREE.MeshStandardMaterial({
            color: 0xffd700, // Gold color
            metalness: 0.8,
            roughness: 0.4
        });
        this.coinMesh = new THREE.Mesh(coinGeometry, coinMaterial);
        this.coinMesh.material = new THREE.MeshStandardMaterial({
    color: 0xffff00, emissive: 0xffaa00, emissiveIntensity: 0.8, metalness: 0.7, roughness: 0.3
});

        this.coinMesh.visible = false; // Initially hidden
    }

    //we bind the claw controller
    setClawController(controller) {
        this.clawController = controller;
    }

insertCoin() {
    if (this.hasCoinInserted || this.isAnimating) {
        return;
    }
    if (!this.clawController) {
        return;
    }

    if (this.clawController.spendStarAsCoin()) {
        this.hasCoinInserted = true;

        if (this.knob && this.coinMesh) {
           

            
            const worldStartPos = new THREE.Vector3(2, 2, 5);

            //we basically compute the world position of the knob to use it as target
            const localTargetPos = new THREE.Vector3(-0.1, 0.5, -0.8);
            this.knob.updateWorldMatrix(true, false);
            const worldTargetPos = this.knob.localToWorld(localTargetPos.clone());

            // we then convert both global positions to LOCAL coordinates relative to the coin's parent (this.model) so that we can animate the coin in local space
            this.model.updateWorldMatrix(true, false);
            this.coinStartPos.copy(this.model.worldToLocal(worldStartPos));
            this.coinTargetPos.copy(this.model.worldToLocal(worldTargetPos));
            

            this.model.add(this.coinMesh);
            this.coinMesh.position.copy(this.coinStartPos); 
            this.coinMesh.rotation.set(Math.PI / 2, 0, 0);
            this.coinMesh.visible = true;

            this.coinFlyProgress = 0;
            this.coinIsFlying = true;
            this.coinHasReachedKnob = false;
            this.coinDisappearTimer = 0;
        }
    }
}
    _findParts() {
        const gateMeshes = []; // collect all gate-related meshes, the ones needed in order to lower the gates
        const allMeshNames = []; // debug: collect all mesh names, to remove!!!
        
        
        this.model.traverse(child => {
            if (child.isMesh) {
                allMeshNames.push(child.name);
            }
            if (child.isMesh && child.name === 'Object_6') {
    this.knob = child;

    const positions = this.knob.geometry.attributes.position.array;
    const centroid = new THREE.Vector3();
    for (let i = 0; i < positions.length; i += 3) {
        centroid.x += positions[i];
        centroid.y += positions[i + 1];
        centroid.z += positions[i + 2];
    }
    centroid.divideScalar(positions.length / 3);

    this.knob.geometry.translate(-centroid.x, -centroid.y, -centroid.z);
    const transformedOffset = centroid.clone().applyQuaternion(this.knob.quaternion).multiply(this.knob.scale);
    this.knob.position.add(transformedOffset);

    this.knob.rotation.y += Math.PI; //we rotate the knob by 180 degrees, so it faces the correct direction
}

            // find the Gate mesh for dispensing
            if (child.isMesh && child.name === 'Gate') {
                this.gate = child;
                this.gateOriginalPosition = child.position.clone();
                // calculate gate lowering position (move down by 0.5 units)
                this.gateTargetPosition = child.position.clone();
                this.gateTargetPosition.y -= 0.5;
            }


            if (child.isMesh && ['Plane2', 'Plane3', 'Plane4'].includes(child.name)) {
                this.gateSidePlanes.push(child);
                const originalPos = child.position.clone();
                this.gateSidePlanesOriginalPositions.push(originalPos);
                
                const targetPos = originalPos.clone();
                targetPos.y -= 0.5; 
                this.gateSidePlanesTargetPositions.push(targetPos);
            }


            if (child.isMesh && ['Gate', 'Plane2', 'Plane3', 'Plane4'].includes(child.name)) {
                gateMeshes.push(child);
}

        });

        //calculate the center of the gate area for candy targeting
        if (gateMeshes.length > 0) {
            this._calculateDispenseCenter(gateMeshes);
        }
    }

    /**
     * calculate the center of the gate area for candy targeting
     */
    _calculateDispenseCenter(gateMeshes) {
        
        const bounds = new THREE.Box3();
        gateMeshes.forEach((mesh) => {
            mesh.updateWorldMatrix(true, false);
            const meshBounds = new THREE.Box3().setFromObject(mesh);
            bounds.union(meshBounds);
        });
        
        //get the center in world coordinates and store it.
        bounds.getCenter(this.candyWorldTargetPos);
        
    }

    populate(containerMesh, count, candyGeometry, scene) {
        if (!containerMesh) {
            return;
        }

        const candyColors = [
            new THREE.Color(0xff4757), // Red
            new THREE.Color(0x2ed573), // Green
            new THREE.Color(0x1e90ff), // Blue
            new THREE.Color(0xf1c40f), // Yellow
            new THREE.Color(0x9b59b6), // Purple
            new THREE.Color(0xe67e22)  // Orange
        ];
    
        //get candy radius for spacing
        const candyRadius = candyGeometry.parameters.radius;

        //get the world bounding box of the container to define the spawn area
        this.scene.updateMatrixWorld(true);
        containerMesh.updateWorldMatrix(true, false);
        const containerWorldBox = new THREE.Box3().setFromObject(containerMesh);
        

        const marginXZ = candyRadius * 3;
        const marginY = candyRadius * 1.0; 

        containerWorldBox.min.x += marginXZ;
        containerWorldBox.max.x -= marginXZ;
        containerWorldBox.min.z += marginXZ;
        containerWorldBox.max.z -= marginXZ;

        containerWorldBox.min.y += marginY-0.1;
        containerWorldBox.max.y -= marginY-0.1;
        
        //SAFETY ZONE AROUND DISPENSER!!!!!!!!!!
        const safetyRadius = 0.7; //candies won't spawn within this radius of the target point
        const safetyRadiusSq = safetyRadius * safetyRadius; //use squared distance

        //we add the dispenser zone to the engine
        this.physicsEngine.setDispenserSafetyZone(this.candyWorldTargetPos, safetyRadius);


        for (let i = 0; i < count; i++) {
            let worldX, worldY, worldZ;
            let positionIsValid = false;
            let attempts = 0;
            const maxAttempts = 100; //prevent infinite loops
            const spawnPoint = new THREE.Vector3();

            //keep trying until a valid position is found
            while (!positionIsValid && attempts < maxAttempts) {
                //generate random world position within the container
                worldX = THREE.MathUtils.lerp(containerWorldBox.min.x, containerWorldBox.max.x, Math.random());
                worldY = THREE.MathUtils.lerp(containerWorldBox.min.y, containerWorldBox.max.y, Math.random());
                worldZ = THREE.MathUtils.lerp(containerWorldBox.min.z, containerWorldBox.max.z, Math.random());
                spawnPoint.set(worldX, worldY, worldZ);

                //check distance to the dispenser area (ignoring Y-axis for a cylindrical check)
                const distanceSq = (spawnPoint.x - this.candyWorldTargetPos.x) ** 2 + (spawnPoint.z - this.candyWorldTargetPos.z) ** 2;

                if (distanceSq > safetyRadiusSq) {
                    positionIsValid = true;
                    //if the position is valid, we can exit the loop and thus spawn the candy
                }
                attempts++;
            }
            
            const candyMaterial = new THREE.MeshStandardMaterial({
                color: candyColors[Math.floor(Math.random() * candyColors.length)],
                roughness: 0.3,
                metalness: 0.1
            });

            // Create candy mesh
            const mesh = new THREE.Mesh(candyGeometry, candyMaterial);
            mesh.name = `Candy_${i}`;
            
            // Add directly to scene
            scene.add(mesh);

            // Create physics body
            const body = new RigidBody(mesh, 0.5);
            body.isCandy = true; // Mark for bounds checking in the physics engine
            
            // Set position directly on the physics body (world coordinates)
            body.position.set(worldX, worldY, worldZ);
            
            // Sync the visual mesh's position with the physics body's position
            body.mesh.position.copy(body.position);
            
            // Add to physics engine and our internal list
            this.physicsEngine.addBody(body);
            this.candiesInMachine.push(body);
        }

        
        // Define the physics boundaries for the candies using the container's box
        const candyBoundsMin = new Vec3(containerWorldBox.min.x, containerWorldBox.min.y, containerWorldBox.min.z);
        const candyBoundsMax = new Vec3(containerWorldBox.max.x, containerWorldBox.max.y, containerWorldBox.max.z);
        this.physicsEngine.setCandyBounds(candyBoundsMin, candyBoundsMax);
        
    }


    /**
     * Start the candy dispensing sequence
     */
    startCandyDispensing() {
        if (!this.hasCoinInserted) {
            return;
        }
        
        if (this.isDispensing || this.isAnimating) {
            return;
        }
        
        if (this.candiesInMachine.length === 0) {
            return;
        }
        
        
        // START BOTH dispensing AND knob animation
        this.isDispensing = true;
        this.dispensingStage = 'lowering_gate';
        this.gateAnimationProgress = 0;
        
        // START KNOB ANIMATION
        this.isAnimating = true;
        this.rotationProgress = 0;
        this.knobAnimationComplete = false;
        if (this.knob) {
            this.knobInitialRotationY = this.knob.rotation.y;
        }
    }

    _updateDispensingAnimation(deltaTime) {
        const animationSpeed = 2.0; // Animation speed multiplier

        switch (this.dispensingStage) {
            case 'lowering_gate':
                this.gateAnimationProgress += deltaTime * animationSpeed;
                const t_lower = Math.min(this.gateAnimationProgress, 1);
                
                if (this.gate) {
                    this.gate.position.lerpVectors(this.gateOriginalPosition, this.gateTargetPosition, t_lower);
                }

                // Anima anche i plane laterali insieme al gate
                this.gateSidePlanes.forEach((plane, index) => {
                    plane.position.lerpVectors(
                        this.gateSidePlanesOriginalPositions[index],
                        this.gateSidePlanesTargetPositions[index],
                        t_lower
                    );
                });
                    
                if (t_lower >= 1) {
                    // Gate is down, now select and move the candy
                    const randomIndex = Math.floor(Math.random() * this.candiesInMachine.length);
                    this.dispensingCandy = this.candiesInMachine[randomIndex];
                    this.candyStartPos.copy(this.dispensingCandy.position);
                    
                    this.dispensingCandy.isBeingDispensed = true;
                    this.dispensingCandy.isSleeping = false; // Wake it up
                    this.dispensingCandy.inverseMass = 0; // AGGIUNTO: Rendilo cinematico per spingere le altre caramelle

                    this.dispensingStage = 'moving_candy';
                    this.candyMoveProgress = 0;
                }
                break;

            case 'moving_candy':
                if (this.dispensingCandy) {
                    this.candyMoveProgress += deltaTime * animationSpeed;
                    const t = Math.min(this.candyMoveProgress, 1);
                    
                    // --- AGGIUNTO: Calcola la velocità per la spinta fisica ---
                    const oldPos = this.dispensingCandy.position.clone();

                    const newPos = new THREE.Vector3().lerpVectors(
                        this.candyStartPos,
                        this.candyWorldTargetPos,
                        t
                    );
                    
                    this.dispensingCandy.position.copy(newPos);
                    this.dispensingCandy.mesh.position.copy(newPos);

                    // Imposta la velocità lineare per permettere al corpo cinematico di spingere gli altri
                    if (deltaTime > 0) {
                        const velocity = newPos.clone().sub(oldPos).divideScalar(deltaTime);
                        this.dispensingCandy.linearVelocity.copy(velocity);
                    }
                    
                    if (t >= 1) {
                        // Candy has arrived at the pre-descent point. Now, start descending.
                        this.dispensingCandy.linearVelocity.set(0, 0, 0); // Ferma la spinta
                        this.dispensingStage = 'descending';
                        this.candyMoveProgress = 0;
                        this.candyStartPos.copy(this.dispensingCandy.position); // Update start pos for next stage
                    }
                }
                break;
            
            case 'descending':
                if (this.dispensingCandy) {
                    this.candyMoveProgress += deltaTime * animationSpeed;
                    const t = Math.min(this.candyMoveProgress, 1);
                    
                    const oldPos = this.dispensingCandy.position.clone();
                    
                    // Animate from the upper position to the lower (descent) position
                    const newPos = new THREE.Vector3().lerpVectors(
                        this.candyStartPos,
                        this.candyDescentTargetPos,
                        t
                    );

                    this.dispensingCandy.position.copy(newPos);
                    this.dispensingCandy.mesh.position.copy(newPos);

                    // Imposta la velocità lineare per permettere al corpo cinematico di spingere gli altri
                    if (deltaTime > 0) {
                        const velocity = newPos.clone().sub(oldPos).divideScalar(deltaTime);
                        this.dispensingCandy.linearVelocity.copy(velocity);
                    }

                    if (t >= 1) {
                        // The candy has finished descending. Now open the release door.
                        this.dispensingCandy.linearVelocity.set(0, 0, 0); // Ferma la spinta
                        this.dispensingStage = 'opening_door';
                        this.doorAnimationProgress = 0;
                        // Set the start position for the next animation stage (the ejection)
                        this.candyStartPos.copy(this.dispensingCandy.position);
                        this.candyMoveProgress = 0; // Reset progress for the ejection animation
                    }
                }
                break;

            case 'opening_door':
                this.doorAnimationProgress += deltaTime * animationSpeed * 1.5; // Open faster
                const open_t = Math.min(this.doorAnimationProgress, 1);
                
                if (this.releaseDoorPivot) {
                    // Tilt the door upwards by rotating the pivot on its X-axis
                    this.releaseDoorPivot.rotation.x = -Math.PI / 3 * open_t; // Open by 60 degrees
                }

                if (open_t >= 1) {
                    this.dispensingStage = 'ejecting_candy'; // Next, animate the candy out
                }
                break;
                
            case 'ejecting_candy':
                // This stage animates the candy along a two-part exit path with a parabola
                if (this.dispensingCandy) {
                    this.candyMoveProgress += deltaTime * 1.0; // Rallentato per vedere meglio il percorso
                    const t = Math.min(this.candyMoveProgress, 1);

                    const newPos = new THREE.Vector3();
                    const parabolaHeight = 0.8; // Altezza dell'arco parabolico

                    // Animate through the intermediate point to the final destination
                    if (t <= 0.5) {
                        // Prima metà: da `start` a `intermediate` (lineare)
                        const t_part1 = t * 2; // Scala t da [0, 0.5] a [0, 1]
                        newPos.lerpVectors(
                        this.candyStartPos,
                            this.candyIntermediateExitPos,
                            t_part1
                        );
                    } else {
                        // Seconda metà: da `intermediate` a `final` (con parabola)
                        const t_part2 = (t - 0.5) * 2; // Scala t da [0.5, 1] a [0, 1]
                        
                        // Interpola linearmente la posizione di base
                        newPos.lerpVectors(
                            this.candyIntermediateExitPos,
                            this.candyFinalExitPos,
                            t_part2
                    );
                        
                        // Aggiungi l'altezza della parabola
                        newPos.y += Math.sin(t_part2 * Math.PI) * parabolaHeight;
                    }

                    // Keep physics paused while we animate
                    this.dispensingCandy.position.copy(newPos);
                    this.dispensingCandy.mesh.position.copy(newPos);
                    
                    // Once the animation is complete, release the candy to the physics world
                    if (t >= 1) {
                        // --- MODIFICATO: Chiama il callback per l'animazione di scomparsa ---
                        if (this.onCandyEjected) {
                            this.onCandyEjected(this.dispensingCandy);
                        }
                        
                        // Rimuovi la caramella dalla lista interna della macchina
                        this.candiesInMachine = this.candiesInMachine.filter(c => c !== this.dispensingCandy);
                        this.dispensingCandy = null;
                        
                        this.dispensingStage = 'closing_door';
                        this.doorAnimationProgress = 0;
                    }
                }
                break;

            case 'closing_door':
                this.doorAnimationProgress += deltaTime * animationSpeed;
                const close_t = Math.min(this.doorAnimationProgress, 1);

                if (this.releaseDoorPivot) {
                    // Animate from open to closed
                    this.releaseDoorPivot.rotation.x = -Math.PI / 3 * (1 - close_t);
                }

                if (close_t >= 1) {
                    // Door is closed, now we can raise the main gate
                        this.dispensingStage = 'raising_gate';
                        this.gateAnimationProgress = 0;
                }
                break;

            case 'raising_gate':
                this.gateAnimationProgress += deltaTime * animationSpeed;
                const t_raise = Math.min(this.gateAnimationProgress, 1);

                if (this.gate) {
                    this.gate.position.lerpVectors(this.gateTargetPosition, this.gateOriginalPosition, t_raise);
                }
                
                // Anima anche i plane laterali mentre salgono
                this.gateSidePlanes.forEach((plane, index) => {
                    plane.position.lerpVectors(
                        this.gateSidePlanesTargetPositions[index],
                        this.gateSidePlanesOriginalPositions[index],
                        t_raise
                    );
                });

                if (t_raise >= 1) {
                    this.dispensingStage = 'idle'; // Dispensing part is done
                    if (this.knobAnimationComplete) {
                        this._completeDispensingSequence();
                    } else {
                        this.dispensingStage = 'waiting_for_knob';
                    }
                }
                break;
                
            case 'waiting_for_knob':
                if (this.knobAnimationComplete) {
                    this._completeDispensingSequence();
                }
                break;
        }
    }

    _completeDispensingSequence() {
        this.isDispensing = false;
        this.dispensingStage = 'idle';
        this.dispensingCandy = null;
        
        this.isAnimating = false;
        this.rotationProgress = 0;
        this.knobAnimationComplete = false;
        
        // Ripristina la rotazione esatta della manopola
        if (this.knob) {
            this.knob.rotation.y = this.knobInitialRotationY;
        }

        this.hasCoinInserted = false;
        
        if (this.coinMesh && this.coinMesh.parent === this.knob) {
                this.knob.remove(this.coinMesh);
        }
    }

    update(deltaTime) {
    if (this.coinIsFlying) {
        this.coinFlyProgress += deltaTime;
        const t = Math.min(this.coinFlyProgress / 0.8, 1);
        const pos = new THREE.Vector3().lerpVectors(this.coinStartPos, this.coinTargetPos, t);
        pos.y += Math.sin(t * Math.PI) * 0.5;
        this.coinMesh.position.copy(pos);

        if (t >= 1) {
            this.coinIsFlying = false;
            this.coinHasReachedKnob = true;

            this.model.remove(this.coinMesh);
            this.knob.add(this.coinMesh);

            // 🎯 MODIFICA QUI: Imposta la posizione locale finale corretta.
            this.coinMesh.position.set(-0.1, 0.5, -0.8);
            this.coinMesh.rotation.set(0, Math.PI / 2, 0);

        }
    }

    // Handle the dispensing state machine
    if (this.isDispensing) {
        this._updateDispensingAnimation(deltaTime);
    }

    // Handle knob animation
    if (this.isAnimating) {
        this.rotationProgress += deltaTime;
        const t = Math.min(this.rotationProgress / this.rotationDuration, 1);

        if (this.knob) {
            // Usa l'interpolazione per una rotazione precisa invece di accumulare errori
            this.knob.rotation.y = this.knobInitialRotationY + t * (Math.PI * 2);
        }

        if (this.coinHasReachedKnob) {
            this.coinDisappearTimer += deltaTime;
            if (this.coinDisappearTimer >= 0.3 && this.coinMesh.visible) {
                this.coinMesh.visible = false;
            }
        }

        // Check if knob has completed its full rotation
        if (this.rotationProgress >= this.rotationDuration) {
            this.knobAnimationComplete = true;
            
            // If the dispensing part is waiting for us, end the whole sequence
            if (this.dispensingStage === 'waiting_for_knob') {
                this._completeDispensingSequence();
            }
        }
    }
    }
}