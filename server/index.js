const { createServer } = require("http");
const { Server } = require("socket.io");

const httpServer = createServer();
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

// Game state
let players = {};
let enemies = [];
let xpOrbs = [];
let enemyTypes = ['basic', 'fast', 'tank', 'boss'];
let gameInProgress = false;
let gameLoopInterval;
let currentWave = 0;
let waveInterval;

// Initial player stats
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

// Enemy stats by type
const enemyStats = {
    basic: { hp: 3, speed: 1, points: 10, xpValue: 5 },
    fast: { hp: 2, speed: 2, points: 15, xpValue: 7 },
    tank: { hp: 8, speed: 0.5, points: 20, xpValue: 10 },
    boss: { hp: 30, speed: 0.7, points: 100, xpValue: 50 }
};

// Game loop
function startGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);

    gameLoopInterval = setInterval(() => {
        moveEnemies();
        checkPlayerCollisions();
    }, 100);

    // Start wave system
    startWaveSystem();
}

function startWaveSystem() {
    if (waveInterval) clearInterval(waveInterval);

    // Initial wave spawn
    spawnWave();

    // Schedule waves every 30 seconds
    waveInterval = setInterval(() => {
        currentWave++;
        console.log(`🌊 Starting wave ${currentWave}`);
        spawnWave();
    }, 30000);
}

function spawnWave() {
    const baseEnemies = 5;
    const waveDifficulty = Math.ceil(baseEnemies + (currentWave * 2));

    // Calculate enemy distribution
    let enemyCount = {
        basic: Math.floor(waveDifficulty * 0.6),
        fast: Math.floor(waveDifficulty * 0.3),
        tank: Math.floor(waveDifficulty * 0.1),
        boss: currentWave % 5 === 0 ? 1 : 0 // Boss every 5 waves
    };

    // Spawn enemies with delay
    Object.entries(enemyCount).forEach(([type, count]) => {
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                spawnEnemy(type);
            }, i * 1000); // Spawn one enemy every second
        }
    });

    // Announce wave to all players
    io.emit("waveStarted", { wave: currentWave, enemyCount });
}

// Spawn a single enemy
function spawnEnemy(type = 'basic') {
    // Choose a random spawning position outside the visible area
    const spawnSide = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
    let x, y;

    switch(spawnSide) {
        case 0: // Top
            x = Math.random() * 1600;
            y = -50;
            break;
        case 1: // Right
            x = 1650;
            y = Math.random() * 1200;
            break;
        case 2: // Bottom
            x = Math.random() * 1600;
            y = 1250;
            break;
        case 3: // Left
            x = -50;
            y = Math.random() * 1200;
            break;
    }

    const id = `enemy-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const stats = enemyStats[type] || enemyStats.basic;

    const enemy = {
        id,
        x,
        y,
        type,
        hp: stats.hp * (1 + currentWave * 0.1), // Scale HP with wave
        speed: stats.speed,
        points: stats.points,
        xpValue: stats.xpValue
    };

    enemies.push(enemy);
    io.emit("spawnEnemy", enemy);

    return enemy;
}

// Move enemies towards the nearest player
function moveEnemies() {
    if (Object.keys(players).length === 0) return;

    enemies.forEach(enemy => {
        // Find the nearest player
        let nearestPlayer = null;
        let nearestDistance = Infinity;

        Object.values(players).forEach(player => {
            const distance = Math.sqrt(
                Math.pow(player.x - enemy.x, 2) +
                Math.pow(player.y - enemy.y, 2)
            );

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPlayer = player;
            }
        });

        if (nearestPlayer) {
            // Move towards the player
            const dx = nearestPlayer.x - enemy.x;
            const dy = nearestPlayer.y - enemy.y;
            const length = Math.sqrt(dx * dx + dy * dy);

            if (length > 0) {
                // Normalize and apply speed
                enemy.x += (dx / length) * enemy.speed;
                enemy.y += (dy / length) * enemy.speed;

                // Broadcast enemy movement
                io.emit("enemyMoved", {
                    id: enemy.id,
                    x: enemy.x,
                    y: enemy.y
                });
            }
        }
    });
}

// Check for collisions between enemies and players
function checkPlayerCollisions() {
    Object.entries(players).forEach(([playerId, player]) => {
        enemies.forEach(enemy => {
            const distance = Math.sqrt(
                Math.pow(player.x - enemy.x, 2) +
                Math.pow(player.y - enemy.y, 2)
            );

            // Collision detected
            if (distance < 40) {
                // Deal damage to player
                player.hp -= 1;

                // Broadcast player HP update
                io.emit("updateHP", {
                    id: playerId,
                    hp: player.hp
                });

                // Push enemy away from player
                const dx = enemy.x - player.x;
                const dy = enemy.y - player.y;
                const length = Math.sqrt(dx * dx + dy * dy);

                if (length > 0) {
                    enemy.x += (dx / length) * 50;
                    enemy.y += (dy / length) * 50;

                    // Broadcast enemy movement
                    io.emit("enemyMoved", {
                        id: enemy.id,
                        x: enemy.x,
                        y: enemy.y
                    });
                }

                // Check if player is dead
                if (player.hp <= 0) {
                    io.emit("playerDied", playerId);
                }
            }
        });
    });
}

// Create XP orb at position
function createXpOrb(x, y, value, id = null) {
    const orbId = id || `orb-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const orb = { id: orbId, x, y, value };
    xpOrbs.push(orb);
    return orb;
}

