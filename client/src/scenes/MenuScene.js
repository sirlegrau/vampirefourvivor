// scenes/MenuScene.js
import Phaser from "phaser";
import GameConfig from "../config/gameConfig.js";

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super("MenuScene");
    }

    create() {
        // Add background
        const bg = this.add.image(0, 0, 'menu-background')
            .setOrigin(0, 0)
            .setDisplaySize(GameConfig.GAME.width, GameConfig.GAME.height);

        // Add game title
        const title = this.add.text(
            GameConfig.GAME.width / 2,
            100,
            GameConfig.GAME.title,
            {
                fontFamily: 'Arial',
                fontSize: '32px',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 6,
                align: 'center'
            }
        ).setOrigin(0.5);

        // Add logo (if available)
        if (this.textures.exists('logo')) {
            this.add.image(GameConfig.GAME.width / 2, 180, 'logo')
                .setOrigin(0.5);
        }

        // Player name input
        const playerName = localStorage.getItem("playerName") || "Player";

        // Player name text
        const nameText = this.add.text(
            GameConfig.GAME.width / 2,
            GameConfig.GAME.height / 2 - 20,
            'Enter your name:',
            {
                fontFamily: 'Arial',
                fontSize: '20px',
                color: '#ffffff'
            }
        ).setOrigin(0.5);

        // Create player name input field
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.id = 'nameInput';
        nameInput.style = `
            position: absolute;
            left: ${(GameConfig.GAME.width / 2) - 100}px;
            top: ${(GameConfig.GAME.height / 2) + 20}px;
            width: 200px;
            padding: 10px;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            text-align: center;
        `;
        nameInput.value = playerName;
        document.getElementById('game-container').appendChild(nameInput);

        // Add start button
        const startButton = this.add.text(
            GameConfig.GAME.width / 2,
            GameConfig.GAME.height / 2 + 100,
            'START GAME',
            {
                fontFamily: 'Arial',
                fontSize: '24px',
                color: '#ffffff',
                backgroundColor: '#3333aa',
                padding: {
                    x: 20,
                    y: 10
                },
                borderRadius: 10
            }
        )
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true })
            .on('pointerover', () => startButton.setBackgroundColor('#5555cc'))
            .on('pointerout', () => startButton.setBackgroundColor('#3333aa'))
            .on('pointerdown', () => {
                // Save player name
                const nameInputElement = document.getElementById('nameInput');
                const playerName = nameInputElement.value.trim() || "Player";
                localStorage.setItem("playerName", playerName);

                // Remove input element
                nameInputElement.remove();

                // Start game
                this.scene.start('GameScene');
            });

        // Instructions
        const instructions = this.add.text(
            GameConfig.GAME.width / 2,
            GameConfig.GAME.height - 80,
            'WASD or Arrow Keys to move\nMouse to aim and shoot',
            {
                fontFamily: 'Arial',
                fontSize: '16px',
                color: '#ffffff',
                align: 'center'
            }
        ).setOrigin(0.5);
    }

    shutdown() {
        // Clean up DOM elements in case scene is destroyed
        const nameInput = document.getElementById('nameInput');
        if (nameInput) {
            nameInput.remove();
        }
    }
}