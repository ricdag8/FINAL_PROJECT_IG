import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class HomepageManager {
    constructor(playerController, cameraManager, onCharacterSelectedCallback, audioManager) {
        this.playerController = playerController;
        this.cameraManager = cameraManager;
        this.onCharacterSelectedCallback = onCharacterSelectedCallback;
        this.audioManager = audioManager;

        this.selectionScreenElement = document.getElementById('characterSelectionScreen');
        
        this.selectionScene = new THREE.Scene();
        this.selectionScene.background = new THREE.Color(0x10101a);
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.selectionCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
        this.selectionCamera.position.set(0, 1.5, 5);

        this._setupLighting();

        this.characterModels = []; // Now stores { model, mixer, animations, name }
        this.selectedCharacterIndex = -1;
        this.characterDefs = [
            
            { name: "Hoodie", url: 'glbmodels/Hoodie Character.glb', position: new THREE.Vector3(-2.8, 0.2, 0) },
            { name: "Businessman", url: 'glbmodels/Business Man.glb', position: new THREE.Vector3(0, 0.2, 0) },
            { name: "Worker", url: 'glbmodels/Worker.glb', position: new THREE.Vector3(2.8, 0.2, 0) },
        ];
        
        this.isActive = false;
        this.isDragging = false;
        this.previousMouseX = 0.0;

        this._loadCharacterModels();

        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
    }

    _setupLighting() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.selectionScene.add(ambient);

        const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
        keyLight.position.set(2, 2, 3);
        this.selectionScene.add(keyLight);
        
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
        fillLight.position.set(-2, 1, 3);
        this.selectionScene.add(fillLight);
    }

    _loadCharacterModels() {
        const loader = new GLTFLoader();
        this.characterDefs.forEach((def, index) => {
            loader.load(def.url, (gltf) => {
                const model = gltf.scene;
                model.scale.setScalar(1.2); // 🆕 Resi leggermente più piccoli
                model.position.copy(def.position);
                model.userData.index = index;
                
                const mixer = new THREE.AnimationMixer(model);
                const animations = {};
                gltf.animations.forEach(clip => {
                    let cleanName = clip.name.toLowerCase();
                    if (cleanName.includes('|')) {
                        cleanName = cleanName.split('|')[1];
                    }
                    animations[cleanName] = mixer.clipAction(clip);
                });

                this.selectionScene.add(model);
                this.characterModels.push({ model, mixer, animations, name: def.name });

                // Select the middle character by default
                if (index === 1) {
                    this._selectCharacter(1);
                }
            });
        });
    }

    showCharacterSelection() {
        this.isActive = true;
        this.selectionScreenElement.style.display = 'flex';

        document.getElementById('startGameBtn').onclick = () => this._startGame();
        
        this.selectionScreenElement.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
        window.addEventListener('mousemove', this._onMouseMove);
    }
    
    _selectCharacter(index) {
        // Do nothing if the character is already selected or invalid
        if (this.selectedCharacterIndex === index || index < 0 || index >= this.characterModels.length) {
            return;
        }

        // Deselect the previously selected character
        if (this.selectedCharacterIndex !== -1 && this.characterModels[this.selectedCharacterIndex]) {
            this.characterModels[this.selectedCharacterIndex].model.scale.setScalar(1.2); // 🆕 Scalato a 1.8
        }

        // Select the new character
        this.selectedCharacterIndex = index;

        if (this.characterModels[this.selectedCharacterIndex]) {
            const selectedModelData = this.characterModels[this.selectedCharacterIndex];
            selectedModelData.model.scale.setScalar(1.5); // 🆕 Scalato a 2.0
            selectedModelData.model.rotation.y = 0;
        }
    }

    _playGreeting(index) {
        const charData = this.characterModels[index];
        if (!charData || !charData.animations.wave) return;

        const soundName = `${charData.name}_wave`;
        if (this.audioManager) {
            this.audioManager.playSound(soundName);
        }

        const waveAction = charData.animations.wave;
        waveAction.reset().setLoop(THREE.LoopOnce, 1).play();
    }

    _onMouseDown(event) {
        if (event.target.tagName === 'BUTTON') {
            return;
        }

        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.selectionCamera);

        const modelsToIntersect = this.characterModels.map(charData => charData.model);
        const intersects = this.raycaster.intersectObjects(modelsToIntersect, true);

        if (intersects.length > 0) {
            let selectedObject = intersects[0].object;
            while (selectedObject.parent && selectedObject.userData.index === undefined) {
                selectedObject = selectedObject.parent;
            }
            if (selectedObject.userData.index !== undefined) {
                // Select the character and THEN play the greeting for the clicked character
                this._selectCharacter(selectedObject.userData.index);
                this._playGreeting(selectedObject.userData.index);
            }
        }
        
        this.isDragging = true;
        this.previousMouseX = event.clientX;
    }

    _onMouseUp() {
        this.isDragging = false;
    }

    _onMouseMove(event) {
        if (!this.isDragging || this.selectedCharacterIndex === -1 || !this.characterModels[this.selectedCharacterIndex]) {
            return;
        }

        const deltaX = event.clientX - this.previousMouseX;
        this.previousMouseX = event.clientX;

        const model = this.characterModels[this.selectedCharacterIndex].model;
        const rotationAmount = deltaX * 0.02;
        model.rotation.y += rotationAmount;
    }

    _startGame() {
        if (this.selectedCharacterIndex === -1) {
            alert("Please select a character first!");
            return;
        }
        
        this.isActive = false;
        this.selectionScreenElement.style.display = 'none';

        this.selectionScreenElement.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('mouseup', this._onMouseUp);
        window.removeEventListener('mousemove', this._onMouseMove);

        const selectedDef = this.characterDefs[this.selectedCharacterIndex];
        const selectedCharacterUrl = selectedDef.url;
        const selectedCharacterName = selectedDef.name;

        this.playerController.loadCharacter(selectedCharacterUrl, selectedCharacterName)
            .then(() => {
                this.onCharacterSelectedCallback();
            })
            .catch(err => {
                this.onCharacterSelectedCallback();
            });
    }
    
    update(deltaTime) {
        if (!this.isActive) return;

        this.characterModels.forEach((charData, index) => {
            charData.mixer.update(deltaTime);
            if (index !== this.selectedCharacterIndex) {
                charData.model.rotation.y += deltaTime * 0.2;
            }
        });
    }

    onWindowResize() {
        this.selectionCamera.aspect = window.innerWidth / window.innerHeight;
        this.selectionCamera.updateProjectionMatrix();
    }
} 