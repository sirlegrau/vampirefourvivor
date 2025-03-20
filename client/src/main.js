import Phaser from "phaser";
import { io } from "socket.io-client";

class GameScene extends Phaser.Scene {
    constructor() {
        super("GameScene");
        this.players = {};
        this.enemies = {};
        this.bullets = {};
        this.xpOrbs = [];
        this.playerStats = { hp: 5, maxHp: 5, xp: 0, level: 1, score: 0 };
        this.currentWeapon = 0;
        this.canShoot = true;
        this.gameOver = false;
        this.socketUrl = import.meta.env.VITE_SERVER_URL || "https://vampirefourvivor.onrender.com";
    }

    preload() {
        this.load.image("player", "assets/player.png");
        this.load.image("enemy", "assets/enemy.png");
        this.load.image("bullet", "assets/bullet.png");
        this.load.image("experience", "assets/experience.png");
        this.load.image("background", "assets/background.png");
        this.load.audio("shoot", "assets/shoot.wav");
        this.load.audio("hit", "assets/hit.wav");
        this.load.audio("levelup", "assets/levelup.wav");
    }

    create() {
        // Add background
        this.add.tileSprite(0, 0, 1600, 1200, "background").setOrigin(0, 0);

        // Set up camera and world bounds
        this.cameras.main.setBounds(0, 0, 1600, 1200);
        this.physics.world.setBounds(0, 0, 1600, 1200);

        // Create UI elements
        this.createUI();

        // Initialize sounds
        this.shootSound = this.sound.add("shoot");
        this.hitSound = this.sound.add("hit");
        this.levelupSound = this.sound.add("levelup");

        // Set up input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys({
            one: Phaser.Input.Keyboard.KeyCodes.ONE,
            two: Phaser.Input.Keyboard.KeyCodes.TWO,
            three: Phaser.Input.Keyboard.KeyCodes.THREE
        });

        // Set up socket connection
        this.setupSocketConnection();

        // Set up shooting timer
        this.lastShotTime = 0;
        this.shootBullet();
    }

    createUI() {
        this.uiGroup = this.add.group();

        // Health bar
        this.hpBar = this.add.graphics().setScrollFactor(0);
        this.hpText = this.add.text(20, 20, "HP: 5/5", { fontSize: '16px', fill: '#ffffff' }).setScrollFactor(0);

        // Level and XP
        this.levelText = this.add.text(20, 50, "Level: 1", { fontSize: '16px', fill: '#ffffff' }).setScrollFactor(0);
        this.xpBar = this.add.graphics().setScrollFactor(0);
        this.xpText = this.add.text(20, 80, "XP: 0/80", { fontSize: '16px', fill: '#ffffff' }).setScrollFactor(0);

        // Score
        this.scoreText = this.add.text(20, 110, "Score: 0", { fontSize: '16px', fill: '#ffffff' }).setScrollFactor(0);

        // Current wave
        this.waveText = this.add.text(20, 140, "Wave: 0", { fontSize: '16px', fill: '#ffffff' }).setScrollFactor(0);

        // Stats
        this.statsText = this.add.text(20, 170, "Damage: 1x | Speed: 1x", { fontSize: '16px', fill: '#ffffff' }).setScrollFactor(0);
    }

    setupSocketConnection() {
        this.socket = io(this.socketUrl);

        this.socket.on("currentPlayers", (players) => {
            Object.keys(players).forEach((id) => {
                const playerData = players[id];
                if (id === this.socket.id) {
                    this.playerStats = {
                        hp: playerData.hp,
                        maxHp: playerData.maxHp,
                        xp: playerData.xp,
                        level: playerData.level,
                        score: playerData.score || 0,
                        damageMultiplier: playerData.damageMultiplier || 1,
                        cooldownReduction: playerData.cooldownReduction || 1,
                        speedMultiplier: playerData.speedMultiplier || 1
                    };
                    this.me = this.addPlayer(id, playerData.x, playerData.y, true);
                } else {
                    this.addPlayer(id, playerData.x, playerData.y, false);
                }
            });
            this.updateUI();
        });

        this.socket.on("newPlayer", (player) => {
            this.addPlayer(player.id, player.x, player.y, false);
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
            enemies.forEach(e => this.addEnemy(e.id, e.x, e.y, e.type, e.hp));
        });

        this.socket.on("spawnEnemy", (enemy) => {
            this.addEnemy(enemy.id, enemy.x, enemy.y, enemy.type, enemy.hp);
        });

        this.socket.on("enemyMoved", (data) => {
            if (this.enemies[data.id]) {
                this.enemies[data.id].setPosition(data.x, data.y);
            }
        });

        this.socket.on("enemyHit", (data) => {
            const enemy = this.enemies[data.enemyId];
            if (enemy) {
                enemy.hp = data.hp;
                if (enemy.hpText) enemy.hpText.setText(`HP: ${Math.ceil(enemy.hp)}`);

                this.hitSound.play({ volume: 0.3 });
                this.tweens.add({
                    targets: enemy,
                    alpha: 0.5,
                    duration: 50,
                    yoyo: true
                });
            }
        });

        this.socket.on("enemyKilled", (data) => {
            if (this.enemies[data.enemyId]) {
                const enemy = this.enemies[data.enemyId];

                this.tweens.add({
                    targets: enemy,
                    alpha: 0,
                    scale: 1.5,
                    duration: 200,
                    onComplete: () => {
                        if (enemy.hpText) enemy.hpText.destroy();
                        enemy.destroy();
                        delete this.enemies[data.enemyId];
                    }
                });

                if (data.killerId === this.socket.id) {
                    this.playerStats.score += data.points;
                    this.updateUI();
                }
            }
        });

        this.socket.on("bulletCreated", (data) => {
            this.addBullet(data.id, data.x, data.y, data.velocityX, data.velocityY);
        });

        this.socket.on("bulletMoved", (data) => {
            if (this.bullets[data.id]) {
                this.bullets[data.id].setPosition(data.x, data.y);
            }
        });

        this.socket.on("bulletDestroyed", (id) => {
            if (this.bullets[id]) {
                this.bullets[id].destroy();
                delete this.bullets[id];
            }
        });

        this.socket.on("updateXP", (data) => {
            if (data.id === this.socket.id) {
                this.playerStats.xp = data.xp;
                this.playerStats.level = data.level;

                if (data.leveledUp) {
                    this.levelUp();
                }

                this.updateUI();
            }
        });

        this.socket.on("updateHP", (data) => {
            if (data.id === this.socket.id) {
                this.playerStats.hp = data.hp;
                this.updateUI();

                this.tweens.add({
                    targets: this.me,
                    alpha: 0.5,
                    duration: 100,
                    yoyo: true
                });

                if (this.playerStats.hp <= 0 && !this.gameOver) {
                    this.gameOver = true;
                    this.showGameOver();
                }
            }
        });

        this.socket.on("updateScore", (data) => {
            if (data.id === this.socket.id) {
                this.playerStats.score = data.score;
                this.updateUI();
            }
        });

        this.socket.on("spawnXpOrb", (data) => {
            this.addXpOrb(data.id, data.x, data.y, data.value);
        });

        this.socket.on("xpOrbCollected", (id) => {
            const orb = this.xpOrbs.find(o => o.id === id);
            if (orb) {
                orb.destroy();
                this.xpOrbs = this.xpOrbs.filter(o => o.id !== id);
            }
        });

        this.socket.on("waveStarted", (data) => {
            this.currentWave = data.wave;
            this.updateUI();

            const waveText = this.add.text(
                this.cameras.main.width / 2,
                100,
                `WAVE ${data.wave}`,
                { fontSize: '32px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 }
            );
            waveText.setScrollFactor(0);
            waveText.setOrigin(0.5);

            this.tweens.add({
                targets: waveText,
                alpha: 0,
                y: 80,
                duration: 2000,
                onComplete: () => waveText.destroy()
            });
        });

        this.socket.on("playerUpgraded", (data) => {
            if (data.id === this.socket.id) {
                this.playerStats.maxHp = data.stats.maxHp;
                this.playerStats.hp = data.stats.hp;
                this.playerStats.damageMultiplier = data.stats.damageMultiplier;
                this.playerStats.cooldownReduction = data.stats.cooldownReduction;
                this.playerStats.speedMultiplier = data.stats.speedMultiplier;
                this.updateUI();
            }
        });

        this.socket.on("currentXpOrbs", (orbs) => {
            orbs.forEach(orb => this.addXpOrb(orb.id, orb.x, orb.y, orb.value));
        });

        this.socket.on("playerDied", (id) => {
            if (id === this.socket.id && !this.gameOver) {
                this.gameOver = true;
                this.showGameOver();
            }
        });
    }

    addPlayer(id, x, y, isMe = false) {
        const player = this.add.image(x, y, "player");

        if (isMe) {
            player.setTint(0x00FF00);
            this.cameras.main.startFollow(player, true, 0.05, 0.05);
        } else {
            player.setTint(0xFFFF00);
        }

        this.players[id] = player;
        return player;
    }

    addEnemy(id, x, y, type = 'basic', hp = 3) {
        if (this.enemies[id]) return;

        const enemy = this.add.image(x, y, "enemy");

        switch(type) {
            case 'fast':
                enemy.setTint(0xFF9999);
                enemy.setScale(0.8);
                break;
            case 'tank':
                enemy.setTint(0x9999FF);
                enemy.setScale(1.3);
                break;
            case 'boss':
                enemy.setTint(0xFF0000);
                enemy.setScale(2);
                break;
            default:
                enemy.setTint(0xFFFFFF);
        }

        enemy.hpText = this.add.text(x, y - 20, `HP: ${Math.ceil(hp)}`, {
            fontSize: '12px',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2
        });

        enemy.type = type;
        enemy.hp = hp;
        this.enemies[id] = enemy;
        return enemy;
    }

    addBullet(id, x, y, velocityX, velocityY) {
        const bullet = this.add.image(x, y, "bullet");
        this.bullets[id] = bullet;
        return bullet;
    }

    addXpOrb(id, x, y, value) {
        const orb = this.add.image(x, y, "experience");
        orb.setScale(0.5);
        orb.id = id;
        orb.value = value;

        this.tweens.add({
            targets: orb,
            scale: 0.6,
            duration: 500,
            yoyo: true,
            repeat: -1
        });

        this.xpOrbs.push(orb);
        return orb;
    }
    findClosestEnemy() {
        let closestEnemy = null;
        let closestDistance = Infinity;

        Object.values(this.enemies).forEach(enemy => {
            const distance = Phaser.Math.Distance.Between(this.me.x, this.me.y, enemy.x, enemy.y);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestEnemy = enemy;
            }
        });

        return closestEnemy;
    }
    shootBullet() {
        if (!this.me || this.gameOver) return;

        const now = this.time.now;
        const cooldown = 1000 * this.playerStats.cooldownReduction;

        if (now - this.lastShotTime < cooldown) return;

        this.lastShotTime = now;
        this.shootSound.play({ volume: 0.2 });

        // Get direction to mouse
        const pointer = this.findClosestEnemy();
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

        // Calculate angle
        const angle = Phaser.Math.Angle.Between(this.me.x, this.me.y, worldPoint.x, worldPoint.y);

        // Send to server
        this.socket.emit("playerShoot", {
            x: this.me.x,
            y: this.me.y,
            angle: angle,
            damage: 1
        });
        this.shootBullet();
    }

    levelUp() {
        this.levelupSound.play();

        const flash = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0xFFFFFF, 0.5)
            .setScrollFactor(0)
            .setOrigin(0);

        this.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 500,
            onComplete: () => flash.destroy()
        });

        const levelUpText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2,
            'LEVEL UP!',
            { fontSize: '32px', fill: '#ffff00', stroke: '#000000', strokeThickness: 5 }
        ).setScrollFactor(0).setOrigin(0.5);

        this.tweens.add({
            targets: levelUpText,
            scale: 1.5,
            alpha: 0,
            duration: 1000,
            onComplete: () => {
                levelUpText.destroy();
                this.showUpgradeOptions();
            }
        });
    }

    showUpgradeOptions() {
        const bg = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x000000, 0.7)
            .setScrollFactor(0)
            .setOrigin(0);

        const title = this.add.text(
            this.cameras.main.width / 2,
            100,
            'Choose an Upgrade',
            { fontSize: '28px', fill: '#ffffff' }
        ).setScrollFactor(0).setOrigin(0.5);

        const options = [
            { text: 'Increase Max HP', effect: () => this.socket.emit("upgrade", "hp") },
            { text: 'Increase Damage', effect: () => this.socket.emit("upgrade", "damage") },
            { text: 'Reduce Cooldown', effect: () => this.socket.emit("upgrade", "cooldown") },
            { text: 'Increase Speed', effect: () => this.socket.emit("upgrade", "speed") }
        ];

        const optionButtons = [];

        options.forEach((option, i) => {
            const y = 200 + i * 80;
            const button = this.add.rectangle(this.cameras.main.width / 2, y, 300, 60, 0x3333aa)
                .setScrollFactor(0)
                .setInteractive();

            const text = this.add.text(
                this.cameras.main.width / 2,
                y,
                option.text,
                { fontSize: '20px', fill: '#ffffff' }
            ).setScrollFactor(0).setOrigin(0.5);

            button.on('pointerover', () => button.setFillStyle(0x5555cc));
            button.on('pointerout', () => button.setFillStyle(0x3333aa));

            button.on('pointerup', () => {
                option.effect();
                bg.destroy();
                title.destroy();
                optionButtons.forEach(btn => {
                    btn.button.destroy();
                    btn.text.destroy();
                });
            });

            optionButtons.push({ button, text });
        });
    }

    showGameOver() {
        const bg = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x000000, 0.8)
            .setScrollFactor(0)
            .setOrigin(0);

        const gameOverText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 - 50,
            'GAME OVER',
            { fontSize: '48px', fill: '#ff0000', stroke: '#000000', strokeThickness: 6 }
        ).setScrollFactor(0).setOrigin(0.5);

        const scoreText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 + 20,
            `Final Score: ${this.playerStats.score}`,
            { fontSize: '32px', fill: '#ffffff' }
        ).setScrollFactor(0).setOrigin(0.5);

        const restartButton = this.add.rectangle(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 + 100,
            200,
            60,
            0x3333aa
        ).setScrollFactor(0).setInteractive();

        const restartText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 + 100,
            'Restart',
            { fontSize: '24px', fill: '#ffffff' }
        ).setScrollFactor(0).setOrigin(0.5);

        restartButton.on('pointerover', () => restartButton.setFillStyle(0x5555cc));
        restartButton.on('pointerout', () => restartButton.setFillStyle(0x3333aa));
        restartButton.on('pointerup', () => window.location.reload());
    }

    updateUI() {
        // Health bar
        this.hpBar.clear();
        this.hpBar.fillStyle(0x333333, 1);
        this.hpBar.fillRect(20, 40, 200, 10);
        this.hpBar.fillStyle(0xFF0000, 1);
        this.hpBar.fillRect(20, 40, 200 * (this.playerStats.hp / this.playerStats.maxHp), 10);

        // Update text
        this.hpText.setText(`HP: ${this.playerStats.hp}/${this.playerStats.maxHp}`);
        this.levelText.setText(`Level: ${this.playerStats.level}`);

        // XP bar
        const requiredXp = this.playerStats.level * 80;
        const prevRequiredXp = (this.playerStats.level - 1) * 80;
        const xpProgress = (this.playerStats.xp - prevRequiredXp) / (requiredXp - prevRequiredXp);

        this.xpBar.clear();
        this.xpBar.fillStyle(0x333333, 1);
        this.xpBar.fillRect(20, 100, 200, 10);
        this.xpBar.fillStyle(0x00FF00, 1);
        this.xpBar.fillRect(20, 100, 200 * xpProgress, 10);

        this.xpText.setText(`XP: ${this.playerStats.xp}/${requiredXp}`);
        this.scoreText.setText(`Score: ${this.playerStats.score}`);
        this.waveText.setText(`Wave: ${this.currentWave || 0}`);

        const damageText = this.playerStats.damageMultiplier ?
            `${this.playerStats.damageMultiplier.toFixed(1)}x` : '1.0x';
        const speedText = this.playerStats.speedMultiplier ?
            `${this.playerStats.speedMultiplier.toFixed(1)}x` : '1.0x';

        this.statsText.setText(`Damage: ${damageText} | Speed: ${speedText}`);
    }

    update() {
        if (!this.me || this.gameOver) return;

        // Player movement
        let moved = false;
        const baseSpeed = 3;
        const speed = baseSpeed * (this.playerStats.speedMultiplier || 1);

        if (this.cursors.left.isDown) { this.me.x -= speed; moved = true; }
        if (this.cursors.right.isDown) { this.me.x += speed; moved = true; }
        if (this.cursors.up.isDown) { this.me.y -= speed; moved = true; }
        if (this.cursors.down.isDown) { this.me.y += speed; moved = true; }

        // Keep player within bounds
        this.me.x = Phaser.Math.Clamp(this.me.x, 0, 1600);
        this.me.y = Phaser.Math.Clamp(this.me.y, 0, 1200);

        // Send position to server if moved
        if (moved) {
            this.socket.emit("playerMove", { x: this.me.x, y: this.me.y });
        }



        // Update enemy HP text positions
        Object.values(this.enemies).forEach(enemy => {
            if (enemy.hpText) {
                enemy.hpText.setPosition(enemy.x - 20, enemy.y - 25);
            }
        });

        // Check for XP orb collection
        this.xpOrbs.forEach(orb => {
            if (Phaser.Math.Distance.Between(this.me.x, this.me.y, orb.x, orb.y) < 50) {
                this.socket.emit("collectXpOrb", orb.id);
            }
        });
    }
}

