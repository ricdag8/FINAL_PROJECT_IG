//import three.js library for 3d graphics
import * as THREE from 'three';
//import physics body class for collision detection
import { RigidBody } from './physics_engine.js';
//import 3d vector class for position calculations
import { Vec3 } from './physics_engine_vec3.js';

//candy machine class handles candy dispensing mechanism and coin insertion
export class CandyMachine {
    constructor(model, physicsEngine, scene) {
        this.model = model; //the 3d model of the candy machine
        this.physicsEngine = physicsEngine; //physics engine for collision detection
        this.scene = scene; //three.js scene where objects are rendered
        this.knob = null; //reference to the machine's rotating knob
        this.isAnimating = false; //tracks if knob rotation animation is playing
        this.rotationProgress = 0; //how far the knob has rotated (0 to 1)
        this.rotationDuration = 2; //time in seconds for complete knob rotation
        this.candiesInMachine = []; //array of all candy objects inside the machine

        //define properties before they are used
        this.candyWorldTargetPos = new THREE.Vector3(); //world position where candy should be dispensed
        this.targetSphere = null; //green helper sphere showing dispense target location

        //properties for dispensing mechanism
        this.gate = null; //reference to the gate mesh that controls candy flow
        this.gateSidePlanes = []; //side panels that animate during dispensing
        this.gateSidePlanesOriginalPositions = []; //original positions of side panels
        this.gateSidePlanesTargetPositions = []; //target positions for side panels animation
        this.gateOriginalPosition = null; //original position of the gate before lowering
        this.isDispensing = false;
        this.dispensingCandy = null; 
        this.onCandyEjected = null;
        this.gateTargetPosition = null; 
        this.gateAnimationProgress = 0;
        this.dispensingStage = 'idle'; //current stage of dispensing process
        this.candyMoveProgress = 0; //progress of candy movement animation (0 to 1)
        this.candyStartPos = new THREE.Vector3(); //starting position of candy during dispensing
        this.releaseDoor = null; //door that opens to let candy out
        this.releaseDoorPivot = null; //pivot point for door rotation animation
        this.doorAnimationProgress = 0; //progress of door opening animation (0 to 1)
        this.candyDescentTargetPos = new THREE.Vector3(); //target position for candy descent phase
        this.candyIntermediateExitPos = new THREE.Vector3(); //intermediate position during candy exit
        this.candyFinalExitPos = new THREE.Vector3(); //final position where candy exits machine
        this.releaseMechanismPosition = new THREE.Vector3(); //position of the release mechanism

        //properties for coin insertion logic
        this.clawController = null; //reference to claw controller for score tracking
        this.hasCoinInserted = false; //tracks if player has inserted a coin
        this.coinMesh = null; //3d mesh representing the coin

        this._findParts(); //find and store references to machine parts
        this._createCoin(); //create the coin mesh at startup
        this.coinFlyProgress = 0; //progress of coin flying animation (0 to 1)
        this.coinStartPos = new THREE.Vector3(); //starting position for coin flying animation
        this.coinTargetPos = new THREE.Vector3(); //target position for coin flying animation
        this.coinIsFlying = false; //tracks if coin is currently flying toward knob
        this.coinHasReachedKnob = false; //tracks if coin has reached the knob
        this.coinDisappearTimer = 0; //timer for coin disappearing after reaching knob
        this.knobAnimationComplete = false; //tracks if knob has completed full 360 degree rotation
        this.knobInitialRotationY = 0; //initial rotation of knob for precise animation
    }

