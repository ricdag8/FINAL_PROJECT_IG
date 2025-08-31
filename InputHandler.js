/**
 * Input Handler Module
 * Manages all game input handling for different modes
 */

export class InputHandler {
    constructor() {
        this.gameMode = 'exploration';
        this.isGamePaused = false;
        this.playerInputHandler = null;
        this.clawController = null;
        this.candyMachine = null;
        this.cameraManager = null;
        this.coins = 0;
        this.isGameOver = false;
        
        // Callback functions
        this.togglePauseMenuCallback = null;
        this.exitMachineCallback = null;
        this.updateModeIndicatorCallback = null;
        
        this.setupEventListeners();
    }
    
    // Initialize with required dependencies
    initialize(config) {
        this.playerInputHandler = config.playerInputHandler;
        this.clawController = config.clawController;
        this.candyMachine = config.candyMachine;
        this.cameraManager = config.cameraManager;
        this.coins = config.coins;
        this.isGameOver = config.isGameOver;
        this.togglePauseMenuCallback = config.togglePauseMenuCallback;
        this.exitMachineCallback = config.exitMachineCallback;
        this.updateModeIndicatorCallback = config.updateModeIndicatorCallback;
    }
    
    setupEventListeners() {
        // Event listeners are now managed by main.js
        // Removed to prevent duplicate event handling
        // document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        // document.addEventListener('keyup', (e) => this.handleKeyUp(e));
    }
    
    setGameMode(mode) {
        this.gameMode = mode;
    }
    
    setGamePaused(paused) {
        this.isGamePaused = paused;
    }
    
    updateCoins(coins) {
        this.coins = coins;
    }
    
    updateGameOver(isGameOver) {
        this.isGameOver = isGameOver;
    }

    handleKeyDown(e) {
        if (e.code === 'KeyH' && !e.repeat) {
            if (this.togglePauseMenuCallback) {
                this.togglePauseMenuCallback();
            }
            return;
        }

        if (this.isGamePaused) return;

        switch(this.gameMode) {
            case 'exploration':
                if (this.playerInputHandler) {
                    this.playerInputHandler.handleKeyDown(e);
                }
                break;
            case 'claw_machine':
                this.handleClawMachineKeyDown(e);
                break;
            case 'candy_machine':
                this.handleCandyMachineKeyDown(e);
                break;
        }
    }

    handleKeyUp(e) {
        switch(this.gameMode) {
            case 'exploration':
                if (this.playerInputHandler) {
                    this.playerInputHandler.handleKeyUp(e);
                }
                break;
            case 'claw_machine':
                this.handleClawMachineKeyUp(e);
                break;
            case 'candy_machine':
                this.handleCandyMachineKeyUp(e);
                break;
        }
    }

    handleClawMachineKeyDown(e) {
        if (!this.clawController) return;
        
        if (['ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyP', 'KeyR', 'Escape'].includes(e.code)) {
            e.preventDefault();
        }

        switch (e.code) {
            case 'ArrowLeft':
            case 'KeyA':       
                this.clawController.setMoving('left', true); 
                break;
            case 'ArrowRight':
            case 'KeyD':       
                this.clawController.setMoving('right', true); 
                break;
            case 'KeyW':       
                this.clawController.setMoving('forward', true); 
                break;
            case 'KeyS':       
                this.clawController.setMoving('backward', true);
                break;
            case 'ArrowDown':
                if (!e.repeat && !this.isGameOver && !this.clawController.isAnimating) {
                    if (this.coins > 0) {
                        this.coins--;
                        this.clawController.startDropSequence();
                    }
                }
                break;
            case 'KeyP':
                if (!e.repeat) {
                    this.toggleClawCameraMode();
                }
                break;
            case 'Escape':
                if (!e.repeat && this.exitMachineCallback) {
                    this.exitMachineCallback();
                }
                break;
        }
    }

    handleClawMachineKeyUp(e) {
        if (!this.clawController) return;
        
        switch (e.code) {
            case 'ArrowLeft':
            case 'KeyA':       
                this.clawController.setMoving('left', false); 
                break;
            case 'ArrowRight':
            case 'KeyD':       
                this.clawController.setMoving('right', false); 
                break;
            case 'KeyW':       
                this.clawController.setMoving('forward', false); 
                break;
            case 'KeyS':       
                this.clawController.setMoving('backward', false); 
                break;
        }
    }

    handleCandyMachineKeyDown(e) {
        // Prevent default for keys we use
        if (['KeyM', 'KeyC', 'Escape'].includes(e.code)) {
            e.preventDefault();
        }
        
        switch (e.code) {
            case 'KeyM':
                if (!e.repeat) {
                    this.candyMachine?.startCandyDispensing();
                }
                break;
            case 'KeyC':
                if (!e.repeat) {
                    this.candyMachine?.insertCoin();
                }
                break;
            case 'Escape':
                if (!e.repeat && this.exitMachineCallback) {
                    this.exitMachineCallback();
                }
                break;
        }
    }

    handleCandyMachineKeyUp() {
        // no key up actions needed for candy machine
    }

    toggleClawCameraMode() {
        if (this.gameMode !== 'claw_machine' || !this.cameraManager) return;
        
        const success = this.cameraManager.toggleClawCameraMode();
        if (success && this.updateModeIndicatorCallback) {
            this.updateModeIndicatorCallback('claw_machine');
        }
    }
}