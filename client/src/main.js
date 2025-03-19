import Phaser from "phaser";
import { io } from "socket.io-client";

class GameScene extends Phaser.Scene {
    constructor() {
        super("GameScene");
        this.players = {};
        this.enemies = {};
        this.bullets = [];
    }

    preload() {
        this.load.image("player", "assets/player.png");
        this.load.image("enemy", "assets/enemy.png");
        this.load.image("bullet", "assets/bullet.png");
    }

    create() {
        this.socket = io("http://localhost:3000");

        this.socket.on("currentPlayers", (players) => {
            Object.keys(players).forEach((id) => {
                this.addPlayer(id, players[id].x, players[id].y);
            });
        });

        this.socket.on("newPlayer", (player) => {
            this.addPlayer(player.id, player.x, player.y);
        });

        this.socket.on("playerMoved", (data) => {
            if (this.players[data.id]) {
                this.players[data.id].setPosition(data.x, data.y);
            }
        });

        this.socket.on("playerDisconnected", (id) => {
            if (this.players[id]) {
                this.players[id].destroy();
                delete this.players[id];
            }
        });

        this.socket.on("currentEnemies", (enemies) => {
            enemies.forEach(e => this.addEnemy(e.id, e.x, e.y));
        });

        this.socket.on("spawnEnemy", (enemy) => {
            this.addEnemy(enemy.id, enemy.x, enemy.y);
        });

        this.socket.on("enemyKilled", (enemyId) => {
            if (this.enemies[enemyId]) {
                this.enemies[enemyId].destroy();
                delete this.enemies[enemyId];
            }
        });

        this.me = this.addPlayer(this.socket.id, 400, 300);
        this.cursors = this.input.keyboard.createCursorKeys();

        this.time.addEvent({
            delay: 1000,
            callback: this.shootBullet,
            callbackScope: this,
            loop: true
        });
    }

    addEnemy(id, x, y) {
        const enemy = this.add.image(x, y, "enemy");
        this.enemies[id] = enemy;
    }

    addPlayer(id, x, y) {
        const player = this.add.image(x, y, "player");
        this.players[id] = player;
        return player;
    }

    shootBullet() {
        if (!this.me) return;

        const bullet = this.add.image(this.me.x, this.me.y, "bullet");
        this.bullets.push(bullet);

        this.tweens.add({
            targets: bullet,
            y: bullet.y - 600,
            duration: 1000,
            onComplete: () => {
                bullet.destroy();
                this.bullets = this.bullets.filter(b => b !== bullet);
            }
        });

        this.checkBulletCollision(bullet);
    }

    checkBulletCollision(bullet) {
        this.time.addEvent({
            delay: 50,
            callback: () => {
                Object.keys(this.enemies).forEach(enemyId => {
                    const enemy = this.enemies[enemyId];
                    if (enemy && Phaser.Math.Distance.Between(bullet.x, bullet.y, enemy.x, enemy.y) < 20) {
                        this.socket.emit("enemyHit", enemyId);
                        bullet.destroy();
                    }
                });
            },
            loop: true
        });
    }

    update() {
        if (!this.me) return;

        let moved = false;
        if (this.cursors.left.isDown) { this.me.x -= 2; moved = true; }
        if (this.cursors.right.isDown) { this.me.x += 2; moved = true; }
        if (this.cursors.up.isDown) { this.me.y -= 2; moved = true; }
        if (this.cursors.down.isDown) { this.me.y += 2; moved = true; }

        if (moved) {
            this.socket.emit("playerMove", { x: this.me.x, y: this.me.y });
        }
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    scene: GameScene
};

new Phaser.Game(config);
