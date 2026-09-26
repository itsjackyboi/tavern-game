import Phaser from 'phaser';
import type { GameController } from '../app/controller.ts';
import { SHEETS, SPRITES, TILE, type SpriteName } from '../art/atlas.ts';

// M0 placeholder tavern floor: a static room built from Kenney Tiny Dungeon
// tiles, an idle avatar, a few seated patrons, and a night tint driven by the
// sim calendar. It only READS the world; all input goes through Commands.

export const VIEW_W = 480;
export const VIEW_H = 270;

export class FloorScene extends Phaser.Scene {
  private ctrl!: GameController;
  private tint!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('floor');
  }

  init(data: { ctrl: GameController }): void {
    this.ctrl = data.ctrl;
  }

  preload(): void {
    for (const s of Object.values(SHEETS)) {
      this.load.spritesheet(s.key, s.url, { frameWidth: TILE, frameHeight: TILE });
    }
  }

  private put(name: SpriteName, col: number, row: number): Phaser.GameObjects.Image {
    const ref = SPRITES[name];
    return this.add.image(col * TILE, row * TILE, SHEETS[ref.sheet].key, ref.frame).setOrigin(0, 0);
  }

  create(): void {
    const cols = Math.ceil(VIEW_W / TILE);
    const rows = Math.ceil(VIEW_H / TILE);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r < 2) this.put('wallStone', c, r);
        else this.put((c * 7 + r * 3) % 11 === 0 ? 'floorPlankWorn' : 'floorPlank', c, r);
      }
    }
    // Back wall furniture and kegs behind the bar.
    for (const c of [1, 2, 20, 21]) this.put('shelf', c, 1);
    for (let c = 4; c <= 11; c++) this.put('keg', c, 2);
    // Bar counter.
    for (let c = 3; c <= 12; c++) this.put('table', c, 4);
    // Tables with stools.
    const tables: Array<[number, number]> = [[17, 5], [22, 5], [17, 10], [22, 10], [7, 10], [11, 13]];
    for (const [c, r] of tables) {
      this.put('table', c, r);
      this.put('stool', c - 1, r);
      this.put('stool', c + 1, r);
    }
    // Door.
    this.put('doorWood', 14, rows - 1);

    // Seated patrons.
    const patrons: Array<[SpriteName, number, number]> = [
      ['patronA', 16, 5], ['patronB', 18, 5], ['patronC', 23, 10], ['patronD', 6, 10], ['patronE', 21, 5],
    ];
    for (const [name, c, r] of patrons) this.put(name, c, r - 0.4);

    // The owner (player avatar), behind the bar, with an idle bob.
    const avatar = this.put('avatar', 8, 3);
    this.tweens.add({ targets: avatar, y: avatar.y - 1, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.tint = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x0b1030, 0).setOrigin(0, 0);
  }

  override update(): void {
    const cal = this.ctrl.calendar();
    let color = 0x0b1030;
    let alpha = 0;
    switch (cal.phase) {
      case 'day': alpha = 0; break;
      case 'night': alpha = 0.32; break;
      case 'lastCall': alpha = 0.42; break;
      case 'holiday': color = 0x5a2a00; alpha = 0.22; break;
    }
    this.tint.setFillStyle(color, alpha);
  }
}
