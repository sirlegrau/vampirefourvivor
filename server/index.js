const { createServer } = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const httpServer = createServer();
const io = new Server(httpServer, {
    cors: {
        origin: ["http://localhost:5173", "https://vampirefourvivor.netlify.app/"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Game state
let players = {};
let enemies = [];
let xpOrbs = [];
let gameInProgress = false;
let gameLoopInterval;
let waveInterval;
let currentWave = 0;

// Player stats
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

// Enemy stats
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

function checkPlayerCollisions() {
    enemies = enemies.filter(enemy => {
        let hitPlayer = Object.entries(players).find(([id, player]) => Math.hypot(player.x - enemy.x, player.y - enemy.y) < 40);
        if (hitPlayer) {
            let [playerId, player] = hitPlayer;
            player.hp -= 1;
            io.emit("updateHP", { id: playerId, hp: player.hp });
            if (player.hp <= 0) io.emit("playerDied", playerId);
            return false;
        }
        return true;
    });
}

io.on("connection", (socket) => {
    console.log(`🟢 Player connected: ${socket.id}`);
    players[socket.id] = { ...initialPlayerStats };
    if (!gameInProgress) { gameInProgress = true; startGameLoop(); }

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
        }
    });
});

httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
});
