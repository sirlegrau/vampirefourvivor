class GameController {
    constructor(io, config) {
        this.io = io;
        this.config = config;
        this.gameInProgress = false;
        this.gameLoopInterval = null;
        this.controllers = {};
    }

    init(controllers) {
        this.controllers = controllers;
    }

    isGameInProgress() {
        return this.gameInProgress;
    }

    startGame() {
        if (this.gameLoopInterval) clearInterval(this.gameLoopInterval);

        this.gameInProgress = true;
        this.gameLoopInterval = setInterval(() => {
            this.gameLoop();
        }, this.config.SIMULATION.tickRate);

        this.controllers.waveController.startWaveSystem();
    }

    stopGame() {
        this.gameInProgress = false;
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }
    }

    gameLoop() {
        this.controllers.enemyController.moveEnemies();
        this.controllers.bulletController.moveBullets();
        this.checkCollisions();
    }

    checkCollisions() {
        this.checkBulletEnemyCollisions();
        this.checkPlayerEnemyCollisions();
        this.checkPlayerXpOrbCollisions();
    }

    checkBulletEnemyCollisions() {
        const bullets = this.controllers.bulletController.getAllBullets();
        const bulletHitRadius = this.config.SIMULATION.bulletHitRadius;

        bullets.forEach(bullet => {
            this.controllers.enemyController.getAllEnemies().forEach(enemy => {
                if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < bulletHitRadius) {
                    const player = this.controllers.playerController.getPlayer(bullet.playerId);
                    let damage = bullet.damage;

                    this.controllers.enemyController.damageEnemy(enemy.id, damage, bullet.playerId);
                    this.controllers.bulletController.destroyBullet(bullet.id);
                }
            });
        });
    }

    checkPlayerEnemyCollisions() {
        const players = this.controllers.playerController.getAllPlayers();
        const collisionRadius = this.config.SIMULATION.playerEnemyCollisionRadius;

        Object.entries(players).forEach(([playerId, player]) => {
            this.controllers.enemyController.getAllEnemies().forEach(enemy => {
                if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < collisionRadius) {
                    this.controllers.playerController.damagePlayer(playerId, 1);
                    this.controllers.enemyController.removeEnemy(enemy.id, playerId);
                }
            });
        });
    }

    checkPlayerXpOrbCollisions() {
        const players = this.controllers.playerController.getAllPlayers();
        const orbCollectionRadius = this.config.XP.orbCollectionRadius;

        Object.entries(players).forEach(([playerId, player]) => {
            this.controllers.xpController.getCollectableOrbs(playerId, player, orbCollectionRadius);
        });
    }
}

module.exports = GameController;