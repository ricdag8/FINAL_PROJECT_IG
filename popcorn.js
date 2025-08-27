import * as THREE from 'three';
import { MeshBVH } from 'https://unpkg.com/three-mesh-bvh@0.7.0/build/index.module.js';

class PopcornParticle {
  constructor(geometry, baseMaterial, scene, spawnMesh, containerBounds, colliders = [], gravity = 0.03, baseScale = 0.15) {
    this.material = baseMaterial.clone();
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    this.spawnMesh = spawnMesh;
    this.gravity = gravity;
    this.baseScale = baseScale;
    this.restitution = 0.3; // Basso rimbalzo
    this.colliders = colliders; // Static colliders for machine collision
    


    this.containerBounds = containerBounds;

    // when a popcorn stops, it is considered settled
    this.isSettled = false;

    this.reset();
  }

  getSpawnParams() { //we basically compute the bounding box of the spawning mesh
    const bbox = new THREE.Box3().setFromObject(this.spawnMesh);
    return bbox;
  }

  reset() { //after the popcorn is on the machine, we reset it
    const bbox = this.getSpawnParams();
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());

    // we make the popcorn spawn on the top of the pot
    this.mesh.position.set(
        center.x + (Math.random() - 0.5) * size.x * 0.5,
        bbox.max.y,
        center.z + (Math.random() - 0.5) * size.z * 0.5
    );

    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.12, // Increased horizontal spread
      Math.random() * 0.4 + 0.2, // Increased upward velocity (0.2-0.6 instead of 0.1-0.3)
      (Math.random() - 0.5) * 0.12
    );
    
    this.angularVelocity = new THREE.Vector3( // we give them a random rotation
      (Math.random() - 0.5) * 4.0,
      (Math.random() - 0.5) * 4.0,
      (Math.random() - 0.5) * 4.0
    );

    this.isSettled = false;
    this.mesh.visible = true;
    this.mesh.scale.setScalar(this.baseScale);
  }


  handleContainment() { //we want to apply the physics of the popcorn inside the pot, namely the gravity and the collisions with the pot walls and also friction
    if (!this.containerBounds || this.isSettled) {
      return;
    }

    const pos = this.mesh.position;
    const vel = this.velocity;

    // check collision with the floor - immediately respawn for continuous effect
    if (pos.y < this.containerBounds.min.y) {
        // immediately reset the particle for continuous popping effect
        setTimeout(() => {
            this.reset();
        }, Math.random() * 200 + 50); // Faster respawn (0.05-0.25 seconds) before respawning
        
        //temporarily hide the particle or move it out of view while waiting to respawn
        this.mesh.visible = false;
        this.isSettled = true; //stop updating until reset
    }
    
    // check collision with the ceiling of the machine
    if (pos.y > this.containerBounds.max.y) {
        pos.y = this.containerBounds.max.y;
        vel.y *= -this.restitution;
    }

    // check for collisions with the walls
    if (pos.x < this.containerBounds.min.x) {
        pos.x = this.containerBounds.min.x;
        vel.x *= -this.restitution;
    } else if (pos.x > this.containerBounds.max.x) {
        pos.x = this.containerBounds.max.x;
        vel.x *= -this.restitution;
    }

    if (pos.z < this.containerBounds.min.z) {
        pos.z = this.containerBounds.min.z;
        vel.z *= -this.restitution;
    } else if (pos.z > this.containerBounds.max.z) {
        pos.z = this.containerBounds.max.z;
        vel.z *= -this.restitution;
    }
  }

  //handle collision with static colliders (machines)
  handleStaticCollisions() {
    if (!this.colliders || this.colliders.length === 0) return;
    
    const particleRadius = this.baseScale * 0.5; //approximate radius
    const position = this.mesh.position;
    
    this.colliders.forEach(staticMesh => {
      // Simple bounding box collision detection
      const meshBox = new THREE.Box3().setFromObject(staticMesh);
      
      // Expand the mesh box by particle radius for collision detection
      meshBox.expandByScalar(particleRadius);
      
      if (meshBox.containsPoint(position)) {
        // Calculate push-out direction (center of mesh to particle)
        const meshCenter = meshBox.getCenter(new THREE.Vector3());
        const pushDirection = position.clone().sub(meshCenter).normalize();
        
        // If push direction is invalid, push upward
        if (pushDirection.length() < 0.001) {
          pushDirection.set(0, 1, 0);
        }
        
        // Find the closest face of the bounding box
        const meshSize = meshBox.getSize(new THREE.Vector3());
        const relativePos = position.clone().sub(meshCenter);
        
        // Determine which face is closest and push out accordingly
        const absX = Math.abs(relativePos.x / meshSize.x);
        const absY = Math.abs(relativePos.y / meshSize.y);
        const absZ = Math.abs(relativePos.z / meshSize.z);
        
        if (absY > absX && absY > absZ) {
          // Push out vertically
          if (relativePos.y > 0) {
            position.y = meshBox.max.y + particleRadius;
          } else {
            position.y = meshBox.min.y - particleRadius;
          }
          this.velocity.y = Math.abs(this.velocity.y) * this.restitution; // Bounce up
        } else if (absX > absZ) {
          // Push out horizontally (X)
          if (relativePos.x > 0) {
            position.x = meshBox.max.x + particleRadius;
          } else {
            position.x = meshBox.min.x - particleRadius;
          }
          this.velocity.x *= -this.restitution;
        } else {
          // Push out horizontally (Z)
          if (relativePos.z > 0) {
            position.z = meshBox.max.z + particleRadius;
          } else {
            position.z = meshBox.min.z - particleRadius;
          }
          this.velocity.z *= -this.restitution;
        }
      }
    });
  }

  update(dt) {
    //se il popcorn è depositato, non fare nulla
    if (this.isSettled) {
      return;
    }
    
    //applica la gravità e aggiorna la posizione
    this.velocity.y -= this.gravity * dt;
    this.mesh.position.addScaledVector(this.velocity, dt);

    // we apply also a rotation in order to make a more pleasant effect
    this.mesh.rotation.x += this.angularVelocity.x * dt;
    this.mesh.rotation.y += this.angularVelocity.y * dt;
    this.mesh.rotation.z += this.angularVelocity.z * dt;

    //check collisions with container
    this.handleContainment();
    
    //check collision with static colliders (machines)
    this.handleStaticCollisions();
    
    // Floor collision (when no container bounds) - immediately respawn
    if (!this.containerBounds && this.mesh.position.y <= 0.1) {
      // Immediately reset for continuous effect
      setTimeout(() => {
        this.reset();
      }, Math.random() * 200 + 50); // Faster respawn (0.05-0.25 seconds) before respawning
      
      this.mesh.visible = false;
      this.isSettled = true; // Stop updating until reset
    }
    
    // Se un popcorn esce molto dai limiti (per bug o tunneling), resettalo
    if (this.containerBounds && (!this.containerBounds.containsPoint(this.mesh.position) && this.mesh.position.y < this.containerBounds.min.y - 1)) {
        this.reset();
    }
  }
}

