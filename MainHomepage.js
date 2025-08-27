// MainHomepage.js - Main homepage management for the arcade game
export class MainHomepage {
    constructor(onEnterArcade) {
        this.onEnterArcade = onEnterArcade;
        this.homepageElement = null;
        
        // Machine image paths - modify these to change the images
        this.machineImages = {
            claw: 'images/claw-machine.jpg',
            candy: 'images/candy-machine.jpg',
            popcorn: 'images/popcorn-machine.jpg'
        };
        
        this.isVisible = false;
        this.animationTimeout = null;
    }

    show() {
        this.homepageElement = document.getElementById('mainHomepage');
        if (!this.homepageElement) {
            console.error('Homepage element not found!');
            return;
        }

        this.homepageElement.style.display = 'flex';
        this.isVisible = true;
        
        // Setup all homepage interactions
        this.setupInteractions();
        this.setupAnimations();
        this.loadMachineImages();
    }

    hide() {
        if (this.homepageElement) {
            this.homepageElement.style.display = 'none';
            this.isVisible = false;
        }
        
        if (this.animationTimeout) {
            clearTimeout(this.animationTimeout);
        }
    }

    setupInteractions() {
        // Enter arcade button
        const enterBtn = document.getElementById('enterArcadeBtn');
        if (enterBtn) {
            enterBtn.addEventListener('click', () => {
                this.hide();
                if (this.onEnterArcade) {
                    this.onEnterArcade();
                }
            });
        }
    }

    loadMachineImages() {
        // Set image sources from predefined paths
        const clawImg = document.getElementById('clawMachineImg');
        const candyImg = document.getElementById('candyMachineImg');
        const popcornImg = document.getElementById('popcornMachineImg');

        if (clawImg) {
            clawImg.src = this.machineImages.claw;
            clawImg.onerror = () => {
                console.warn(`Could not load claw machine image: ${this.machineImages.claw}`);
                this.showImagePlaceholder(clawImg, '🦾', 'Claw Machine');
            };
        }

        if (candyImg) {
            candyImg.src = this.machineImages.candy;
            candyImg.onerror = () => {
                console.warn(`Could not load candy machine image: ${this.machineImages.candy}`);
                this.showImagePlaceholder(candyImg, '🍭', 'Candy Machine');
            };
        }

        if (popcornImg) {
            popcornImg.src = this.machineImages.popcorn;
            popcornImg.onerror = () => {
                console.warn(`Could not load popcorn machine image: ${this.machineImages.popcorn}`);
                this.showImagePlaceholder(popcornImg, '🍿', 'Popcorn Machine');
            };
        }
    }

    showImagePlaceholder(imgElement, emoji, machineName) {
        // Create a fallback placeholder if image fails to load
        const placeholder = document.createElement('div');
        placeholder.className = 'image-placeholder';
        placeholder.innerHTML = `
            <div style="
                width: 200px;
                height: 150px;
                background: rgba(255, 255, 255, 0.1);
                border: 3px solid rgba(255, 255, 255, 0.4);
                border-radius: 15px;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                color: rgba(255, 255, 255, 0.8);
                font-size: 14px;
                text-align: center;
                line-height: 1.4;
            ">
                <div style="font-size: 3em; margin-bottom: 10px;">${emoji}</div>
                <div>${machineName}</div>
                <div style="font-size: 12px; opacity: 0.7; margin-top: 5px;">Image not found</div>
            </div>
        `;
        
        imgElement.parentNode.replaceChild(placeholder, imgElement);
    }

    setupAnimations() {
        // Add floating animation to machine cards
        const cards = document.querySelectorAll('.machine-card');
        cards.forEach((card, index) => {
            card.style.animationDelay = `${index * 0.2}s`;
            
            
        });

        // Add particle effect to the title
        this.addTitleParticles();
    }

    addTitleParticles() {
        // adding floating emoji particles around the title
        const title = document.querySelector('.homepage-title');
        if (!title) return;

        const particles = ['✨', '🎮', '🕹️', '⭐', '🎉', '💫'];
        
        setInterval(() => {
            if (!this.isVisible) return;
            
            const particle = document.createElement('div');
            particle.textContent = particles[Math.floor(Math.random() * particles.length)];
            particle.style.cssText = `
                position: absolute;
                font-size: 1.5em;
                pointer-events: none;
                z-index: -1;
                top: ${Math.random() * 100}%;
                left: ${Math.random() * 100}%;
                animation: floatAway 3s ease-out forwards;
                opacity: 0.8;
            `;
            
            title.appendChild(particle);
            
            setTimeout(() => {
                if (particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            }, 3000);
        }, 2000);
    }

    // Method to programmatically change machine images
    setMachineImage(machineType, imagePath) {
        if (this.machineImages[machineType] === undefined) {

            return;
        }

        this.machineImages[machineType] = imagePath;
        
        // Update the image if homepage is currently visible
        if (this.isVisible) {
            const imgElement = document.getElementById(`${machineType}MachineImg`);
            if (imgElement) {
                imgElement.src = imagePath;
            }
        }
        

    }

    // Method to get current image paths
    getMachineImages() {
        return { ...this.machineImages };
    }

    // Add CSS animation for floating particles
    static addFloatingAnimation() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes floatAway {
                0% {
                    opacity: 0.8;
                    transform: translateY(0) scale(1);
                }
                50% {
                    opacity: 1;
                    transform: translateY(-20px) scale(1.2);
                }
                100% {
                    opacity: 0;
                    transform: translateY(-40px) scale(0.8);
                }
            }
        `;
        document.head.appendChild(style);
    }
}


MainHomepage.addFloatingAnimation();