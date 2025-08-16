import * as THREE from 'three';

export class AudioManager {
    constructor() {
        this.audioListener = null;
        this.sounds = new Map(); // To store loaded sounds { name: THREE.Audio }
        this.camera = null;
        this.currentBGM = null; // To track the current background music

        console.log("🔊 AudioManager initialized");
    }

    initialize(camera) {
        if (!camera) {
            console.error("❌ AudioManager requires a camera to initialize.");
            return;
        }
        this.camera = camera;
        this.audioListener = new THREE.AudioListener();
        this.camera.add(this.audioListener);
        console.log("🎧 AudioListener attached to camera.");
    }

    loadSound(name, path, volume = 0.5, loop = false) {
        if (!this.audioListener) {
            console.error("❌ AudioListener not initialized. Call initialize() first.");
            return;
        }

        const audioLoader = new THREE.AudioLoader();
        audioLoader.load(
            path,
            (buffer) => {
                const sound = new THREE.Audio(this.audioListener);
                sound.setBuffer(buffer);
                sound.setVolume(volume);
                sound.setLoop(loop);
                
                if (this.sounds.has(name)) {
                    const existing = this.sounds.get(name);
                    if (Array.isArray(existing)) {
                        existing.push(sound);
                    } else {
                        this.sounds.set(name, [existing, sound]);
                    }
                } else {
                    this.sounds.set(name, sound);
                }

                console.log(`✅ Sound for group '${name}' loaded from ${path}`);
            },
            undefined, // onProgress
            (error) => {
                console.error(`❌ Failed to load sound for group '${name}' from ${path}:`, error);
            }
        );
    }

    playSound(name) {
        const soundOrGroup = this.sounds.get(name);
        if (!soundOrGroup) {
            console.warn(`⚠️ Sound or group '${name}' not found or not loaded yet.`);
            return;
        }

        let soundToPlay;

        if (Array.isArray(soundOrGroup)) {
            if (soundOrGroup.length === 0) return;
            const randomIndex = Math.floor(Math.random() * soundOrGroup.length);
            soundToPlay = soundOrGroup[randomIndex];
        } else {
            soundToPlay = soundOrGroup;
        }

        if (soundToPlay.isPlaying) {
            soundToPlay.stop();
        }
        soundToPlay.play();
    }

    playBGM(name) {
        if (this.currentBGM && this.currentBGM.name === name && this.currentBGM.sound.isPlaying) {
            return; // Already playing the correct BGM
        }

        // Stop any currently playing BGM
        if (this.currentBGM && this.currentBGM.sound.isPlaying) {
            this.currentBGM.sound.stop();
        }

        const soundToPlay = this.sounds.get(name);
        if (!soundToPlay) {
            console.warn(`BGM '${name}' not found.`);
            this.currentBGM = null;
            return;
        }

        if (Array.isArray(soundToPlay)) {
            console.error(`Cannot play BGM for '${name}' as it's a sound group. BGMs must be unique sounds.`);
            this.currentBGM = null;
            return;
        }

        soundToPlay.play();
        this.currentBGM = { name, sound: soundToPlay };
        console.log(`🎵 Now playing BGM: ${name}`);
    }

    stopAllBGM() {
        if (this.currentBGM && this.currentBGM.sound.isPlaying) {
            this.currentBGM.sound.stop();
            console.log(`🎵 Stopped BGM: ${this.currentBGM.name}`);
        }
        this.currentBGM = null;
    }

    stopSound(name) {
        const sound = this.sounds.get(name);
        if (sound && sound.isPlaying) {
            sound.stop();
        }
    }

    setVolume(name, volume) {
        const sound = this.sounds.get(name);
        if (sound) {
            sound.setVolume(volume);
        } else {
            console.warn(`⚠️ Sound '${name}' not found. Cannot set volume.`);
        }
    }
} 