export class PopcornManager {
  // particle system updated that allows to create a popcorn effect and to manage it
  constructor({ scene, spawnMesh, containerMesh, count = 100, gravity = 0.1, baseScale = 0.15, colliders = [], burstSize = 15, burstInterval = 500 }) {
    this.particles = [];
    this.colliders = colliders; // Store static colliders for collision detection
    this.gravity = gravity;
    this.baseScale = baseScale;
    this.burstSize = burstSize;
    this.burstInterval = burstInterval;
    
    let containerBounds = null;
    if (containerMesh) {
        containerBounds = new THREE.Box3().setFromObject(containerMesh);
        
       
        const containerSize = containerBounds.getSize(new THREE.Vector3());
        
        // Calcoliamo un margine che sia una piccola frazione (es. 5%) della dimensione più piccola.
        // In questo modo, se la macchina è più piccola, anche il margine si riduce.
        const margin = Math.min(containerSize.x, containerSize.y, containerSize.z) * 0.05;
        
        // Applichiamo il nuovo margine proporzionale
        containerBounds.expandByScalar(-margin); 
    }

    const geometry = new THREE.IcosahedronGeometry(0.1, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0xfff5d1,
      roughness: 0.8,
      metalness: 0.1
    });

    for (let i = 0; i < count; i++) {
      this.particles.push(
        new PopcornParticle(geometry, material, scene, spawnMesh, containerBounds, this.colliders, this.gravity, this.baseScale)
      );
    }

