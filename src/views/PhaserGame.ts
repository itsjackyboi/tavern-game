import Phaser from 'phaser';
import type { GameController } from '../app/controller.ts';
import { FloorScene, VIEW_H, VIEW_W } from './FloorScene.ts';

// Phaser only renders. It is created after Play so the title screen stays light
// (this module is loaded with a dynamic import).

export function createPhaserGame(parent: HTMLElement, ctrl: GameController): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#1a1410',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // Keyboard is handled by src/input/hotkeys.ts on window, not by Phaser.
    input: { keyboard: false },
    banner: false,
    audio: { noAudio: true },
  });
  game.scene.add('floor', FloorScene, true, { ctrl });
  return game;
}