    //sets up the release door and creates rotation pivot for proper hinge animation
    setReleaseDoor(mesh) {
        this.releaseDoor = mesh; //store reference to the door mesh
        
        //create a pivot for the door to rotate around its hinge
        //calculate the pivot point in the door's local coordinates
        mesh.geometry.computeBoundingBox(); //compute bounding box for pivot calculation
        const bbox = mesh.geometry.boundingBox; //get the bounding box
        const pivotPointLocal = new THREE.Vector3( //create pivot point at door hinge
            (bbox.min.x + bbox.max.x) / 2, //center x position
            (bbox.min.y + bbox.max.y) / 2, //center y position
            bbox.max.z //max z position for hinge location
        );

        //create the pivot group and position it where the hinge should be in world coordinates
        this.releaseDoorPivot = new THREE.Group(); //create empty group for pivot
        mesh.localToWorld(pivotPointLocal); //convert local coordinates to world coordinates
        this.releaseDoorPivot.position.copy(pivotPointLocal); //position pivot at hinge location
        this.scene.add(this.releaseDoorPivot); //add pivot group to scene

        //attach the door to the pivot making door a child of pivot group
        //this maintains current world position while allowing rotation around hinge
        //by rotating the parent pivot we also rotate the child door
        
        this.releaseDoorPivot.attach(this.releaseDoor); //make door child of pivot for rotation

        //calculate descent target and create helper positions
        this.candyDescentTargetPos.copy(this.candyWorldTargetPos); //copy x and z from dispense target
        this.candyDescentTargetPos.y = this.releaseDoorPivot.position.y - 0.9; //set y below door for descent

        //define the intermediate and final exit positions for candy trajectory
        const pivotPos = this.releaseDoorPivot.position; //get door pivot position

        //intermediate exit point is slightly below pivot and further back
        this.candyIntermediateExitPos.set(
            pivotPos.x, //same x as door pivot
            pivotPos.y - 0.5, //slightly below pivot
            pivotPos.z + 1.0 //further back from door
        );

        //final exit position is higher than intermediate making an arc trajectory
        this.candyFinalExitPos.set(
            pivotPos.x, //same x as door pivot
            this.candyIntermediateExitPos.y + 2.0, //much higher for arc effect
            pivotPos.z + 0.5 //slightly forward from intermediate
        );
    }

    //creates the coin mesh and keeps it hidden ready for use
    _createCoin() {
        const coinGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.008, 16); //thin cylinder shape for coin
        const coinMaterial = new THREE.MeshStandardMaterial({ //golden material properties
            color: 0xffd700, //gold color
            metalness: 0.8, //highly metallic surface
            roughness: 0.4 //moderately rough for realistic look
        });
        this.coinMesh = new THREE.Mesh(coinGeometry, coinMaterial); //create coin mesh
        this.coinMesh.material = new THREE.MeshStandardMaterial({ //override with brighter material
            color: 0xffff00, //bright yellow color
            emissive: 0xffaa00, //orange glow effect
            emissiveIntensity: 0.8, //strong glow intensity
            metalness: 0.7, //metallic surface
            roughness: 0.3 //smooth surface for shine
        });

