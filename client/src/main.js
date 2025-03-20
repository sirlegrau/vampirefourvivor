// Main.js
import Phaser from "phaser";
import GameConfig from "./config/gameConfig.js";
import BootScene from "./scenes/BootScene.js";
import MenuScene from "./scenes/MenuScene.js";
import GameScene from "./scenes/GameScene.js";

class Game extends Phaser.Game {
    constructor() {
        // Create configuration for Phaser
        const config = {
            type: Phaser.AUTO,
            width: GameConfig.GAME.width,
            height: GameConfig.GAME.height,
            parent: "game-container",
            physics: {
                default: "arcade",
                arcade: {
                    gravity: { y: 0 },
                    debug: false
                }
            },
            scene: [BootScene, MenuScene, GameScene],
            pixelArt: GameConfig.GAME.pixelArt,
            title: GameConfig.GAME.title
        };

        super(config);
    }
}

// Create and export a singleton instance
const game = new Game();
export default game;