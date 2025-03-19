import Phaser from "phaser";
import { io } from "socket.io-client";

class GameScene extends Phaser.Scene {
    constructor() {
        super("GameScene");
        this.players = {};
        this.enemies = {};
        this.bullets = [];
        this.playerStats = { hp: 5, maxHp: 5, xp: 0, level: 1, score: 0 };
        this.weapons = [
            { name: "Basic Shot", damage: 1, cooldown: 1000, projectiles: 1, speed: 600 },
            { name: "Double Shot", damage: 1, cooldown: 1200, projectiles: 2, speed: 600 },
            { name: "Triple Shot", damage: 1, cooldown: 1500, projectiles: 3, speed: 600 }
        ];
        this.currentWeapon = 0;
        this.canShoot = true;
        this.gameOver = false;
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

        // Set up socket connection
        this.setupSocketConnection();

        // Set up input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys({
            one: Phaser.Input.Keyboard.KeyCodes.ONE,
            two: Phaser.Input.Keyboard.KeyCodes.TWO,
            three: Phaser.Input.Keyboard.KeyCodes.THREE
        });

        // Initialize sounds
        this.shootSound = this.sound.add("shoot");
        this.hitSound = this.sound.add("hit");
        this.levelupSound = this.sound.add("levelup");

        // Set up automatic shooting
        this.setupWeaponSystem();
    }

    createUI() {
        this.uiGroup = this.add.group();

        // Health bar
        this.hpBar = this.add.graphics();
        this.hpText = this.add.text(20, 20, "HP: 5/5", { fontSize: '16px', fill: '#ffffff' });

        // Level and XP
        this.levelText = this.add.text(20, 50, "Level: 1", { fontSize: '16px', fill: '#ffffff' });
        this.xpBar = this.add.graphics();
        this.xpText = this.add.text(20, 80, "XP: 0/100", { fontSize: '16px', fill: '#ffffff' });

        // Score
        this.scoreText = this.add.text(20, 110, "Score: 0", { fontSize: '16px', fill: '#ffffff' });

        // Weapon display
        this.weaponText = this.add.text(20, 140, "Weapon: Basic Shot", { fontSize: '16px', fill: '#ffffff' });

        // Add all UI elements to group for camera scrolling
        this.uiGroup.add(this.hpText);
        this.uiGroup.add(this.levelText);
        this.uiGroup.add(this.xpText);
        this.uiGroup.add(this.scoreText);
        this.uiGroup.add(this.weaponText);

        // Make UI stick to camera
        this.uiGroup.setScrollFactor(0);
    }

    setupSocketConnection() {
        this.socket = io("http://localhost:3000");

        this.socket.on("currentPlayers", (players) => {
            Object.keys(players).forEach((id) => {
                const playerData = players[id];
                if (id === this.socket.id) {
                    this.playerStats = {
                        hp: playerData.hp,
                        maxHp: playerData.maxHp,
                        xp: playerData.xp,
                        level: playerData.level,
                        score: playerData.score || 0
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
                // Create hit effect
                this.hitSound.play();
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
                // Create death animation
                const enemy = this.enemies[data.enemyId];
                this.tweens.add({
                    targets: enemy,
                    alpha: 0,
                    scale: 1.5,
                    duration: 200,
                    onComplete: () => {
                        enemy.destroy();
                        delete this.enemies[data.enemyId];
                    }
                });

                // Spawn XP orb
                this.createXpOrb(enemy.x, enemy.y);

                // Update score if this player killed the enemy
                if (data.killerId === this.socket.id) {
                    this.playerStats.score += data.points || 10;
                    this.updateUI();
                }
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

                // Show damage effect on player
                this.tweens.add({
                    targets: this.me,
                    alpha: 0.5,
                    duration: 100,
                    yoyo: true
                });

                // Check for game over
                if (this.playerStats.hp <= 0 && !this.gameOver) {
                    this.gameOver = true;
                    this.showGameOver();
                }
            }
        });

        this.socket.on("spawnXpOrb", (data) => {
            this.createXpOrb(data.x, data.y, data.value, data.id);
        });

        this.socket.on("xpOrbCollected", (id) => {
            // Remove XP orb if it exists
            const orb = this.xpOrbs ? this.xpOrbs.find(o => o.id === id) : null;
            if (orb) {
                orb.destroy();
                this.xpOrbs = this.xpOrbs.filter(o => o.id !== id);
            }
        });
    }

    setupWeaponSystem() {
        // Set up shooting timer based on weapon cooldown
        this.shootTimer = this.time.addEvent({
            delay: this.weapons[this.currentWeapon].cooldown,
            callback: this.shootBullet,
            callbackScope: this,
            loop: true
        });
    }

    addEnemy(id, x, y, type = 'basic', hp = 3) {
        const enemy = this.add.image(x, y, "enemy");

        // Visual differences based on enemy type
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
                enemy.setTint(0xFFFF99);
                enemy.setScale(2);
                break;
            default:
                enemy.setTint(0xFFFFFF);
        }

        // Add HP text above enemy
        enemy.hpText = this.add.text(x, y - 20, `HP: ${hp}`, { fontSize: '12px', fill: '#ffffff' });
        enemy.type = type;
        enemy.hp = hp;
        this.enemies[id] = enemy;
        return enemy;
    }

    addPlayer(id, x, y, isMe = false) {
        const player = this.add.image(x, y, "player");

        if (isMe) {
            player.setTint(0x00FF00); // Green tint for current player
            // Set up camera to follow player
            this.cameras.main.startFollow(player, true, 0.05, 0.05);
        } else {
            player.setTint(0xFFFF00); // Yellow tint for other players
        }

        this.players[id] = player;
        return player;
    }

    createXpOrb(x, y, value = 5, id = null) {
        if (!this.xpOrbs) this.xpOrbs = [];

        const orbId = id || `orb-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const orb = this.add.image(x, y, "experience");
        orb.setScale(0.5);
        orb.id = orbId;
        orb.value = value;

        // Add attractive animation
        this.tweens.add({
            targets: orb,
            scale: 0.6,
            duration: 500,
            yoyo: true,
            repeat: -1
        });

        this.xpOrbs.push(orb);

        // Emit to server only if we're creating a new orb
        if (!id) {
            this.socket.emit("spawnXpOrb", { x, y, value, id: orbId });
        }

        return orb;
    }

    shootBullet() {
        if (!this.me || !this.canShoot || this.gameOver) return;

        const weapon = this.weapons[this.currentWeapon];

        // Play sound
        this.shootSound.play();

        // Temporarily disable shooting
        this.canShoot = false;
        this.time.delayedCall(weapon.cooldown, () => {
            this.canShoot = true;
        });

        // Create bullets based on weapon type
        switch(weapon.name) {
            case "Double Shot":
                this.createBullet(this.me.x - 10, this.me.y, 0, -weapon.speed, weapon.damage);
                this.createBullet(this.me.x + 10, this.me.y, 0, -weapon.speed, weapon.damage);
                break;
            case "Triple Shot":
                this.createBullet(this.me.x, this.me.y, 0, -weapon.speed, weapon.damage);
                this.createBullet(this.me.x - 15, this.me.y, -50, -weapon.speed, weapon.damage);
                this.createBullet(this.me.x + 15, this.me.y, 50, -weapon.speed, weapon.damage);
                break;
            default:
                this.createBullet(this.me.x, this.me.y, 0, -weapon.speed, weapon.damage);
        }
    }

    createBullet(x, y, velocityX, velocityY, damage) {
        const bullet = this.add.image(x, y, "bullet");
        bullet.damage = damage;
        this.bullets.push(bullet);

        // Move bullet in direction
        this.tweens.add({
            targets: bullet,
            x: bullet.x + velocityX,
            y: bullet.y + velocityY,
            duration: 1000,
            onComplete: () => {
                bullet.destroy();
                this.bullets = this.bullets.filter(b => b !== bullet);
            }
        });

        // Check for collisions
        this.checkBulletCollision(bullet);
    }

    checkBulletCollision(bullet) {
        this.time.addEvent({
            delay: 50,
            callback: () => {
                if (!bullet.active) return;

                Object.keys(this.enemies).forEach(enemyId => {
                    const enemy = this.enemies[enemyId];
                    if (enemy && Phaser.Math.Distance.Between(bullet.x, bullet.y, enemy.x, enemy.y) < 30) {
                        this.socket.emit("enemyHit", { enemyId, damage: bullet.damage });
                        bullet.destroy();
                        this.bullets = this.bullets.filter(b => b !== bullet);
                    }
                });
            },
            repeat: 20 // Check for 1 second
        });
    }

    checkXpCollection() {
        if (!this.me || !this.xpOrbs || this.xpOrbs.length === 0) return;

        for (let i = this.xpOrbs.length - 1; i >= 0; i--) {
            const orb = this.xpOrbs[i];
            if (Phaser.Math.Distance.Between(this.me.x, this.me.y, orb.x, orb.y) < 40) {
                this.socket.emit("collectXpOrb", orb.id);
                orb.destroy();
                this.xpOrbs.splice(i, 1);
            }
        }
    }

    levelUp() {
        // Play sound and show effect
        this.levelupSound.play();

        // Flash screen
        const flash = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0xFFFFFF, 0.5);
        flash.setScrollFactor(0);
        flash.setOrigin(0);

        this.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 500,
            onComplete: () => flash.destroy()
        });

        // Show level up text
        const levelUpText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2,
            'LEVEL UP!',
            { fontSize: '32px', fill: '#ffff00' }
        );
        levelUpText.setScrollFactor(0);
        levelUpText.setOrigin(0.5);

        this.tweens.add({
            targets: levelUpText,
            scale: 1.5,
            alpha: 0,
            duration: 1000,
            onComplete: () => levelUpText.destroy()
        });

        // Show upgrade options
        this.showUpgradeOptions();
    }

    showUpgradeOptions() {
        // Create black background
        const bg = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x000000, 0.7);
        bg.setScrollFactor(0);
        bg.setOrigin(0);

        // Create text
        const title = this.add.text(
            this.cameras.main.width / 2,
            100,
            'Choose an Upgrade',
            { fontSize: '28px', fill: '#ffffff' }
        );
        title.setScrollFactor(0);
        title.setOrigin(0.5);

        // Create options
        const options = [
            { text: 'Increase Max HP', effect: () => this.socket.emit("upgrade", "hp") },
            { text: 'Increase Damage', effect: () => this.socket.emit("upgrade", "damage") },
            { text: 'Reduce Cooldown', effect: () => this.socket.emit("upgrade", "cooldown") }
        ];

        const optionButtons = [];

        options.forEach((option, i) => {
            const y = 200 + i * 80;
            const button = this.add.rectangle(this.cameras.main.width / 2, y, 300, 60, 0x3333aa);
            button.setScrollFactor(0);
            button.setInteractive();

            const text = this.add.text(
                this.cameras.main.width / 2,
                y,
                option.text,
                { fontSize: '20px', fill: '#ffffff' }
            );
            text.setScrollFactor(0);
            text.setOrigin(0.5);

            button.on('pointerover', () => {
                button.setFillStyle(0x5555cc);
            });

            button.on('pointerout', () => {
                button.setFillStyle(0x3333aa);
            });

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
        // Create black background
        const bg = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x000000, 0.8);
        bg.setScrollFactor(0);
        bg.setOrigin(0);

        // Show game over text
        const gameOverText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 - 50,
            'GAME OVER',
            { fontSize: '48px', fill: '#ff0000' }
        );
        gameOverText.setScrollFactor(0);
        gameOverText.setOrigin(0.5);

        // Show score
        const scoreText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 + 20,
            `Final Score: ${this.playerStats.score}`,
            { fontSize: '32px', fill: '#ffffff' }
        );
        scoreText.setScrollFactor(0);
        scoreText.setOrigin(0.5);

        // Restart button
        const restartButton = this.add.rectangle(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 + 100,
            200,
            60,
            0x3333aa
        );
        restartButton.setScrollFactor(0);
        restartButton.setInteractive();

        const restartText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 + 100,
            'Restart',
            { fontSize: '24px', fill: '#ffffff' }
        );
        restartText.setScrollFactor(0);
        restartText.setOrigin(0.5);

        restartButton.on('pointerover', () => {
            restartButton.setFillStyle(0x5555cc);
        });

        restartButton.on('pointerout', () => {
            restartButton.setFillStyle(0x3333aa);
        });

        restartButton.on('pointerup', () => {
            window.location.reload();
        });
    }

    updateUI() {
        // Update health bar
        this.hpBar.clear();
        this.hpBar.fillStyle(0x333333, 1);
        this.hpBar.fillRect(20, 40, 200, 10);
        this.hpBar.fillStyle(0xFF0000, 1);
        this.hpBar.fillRect(20, 40, 200 * (this.playerStats.hp / this.playerStats.maxHp), 10);

        // Update text
        this.hpText.setText(`HP: ${this.playerStats.hp}/${this.playerStats.maxHp}`);
        this.levelText.setText(`Level: ${this.playerStats.level}`);

        // XP bar (assuming 100 XP per level)
        const nextLevelXp = this.playerStats.level * 100;
        const currentLevelXp = (this.playerStats.level - 1) * 100;
        const xpProgress = (this.playerStats.xp - currentLevelXp) / (nextLevelXp - currentLevelXp);

        this.xpBar.clear();
        this.xpBar.fillStyle(0x333333, 1);
        this.xpBar.fillRect(20, 100, 200, 10);
        this.xpBar.fillStyle(0x00FF00, 1);
        this.xpBar.fillRect(20, 100, 200 * xpProgress, 10);

        this.xpText.setText(`XP: ${this.playerStats.xp}/${nextLevelXp}`);
        this.scoreText.setText(`Score: ${this.playerStats.score}`);
        this.weaponText.setText(`Weapon: ${this.weapons[this.currentWeapon].name}`);
    }

    update() {
        if (!this.me || this.gameOver) return;

        // Player movement
        let moved = false;
        const speed = 3; // Movement speed

        if (this.cursors.left.isDown) { this.me.x -= speed; moved = true; }
        if (this.cursors.right.isDown) { this.me.x += speed; moved = true; }
        if (this.cursors.up.isDown) { this.me.y -= speed; moved = true; }
        if (this.cursors.down.isDown) { this.me.y += speed; moved = true; }

        // Weapon switching
        if (Phaser.Input.Keyboard.JustDown(this.keys.one)) {
            this.currentWeapon = 0;
            this.shootTimer.delay = this.weapons[this.currentWeapon].cooldown;
            this.updateUI();
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.two) && this.playerStats.level >= 3) {
            this.currentWeapon = 1;
            this.shootTimer.delay = this.weapons[this.currentWeapon].cooldown;
            this.updateUI();
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.three) && this.playerStats.level >= 5) {
            this.currentWeapon = 2;
            this.shootTimer.delay = this.weapons[this.currentWeapon].cooldown;
            this.updateUI();
        }

        // Send position to server if moved
        if (moved) {
            this.socket.emit("playerMove", { x: this.me.x, y: this.me.y });
        }

        // Check for XP orb collection
        this.checkXpCollection();

        // Update enemy HP text positions
        Object.values(this.enemies).forEach(enemy => {
            if (enemy.hpText) {
                enemy.hpText.setPosition(enemy.x - 15, enemy.y - 20);
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
        this.load.image("background", "assets/menu_bg.png");
        this.load.image("title", "assets/title.png");
    }

    create() {
        // Add background
        this.add.image(400, 300, "background");

        // Add title
        const title = this.add.image(400, 150, "title");
        if (!title.texture.key) {
            // Fallback if image not found
            this.add.text(400, 150, "VAMPIRE FOURVIVOR", {
                fontSize: '48px',
                fill: '#ff0000',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 6
            }).setOrigin(0.5);
        }

        // Start button
        const startButton = this.add.rectangle(400, 300, 200, 60, 0x3333aa);
        startButton.setInteractive();

        const startText = this.add.text(400, 300, "START GAME", {
            fontSize: '24px',
            fill: '#ffffff'
        }).setOrigin(0.5);

        startButton.on('pointerover', () => {
            startButton.setFillStyle(0x5555cc);
        });

        startButton.on('pointerout', () => {
            startButton.setFillStyle(0x3333aa);
        });

        startButton.on('pointerup', () => {
            this.scene.start("GameScene");
        });

        // How to play
        const instructionsText = this.add.text(400, 400, "How to play:", {
            fontSize: '18px',
            fill: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const controls = this.add.text(400, 450, "Arrow Keys to move\n1-3 to switch weapons\nSurvive as long as possible!", {
            fontSize: '16px',
            fill: '#ffffff',
            align: 'center'
        }).setOrigin(0.5);

        // Credits
        this.add.text(400, 550, "Created with Phaser & Socket.IO", {
            fontSize: '12px',
            fill: '#cccccc'
        }).setOrigin(0.5);
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [MenuScene, GameScene]
};

new Phaser.Game(config);