class PlayerController {
    constructor(io, config) {
        this.io = io;
        this.config = config;
        this.players = {};
    }

    getAllPlayers() {
        return this.players;
    }

    getPlayer(playerId) {
        return this.players[playerId];
    }

    getPlayerCount() {
        return Object.keys(this.players).length;
    }

    addPlayer(playerId) {
        this.players[playerId] = {
            ...this.config.PLAYER.initialStats,
            name: "Player"
        };
        return this.players[playerId];
    }

    removePlayer(playerId) {
        delete this.players[playerId];
        this.io.emit("playerDisconnected", playerId);
    }

    movePlayer(playerId, x, y) {
        const player = this.players[playerId];
        if (!player) return;

        player.x = x;
        player.y = y;

        this.io.emit("playerMoved", {
            id: playerId,
            x,
            y,
            name: player.name
        });
    }

    setPlayerName(playerId, name) {
        const player = this.players[playerId];
        if (!player) return;

        player.name = name || "Anonymous";
        this.io.emit("playerNameUpdate", { id: playerId, name: player.name });
    }

    damagePlayer(playerId, damage) {
        const player = this.players[playerId];
        if (!player) return;

        player.hp -= damage;
        this.io.emit("updateHP", { id: playerId, hp: player.hp });

        if (player.hp <= 0) {
            this.io.emit("playerDied", playerId);
        }
    }

    addXp(playerId, amount) {
        const player = this.players[playerId];
        if (!player) return false;

        player.xp += amount;
        return this.checkLevelUp(playerId);
    }

    checkLevelUp(playerId) {
        const player = this.players[playerId];
        if (!player) return false;

        const requiredXp = this.config.XP.getRequiredXp(player.level);
        if (player.xp >= requiredXp) {
            player.level += 1;

            // Generate random upgrade options
            const availableUpgrades = [];
            Object.entries(this.config.PLAYER.upgradeOptions).forEach(([type, data]) => {
                if (Math.random() < data.chance) {
                    availableUpgrades.push(type);
                }
            });

            // Ensure we have enough options even if RNG was unfavorable
            while (availableUpgrades.length < this.config.PLAYER.upgradeChoices) {
                const allTypes = Object.keys(this.config.PLAYER.upgradeOptions);
                const randomType = allTypes[Math.floor(Math.random() * allTypes.length)];
                if (!availableUpgrades.includes(randomType)) {
                    availableUpgrades.push(randomType);
                }
            }

            // Shuffle and get random choices
            const upgrades = availableUpgrades
                .sort(() => 0.5 - Math.random())
                .slice(0, this.config.PLAYER.upgradeChoices);

            // Send these choices to the player
            this.io.to(playerId).emit("upgradeOptions", upgrades);

            this.io.emit("updateXP", {
                id: playerId,
                xp: player.xp,
                level: player.level,
                leveledUp: true
            });
            return true;
        }

        return false;
    }

    updateXp(playerId, leveledUp = false) {
        const player = this.players[playerId];
        if (!player) return;

        this.io.emit("updateXP", {
            id: playerId,
            xp: player.xp,
            level: player.level,
            leveledUp
        });
    }

    upgradePlayer(playerId, upgradeType) {
        const player = this.players[playerId];
        if (!player) return;

        const upgradeOptions = this.config.PLAYER.upgradeOptions;

        switch (upgradeType) {
            case "hp":
                player.maxHp += upgradeOptions.hp.maxHpIncrease;
                if (upgradeOptions.hp.fullHeal) {
                    player.hp = player.maxHp;
                }
                this.io.emit("updateHP", { id: playerId, hp: player.hp });
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

        this.io.emit("playerUpgraded", {
            id: playerId,
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
    }

    addScore(playerId, points) {
        const player = this.players[playerId];
        if (!player) return;

        player.score += points;
        this.io.emit("updateScore", { id: playerId, score: player.score });
    }
}

module.exports = PlayerController;