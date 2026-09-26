import Phaser from 'phaser';
import type { GameController } from '../app/controller.ts';
import { SHEETS, TILE } from '../art/atlas.ts';
import { FloorScene, VIEW_H, VIEW_W } from './FloorScene.ts';
import { WorldScene } from './WorldScene.ts';

// Phaser only renders. Both views run all the time (the sim never waits on
// them); switching just swaps which scene is visible and takes input.

export interface GameViews {
  game: Phaser.Game;
  setView(view: 'floor' | 'world'): void;
  destroy(): void;
}

export function createPhaserGame(parent: HTMLElement, ctrl: GameController): GameViews {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#1a1410',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { keyboard: false },
    banner: false,
    audio: { noAudio: true },
    fps: { target: 60 },
  });
  // Load the sheets once, then start both views.
  class BootScene extends Phaser.Scene {
    preload(): void {
      for (const s of Object.values(SHEETS)) this.load.spritesheet(s.key, s.url, { frameWidth: TILE, frameHeight: TILE, spacing: s.spacing });
    }
    create(): void {
      game.scene.add('floor', FloorScene, true, { ctrl });
      game.scene.add('world', WorldScene, true, { ctrl });
      this.scene.remove();
    }
  }
  game.scene.add('boot', BootScene, true);

  let current: 'floor' | 'world' | null = null;
  const apply = (view: 'floor' | 'world') => {
    const floor = game.scene.getScene('floor');
    const world = game.scene.getScene('world');
    if (!floor || !world) return;
    const show = view === 'floor' ? floor : world;
    const hide = view === 'floor' ? world : floor;
    hide.scene.setVisible(false);
    hide.input.enabled = false;
    show.scene.setVisible(true);
    show.input.enabled = true;
    if (current !== null) show.cameras.main.fadeIn(140, 8, 6, 4);
    current = view;
  };
  game.events.once('ready', () => apply(ctrl.world.focus.view));
  // Scenes may not exist on the very first frame.
  const poll = setInterval(() => {
    if (game.scene.getScene('floor') && game.scene.getScene('world')) {
      clearInterval(poll);
      apply(ctrl.world.focus.view);
    }
  }, 30);

  return {
    game,
    setView(view) {
      if (view !== current) apply(view);
    },
    destroy() {
      clearInterval(poll);
      game.destroy(true);
    },
  };
}
