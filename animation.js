import * as THREE from 'three';

let animatingPrizes = [];
let activeExplosions = [];
let animatingCandies = [];

function createExplosion(position, color = new THREE.Color(0xffdd00)) {
    const particleCount = 100;
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const particleData = [];

    for (let i = 0; i < particleCount; i++) {
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        ).normalize().multiplyScalar(Math.random() * 3 + 1);

        particleData.push({
            velocity: velocity,
            lifetime: Math.random() * 1.5 + 0.5
        });
    }

    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: color,
        size: 0.05,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const explosion = new THREE.Points(particles, material);
    explosion.position.copy(position);
    explosion.userData.particles = particleData;
    explosion.userData.maxLifetime = 2;
    explosion.userData.currentLifetime = 0;

    return explosion;
}

function startPrizeAnimation(prizeBody, clawTopBox) {
    prizeBody.isAnimating = true;
    animatingPrizes.push({
        body: prizeBody,
        state: 'moving_out'
    });
}

function updatePrizeAnimations(deltaTime, clawTopBox, scene, physicsEngine) {
    if (!clawTopBox) return;

    const moveSpeed = 0.5;
    const targetZ = clawTopBox.max.z + 0.5;

    animatingPrizes.forEach(prize => {
        const body = prize.body;
        const mesh = body.mesh;
        
        switch (prize.state) {
            case 'moving_out':
                body.position.z += moveSpeed * deltaTime;
                if (body.position.z >= targetZ) {
                    prize.state = 'choose_destruction';
                }
                break;
            
            case 'choose_destruction':
                const animations = ['explode', 'shrink', 'fly_up'];
                const choice = animations[Math.floor(Math.random() * animations.length)];

                if (choice === 'explode') {
                    const explosion = createExplosion(body.position, mesh.material.color);
                    scene.add(explosion);
                    activeExplosions.push(explosion);
                    scene.remove(mesh);
                    prize.state = 'disappeared'; 
                } else {
                    mesh.material.transparent = true; 
                    if (choice === 'shrinking') {
                        prize.state = 'shrinking';
                    } else {
                        prize.state = 'flying_up';
                    }
                }
                break;

            case 'shrinking':
                mesh.scale.multiplyScalar(1 - (deltaTime * 2.5)); 
                mesh.material.opacity -= deltaTime * 2;           

                if (mesh.scale.x < 0.001) {
                    scene.remove(mesh);
                    prize.state = 'disappeared';
                }
                break;

            case 'flying_up':
                body.position.y += deltaTime * 3.0;    
                mesh.material.opacity -= deltaTime * 1.5; 

                if (mesh.material.opacity <= 0) {
                    scene.remove(mesh);
                    prize.state = 'disappeared';
                }
                break;
        }
    });

    animatingPrizes = animatingPrizes.filter(p => p.state !== 'disappeared');
}

function startCandyDisappearanceAnimation(candyBody, physicsEngine) {
    physicsEngine.removeBody(candyBody);

    const animations = ['confetti', 'ribbons'];
    const choice = animations[Math.floor(Math.random() * animations.length)];

    animatingCandies.push({
        body: candyBody,
        state: choice,
        lifetime: 0,
    });
}

function updateCandyAnimations(deltaTime, scene) {
    const gravity = 3.0; 

    for (let i = animatingCandies.length - 1; i >= 0; i--) {
        const candyAnim = animatingCandies[i];
        candyAnim.lifetime += deltaTime;

        switch (candyAnim.state) {
            case 'confetti':
                const explosion = createExplosion(candyAnim.body.mesh.position, candyAnim.body.mesh.material.color);
                scene.add(explosion);
                activeExplosions.push(explosion);
                scene.remove(candyAnim.body.mesh);
                animatingCandies.splice(i, 1);
                break;

            case 'ribbons':
                if (!candyAnim.ribbons) {
                    candyAnim.ribbons = [];
                    const count = 15;
                    for (let j = 0; j < count; j++) {
                        const ribbonGeo = new THREE.BoxGeometry(0.02, 0.4, 0.02);
                        const ribbonMat = candyAnim.body.mesh.material.clone();
                        ribbonMat.transparent = true;

                        const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
                        ribbon.position.copy(candyAnim.body.mesh.position);

                        const velocity = new THREE.Vector3(
                            (Math.random() - 0.5) * 2,
                            Math.random() * 2 + 1,
                            (Math.random() - 0.5) * 2
                        );
                        ribbon.userData.velocity = velocity;
                        ribbon.userData.angularVelocity = new THREE.Vector3(Math.random()*4-2, Math.random()*4-2, Math.random()*4-2);

                        candyAnim.ribbons.push(ribbon);
                        scene.add(ribbon);
                    }
                    scene.remove(candyAnim.body.mesh);
                } else {
                    let allFaded = true;
                    candyAnim.ribbons.forEach(ribbon => {
                        ribbon.userData.velocity.y -= gravity * deltaTime;
                        ribbon.position.add(ribbon.userData.velocity.clone().multiplyScalar(deltaTime));
                        
                        ribbon.rotation.x += ribbon.userData.angularVelocity.x * deltaTime;
                        ribbon.rotation.y += ribbon.userData.angularVelocity.y * deltaTime;
                        ribbon.rotation.z += ribbon.userData.angularVelocity.z * deltaTime;

                        if (ribbon.material.opacity > 0) {
                            ribbon.material.opacity -= deltaTime * 0.5;
                            allFaded = false;
                        }
                    });

                    if (allFaded || candyAnim.lifetime > 3.0) {
                        candyAnim.ribbons.forEach(r => scene.remove(r));
                        animatingCandies.splice(i, 1);
                    }
                }
                break;
        }
    }
}

function updateExplosions(deltaTime, scene) {
    for (let i = activeExplosions.length - 1; i >= 0; i--) {
        const explosion = activeExplosions[i];
        const particles = explosion.userData.particles;
        const positions = explosion.geometry.attributes.position.array;
        
        explosion.userData.currentLifetime += deltaTime;
        const lifetimeRatio = explosion.userData.currentLifetime / explosion.userData.maxLifetime;

        let particlesAlive = 0;
        
        for (let j = 0; j < particles.length; j++) {
            const particle = particles[j];
            
            particle.lifetime -= deltaTime;
            if (particle.lifetime > 0) {
                const index = j * 3;
                positions[index] += particle.velocity.x * deltaTime;
                positions[index + 1] += particle.velocity.y * deltaTime;
                positions[index + 2] += particle.velocity.z * deltaTime;
                
                particle.velocity.y -= 2 * deltaTime;
                particlesAlive++;
            }
        }
        
        explosion.geometry.attributes.position.needsUpdate = true;
        explosion.material.opacity = Math.max(0, 1 - lifetimeRatio * 2);

        if (particlesAlive === 0 || lifetimeRatio >= 1) {
            scene.remove(explosion);
            activeExplosions.splice(i, 1);
        }
    }
}

function resetAnimations() {
    animatingPrizes = [];
    animatingCandies = [];
}

export {
    createExplosion,
    startPrizeAnimation,
    updatePrizeAnimations,
    startCandyDisappearanceAnimation,
    updateCandyAnimations,
    updateExplosions,
    resetAnimations
};