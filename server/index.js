// index.js - Node.js server
const { createServer } = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const httpServer = createServer();

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["my-custom-header"]
    },
    transports: ["websocket", "polling"]
});

let players = {};
let enemies = [];
let bullets = [];
let xpOrbs = [];
let gameInProgress = false;
let gameLoopInterval;
let waveInterval;
let currentWave = 0;

const initialPlayerStats = {
    x: 800,
    y: 600,
    hp: 5,
    maxHp: 5,
    xp: 0,
    level: 1,
    score: 0,
    weaponLevel: 1,
    damageMultiplier: 1,
    cooldownReduction: 1
};

const enemyStats = {
    basic: { hp: 3, speed: 1, points: 10, xpValue: 5 },
    fast: { hp: 2, speed: 2, points: 15, xpValue: 7 },
    tank: { hp: 8, speed: 0.5, points: 20, xpValue: 10 },
    boss: { hp: 30, speed: 0.7, points: 100, xpValue: 50 }
};

function startGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    gameLoopInterval = setInterval(() => {
        moveEnemies();
        moveBullets();
        checkCollisions();
    }, 33);
    startWaveSystem();
}

function checkCollisions() {
    bullets.forEach(bullet => {
        enemies.forEach(enemy => {
            if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < 30) {
                enemy.hp -= bullet.damage;
                io.emit("enemyHit", { id: enemy.id, hp: enemy.hp });

                if (enemy.hp <= 0) {
                    killEnemy(enemy, bullet.playerId);
                }

                bullets = bullets.filter(b => b.id !== bullet.id);
                io.emit("bulletDestroyed", bullet.id);
            }
        });
    });
}

io.on("connection", (socket) => {
    players[socket.id] = { ...initialPlayerStats };
    if (!gameInProgress) {
        gameInProgress = true;
        startGameLoop();
    }

    socket.on("playerShoot", ({ x, y, angle, damage }) => {
        const bullet = {
            id: `bullet-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            x, y,
            velocityX: Math.cos(angle) * 10,
            velocityY: Math.sin(angle) * 10,
            damage,
            playerId: socket.id
        };
        bullets.push(bullet);
        io.emit("bulletCreated", bullet);
    });
});

httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});

// main.js - Phaser Client
import Phaser from "phaser";
import { io } from "socket.io-client";

class GameScene extends Phaser.Scene {
    constructor() {
        super("GameScene");
        this.players = {};
        this.enemies = {};
        this.bullets = [];
        this.playerStats = { hp: 5, maxHp: 5, xp: 0, level: 1, score: 0 };
    }

    setupSocketConnection() {
        this.socket = io("https://vampirefourvivor.onrender.com");

        this.socket.on("enemyHit", (data) => {
            const enemy = this.enemies[data.id];
            if (enemy) {
                this.hitSound.play();
                enemy.hp = data.hp;
                this.tweens.add({ targets: enemy, alpha: 0.5, duration: 50, yoyo: true });
                if (enemy.hp <= 0) {
                    this.destroyEnemy(enemy.id);
                }
            }
        });

        this.socket.on("enemyDestroyed", (id) => {
            this.destroyEnemy(id);
        });
    }

    destroyEnemy(id) {
        if (this.enemies[id]) {
            this.enemies[id].destroy();
            delete this.enemies[id];
        }
    }

    checkBulletCollision(bullet) {
        Object.values(this.enemies).forEach(enemy => {
            if (Phaser.Math.Distance.Between(bullet.x, bullet.y, enemy.x, enemy.y) < 30) {
                this.socket.emit("enemyHit", { id: enemy.id, damage: bullet.damage });
                bullet.destroy();
                this.bullets = this.bullets.filter(b => b !== bullet);
            }
        });
    }

    checkXpCollection() {
        this.xpOrbs.forEach(orb => {
            if (Phaser.Math.Distance.Between(this.me.x, this.me.y, orb.x, orb.y) < 40) {
                this.socket.emit("collectXpOrb", orb.id);
                orb.destroy();
            }
        });
    }

    updateUI() {
        this.hpText.setText(`HP: ${this.playerStats.hp}/${this.playerStats.maxHp}`);
        this.levelText.setText(`Level: ${this.playerStats.level}`);
        this.xpText.setText(`XP: ${this.playerStats.xp}`);
        this.scoreText.setText(`Score: ${this.playerStats.score}`);
        this.weaponText.setText(`Weapon: ${this.weapons[this.currentWeapon].name}`);
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
    scene: [GameScene]
};

new Phaser.Game(config);