// Menu Scene
class MenuScene extends Phaser.Scene {
    constructor() {
        super("MenuScene");
    }

    preload() {
        this.load.image("background", "assets/background.png");
    }

    create() {
        // Add background
        this.add.image(400, 300, "background");

        // Title
        this.add.text(400, 150, "VAMPIRE SURVIVOR", {
            fontSize: '48px',
            fill: '#ff0000',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);

        // Start button
        const startButton = this.add.rectangle(400, 300, 200, 60, 0x3333aa)
            .setInteractive();

        const startText = this.add.text(400, 300, "START GAME", {
            fontSize: '24px',
            fill: '#ffffff'
        }).setOrigin(0.5);

        startButton.on('pointerover', () => startButton.setFillStyle(0x5555cc));
        startButton.on('pointerout', () => startButton.setFillStyle(0x3333aa));
        startButton.on('pointerup', () => this.scene.start("GameScene"));

        // Controls
        this.add.text(400, 400, "How to play:", {
            fontSize: '18px',
            fill: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        this.add.text(400, 450, "Arrow Keys to move\nClick to shoot\nSurvive as long as possible!", {
            fontSize: '16px',
            fill: '#ffffff',
            align: 'center'
        }).setOrigin(0.5);
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    pixelArt: true,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [MenuScene, GameScene]
};

window.onload = () => {
    new Phaser.Game(config);
};