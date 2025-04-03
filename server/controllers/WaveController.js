class WaveController {
    constructor(io, config) {
        this.io = io;
        this.config = config;
        this.currentWave = 0;
        this.waveInterval = null;
        this.controllers = null;
    }

    init(controllers) {
        this.controllers = controllers;
    }

    getCurrentWave() {
        return this.currentWave;
    }

    resetWaves() {
        this.currentWave = 0;
        if (this.waveInterval) {
            clearInterval(this.waveInterval);
            this.waveInterval = null;
        }
    }

    startWaveSystem() {
        // Clear any existing interval
        if (this.waveInterval) clearInterval(this.waveInterval);

        // Initialize wave manager state
        this.currentWave = this.config.WAVES.firstWave;

        // Create an interval that checks the wave state
        this.waveInterval = setInterval(() => {
            const enemyController = this.controllers?.enemyController;
            const playerController = this.controllers?.playerController;

            if (!enemyController || !playerController) return;

            const activeEnemyCount = enemyController.getAllEnemies().length;

            // Use the state machine to determine if we should start a new wave
            const shouldStartNewWave = this.config.WAVES.updateWaveState(activeEnemyCount);

            if (shouldStartNewWave) {
                const activePlayerCount = playerController.getPlayerCount();

                // Start a new wave using the state machine
                if (this.config.WAVES.startWave(this.currentWave, activePlayerCount)) {
                    console.log(`🌊 Starting wave ${this.currentWave}`);
                    this.spawnWave();
                }
            }

            // Check if we just completed a wave
            if (this.config.WAVES.currentWaveState === this.config.WAVES.waveState.COMPLETE) {
                this.currentWave++;
                console.log(`Wave ${this.currentWave - 1} completed, next wave: ${this.currentWave}`);
                this.io.emit("waveComplete", { wave: this.currentWave - 1 });
            }
        }, this.config.SIMULATION.tickRate);
    }

    spawnWave() {
        const enemyController = this.controllers?.enemyController;
        if (!enemyController) return;

        // Use the enemy composition that was already calculated by the state machine
        const enemyComposition = this.config.WAVES.enemiesToSpawnThisWave;

        Object.entries(enemyComposition).forEach(([type, count]) => {
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    enemyController.spawnEnemy(type);
                    this.config.WAVES.totalEnemiesSpawned++; // Update the spawned counter
                }, i * this.config.WAVES.enemySpawnDelay);
            }
        });

        this.io.emit("waveStarted", { wave: this.currentWave, enemyCount: enemyComposition });
    }

    incrementEnemiesKilled() {
        this.config.WAVES.enemiesKilledThisWave++;
    }
}

module.exports = WaveController;