        this.coinMesh.visible = false; //initially hidden until inserted
    }

    //binds the claw controller to track scores and spend coins
    setClawController(controller) {
        this.clawController = controller; //store reference for coin spending
    }

    //handles coin insertion when player presses coin button
    insertCoin() {
        if (this.hasCoinInserted || this.isAnimating) { //prevent multiple coins or animation conflicts
            return; //exit if coin already inserted or machine is animating
        }
        if (!this.clawController) { //safety check for controller reference
            return; //exit if no claw controller available
        }

        if (this.clawController.spendStarAsCoin()) { //try to spend one star as coin
            this.hasCoinInserted = true; //mark coin as successfully inserted

            if (this.knob && this.coinMesh) { //check if knob and coin mesh exist
                //set starting position for coin flying animation
                const worldStartPos = new THREE.Vector3(2, 2, 5); //starting position in world space

                //compute the world position of the knob to use as target
                const localTargetPos = new THREE.Vector3(-0.1, 0.5, -0.8); //position relative to knob
                this.knob.updateWorldMatrix(true, false); //update knob world matrix
                const worldTargetPos = this.knob.localToWorld(localTargetPos.clone()); //convert to world space

                //convert both global positions to local coordinates relative to coin parent
                this.model.updateWorldMatrix(true, false); //update model world matrix
                this.coinStartPos.copy(this.model.worldToLocal(worldStartPos)); //convert start to local
                this.coinTargetPos.copy(this.model.worldToLocal(worldTargetPos)); //convert target to local
                //setup coin for flying animation
                this.model.add(this.coinMesh); //add coin to machine model
                this.coinMesh.position.copy(this.coinStartPos); //position coin at starting point
                this.coinMesh.rotation.set(Math.PI / 2, 0, 0); //rotate coin to stand upright
                this.coinMesh.visible = true; //make coin visible

                //reset animation properties for new coin flight
                this.coinFlyProgress = 0; //reset animation progress
                this.coinIsFlying = true; //start flying animation
                this.coinHasReachedKnob = false; //reset knob reached flag
                this.coinDisappearTimer = 0; //reset disappear timer
            }
        }
    }
    //finds and stores references to important parts of the candy machine model
    _findParts() {
        const gateMeshes = []; //collect all gate related meshes for dispensing mechanism
        const allMeshNames = []; //debug array to collect all mesh names
        
        //traverse through all children in the 3d model to find important parts
        this.model.traverse(child => {
            if (child.isMesh) { //check if child is a mesh object
                allMeshNames.push(child.name); //add mesh name to debug list
            }
            if (child.isMesh && child.name === 'Object_6') { //find the rotating knob
                this.knob = child; //store reference to knob mesh

                //center the knob geometry for proper rotation
                const positions = this.knob.geometry.attributes.position.array; //get vertex positions
                const centroid = new THREE.Vector3(); //calculate center point
                for (let i = 0; i < positions.length; i += 3) { //loop through vertices
                    centroid.x += positions[i]; //sum x coordinates
                    centroid.y += positions[i + 1]; //sum y coordinates
                    centroid.z += positions[i + 2]; //sum z coordinates
                }
                centroid.divideScalar(positions.length / 3); //calculate average position

                //translate geometry to center it at origin for proper rotation
                this.knob.geometry.translate(-centroid.x, -centroid.y, -centroid.z);
                const transformedOffset = centroid.clone().applyQuaternion(this.knob.quaternion).multiply(this.knob.scale);
                this.knob.position.add(transformedOffset); //adjust position to compensate

                this.knob.rotation.y += Math.PI; //rotate knob 180 degrees to face correct direction
            }

            //find the gate mesh for dispensing mechanism
            if (child.isMesh && child.name === 'Gate') {
                this.gate = child; //store reference to gate mesh
                this.gateOriginalPosition = child.position.clone(); //save original position
                //calculate gate lowering position by moving down 0.5 units
                this.gateTargetPosition = child.position.clone(); //copy current position
                this.gateTargetPosition.y -= 0.5; //lower the target position
            }

            //find side planes that animate with the gate
            if (child.isMesh && ['Plane2', 'Plane3', 'Plane4'].includes(child.name)) {
                this.gateSidePlanes.push(child); //add to side planes array
                const originalPos = child.position.clone(); //save original position
                this.gateSidePlanesOriginalPositions.push(originalPos); //store for reset
                
                const targetPos = originalPos.clone(); //copy for target calculation
                targetPos.y -= 0.5; //lower target position same as gate
                this.gateSidePlanesTargetPositions.push(targetPos); //store target position
            }

            //collect all gate related meshes for center calculation
            if (child.isMesh && ['Gate', 'Plane2', 'Plane3', 'Plane4'].includes(child.name)) {
                gateMeshes.push(child); //add to gate meshes for dispensing center
            }

        });

        //calculate the center of the gate area for candy targeting
        if (gateMeshes.length > 0) { //check if gate meshes were found
            this._calculateDispenseCenter(gateMeshes); //calculate dispensing center point
        }
    }

    //calculates the center of the gate area for candy targeting
    _calculateDispenseCenter(gateMeshes) {
        const bounds = new THREE.Box3(); //create bounding box to contain all gates
        gateMeshes.forEach((mesh) => { //loop through each gate mesh
            mesh.updateWorldMatrix(true, false); //update mesh world matrix
            const meshBounds = new THREE.Box3().setFromObject(mesh); //get mesh bounds
            bounds.union(meshBounds); //combine with total bounds
        });
        
        //get the center in world coordinates and store it
        bounds.getCenter(this.candyWorldTargetPos); //calculate and store center point
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
    //starts the candy dispensing sequence when player inserts coin
    startCandyDispensing() {
        if (!this.hasCoinInserted) { //check if coin was inserted
            return; //exit if no coin available
        }
        
        if (this.isDispensing || this.isAnimating) { //prevent multiple dispensing operations
            return; //exit if already dispensing or animating
        }
        
        if (this.candiesInMachine.length === 0) { //check if candies are available
            return; //exit if no candies to dispense
        }
        
        //start both dispensing and knob animation simultaneously
        this.isDispensing = true; //mark dispensing as active
        this.dispensingStage = 'lowering_gate'; //set first stage of dispensing
        this.gateAnimationProgress = 0; //reset gate animation progress
        
        //start knob rotation animation
        this.isAnimating = true; //mark knob animation as active
        this.rotationProgress = 0; //reset knob rotation progress
        this.knobAnimationComplete = false; //reset completion flag
        if (this.knob) { //check if knob exists
            this.knobInitialRotationY = this.knob.rotation.y; //save initial rotation
        }
    }

    //updates the multi stage dispensing animation system
    updateDispensingAnimation(deltaTime) {
        const animationSpeed = 2.0; //animation speed multiplier for all dispensing stages

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

    //main update method called every frame to handle all animations
    update(deltaTime) {
        //handle coin flying animation when coin is inserted
        if (this.coinIsFlying) {
            this.coinFlyProgress += deltaTime; //update animation progress
            const t = Math.min(this.coinFlyProgress / 0.8, 1); //normalize to 0-1 over 0.8 seconds
            const pos = new THREE.Vector3().lerpVectors(this.coinStartPos, this.coinTargetPos, t); //interpolate position
            pos.y += Math.sin(t * Math.PI) * 0.5; //add arc trajectory with sine wave
            this.coinMesh.position.copy(pos); //update coin position

            if (t >= 1) { //check if animation is complete
                this.coinIsFlying = false; //stop flying animation
                this.coinHasReachedKnob = true; //mark coin as reached knob

                this.model.remove(this.coinMesh); //remove coin from machine model
                this.knob.add(this.coinMesh); //add coin to knob as child

                //reposition and rotate the coin relative to the knob
                this.coinMesh.position.set(-0.1, 0.5, -0.8); //set local position on knob
                this.coinMesh.rotation.set(0, Math.PI / 2, 0); //rotate coin to face correctly
            }
        }

        //handle the dispensing state machine
        if (this.isDispensing) {
            this.updateDispensingAnimation(deltaTime); //update multi stage dispensing animation
        }

        //handle knob rotation animation
        if (this.isAnimating) {
            this.rotationProgress += deltaTime; //update rotation progress
            const t = Math.min(this.rotationProgress / this.rotationDuration, 1); //normalize to 0-1

            if (this.knob) { //check if knob exists
                this.knob.rotation.y = this.knobInitialRotationY + t * (Math.PI * 2); //rotate 360 degrees
            }

            //handle coin disappearing after reaching knob
            if (this.coinHasReachedKnob) {
                this.coinDisappearTimer += deltaTime; //increment disappear timer
                if (this.coinDisappearTimer >= 0.3 && this.coinMesh.visible) { //wait 0.3 seconds
                    this.coinMesh.visible = false; //hide the coin
                }
            }

            //check if knob rotation is complete
            if (this.rotationProgress >= this.rotationDuration) {
                this.knobAnimationComplete = true; //mark rotation as complete
                
                //if dispensing is waiting for knob completion end the whole sequence
                if (this.dispensingStage === 'waiting_for_knob') {
                    this._completeDispensingSequence(); //complete the entire dispensing process
                }
            }
        }
    } //end of main update method
} //end of candy machine class