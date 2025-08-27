import * as THREE from 'three';

// arrays to track different types of animations happening in the game
let animatingPrizes = [];  // prizes that are being animated when won
let activeExplosions = []; // particle explosions currently playing
let animatingCandies = []; // candies that are disappearing with special effects

// creates a particle explosion effect at the given position with a specific color
// this is the core particle system used for candy animations and prize effects
function createExplosion(position, color = new THREE.Color(0xffdd00)) {
    const particleCount = 100; // number of particles in the explosion
    const particles = new THREE.BufferGeometry(); // geometry to hold all particle positions
    const positions = new Float32Array(particleCount * 3); // array for x,y,z positions of each particle
    const particleData = []; // stores physics data for each particle

    // create each individual particle with random movement properties
    for (let i = 0; i < particleCount; i++) {
        // generate random velocity in all directions, normalized and scaled
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2, // random x direction
            (Math.random() - 0.5) * 2, // random y direction
            (Math.random() - 0.5) * 2  // random z direction
        ).normalize().multiplyScalar(Math.random() * 3 + 1); // normalize and scale velocity

        // store particle properties for animation updates
        particleData.push({
            velocity: velocity, // how fast and in what direction the particle moves
            lifetime: Math.random() * 1.5 + 0.5 // how long the particle lives (0.5 to 2 seconds)
        });
    }

    // attach position data to the particle geometry
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // create material for the particles with visual effects
    const material = new THREE.PointsMaterial({
        color: color, // particle color (usually matches the candy color)
        size: 0.05, // size of each particle point
        transparent: true, // allows opacity changes for fade effects
        opacity: 1, // start fully visible
        blending: THREE.AdditiveBlending, // makes particles glow when overlapping
        depthWrite: false // prevents z-buffer issues with transparent particles
    });

    // create the final particle system object
    const explosion = new THREE.Points(particles, material);
    explosion.position.copy(position); // place explosion at the specified location
    explosion.userData.particles = particleData; // store particle physics data
    explosion.userData.maxLifetime = 2; // total duration of the explosion
    explosion.userData.currentLifetime = 0; // tracks how long explosion has been running

    return explosion;
}

// starts the animation sequence for a prize that was picked up by the claw
function startPrizeAnimation(prizeBody, clawTopBox) {
    prizeBody.isAnimating = true; // mark the prize as currently animating
    animatingPrizes.push({
        body: prizeBody, // the physics body of the prize
        state: 'moving_out' // first animation state - moving toward the player
    });
}

// updates prize animations each frame - prizes can explode, shrink, or fly away
function updatePrizeAnimations(deltaTime, clawTopBox, scene, physicsEngine) {
    if (!clawTopBox) return; // safety check

    const moveSpeed = 0.5; // how fast prizes move toward the player
    const targetZ = clawTopBox.max.z + 0.5; // position where prizes start disappearing

    animatingPrizes.forEach(prize => {
        const body = prize.body; // physics body of the prize
        const mesh = body.mesh; // visual mesh of the prize
        
        switch (prize.state) {
            case 'moving_out':
                // move the prize toward the player
                body.position.z += moveSpeed * deltaTime;
                if (body.position.z >= targetZ) {
                    prize.state = 'choose_destruction'; // ready for disappearing animation
                }
                break;
            
            case 'choose_destruction':
                // randomly pick how the prize will disappear
                const animations = ['explode', 'shrink', 'fly_up'];
                const choice = animations[Math.floor(Math.random() * animations.length)];

                if (choice === 'explode') {
                    // use particle system for explosion effect
                    const explosion = createExplosion(body.position, mesh.material.color);
                    scene.add(explosion);
                    activeExplosions.push(explosion);
                    scene.remove(mesh); // remove prize immediately
                    prize.state = 'disappeared'; 
                } else {
                    mesh.material.transparent = true; // enable fading effects
                    if (choice === 'shrinking') {
                        prize.state = 'shrinking';
                    } else {
                        prize.state = 'flying_up';
                    }
                }
                break;

            case 'shrinking':
                // gradually shrink the prize while fading it out
                mesh.scale.multiplyScalar(1 - (deltaTime * 2.5)); // shrink size
                mesh.material.opacity -= deltaTime * 2;           // fade transparency

                if (mesh.scale.x < 0.001) { // when too small to see
                    scene.remove(mesh);
                    prize.state = 'disappeared';
                }
                break;

            case 'flying_up':
                // make the prize fly upward while fading out
                body.position.y += deltaTime * 3.0;    // move up
                mesh.material.opacity -= deltaTime * 1.5; // fade out

                if (mesh.material.opacity <= 0) { // when completely transparent
                    scene.remove(mesh);
                    prize.state = 'disappeared';
                }
                break;
        }
    });

    // remove prizes that have finished their animations
    animatingPrizes = animatingPrizes.filter(p => p.state !== 'disappeared');
}

