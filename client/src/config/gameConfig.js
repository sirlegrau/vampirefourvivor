// config/gameConfig.js
export default {
    // Game settings
    GAME: {
        title: "FLOROTINGUS HUNTER XXX PLUS (EXTREME EDITION)",
        width: 800,
        height: 600,
        pixelArt: true
    },

    // World boundaries
    WORLD: {
        width: 1600,
        height: 1200,
        spawnBorderOffset: 100
    },

    // Player settings
    PLAYER: {
        initialStats: {
            x: 800,
            y: 600,
            hp: 5,
            maxHp: 5,
            level: 1,
            xp: 0,
            score: 0,
            damageMultiplier: 1,
            cooldownReduction: 1,
            speedMultiplier: 1,
            bulletsPerShot: 1
        },
        baseSpeed: 3,
        bulletHitRadius: 15,
        collisionRadius: 30
    },

    // Camera settings
    CAMERA: {
        followSpeed: 0.05
    },

    // Enemy settings
    ENEMIES: {
        basic: {
            tint: 0xFFFFFF,
            scale: 1,
            hp: 3
        },
        fast: {
            tint: 0xFF9999,
            scale: 0.8,
            hp: 2
        },
        tank: {
            tint: 0x9999FF,
            scale: 1.3,
            hp: 5
        },
        boss: {
            tint: 0xFF0000,
            scale: 2,
            hp: 15
        }
    },

    // Upgrade options
    UPGRADES: {
        types: [
            { id: "hp", text: "+ 3 MAX HP & FULL HEAL" },
            { id: "damage", text: "+ 50% DAMAGE" },
            { id: "cooldown", text: "+ 30% ATTACK SPEED" },
            { id: "speed", text: "+ 30% MOVEMENT SPEED" },
            { id: "multishot", text: "+ 1 BULLET PER SHOT" }
        ]
    },

    // UI settings
    UI: {
        colors: {
            health: 0xFF0000,
            xp: 0x00FF00,
            background: 0x333333,
            button: 0x3333AA,
            buttonHover: 0x5555CC,
            text: 0xFFFFFF
        },
        bars: {
            width: 200,
            height: 10,
            padding: 20
        }
    },

    // Socket configuration
    SOCKET: {
        // Default URL with fallback
        url: import.meta.env?.VITE_SERVER_URL || "https://vampirefourvivor.onrender.com"
    }
};