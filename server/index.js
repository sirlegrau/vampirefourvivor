const { createServer } = require("http");
const { Server } = require("socket.io");
const config = require("./gameConfig");

const httpServer = createServer();

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

let players = {};
let enemies = [];
let bullets = [];
let xpOrbs = [];
let gameInProgress = false;
let gameLoopInterval;
let waveInterval;
let currentWave = 0;

// Check if player levels up and handle it
function checkLevelUp(playerId) {
    const player = players[playerId];
    if (!player) return false;

    const requiredXp = config.XP.getRequiredXp(player.level);
    if (player.xp >= requiredXp) {
        player.level += 1;

        // ADD THIS CODE HERE - Generate random upgrade options
        const availableUpgrades = [];
        Object.entries(config.PLAYER.upgradeOptions).forEach(([type, data]) => {
            if (Math.random() < data.chance) {
                availableUpgrades.push(type);
            }
        });

        // Ensure we have enough options even if RNG was unfavorable
        while (availableUpgrades.length < config.PLAYER.upgradeChoices) {
            const allTypes = Object.keys(config.PLAYER.upgradeOptions);
            const randomType = allTypes[Math.floor(Math.random() * allTypes.length)];
            if (!availableUpgrades.includes(randomType)) {
                availableUpgrades.push(randomType);
            }
        }

        // Shuffle and get random choices
        const upgrades = availableUpgrades
            .sort(() => 0.5 - Math.random())
            .slice(0, config.PLAYER.upgradeChoices);

        // Send these choices to the player
        io.to(playerId).emit("upgradeOptions", upgrades);

        // Original code continues
        io.emit("updateXP", {
            id: playerId,
            xp: player.xp,
            level: player.level,
            leveledUp: true
        });
        return true;
    }
    return false;
}

function startGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    gameLoopInterval = setInterval(() => {
        moveEnemies();
        moveBullets();
        checkCollisions();
    }, config.SIMULATION.tickRate);
    startWaveSystem();
}

function startWaveSystem() {
    if (waveInterval) clearInterval(waveInterval);
    spawnWave();
    waveInterval = setInterval(() => {
        currentWave++;
        console.log(`🌊 Starting wave ${currentWave}`);
        spawnWave();
    }, config.WAVES.timeBetweenWaves);
}

function spawnWave() {
    const baseEnemies = config.WAVES.getBaseEnemiesForWave(currentWave);
    const activePlayerCount = Object.keys(players).length;
    const enemyCount = config.WAVES.getWaveComposition(currentWave, baseEnemies, activePlayerCount);

    Object.entries(enemyCount).forEach(([type, count]) => {
        for (let i = 0; i < count; i++) {
            setTimeout(() => spawnEnemy(type), i * config.WAVES.enemySpawnDelay);
        }
    });

    io.emit("waveStarted", { wave: currentWave, enemyCount });
}

