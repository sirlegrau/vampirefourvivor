// gameConfig.js - Enhanced configuration for the multiplayer survival game

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
        hp: 3,            // Reduced starting HP for more challenge
        maxHp: 3,         // Reduced starting max HP
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
        hp: {
            maxHpIncrease: 2,      // Smaller health increases
            fullHeal: false,       // No full heal on upgrade - makes choices more tactical
            chance: 0.85           // 85% chance to appear in upgrade options
        },
        damage: {
            multiplierIncrease: 0.25, // More gradual damage scaling
            chance: 0.9              // 90% chance to appear
        },
        cooldown: {
            reductionIncrease: 0.15,
            minimumValue: 0.3,
            chance: 0.8             // 80% chance to appear
        },
        speed: {
            multiplierIncrease: 0.2,
            chance: 0.7             // 70% chance to appear
        },
        multishot: {
            bulletsIncrease: 1,
            chance: 0.6             // 60% chance (more rare)
        },
        area: {                     // New upgrade type: area of effect
            radiusIncrease: 0.15,
            chance: 0.5             // 50% chance (rare)
        },
        critical: {                 // New upgrade type: critical hit chance
            chanceIncrease: 0.05,   // 5% increase per upgrade
            damageMultiplier: 2.5,  // Crit does 2.5x damage
            chance: 0.4             // 40% chance to appear (very rare)
        }
    },
    // Number of upgrades to show when leveling up
    upgradeChoices: 3
};

// Enemy types and their stats (removed swarm, bomber, and tank)
const ENEMIES = {
    basic: { hp: 3, speed: 1.2, points: 10, xpValue: 3 },            // Faster, less XP
    fast: { hp: 2, speed: 2.5, points: 15, xpValue: 1 },             // Even faster
    boss: { hp: 35, speed: 0.8, points: 120, xpValue: 10 },          // Stronger boss
    florotingus: { hp: 1000, speed: 0.3, points: 500, xpValue: 200,  // Special round enemy
        spawnRate: 0.2, healthScaling: 1000 }               // Spawn probability and health scaling per wave
};

// XP and leveling settings
const XP = {
    orbCollectionRadius: 20,  // Smaller collection radius
    // Logarithmic XP curve similar to Vampire Survivors
    getRequiredXp: (level) => Math.floor(20 * Math.pow(level, 1.4)),
    // XP orbs fade over time
    orbLifetime: 8000,        // 8 seconds before disappearing
    // XP magnetism increases with player level
    getMagnetismRadius: (level) => 40 + (level * 5)
};

// Wave spawning settings
const WAVES = {
    // Remove timeBetweenWaves as waves will now start when previous wave is cleared
    enemySpawnDelay: 400,        // Faster spawn rate within a wave

    // Flag to track if all enemies from previous wave are defeated
    waitForWaveClear: true,      // New flag to enable the wave-on-clear behavior

    // Base enemy count scales logarithmically
    getBaseEnemiesForWave: (waveNumber) => {
        return Math.floor(5 + (waveNumber * 3) + Math.pow(waveNumber, 1.2));
    },

    // Dynamic wave composition that changes as game progresses (removed tank, swarm, bomber)
    getWaveComposition: (waveNumber, baseEnemies, activePlayers) => {
        // Scale enemy count by number of active players
        const playerScaling = Math.max(1, Math.sqrt(activePlayers));
        const scaledBaseEnemies = Math.floor(baseEnemies * playerScaling);

        // Special Florotingus round
        if (waveNumber % 10 === 0) {
            return {
                florotingus: 1 + Math.floor(waveNumber / 20) // More Florotingus in later rounds
            };
        }

        // Regular rounds with simplified enemy composition
        const composition = {};

        // Early game (waves 1-10)
        if (waveNumber <= 10) {
            composition.basic = Math.floor(scaledBaseEnemies * 0.7);
            composition.fast = Math.floor(scaledBaseEnemies * 0.3);
            if (waveNumber % 5 === 0) composition.boss = 1;
        }
        // Mid game and beyond (waves 11+)
        else {
            composition.basic = Math.floor(scaledBaseEnemies * 0.5);
            composition.fast = Math.floor(scaledBaseEnemies * 0.5);
            if (waveNumber % 5 === 0) composition.boss = 1 + Math.floor(waveNumber / 15);
        }

        return composition;
    },

    hpScalingPerWave: 0.08,  // More gradual HP scaling
    speedScalingPerWave: 0.03, // Enemies get slightly faster each wave

    // Difficulty spike intervals
    difficultySpikes: {
        interval: 5,         // Every 5 waves
        multiplier: 1.5      // 50% difficulty increase
    },

    // Special event waves (simplified to just boss waves)
    specialWaves: {
        boss: {
            interval: 5,     // Every 5 waves is a boss wave
            scaling: 1.5     // Bosses get 50% stronger each boss wave
        }
    },

    // Visual effects for wave announcements
    announceWaveTime: 3000,  // 3 seconds to announce wave
    announceBossTime: 5000   // 5 seconds to announce boss wave
};

