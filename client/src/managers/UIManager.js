// managers/UIManager.js
import GameConfig from '../config/gameConfig.js';

export default class UIManager {
    constructor(scene) {
        this.scene = scene;
        this.playerStats = scene.playerStats;
        this.uiGroup = scene.add.group();
        this.currentWave = 0;

        this.createUI();
    }

    createUI() {
        const config = GameConfig.UI;

        // Health bar
        this.hpBar = this.scene.add.graphics().setScrollFactor(0);
        this.hpText = this.scene.add.text(20, 20, "HP: 5/5", {
            fontSize: '16px',
            fill: '#ffffff'
        }).setScrollFactor(0);

        // Level and XP
        this.levelText = this.scene.add.text(20, 50, "Level: 1", {
            fontSize: '16px',
            fill: '#ffffff'
        }).setScrollFactor(0);

        this.xpBar = this.scene.add.graphics().setScrollFactor(0);
        this.xpText = this.scene.add.text(20, 80, "XP: 0/80", {
            fontSize: '16px',
            fill: '#ffffff'
        }).setScrollFactor(0);

        // Score
        this.scoreText = this.scene.add.text(20, 110, "Score: 0", {
            fontSize: '16px',
            fill: '#ffffff'
        }).setScrollFactor(0);

        // Current wave
        this.waveText = this.scene.add.text(20, 140, "Wave: 0", {
            fontSize: '16px',
            fill: '#ffffff'
        }).setScrollFactor(0);

        // Stats
        this.statsText = this.scene.add.text(20, 170, "Damage: 1x | Speed: 1x | Bullets: 1", {
            fontSize: '16px',
            fill: '#ffffff'
        }).setScrollFactor(0);
    }

    updateUI() {
        const config = GameConfig.UI;

        // Health bar
        this.hpBar.clear();
        this.hpBar.fillStyle(config.colors.background, 1);
        this.hpBar.fillRect(20, 40, config.bars.width, config.bars.height);
        this.hpBar.fillStyle(config.colors.health, 1);
        this.hpBar.fillRect(20, 40, config.bars.width * (this.playerStats.hp / this.playerStats.maxHp), config.bars.height);

        // Update text
        this.hpText.setText(`HP: ${this.playerStats.hp}/${this.playerStats.maxHp}`);
        this.levelText.setText(`Level: ${this.playerStats.level}`);

        // XP bar
        const requiredXp = this.playerStats.level * 80;
        const prevRequiredXp = (this.playerStats.level - 1) * 80;
        const xpProgress = (this.playerStats.xp - prevRequiredXp) / (requiredXp - prevRequiredXp);

        this.xpBar.clear();
        this.xpBar.fillStyle(config.colors.background, 1);
        this.xpBar.fillRect(20, 100, config.bars.width, config.bars.height);
        this.xpBar.fillStyle(config.colors.xp, 1);
        this.xpBar.fillRect(20, 100, config.bars.width * xpProgress, config.bars.height);

        this.xpText.setText(`XP: ${this.playerStats.xp}/${requiredXp}`);
        this.scoreText.setText(`Score: ${this.playerStats.score}`);
        this.waveText.setText(`Wave: ${this.currentWave || 0}`);

        const damageText = this.playerStats.damageMultiplier ?
            `${this.playerStats.damageMultiplier.toFixed(1)}x` : '1.0x';
        const speedText = this.playerStats.speedMultiplier ?
            `${this.playerStats.speedMultiplier.toFixed(1)}x` : '1.0x';
        const bulletText = this.playerStats.bulletsPerShot || 1;

        this.statsText.setText(`Damage: ${damageText} | Speed: ${speedText} | Bullets: ${bulletText}`);
    }

    showWaveStart(waveNumber) {
        this.currentWave = waveNumber;
        this.updateUI();

        const waveText = this.scene.add.text(
            this.scene.cameras.main.width / 2,
            100,
            `WAVE ${waveNumber}`,
            {
                fontSize: '32px',
                fill: '#ffffff',
                stroke: '#000000',
                strokeThickness: 4
            }
        );
        waveText.setScrollFactor(0);
        waveText.setOrigin(0.5);

        this.scene.tweens.add({
            targets: waveText,
            alpha: 0,
            y: 80,
            duration: 2000,
            onComplete: () => waveText.destroy()
        });
    }

