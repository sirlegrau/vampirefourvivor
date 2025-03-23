import Phaser from "phaser";
import { io } from "socket.io-client";

class GameScene extends Phaser.Scene {
    constructor() {
        super("GameScene");
        this.players = {};
        this.enemies = {};
        this.bullets = {};
        this.xpOrbs = [];
        this.playerStats = {hp: 3, maxHp: 3, xp: 0, level: 1, score: 0};
        this.gameOver = false;
        this.socketUrl = import.meta.env.VITE_SERVER_URL || "https://vampirefourvivor.onrender.com";
        this.isMobile = false;
        this.playerName = "Player"; // Default player name
    }


    preload() {
        // Load assets
        this.load.image("player", "assets/player.png");
        this.load.image("enemy", "assets/enemy.png");
        this.load.image("bullet", "assets/bullet.png");
        this.load.image("experience", "assets/experience.png");
        this.load.image("background", "assets/background.png");
        this.load.image("joystick", "assets/joystick.png");
        this.load.image("joystickBase", "assets/joystick_base.png");
        this.load.audio("shoot", "assets/shoot.wav");
        this.load.audio("hit", "assets/hit.wav");
        this.load.audio("levelup", "assets/levelup.wav");
    }

    create() {
        // Check if mobile device
        this.isMobile = this.game.device.os.android ||
            this.game.device.os.iOS ||
            (this.game.config.width < 800);

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

        // Set up input for desktop
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys({
            one: Phaser.Input.Keyboard.KeyCodes.ONE,
            two: Phaser.Input.Keyboard.KeyCodes.TWO,
            three: Phaser.Input.Keyboard.KeyCodes.THREE
        });

        // Create virtual joystick for mobile
        if (this.isMobile) {
            this.createVirtualJoystick();
        }

        // Set up socket connection
        this.setupSocketConnection();

        // Set up shooting timer
        this.lastShotTime = 0;

        // Store number of bullets to shoot (powerup)
        this.bulletsPerShot = 1;

        // Handle game resize
        this.scale.on('resize', this.resizeGame, this);
        this.resizeGame();
    }

    resizeGame() {
        const width = this.scale.gameSize.width;
        const height = this.scale.gameSize.height;

        this.isMobile = width < 800;

        // Reposition UI elements
        this.updateUIPositions(width, height);

        // Reposition virtual joystick if on mobile
        if (this.isMobile && this.joyStick) {
            const joystickX = width * 0.25;
            const joystickY = height - height * 0.15;
            this.updateJoystickPosition(joystickX, joystickY);
        }
    }

    // Added helper function to reduce duplication
    updateJoystickPosition(x, y) {
        if (!this.joyStick) return;
        this.joyStick.base.setPosition(x, y);
        this.joyStick.thumb.setPosition(x, y);
    }

