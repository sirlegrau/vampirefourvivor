const { createServer } = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000; // ✅ Use dynamic port for Render
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
let waveInterval;
let currentWave = 0;

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

// ✅ Start Game Loop when at least one player joins
function startGameLoop() {
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    gameLoopInterval = setInterval(() => {
        moveEnemies();
        checkPlayerCollisions();
    }, 100);

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

// ✅ Correct enemy spawning logic
function spawnWave() {
    const waveDifficulty = 5 + (currentWave * 2);
    let enemyCount = {
        basic: Math.floor(waveDifficulty * 0.6),
        fast: Math.floor(waveDifficulty * 0.3),
        tank: Math.floor(waveDifficulty * 0.1),
        boss: currentWave % 5 === 0 ? 1 : 0
    };

    Object.entries(enemyCount).forEach(([type, count]) => {
        for (let i = 0; i < count; i++) {
            setTimeout(() => spawnEnemy(type), i * 1000);
        }
    });

    io.emit("waveStarted", { wave: currentWave, enemyCount });
}

// ✅ Ensures enemies are spawned properly
function spawnEnemy(type = 'basic') {
    const spawnSide = Math.floor(Math.random() * 4);
    let x, y;

    switch (spawnSide) {
        case 0: x = Math.random() * 1600; y = -50; break;
        case 1: x = 1650; y = Math.random() * 1200; break;
        case 2: x = Math.random() * 1600; y = 1250; break;
        case 3: x = -50; y = Math.random() * 1200; break;
    }

    const id = `enemy-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const stats = enemyStats[type] || enemyStats.basic;

    const enemy = {
        id, x, y, type,
        hp: stats.hp * (1 + currentWave * 0.1),
        speed: stats.speed,
        points: stats.points,
        xpValue: stats.xpValue
    };

    enemies.push(enemy);
    io.emit("spawnEnemy", enemy);
}

// ✅ Prevents errors if no players are present
function moveEnemies() {
    if (Object.keys(players).length === 0) return;

    enemies.forEach(enemy => {
        let nearestPlayer = null;
        let nearestDistance = Infinity;

        Object.values(players).forEach(player => {
            const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPlayer = player;
            }
        });

        if (nearestPlayer) {
            const dx = nearestPlayer.x - enemy.x;
            const dy = nearestPlayer.y - enemy.y;
            const length = Math.hypot(dx, dy);

            if (length > 0) {
                enemy.x += (dx / length) * enemy.speed;
                enemy.y += (dy / length) * enemy.speed;
                io.emit("enemyMoved", { id: enemy.id, x: enemy.x, y: enemy.y });
            }
        }
    });
}

// ✅ Prevents errors on missing players
function checkPlayerCollisions() {
    Object.entries(players).forEach(([playerId, player]) => {
        enemies.forEach(enemy => {
            const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
            if (distance < 40) {
                player.hp -= 1;
                io.emit("updateHP", { id: playerId, hp: player.hp });

                if (player.hp <= 0) {
                    io.emit("playerDied", playerId);
                }
            }
        });
    });
}

// ✅ Handles player connections & disconnections
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
    io.emit("newPlayer", { id: socket.id, ...players[socket.id] });

    socket.on("playerMove", (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            io.emit("playerMoved", { id: socket.id, x: data.x, y: data.y });
        }
    });

    socket.on("enemyHit", (data) => {
        const { enemyId, damage } = data;
        const enemy = enemies.find(e => e.id === enemyId);
        if (enemy) {
            enemy.hp -= damage * players[socket.id].damageMultiplier;
            io.emit("enemyHit", { enemyId, damage });

            if (enemy.hp <= 0) {
                enemies = enemies.filter(e => e.id !== enemyId);
                io.emit("enemyKilled", { enemyId, killerId: socket.id });
            }
        }
    });

    socket.on("disconnect", () => {
        console.log(`🔴 Player disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit("playerDisconnected", socket.id);

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

// ✅ Ensures server binds correctly on Render
httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
