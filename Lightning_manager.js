import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class LightingManager {
    constructor() {
        this.scene = null;
        this.machineOffset = null;
        this.candyMachineOffset = null;
        this.time = 0; // For animations
        
        this.lightReferences = {
            ambientLight: null,
            clawSpotlight: null,
            candySpotlight: null,
            sideLight1: null,
            sideLight2: null,
            centerLight: null,
            ceilingLeds: [],
            wallWashers: [],
            ceilingGrid: [],
            clawSupports: [],
            candySupports: [],
            ledStrips: [],
            paintingSpotlights: [] // 🆕 Aggiungi questo
        };
        
        // 🆕 LED Speed control
        this.ledSpeed = 1.0;
        
        this.roomMaterials = null;
        this.presets = {};

        this.definePresets();
        
    }
    
    update(deltaTime) {
        this.time += deltaTime;
        
        this.lightReferences.ledStrips.forEach((led, index) => {
            const hue = (this.time * 0.2 * this.ledSpeed + index * 0.02) % 1.0;
            const saturation = 1.0;
            const lightness = 0.5;
            
            led.material.color.setHSL(hue, saturation, lightness);
            led.material.emissive.setHSL(hue, saturation, lightness);
        });
    }
    
    initialize(scene, machineOffset, candyMachineOffset) {
        this.scene = scene;
        this.machineOffset = machineOffset;
        this.candyMachineOffset = candyMachineOffset;
        
    }
    
    addPaintingLights(lights) {
        this.lightReferences.paintingSpotlights = lights;
    }
    
    setRoomMaterials(materials) {
        this.roomMaterials = materials;
    }

    definePresets() {
        this.presets = {
            arcade: {
                ambient: { color: '#ffffff', intensity: 0.2 },
                claw: { color: '#ff0044', intensity: 2.5 },
                candy: { color: '#0044ff', intensity: 2.5 },
                side: { color: '#44ff00', intensity: 1.8 },
                center: { color: '#ffffff', intensity: 5 }, // 🆕 Era 1.2, ora 2.5
                paintings: { color: '#ffffff', intensity: 1.5 },
                room: { 
                    wall: 0x2c3e50,
                    floor: 0x34495e,
                    ceiling: 0x111111
                }
            },
            neon: {
                ambient: { color: '#440066', intensity: 0.15 }, // Violetto
                claw: { color: '#ff00ff', intensity: 3.0 },
                candy: { color: '#00ffff', intensity: 3.0 },
                side: { color: '#ffff00', intensity: 2.5 },
                center: { color: '#ff8000', intensity: 3.5 }, // 🆕 Era 2.0, ora 3.5
                paintings: { color: '#aaffff', intensity: 2.0 }, // 🆕
                room: {
                    wall: 0x1a1a2e,
                    floor: 0x222222,
                    ceiling: 0x000000
                }
            },
            warm: {
                ambient: { color: '#fff8dc', intensity: 0.2 },
                claw: { color: '#ff8000', intensity: 2.5 },
                candy: { color: '#ffaa00', intensity: 2.5 },
                side: { color: '#ff6600', intensity: 2.0 },
                center: { color: '#ffffaa', intensity: 1.5 },
                paintings: { color: '#fff8e1', intensity: 1.8 }, // 🆕
                room: {
                    wall: 0x5d4037,
                    floor: 0x4e342e,
                    ceiling: 0x3e2723
                }
            },
            cool: {
                ambient: { color: '#f0f8ff', intensity: 0.15 },
                claw: { color: '#0088ff', intensity: 2.2 },
                candy: { color: '#00aaff', intensity: 2.2 },
                side: { color: '#00ffaa', intensity: 1.8 },
                center: { color: '#aaffff', intensity: 1.2 },
                paintings: { color: '#e0f7fa', intensity: 1.8 }, // 🆕
                room: {
                    wall: 0x37474f,
                    floor: 0x263238,
                    ceiling: 0x212121
                }
            },
            dark: {
                ambient: { color: '#87CEEB', intensity: 0.05 }, // Azzurro
                claw: { color: '#ff0000', intensity: 4.0 },
                candy: { color: '#0000ff', intensity: 4.0 },
                side: { color: '#00ff00', intensity: 3.0 },
                center: { color: '#ffffff', intensity: 0.3 },
                paintings: { color: '#ffffff', intensity: 2.5 }, // 🆕
                room: { 
                    wall: 0x101010,
                    floor: 0x050505,
                    ceiling: 0x000000
                }
            }
        };
    }

    applyLightPreset(presetName) {
        const preset = this.presets[presetName];
        if (!preset) {
            return;
        }
        

        Object.keys(preset).forEach(type => {
            if (type === 'room') return;
            
            const { color, intensity } = preset[type];
            this.updateLightColor(type, color);
            this.updateLightIntensity(type, intensity);
            this.updateUIForPreset(type, color, intensity);
        });
        
        const ambientToggle = document.getElementById('ambientLightToggle');
        if (ambientToggle) {
            ambientToggle.checked = preset.ambient.intensity > 0;
            if (this.lightReferences.ambientLight) {
                this.lightReferences.ambientLight.visible = preset.ambient.intensity > 0;
            }
        }
        
        if (preset.room && this.roomMaterials) {
            const { wall, floor, ceiling } = this.roomMaterials;
            if (wall) wall.color.setHex(preset.room.wall);
            if (floor) floor.color.setHex(preset.room.floor);
            if (ceiling) ceiling.color.setHex(preset.room.ceiling);
        }
    }
    
    setupLighting() {
        if (!this.scene) {
            return;
        }
        
        this.lightReferences.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(this.lightReferences.ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(-50, 40, 40);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        
        const shadowAreaSize = 60;
        directionalLight.shadow.camera.left = -shadowAreaSize;
        directionalLight.shadow.camera.right = shadowAreaSize;
        directionalLight.shadow.camera.top = shadowAreaSize;
        directionalLight.shadow.camera.bottom = -shadowAreaSize;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 200;
        
        this.scene.add(directionalLight);
        
        this.lightReferences.clawSpotlight = new THREE.SpotLight(0xff4444, 3.5, 20, Math.PI / 2, 0.8);
        this.lightReferences.clawSpotlight.position.set(this.machineOffset.x, 7, this.machineOffset.z + 3);
        this.lightReferences.clawSpotlight.target.position.set(this.machineOffset.x, 0, this.machineOffset.z);
        this.lightReferences.clawSpotlight.castShadow = true;
        this.scene.add(this.lightReferences.clawSpotlight);
        this.scene.add(this.lightReferences.clawSpotlight.target);
        
        const clawSupport1 = new THREE.PointLight(0xff4444, 1.5, 12);
        clawSupport1.position.set(this.machineOffset.x + 3, 5, this.machineOffset.z - 2);
        this.scene.add(clawSupport1);
        
        const clawSupport2 = new THREE.PointLight(0xff4444, 1.5, 12);
        clawSupport2.position.set(this.machineOffset.x - 3, 5, this.machineOffset.z + 2);
        this.scene.add(clawSupport2);
        
        this.lightReferences.candySpotlight = new THREE.SpotLight(0x4444ff, 3.5, 20, Math.PI / 2, 0.8);
        this.lightReferences.candySpotlight.position.set(this.candyMachineOffset.x, 7, this.candyMachineOffset.z + 3);
        this.lightReferences.candySpotlight.target.position.set(this.candyMachineOffset.x, 0, this.candyMachineOffset.z);
        this.lightReferences.candySpotlight.castShadow = true;
        this.scene.add(this.lightReferences.candySpotlight);
        this.scene.add(this.lightReferences.candySpotlight.target);
        
        const candySupport1 = new THREE.PointLight(0x4444ff, 1.5, 12);
        candySupport1.position.set(this.candyMachineOffset.x + 3, 5, this.candyMachineOffset.z - 2);
        this.scene.add(candySupport1);
        
        const candySupport2 = new THREE.PointLight(0x4444ff, 1.5, 12);
        candySupport2.position.set(this.candyMachineOffset.x - 3, 5, this.candyMachineOffset.z + 2);
        this.scene.add(candySupport2);
        
        this.lightReferences.wallWashers = [];
        
        for (let i = 0; i < 4; i++) {
            const wallWasher = new THREE.SpotLight(0x44ff44, 2.5, 15, Math.PI / 3, 0.9);
            wallWasher.position.set(-8, 6, -6 + i * 4);
            wallWasher.target.position.set(-10, 2, -6 + i * 4);
            this.scene.add(wallWasher);
            this.scene.add(wallWasher.target);
            this.lightReferences.wallWashers.push(wallWasher);
            
            const wallWasher2 = new THREE.SpotLight(0x44ff44, 2.5, 15, Math.PI / 3, 0.9);
            wallWasher2.position.set(8, 6, -6 + i * 4);
            wallWasher2.target.position.set(10, 2, -6 + i * 4);
            this.scene.add(wallWasher2);
            this.scene.add(wallWasher2.target);
            this.lightReferences.wallWashers.push(wallWasher2);
        }
        
        for (let i = 0; i < 5; i++) {
            const backWallWasher = new THREE.SpotLight(0x44ff44, 2.0, 12, Math.PI / 4, 0.8);
            backWallWasher.position.set(-8 + i * 4, 6, -6);
            backWallWasher.target.position.set(-8 + i * 4, 2, -8);
            this.scene.add(backWallWasher);
            this.scene.add(backWallWasher.target);
            this.lightReferences.wallWashers.push(backWallWasher);
        }
        
        this.setupCeilingLights();
        
        // 🆕 AGGIUNGI LUCE DIRETTA DAL SOFFITTO
        const ceilingDirectionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        ceilingDirectionalLight.position.set(0, 10, 0);
        ceilingDirectionalLight.target.position.set(0, 0, 0);
        ceilingDirectionalLight.castShadow = true;
        this.scene.add(ceilingDirectionalLight);
        this.scene.add(ceilingDirectionalLight.target);
        
        this.lightReferences.clawSupports = [clawSupport1, clawSupport2];
        this.lightReferences.candySupports = [candySupport1, candySupport2];
        
        this.createLedPaths();
        this.createWallLeds();
        
    }

    setupCeilingLights() {
        const loader = new GLTFLoader();
        loader.load('glbmodels/led_light.glb', (gltf) => {
            const ledTemplate = gltf.scene;

            //  AGGIUNGI PIÙ POSIZIONI PER LE LUCI
            const positions = [
                new THREE.Vector3(0, 7, 0),
                new THREE.Vector3(-6, 7, 0),
                new THREE.Vector3(6, 7, 0),
                new THREE.Vector3(-3, 7, 0), // 🆕 Nuova posizione
                new THREE.Vector3(3, 7, 0),  // 🆕 Nuova posizione
                new THREE.Vector3(0, 7, -3), // 🆕 Nuova posizione
                new THREE.Vector3(0, 7, 3)   // 🆕 Nuova posizione
            ];

            positions.forEach(pos => {
                const ledModel = ledTemplate.clone(true);
                ledModel.position.copy(pos);
                ledModel.scale.set(2, 2, 2);
                this.scene.add(ledModel);

                const light1Mesh = ledModel.getObjectByName('light1');
                const light2Mesh = ledModel.getObjectByName('light2');
                
                const createLight = (mesh) => {
                    if (!mesh) return null;
                    
                    mesh.material = new THREE.MeshStandardMaterial({
                        emissive: 0xffffff,
                        emissiveIntensity: 0.0,
                    });

                    const pointLight = new THREE.PointLight(0xffffff, 10.0, 20); // Era 6.0, ora 10.0
                    pointLight.position.copy(mesh.position);
                    ledModel.add(pointLight);

                    this.lightReferences.ceilingLeds.push({ light: pointLight, mesh: mesh });
                    return pointLight;
                };

                createLight(light1Mesh);
                createLight(light2Mesh);
            });
            

        }, undefined, (error) => {
            console.error("❌ Failed to load glbmodels/led_light.glb for ceiling", error);
        });
    }

    createLedPaths() {
        const ledSize = 0.15;
        const ledSpacing = 0.2;
        const yPos = 0.02;

        const ledGeometry = new THREE.PlaneGeometry(ledSize, ledSize);
        ledGeometry.rotateX(-Math.PI / 2);

        const startPoint = new THREE.Vector3(0, yPos, 3.5);

        const paths = [
            { from: startPoint, to: new THREE.Vector3(this.machineOffset.x, yPos, startPoint.z) },
            { from: new THREE.Vector3(this.machineOffset.x, yPos, startPoint.z), to: new THREE.Vector3(this.machineOffset.x, yPos, this.machineOffset.z + 2.0) }
        ];

        if (this.candyMachineOffset) {
            paths.push(
                { from: startPoint, to: new THREE.Vector3(this.candyMachineOffset.x, yPos, startPoint.z) },
                { from: new THREE.Vector3(this.candyMachineOffset.x, yPos, startPoint.z), to: new THREE.Vector3(this.candyMachineOffset.x, yPos, this.candyMachineOffset.z + 2.0) }
            );
        }

        paths.forEach(path => {
            const direction = new THREE.Vector3().subVectors(path.to, path.from);
            const length = direction.length();
            direction.normalize();

            const ledCount = Math.floor(length / ledSpacing);

            for (let i = 0; i <= ledCount; i++) {
                const led = new THREE.Mesh(
                    ledGeometry,
                    new THREE.MeshStandardMaterial({
                        emissive: 0xffffff,
                        emissiveIntensity: 1.5,
                    })
                );

                const position = path.from.clone().add(direction.clone().multiplyScalar(i * ledSpacing));
                led.position.copy(position);
                
                this.scene.add(led);
                this.lightReferences.ledStrips.push(led);
            }
        });
    }

    createWallLeds() {
        const roomSize = { width: 40, height: 8, depth: 20 };
        const ledSize = 0.15;
        const ledSpacing = 0.4;
        const wallOffset = 0.02;

        const waveAmplitude = 0.6;
        const waveFrequency = 0.5;

        const createLed = (geometry, position) => {
            const led = new THREE.Mesh(
                geometry,
                new THREE.MeshStandardMaterial({
                    emissive: 0xffffff,
                    emissiveIntensity: 0.4,
                    side: THREE.DoubleSide
                })
            );

            led.position.copy(position);
            this.scene.add(led);
            this.lightReferences.ledStrips.push(led);
        };

        const geoZ = new THREE.PlaneGeometry(ledSize, ledSize);
        const geoX = new THREE.PlaneGeometry(ledSize, ledSize);
        geoX.rotateY(Math.PI / 2);

        for (let yBase = 2.0; yBase < roomSize.height; yBase += 2.0) {
            for (let x = -roomSize.width / 2 + 1; x < roomSize.width / 2 - 1; x += ledSpacing) {
                const yOffset = Math.sin(x * waveFrequency) * waveAmplitude;
                const currentY = yBase + yOffset;
                createLed(geoZ, new THREE.Vector3(x, currentY, -roomSize.depth / 2 + wallOffset));
                createLed(geoZ, new THREE.Vector3(x, yBase - yOffset, roomSize.depth / 2 - wallOffset));
            }

            for (let z = -roomSize.depth / 2 + 1; z < roomSize.depth / 2 - 1; z += ledSpacing) {
                const yOffset = Math.sin(z * waveFrequency) * waveAmplitude;
                const currentY = yBase + yOffset;
                createLed(geoX, new THREE.Vector3(-roomSize.width / 2 + wallOffset, currentY, z));
                createLed(geoX, new THREE.Vector3(roomSize.width / 2 - wallOffset, yBase - yOffset, z));
            }
        }
        
    }
    
    setupLightControls() {
        const toggleButton = document.getElementById('toggleLightControls');
        const lightControls = document.getElementById('lightControls');
        
        if (!toggleButton || !lightControls) {
            console.warn("⚠️ Light control UI elements not found");
            return;
        }
        
        toggleButton.addEventListener('click', () => {
            lightControls.style.display = lightControls.style.display === 'none' ? 'block' : 'none';
        });
        
        this.setupAmbientLightControls();
        this.setupColorControls();
        this.setupIntensityControls();
        this.setupLedSpeedControls();
        this.setupWallColorControls();
        this.setupFloorColorControls();
        
    }
    
    setupAmbientLightControls() {
        const ambientColorInput = document.getElementById('ambientLightColor');
        const ambientIntensityInput = document.getElementById('ambientLightIntensity');
        const ambientToggle = document.getElementById('ambientLightToggle');
        
        if (ambientColorInput) {
            ambientColorInput.addEventListener('input', (e) => {
                this.updateLightColor('ambient', e.target.value);
                this.updatePreview('ambientLightPreview', e.target.value);
            });
        }
        
        if (ambientIntensityInput) {
            ambientIntensityInput.addEventListener('input', (e) => {
                this.updateLightIntensity('ambient', parseFloat(e.target.value));
                const valueElement = document.getElementById('ambientIntensityValue');
                if (valueElement) valueElement.textContent = e.target.value;
            });
        }
        
        if (ambientToggle) {
            ambientToggle.addEventListener('change', (e) => {
                if (this.lightReferences.ambientLight) {
                    this.lightReferences.ambientLight.visible = e.target.checked;
                }
            });
        }
    }
    
    setupColorControls() {
        const colorControls = [
            { id: 'clawLightColor', type: 'claw', preview: 'clawLightPreview' },
            { id: 'candyLightColor', type: 'candy', preview: 'candyLightPreview' },
            { id: 'sideLightColor', type: 'side', preview: 'sideLightPreview' },
            { id: 'centerLightColor', type: 'center', preview: 'centerLightPreview' },
            { id: 'paintingsLightColor', type: 'paintings', preview: 'paintingsLightPreview' } // 🆕
        ];
        
        colorControls.forEach(control => {
            const element = document.getElementById(control.id);
            if (element) {
                element.addEventListener('input', (e) => {
                    this.updateLightColor(control.type, e.target.value);
                    this.updatePreview(control.preview, e.target.value);
                });
            }
        });
    }
    
    setupIntensityControls() {
        const intensityControls = [
            { id: 'clawLightIntensity', type: 'claw', valueId: 'clawIntensityValue' },
            { id: 'candyLightIntensity', type: 'candy', valueId: 'candyIntensityValue' },
            { id: 'sideLightIntensity', type: 'side', valueId: 'sideIntensityValue' },
            { id: 'centerLightIntensity', type: 'center', valueId: 'centerIntensityValue' },
            { id: 'paintingsLightIntensity', type: 'paintings', valueId: 'paintingsIntensityValue' } // 🆕
        ];
        
        intensityControls.forEach(control => {
            const element = document.getElementById(control.id);
            if (element) {
                element.addEventListener('input', (e) => {
                    this.updateLightIntensity(control.type, parseFloat(e.target.value));
                    const valueElement = document.getElementById(control.valueId);
                    if (valueElement) valueElement.textContent = e.target.value;
                });
            }
        });
    }
    
    setupLedSpeedControls() {
        const ledSpeedControl = document.getElementById('ledSpeedControl');
        const ledSpeedValue = document.getElementById('ledSpeedValue');
        
        if (ledSpeedControl) {
            ledSpeedControl.addEventListener('input', (e) => {
                this.ledSpeed = parseFloat(e.target.value);
                if (ledSpeedValue) {
                    ledSpeedValue.textContent = e.target.value;
                }
            });
        }
    }
    
    setupWallColorControls() {
        const wallColorPicker = document.getElementById('wallColorPicker');
        
        if (wallColorPicker) {
            wallColorPicker.addEventListener('input', (e) => {
                const color = e.target.value;
                if (window.updateWallColor) {
                    window.updateWallColor(color);
                }
            });
        }
    }
    
    setupFloorColorControls() {
        const floorColorPicker = document.getElementById('floorColorPicker');
        
        if (floorColorPicker) {
            floorColorPicker.addEventListener('input', (e) => {
                const color = e.target.value;
                if (window.updateFloorColor) {
                    window.updateFloorColor(color);
                }
            });
        }
    }
    
    updatePreview(previewId, color) {
        const preview = document.getElementById(previewId);
        if (preview) {
            preview.style.backgroundColor = color;
        }
    }
    
    updateLightColor(lightType, colorHex) {
        const color = new THREE.Color(colorHex);
        
        switch(lightType) {
            case 'ambient':
                if (this.lightReferences.ambientLight) this.lightReferences.ambientLight.color.copy(color);
                break;
            case 'claw':
                if (this.lightReferences.clawSpotlight) this.lightReferences.clawSpotlight.color.copy(color);
                if (this.lightReferences.clawSupports) this.lightReferences.clawSupports.forEach(light => light.color.copy(color));
                break;
            case 'candy':
                if (this.lightReferences.candySpotlight) this.lightReferences.candySpotlight.color.copy(color);
                if (this.lightReferences.candySupports) this.lightReferences.candySupports.forEach(light => light.color.copy(color));
                break;
            case 'side':
                if (this.lightReferences.wallWashers) this.lightReferences.wallWashers.forEach(light => light.color.copy(color));
                break;
            case 'center':
                this.lightReferences.ceilingLeds.forEach(led => {
                    led.light.color.copy(color);
                    if (led.mesh) led.mesh.material.emissive.copy(color);
                });
                break;
            case 'paintings': // 🆕
                if (this.lightReferences.paintingSpotlights) {
                    this.lightReferences.paintingSpotlights.forEach(light => light.color.copy(color));
                }
                break;
        }
    }
    
    updateLightIntensity(lightType, intensity) {
        switch(lightType) {
            case 'ambient':
                if (this.lightReferences.ambientLight) this.lightReferences.ambientLight.intensity = intensity;
                break;
            case 'claw':
                if (this.lightReferences.clawSpotlight) this.lightReferences.clawSpotlight.intensity = intensity * 2;
                if (this.lightReferences.clawSupports) this.lightReferences.clawSupports.forEach(light => light.intensity = intensity);
                break;
            case 'candy':
                if (this.lightReferences.candySpotlight) this.lightReferences.candySpotlight.intensity = intensity * 2;
                if (this.lightReferences.candySupports) this.lightReferences.candySupports.forEach(light => light.intensity = intensity);
                break;
            case 'side':
                if (this.lightReferences.wallWashers) this.lightReferences.wallWashers.forEach(light => light.intensity = intensity * 1.5);
                break;
            case 'center':
                this.lightReferences.ceilingLeds.forEach(led => {
                    led.light.intensity = intensity * 0.8;
                    if (led.mesh) led.mesh.material.emissiveIntensity = intensity;
                });
                break;
            case 'paintings': // 🆕
                if (this.lightReferences.paintingSpotlights) {
                    this.lightReferences.paintingSpotlights.forEach(light => light.intensity = intensity);
                }
                break;
        }
    }
    
    updateUIForPreset(lightType, color, intensity) {
        const colorInput = document.getElementById(`${lightType}LightColor`);
        const intensityInput = document.getElementById(`${lightType}LightIntensity`);
        const intensityValue = document.getElementById(`${lightType}IntensityValue`);
        const preview = document.getElementById(`${lightType}LightPreview`);
        
        if (colorInput) colorInput.value = color;
        if (intensityInput) intensityInput.value = intensity;
        if (intensityValue) intensityValue.textContent = intensity;
        if (preview) preview.style.backgroundColor = color;
    }
    
    setupShadows(renderer) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    
    setLedSpeed(speed) {
        this.ledSpeed = speed;
        const ledSpeedValue = document.getElementById('ledSpeedValue');
        const ledSpeedControl = document.getElementById('ledSpeedControl');
        
        if (ledSpeedValue) ledSpeedValue.textContent = speed.toFixed(1);
        if (ledSpeedControl) ledSpeedControl.value = speed;
    }
    
    getLightReferences() {
        return this.lightReferences;
    }
} 

/* 
constructor()

Inizializza lo stato interno: riferimenti alla scena e agli offset delle macchine, tempo per animazioni, raccolta di riferimenti alle varie luci (lightReferences), velocità animazione LED, materiali stanza e mappa dei preset.

Chiama definePresets() per costruire i profili di illuminazione predefiniti.

update(deltaTime)

Avanza il tempo (this.time += deltaTime) e anima i LED contenuti in lightReferences.ledStrips variando l’hue in HSL in base al tempo, alla velocità (ledSpeed) e all’indice di ciascun LED.

Aggiorna sia material.color che material.emissive, dando l’effetto di strisce LED che scorrono/cambiano colore continuamente.

initialize(scene, machineOffset, candyMachineOffset)

Registra i riferimenti fondamentali: la scene Three.js e le posizioni (offset) di due macchine (artiglio e caramelle) usate per posizionare correttamente i fari.

addPaintingLights(lights)

Salva un array di spot che illuminano quadri/pannelli in lightReferences.paintingSpotlights, così altre funzioni (preset/controlli) possono gestirli.

setRoomMaterials(materials)

Memorizza i materiali della stanza (tipicamente { wall, floor, ceiling }) per consentire ai preset di cambiare i colori delle superfici.

definePresets()

Costruisce this.presets con più profili (“arcade”, “neon”, “warm”, “cool”, “dark”), ognuno con colori/intensità per: ambient, claw, candy, side, center, paintings, e colori base delle superfici stanza (pareti/pavimento/soffitto).

applyLightPreset(presetName)

Recupera il preset; se non esiste esce.

Per ogni tipo di luce del preset (tranne room): chiama updateLightColor, updateLightIntensity e sincronizza la UI con updateUIForPreset.

Aggiorna il toggle della luce ambientale e la visibilità della luce ambientale in base all’intensità del preset.

Se il preset ha la sezione room e sono stati registrati i materiali della stanza, ne imposta i colori .color.setHex(...).

setupLighting()

Prerequisito: this.scene deve essere già impostata (da initialize).

Crea e aggiunge alla scena:

AmbientLight di base.

DirectionalLight principale con ombre (configura risoluzione mappa ombre e frustum della shadow camera).

Due SpotLight per le macchine (artiglio e caramelle), con target puntato agli offset; abilita le ombre.

Coppie di PointLight “supporto” per ciascuna macchina (bagliore laterale).

Una griglia di “wall washers” (più SpotLight) lungo le pareti laterali e la parete di fondo per lavare le superfici con luce radente.

Chiama setupCeilingLights() per caricare e posizionare elementi luminosi a soffitto.

Aggiunge una DirectionalLight dall’alto (luce diretta dall’asse Y+).

Salva nei riferimenti gli array dei supporti.

Chiama createLedPaths() (LED a pavimento / linee) e createWallLeds() (LED sulle pareti).

Popola lightReferences (ambient, spot, washers, ceiling, supporti, strips).

setupCeilingLights()

Carica asincronamente un modello GLB (glbmodels/led_light.glb) con GLTFLoader.

Clona il template in più posizioni predefinite (diversi Vector3 a Y=7).

Per ciascun modello a soffitto:

Cerca light1 e light2 nel grafo, imposta un MeshStandardMaterial con emissive bianco (intensità iniziale 0.0).

Crea PointLight posizionati come i mesh di luce e li aggiunge al modello.

Inserisce in lightReferences.ceilingLeds oggetti { light, mesh } per gestire in seguito colore/intensità sia del punto luce che dell’emissive del pannello.

Logga errore in caso di fallimento del caricamento.

createLedPaths()

Definisce piccoli piani (plane) rivolti verso l’alto (ruota la geometria) come tasselli LED.

Costruisce uno o più segmenti dal “punto di partenza” verso gli offset delle macchine (artiglio e, se presente, caramelle), con un secondo segmento che prosegue in Z verso la macchina.

Campiona i segmenti a passo ledSpacing e, per ogni campione, istanzia un Mesh con materiale emissivo (intensità 1.5), lo posiziona e lo aggiunge alla scena.

Ogni LED creato viene pushato in lightReferences.ledStrips così update() potrà animarne il colore.

createWallLeds()

Disegna matrici/onde di piccoli LED sulle quattro pareti della stanza:

Definisce dimensioni stanza, spaziatura e offset dalle pareti.

Usa una sinusoide per modulare l’altezza dei LED (waveAmplitude/waveFrequency) creando un pattern ondeggiante.

Crea piani rivolti verso l’interno (orientamento diverso per pareti X e Z).

In anelli a diverse altezze (yBase a step di 2), popola le pareti davanti/dietro (ciclando su X) e sinistra/destra (ciclando su Z).

Ogni LED viene aggiunto alla scena e anche a lightReferences.ledStrips, quindi partecipa all’animazione cromatica di update().

setupLightControls()

Collega la UI HTML (se presente) per mostrare/nascondere il pannello controlli (#toggleLightControls, #lightControls).

Inizializza i vari gruppi di controlli: ambient, colore, intensità, velocità LED, colore pareti, colore pavimento, delegando ai metodi dedicati.

Se gli elementi non esistono, logga un warning ma non interrompe l’esecuzione.

setupAmbientLightControls()

Aggancia gli input UI per colore (#ambientLightColor), intensità (#ambientLightIntensity) e toggle visibilità (#ambientLightToggle) della luce ambientale.

Su input:

Cambia il colore via updateLightColor('ambient', ...) e aggiorna un riquadro di preview.

Cambia l’intensità via updateLightIntensity('ambient', ...) e aggiorna il valore testuale.

Mostra/nasconde la AmbientLight impostandone .visible.

setupColorControls()

Aggancia una serie di color picker per tipi di luce: claw, candy, side, center, paintings.

Ogni input invoca updateLightColor(tipo, colore) e aggiorna la relativa preview.

setupIntensityControls()

Aggancia slider di intensità per: claw, candy, side, center, paintings.

Ogni input invoca updateLightIntensity(tipo, valore) e aggiorna il testo col valore corrente.

setupLedSpeedControls()

Collega lo slider #ledSpeedControl e l’etichetta #ledSpeedValue.

Aggiorna this.ledSpeed in tempo reale per accelerare/rallentare l’animazione LED.

setupWallColorControls()

Collega #wallColorPicker; alla modifica chiama (se presente) window.updateWallColor(color) per demandare il cambio colore delle pareti a codice esterno.

setupFloorColorControls()

Collega #floorColorPicker; alla modifica chiama (se presente) window.updateFloorColor(color) per demandare il cambio colore del pavimento.

updatePreview(previewId, color)

Utility UI: imposta lo sfondo dell’elemento di preview (es. un quadratino) al colore scelto.

updateLightColor(lightType, colorHex)

Converte colorHex in THREE.Color e applica il colore a seconda del tipo:

ambient: cambia .color della AmbientLight.

claw/candy: cambia .color dello spotlight principale e di tutti i point light di supporto.

side: aggiorna il colore di tutte le wall washers.

center: per ogni elemento in ceilingLeds, imposta il colore della PointLight e l’emissive del mesh relativo.

paintings: aggiorna il colore di tutti gli spot per i quadri.

Effetto: sincronizza le componenti luminose “fisiche” (Point/Spot/Directional) e le superfici emissive dove previsto.

updateLightIntensity(lightType, intensity)

Applica la nuova intensità per tipo, con scaling specifici:

ambient: intensità diretta.

claw/candy: raddoppia per gli spot principali (* 2) e usa il valore “puro” per i point di supporto.

side: aumenta del 50% per le wall washers (* 1.5) per un wash più evidente.

center: riduce leggermente la PointLight (* 0.8) ma usa il valore pieno per l’emissive del pannello LED (mesh).

paintings: applica direttamente sugli spot dei quadri.

Garantisce coerenza tra luce reale e “bagliore” dei materiali emissivi.

updateUIForPreset(lightType, color, intensity)

Sincronizza i controlli UI (input colore, slider intensità, label valore, preview) con i valori imposti da un preset per il tipo di luce indicato.

setupShadows(renderer)

Abilita le ombre sul renderer e imposta il tipo PCFSoftShadowMap per bordi più morbidi.

setLedSpeed(speed)

Imposta programmaticamente la velocità degli effetti LED e aggiorna (se presenti) lo slider e la label della UI.

getLightReferences()

Ritorna l’oggetto lightReferences, utile per accedere dall’esterno alle luci create (per debug o personalizzazioni avanzate).
*/