    updateUIPositions(width, height) {
        if (!this.uiGroup) return;

        const isPortrait = height > width;
        const scaleFactor = isPortrait ?
            Math.min(width / 400, 1) :  // More aggressive scaling for portrait
            Math.min(width / 800, 1);

        const fontSize = Math.max(12, Math.floor(16 * scaleFactor));
        const padding = Math.max(10, Math.floor(20 * scaleFactor));

        // Update font sizes for all UI text elements
        [this.hpText, this.levelText, this.xpText, this.scoreText, this.waveText, this.statsText]
            .forEach(text => text.setFontSize(fontSize));

        // Calculate the bar width based on available space
        const barWidth = Math.min(width * 0.6, 200 * scaleFactor);

        // In portrait mode, we might want to move UI to the top
        // and make it more compact
        const verticalSpacing = isPortrait ? fontSize * 1.2 : fontSize * 1.5;

        // Position HP elements
        this.hpText.setPosition(padding, padding);
        this.hpBar.clear();
        this.hpBar.fillStyle(0x333333, 1);
        this.hpBar.fillRect(padding, padding + fontSize + 4, barWidth, 6 * scaleFactor);

        // Position level text with proper spacing
        const levelY = padding + fontSize + 6 * scaleFactor + 8;
        this.levelText.setPosition(padding, levelY);

        // Position XP elements
        const xpBarY = levelY + fontSize + 8;
        this.xpBar.clear();
        this.xpBar.fillStyle(0x333333, 1);
        this.xpBar.fillRect(padding, xpBarY, barWidth, 6 * scaleFactor);

        this.xpText.setPosition(padding, xpBarY + 6 * scaleFactor + 8);

        // Position remaining elements with even spacing
        const scoreY = xpBarY + 6 * scaleFactor + fontSize + 16;
        this.scoreText.setPosition(padding, scoreY);
        this.waveText.setPosition(padding, scoreY + verticalSpacing);

        // For stats text, we may need to adjust the content for small screens
        if (isPortrait && width < 400) {
            // Simplified stats display for very small screens
            const damageText = this.playerStats.damageMultiplier ?
                `DMG: ${this.playerStats.damageMultiplier.toFixed(1)}x` : 'DMG: 1.0x';
            const speedText = this.playerStats.speedMultiplier ?
                `SPD: ${this.playerStats.speedMultiplier.toFixed(1)}x` : 'SPD: 1.0x';
            const bulletText = `BUL: ${this.bulletsPerShot || 1}`;

            this.statsText.setText(`${damageText}\n${speedText}\n${bulletText}`);
        } else {
            // Standard stats display
            const damageText = this.playerStats.damageMultiplier ?
                `${this.playerStats.damageMultiplier.toFixed(1)}x` : '1.0x';
            const speedText = this.playerStats.speedMultiplier ?
                `${this.playerStats.speedMultiplier.toFixed(1)}x` : '1.0x';
            const bulletText = this.bulletsPerShot || 1;

            this.statsText.setText(`Damage: ${damageText} | Speed: ${speedText} | Bullets: ${bulletText}`);
        }

        this.statsText.setPosition(padding, scoreY + verticalSpacing * 2);

        this.updateUI(); // Redraw UI elements with current stats
    }

    createVirtualJoystick() {
        const height = this.cameras.main.height;
        const width = this.cameras.main.width;
        const isPortrait = height > width;

        // Position joystick in the lower left, adjusted for portrait/landscape
        const joystickX = isPortrait ? width * 0.25 : 150;
        const joystickY = isPortrait ? height - height * 0.15 : height - 150;

        this.joyStick = {
            base: this.add.image(joystickX, joystickY, 'joystickBase')
                .setScrollFactor(0)
                .setAlpha(0.6) // Made base transparent directly here
                .setDepth(1000)
                .setScale(1.5),
            thumb: this.add.image(joystickX, joystickY, 'joystick')
                .setScrollFactor(0)
                .setAlpha(0.7)
                .setDepth(1001)
                .setScale(0.7),
            vector: new Phaser.Math.Vector2(),
            isActive: false
        };

        // Determine touch areas based on orientation
        const joystickTouchArea = isPortrait ?
            {x: 0, y: height * 0.5, width: width * 0.5, height: height * 0.5} :
            {x: 0, y: height - 300, width: width * 0.5, height: 300};

        // Handle touch/pointer down events
        this.input.on('pointerdown', (pointer) => {
            // Check if touch is in joystick area
            if (pointer.y > joystickTouchArea.y &&
                pointer.x < joystickTouchArea.width &&
                pointer.y < joystickTouchArea.y + joystickTouchArea.height) {
                this.joyStick.isActive = true;
                this.updateJoystickPosition(pointer.x, pointer.y);
            } else if (!this.gameOver) {
                // Shooting with touch (right side of screen)
                this.manualShoot(pointer);
            }
        });

        // Handle pointer move events for joystick
        this.input.on('pointermove', (pointer) => {
            if (this.joyStick.isActive) {
                const distance = Phaser.Math.Distance.Between(
                    this.joyStick.base.x, this.joyStick.base.y,
                    pointer.x, pointer.y
                );

                const maxDistance = 75;

                if (distance <= maxDistance) {
                    this.joyStick.thumb.setPosition(pointer.x, pointer.y);
                } else {
                    const angle = Phaser.Math.Angle.Between(
                        this.joyStick.base.x, this.joyStick.base.y,
                        pointer.x, pointer.y
                    );

                    this.joyStick.thumb.setPosition(
                        this.joyStick.base.x + maxDistance * Math.cos(angle),
                        this.joyStick.base.y + maxDistance * Math.sin(angle)
                    );
                }

                // Calculate joystick vector (normalized)
                this.joyStick.vector.x = this.joyStick.thumb.x - this.joyStick.base.x;
                this.joyStick.vector.y = this.joyStick.thumb.y - this.joyStick.base.y;
                this.joyStick.vector.normalize();
            }
        });

        // Handle pointer up events
        this.input.on('pointerup', () => {
            this.joyStick.isActive = false;
            this.joyStick.vector.x = 0;
            this.joyStick.vector.y = 0;
            this.updateJoystickPosition(this.joyStick.base.x, this.joyStick.base.y);
        });
    }