// Game simulation settings
const SIMULATION = {
    tickRate: 33,                // ~30 fps
    bulletSpeed: 12,             // Faster bullets
    bulletLifetime: 1500,        // Bullets disappear after 1.5 seconds
    bulletHitRadius: 25,         // Smaller hit radius
    playerEnemyCollisionRadius: 35, // Tighter collision detection

    // Tracking for wave progression
    activeEnemies: 0,            // Counter for currently active enemies
    waveComplete: true,          // Flag to track if wave is complete

    // Damage calculation
    calculateDamage: (baseDamage, playerLevel, isCritical) => {
        return isCritical ? baseDamage * 2.5 : baseDamage;
    },
    // Critical hit system
    criticalHitChance: 0.05,     // Base 5% chance for critical hits
    criticalHitMultiplier: 2.5,  // Critical hits do 2.5x damage
    // Environment hazards
    hazards: {
        enabled: true,
        spawnInterval: 60000,    // Spawn hazards every minute
        duration: 15000,         // Hazards last for 15 seconds
        damage: 1                // Hazards deal 1 damage per second
    }
};

// Power-up system (for randomized upgrades)
const POWERUPS = {
    // Maximum powerups active at once
    maxActive: 3,
    // Cooldown between powerup offers
    offerCooldown: 60000,  // 1 minute between powerup offers
    // Available powerups and their effects
    types: {
        temporaryDamage: {
            multiplier: 2.0,
            duration: 10000,   // 10 seconds
            chance: 0.7        // 70% chance to appear
        },
        temporarySpeed: {
            multiplier: 1.5,
            duration: 15000,   // 15 seconds
            chance: 0.8        // 80% chance to appear
        },
        shield: {
            hitpoints: 3,      // Absorbs 3 hits
            duration: 20000,   // 20 seconds
            chance: 0.6        // 60% chance to appear
        },
        areaDamage: {
            radius: 150,
            damage: 5,
            chance: 0.5        // 50% chance to appear
        },
        magnetism: {
            radius: 300,       // Large XP collection radius
            duration: 12000,   // 12 seconds
            chance: 0.7        // 70% chance to appear
        },
        regeneration: {
            amount: 1,         // Heal 1 HP
            interval: 5000,    // Every 5 seconds
            duration: 15000,   // For 15 seconds total
            chance: 0.4        // 40% chance (rare)
        }
    },
    // Helper function to select random powerups based on their chance
    getRandomPowerups: (count) => {
        const available = [];
        Object.entries(POWERUPS.types).forEach(([name, data]) => {
            if (Math.random() < data.chance) {
                available.push({ name, ...data });
            }
        });

        // If not enough powerups passed the chance check, add some randomly
        while (available.length < count) {
            const allTypes = Object.entries(POWERUPS.types);
            const randomType = allTypes[Math.floor(Math.random() * allTypes.length)];
            available.push({ name: randomType[0], ...randomType[1] });
        }

        // Shuffle and return requested count
        return available
            .sort(() => Math.random() - 0.5)
            .slice(0, count);
    }
};

// Server settings
const SERVER = {
    port: process.env.PORT || 3000,
    maxPlayers: 8,              // Maximum players per server
    inactivityTimeout: 300000   // Kick inactive players after 5 minutes
};

// Helper functions for game balance
const BALANCE = {
    // Calculate effective difficulty based on wave and player count
    getDifficulty: (wave, playerCount) => {
        const baseScale = 1 + (wave * 0.08);
        const playerScale = Math.sqrt(playerCount);
        return baseScale * playerScale;
    },

    // Calculate enemy scaling based on difficulty
    getEnemyScaling: (difficulty) => {
        return {
            hp: Math.pow(difficulty, 1.2),
            speed: 1 + (0.05 * difficulty),
            count: Math.floor(5 + (difficulty * 2))
        };
    },

    // XP drop rate based on wave number
    getXpDropRate: (wave) => {
        // XP drops become less common in later waves
        return Math.max(0.7, 1 - (wave * 0.01));
    }
};

module.exports = {
    WORLD,
    PLAYER,
    ENEMIES,
    XP,
    WAVES,
    SIMULATION,
    POWERUPS,
    SERVER,
    BALANCE
};