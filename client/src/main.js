import Phaser from "phaser";
import { io } from "socket.io-client";

// Connect to the WebSocket server
const socket = io("http://localhost:3000");

class GameScene extends Phaser.Scene {
    constructor() {
        super("GameScene");
        this.enemies = [];
        this.projectiles = [];
        this.lastFired = 0;
        this.fireRate = 500; // ms between shots
    }

    preload() {
        this.load.image("player", "assets/player.png");
        this.load.image("enemy", "assets/player.png"); // Use same image for now, tint it red
        this.load.image("projectile", "assets/player.png"); // Use same image for now, smaller scale
    }

    create() {
        this.players = {};
        this.enemyGroup = this.add.group();
        this.projectileGroup = this.add.group();

        // Create Local Player
        this.localPlayer = this.add.image(400, 300, "player").setOrigin(0.5);

        // Handle multiplayer connections
        socket.on("currentPlayers", (players) => {
            Object.keys(players).forEach((id) => {
                if (id !== socket.id) {
                    this.addPlayer(id, players[id]);
                }
            });
        });

        socket.on("newPlayer", (player) => {
            this.addPlayer(player.id, player);
        });

        socket.on("playerMoved", (player) => {
            if (this.players[player.id]) {
                this.players[player.id].x = player.x;
                this.players[player.id].y = player.y;
            }
        });

        socket.on("playerDisconnected", (id) => {
            if (this.players[id]) {
                this.players[id].destroy();
                delete this.players[id];
            }
        });

        // Enemy spawning
        this.time.addEvent({
            delay: 2000,
            callback: this.spawnEnemy,
            callbackScope: this,
            loop: true
        });

        // Auto-fire
        this.time.addEvent({
            delay: this.fireRate,
            callback: this.fireProjectile,
            callbackScope: this,
            loop: true
        });

        // Handle input
        this.cursors = this.input.keyboard.createCursorKeys();
    }

    update() {
        let moved = false;
        const speed = 3;

        if (this.cursors.left.isDown) {
            this.localPlayer.x -= speed;
            moved = true;
        }
        if (this.cursors.right.isDown) {
            this.localPlayer.x += speed;
            moved = true;
        }
        if (this.cursors.up.isDown) {
            this.localPlayer.y -= speed;
            moved = true;
        }
        if (this.cursors.down.isDown) {
            this.localPlayer.y += speed;
            moved = true;
        }

        if (moved) {
            socket.emit("playerMove", { x: this.localPlayer.x, y: this.localPlayer.y });
        }

        // Update enemies
        this.enemyGroup.getChildren().forEach(enemy => {
            // Simple AI: move toward player
            const dx = this.localPlayer.x - enemy.x;
            const dy = this.localPlayer.y - enemy.y;
            const angle = Math.atan2(dy, dx);
            const speed = 1;

            enemy.x += Math.cos(angle) * speed;
            enemy.y += Math.sin(angle) * speed;
        });

        // Check for projectile hits
        this.physics.world.collide(
            this.projectileGroup,
            this.enemyGroup,
            this.hitEnemy,
            null,
            this
        );
    }

    spawnEnemy() {
        // Spawn enemies at random positions outside the visible area
        const side = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
        let x, y;

        switch(side) {
            case 0: // top
                x = Math.random() * 800;
                y = -20;
                break;
            case 1: // right
                x = 820;
                y = Math.random() * 600;
                break;
            case 2: // bottom
                x = Math.random() * 800;
                y = 620;
                break;
            case 3: // left
                x = -20;
                y = Math.random() * 600;
                break;
        }

        const enemy = this.add.image(x, y, "enemy").setOrigin(0.5).setTint(0xff0000);
        this.enemyGroup.add(enemy);
    }

    fireProjectile() {
        // Create a projectile from the player
        const projectile = this.physics.add.image(this.localPlayer.x, this.localPlayer.y, "projectile")
            .setOrigin(0.5)
            .setScale(0.5)
            .setTint(0xffff00);

        // Find closest enemy
        let closestEnemy = null;
        let closestDistance = Infinity;

        this.enemyGroup.getChildren().forEach(enemy => {
            const distance = Phaser.Math.Distance.Between(
                this.localPlayer.x, this.localPlayer.y,
                enemy.x, enemy.y
            );

            if (distance < closestDistance) {
                closestDistance = distance;
                closestEnemy = enemy;
            }
        });

        if (closestEnemy) {
            // Calculate angle to enemy
            const angle = Phaser.Math.Angle.Between(
                this.localPlayer.x, this.localPlayer.y,
                closestEnemy.x, closestEnemy.y
            );

            // Set velocity based on angle
            const speed = 5;
            projectile.setVelocity(
                Math.cos(angle) * speed * 60,
                Math.sin(angle) * speed * 60
            );
        }

        this.projectileGroup.add(projectile);

        // Destroy projectile after 2 seconds
        this.time.delayedCall(2000, () => {
            projectile.destroy();
        });
    }

    hitEnemy(projectile, enemy) {
        projectile.destroy();
        enemy.destroy();

        // Sync with other players
        socket.emit("enemyKilled", { x: enemy.x, y: enemy.y });
    }

    addPlayer(id, playerData) {
        this.players[id] = this.add.image(playerData.x, playerData.y, "player")
            .setOrigin(0.5)
            .setTint(0x00ff00);
    }
}

// Phaser game configuration
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    },
    scene: GameScene
};

// Start the game
new Phaser.Game(config);