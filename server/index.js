const { createServer } = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const httpServer = createServer();

const io = new Server(httpServer, {
    cors: {
        origin: ["http://localhost:5173", "https://vampirefourvivor.netlify.app"],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ["websocket", "polling"]
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
    cooldownReduction: 1
};

const enemyStats = {
    basic: { hp: 3, speed: 1, points: 10, xpValue: 5 },
    fast: { hp: 2, speed: 2, points: 15, xpValue: 7 },
    tank: { hp: 8, speed: 0.5, points: 20, xpValue: 10 },
    boss: { hp: 30, speed: 0.7, points: 100, xpValue: 50 }
};

function startGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    gameLoopInterval = setInterval(() => {
        moveEnemies();
        moveBullets();
        checkCollisions();
    }, 33); // Run at approximately 30 FPS
    startWaveSystem();
}

function startWaveSystem() {
    if (waveInterval) clearInterval(waveInterval);
    spawnWave();
    waveInterval = setInterval(() => {
        currentWave++;
        console.log(`🌊 Starting wave ${currentWave}`);
        spawnWave();
    }, 30000);
}

function spawnWave() {
    const baseEnemies = 5 + currentWave * 2;
    let enemyCount = {
        basic: Math.floor(baseEnemies * 0.6),
        fast: Math.floor(baseEnemies * 0.3),
        tank: Math.floor(baseEnemies * 0.1),
        boss: currentWave % 5 === 0 ? 1 : 0
    };

    Object.entries(enemyCount).forEach(([type, count]) => {
        for (let i = 0; i < count; i++) {
            setTimeout(() => spawnEnemy(type), i * 1000);
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

    const enemy = { id, x, y, type, hp: stats.hp * (1 + currentWave * 0.1), speed: stats.speed, points: stats.points, xpValue: stats.xpValue };
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
        if (bullet.x < 0 || bullet.x > 1600 || bullet.y < 0 || bullet.y > 1200) {
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
                enemy.hp -= bullet.damage;
                io.emit("enemyHit", { id: enemy.id, hp: enemy.hp });

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
                io.emit("enemyDestroyed", enemy.id);
            }
        });
    });

    // Check player-xpOrb collisions
    Object.entries(players).forEach(([playerId, player]) => {
        xpOrbs = xpOrbs.filter(orb => {
            if (Math.hypot(player.x - orb.x, player.y - orb.y) < 40) {
                player.xp += orb.value;
                io.emit("updateXP", { id: playerId, xp: player.xp });
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
    io.emit("enemyDestroyed", enemy.id);
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
        const bullet = {
            id: `bullet-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            x,
            y,
            velocityX: Math.cos(angle) * 10,
            velocityY: Math.sin(angle) * 10,
            damage,
            playerId: socket.id
        };
        bullets.push(bullet);
        io.emit("bulletCreated", bullet);
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
