import * as THREE from 'three';
import { RigidBody } from './physics_engine.js';
import { Vec3 } from './physics_engine_vec3.js';

//utility functions for geometry calculations and object spawning

//calculates the center point of multiple meshes by finding their combined bounding box
function calculateMeshGroupCenter(meshes) {
    const bounds = new THREE.Box3();
    
    //combine all mesh bounding boxes into one
    meshes.forEach((mesh) => {
        mesh.updateWorldMatrix(true, false); //update world matrix for accurate bounds
        const meshBounds = new THREE.Box3().setFromObject(mesh);
        bounds.union(meshBounds); //merge this mesh bounds with total bounds
    });
    
    //return the center point of the combined bounding box
    const center = new THREE.Vector3();
    bounds.getCenter(center);
    return center;
}

//creates a coin mesh with golden material and proper size
function createCoinMesh() {
    //create coin geometry - thin cylinder to look like a real coin
    const coinGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16);
    
    //create golden material for the coin
    const coinMaterial = new THREE.MeshStandardMaterial({
        color: 0xffd700, //gold color
        roughness: 0.2, //slightly shiny
        metalness: 0.8 //metallic appearance
    });
    
    //create the coin mesh
    const coinMesh = new THREE.Mesh(coinGeometry, coinMaterial);
    coinMesh.name = 'coin'; //give it a name for identification
    
    return coinMesh;
}

//creates candy objects and populates them in a container area avoiding safety zones
function populateCandy(containerMesh, count, candyGeometry, scene, physicsEngine, candyWorldTargetPos, candiesInMachine) {
    if (!containerMesh) return; //safety check
    
    //array of vibrant candy colors to choose from randomly
    const candyColors = [
        new THREE.Color(0xff4757), //red candy
        new THREE.Color(0x2ed573), //green candy
        new THREE.Color(0x1e90ff), //blue candy
        new THREE.Color(0xf1c40f), //yellow candy
        new THREE.Color(0x9b59b6), //purple candy
        new THREE.Color(0xe67e22)  //orange candy
    ];

    //get candy radius for spacing calculations
    const candyRadius = candyGeometry.parameters.radius;

    //get the world bounding box of the container to define the spawn area
    scene.updateMatrixWorld(true); //update scene matrix
    containerMesh.updateWorldMatrix(true, false); //update container matrix
    const containerWorldBox = new THREE.Box3().setFromObject(containerMesh);
    
    //add margins to prevent candies from spawning too close to container walls
    const marginXZ = candyRadius * 3; //horizontal margin
    const marginY = candyRadius * 1.0; //vertical margin

    containerWorldBox.min.x += marginXZ;
    containerWorldBox.max.x -= marginXZ;
    containerWorldBox.min.z += marginXZ;
    containerWorldBox.max.z -= marginXZ;

    containerWorldBox.min.y += marginY - 0.1;
    containerWorldBox.max.y -= marginY - 0.1;
    
    //safety zone around dispenser - candies won't spawn within this radius
    const safetyRadius = 0.7;
    const safetyRadiusSq = safetyRadius * safetyRadius; //use squared distance for performance

    //register the dispenser safety zone with physics engine
    physicsEngine.setDispenserSafetyZone(candyWorldTargetPos, safetyRadius);

    //spawn the requested number of candies
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

            //check distance to the dispenser area (ignoring y-axis for cylindrical check)
            const distanceSq = (spawnPoint.x - candyWorldTargetPos.x) ** 2 + (spawnPoint.z - candyWorldTargetPos.z) ** 2;

            if (distanceSq > safetyRadiusSq) {
                positionIsValid = true; //position is safe, exit the loop
            }
            attempts++;
        }
        
        //create material with random color from the candy colors array
        const candyMaterial = new THREE.MeshStandardMaterial({
            color: candyColors[Math.floor(Math.random() * candyColors.length)],
            roughness: 0.3, //slightly rough surface
            metalness: 0.1  //mostly non-metallic
        });

        //create candy mesh
        const mesh = new THREE.Mesh(candyGeometry, candyMaterial);
        mesh.name = `Candy_${i}`; //give each candy a unique name
        
        //add candy mesh to scene
        scene.add(mesh);

        //create physics body for the candy
        const body = new RigidBody(new Vec3(worldX, worldY, worldZ), 0.1, mesh); //0.1 mass
        body.setRestitution(0.4); //bouncy but not too much
        body.setFriction(0.8); //good friction to prevent sliding

        //add candy to physics engine and tracking array
        physicsEngine.addBody(body);
        candiesInMachine.push({ body, mesh });
    }
}

//animates a coin flying from start position to target position with arc trajectory
function updateCoinFlyAnimation(coinMesh, deltaTime, coinFlyProgress, coinStartPos, coinTargetPos) {
    const newProgress = coinFlyProgress + deltaTime;
    const t = Math.min(newProgress / 0.8, 1); //0.8 second flight time
    
    //interpolate position between start and target
    const pos = new THREE.Vector3().lerpVectors(coinStartPos, coinTargetPos, t);
    //add arc trajectory with sine wave for realistic coin flip
    pos.y += Math.sin(t * Math.PI) * 0.5; //arc height of 0.5 units
    
    //update coin position
    coinMesh.position.copy(pos);
    
    //return updated progress and completion status
    return {
        newProgress,
        isComplete: t >= 1
    };
}

//creates a door pivot group for proper hinge rotation
function createDoorPivot(doorMesh, scene) {
    //calculate the pivot point in the door's local coordinates
    doorMesh.geometry.computeBoundingBox();
    const bbox = doorMesh.geometry.boundingBox;
    const pivotPointLocal = new THREE.Vector3(
        (bbox.min.x + bbox.max.x) / 2, //center x
        (bbox.min.y + bbox.max.y) / 2, //center y
        bbox.max.z //max z coordinate for hinge position
    );

    //create the pivot group and position it where the hinge should be in world coordinates
    const doorPivot = new THREE.Group();
    doorMesh.localToWorld(pivotPointLocal); //convert to world coordinates
    doorPivot.position.copy(pivotPointLocal);
    scene.add(doorPivot);

    //attach the door to the pivot group for proper rotation
    doorPivot.attach(doorMesh);
    
    return doorPivot;
}

//export all utility functions for use in other modules
export {
    calculateMeshGroupCenter,    //calculates center point of multiple meshes
    createCoinMesh,             //creates a golden coin mesh
    populateCandy,              //spawns candy objects in a container
    updateCoinFlyAnimation,     //animates coin flying with arc trajectory
    createDoorPivot             //creates door pivot for hinge rotation
};