// This file can be used for initializing controllers with circular dependencies
function setupControllers(controllers) {
    // Extract controllers
    const {
        gameController,
        playerController,
        enemyController,
        bulletController,
        xpController,
        waveController
    } = controllers;

    // Initialize controllers with references to other controllers
    gameController.init({
        playerController,
        enemyController,
        bulletController,
        xpController,
        waveController
    });

    enemyController.init({
        playerController,
        xpController,
        waveController
    });

    bulletController.init({
        playerController
    });

    xpController.init({
        playerController
    });

    waveController.init({
        enemyController,
        playerController
    });
}

module.exports = { setupControllers };