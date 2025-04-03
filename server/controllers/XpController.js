class XpController {
    constructor(io, config) {
        this.io = io;
        this.config = config;
        this.xpOrbs = [];
        this.controllers = null;
    }

    init(controllers) {
        this.controllers = controllers;
    }

    getAllXpOrbs() {
        return this.xpOrbs;
    }

    clearXpOrbs() {
        this.xpOrbs = [];
    }

    spawnXpOrb(x, y, value) {
        const orb = {
            id: `xp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            x,
            y,
            value
        };

        this.xpOrbs.push(orb);
        this.io.emit("spawnXpOrb", orb);

        return orb;
    }

    collectXpOrb(orbId, playerId) {
        const orbIndex = this.xpOrbs.findIndex(o => o.id === orbId);
        if (orbIndex === -1) return;

        const orb = this.xpOrbs[orbIndex];
        const playerController = this.controllers?.playerController;

        if (playerController) {
            this.distributeXp(playerId, orb);
        }

        this.xpOrbs.splice(orbIndex, 1);
        this.io.emit("xpOrbCollected", orbId);
    }

    getCollectableOrbs(playerId, player, collectionRadius) {
        const orbsToRemove = [];
        const playerController = this.controllers?.playerController;

        this.xpOrbs.forEach(orb => {
            if (Math.hypot(player.x - orb.x, player.y - orb.y) < collectionRadius) {
                if (playerController) {
                    this.distributeXp(playerId, orb);
                }
                orbsToRemove.push(orb.id);
            }
        });

        // Remove collected orbs
        if (orbsToRemove.length > 0) {
            orbsToRemove.forEach(orbId => {
                this.xpOrbs = this.xpOrbs.filter(o => o.id !== orbId);
                this.io.emit("xpOrbCollected", orbId);
            });
        }
    }

    distributeXp(collectorId, orb) {
        const playerController = this.controllers?.playerController;
        if (!playerController) return;

        // Add full XP value to the collecting player
        const collectorLeveledUp = playerController.addXp(collectorId, orb.value);

        // Share half the XP value (rounded up) with all other players
        const sharedXp = Math.ceil(orb.value / 2);
        const players = playerController.getAllPlayers();

        Object.entries(players).forEach(([otherPlayerId, otherPlayer]) => {
            // Skip the player who collected the orb
            if (otherPlayerId !== collectorId) {
                const otherPlayerLeveledUp = playerController.addXp(otherPlayerId, sharedXp);

                // Emit XP update if they didn't level up (level up already emits an update)
                if (!otherPlayerLeveledUp) {
                    playerController.updateXp(otherPlayerId, false);
                }
            }
        });

        // Emit XP update if collector didn't level up (level up already emits an update)
        if (!collectorLeveledUp) {
            playerController.updateXp(collectorId, false);
        }

        // Emit notification about XP sharing
        this.io.emit("xpShared", {
            collectorId,
            orbValue: orb.value,
            sharedValue: sharedXp
        });
    }
}

module.exports = XpController;
