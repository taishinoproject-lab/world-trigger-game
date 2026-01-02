import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { MainScene } from "./scenes/MainScene";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: "app",
  backgroundColor: "#111111",
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
    },
  },
  scene: [MainScene],
};

export const createGame = () => new Phaser.Game(gameConfig);