    manualShoot(pointer) {
        if (!this.me || this.gameOver) return;

        const now = this.time.now;
        const cooldown = 1000 * this.playerStats.cooldownReduction;

        if (now - this.lastShotTime < cooldown) return;

        this.lastShotTime = now;
        this.shootSound.play({volume: 0.2});

        // Get world position of the pointer
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

        // Calculate angle to the touch point
        const angle = Phaser.Math.Angle.Between(this.me.x, this.me.y, worldPoint.x, worldPoint.y);

        // Shoot multiple bullets if we have the powerup
        this.shootBullets(angle);
    }

    // Added helper function to reduce duplication between manual and auto shooting
    shootBullets(angle) {
        for (let i = 0; i < this.bulletsPerShot; i++) {
            // Add a small spread for additional bullets
            const bulletAngle = i === 0 ? angle : angle + (Math.random() * 0.4 - 0.2);

            // Shoot with slight delay for visual effect
            setTimeout(() => {
                this.socket.emit("playerShoot", {
                    x: this.me.x,
                    y: this.me.y,
                    angle: bulletAngle,
                    damage: 1
                });
            }, i * 50);
        }
    }

    createUI() {
        this.uiGroup = this.add.group();

        // Common style for UI elements
        const uiStyle = {fontSize: '16px', fill: '#ffffff'};
        const uiDepth = 100;

        // Health bar
        this.hpBar = this.add.graphics().setScrollFactor(0).setDepth(uiDepth);
        this.hpText = this.add.text(20, 20, "HP: 5/5", uiStyle)
            .setScrollFactor(0)
            .setDepth(uiDepth);

        // Level and XP
        this.levelText = this.add.text(20, 50, "Level: 1", uiStyle)
            .setScrollFactor(0)
            .setDepth(uiDepth);
        this.xpBar = this.add.graphics().setScrollFactor(0).setDepth(uiDepth);
        this.xpText = this.add.text(20, 80, "XP: 0/80", uiStyle)
            .setScrollFactor(0)
            .setDepth(uiDepth);

        // Score
        this.scoreText = this.add.text(20, 110, "Score: 0", uiStyle)
            .setScrollFactor(0)
            .setDepth(uiDepth);

        // Current wave
        this.waveText = this.add.text(20, 140, "Wave: 0", uiStyle)
            .setScrollFactor(0)
            .setDepth(uiDepth);

        // Stats
        this.statsText = this.add.text(20, 170, "Damage: 1x | Speed: 1x | Bullets: 1", uiStyle)
            .setScrollFactor(0)
            .setDepth(uiDepth);
    }

