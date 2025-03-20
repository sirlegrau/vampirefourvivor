// scenes/GameScene.js
import Phaser from "phaser";
import SocketManager from "../managers/SocketManager.js";
import UIManager from "../managers/UIManager.js";
import GameConfig from "../config/gameConfig.js";
import AssetsConfig from "../config/assetsConfig.js";

export default class GameScene extends Phaser.Scene {
    constructor() {
        super("GameScene");
        this.players = {};
        this.enemies = {};
        this.bullets = {};
        this.xpOrbs = [];
        this.playerStats = { ...GameConfig.PLAYER.initialStats };
        this.currentWeapon = 0;
        this.canShoot = true;
        this.gameOver = false;
        this.autoShootTimer = 0;
        this.lastShotTime = 0;
        this.playerName = localStorage.getItem("playerName") || "Player";
    }

    preload() {
        // Load all assets using the helper function
        AssetsConfig.loadAll(this);
    }

    create() {
        // Add background
        this.add.tileSprite(0, 0, GameConfig.WORLD.width, GameConfig.WORLD.height, "background").setOrigin(0, 0);

        // Set up camera and world bounds
        this.cameras.main.setBounds(0, 0, GameConfig.WORLD.width, GameConfig.WORLD.height);
        this.physics.world.setBounds(0, 0, GameConfig.WORLD.width, GameConfig.WORLD.height);

        // Initialize UI Manager
        this.uiManager = new UIManager(this);

        // Initialize sounds
        this.shootSound = this.sound.add("shoot");
        this.hitSound = this.sound.add("hit");
        this.levelupSound = this.sound.add("levelup");

        // Set up input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys({
            w: Phaser.Input.Keyboard.KeyCodes.W,
            a: Phaser.Input.Keyboard.KeyCodes.A,
            s: Phaser.Input.Keyboard.KeyCodes.S,
            d: Phaser.Input.Keyboard.KeyCodes.D
        });

        // Set up socket connection
        this.socketManager = new SocketManager(this);
        this.socket = this.socketManager.socket;

        // Store number of bullets to shoot (powerup)
        this.bulletsPerShot = 1;
    }

    addPlayer(id, x, y, isMe = false, playerName = "Player") {
        const player = this.add.image(x, y, "player");

        // Add player name text below the player sprite
        const nameText = this.add.text(x, y + 30, playerName, {
            fontSize: '14px',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        if (isMe) {
            player.setTint(0x00FF00);
            this.cameras.main.startFollow(player, true, GameConfig.CAMERA.followSpeed, GameConfig.CAMERA.followSpeed);
        } else {
            player.setTint(0xFFFF00);
        }

        player.nameText = nameText;
        this.players[id] = player;
        return player;
    }

    addEnemy(id, x, y, type = 'basic', hp = 3) {
        if (this.enemies[id]) return;

        const enemy = this.add.image(x, y, "enemy");
        const enemyConfig = GameConfig.ENEMIES[type] || GameConfig.ENEMIES.basic;

        enemy.setTint(enemyConfig.tint);
        enemy.setScale(enemyConfig.scale);

        enemy.hpText = this.add.text(x, y - 20, `HP: ${Math.ceil(hp)}`, {
            fontSize: '12px',
            fill: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5);

        enemy.type = type;
        enemy.hp = hp;
        this.enemies[id] = enemy;
        return enemy;
    }

    addBullet(id, x, y, velocityX, velocityY) {
        const bullet = this.add.image(x, y, "bullet");
        bullet.velocityX = velocityX;
        bullet.velocityY = velocityY;

        // Calculate rotation based on velocity
        bullet.rotation = Math.atan2(velocityY, velocityX);

        this.bullets[id] = bullet;
        return bullet;
    }

    addXpOrb(id, x, y, value) {
        const orb = this.add.image(x, y, "experience");
        orb.id = id;
        orb.value = value;

        // Scale based on value
        const scale = 0.7 + (value / 20) * 0.3;
        orb.setScale(scale);

        // Add pulsing effect
        this.tweens.add({
            targets: orb,
            scale: scale * 1.2,
            duration: 800,
            yoyo: true,
            repeat: -1
        });

        this.xpOrbs.push(orb);
        return orb;
    }

    update(time, delta) {
        if (this.gameOver) return;

        this.handlePlayerMovement();
        this.handleAutoShooting(time);
        this.updateEnemyPositions();
    }

    handlePlayerMovement() {
        if (!this.me) return;

        let dirX = 0;
        let dirY = 0;

        // Handle keyboard input
        if (this.cursors.left.isDown || this.keys.a.isDown) {
            dirX = -1;
        } else if (this.cursors.right.isDown || this.keys.d.isDown) {
            dirX = 1;
        }

        if (this.cursors.up.isDown || this.keys.w.isDown) {
            dirY = -1;
        } else if (this.cursors.down.isDown || this.keys.s.isDown) {
            dirY = 1;
        }

        // Normalize diagonal movement
        if (dirX !== 0 && dirY !== 0) {
            const length = Math.sqrt(dirX * dirX + dirY * dirY);
            dirX = dirX / length;
            dirY = dirY / length;
        }

        // Calculate speed with player's speed multiplier
        const speed = GameConfig.PLAYER.baseSpeed * (this.playerStats.speedMultiplier || 1);

        // Update player position
        if (dirX !== 0 || dirY !== 0) {
            const newX = this.me.x + dirX * speed;
            const newY = this.me.y + dirY * speed;

            // Check world boundaries
            const boundX = Phaser.Math.Clamp(
                newX,
                GameConfig.PLAYER.collisionRadius,
                GameConfig.WORLD.width - GameConfig.PLAYER.collisionRadius
            );

            const boundY = Phaser.Math.Clamp(
                newY,
                GameConfig.PLAYER.collisionRadius,
                GameConfig.WORLD.height - GameConfig.PLAYER.collisionRadius
            );

            this.me.setPosition(boundX, boundY);
            this.me.nameText.setPosition(boundX, boundY + 30);

            // Send position update to server
            this.socket.emit("playerMovement", {
                x: boundX,
                y: boundY
            });
        }
    }

    findClosestEnemy() {
        if (!this.me || !Object.keys(this.enemies).length) return null;

        let closestEnemy = null;
        let closestDistance = Infinity;

        Object.values(this.enemies).forEach(enemy => {
            const distance = Phaser.Math.Distance.Between(
                this.me.x, this.me.y,
                enemy.x, enemy.y
            );

            if (distance < closestDistance) {
                closestDistance = distance;
                closestEnemy = enemy;
            }
        });

        return closestEnemy;
    }

    handleAutoShooting(time) {
        if (!this.me || this.gameOver) return;

        // Calculate cooldown with player's cooldown reduction
        const baseCooldown = 500; // 500ms between shots
        const cooldown = baseCooldown * (this.playerStats.cooldownReduction || 1);

        // Auto-shoot at the closest enemy if cooldown has elapsed
        if (time > this.lastShotTime + cooldown) {
            const closestEnemy = this.findClosestEnemy();

            if (closestEnemy) {
                this.shootAtTarget(closestEnemy.x, closestEnemy.y);
                this.lastShotTime = time;
            }
        }
    }

    shootAtTarget(targetX, targetY) {
        if (!this.me || this.gameOver) return;

        // Calculate direction to target
        const dx = targetX - this.me.x;
        const dy = targetY - this.me.y;

        // Normalize direction
        const length = Math.sqrt(dx * dx + dy * dy);
        const normalizedDx = dx / length;
        const normalizedDy = dy / length;

        // Play shoot sound
        this.shootSound.play({ volume: 0.2 });

        // Calculate angle for server (in radians)
        const angle = Math.atan2(normalizedDy, normalizedDx);

        // Send shot to server
        this.socket.emit("playerShoot", {
            x: this.me.x,
            y: this.me.y,
            angle: angle,
            damage: GameConfig.PLAYER.baseDamage || 1 // Use base damage from config
        });
    }

    updateEnemyPositions() {
        // Update enemy HP text positions to follow enemies
        Object.values(this.enemies).forEach(enemy => {
            if (enemy && enemy.hpText) {
                enemy.hpText.setPosition(enemy.x, enemy.y - 20);
            }
        });
    }
}