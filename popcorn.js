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
    

    //  Limiti del contenitore, calcolati una sola volta dal manager
    this.containerBounds = containerBounds;
    
    // Stato per l'accumulo: quando un popcorn si ferma, smette di essere calcolato
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
        // Immediately reset the particle for continuous popping effect
        setTimeout(() => {
            this.reset();
        }, Math.random() * 200 + 50); // Faster respawn (0.05-0.25 seconds) before respawning
        
        // Temporarily hide the particle or move it out of view while waiting to respawn
        this.mesh.visible = false;
        this.isSettled = true; // Stop updating until reset
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

  // Handle collision with static colliders (machines)
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
    
    //  Controlla le collisioni con il contenitore
    this.handleContainment();
    
    //  Check collision with static colliders (machines)
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
    
    setInterval(() => this.burst(this.burstSize), this.burstInterval);
  }
  
  // let a number of popcorn burst - now just for initial startup since particles self-reset
  burst(amount = 3) { // Reduced amount since particles will self-reset
    console.log('Burst called with amount:', amount);
    const settledParticles = this.particles.filter(p => p.isSettled);
    console.log('Settled particles available:', settledParticles.length);
    
    // Only burst a small amount to supplement the continuous self-resetting
    const activeParticles = this.particles.filter(p => !p.isSettled);
    const shouldBurst = settledParticles.length > 5 || activeParticles.length === 0;
    
    if (!shouldBurst) return; // Don't burst if most particles are already active
    
    for (let i = 0; i < Math.min(amount, settledParticles.length || this.particles.length); i++) {
      let p = null;
      
      if (settledParticles.length > 0) {
        // Use settled particles
        p = settledParticles[Math.floor(Math.random() * settledParticles.length)];
      } else {
        // Fallback for initial startup
        p = this.particles[Math.floor(Math.random() * this.particles.length)];
        console.log('Using random particle for initial burst');
      }
      
      if(p) {
        console.log('Resetting particle');
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

# PopcornParticle

### constructor(geometry, baseMaterial, scene, spawnMesh, containerBounds, colliders = \[], gravity = 0.03, baseScale = 0.15)

* **Scopo:** crea una singola “particella” di popcorn (mesh + stato fisico) e la aggiunge alla scena.
* **Parametri:**

  * `geometry` (THREE.BufferGeometry) – geometria condivisa tra i popcorn.
  * `baseMaterial` (THREE.Material) – viene **clonato** per la particella.
  * `scene` (THREE.Scene) – dove aggiungere il mesh.
  * `spawnMesh` (THREE.Object3D) – l’area/oggetto da cui “scoppiano” i popcorn (per calcolare il box di spawn).
  * `containerBounds` (THREE.Box3 | null) – box del contenitore per vincoli e rimbalzi; se `null`, usa il “pavimento” a Y≈0.1.
  * `colliders` (THREE.Object3D\[]) – oggetti statici contro cui spingere fuori i popcorn.
  * `gravity` (number) – accelerazione gravitazionale (unità per secondo²).
  * `baseScale` (number) – scala iniziale della particella.
* **Ritorno:** nessuno.
* **Effetti:** crea `this.mesh` (ombre abilitate), imposta proprietà fisiche (`velocity`, `angularVelocity`, `restitution=0.3`, ecc.) e chiama `reset()`.

### getSpawnParams()

* **Scopo:** calcolare il bounding box dello `spawnMesh`.
* **Parametri:** nessuno.
* **Ritorno:** `THREE.Box3` con i limiti axis-aligned di `spawnMesh`.

### reset()

* **Scopo:** “rispawning” della particella come se fosse appena scoppiata.
* **Parametri:** nessuno.
* **Ritorno:** nessuno.
* **Effetti:**

  * Posiziona la mesh **sopra** il centro dello `spawnMesh` con piccola casualità in X/Z.
  * Inizializza `velocity` con impulso verso l’alto e leggera dispersione orizzontale.
  * Inizializza `angularVelocity` casuale.
  * Ripristina `isSettled = false`, `visible = true`, e scala = `baseScale`.

### handleContainment()

* **Scopo:** far rimbalzare/limitare la particella dentro il contenitore; applicare attrito e “deposito”.
* **Parametri:** nessuno.
* **Ritorno:** nessuno.
* **Effetti (attivo solo se `containerBounds` esiste e non è `isSettled`):**

  * **Fondo (Y min):** corregge Y, inverte e smorza `vel.y`, applica frizione su `vel.x/z` e rotazioni; se l’energia è **molto bassa** (`vel.lengthSq() < 0.0001`), marca la particella come **deposta** (`isSettled = true`) e azzera velocità/rotazioni.
  * **Soffitto (Y max):** corregge Y e rimbalza `vel.y`.
  * **Pareti X/Z:** clampa X/Z e inverte la componente di velocità relativa con smorzamento (`restitution`).

### handleStaticCollisions()

* **Scopo:** evitare che le particelle penetrino nei collider statici (macchine, strutture).
* **Parametri:** nessuno.
* **Ritorno:** nessuno.
* **Effetti:** per ogni collider:

  * Calcola `Box3` dell’oggetto, **espanso** del raggio particella (`baseScale * 0.5`).
  * Se la posizione è **dentro** il box: determina la faccia più vicina (asse con rapporto relativo maggiore tra X/Y/Z) e spinge la particella **fuori** lungo quell’asse, invertendo la velocità sull’asse scelto (per Y la rimbalza verso l’alto).

### update(dt)

* **Scopo:** avanzare la simulazione della particella (fisica semplice + collisioni).
* **Parametri:** `dt` (number, secondi trascorsi dall’ultimo frame).
* **Ritorno:** nessuno.
* **Effetti:**

  * Se `isSettled` → **non fa nulla**.
  * Altrimenti: applica gravità a `vel.y`, integra posizione (`position += vel * dt`), aggiorna rotazioni con `angularVelocity * dt`.
  * Chiama `handleContainment()` e poi `handleStaticCollisions()`.
  * **Se non c’è contenitore:** collisione con “pavimento” a `y=0.1` → si ferma e diventa `isSettled`.
  * **Fail-safe:** se esce dal contenitore e scende **oltre** `min.y - 1`, chiama `reset()`.

---

# PopcornManager

### constructor({ scene, spawnMesh, containerMesh, count = 100, gravity = 0.1, baseScale = 0.15, colliders = \[], burstSize = 15, burstInterval = 500 })

* **Scopo:** crea e gestisce un sistema di particelle “popcorn” (pool di `PopcornParticle`) con burst periodici.
* **Parametri:**

  * `scene` (THREE.Scene), `spawnMesh` (Object3D), `containerMesh` (Object3D | null).
  * `count` (numero di particelle da istanziare).
  * `gravity`, `baseScale` – passati alle particelle.
  * `colliders` (array di Object3D) – ostacoli statici condivisi.
  * `burstSize` – quante particelle “risvegliare” ad ogni burst.
  * `burstInterval` (ms) – intervallo tra i burst.
* **Ritorno:** nessuno.
* **Effetti:**

  * Calcola `containerBounds` da `containerMesh` (se presente) e lo **restringe** di un margine **proporzionale** (5% della dimensione minore del contenitore).
  * Crea **una sola** `geometry` (Icosaedro 0.1) e **un** `material` base (giallino), poi istanzia `count` particelle passando **la stessa geometria** e **lo stesso materiale** (clonato internamente da ogni particella).
  * Avvia un `setInterval` che chiama periodicamente `burst(burstSize)`.

### burst(amount = 5)

* **Scopo:** far “scoppiare” un gruppo di particelle già depositate.
* **Parametri:** `amount` (quante tentare di resettare).
* **Ritorno:** nessuno.
* **Effetti:** cerca particelle con `isSettled === true` e chiama `reset()` fino a `amount` elementi disponibili.

### update(dt)

* **Scopo:** aggiornare tutte le particelle.
* **Parametri:** `dt` (secondi).
* **Ritorno:** nessuno.
* **Effetti:** itera `this.particles` e chiama `particle.update(dt)`.

---

## Appunti, insidie e note utili

* **Import non usato:** `MeshBVH` viene importato ma non è utilizzato in questo file.
* **Unità di tempo:** il codice assume `dt` in **secondi** (perché fa `vel += a * dt` e `pos += vel * dt`). Assicurati che il tuo game loop passi secondi (non millisecondi).
* **Prestazioni (collider):** `handleStaticCollisions()` fa `new THREE.Box3().setFromObject(mesh)` per **ogni particella e per ogni collider** ad ogni frame → può essere costoso. Valuta di **precalcolare** e riutilizzare i `Box3` (o aggiornarli solo quando i collider si muovono).
* **Deposito/attrito:** l’attrito orizzontale viene applicato solo quando si tocca il **fondo** del contenitore; contro le **pareti** si rimbalza con poco smorzamento → le particelle possono “vibrare” a lungo se non si depositano. Puoi aumentare lo smorzamento laterale o applicare un drag globale.
* **Raggio particella:** per i collider si usa `baseScale * 0.5` come raggio **approssimato**; se cambi geometria/scala, taralo di conseguenza.
* **Material clone per particella:** ogni particella clona il materiale → comodo per variazioni per-particella, ma più costoso. Se non ti serve, passa **lo stesso** materiale e non clonarlo nella particella.
* **Interval di burst:** viene creato un `setInterval` nel costruttore, ma non c’è un metodo `dispose()` per cancellarlo → aggiungilo se il manager può essere distrutto/cambiato scena.
* **Spawn box:** `reset()` usa `Box3` di `spawnMesh` ad ogni chiamata (ok), con jitter `± size * 0.5` in X/Z e Y fissata a `bbox.max.y` → se la pentola è molto bassa, potresti generare contatti immediati col coperchio; regola il fattore o aggiungi offset Y.
* **Contenitore ridotto del 5%:** `expandByScalar(-margin)` evita che le particelle intersechino i bordi, ma riduce lo spazio utile. Per contenitori minuscoli, valuta una percentuale minore o un margine fisso minimo/massimo.
* **Fallback senza contenitore:** se `containerBounds` è assente, la “collisione pavimento” è un semplice snap a `y=0.1` con stop immediato.

Se vuoi, posso aggiungere direttamente i commenti **JSDoc** in linea al codice (per IntelliSense e hover) o proporti un piccolo `dispose()` per il manager (clearInterval e rimozione mesh) e una cache dei `Box3` dei collider.

*/