    showLevelUp() {
        const flash = this.scene.add.rectangle(
            0, 0,
            this.scene.cameras.main.width,
            this.scene.cameras.main.height,
            0xFFFFFF, 0.5
        ).setScrollFactor(0).setOrigin(0);

        this.scene.tweens.add({
            targets: flash,
            alpha: 0,
            duration: 500,
            onComplete: () => flash.destroy()
        });

        const levelUpText = this.scene.add.text(
            this.scene.cameras.main.width / 2,
            this.scene.cameras.main.height / 2,
            'LEVEL UP!',
            {
                fontSize: '32px',
                fill: '#ffff00',
                stroke: '#000000',
                strokeThickness: 5
            }
        ).setScrollFactor(0).setOrigin(0.5);

        this.scene.tweens.add({
            targets: levelUpText,
            scale: 1.5,
            alpha: 0,
            duration: 1000,
            onComplete: () => {
                levelUpText.destroy();
                this.showUpgradeOptions();
            }
        });
    }

    showUpgradeOptions() {
        const config = GameConfig.UI;
        const upgradeOptions = GameConfig.UPGRADES.types;

        const bg = this.scene.add.rectangle(
            0, 0,
            this.scene.cameras.main.width,
            this.scene.cameras.main.height,
            0x000000, 0.7
        ).setScrollFactor(0).setOrigin(0);

        const title = this.scene.add.text(
            this.scene.cameras.main.width / 2,
            100,
            'Choose an AWESOME Upgrade',
            {
                fontSize: '28px',
                fill: '#ff0000',
                stroke: '#000000',
                strokeThickness: 3
            }
        ).setScrollFactor(0).setOrigin(0.5);

        const optionButtons = [];

        upgradeOptions.forEach((option, i) => {
            const y = 200 + i * 70;
            const button = this.scene.add.rectangle(
                this.scene.cameras.main.width / 2,
                y,
                400,
                60,
                config.colors.button
            ).setScrollFactor(0).setInteractive();

            const text = this.scene.add.text(
                this.scene.cameras.main.width / 2,
                y,
                option.text,
                {
                    fontSize: '20px',
                    fill: '#ffffff',
                    stroke: '#000000',
                    strokeThickness: 2
                }
            ).setScrollFactor(0).setOrigin(0.5);

            button.on('pointerover', () => button.setFillStyle(config.colors.buttonHover));
            button.on('pointerout', () => button.setFillStyle(config.colors.button));

            button.on('pointerup', () => {
                this.scene.socket.emit("upgrade", option.id);
                bg.destroy();
                title.destroy();
                optionButtons.forEach(btn => {
                    btn.button.destroy();
                    btn.text.destroy();
                });
            });

            optionButtons.push({ button, text });
        });
    }

    showGameOver() {
        const config = GameConfig.UI;

        const bg = this.scene.add.rectangle(
            0, 0,
            this.scene.cameras.main.width,
            this.scene.cameras.main.height,
            0x000000, 0.8
        ).setScrollFactor(0).setOrigin(0);

        const gameOverText = this.scene.add.text(
            this.scene.cameras.main.width / 2,
            this.scene.cameras.main.height / 2 - 50,
            'GAME OVER',
            {
                fontSize: '48px',
                fill: '#ff0000',
                stroke: '#000000',
                strokeThickness: 6
            }
        ).setScrollFactor(0).setOrigin(0.5);

        const scoreText = this.scene.add.text(
            this.scene.cameras.main.width / 2,
            this.scene.cameras.main.height / 2 + 20,
            `Final Score: ${this.playerStats.score}`,
            { fontSize: '32px', fill: '#ffffff' }
        ).setScrollFactor(0).setOrigin(0.5);

        const restartButton = this.scene.add.rectangle(
            this.scene.cameras.main.width / 2,
            this.scene.cameras.main.height / 2 + 100,
            200,
            60,
            config.colors.button
        ).setScrollFactor(0).setInteractive();

        const restartText = this.scene.add.text(
            this.scene.cameras.main.width / 2,
            this.scene.cameras.main.height / 2 + 100,
            'Restart',
            { fontSize: '24px', fill: '#ffffff' }
        ).setScrollFactor(0).setOrigin(0.5);

        restartButton.on('pointerover', () => restartButton.setFillStyle(config.colors.buttonHover));
        restartButton.on('pointerout', () => restartButton.setFillStyle(config.colors.button));
        restartButton.on('pointerup', () => window.location.reload());
    }
}