    setInterval(() => this.burst(this.burstSize), this.burstInterval); //we basically create a burst effect by reactivating some particles every interval
  }
  
  // let a number of popcorn burst - now just for initial startup since particles self-reset
  burst(amount = 3) { // Reduced amount since particles will self-reset

    const settledParticles = this.particles.filter(p => p.isSettled);

    
    // only burst a small amount to supplement the continuous self-resetting
    const activeParticles = this.particles.filter(p => !p.isSettled);
    const shouldBurst = settledParticles.length > 5 || activeParticles.length === 0;
    //we do the burst only when enough particles are settled or if all are active (initial burst)
    if (!shouldBurst) return; // don't burst if most particles are already active
    
    for (let i = 0; i < Math.min(amount, settledParticles.length || this.particles.length); i++) {
      let p = null;
      
      if (settledParticles.length > 0) {
        // Use settled particles
        p = settledParticles[Math.floor(Math.random() * settledParticles.length)];
      } else {
        // Fallback for initial startup
        p = this.particles[Math.floor(Math.random() * this.particles.length)];

      }
      
      if(p) {

        p.reset();
        // Remove from settled particles array to avoid reusing the same particle
        const index = settledParticles.indexOf(p);
        if (index > -1) {
          settledParticles.splice(index, 1);
        }
      }
    }
  }

  update(dt) {
    for (const particle of this.particles) {
      particle.update(dt);
    }
  }
}



/* 

Here’s a tight, developer-oriented summary of the **popcorn particle system**.

# Big picture

* **PopcornParticle** = a single popcorn mesh with simple physics (gravity, bounces, friction, settle).
* **PopcornManager** = a pool of particles that “burst” periodically from a spawn area into a container, with per-frame updates.

# PopcornParticle

**constructor(geometry, baseMaterial, scene, spawnMesh, containerBounds, colliders=\[], gravity=0.03, baseScale=0.15)**

* Creates a mesh (clones `baseMaterial`), enables shadows, sets physics params (`velocity`, `angularVelocity`, `restitution=0.3`, flags) and calls `reset()`.
* Uses:

  * `spawnMesh` → where pops originate,
  * `containerBounds: Box3 | null` → walls/floor/ceiling for bounces,
  * `colliders: Object3D[]` → extra statics to push out of.

**getSpawnParams()**

* Returns `Box3` of `spawnMesh`.

**reset()**

* Re-spawns the kernel slightly above spawn center with random XY jitter.
* Gives it an upward impulse + small horizontal spread and random spin.
* Restores `isSettled=false`, `visible=true`, `scale=baseScale`.

**handleContainment()**

* If `containerBounds` and not settled:

  * **Floor**: clamp Y, invert/dampen `vel.y`, add friction to `vel.x/z` + angular, and **settle** if energy ≪ (|v|² < 1e-4).
  * **Ceiling**: clamp Y, bounce `vel.y`.
  * **Walls (X/Z)**: clamp position and flip respective velocity with damping.

**handleStaticCollisions()**

* For each collider:

  * Expand its `Box3` by particle radius (`baseScale*0.5`).
  * If inside, push out along the closest axis and invert that velocity (Y → bounce up).

**update(dt)**

* Early-out if settled.
* Else: apply gravity, integrate position & rotation, then `handleContainment()` and `handleStaticCollisions()`.
* If **no container**: snap to floor at `y=0.1` and settle.
* Fail-safe: if fell below `container.min.y - 1`, call `reset()`.

# PopcornManager

**constructor({ scene, spawnMesh, containerMesh, count=100, gravity=0.1, baseScale=0.15, colliders=\[], burstSize=15, burstInterval=500 })**

* Computes `containerBounds` from `containerMesh` and **shrinks** \~5% to avoid edge penetrations.
* Creates **one** shared geometry (small icosahedron) and **one** base material (yellowish); instantiates `count` particles (each clones material internally).
* Starts a `setInterval` that calls `burst(burstSize)` periodically.

**burst(amount=5)**

* Finds settled particles and `reset()`s up to `amount`.

**update(dt)**

* Calls `particle.update(dt)` for all particles.

# Typical usage

```js
const popcorn = new PopcornManager({
  scene, spawnMesh, containerMesh,
  count: 150, gravity: 0.12, baseScale: 0.14,
  colliders: [machineBody, glassPane],
  burstSize: 12, burstInterval: 400
});

function tick(dt /* seconds ) {
  popcorn.update(dt);
}
```

# Notes & gotchas

* **Time units:** `dt` must be in **seconds** (physics uses v += a*dt, p += v*dt).
* **Performance:** `handleStaticCollisions()` recomputes collider `Box3` per particle per frame; cache those AABBs and update only when colliders move.
* **Material clones:** each particle clones `baseMaterial` (flexible but heavier). If per-particle variation isn’t needed, avoid cloning.
* **Settling behavior:** lateral damping is light on wall hits; increase damping or add global drag if kernels “buzz” near walls.
* **Burst interval:** there’s no `dispose()`—add one to clear the interval and remove meshes when destroying the manager.
* **Spawn height:** `reset()` uses `spawnMesh` bbox top; for very low lids, add extra Y offset to avoid immediate collisions.
* **Container margin:** the 5% shrink reduces usable volume; tune for tiny containers.


*/