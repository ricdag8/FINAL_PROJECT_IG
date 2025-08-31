let gameMode = 'exploration';
let isGamePaused = true;
let clawController = null;
let playerInputHandler = null;
let candyMachine = null;
let coins = 0;
let isGameOver = false;

function setEventHandlerState(state) {
    gameMode = state.gameMode || gameMode;
    isGamePaused = state.isGamePaused !== undefined ? state.isGamePaused : isGamePaused;
    clawController = state.clawController || clawController;
    playerInputHandler = state.playerInputHandler || playerInputHandler;
    candyMachine = state.candyMachine || candyMachine;
    coins = state.coins !== undefined ? state.coins : coins;
    isGameOver = state.isGameOver !== undefined ? state.isGameOver : isGameOver;
}

function handleKeyDown(e, callbacks) {
    if (e.code === 'KeyH' && !e.repeat) {
        callbacks.togglePauseMenu();
        return;
    }

    if (isGamePaused) return;

    switch(gameMode) {
        case 'exploration':
            if (playerInputHandler) {
                playerInputHandler.handleKeyDown(e);
            }
            break;
        case 'claw_machine':
            handleClawMachineKeyDown(e, callbacks);
            break;
        case 'candy_machine':
            handleCandyMachineKeyDown(e, callbacks);
            break;
    }
}

function handleKeyUp(e) {
    switch(gameMode) {
        case 'exploration':
            if (playerInputHandler) {
                playerInputHandler.handleKeyUp(e);
            }
            break;
        case 'claw_machine':
            handleClawMachineKeyUp(e);
            break;
        case 'candy_machine':
            handleCandyMachineKeyUp(e);
            break;
    }
}

function handleClawMachineKeyDown(e, callbacks) {
    if (!clawController) return;
    
    if (['ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyP', 'Escape'].includes(e.code)) {
        e.preventDefault();
    }

    switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':       
            clawController.setMoving('left', true); 
            break;
        case 'ArrowRight':
        case 'KeyD':       
            clawController.setMoving('right', true); 
            break;
        case 'KeyW':       
            clawController.setMoving('forward', true); 
            break;
        case 'KeyS':       
            clawController.setMoving('backward', true);
            break;
        case 'ArrowDown':
            console.log('ArrowDown pressed - repeat:', e.repeat, 'gameOver:', isGameOver, 'isAnimating:', clawController?.isAnimating, 'coins:', coins);
            if (!e.repeat && !isGameOver && !clawController.isAnimating) {
                if (coins > 0) {
                    console.log('Processing ArrowDown - decrementing coins and starting drop sequence');
                    coins--;
                    clawController.startDropSequence();
                    if (callbacks.updateCoinsDisplay) {
                        callbacks.updateCoinsDisplay(coins);
                    }
                } else {
                    console.log('ArrowDown blocked - no coins available');
                }
            } else {
                console.log('ArrowDown blocked by conditions');
            }
            break;
        case 'KeyP':
            if (!e.repeat && callbacks.toggleClawCameraMode) {
                callbacks.toggleClawCameraMode();
            }
            break;
        case 'Escape':
            if (!e.repeat && callbacks.exitMachineMode) {
                callbacks.exitMachineMode();
            }
            break;
    }
}

function handleClawMachineKeyUp(e) {
    if (!clawController) return;
    
    switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':       
            clawController.setMoving('left', false); 
            break;
        case 'ArrowRight':
        case 'KeyD':       
            clawController.setMoving('right', false); 
            break;
        case 'KeyW':       
            clawController.setMoving('forward', false); 
            break;
        case 'KeyS':       
            clawController.setMoving('backward', false); 
            break;
    }
}

function handleCandyMachineKeyDown(e, callbacks) {
    if (['KeyM', 'KeyC', 'Escape'].includes(e.code)) {
        e.preventDefault();
    }
    
    switch (e.code) {
        case 'KeyM':
            if (!e.repeat) {
                candyMachine?.startCandyDispensing();
            }
            break;
        case 'KeyC':
            if (!e.repeat) {
                candyMachine?.insertCoin();
            }
            break;
        case 'Escape':
            if (!e.repeat && callbacks.exitMachineMode) {
                callbacks.exitMachineMode();
            }
            break;
    }
}

function handleCandyMachineKeyUp(e) {
    // no key up actions needed for candy machine
}

export {
    handleKeyDown,
    handleKeyUp,
    handleClawMachineKeyDown,
    handleClawMachineKeyUp,
    handleCandyMachineKeyDown,
    handleCandyMachineKeyUp,
    setEventHandlerState
};