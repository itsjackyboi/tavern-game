import Phaser from 'phaser';
import type { GameController } from '../app/controller.ts';
import { PALETTES } from '../art/palettes.ts';
import { SHEETS, SPRITES, TILE, type SpriteName } from '../art/atlas.ts';
import { CITY_IDS, type CityId } from '../content/schema.ts';
import { cityOf } from '../sim/lookup.ts';
import { drawer, hover, selectedCity, sound } from '../ui/bus.ts';
import { VIEW_H, VIEW_W } from './FloorScene.ts';

// The zoomed-out Isles map: a cooler, schematic overworld. Relative geography
// follows docs/reference/pintland_map.jpg; nothing here traces it.

const CELL = 4;
const GW = Math.ceil(VIEW_W / CELL);
const GH = Math.ceil(VIEW_H / CELL);

type Ellipse = [number, number, number, number];
const LAND: Ellipse[] = [
  [0.34, 0.52, 0.27, 0.42], [0.46, 0.19, 0.15, 0.13], [0.55, 0.46, 0.085, 0.12], [0.42, 0.82, 0.17, 0.13],
  [0.16, 0.36, 0.1, 0.16], [0.62, 0.36, 0.035, 0.06],
];
const ISLANDS: Ellipse[] = [[0.79, 0.6, 0.06, 0.055], [0.875, 0.665, 0.04, 0.04], [0.8, 0.72, 0.03, 0.03], [0.9, 0.56, 0.02, 0.025]];
const WATER_CUTS: Ellipse[] = [[0.575, 0.27, 0.055, 0.055]];
const LAKE: Ellipse = [0.33, 0.57, 0.045, 0.06];
const MOUNTAINS: Ellipse = [0.26, 0.5, 0.045, 0.22];
const FOREST: Ellipse = [0.44, 0.52, 0.08, 0.1];
const FIELDS: Ellipse = [0.42, 0.74, 0.07, 0.05];

export const CUMSTEAD = { x: 0.42, y: 0.74 };
const ROUTES: Array<[CityId | 'cumstead', CityId | 'cumstead']> = [
  ['providence', 'shanty'], ['shanty', 'aleforge'], ['aleforge', 'roto'], ['providence', 'roto'],
  ['cumstead', 'shanty'], ['cumstead', 'aleforge'], ['cumstead', 'providence'],
];

