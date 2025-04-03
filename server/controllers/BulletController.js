class BulletController {
    constructor(io, config) {
        this.io = io;
        this.config = config;
        this.bullets = [];
        this.controllers = null;
    }

    init(controllers) {
        this.controllers = controllers;
    }

    getAllBullets() {
        return this.bullets;
    }

    clearBullets() {
        this.bullets = [];
    }

    createBullet(playerId, x, y, angle, damage) {
        const playerController = this.controllers?.playerController;
        const player = playerController ? playerController.getPlayer(playerId) : null;

        if (!player) return;

        const effectiveDamage = damage * player.damageMultiplier;

        const bullet = {
            id: `bullet-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            x,
            y,
            velocityX: Math.cos(angle) * this.config.SIMULATION.bulletSpeed,
            velocityY: Math.sin(angle) * this.config.SIMULATION.bulletSpeed,
            damage: effectiveDamage,
            playerId
        };

        this.bullets.push(bullet);
        this.io.emit("bulletCreated", bullet);

        return bullet;
    }

    moveBullets() {
        this.bullets = this.bullets.filter(bullet => {
            bullet.x += bullet.velocityX;
            bullet.y += bullet.velocityY;

            // Remove bullets that are out of bounds
            const offset = this.config.WORLD.spawnBorderOffset;
            if (bullet.x < -offset ||
                bullet.x > this.config.WORLD.width + offset ||
                bullet.y < -offset ||
                bullet.y > this.config.WORLD.height + offset) {
                this.io.emit("bulletDestroyed", bullet.id);
                return false;
            }

            this.io.emit("bulletMoved", { id: bullet.id, x: bullet.x, y: bullet.y });
            return true;
        });
    }

    destroyBullet(bulletId) {
        this.bullets = this.bullets.filter(b => b.id !== bulletId);
        this.io.emit("bulletDestroyed", bulletId);
    }
}

module.exports = BulletController;