// starts the particle animation when a candy is collected or disappears
// this function chooses between different particle effects for visual variety
function startCandyDisappearanceAnimation(candyBody, physicsEngine) {
    physicsEngine.removeBody(candyBody); // remove candy from physics simulation

    // randomly choose between two different particle animation styles
    const animations = ['confetti', 'ribbons'];
    const choice = animations[Math.floor(Math.random() * animations.length)];

    // add the candy to the animation system with the chosen particle effect
    animatingCandies.push({
        body: candyBody, // the candy object that is disappearing
        state: choice, // which particle animation to use ('confetti' or 'ribbons')
        lifetime: 0, // tracks how long the animation has been running
    });
}

// updates all candy particle animations each frame
// this is where the main candy particle system logic runs
function updateCandyAnimations(deltaTime, scene) {
    const gravity = 3.0; // gravity force applied to ribbon particles

    // process each animating candy (loop backwards to safely remove items)
    for (let i = animatingCandies.length - 1; i >= 0; i--) {
        const candyAnim = animatingCandies[i];
        candyAnim.lifetime += deltaTime; // track how long this animation has been running

        switch (candyAnim.state) {
            case 'confetti':
                // create instant particle explosion using the main particle system
                const explosion = createExplosion(candyAnim.body.mesh.position, candyAnim.body.mesh.material.color);
                scene.add(explosion); // add the particle explosion to the 3d scene
                activeExplosions.push(explosion); // track the explosion for updates
                scene.remove(candyAnim.body.mesh); // remove the original candy mesh
                animatingCandies.splice(i, 1); // remove from animation list since it's done
                break;

            case 'ribbons':
                // create falling ribbon particles that simulate confetti streamers
                if (!candyAnim.ribbons) {
                    // first time - create all the ribbon particles
                    candyAnim.ribbons = [];
                    const count = 15; // number of ribbon pieces to create
                    for (let j = 0; j < count; j++) {
                        // create thin rectangular geometry for each ribbon
                        const ribbonGeo = new THREE.BoxGeometry(0.02, 0.4, 0.02);
                        const ribbonMat = candyAnim.body.mesh.material.clone(); // match candy color
                        ribbonMat.transparent = true; // enable fading effects

                        const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
                        ribbon.position.copy(candyAnim.body.mesh.position); // start at candy position

                        // give each ribbon random movement properties
                        const velocity = new THREE.Vector3(
                            (Math.random() - 0.5) * 2, // random horizontal x movement
                            Math.random() * 2 + 1,     // upward initial y movement
                            (Math.random() - 0.5) * 2  // random horizontal z movement
                        );
                        ribbon.userData.velocity = velocity; // store movement speed
                        // random spinning motion for realistic ribbon flutter
                        ribbon.userData.angularVelocity = new THREE.Vector3(Math.random()*4-2, Math.random()*4-2, Math.random()*4-2);

                        candyAnim.ribbons.push(ribbon); // add to ribbon list
                        scene.add(ribbon); // add to 3d scene
                    }
                    scene.remove(candyAnim.body.mesh); // remove original candy mesh
                } else {
                    // update existing ribbons each frame - this is the particle physics
                    let allFaded = true;
                    candyAnim.ribbons.forEach(ribbon => {
                        // apply gravity to make ribbons fall down
                        ribbon.userData.velocity.y -= gravity * deltaTime;
                        // update ribbon position based on velocity
                        ribbon.position.add(ribbon.userData.velocity.clone().multiplyScalar(deltaTime));
                        
                        // apply spinning rotation for realistic flutter effect
                        ribbon.rotation.x += ribbon.userData.angularVelocity.x * deltaTime;
                        ribbon.rotation.y += ribbon.userData.angularVelocity.y * deltaTime;
                        ribbon.rotation.z += ribbon.userData.angularVelocity.z * deltaTime;

                        // gradually fade out the ribbons over time
                        if (ribbon.material.opacity > 0) {
                            ribbon.material.opacity -= deltaTime * 0.5; // fade speed
                            allFaded = false; // at least one ribbon is still visible
                        }
                    });

                    // clean up when all ribbons have faded or animation is too old
                    if (allFaded || candyAnim.lifetime > 3.0) {
                        candyAnim.ribbons.forEach(r => scene.remove(r)); // remove all ribbons from scene
                        animatingCandies.splice(i, 1); // remove from animation list
                    }
                }
                break;
        }
    }
}

