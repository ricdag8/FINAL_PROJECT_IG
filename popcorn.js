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
    
    // 📦 Limiti del contenitore, calcolati una sola volta dal manager
    this.containerBounds = containerBounds;
    
    // ✨ Stato per l'accumulo: quando un popcorn si ferma, smette di essere calcolato
    this.isSettled = false;

    this.reset();
  }

  getSpawnParams() {
    const bbox = new THREE.Box3().setFromObject(this.spawnMesh);
    return bbox;
  }

  reset() {
    const bbox = this.getSpawnParams();
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    
    // Spawn sopra il centro della pentola
    this.mesh.position.set(
        center.x + (Math.random() - 0.5) * size.x * 0.5,
        bbox.max.y,
        center.z + (Math.random() - 0.5) * size.z * 0.5
    );

    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.08,
      Math.random() * 0.2 + 0.1, // "Scoppio" iniziale verso l'alto
      (Math.random() - 0.5) * 0.08
    );

    this.angularVelocity = new THREE.Vector3(
      (Math.random() - 0.5) * 4.0,
      (Math.random() - 0.5) * 4.0,
      (Math.random() - 0.5) * 4.0
    );

    // ✨ Resetta lo stato di accumulo
    this.isSettled = false;
    this.mesh.visible = true;
    this.mesh.scale.setScalar(this.baseScale);
  }

  // ✨ NUOVA LOGICA DI CONTENIMENTO E ACCUMULO
  handleContainment() {
    if (!this.containerBounds || this.isSettled) {
      return;
    }

    const pos = this.mesh.position;
    const vel = this.velocity;

    // Controlla collisione con il fondo (Y min)
    if (pos.y < this.containerBounds.min.y) {
        pos.y = this.containerBounds.min.y; // Correggi la posizione
        vel.y *= -this.restitution; // Rimbalza con smorzamento
        
        // Applica frizione per fermare lo scivolamento
        vel.x *= 0.7;
        vel.z *= 0.7;
        this.angularVelocity.multiplyScalar(0.7);

        // Se la velocità è molto bassa, il popcorn si "deposita"
        if (vel.lengthSq() < 0.0001) {
            this.isSettled = true;
            vel.set(0, 0, 0);
            this.angularVelocity.set(0,0,0);
        }
    }
    
    // Controlla collisione con il soffitto (Y max)
    if (pos.y > this.containerBounds.max.y) {
        pos.y = this.containerBounds.max.y;
        vel.y *= -this.restitution;
    }

    // Controlla collisioni con le pareti (X e Z)
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

  // 🍿 Handle collision with static colliders (machines)
  handleStaticCollisions() {
    if (!this.colliders || this.colliders.length === 0) return;
    
    const particleRadius = this.baseScale * 0.5; // Approximate radius
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
    // Se il popcorn è depositato, non fare nulla
    if (this.isSettled) {
      return;
    }
    
    // Applica la gravità e aggiorna la posizione
    this.velocity.y -= this.gravity * dt;
    this.mesh.position.addScaledVector(this.velocity, dt);

    // Applica la rotazione
    this.mesh.rotation.x += this.angularVelocity.x * dt;
    this.mesh.rotation.y += this.angularVelocity.y * dt;
    this.mesh.rotation.z += this.angularVelocity.z * dt;
    
    // ✨ Controlla le collisioni con il contenitore
    this.handleContainment();
    
    // 🍿 Check collision with static colliders (machines)
    this.handleStaticCollisions();
    
    // Floor collision (when no container bounds)
    if (!this.containerBounds && this.mesh.position.y <= 0.1) {
      this.mesh.position.y = 0.1;
      this.velocity.y = 0;
      this.isSettled = true; // Stop updating when it hits the floor
    }
    
    // Se un popcorn esce molto dai limiti (per bug o tunneling), resettalo
    if (this.containerBounds && (!this.containerBounds.containsPoint(this.mesh.position) && this.mesh.position.y < this.containerBounds.min.y - 1)) {
        this.reset();
    }
  }
}

export class PopcornManager {
  // ✨ COSTRUTTORE AGGIORNATO
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
        
        // ======================= MODIFICA LA LOGICA DEL MARGINE QUI =======================
        // Calcoliamo una dimensione media del contenitore
        const containerSize = containerBounds.getSize(new THREE.Vector3());
        
        // Calcoliamo un margine che sia una piccola frazione (es. 5%) della dimensione più piccola.
        // In questo modo, se la macchina è più piccola, anche il margine si riduce.
        const margin = Math.min(containerSize.x, containerSize.y, containerSize.z) * 0.05;
        
        // Applichiamo il nuovo margine proporzionale
        containerBounds.expandByScalar(-margin); 
        // =================================================================================
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
    
    setInterval(() => this.burst(this.burstSize), this.burstInterval);
  }
  
  // Fa "scoppiare" (resettare) un numero di particelle
  burst(amount = 5) {
    for (let i = 0; i < amount; i++) {
      const p = this.particles.find(p => p.isSettled); // Prendi preferibilmente una particella già depositata
      if(p) p.reset();
    }
  }

  update(dt) {
    for (const particle of this.particles) {
      particle.update(dt);
    }
  }
}