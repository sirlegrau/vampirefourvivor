class EnemyController {
    constructor(io, config) {
        this.io = io;
        this.config = config;
        this.enemies = [];
        this.controllers = null;
    }

    init(controllers) {
        this.controllers = controllers;
    }

    getAllEnemies() {
        return this.enemies;
    }

    clearEnemies() {
        this.enemies = [];
    }

    spawnEnemy(type = "basic") {
        const waveController = this.controllers?.waveController;
        const currentWave = waveController ? waveController.getCurrentWave() : 0;

        const offset = this.config.WORLD.spawnBorderOffset;
        const spawnPositions = [
            { x: Math.random() * this.config.WORLD.width, y: -offset },
            { x: this.config.WORLD.width + offset, y: Math.random() * this.config.WORLD.height },
            { x: Math.random() * this.config.WORLD.width, y: this.config.WORLD.height + offset },
            { x: -offset, y: Math.random() * this.config.WORLD.height }
        ];

        let { x, y } = spawnPositions[Math.floor(Math.random() * 4)];
        const id = `enemy-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const stats = this.config.ENEMIES[type];

        const enemy = {
            id,
            x,
            y,
            type,
            hp: stats.hp * (1 + currentWave * this.config.WAVES.hpScalingPerWave),
            speed: stats.speed,
            points: stats.points,
            xpValue: stats.xpValue
        };

        this.enemies.push(enemy);
        this.io.emit("spawnEnemy", enemy);

        return enemy;
    }

    moveEnemies() {
        const playerController = this.controllers?.playerController;
        if (!playerController || Object.keys(playerController.getAllPlayers()).length === 0) return;

        this.enemies.forEach(enemy => {
            const players = playerController.getAllPlayers();
            let nearestPlayer = Object.values(players).reduce((nearest, player) => {
                let distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
                return !nearest || distance < nearest.distance ? { player, distance } : nearest;
            }, null)?.player;

            if (nearestPlayer) {
                let dx = nearestPlayer.x - enemy.x;
                let dy = nearestPlayer.y - enemy.y;
                let length = Math.hypot(dx, dy);
                enemy.x += (dx / length) * enemy.speed;
                enemy.y += (dy / length) * enemy.speed;
                this.io.emit("enemyMoved", { id: enemy.id, x: enemy.x, y: enemy.y });
            }
        });
    }

    damageEnemy(enemyId, damage, playerId) {
        const enemy = this.enemies.find(e => e.id === enemyId);
        if (!enemy) return;

        enemy.hp -= damage;
        this.io.emit("enemyHit", {
            enemyId: enemy.id,
            hp: enemy.hp,
            damage
        });

        if (enemy.hp <= 0) {
            this.killEnemy(enemy, playerId);
        }
    }

    killEnemy(enemy, playerId) {
        const playerController = this.controllers?.playerController;
        const xpController = this.controllers?.xpController;
        const waveController = this.controllers?.waveController;

        if (playerController) {
            playerController.addScore(playerId, enemy.points);
        }

        if (waveController) {
            waveController.incrementEnemiesKilled();
        }

        if (xpController) {
            xpController.spawnXpOrb(enemy.x, enemy.y, enemy.xpValue);
        }

        this.removeEnemy(enemy.id, playerId);
    }

    removeEnemy(enemyId, killerId) {
        const enemy = this.enemies.find(e => e.id === enemyId);
        if (!enemy) return;

        this.enemies = this.enemies.filter(e => e.id !== enemyId);
        this.io.emit("enemyKilled", {
            enemyId,
            killerId,
            points: enemy.points
        });
    }
}

module.exports = EnemyController;