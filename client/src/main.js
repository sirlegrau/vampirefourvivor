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
        this.weapons = [
            { name: "Basic Shot", damage: 1, cooldown: 1000, projectiles: 1, speed: 600, unlockLevel: 1 },
            { name: "Double Shot", damage: 1, cooldown: 1200, projectiles: 2, speed: 600, unlockLevel: 3 },
            { name: "Triple Shot", damage: 1, cooldown: 1500, projectiles: 3, speed: 600, unlockLevel: 5 },
            { name: "Quad Shot", damage: 1, cooldown: 1800, projectiles: 4, speed: 600, unlockLevel: 7 },
            { name: "Spread Shot", damage: 1, cooldown: 2000, projectiles: 5, spread: true, speed: 600, unlockLevel: 10 }
        ];
        this.currentWeapon = 0;
        this.canShoot = true;
        this.gameOver = false;
        this.waveInfo = { current: 0, next: 30 };
        this.magnetRange = 100; // XP magnet range
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
        this.load.audio("pickup", "assets/pickup.wav");
        this.load.audio("enemyDeath", "assets/enemyDeath.wav");
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
            three: Phaser.Input.Keyboard.KeyCodes.THREE,
            four: Phaser.Input.Keyboard.KeyCodes.FOUR,
            five: Phaser.Input.Keyboard.KeyCodes.FIVE,
            m: Phaser.Input.Keyboard.KeyCodes.M
        });

        // Initialize sounds
        this.shootSound = this.sound.add("shoot");
        this.hitSound = this.sound.add("hit");
        this.levelupSound = this.sound.add("levelup");
        this.pickupSound = this.sound.add("pickup", { volume: 0.5 });
        this.enemyDeathSound = this.sound.add("enemyDeath");

        // Set up weapon system
        this.setupWeaponSystem();

        // Add wave timer
        this.waveTimer = this.time.addEvent({
            delay: 1000,
            callback: this.updateWaveTimer,
            callbackScope: this,
            loop: true
        });
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

        // Wave info
        this.waveText = this.add.text(20, 170, "Wave: 0", { fontSize: '16px', fill: '#ffffff' });
        this.waveTimerText = this.add.text(20, 200, "Next Wave: 30s", { fontSize: '16px', fill: '#ffffff' });

        // Players alive
        this.playersText = this.add.text(20, 230, "Players: 1", { fontSize: '16px', fill: '#ffffff' });

        // Add all UI elements to group
        this.uiGroup.add(this.hpText);
        this.uiGroup.add(this.levelText);
        this.uiGroup.add(this.xpText);
        this.uiGroup.add(this.scoreText);
        this.uiGroup.add(this.weaponText);
        this.uiGroup.add(this.waveText);
        this.uiGroup.add(this.waveTimerText);
        this.uiGroup.add(this.playersText);

        // Make UI stick to camera
        this.hpBar.setScrollFactor(0);
        this.hpText.setScrollFactor(0);
        this.levelText.setScrollFactor(0);
        this.xpBar.setScrollFactor(0);
        this.xpText.setScrollFactor(0);
        this.scoreText.setScrollFactor(0);
        this.weaponText.setScrollFactor(0);
        this.waveText.setScrollFactor(0);
        this.waveTimerText.setScrollFactor(0);
        this.playersText.setScrollFactor(0);
    }

    setupSocketConnection() {
        // Connect to server (change to your server URL)
        this.socket = io("https://vampirefourvivor.onrender.com");

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
            this.updatePlayersCount();
            this.updateUI();
        });

        this.socket.on("newPlayer", (player) => {
            this.addPlayer(player.id, player.x, player.y, false);
            this.updatePlayersCount();
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
                this.updatePlayersCount();
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

                // Update HP text position
                if (this.enemies[data.id].hpText) {
                    this.enemies[data.id].hpText.setPosition(data.x, data.y - 20);
                }
            }
        });

        this.socket.on("enemyHit", (data) => {
            const enemy = this.enemies[data.id];
            if (enemy) {
                // Create hit effect
                this.hitSound.play();
                enemy.hp = data.hp;
                if (enemy.hpText) {
                    enemy.hpText.setText(`HP: ${Math.ceil(enemy.hp)}`);
                }
                this.tweens.add({
                    targets: enemy,
                    alpha: 0.5,
                    duration: 50,
                    yoyo: true
                });
            }
        });

        this.socket.on("enemyDestroyed", (id) => {
            const enemy = this.enemies[id];
            if (enemy) {
                // Create death animation
                this.enemyDeathSound.play();
                this.tweens.add({
                    targets: enemy,
                    alpha: 0,
                    scale: 1.5,
                    duration: 200,
                    onComplete: () => {
                        if (enemy.hpText) enemy.hpText.destroy();
                        enemy.destroy();
                        delete this.enemies[id];
                    }
                });
            }
        });

        this.socket.on("bulletCreated", (bullet) => {
            this.addBullet(bullet.id, bullet.x, bullet.y, bullet.velocityX, bullet.velocityY);
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
                if (data.level) this.playerStats.level = data.level;

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

        this.socket.on("updateScore", (data) => {
            if (data.id === this.socket.id) {
                this.playerStats.score = data.score;
                this.updateUI();
            }
        });

        this.socket.on("spawnXpOrb", (orb) => {
            this.addXpOrb(orb.x, orb.y, orb.value, orb.id);
        });

        this.socket.on("xpOrbCollected", (id) => {
            const orb = this.xpOrbs.find(o => o.id === id);
            if (orb) {
                if (orb.sprite) {
                    this.tweens.add({
                        targets: orb.sprite,
                        scale: 0,
                        duration: 200,
                        onComplete: () => orb.sprite.destroy()
                    });
                }

                if (orb.particles) {
                    orb.particles.destroy();
                }

                this.xpOrbs = this.xpOrbs.filter(o => o.id !== id);
                this.pickupSound.play();
            }
        });

        this.socket.on("waveStarted", (data) => {
            this.waveInfo.current = data.wave;
            this.waveInfo.next = 30;

            // Create wave announcement
            const waveText = this.add.text(
                this.cameras.main.width / 2,
                100,
                `WAVE ${data.wave}`,
                { fontSize: '48px', fill: '#ff0000', stroke: '#000000', strokeThickness: 4 }
            );
            waveText.setScrollFactor(0);
            waveText.setOrigin(0.5);

            this.tweens.add({
                targets: waveText,
                scale: 1.5,
                alpha: 0,
                duration: 2000,
                onComplete: () => waveText.destroy()
            });

            this.updateUI();
        });

        this.socket.on("playerUpgraded", (data) => {
            if (data.id === this.socket.id) {
                this.playerStats.maxHp = data.stats.maxHp;
                this.playerStats.hp = data.stats.hp;
                this.updateUI();
            }
        });

        this.socket.on("playerDied", (id) => {
            if (id === this.socket.id && !this.gameOver) {
                this.gameOver = true;
                this.showGameOver();
            }
        });

        this.socket.on("currentXpOrbs", (orbs) => {
            orbs.forEach(orb => this.addXpOrb(orb.x, orb.y, orb.value, orb.id));
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

    addEnemy(id, x, y, type = 'basic', hp = 3) {
        if (this.enemies[id]) return this.enemies[id];

        const enemy = this.add.image(x, y, "enemy");
        enemy.id = id;

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
        enemy.hpText = this.add.text(x, y - 20, `HP: ${Math.ceil(hp)}`, { fontSize: '12px', fill: '#ffffff' });
        enemy.hpText.setOrigin(0.5);
        enemy.type = type;
        enemy.hp = hp;
        this.enemies[id] = enemy;
        return enemy;
    }

    addBullet(id, x, y, velocityX, velocityY) {
        const bullet = this.add.image(x, y, "bullet");
        bullet.id = id;

        // Add trail effect
        const particles = this.add.particles(x, y, "bullet", {
            scale: { start: 0.5, end: 0 },
            alpha: { start: 0.5, end: 0 },
            speed: 20,
            lifespan: 200,
            quantity: 1,
            frequency: 60
        });

        bullet.particles = particles;
        this.bullets[id] = bullet;
        return bullet;
    }

    addXpOrb(x, y, value = 5, id = null) {
        const orbId = id || `orb-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const sprite = this.add.image(x, y, "experience");
        sprite.setScale(0.5);

        // Add particle effect
        const particles = this.add.particles(x, y, "experience", {
            scale: { start: 0.2, end: 0 },
            speed: 20,
            lifespan: 500,
            quantity: 1,
            frequency: 200
        });

        // Add attractive animation
        this.tweens.add({
            targets: sprite,
            scale: 0.6,
            duration: 500,
            yoyo: true,
            repeat: -1
        });

        const orb = { id: orbId, sprite, x, y, value, particles };
        this.xpOrbs.push(orb);
        return orb;
    }

    shootBullet() {
        if (!this.me || !this.canShoot || this.gameOver) return;

        const weapon = this.weapons[this.currentWeapon];

        // Play sound
        this.shootSound.play({ volume: 0.5 });

        // Temporarily disable shooting
        this.canShoot = false;
        this.time.delayedCall(weapon.cooldown, () => {
            this.canShoot = true;
        });

        // Get mouse position for angle calculation
        const pointer = this.input.activePointer;
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

        // Calculate angle between player and mouse
        const angle = Phaser.Math.Angle.Between(this.me.x, this.me.y, worldPoint.x, worldPoint.y);

        // Fire based on weapon type
        if (weapon.spread) {
            // Spread shot
            const spreadAngle = Math.PI / 6; // 30 degrees
            for (let i = 0; i < weapon.projectiles; i++) {
                const projectileAngle = angle - spreadAngle + (spreadAngle * 2 * i / (weapon.projectiles - 1));
                this.socket.emit("playerShoot", {
                    x: this.me.x,
                    y: this.me.y,
                    angle: projectileAngle,
                    damage: weapon.damage
                });
            }
        } else {
            // Multi-shot in same direction
            for (let i = 0; i < weapon.projectiles; i++) {
                // Add slight offset for multi-shots
                const offsetX = i > 0 ? Math.cos(angle + Math.PI/2) * (i * 10) : 0;
                const offsetY = i > 0 ? Math.sin(angle + Math.PI/2) * (i * 10) : 0;

                this.socket.emit("playerShoot", {
                    x: this.me.x + offsetX,
                    y: this.me.y + offsetY,
                    angle: angle,
                    damage: weapon.damage
                });
            }
        }
    }

    updateWaveTimer() {
        if (this.gameOver) return;

        if (this.waveInfo.next > 0) {
            this.waveInfo.next--;
            this.waveTimerText.setText(`Next Wave: ${this.waveInfo.next}s`);
        }
    }

    levelUp() {
        // Play level up sound
        this.levelupSound.play();

        // Show level up animation
        const levelUpText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2,
            "LEVEL UP!",
            { fontSize: '64px', fill: '#ffff00', stroke: '#000000', strokeThickness: 6 }
        );
        levelUpText.setOrigin(0.5);
        levelUpText.setScrollFactor(0);

        // Animate level up text
        this.tweens.add({
            targets: levelUpText,
            scale: 1.5,
            alpha: 0,
            duration: 1500,
            onComplete: () => levelUpText.destroy()
        });

        // Unlock new weapons if available
        this.updateAvailableWeapons();

        // Show upgrade options
        this.showUpgradeOptions();
    }

    updateAvailableWeapons() {
        const level = this.playerStats.level;

        // Check if new weapons are available
        let newWeaponUnlocked = false;
        for (let i = 0; i < this.weapons.length; i++) {
            if (this.weapons[i].unlockLevel === level) {
                newWeaponUnlocked = true;

                // Show weapon unlock notification
                const weaponText = this.add.text(
                    this.cameras.main.width / 2,
                    this.cameras.main.height / 2 + 50,
                    `New Weapon Unlocked: ${this.weapons[i].name}!`,
                    { fontSize: '24px', fill: '#00ffff', stroke: '#000000', strokeThickness: 4 }
                );
                weaponText.setOrigin(0.5);
                weaponText.setScrollFactor(0);

                this.tweens.add({
                    targets: weaponText,
                    alpha: 0,
                    y: this.cameras.main.height / 2 + 100,
                    duration: 2000,
                    onComplete: () => weaponText.destroy()
                });
            }
        }
    }

    showUpgradeOptions() {
        // Create upgrade popup
        const upgradePanel = this.add.rectangle(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2,
            400,
            300,
            0x000000,
            0.8
        );
        upgradePanel.setScrollFactor(0);

        const titleText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 - 120,
            "Choose an Upgrade",
            { fontSize: '24px', fill: '#ffffff' }
        );
        titleText.setOrigin(0.5);
        titleText.setScrollFactor(0);

        // Create upgrade buttons
        const upgradeOptions = [
            { text: "Health +2", type: "hp" },
            { text: "Damage +20%", type: "damage" },
            { text: "Cooldown -10%", type: "cooldown" }
        ];

        const buttons = [];
        upgradeOptions.forEach((option, index) => {
            const y = this.cameras.main.height / 2 - 50 + index * 60;
            const button = this.add.rectangle(
                this.cameras.main.width / 2,
                y,
                300,
                50,
                0x4444aa
            );
            button.setScrollFactor(0);
            button.setInteractive();

            const text = this.add.text(
                this.cameras.main.width / 2,
                y,
                option.text,
                { fontSize: '20px', fill: '#ffffff' }
            );
            text.setOrigin(0.5);
            text.setScrollFactor(0);

            button.on('pointerover', () => {
                button.setFillStyle(0x6666cc);
            });

            button.on('pointerout', () => {
                button.setFillStyle(0x4444aa);
            });

            button.on('pointerdown', () => {
                this.socket.emit("upgrade", option.type);

                // Remove upgrade UI
                buttons.forEach(b => {
                    b.rect.destroy();
                    b.text.destroy();
                });
                upgradePanel.destroy();
                titleText.destroy();

                // Resume game
                this.canShoot = true;
            });

            buttons.push({ rect: button, text: text });
        });

        // Temporarily disable shooting while upgrade menu is open
        this.canShoot = false;
    }

    updateUI() {
        // Update health bar
        this.hpBar.clear();
        this.hpBar.fillStyle(0x222222, 1);
        this.hpBar.fillRect(20, 40, 200, 15);
        this.hpBar.fillStyle(0xff0000, 1);
        this.hpBar.fillRect(20, 40, 200 * (this.playerStats.hp / this.playerStats.maxHp), 15);
        this.hpText.setText(`HP: ${this.playerStats.hp}/${this.playerStats.maxHp}`);

        // Update XP bar
        const xpNeeded = this.playerStats.level * 100;
        this.xpBar.clear();
        this.xpBar.fillStyle(0x222222, 1);
        this.xpBar.fillRect(20, 100, 200, 15);
        this.xpBar.fillStyle(0x00ff00, 1);
        this.xpBar.fillRect(20, 100, 200 * (this.playerStats.xp / xpNeeded), 15);
        this.xpText.setText(`XP: ${this.playerStats.xp}/${xpNeeded}`);

        // Update level and score
        this.levelText.setText(`Level: ${this.playerStats.level}`);
        this.scoreText.setText(`Score: ${this.playerStats.score}`);

        // Update weapon text
        if (this.weapons[this.currentWeapon]) {
            this.weaponText.setText(`Weapon: ${this.weapons[this.currentWeapon].name}`);
        }

        // Update wave info
        this.waveText.setText(`Wave: ${this.waveInfo.current}`);
        this.waveTimerText.setText(`Next Wave: ${this.waveInfo.next}s`);
    }

    updatePlayersCount() {
        const count = Object.keys(this.players).length;
        this.playersText.setText(`Players: ${count}`);
    }

    showGameOver() {
        // Display game over screen
        const gameOverText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 - 50,
            "GAME OVER",
            { fontSize: '64px', fill: '#ff0000', stroke: '#000000', strokeThickness: 6 }
        );
        gameOverText.setOrigin(0.5);
        gameOverText.setScrollFactor(0);

        const scoreText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 + 30,
            `Final Score: ${this.playerStats.score}`,
            { fontSize: '32px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4 }
        );
        scoreText.setOrigin(0.5);
        scoreText.setScrollFactor(0);

        const levelText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 + 80,
            `Level Reached: ${this.playerStats.level}`,
            { fontSize: '24px', fill: '#ffffff', stroke: '#000000', strokeThickness: 3 }
        );
        levelText.setOrigin(0.5);
        levelText.setScrollFactor(0);

        // Add restart button
        const restartButton = this.add.rectangle(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 + 150,
            200,
            50,
            0x4444aa
        );
        restartButton.setScrollFactor(0);
        restartButton.setInteractive();

        const restartText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2 + 150,
            "Play Again",
            { fontSize: '24px', fill: '#ffffff' }
        );
        restartText.setOrigin(0.5);
        restartText.setScrollFactor(0);

        restartButton.on('pointerover', () => {
            restartButton.setFillStyle(0x6666cc);
        });

        restartButton.on('pointerout', () => {
            restartButton.setFillStyle(0x4444aa);
        });

        restartButton.on('pointerdown', () => {
            // Refresh the page to restart
            window.location.reload();
        });
    }

    update() {
        if (this.gameOver) return;

        if (this.me) {
            // Handle player movement
            let moved = false;
            let velocityX = 0;
            let velocityY = 0;
            const speed = 3;

            if (this.cursors.left.isDown) {
                velocityX -= speed;
                moved = true;
            }
            if (this.cursors.right.isDown) {
                velocityX += speed;
                moved = true;
            }
            if (this.cursors.up.isDown) {
                velocityY -= speed;
                moved = true;
            }
            if (this.cursors.down.isDown) {
                velocityY += speed;
                moved = true;
            }

            // Apply diagonal movement normalization
            if (velocityX !== 0 && velocityY !== 0) {
                const factor = 1 / Math.sqrt(2);
                velocityX *= factor;
                velocityY *= factor;
            }

            if (moved) {
                // Update player position
                const newX = Math.max(0, Math.min(1600, this.me.x + velocityX));
                const newY = Math.max(0, Math.min(1200, this.me.y + velocityY));
                this.me.setPosition(newX, newY);

                // Emit player movement to server
                this.socket.emit("playerMove", { x: newX, y: newY });
            }

            // Update bullet particles
            Object.values(this.bullets).forEach(bullet => {
                if (bullet.particles) {
                    bullet.particles.setPosition(bullet.x, bullet.y);
                }
            });

            // Check for weapon switching
            if (Phaser.Input.Keyboard.JustDown(this.keys.one) && this.weapons[0].unlockLevel <= this.playerStats.level) {
                this.currentWeapon = 0;
                this.updateUI();
            } else if (Phaser.Input.Keyboard.JustDown(this.keys.two) && this.weapons[1].unlockLevel <= this.playerStats.level) {
                this.currentWeapon = 1;
                this.updateUI();
            } else if (Phaser.Input.Keyboard.JustDown(this.keys.three) && this.weapons[2].unlockLevel <= this.playerStats.level) {
                this.currentWeapon = 2;
                this.updateUI();
            } else if (Phaser.Input.Keyboard.JustDown(this.keys.four) && this.weapons[3].unlockLevel <= this.playerStats.level) {
                this.currentWeapon = 3;
                this.updateUI();
            } else if (Phaser.Input.Keyboard.JustDown(this.keys.five) && this.weapons[4].unlockLevel <= this.playerStats.level) {
                this.currentWeapon = 4;
                this.updateUI();
            }

            // Handle XP orb magnet when M key is pressed
            const magnetActive = this.keys.m.isDown;
            if (magnetActive) {
                this.xpOrbs.forEach(orb => {
                    if (orb.sprite) {
                        const distance = Phaser.Math.Distance.Between(this.me.x, this.me.y, orb.sprite.x, orb.sprite.y);
                        if (distance < this.magnetRange) {
                            // Calculate direction vector
                            const dx = this.me.x - orb.sprite.x;
                            const dy = this.me.y - orb.sprite.y;
                            const length = Math.sqrt(dx * dx + dy * dy);

                            // Normalize and apply speed
                            const moveSpeed = 5;
                            orb.sprite.x += (dx / length) * moveSpeed;
                            orb.sprite.y += (dy / length) * moveSpeed;

                            // Update particles position
                            if (orb.particles) {
                                orb.particles.setPosition(orb.sprite.x, orb.sprite.y);
                            }

                            // If close enough, collect the orb
                            if (distance < 30) {
                                this.socket.emit("collectXpOrb", orb.id);
                            }
                        }
                    }
                });
            }
        }
    }
}

// Configure the game
const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [GameScene]
};

// Create the game instance
const game = new Phaser.Game(config);

// Handle window resize
window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
});