// Socket.IO connection handler
io.on("connection", (socket) => {
    console.log(`🟢 Player connected: ${socket.id}`);

    // Add player to game
    players[socket.id] = { ...initialPlayerStats };

    // Start game loop if not already running
    if (!gameInProgress) {
        gameInProgress = true;
        startGameLoop();
    }

    // Send current game state to player
    socket.emit("currentPlayers", players);
    socket.emit("currentEnemies", enemies);
    socket.emit("currentXpOrbs", xpOrbs);
    socket.broadcast.emit("newPlayer", { id: socket.id, ...players[socket.id] });

    // Player movement
    socket.on("playerMove", (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            socket.broadcast.emit("playerMoved", { id: socket.id, x: data.x, y: data.y });
        }
    });

    // Enemy hit by player bullet
    socket.on("enemyHit", (data) => {
        const { enemyId, damage } = data;
        const enemy = enemies.find(e => e.id === enemyId);

        if (enemy) {
            // Apply damage
            const actualDamage = damage * players[socket.id].damageMultiplier;
            enemy.hp -= actualDamage;

            // Broadcast hit effect
            io.emit("enemyHit", { enemyId, damage: actualDamage });

            // Check if enemy is killed
            if (enemy.hp <= 0) {
                // Remove enemy
                enemies = enemies.filter(e => e.id !== enemyId);

                // Add score to player
                players[socket.id].score += enemy.points;

                // Broadcast kill
                io.emit("enemyKilled", {
                    enemyId,
                    killerId: socket.id,
                    points: enemy.points
                });

                // Create XP orb
                const orb = createXpOrb(enemy.x, enemy.y, enemy.xpValue);
                io.emit("spawnXpOrb", orb);
            }
        }
    });

    // Player collects XP orb
    socket.on("collectXpOrb", (orbId) => {
        const orb = xpOrbs.find(o => o.id === orbId);

        if (orb) {
            // Add XP to player
            players[socket.id].xp += orb.value;

            // Remove orb
            xpOrbs = xpOrbs.filter(o => o.id !== orbId);
            io.emit("xpOrbCollected", orbId);

            // Check for level up
            const oldLevel = players[socket.id].level;
            const newLevel = Math.floor(1 + (players[socket.id].xp / 100));

            if (newLevel > oldLevel) {
                players[socket.id].level = newLevel;

                // Broadcast level up
                io.emit("updateXP", {
                    id: socket.id,
                    xp: players[socket.id].xp,
                    level: players[socket.id].level,
                    leveledUp: true
                });
            } else {
                // Just broadcast XP update
                io.emit("updateXP", {
                    id: socket.id,
                    xp: players[socket.id].xp,
                    level: players[socket.id].level,
                    leveledUp: false
                });
            }
        }
    });

    // Player selects upgrade
    socket.on("upgrade", (upgradeType) => {
        switch(upgradeType) {
            case "hp":
                players[socket.id].maxHp += 2;
                players[socket.id].hp = players[socket.id].maxHp;
                break;
            case "damage":
                players[socket.id].damageMultiplier += 0.2;
                break;
            case "cooldown":
                players[socket.id].cooldownReduction -= 0.1;
                if (players[socket.id].cooldownReduction < 0.5) {
                    players[socket.id].cooldownReduction = 0.5; // Minimum cooldown
                }
                break;
        }

        // Broadcast upgraded stats
        io.emit("playerUpgraded", {
            id: socket.id,
            upgradeType,
            stats: players[socket.id]
        });
    });

    // Player spawns XP orb (usually from killing an enemy)
    socket.on("spawnXpOrb", (data) => {
        const orb = createXpOrb(data.x, data.y, data.value, data.id);
        socket.broadcast.emit("spawnXpOrb", orb);
    });

    // Player disconnects
    socket.on("disconnect", () => {
        console.log(`🔴 Player disconnected: ${socket.id}`);
        delete players[socket.id];
        socket.broadcast.emit("playerDisconnected", socket.id);

        // Stop game loop if no players left
        if (Object.keys(players).length === 0) {
            console.log("❌ No players left. Stopping game loop.");
            gameInProgress = false;
            clearInterval(gameLoopInterval);
            clearInterval(waveInterval);
            currentWave = 0;
            enemies = [];
            xpOrbs = [];
        }
    });
});

httpServer.listen(3000, () => {
    console.log("✅ Server running on http://localhost:3000");
});