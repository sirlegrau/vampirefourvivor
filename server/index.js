const { createServer } = require("http");
const { Server } = require("socket.io");

const httpServer = createServer();
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

let players = {};
let enemies = [];

// Spawn enemy every 3 seconds
function spawnEnemy() {
    const x = Math.random() * 800;
    const y = Math.random() * 600;
    const id = Math.random().toString(36).substr(2, 9);

    const enemy = { id, x, y, hp: 3, speed: 1 };
    enemies.push(enemy);
    io.emit("spawnEnemy", enemy);
}

setInterval(spawnEnemy, 3000);

io.on("connection", (socket) => {
    console.log(`🟢 Player connected: ${socket.id}`);

    players[socket.id] = { x: 400, y: 300, hp: 5, xp: 0, level: 1 };
    socket.emit("currentPlayers", players);
    socket.emit("currentEnemies", enemies);
    socket.broadcast.emit("newPlayer", players[socket.id]);

    socket.on("playerMove", (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            socket.broadcast.emit("playerMoved", { id: socket.id, x: data.x, y: data.y });
        }
    });

    socket.on("enemyHit", (enemyId) => {
        const enemy = enemies.find(e => e.id === enemyId);
        if (enemy) {
            enemy.hp--;
            if (enemy.hp <= 0) {
                enemies = enemies.filter(e => e.id !== enemyId);
                io.emit("enemyKilled", enemyId);
                players[socket.id].xp += 10;
                io.emit("updateXP", { id: socket.id, xp: players[socket.id].xp });
            }
        }
    });

    socket.on("disconnect", () => {
        console.log(`🔴 Player disconnected: ${socket.id}`);
        delete players[socket.id];
        socket.broadcast.emit("playerDisconnected", socket.id);
    });
});

httpServer.listen(3000, () => {
    console.log("✅ Server running on http://localhost:3000");
});