function spawnEnemy(type = "basic") {
    const offset = config.WORLD.spawnBorderOffset;
    const spawnPositions = [
        { x: Math.random() * config.WORLD.width, y: -offset },
        { x: config.WORLD.width + offset, y: Math.random() * config.WORLD.height },
        { x: Math.random() * config.WORLD.width, y: config.WORLD.height + offset },
        { x: -offset, y: Math.random() * config.WORLD.height }
    ];
    let { x, y } = spawnPositions[Math.floor(Math.random() * 4)];
    const id = `enemy-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const stats = config.ENEMIES[type];

    const enemy = {
        id,
        x,
        y,
        type,
        hp: stats.hp * (1 + currentWave * config.WAVES.hpScalingPerWave),
        speed: stats.speed,
        points: stats.points,
        xpValue: stats.xpValue
    };
    enemies.push(enemy);
    io.emit("spawnEnemy", enemy);
}

function moveEnemies() {
    if (!Object.keys(players).length) return;

    enemies.forEach(enemy => {
        let nearestPlayer = Object.values(players).reduce((nearest, player) => {
            let distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
            return !nearest || distance < nearest.distance ? { player, distance } : nearest;
        }, null)?.player;

        if (nearestPlayer) {
            let dx = nearestPlayer.x - enemy.x;
            let dy = nearestPlayer.y - enemy.y;
            let length = Math.hypot(dx, dy);
            enemy.x += (dx / length) * enemy.speed;
            enemy.y += (dy / length) * enemy.speed;
            io.emit("enemyMoved", { id: enemy.id, x: enemy.x, y: enemy.y });
        }
    });
}

function moveBullets() {
    bullets = bullets.filter(bullet => {
        bullet.x += bullet.velocityX;
        bullet.y += bullet.velocityY;

        // Remove bullets that are out of bounds
        const offset = config.WORLD.spawnBorderOffset;
        if (bullet.x < -offset ||
            bullet.x > config.WORLD.width + offset ||
            bullet.y < -offset ||
            bullet.y > config.WORLD.height + offset) {
            io.emit("bulletDestroyed", bullet.id);
            return false;
        }

        io.emit("bulletMoved", { id: bullet.id, x: bullet.x, y: bullet.y });
        return true;
    });
}

function checkCollisions() {
    // Check bullet-enemy collisions
    bullets.forEach(bullet => {
        enemies.forEach(enemy => {
            if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < config.SIMULATION.bulletHitRadius) {
                const player = players[bullet.playerId];
                let damage = bullet.damage;

                enemy.hp -= damage;
                io.emit("enemyHit", {
                    enemyId: enemy.id,
                    hp: enemy.hp,
                    damage
                });

                if (enemy.hp <= 0) {
                    killEnemy(enemy, bullet.playerId);
                }

                // Remove the bullet
                bullets = bullets.filter(b => b.id !== bullet.id);
                io.emit("bulletDestroyed", bullet.id);
            }
        });
    });

    // Check player-enemy collisions
    Object.entries(players).forEach(([playerId, player]) => {
        enemies.forEach(enemy => {
            if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < config.SIMULATION.playerEnemyCollisionRadius) {
                player.hp -= 1;
                io.emit("updateHP", { id: playerId, hp: player.hp });

                if (player.hp <= 0) {
                    io.emit("playerDied", playerId);
                }

                // Remove the enemy
                enemies = enemies.filter(e => e.id !== enemy.id);
                io.emit("enemyKilled", {
                    enemyId: enemy.id,
                    killerId: playerId,
                    points: enemy.points
                });
            }
        });
    });

    // Check player-xpOrb collisions
    Object.entries(players).forEach(([playerId, player]) => {
        xpOrbs = xpOrbs.filter(orb => {
            if (Math.hypot(player.x - orb.x, player.y - orb.y) < config.XP.orbCollectionRadius) {
                player.xp += orb.value;

                // Check for level up
                const leveledUp = checkLevelUp(playerId);

                if (!leveledUp) {
                    io.emit("updateXP", {
                        id: playerId,
                        xp: player.xp,
                        level: player.level,
                        leveledUp: false
                    });
                }

                io.emit("xpOrbCollected", orb.id);
                return false;
            }
            return true;
        });
    });
}

function killEnemy(enemy, playerId) {
    const player = players[playerId];
    if (player) {
        player.score += enemy.points;
        io.emit("updateScore", { id: playerId, score: player.score });
    }

    spawnXpOrb(enemy.x, enemy.y, enemy.xpValue);
    enemies = enemies.filter(e => e.id !== enemy.id);
    io.emit("enemyKilled", {
        enemyId: enemy.id,
        killerId: playerId,
        points: enemy.points
    });
}

function spawnXpOrb(x, y, value) {
    const orb = { id: `xp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, x, y, value };
    xpOrbs.push(orb);
    io.emit("spawnXpOrb", orb);
}

