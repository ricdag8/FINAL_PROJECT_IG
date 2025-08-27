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
            bbox.max.z // we add the pivot to be at a max coordinate along the z-axis
        );

        // create the pivot Group and position it where the hinge should be in the world.
        this.releaseDoorPivot = new THREE.Group();
        mesh.localToWorld(pivotPointLocal); // this updates pivotPointLocal to world coords
        this.releaseDoorPivot.position.copy(pivotPointLocal);
        this.scene.add(this.releaseDoorPivot);

        // attach the door to the pivot, this makes the door a child of the pivot
        // while maintaining its current world position, thus allowing correct rotation around the hinge
        //by rotating the parent, we then also rotate the children
        
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

            //create candy mesh
            const mesh = new THREE.Mesh(candyGeometry, candyMaterial);
            mesh.name = `Candy_${i}`;
            
            //add directly to scene
            scene.add(mesh);

            //create physics body
            const body = new RigidBody(mesh, 0.5);
            body.isCandy = true; //mark for bounds checking in the physics engine
            
            //set position directly on the physics body (world coordinates)
            body.position.set(worldX, worldY, worldZ);
            
            body.mesh.position.copy(body.position);
            
            this.physicsEngine.addBody(body);
            this.candiesInMachine.push(body);
        }

        
        //define the physics boundaries for the candies using the container's box
        const candyBoundsMin = new Vec3(containerWorldBox.min.x, containerWorldBox.min.y, containerWorldBox.min.z);
        const candyBoundsMax = new Vec3(containerWorldBox.max.x, containerWorldBox.max.y, containerWorldBox.max.z);
        this.physicsEngine.setCandyBounds(candyBoundsMin, candyBoundsMax);
        
    }


    /*
      Start the candy dispensing sequence
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

    updateDispensingAnimation(deltaTime) {
        const animationSpeed = 2.0; //animation speed multiplier, this appeared to be the right value

        switch (this.dispensingStage) {
            case 'lowering_gate':
                this.gateAnimationProgress += deltaTime * animationSpeed;
                const t_lower = Math.min(this.gateAnimationProgress, 1);
                
                if (this.gate) {
                    this.gate.position.lerpVectors(this.gateOriginalPosition, this.gateTargetPosition, t_lower);
                }


                this.gateSidePlanes.forEach((plane, index) => {
                    plane.position.lerpVectors(
                        this.gateSidePlanesOriginalPositions[index],
                        this.gateSidePlanesTargetPositions[index],
                        t_lower
                    );
                });
                    
                if (t_lower >= 1) {
                    //gate is down, now select and move the candy
                    const randomIndex = Math.floor(Math.random() * this.candiesInMachine.length);
                    this.dispensingCandy = this.candiesInMachine[randomIndex];
                    this.candyStartPos.copy(this.dispensingCandy.position);
                    
                    this.dispensingCandy.isBeingDispensed = true;
                    this.dispensingCandy.isSleeping = false; //wake it up
                    this.dispensingCandy.inverseMass = 0; //we change its inverse mass to make it kinematic

                    this.dispensingStage = 'moving_candy';
                    this.candyMoveProgress = 0;
                }
                break;

            case 'moving_candy':
                if (this.dispensingCandy) {
                    this.candyMoveProgress += deltaTime * animationSpeed;
                    const t = Math.min(this.candyMoveProgress, 1); 
                    

                    const oldPos = this.dispensingCandy.position.clone();

                    const newPos = new THREE.Vector3().lerpVectors(
                        this.candyStartPos,
                        this.candyWorldTargetPos,
                        t
                    );

                    //linear interpolation between 0 and 1
                    
                    this.dispensingCandy.position.copy(newPos);
                    this.dispensingCandy.mesh.position.copy(newPos);

                    //set linear velocity to allow the kinematic body to push others
                    if (deltaTime > 0) {
                        const velocity = newPos.clone().sub(oldPos).divideScalar(deltaTime);
                        this.dispensingCandy.linearVelocity.copy(velocity);
                    }
                    
                    if (t >= 1) {
                        //candy has arrived at the pre-descent point. nnw, start descending.
                        this.dispensingCandy.linearVelocity.set(0, 0, 0); 
                        this.dispensingStage = 'descending';
                        this.candyMoveProgress = 0;
                        this.candyStartPos.copy(this.dispensingCandy.position); //update start pos for next stage
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
                        //the candy has finished descending, in fact interpolation basically stops and thus the candy should be at the final position ready to be dispensed
                        this.dispensingCandy.linearVelocity.set(0, 0, 0); // Ferma la spinta
                        this.dispensingStage = 'opening_door';
                        this.doorAnimationProgress = 0;
                        //set the start position for the next animation stage (the ejection)
                        this.candyStartPos.copy(this.dispensingCandy.position);
                        this.candyMoveProgress = 0; //reset progress for the ejection animation
                    }
                }
                break;

            case 'opening_door':
                this.doorAnimationProgress += deltaTime * animationSpeed * 1.5; 
                const open_t = Math.min(this.doorAnimationProgress, 1);
                
                if (this.releaseDoorPivot) {
                    //tilt the door upwards by rotating the pivot on its X-axis
                    this.releaseDoorPivot.rotation.x = -Math.PI / 3 * open_t; // Open by 60 degrees
                }

                if (open_t >= 1) {
                    this.dispensingStage = 'ejecting_candy'; //next, animate the candy out
                }                break;
                
            case 'ejecting_candy':
                //this stage animates the candy along a two-part exit path with a parabola, in fact it needs to go from bottom to up 
                if (this.dispensingCandy) {
                    this.candyMoveProgress += deltaTime * 1.0;
                    const t = Math.min(this.candyMoveProgress, 1);

                    const newPos = new THREE.Vector3();
                    const parabolaHeight = 0.8; // height of the parabola

                    //animate through the intermediate point to the final destination
                    if (t <= 0.5) {
                        //first half, from `start` to `intermediate` (linear)
                        const t_part1 = t * 2; 
                        newPos.lerpVectors(
                        this.candyStartPos,
                            this.candyIntermediateExitPos,
                            t_part1
                        );
                    } else {
                        //second half, from `intermediate` to `final` (with parabola)
                        const t_part2 = (t - 0.5) * 2; 
                        
                        
                        
                        newPos.lerpVectors(
                            this.candyIntermediateExitPos,
                            this.candyFinalExitPos,
                            t_part2
                    );
                        

                        newPos.y += Math.sin(t_part2 * Math.PI) * parabolaHeight;
                    }

                    //keep physics paused while we animate
                    this.dispensingCandy.position.copy(newPos);
                    this.dispensingCandy.mesh.position.copy(newPos);
                    
                    //once the animation is complete, release the candy to the physics world
                    if (t >= 1) {

                        if (this.onCandyEjected) {
                            this.onCandyEjected(this.dispensingCandy);
                        }
                        

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
                    //animate from open to closed
                    this.releaseDoorPivot.rotation.x = -Math.PI / 3 * (1 - close_t);
                }

                if (close_t >= 1) {
                    //door is closed, now we can raise the main gate
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
                

                this.gateSidePlanes.forEach((plane, index) => {
                    plane.position.lerpVectors(
                        this.gateSidePlanesTargetPositions[index],
                        this.gateSidePlanesOriginalPositions[index],
                        t_raise
                    );
                });

                if (t_raise >= 1) {
                    this.dispensingStage = 'idle'; // dispensing part is done
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

            // reposition and rotate the coin relative to the knob
            this.coinMesh.position.set(-0.1, 0.5, -0.8);
            this.coinMesh.rotation.set(0, Math.PI / 2, 0);

        }
    }

    // handle the dispensing state machine
    if (this.isDispensing) {
        this.updateDispensingAnimation(deltaTime);
    }

    // handle knob animation
    if (this.isAnimating) {
        this.rotationProgress += deltaTime;
        const t = Math.min(this.rotationProgress / this.rotationDuration, 1);

        if (this.knob) {

            this.knob.rotation.y = this.knobInitialRotationY + t * (Math.PI * 2);
        }

        if (this.coinHasReachedKnob) {
            this.coinDisappearTimer += deltaTime;
            if (this.coinDisappearTimer >= 0.3 && this.coinMesh.visible) {
                this.coinMesh.visible = false;
            }
        }


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