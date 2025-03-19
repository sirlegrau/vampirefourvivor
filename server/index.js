const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());

let players = {};
let enemies = [];

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    players[socket.id] = { x: 400, y: 300 };

    socket.emit("currentPlayers", players);
    socket.broadcast.emit("newPlayer", { id: socket.id, x: 400, y: 300 });
    socket.emit("currentEnemies", enemies);

    socket.on("playerMove", (data) => {
        if (players[socket.id]) {
            players[socket.id] = data;
            socket.broadcast.emit("playerMoved", { id: socket.id, ...data });
        }
    });

    socket.on("enemyKilled", (data) => {
        io.emit("enemyKilled", data);
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
        io.emit("playerDisconnected", socket.id);
    });
});

server.listen(3000, () => {
    console.log("✅ Server running on http://localhost:3000");
});