io.on("connection", (socket) => {
    console.log(`🟢 Player connected: ${socket.id}`);

    players[socket.id] = { ...config.PLAYER.initialStats };

    if (!gameInProgress) {
        gameInProgress = true;
        startGameLoop();
    }

    socket.emit("currentPlayers", players);
    socket.emit("currentEnemies", enemies);
    socket.emit("currentXpOrbs", xpOrbs);
    socket.broadcast.emit("newPlayer", { id: socket.id, ...players[socket.id] });

    socket.on("playerMovement", ({ x, y }) => {
        if (players[socket.id]) {
            players[socket.id].x = x;
            players[socket.id].y = y;
            socket.broadcast.emit("playerMoved", { id: socket.id, x, y });
        }
    });

    socket.on("playerShoot", ({ x, y, angle, damage }) => {
        const player = players[socket.id];
        if (!player) return;

        const effectiveDamage = damage * player.damageMultiplier;

        const bullet = {
            id: `bullet-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            x,
            y,
            velocityX: Math.cos(angle) * config.SIMULATION.bulletSpeed,
            velocityY: Math.sin(angle) * config.SIMULATION.bulletSpeed,
            damage: effectiveDamage,
            playerId: socket.id
        };
        bullets.push(bullet);
        io.emit("bulletCreated", bullet);
    });

    // Handle enemy hit (sent from client)
    socket.on("enemyHit", ({ enemyId, damage }) => {
        const enemy = enemies.find(e => e.id === enemyId);
        if (enemy) {
            enemy.hp -= damage;
            io.emit("enemyHit", { enemyId, hp: enemy.hp });

            if (enemy.hp <= 0) {
                killEnemy(enemy, socket.id);
            }
        }
    });

    // Handle XP orb collection
    socket.on("collectXpOrb", (orbId) => {
        const orbIndex = xpOrbs.findIndex(o => o.id === orbId);

        if (orbIndex !== -1) {
            const orb = xpOrbs[orbIndex];
            players[socket.id].xp += orb.value;

            // Check for level up
            const leveledUp = checkLevelUp(socket.id);

            if (!leveledUp) {
                io.emit("updateXP", {
                    id: socket.id,
                    xp: players[socket.id].xp,
                    level: players[socket.id].level,
                    leveledUp: false
                });
            }

            // Remove the orb
            xpOrbs.splice(orbIndex, 1);
            io.emit("xpOrbCollected", orbId);
        }
    });

    // Handle player upgrades
    socket.on("upgrade", (upgradeType) => {
        const player = players[socket.id];
        if (!player) return;

        const upgradeOptions = config.PLAYER.upgradeOptions;

        switch (upgradeType) {
            case "hp":
                player.maxHp += upgradeOptions.hp.maxHpIncrease;
                if (upgradeOptions.hp.fullHeal) {
                    player.hp = player.maxHp;
                }
                io.emit("updateHP", { id: socket.id, hp: player.hp });
                break;
            case "damage":
                player.damageMultiplier += upgradeOptions.damage.multiplierIncrease;
                break;
            case "cooldown":
                player.cooldownReduction -= upgradeOptions.cooldown.reductionIncrease;
                if (player.cooldownReduction < upgradeOptions.cooldown.minimumValue) {
                    player.cooldownReduction = upgradeOptions.cooldown.minimumValue;
                }
                break;
            case "speed":
                player.speedMultiplier += upgradeOptions.speed.multiplierIncrease;
                break;
            case "multishot":
                player.bulletsPerShot += upgradeOptions.multishot.bulletsIncrease;
                break;
        }

        io.emit("playerUpgraded", {
            id: socket.id,
            stats: {
                maxHp: player.maxHp,
                hp: player.hp,
                damageMultiplier: player.damageMultiplier,
                cooldownReduction: player.cooldownReduction,
                speedMultiplier: player.speedMultiplier,
                bulletsPerShot: player.bulletsPerShot
            },
            upgradeType
        });
    });

    socket.on("disconnect", () => {
        console.log(`🔴 Player disconnected: ${socket.id}`);
        delete players[socket.id];
        socket.broadcast.emit("playerDisconnected", socket.id);

        if (!Object.keys(players).length) {
            console.log("❌ No players left. Stopping game loop.");
            gameInProgress = false;
            clearInterval(gameLoopInterval);
            clearInterval(waveInterval);
            currentWave = 0;
            enemies = [];
            xpOrbs = [];
            bullets = [];
        }
    });
});

httpServer.listen(config.SERVER.port, "0.0.0.0", () => {
    console.log(`✅ Server running on http://0.0.0.0:${config.SERVER.port}`);
});