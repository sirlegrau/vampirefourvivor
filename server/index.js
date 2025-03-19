const { createServer } = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000; // Use Render's assigned port
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

// Start the game loop
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

function spawnWave() {
    const baseEnemies = 5;
    const waveDifficulty = Math.ceil(baseEnemies + (currentWave * 2));
    let enemyCount = {
        basic: Math.floor(waveDifficulty * 0.6),
        fast: Math.floor(waveDifficulty * 0.3),
        tank: Math.floor(waveDifficulty * 0.1),
        boss: currentWave % 5 === 0 ? 1 : 0
    };
    Object.entries(enemyCount).forEach(([type, count]) => {
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                spawnEnemy(type);
            }, i * 1000);
        }
    });
    io.emit("waveStarted", { wave: currentWave, enemyCount });
}

// Spawn enemy function
function spawnEnemy(type = 'basic') {
    const spawnSide = Math.floor(Math.random() * 4);
    let x, y;
    switch(spawnSide) {
        case 0: x = Math.random() * 1600; y = -50; break;
        case 1: x = 1650; y = Math.random() * 1200; break;
        case 2: x = Math.random() * 1600; y = 1250; break;
        case 3: x = -50; y = Math.random() * 1200; break;
    }
    const id = `enemy-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const stats = enemyStats[type] || enemyStats.basic;
    const enemy = { id, x, y, type, hp: stats.hp * (1 + currentWave * 0.1), speed: stats.speed, points: stats.points, xpValue: stats.xpValue };
    enemies.push(enemy);
    io.emit("spawnEnemy", enemy);
    return enemy;
}

function moveEnemies() {
    if (Object.keys(players).length === 0) return;
    enemies.forEach(enemy => {
        let nearestPlayer = null;
        let nearestDistance = Infinity;
        Object.values(players).forEach(player => {
            const distance = Math.sqrt((player.x - enemy.x) ** 2 + (player.y - enemy.y) ** 2);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPlayer = player;
            }
        });
        if (nearestPlayer) {
            const dx = nearestPlayer.x - enemy.x;
            const dy = nearestPlayer.y - enemy.y;
            const length = Math.sqrt(dx ** 2 + dy ** 2);
            if (length > 0) {
                enemy.x += (dx / length) * enemy.speed;
                enemy.y += (dy / length) * enemy.speed;
                io.emit("enemyMoved", { id: enemy.id, x: enemy.x, y: enemy.y });
            }
        }
    });
}

// Socket.IO connections
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

    socket.on("playerMove", (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            socket.broadcast.emit("playerMoved", { id: socket.id, x: data.x, y: data.y });
        }
    });

    socket.on("disconnect", () => {
        console.log(`🔴 Player disconnected: ${socket.id}`);
        delete players[socket.id];
        socket.broadcast.emit("playerDisconnected", socket.id);
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

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});
