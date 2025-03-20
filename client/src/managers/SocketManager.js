// managers/SocketManager.js
import { io } from "socket.io-client";
import GameConfig from '../config/gameConfig.js';

export default class SocketManager {
    constructor(scene) {
        this.scene = scene;
        this.socketUrl = GameConfig.SOCKET.url;
        this.socket = null;
        this.playerName = scene.playerName || "Player";

        this.setupSocketConnection();
    }

    setupSocketConnection() {
        this.socket = io(this.socketUrl);

        // Handle connection events
        this.setupConnectionHandlers();

        // Handle player events
        this.setupPlayerHandlers();

        // Handle enemy events
        this.setupEnemyHandlers();

        // Handle bullet events
        this.setupBulletHandlers();

        // Handle xp events
        this.setupXpHandlers();

        // Handle wave events
        this.setupWaveHandlers();
    }

    setupConnectionHandlers() {
        this.socket.on("currentPlayers", (players) => {
            Object.keys(players).forEach((id) => {
                const playerData = players[id];
                if (id === this.socket.id) {
                    // Set player name when joining
                    playerData.name = this.playerName;
                    this.socket.emit("setPlayerName", this.playerName);

                    this.scene.playerStats = {
                        hp: playerData.hp,
                        maxHp: playerData.maxHp,
                        xp: playerData.xp,
                        level: playerData.level,
                        score: playerData.score || 0,
                        damageMultiplier: playerData.damageMultiplier || 1,
                        cooldownReduction: playerData.cooldownReduction || 1,
                        speedMultiplier: playerData.speedMultiplier || 1,
                        bulletsPerShot: playerData.bulletsPerShot || 1,
                        name: this.playerName
                    };
                    this.scene.bulletsPerShot = this.scene.playerStats.bulletsPerShot || 1;
                    this.scene.me = this.scene.addPlayer(id, playerData.x, playerData.y, true, this.playerName);
                } else {
                    const playerName = playerData.name || "Player";
                    this.scene.addPlayer(id, playerData.x, playerData.y, false, playerName);
                }
            });
            this.scene.uiManager.updateUI();
        });

        this.socket.on("newPlayer", (player) => {
            const playerName = player.name || "Player";
            this.scene.addPlayer(player.id, player.x, player.y, false, playerName);
        });

        this.socket.on("playerDisconnected", (id) => {
            if (this.scene.players[id]) {
                if (this.scene.players[id].nameText) {
                    this.scene.players[id].nameText.destroy();
                }
                this.scene.players[id].destroy();
                delete this.scene.players[id];
            }
        });
    }

    setupPlayerHandlers() {
        this.socket.on("playerMoved", (data) => {
            if (this.scene.players[data.id]) {
                this.scene.players[data.id].setPosition(data.x, data.y);

                // Move player name text
                if (this.scene.players[data.id].nameText) {
                    this.scene.players[data.id].nameText.setPosition(data.x, data.y + 30);
                }
            }
        });

        this.socket.on("updateHP", (data) => {
            if (data.id === this.socket.id) {
                this.scene.playerStats.hp = data.hp;
                this.scene.uiManager.updateUI();

                this.scene.tweens.add({
                    targets: this.scene.me,
                    alpha: 0.5,
                    duration: 100,
                    yoyo: true
                });

                if (this.scene.playerStats.hp <= 0 && !this.scene.gameOver) {
                    this.scene.gameOver = true;
                    this.scene.uiManager.showGameOver();
                }
            }
        });

        this.socket.on("updateScore", (data) => {
            if (data.id === this.socket.id) {
                this.scene.playerStats.score = data.score;
                this.scene.uiManager.updateUI();
            }
        });

        this.socket.on("playerUpgraded", (data) => {
            if (data.id === this.socket.id) {
                this.scene.playerStats.maxHp = data.stats.maxHp;
                this.scene.playerStats.hp = data.stats.hp;
                this.scene.playerStats.damageMultiplier = data.stats.damageMultiplier;
                this.scene.playerStats.cooldownReduction = data.stats.cooldownReduction;
                this.scene.playerStats.speedMultiplier = data.stats.speedMultiplier;
                this.scene.playerStats.bulletsPerShot = data.stats.bulletsPerShot || this.scene.playerStats.bulletsPerShot;
                this.scene.bulletsPerShot = this.scene.playerStats.bulletsPerShot;
                this.scene.uiManager.updateUI();
            }
        });

        this.socket.on("playerDied", (id) => {
            if (id === this.socket.id && !this.scene.gameOver) {
                this.scene.gameOver = true;
                this.scene.uiManager.showGameOver();
            }
        });

        this.socket.on("playerNameUpdate", (data) => {
            if (this.scene.players[data.id]) {
                if (this.scene.players[data.id].nameText) {
                    this.scene.players[data.id].nameText.setText(data.name);
                } else {
                    const player = this.scene.players[data.id];
                    player.nameText = this.scene.add.text(
                        player.x,
                        player.y + 30,
                        data.name,
                        {
                            fontSize: '14px',
                            fill: '#ffffff',
                            stroke: '#000000',
                            strokeThickness: 2
                        }
                    ).setOrigin(0.5);
                }
            }
        });
    }

