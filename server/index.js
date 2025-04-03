const { createServer } = require("http");
const { Server } = require("socket.io");
const config = require("./config/gameConfig");
const GameController = require("./controllers/GameController");
const PlayerController = require("./controllers/PlayerController");
const EnemyController = require("./controllers/EnemyController");
const BulletController = require("./controllers/BulletController");
const XpController = require("./controllers/XpController");
const WaveController = require("./controllers/WaveController");

// Create HTTP server and Socket.IO instance
const httpServer = createServer();
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Initialize game controllers
const gameController = new GameController(io, config);
const playerController = new PlayerController(io, config);
const enemyController = new EnemyController(io, config);
const bulletController = new BulletController(io, config);
const xpController = new XpController(io, config);
const waveController = new WaveController(io, config);

// Connect controllers to each other for dependencies
gameController.init({
    playerController,
    enemyController,
    bulletController,
    xpController,
    waveController
});

// Socket connection handler
io.on("connection", (socket) => {
    console.log(`🟢 Player connected: ${socket.id}`);

    // Register new player
    playerController.addPlayer(socket.id);

    // Start game if not already running
    if (!gameController.isGameInProgress()) {
        gameController.startGame();
    }

    // Send current game state to new player
    socket.emit("currentPlayers", playerController.getAllPlayers());
    socket.emit("currentEnemies", enemyController.getAllEnemies());
    socket.emit("currentXpOrbs", xpController.getAllXpOrbs());

    // Broadcast new player to others
    socket.broadcast.emit("newPlayer", { id: socket.id, ...playerController.getPlayer(socket.id) });

    // Socket event handlers
    socket.on("playerMove", ({ x, y }) => {
        playerController.movePlayer(socket.id, x, y);
    });

    socket.on("playerName", (name) => {
        playerController.setPlayerName(socket.id, name);
    });

    socket.on("playerShoot", ({ x, y, angle, damage }) => {
        bulletController.createBullet(socket.id, x, y, angle, damage);
    });

    socket.on("enemyHit", ({ enemyId, damage }) => {
        enemyController.damageEnemy(enemyId, damage, socket.id);
    });

    socket.on("collectXpOrb", (orbId) => {
        xpController.collectXpOrb(orbId, socket.id);
    });

    socket.on("upgrade", (upgradeType) => {
        playerController.upgradePlayer(socket.id, upgradeType);
    });

    socket.on("disconnect", () => {
        console.log(`🔴 Player disconnected: ${socket.id}`);
        playerController.removePlayer(socket.id);

        if (playerController.getPlayerCount() === 0) {
            console.log("❌ No players left. Stopping game loop.");
            gameController.stopGame();
            waveController.resetWaves();
            enemyController.clearEnemies();
            xpController.clearXpOrbs();
            bulletController.clearBullets();
        }
    });
});

// Start the server
httpServer.listen(config.SERVER.port, "0.0.0.0", () => {
    console.log(`✅ Server running on http://0.0.0.0:${config.SERVER.port}`);
});