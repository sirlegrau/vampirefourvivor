// gameConfig.js - Configuration for the multiplayer survival game

// Game world settings
const WORLD = {
    width: 1600,
    height: 1200,
    spawnBorderOffset: 50
};

// Initial player stats
const PLAYER = {
    initialStats: {
        x: 800,
        y: 600,
        hp: 5,
        maxHp: 5,
        xp: 0,
        level: 1,
        score: 0,
        weaponLevel: 1,
        damageMultiplier: 1,
        cooldownReduction: 1,
        speedMultiplier: 1,
        bulletsPerShot: 1
    },
    upgradeOptions: {
        hp: { maxHpIncrease: 3, fullHeal: true },
        damage: { multiplierIncrease: 0.5 },
        cooldown: { reductionIncrease: 0.3, minimumValue: 0.3 },
        speed: { multiplierIncrease: 0.3 },
        multishot: { bulletsIncrease: 1 }
    }
};

// Enemy types and their stats
const ENEMIES = {
    basic: { hp: 3, speed: 1, points: 10, xpValue: 5 },
    fast: { hp: 2, speed: 2, points: 15, xpValue: 7 },
    tank: { hp: 8, speed: 0.5, points: 20, xpValue: 10 },
    boss: { hp: 30, speed: 0.7, points: 100, xpValue: 50 }
};

// XP and leveling settings
const XP = {
    orbCollectionRadius: 50,
    getRequiredXp: (level) => Math.floor(level * 80)
};

// Wave spawning settings
const WAVES = {
    timeBetweenWaves: 25000, // milliseconds
    enemySpawnDelay: 800,    // milliseconds between enemy spawns
    getBaseEnemiesForWave: (waveNumber) => 5 + Math.floor(waveNumber * 2),
    getWaveComposition: (waveNumber, baseEnemies) => ({
        basic: Math.floor(baseEnemies * 0.5),
        fast: Math.floor(baseEnemies * 0.2),
        tank: Math.floor(baseEnemies * 0.1),
        boss: waveNumber % 4 === 0 ? 1 : 0
    }),
    hpScalingPerWave: 0.1 // 10% HP increase per wave
};

// Game simulation settings
const SIMULATION = {
    tickRate: 33, // milliseconds per game loop tick (roughly 30 fps)
    bulletSpeed: 10,
    bulletHitRadius: 30,
    playerEnemyCollisionRadius: 40
};

// Server settings
const SERVER = {
    port: process.env.PORT || 3000
};

module.exports = {
    WORLD,
    PLAYER,
    ENEMIES,
    XP,
    WAVES,
    SIMULATION,
    SERVER
};