    setupEnemyHandlers() {
        this.socket.on("currentEnemies", (enemies) => {
            enemies.forEach(e => this.scene.addEnemy(e.id, e.x, e.y, e.type, e.hp));
        });

        this.socket.on("spawnEnemy", (enemy) => {
            this.scene.addEnemy(enemy.id, enemy.x, enemy.y, enemy.type, enemy.hp);
        });

        this.socket.on("enemyMoved", (data) => {
            if (this.scene.enemies[data.id]) {
                this.scene.enemies[data.id].setPosition(data.x, data.y);
            }
        });

        this.socket.on("enemyHit", (data) => {
            const enemy = this.scene.enemies[data.enemyId];
            if (enemy) {
                enemy.hp = data.hp;
                if (enemy.hpText) enemy.hpText.setText(`HP: ${Math.ceil(enemy.hp)}`);

                this.scene.hitSound.play({ volume: 0.3 });
                this.scene.tweens.add({
                    targets: enemy,
                    alpha: 0.5,
                    duration: 50,
                    yoyo: true
                });
            }
        });

        this.socket.on("enemyKilled", (data) => {
            if (this.scene.enemies[data.enemyId]) {
                const enemy = this.scene.enemies[data.enemyId];

                this.scene.tweens.add({
                    targets: enemy,
                    alpha: 0,
                    scale: 1.5,
                    duration: 200,
                    onComplete: () => {
                        if (enemy.hpText) enemy.hpText.destroy();
                        enemy.destroy();
                        delete this.scene.enemies[data.enemyId];
                    }
                });

                if (data.killerId === this.socket.id) {
                    this.scene.playerStats.score += data.points;
                    this.scene.uiManager.updateUI();
                }
            }
        });
    }

    setupBulletHandlers() {
        this.socket.on("bulletCreated", (data) => {
            this.scene.addBullet(data.id, data.x, data.y, data.velocityX, data.velocityY);
        });

        this.socket.on("bulletMoved", (data) => {
            if (this.scene.bullets[data.id]) {
                this.scene.bullets[data.id].setPosition(data.x, data.y);
            }
        });

        this.socket.on("bulletDestroyed", (id) => {
            if (this.scene.bullets[id]) {
                this.scene.bullets[id].destroy();
                delete this.scene.bullets[id];
            }
        });
    }

    setupXpHandlers() {
        this.socket.on("updateXP", (data) => {
            if (data.id === this.socket.id) {
                this.scene.playerStats.xp = data.xp;
                this.scene.playerStats.level = data.level;

                if (data.leveledUp) {
                    this.scene.uiManager.showLevelUp();
                }

                this.scene.uiManager.updateUI();
            }
        });

        this.socket.on("spawnXpOrb", (data) => {
            this.scene.addXpOrb(data.id, data.x, data.y, data.value);
        });

        this.socket.on("xpOrbCollected", (id) => {
            const orb = this.scene.xpOrbs.find(o => o.id === id);
            if (orb) {
                orb.destroy();
                this.scene.xpOrbs = this.scene.xpOrbs.filter(o => o.id !== id);
            }
        });

        this.socket.on("currentXpOrbs", (orbs) => {
            orbs.forEach(orb => this.scene.addXpOrb(orb.id, orb.x, orb.y, orb.value));
        });
    }

    setupWaveHandlers() {
        this.socket.on("waveStarted", (data) => {
            this.scene.uiManager.showWaveStart(data.wave);
        });
    }
}