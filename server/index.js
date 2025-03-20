const { createServer } = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
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
    cooldownReduction: 1,
    speedMultiplier: 1,
    bulletsPerShot: 1
};

// Basic enemy types
const enemyStats = {
    basic: { hp: 3, speed: 1, points: 10, xpValue: 5 },
    fast: { hp: 2, speed: 2, points: 15, xpValue: 7 },
    tank: { hp: 8, speed: 0.5, points: 20, xpValue: 10 },
    boss: { hp: 30, speed: 0.7, points: 100, xpValue: 50 }
};

// Calculate required XP for a level
function getRequiredXp(level) {
    return Math.floor(level * 80);
}

// Check if player levels up and handle it
function checkLevelUp(playerId) {
    const player = players[playerId];
    if (!player) return false;

    const requiredXp = getRequiredXp(player.level);
    if (player.xp >= requiredXp) {
        player.level += 1;
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
    }, 33);
    startWaveSystem();
}

function startWaveSystem() {
    if (waveInterval) clearInterval(waveInterval);
    spawnWave();
    waveInterval = setInterval(() => {
        currentWave++;
        console.log(`🌊 Starting wave ${currentWave}`);
        spawnWave();
    }, 25000);
}

function spawnWave() {
    const baseEnemies = 5 + Math.floor(currentWave * 2);

    let enemyCount = {
        basic: Math.floor(baseEnemies * 0.5),
        fast: Math.floor(baseEnemies * 0.2),
        tank: Math.floor(baseEnemies * 0.1),
        boss: currentWave % 4 === 0 ? 1 : 0
    };

    Object.entries(enemyCount).forEach(([type, count]) => {
        for (let i = 0; i < count; i++) {
            setTimeout(() => spawnEnemy(type), i * 800);
        }
    });

    io.emit("waveStarted", { wave: currentWave, enemyCount });
}

function spawnEnemy(type = "basic") {
    const spawnPositions = [
        { x: Math.random() * 1600, y: -50 },
        { x: 1650, y: Math.random() * 1200 },
        { x: Math.random() * 1600, y: 1250 },
        { x: -50, y: Math.random() * 1200 }
    ];
    let { x, y } = spawnPositions[Math.floor(Math.random() * 4)];
    const id = `enemy-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const stats = enemyStats[type];

    const enemy = {
        id,
        x,
        y,
        type,
        hp: stats.hp * (1 + currentWave * 0.1),
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
        if (bullet.x < -50 || bullet.x > 1650 || bullet.y < -50 || bullet.y > 1250) {
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
            if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < 30) {
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
            if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < 40) {
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
            if (Math.hypot(player.x - orb.x, player.y - orb.y) < 50) {
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

    players[socket.id] = { ...initialPlayerStats };

    if (!gameInProgress) {
        gameInProgress = true;
        startGameLoop();
    }

    socket.emit("currentPlayers", players);
    socket.emit("currentEnemies", enemies);
    socket.emit("currentXpOrbs", xpOrbs);
    socket.broadcast.emit("newPlayer", { id: socket.id, ...players[socket.id] });

    socket.on("playerMove", ({ x, y }) => {
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
            velocityX: Math.cos(angle) * 10,
            velocityY: Math.sin(angle) * 10,
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

        switch (upgradeType) {
            case "hp":
                player.maxHp += 3;
                player.hp = player.maxHp;
                io.emit("updateHP", { id: socket.id, hp: player.hp });
                break;
            case "damage":
                player.damageMultiplier += 0.5;
                break;
            case "cooldown":
                player.cooldownReduction -= 0.3;
                if (player.cooldownReduction < 0.3) player.cooldownReduction = 0.3;
                break;
            case "speed":
                player.speedMultiplier += 0.3;
                break;
            case "multishot":
                player.bulletsPerShot = (player.bulletsPerShot || 1) + 1;
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

httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});