    setupSocketConnection() {
        this.socket = io(this.socketUrl);
        this.socket.emit("playerName", this.playerName);


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
                        speedMultiplier: playerData.speedMultiplier || 1,
                        bulletsPerShot: playerData.bulletsPerShot || 1
                    };
                    this.bulletsPerShot = this.playerStats.bulletsPerShot || 1;
                    this.me = this.addPlayer(id, playerData.x, playerData.y, true);
                } else {
                    this.addPlayer(id, playerData.x, playerData.y, false);
                }
            });
            this.updateUI();
        });

        // Setup all other socket events
        this.setupPlayerSocketEvents();
        this.setupEnemySocketEvents();
        this.setupBulletSocketEvents();
        this.setupXpSocketEvents();
        this.setupGameStateSocketEvents();

    }

    // Split socket events into logical groups for better organization
    setupPlayerSocketEvents() {
        this.socket.on("newPlayer", (player) => {
            this.addPlayer(player.id, player.x, player.y, false);
        });

        this.socket.on("playerMoved", (data) => {
            if (this.players[data.id]) {
                this.players[data.id].setPosition(data.x, data.y);

                // Update name text position for the moved player
                if (this.players[data.id].nameText) {
                    this.players[data.id].nameText.setPosition(data.x, data.y + 25);
                }
            }
        });

        this.socket.on("playerDisconnected", (id) => {
            if (this.players[id]) {
                if (this.players[id].nameText) {
                    this.players[id].nameText.destroy();
                }
                this.players[id].destroy();
                delete this.players[id];
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

        this.socket.on("updateScore", (data) => {
            if (data.id === this.socket.id) {
                this.playerStats.score = data.score;
                this.updateUI();
            }
        });

        this.socket.on("playerUpgraded", (data) => {
            if (data.id === this.socket.id) {
                this.playerStats.maxHp = data.stats.maxHp;
                this.playerStats.hp = data.stats.hp;
                this.playerStats.damageMultiplier = data.stats.damageMultiplier;
                this.playerStats.cooldownReduction = data.stats.cooldownReduction;
                this.playerStats.speedMultiplier = data.stats.speedMultiplier;
                this.playerStats.bulletsPerShot = data.stats.bulletsPerShot || this.playerStats.bulletsPerShot;
                this.bulletsPerShot = this.playerStats.bulletsPerShot;
                this.updateUI();
            }
        });

        this.socket.on("playerDied", (id) => {
            if (id === this.socket.id && !this.gameOver) {
                this.gameOver = true;
                this.showGameOver();
            }
        });
    }

    setupEnemySocketEvents() {
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

                this.hitSound.play({volume: 0.3});
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
    }

    setupBulletSocketEvents() {
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
    }

    setupXpSocketEvents() {
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

        this.socket.on("currentXpOrbs", (orbs) => {
            orbs.forEach(orb => this.addXpOrb(orb.id, orb.x, orb.y, orb.value));
        });

    }
    setupGameStateSocketEvents() {
        this.socket.on("waveStarted", (data) => {
            this.currentWave = data.wave;
            this.updateUI();

            const waveText = this.add.text(
                this.cameras.main.width / 2,
                100,
                `WAVE ${data.wave}`,
                {fontSize: '32px', fill: '#ffffff', stroke: '#000000', strokeThickness: 4}
            );
            waveText.setScrollFactor(0);
            waveText.setOrigin(0.5);
            waveText.setDepth(110);

            this.tweens.add({
                targets: waveText,
                alpha: 0,
                y: 80,
                duration: 2000,
                onComplete: () => waveText.destroy()
            });
        });
    }
    init(data) {
        if (data && data.playerName) {
            this.playerName = data.playerName;
        }
    }

    addPlayer(id, x, y, isMe = false) {
        const player = this.add.image(x, y, "player");

        // Add name text below the player
        const nameText = this.add.text(x, y + 25, isMe ? this.playerName : "Player", {
            fontSize: '12px',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
            align: 'center'
        }).setOrigin(0.5);

        if (isMe) {
            player.setTint(0x00FF00);
            this.cameras.main.startFollow(player, true, 0.05, 0.05);
            player.nameText = nameText;
        } else {
            player.setTint(0xFFFF00);
            // For other players, use a generic name or get it from server if implemented
            player.nameText = nameText;
        }

        this.players[id] = player;
        return player;
    }


    addEnemy(id, x, y, type = 'basic', hp = 3) {
        if (this.enemies[id]) return;

        const enemy = this.add.image(x, y, "enemy");

        switch (type) {
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

        // Create smaller HP text on mobile
        const fontSize = this.isMobile ? '10px' : '12px';
        enemy.hpText = this.add.text(x, y - 20, `HP: ${Math.ceil(hp)}`, {
            fontSize: fontSize,
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

    findNearestEnemy() {
        if (!this.me) return null;

        let nearestEnemy = null;
        let shortestDistance = Infinity;

        Object.values(this.enemies).forEach(enemy => {
            const distance = Phaser.Math.Distance.Between(this.me.x, this.me.y, enemy.x, enemy.y);
            if (distance < shortestDistance) {
                shortestDistance = distance;
                nearestEnemy = enemy;
            }
        });

        return {enemy: nearestEnemy, distance: shortestDistance};
    }

    autoShoot() {
        if (!this.me || this.gameOver) return;

        const now = this.time.now;
        const cooldown = 1000 * this.playerStats.cooldownReduction;

        if (now - this.lastShotTime < cooldown) return;

        const nearest = this.findNearestEnemy();
        if (!nearest || !nearest.enemy) return;

        this.lastShotTime = now;
        this.shootSound.play({volume: 0.2});

        // Calculate angle to the enemy
        const angle = Phaser.Math.Angle.Between(this.me.x, this.me.y, nearest.enemy.x, nearest.enemy.y);

        // Reuse shooting logic
        this.shootBullets(angle);
    }

    levelUp() {
        this.levelupSound.play();

        const flash = this.add.rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0xFFFFFF, 0.5)
            .setScrollFactor(0)
            .setOrigin(0)
            .setDepth(200);

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
            {fontSize: '32px', fill: '#ffff00', stroke: '#000000', strokeThickness: 5}
        ).setScrollFactor(0).setOrigin(0.5).setDepth(201);

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
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const isMobile = this.isMobile;

        const bg = this.add.rectangle(0, 0, width, height, 0x000000, 0.7)
            .setScrollFactor(0)
            .setOrigin(0)
            .setDepth(300);

        const titleSize = isMobile ? '22px' : '28px';
        const buttonWidth = isMobile ? width * 0.8 : 400;
        const buttonHeight = isMobile ? 50 : 60;
        const textSize = isMobile ? '16px' : '20px';

        const title = this.add.text(
            width / 2,
            isMobile ? 70 : 100,
            'Choose an AWESOME Upgrade',
            {fontSize: titleSize, fill: '#ff0000', stroke: '#000000', strokeThickness: 3}
        ).setScrollFactor(0).setOrigin(0.5).setDepth(301);

        const options = [
            {text: '+ 3 MAX HP & FULL HEAL', effect: () => this.socket.emit("upgrade", "hp")},
            {text: '+ 50% DAMAGE', effect: () => this.socket.emit("upgrade", "damage")},
            {text: '+ 30% ATTACK SPEED', effect: () => this.socket.emit("upgrade", "cooldown")},
            {text: '+ 30% MOVEMENT SPEED', effect: () => this.socket.emit("upgrade", "speed")},
            {text: '+ 1 BULLET PER SHOT', effect: () => this.socket.emit("upgrade", "multishot")}
        ];

        const optionButtons = [];
        const startY = isMobile ? 140 : 200;
        const spacing = isMobile ? 60 : 70;

        options.forEach((option, i) => {
            const y = startY + i * spacing;
            const button = this.add.rectangle(width / 2, y, buttonWidth, buttonHeight, 0x3333aa)
                .setScrollFactor(0)
                .setInteractive()
                .setDepth(301);

            const text = this.add.text(
                width / 2,
                y,
                option.text,
                {fontSize: textSize, fill: '#ffffff', stroke: '#000000', strokeThickness: 2}
            ).setScrollFactor(0).setOrigin(0.5).setDepth(302);

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

            optionButtons.push({button, text});
        });
    }

    showGameOver() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const isMobile = this.isMobile;

        const bg = this.add.rectangle(0, 0, width, height, 0x000000, 0.8)
            .setScrollFactor(0)
            .setOrigin(0)
            .setDepth(400);

        const gameOverSize = isMobile ? '36px' : '48px';
        const scoreSize = isMobile ? '24px' : '32px';
        const buttonWidth = isMobile ? 160 : 200;

        const gameOverText = this.add.text(
            width / 2,
            height / 2 - 50,
            'GAME OVER',
            {fontSize: gameOverSize, fill: '#ff0000', stroke: '#000000', strokeThickness: 6}
        ).setScrollFactor(0).setOrigin(0.5).setDepth(401);

        const scoreText = this.add.text(
            width / 2,
            height / 2 + 20,
            `Final Score: ${this.playerStats.score}`,
            {fontSize: scoreSize, fill: '#ffffff'}
        ).setScrollFactor(0).setOrigin(0.5).setDepth(401);

        const restartButton = this.add.rectangle(
            width / 2,
            height / 2 + 100,
            buttonWidth,
            60,
            0x3333aa
        ).setScrollFactor(0).setInteractive().setDepth(401);

        const restartText = this.add.text(
            width / 2,
            height / 2 + 100,
            'Restart',
            {fontSize: '24px', fill: '#ffffff'}
        ).setScrollFactor(0).setOrigin(0.5).setDepth(402);

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
        const requiredXp = Math.floor(20 * Math.pow(this.playerStats.level, 1.4));
        const prevRequiredXp = Math.floor(20 * Math.pow(this.playerStats.level-1, 1.4));
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
        const bulletText = this.bulletsPerShot || 1;

        this.statsText.setText(`Damage: ${damageText} | Speed: ${speedText} | Bullets: ${bulletText}`);
    }

// Replace the update() method in GameScene with this version:

// In the update method, change the XP orb collection logic to:
    update() {
        if (!this.me || this.gameOver) return;

        // Player movement
        let moved = false;
        const baseSpeed = 3;
        const speed = baseSpeed * (this.playerStats.speedMultiplier || 1);

        // Keyboard movement for desktop
        if (this.cursors.left.isDown) {
            this.me.x -= speed;
            moved = true;
        }
        if (this.cursors.right.isDown) {
            this.me.x += speed;
            moved = true;
        }
        if (this.cursors.up.isDown) {
            this.me.y -= speed;
            moved = true;
        }
        if (this.cursors.down.isDown) {
            this.me.y += speed;
            moved = true;
        }

        // Joystick movement for mobile
        if (this.joyStick && this.joyStick.isActive &&
            (this.joyStick.vector.x !== 0 || this.joyStick.vector.y !== 0)) {
            // Apply the joystick vector to move the player
            this.me.x += this.joyStick.vector.x * speed;
            this.me.y += this.joyStick.vector.y * speed;
            moved = true;
        }

        // Keep player within bounds
        this.me.x = Phaser.Math.Clamp(this.me.x, 0, 1600);
        this.me.y = Phaser.Math.Clamp(this.me.y, 0, 1200);

        // Send position to server if moved
        if (moved) {
            this.socket.emit("playerMove", {x: this.me.x, y: this.me.y});

            // Update name text position
            if (this.me.nameText) {
                this.me.nameText.setPosition(this.me.x, this.me.y + 25);
            }
        }
        Object.values(this.players).forEach(player => {
            if (player !== this.me && player.nameText) {
                player.nameText.setPosition(player.x, player.y + 25);
            }
        });

        // Auto-shooting
        this.autoShoot();

        // Update enemy HP text positions
        Object.values(this.enemies).forEach(enemy => {
            if (enemy.hpText) {
                enemy.hpText.setPosition(enemy.x - 20, enemy.y - 25);
            }
        });

        // Check for XP orb collection - FIXED VERSION
        if (this.me) {
            const magnetismRadius = 100;
            // Create a copy of the array to safely iterate over
            const orbsToCheck = [...this.xpOrbs];

            // Use for loop with index to safely handle array modification
            for (let i = 0; i < orbsToCheck.length; i++) {
                const orb = orbsToCheck[i];
                if (Phaser.Math.Distance.Between(this.me.x, this.me.y, orb.x, orb.y) < magnetismRadius) {
                    this.socket.emit("collectXpOrb", orb.id);
                    // Don't modify this.xpOrbs here - it will be handled by the socket event
                }
            }
        }
    }
}
class MenuScene extends Phaser.Scene {
    constructor() {
        super("MenuScene");
        this.playerName = "Player"; // Default player name
        this.isEditing = false; // Track if we're currently editing the name
        this.cursorBlinkTimer = null; // For cursor blinking effect
        this.showCursor = false; // Cursor visibility state
    }

    preload() {
        this.load.image("background", "assets/background.png");
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const isPortrait = height > width;

        // Add background (stretched to cover the whole screen)
        this.add.tileSprite(0, 0, width, height, "background").setOrigin(0, 0);

        // Title - adjust position and font size based on orientation
        const titleSize = isPortrait ? '32px' : '48px';
        const titleY = isPortrait ? height * 0.15 : 100;

        this.add.text(width / 2, titleY, "FLOROTINGUS KILLER\n(EXXXTREME EDITION)\nFINAL 3 PLUS", {
            fontSize: titleSize,
            fill: '#ff0000',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5);

        // Add player name input
        const inputY = isPortrait ? height * 0.35 : 200;

        // Add text prompt above the field
        this.add.text(width / 2, inputY - 40, "Enter your name:", {
            fontSize: '18px',
            fill: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        // Create a white rectangle as the input field background
        const inputWidth = isPortrait ? width * 0.6 : 200;
        const inputRect = this.add.rectangle(width / 2, inputY, inputWidth, 40, 0xFFFFFF, 0.8)
            .setInteractive();

        // Create a black border around the input field
        this.inputBorder = this.add.rectangle(width / 2, inputY, inputWidth + 2, 42, 0x000000)
            .setDepth(9); // Set lower depth so it appears behind the white rectangle

        // Create text for the input display
        this.nameText = this.add.text(width / 2 - (inputWidth/2) + 10, inputY, this.playerName, {
            fontSize: '18px',
            fill: '#000000'
        }).setOrigin(0, 0.5);

        // Create cursor for text input
        this.cursor = this.add.text(0, inputY, "|", {
            fontSize: '18px',
            fill: '#000000'
        }).setOrigin(0, 0.5);
        this.cursor.visible = false;

        // When the input field is clicked, enable typing mode
        inputRect.on('pointerup', () => {
            this.startEditing();
        });

        // Set up keyboard input
        this.input.keyboard.on('keydown', this.handleKeyPress, this);

        // Start button - adjust position and size based on orientation
        const buttonY = isPortrait ? height * 0.55 : 300;
        const buttonWidth = isPortrait ? width * 0.6 : 200;

        const startButton = this.add.rectangle(width / 2, buttonY, buttonWidth, 60, 0x3333aa)
            .setInteractive();

        const startText = this.add.text(width / 2, buttonY, "START GAME", {
            fontSize: '24px',
            fill: '#ffffff'
        }).setOrigin(0.5);

        startButton.on('pointerover', () => startButton.setFillStyle(0x5555cc));
        startButton.on('pointerout', () => startButton.setFillStyle(0x3333aa));
        startButton.on('pointerup', () => {
            this.stopEditing(); // Make sure we exit editing mode
            this.scene.start("GameScene", { playerName: this.playerName });
        });

        // Controls - adjust position based on orientation
        const controlsY = isPortrait ? height * 0.7 : 400;
        const instructionsY = isPortrait ? height * 0.8 : 450;

        this.add.text(width / 2, controlsY, "How to play:", {
            fontSize: '18px',
            fill: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const instructions = isPortrait ?
            "Joystick to move\n\nSurvive as long as possible!" :
            "Arrow Keys to move\n\nSurvive as long as possible!";

        this.add.text(width / 2, instructionsY, instructions, {
            fontSize: '16px',
            fill: '#ffffff',
            align: 'center'
        }).setOrigin(0.5);

        // Add click handler to stop editing when clicking outside the input box
        this.input.on('pointerdown', (pointer) => {
            if (this.isEditing) {
                // Check if click is outside the input rectangle
                const inputHeight = 40;
                const inputTop = inputY - inputHeight/2;
                const inputBottom = inputY + inputHeight/2;
                const inputLeft = width/2 - inputWidth/2;
                const inputRight = width/2 + inputWidth/2;

                if (pointer.x < inputLeft || pointer.x > inputRight ||
                    pointer.y < inputTop || pointer.y > inputBottom) {
                    this.stopEditing();
                }
            }
        });
    }

    startEditing() {
        if (this.isEditing) return;

        this.isEditing = true;
        this.inputBorder.setFillStyle(0x3333FF); // Change border color to indicate focus

        // Position cursor at the end of the text
        this.updateCursorPosition();
        this.cursor.visible = true;

        // Start cursor blinking
        this.showCursor = true;
        if (this.cursorBlinkTimer) this.cursorBlinkTimer.remove();
        this.cursorBlinkTimer = this.time.addEvent({
            delay: 500,
            callback: () => {
                this.showCursor = !this.showCursor;
                this.cursor.visible = this.showCursor;
            },
            loop: true
        });
    }

    stopEditing() {
        if (!this.isEditing) return;

        this.isEditing = false;
        this.inputBorder.setFillStyle(0x000000); // Reset border color
        this.cursor.visible = false;

        if (this.cursorBlinkTimer) {
            this.cursorBlinkTimer.remove();
            this.cursorBlinkTimer = null;
        }
    }

    updateCursorPosition() {
        // Calculate position based on text width
        const textWidth = this.nameText.width;
        const textX = this.nameText.x;
        this.cursor.x = textX + textWidth;
    }

    handleKeyPress(event) {
        if (!this.isEditing) return;

        if (event.keyCode === 13) {  // Enter key
            this.stopEditing();
            return;
        }

        if (event.keyCode === 8) {  // Backspace
            if (this.playerName.length > 0) {
                this.playerName = this.playerName.slice(0, -1);
                this.nameText.setText(this.playerName);
                this.updateCursorPosition();
            }
            return;
        }

        // Allow only alphanumeric characters and some special chars
        const key = event.key;
        if (key.length === 1 && /[a-zA-Z0-9 _-]/.test(key)) {
            // Limit name length
            if (this.playerName.length < 12) {
                this.playerName += key;
                this.nameText.setText(this.playerName);
                this.updateCursorPosition();
            }
        }
    }
}
const config = {
    type: Phaser.AUTO,
    // Set width and height to use the full window dimensions
    width: window.innerWidth,
    height: window.innerHeight,
    // Scale mode to automatically adjust to the screen size
    scale: {
        mode: Phaser.Scale.RESIZE,
        // Center the game canvas both horizontally and vertically
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
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
let game;

window.onload = () => {
    game = new Phaser.Game(config);
};