const inE = (x: number, y: number, [cx, cy, rx, ry]: Ellipse) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const noise = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class WorldScene extends Phaser.Scene {
  private ctrl!: GameController;
  private dyn!: Phaser.GameObjects.Graphics;
  private pinsText: Phaser.GameObjects.Text[] = [];
  private nodes: Record<string, { x: number; y: number }> = {};

  constructor() {
    super('world');
  }

  init(data: { ctrl: GameController }): void {
    this.ctrl = data.ctrl;
  }


  private landAt(nx: number, ny: number): 'deep' | 'shallow' | 'land' | 'sand' | 'lake' | 'mount' | 'forest' | 'field' {
    const jitter = (noise(Math.floor(nx * GW), Math.floor(ny * GH)) - 0.5) * 0.035;
    const x = nx + jitter;
    const y = ny + jitter * 0.7;
    const land = (LAND.some((e) => inE(x, y, e)) || ISLANDS.some((e) => inE(x, y, e))) && !WATER_CUTS.some((e) => inE(x, y, e));
    if (land) {
      if (inE(x, y, LAKE)) return 'lake';
      if (inE(x, y, MOUNTAINS)) return 'mount';
      if (inE(x, y, FOREST)) return 'forest';
      if (inE(x, y, FIELDS)) return 'field';
      return 'land';
    }
    const near = (d: number) =>
      LAND.some((e) => inE(x, y, [e[0], e[1], e[2] + d, e[3] + d])) || ISLANDS.some((e) => inE(x, y, [e[0], e[1], e[2] + d, e[3] + d]));
    if (near(0.012)) return 'sand';
    if (near(0.045)) return 'shallow';
    return 'deep';
  }

  create(): void {
    const c = this.ctrl.content;
    this.cameras.main.setBackgroundColor('#10263a');
    const g = this.add.graphics();
    const COLORS = { deep: 0x163754, shallow: 0x23577a, sand: 0xd9c38a, land: 0x5b8a45, lake: 0x3c7aa0, mount: 0x8a8f99, forest: 0x2f5f33, field: 0xc9b14e };
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const kind = this.landAt((gx + 0.5) / GW, (gy + 0.5) / GH);
        let col = COLORS[kind];
        if (kind === 'mount' && noise(gx, gy) > 0.7) col = 0xe8ecf2;
        if (kind === 'land' && noise(gx + 3, gy) > 0.85) col = 0x6a9a4f;
        if (kind === 'deep' && noise(gx, gy + 7) > 0.97) col = 0x2b6a90;
        if (kind === 'field' && gy % 2 === 0) col = 0xb89a3a;
        g.fillStyle(col, 1).fillRect(gx * CELL, gy * CELL, CELL, CELL);
      }
    }
    // Compass and title.
    this.add.text(VIEW_W - 8, 8, 'N', { fontFamily: 'Kenney Pixel', fontSize: '12px', color: '#e8e4d8' }).setOrigin(1, 0);
    g.fillStyle(0xe8e4d8, 1).fillTriangle(VIEW_W - 12, 24, VIEW_W - 8, 24, VIEW_W - 10, 18);
    this.add.text(8, VIEW_H - 14, 'THE PINTLAND ISLES', { fontFamily: 'Kenney Pixel', fontSize: '10px', color: '#9fb3c8' });
    this.add.text(0.24 * VIEW_W, 0.3 * VIEW_H, 'Breakback Mts.', { fontFamily: 'Kenney Pixel', fontSize: '8px', color: '#dfe3ea' }).setOrigin(0.5);
    this.add.text(0.33 * VIEW_W, 0.65 * VIEW_H, 'Whiskey Shallows', { fontFamily: 'Kenney Pixel', fontSize: '8px', color: '#bfe0f0' }).setOrigin(0.5);
    this.add.text(0.7 * VIEW_W, 0.53 * VIEW_H, 'Gulf of Aleforge', { fontFamily: 'Kenney Pixel', fontSize: '8px', color: '#8fb8d0' }).setOrigin(0.5);

    for (const city of c.cities) this.nodes[city.id] = { x: city.map.x * VIEW_W, y: city.map.y * VIEW_H };
    this.nodes.cumstead = { x: CUMSTEAD.x * VIEW_W, y: CUMSTEAD.y * VIEW_H };

    // Routes (static, dashed).
    const rg = this.add.graphics();
    for (const [a, b] of ROUTES) {
      const A = this.nodes[a]!;
      const B = this.nodes[b]!;
      const len = Math.hypot(B.x - A.x, B.y - A.y);
      for (let d = 0; d < len; d += 6) {
        const t0 = d / len;
        const t1 = Math.min(1, (d + 3) / len);
        rg.lineStyle(1, 0xe8e4d8, 0.35).lineBetween(A.x + (B.x - A.x) * t0, A.y + (B.y - A.y) * t0, A.x + (B.x - A.x) * t1, A.y + (B.y - A.y) * t1);
      }
    }
    this.drawCities();
    this.dyn = this.add.graphics().setDepth(500);
    for (let i = 0; i < 5; i++) this.pinsText.push(this.add.text(0, 0, '', { fontFamily: 'Kenney Pixel', fontSize: '9px', color: '#ffffff', stroke: '#0b1622', strokeThickness: 3 }).setOrigin(0.5).setDepth(600));

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const hit = this.hitNode(p.worldX, p.worldY);
      if (hit && hit !== 'cumstead') {
        selectedCity.value = hit as CityId;
        drawer.value = 'city';
        sound('map');
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const hit = this.hitNode(p.worldX, p.worldY);
      if (!hit) hover.value = null;
      else if (hit === 'cumstead') hover.value = "John Cum's Cumstead · grain supplier";
      else hover.value = `${cityOf(this.ctrl.content, hit as CityId).name} · click for the city`;
    });
  }

  private hitNode(x: number, y: number): string | null {
    for (const [id, n] of Object.entries(this.nodes)) if (Math.hypot(n.x - x, n.y - y) < 22) return id;
    return null;
  }

  private sprite(name: SpriteName, x: number, y: number, tint?: number): Phaser.GameObjects.Image {
    const r = SPRITES[name];
    const im = this.add.image(x, y, SHEETS[r.sheet].key, r.frame).setOrigin(0.5, 1);
    if (tint !== undefined) im.setTint(tint);
    return im;
  }

  /** City vignettes in each city's art direction (docs/PLAN.md §2.11). */
  private drawCities(): void {
    const g = this.add.graphics().setDepth(50);
    const P = this.nodes.providence!;
    // Providence: grey stone, slate roofs, a tall spire with the clock-heart.
    for (const [dx, dy] of [[-14, 2], [0, 4], [14, 2], [-7, -6], [7, -6]] as const) {
      this.sprite('wallStoneTown', P.x + dx, P.y + dy + 8, 0xdfe3ec).setDepth(40 + dy);
      this.sprite('roofGrey', P.x + dx, P.y + dy - 4, 0x8d99ae).setDepth(41 + dy);
    }
    g.fillStyle(0x8d99ae, 1).fillRect(P.x - 2, P.y - 30, 5, 22);
    g.fillStyle(0x5c677d, 1).fillTriangle(P.x - 4, P.y - 30, P.x + 5, P.y - 30, P.x + 0.5, P.y - 40);
    g.fillStyle(0xd4a72c, 1).fillCircle(P.x + 0.5, P.y - 24, 2);

    // Shanty Town: a chaotic stack of crashed hulls with bright flags.
    const S = this.nodes.shanty!;
    const flags = PALETTES.shanty!.highlights.map((h) => parseInt(h.slice(1), 16));
    const hulls: Array<[number, number, number]> = [[-16, 6, 22], [2, 8, 20], [-8, -2, 18], [10, -4, 16], [-2, -12, 14]];
    hulls.forEach(([dx, dy, wdt], i) => {
      g.fillStyle(i % 2 ? 0x8a5a3b : 0x5e3d28, 1).fillRoundedRect(S.x + dx - wdt / 2, S.y + dy - 5, wdt, 7, { tl: 1, tr: 1, bl: 4, br: 4 });
      g.fillStyle(0x3a2412, 1).fillRect(S.x + dx - wdt / 2, S.y + dy - 5, wdt, 1);
      g.fillStyle(0x3a2412, 1).fillRect(S.x + dx, S.y + dy - 14, 1, 9);
      g.fillStyle(flags[i % flags.length]!, 1).fillTriangle(S.x + dx + 1, S.y + dy - 14, S.x + dx + 7, S.y + dy - 12, S.x + dx + 1, S.y + dy - 10);
    });

    // Roto Kaiishi: stalls stacked on stilts over open water, black, grey and red.
    const R = this.nodes.roto!;
    g.lineStyle(1, 0x2b2b2e, 1);
    for (let i = -18; i <= 18; i += 6) g.lineBetween(R.x + i, R.y + 4, R.x + i, R.y + 12);
    g.fillStyle(0x1c1c1f, 1).fillRect(R.x - 22, R.y + 2, 44, 3);
    const stalls: Array<[number, number, number]> = [[-16, 0, 10], [-5, 0, 10], [6, 0, 10], [-11, -9, 10], [0, -9, 10], [-5, -18, 9], [11, -9, 8]];
    stalls.forEach(([dx, dy, wdt], i) => {
      g.fillStyle(i % 2 ? 0x2b2b2e : 0x4a4a4f, 1).fillRect(R.x + dx, R.y + dy - 7, wdt, 8);
      g.fillStyle(i % 3 === 0 ? 0x7a0c14 : 0xc1121f, 1).fillRect(R.x + dx - 1, R.y + dy - 9, wdt + 2, 3);
      g.fillStyle(0xffb3a0, 0.8).fillRect(R.x + dx + 3, R.y + dy - 4, 2, 2);
    });

    // Aleforge: whimsical houses with differently coloured, oddly shaped roofs.
    const A = this.nodes.aleforge!;
    const roofs = PALETTES.aleforge!.highlights.map((h) => parseInt(h.slice(1), 16));
    const houses: Array<[number, number]> = [[-18, 4], [-6, 8], [6, 3], [18, 7], [-12, -8], [2, -10], [14, -7], [26, -2]];
    houses.forEach(([dx, dy], i) => {
      const x = A.x + dx;
      const y = A.y + dy;
      g.fillStyle(0xe9d3a8, 1).fillRect(x - 5, y - 6, 10, 8);
      g.fillStyle(0x6b4428, 1).fillRect(x - 1, y - 2, 3, 4);
      const col = roofs[i % roofs.length]!;
      g.fillStyle(col, 1);
      switch (i % 4) {
        case 0: g.fillTriangle(x - 7, y - 6, x + 7, y - 6, x, y - 15); break; // peak
        case 1: g.fillCircle(x, y - 8, 6); g.fillStyle(0xe9d3a8, 1).fillRect(x - 5, y - 6, 10, 2); break; // dome
        case 2: g.fillTriangle(x - 6, y - 6, x + 8, y - 6, x + 6, y - 17); break; // crooked
        default: g.fillRect(x - 6, y - 10, 12, 4); g.fillTriangle(x - 3, y - 10, x + 3, y - 10, x, y - 18); // tower
      }
    });
    g.fillStyle(0xf2c14e, 1).fillCircle(A.x + 2, A.y + 14, 2); // the ale fountain

    // John Cum's Cumstead: fields and a farmhouse.
    const C = this.nodes.cumstead!;
    this.sprite('wallWoodTown', C.x, C.y + 6).setDepth(40);
    this.sprite('roofRed', C.x, C.y - 6, 0xb5651d).setDepth(41);

    const label = (id: string, text: string, dy: number) => {
      const n = this.nodes[id]!;
      this.add.text(n.x, n.y + dy, text, { fontFamily: 'Kenney Pixel', fontSize: '11px', color: '#fff4d6', stroke: '#0b1622', strokeThickness: 4 }).setOrigin(0.5).setDepth(300);
    };
    label('providence', 'Providence', 12);
    label('shanty', 'Shanty Town', 16);
    label('roto', 'Roto Kaiishi', 18);
    label('aleforge', 'Aleforge', 22);
    label('cumstead', "John Cum's Cumstead", 14);
  }

  override update(time: number): void {
    const w = this.ctrl.world;
    const g = this.dyn;
    g.clear();
    const blink = Math.floor(time / 300) % 2 === 0;
    const sel = selectedCity.value;

    // Tavern pins under each city: gold = yours, red = arch-rival, grey = others.
    CITY_IDS.forEach((city, ci) => {
      const n = this.nodes[city]!;
      const ts = Object.values(w.taverns).filter((t) => t.city === city && t.status !== 'closed');
      const px0 = n.x - (ts.length * 7) / 2;
      ts.forEach((t, i) => {
        const co = w.companies[t.companyId]!;
        const col = co.isPlayer ? 0xffd23f : co.rival?.isArch ? 0xe63946 : 0xb0b8c4;
        const x = px0 + i * 7;
        const y = n.y + (city === 'aleforge' ? 30 : city === 'roto' ? 27 : 23);
        if (t.status === 'building' && !blink) return;
        g.fillStyle(0x0b1622, 1).fillRect(x - 1, y - 1, 7, 7);
        g.fillStyle(col, 1).fillRect(x, y, 5, 5);
        if (co.isPlayer && t.id === w.focus.tavernId) g.lineStyle(1, 0xffffff, 1).strokeRect(x - 2, y - 2, 9, 9);
      });
      if (sel === city) g.lineStyle(2, 0xffe066, blink ? 1 : 0.5).strokeCircle(n.x, n.y - 4, 26);
      void ci;
    });

    // Shipments sailing along their routes.
    for (const sh of w.shipments) {
      const from = w.taverns[sh.fromId];
      const to = w.taverns[sh.toId];
      if (!from || !to) continue;
      const A = this.nodes[from.city]!;
      const B = this.nodes[to.city]!;
      const k = Math.min(1, (w.tick - sh.departTick) / Math.max(1, sh.arriveTick - sh.departTick));
      const x = A.x + (B.x - A.x) * k;
      const y = A.y + (B.y - A.y) * k;
      g.fillStyle(0x3a2412, 1).fillRect(x - 3, y - 1, 7, 3);
      g.fillStyle(0xf8f0dc, 1).fillTriangle(x, y - 6, x, y - 1, x + 4, y - 2);
    }
  }
}
