import * as THREE from 'three';

export class AudioManager {
    constructor() {
        this.audioListener = null;
        this.sounds = new Map(); // To store loaded sounds { name: THREE.Audio }
        this.camera = null;
        this.currentBGM = null; // To track the current background music

    }

    initialize(camera) {
        if (!camera) {
            return;
        }
        this.camera = camera;
        this.audioListener = new THREE.AudioListener();
        this.camera.add(this.audioListener);
    }

    loadSound(name, path, volume = 0.5, loop = false) {
        if (!this.audioListener) {
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

            },
            undefined, // onProgress
            (error) => {
            }
        );
    }

    playSound(name) {
        const soundOrGroup = this.sounds.get(name);
        if (!soundOrGroup) {
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
            this.currentBGM = null;
            return;
        }

        if (Array.isArray(soundToPlay)) {
            this.currentBGM = null;
            return;
        }

        soundToPlay.play();
        this.currentBGM = { name, sound: soundToPlay };
    }

    stopAllBGM() {
        if (this.currentBGM && this.currentBGM.sound.isPlaying) {
            this.currentBGM.sound.stop();
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
        }
    }
} 