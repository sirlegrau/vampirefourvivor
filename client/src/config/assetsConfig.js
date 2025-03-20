// config/assetsConfig.js
export default {
    IMAGES: [
        { key: "player", path: "assets/player.png" },
        { key: "enemy", path: "assets/enemy.png" },
        { key: "bullet", path: "assets/bullet.png" },
        { key: "experience", path: "assets/experience.png" },
        { key: "background", path: "assets/background.png" }
    ],

    AUDIO: [
        { key: "shoot", path: "assets/shoot.wav" },
        { key: "hit", path: "assets/hit.wav" },
        { key: "levelup", path: "assets/levelup.wav" }
    ],

    // Helper function to load all assets in a scene
    loadAll: function(scene) {
        // Load images
        this.IMAGES.forEach(img => {
            scene.load.image(img.key, img.path);
        });

        // Load audio
        this.AUDIO.forEach(audio => {
            scene.load.audio(audio.key, audio.path);
        });
    }
};