// updates all particle explosions each frame - this handles the main particle physics
// this function processes the confetti-style particle explosions from candy collection
function updateExplosions(deltaTime, scene) {
    // process each active explosion (loop backwards for safe removal)
    for (let i = activeExplosions.length - 1; i >= 0; i--) {
        const explosion = activeExplosions[i];
        const particles = explosion.userData.particles; // individual particle data
        const positions = explosion.geometry.attributes.position.array; // particle positions in 3d space
        
        // track total explosion lifetime for fading effects
        explosion.userData.currentLifetime += deltaTime;
        const lifetimeRatio = explosion.userData.currentLifetime / explosion.userData.maxLifetime;

        let particlesAlive = 0; // count how many particles are still active
        
        // update each individual particle in the explosion
        for (let j = 0; j < particles.length; j++) {
            const particle = particles[j];
            
            particle.lifetime -= deltaTime; // countdown particle life
            if (particle.lifetime > 0) {
                // update particle position based on its velocity
                const index = j * 3; // index into position array (x,y,z per particle)
                positions[index] += particle.velocity.x * deltaTime;     // move in x direction
                positions[index + 1] += particle.velocity.y * deltaTime; // move in y direction
                positions[index + 2] += particle.velocity.z * deltaTime; // move in z direction
                
                // apply gravity to make particles fall down over time
                particle.velocity.y -= 2 * deltaTime; // gravity acceleration
                particlesAlive++; // count this particle as still alive
            }
        }
        
        // tell three.js to update the particle positions on the gpu
        explosion.geometry.attributes.position.needsUpdate = true;
        // fade out the entire explosion over time
        explosion.material.opacity = Math.max(0, 1 - lifetimeRatio * 2);

        // clean up explosion when all particles are dead or time is up
        if (particlesAlive === 0 || lifetimeRatio >= 1) {
            scene.remove(explosion); // remove from 3d scene
            activeExplosions.splice(i, 1); // remove from tracking list
        }
    }
}

// clears all running animations - used when restarting the game
function resetAnimations() {
    animatingPrizes = []; // clear prize animations
    animatingCandies = []; // clear candy particle animations
}

// export all animation functions for use in other game modules
export {
    createExplosion,                     // creates particle explosions for visual effects
    startPrizeAnimation,                 // begins prize disappearing animations
    updatePrizeAnimations,               // updates prize animation states each frame
    startCandyDisappearanceAnimation,    // starts candy particle effects when collected
    updateCandyAnimations,               // updates candy particle systems each frame
    updateExplosions,                    // updates particle explosion physics each frame
    resetAnimations                      // clears all animations when restarting game
};