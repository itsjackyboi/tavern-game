import Phaser from 'phaser';
import type { GameController } from '../app/controller.ts';
import { SHEETS, SPRITES, TILE, type SpriteName, type SpriteRef } from '../art/atlas.ts';
import { lookFor, staffLook, type Look } from '../art/characters.ts';
import { THEMES, drinkHex } from '../art/themes.ts';
import {
  BAR_ROW, BAR_X0, BAR_X1, CELLAR, DOOR, GRID_H, GRID_W, STAGE, TILL, dist, pourPos, seatPos,
} from '../sim/floor/layout.ts';
import { drinkOf } from '../sim/lookup.ts';
import { calNow } from '../sim/time.ts';
import type { FloorState, Patron, Worker } from '../sim/types.ts';
import { hover, sound, tutorialTarget } from '../ui/bus.ts';

// The zoomed-in tavern floor. Reads the sim every frame; all input becomes
// Commands dispatched to the controller.

export const VIEW_W = GRID_W * TILE;
export const VIEW_H = GRID_H * TILE;

interface Doll {
  box: Phaser.GameObjects.Container;
  parts: Phaser.GameObjects.Image[];
  key: string;
}

const px = (tiles: number) => tiles * TILE;

export class FloorScene extends Phaser.Scene {
  private ctrl!: GameController;
  private staticKey = '';
  private staticLayer!: Phaser.GameObjects.Container;
  private dolls = new Map<string, Doll>();
  private gfx!: Phaser.GameObjects.Graphics;
  private tint!: Phaser.GameObjects.Rectangle;
  private labelPool: Phaser.GameObjects.Text[] = [];
  private labelIdx = 0;
  private lastFxTick = 0;
  private dragging: number | null = null;
  private selected: number | null = null;
  private dragGhost!: Phaser.GameObjects.Container;
  private banner!: Phaser.GameObjects.Text;

  constructor() {
    super('floor');
  }

  init(data: { ctrl: GameController }): void {
    this.ctrl = data.ctrl;
  }


  create(): void {
    this.staticLayer = this.add.container(0, 0);
    this.gfx = this.add.graphics().setDepth(800);
    this.tint = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 0).setOrigin(0, 0).setDepth(700);
    this.dragGhost = this.add.container(0, 0).setDepth(950).setVisible(false);
    this.banner = this.add.text(VIEW_W / 2, 36, '', { fontFamily: 'Kenney Pixel', fontSize: '16px', color: '#ffe9a8', stroke: '#1a0f08', strokeThickness: 4 })
      .setOrigin(0.5).setDepth(960);
    this.lastFxTick = this.ctrl.world.tick;
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
  }

  // ---------------------------------------------------------------- helpers

  private img(ref: SpriteRef, x: number, y: number): Phaser.GameObjects.Image {
    return this.add.image(x, y, SHEETS[ref.sheet].key, ref.frame).setOrigin(0, 0);
  }

  private tile(name: SpriteName, col: number, row: number, tint?: number): Phaser.GameObjects.Image {
    const im = this.img(SPRITES[name], px(col), px(row));
    if (tint !== undefined) im.setTint(tint);
    this.staticLayer.add(im);
    return im;
  }

  private buildStatic(f: FloorState): void {
    const w = this.ctrl.world;
    const t = w.taverns[f.tavernId]!;
    const th = THEMES[t.city];
    const key = `${t.id}|${f.tables.length}|${f.taps.map((x) => x.drinkId).join(',')}|${t.decor}`;
    if (key === this.staticKey) return;
    this.staticKey = key;
    this.staticLayer.removeAll(true);
    this.cameras.main.setBackgroundColor(th.bg);
    for (let r = 0; r < GRID_H; r++) {
      for (let c = 0; c < GRID_W; c++) {
        if (r < 2) this.tile(th.wall, c, r, th.wallTint);
        else this.tile((c * 7 + r * 3) % 11 === 0 ? th.floor[1] : th.floor[0], c, r, th.floorTint);
      }
    }
    if (th.planks) {
      const g = this.add.graphics();
      g.lineStyle(1, 0x000000, 0.14);
      for (let y = px(2), row = 0; y < VIEW_H; y += 8, row++) {
        g.lineBetween(0, y, VIEW_W, y);
        for (let x = (row % 3) * 16 + 6; x < VIEW_W; x += 48) g.lineBetween(x, y, x, y + 8);
      }
      this.staticLayer.add(g);
    }
    if (th.flags) {
      const g = this.add.graphics();
      g.lineStyle(1, 0x2a2f3a, 0.35);
      for (let y = px(2), row = 0; y < VIEW_H; y += 12, row++) {
        g.lineBetween(0, y, VIEW_W, y);
        for (let x = (row % 2) * 10; x < VIEW_W; x += 20) g.lineBetween(x, y, x, y + 12);
      }
      this.staticLayer.add(g);
    }
    // A rug under each cluster of tables for some warmth.
    const rugs = this.add.graphics();
    for (const tb of f.tables) rugs.fillStyle(th.accents[(tb.x + tb.y) % th.accents.length]!, 0.18).fillRect(px(tb.x - 1) - 2, px(tb.y) - 2, px(3) + 4, px(1) + 4);
    this.staticLayer.add(rugs);
    // Backdrop furniture along the back wall.
    for (let i = 0; i < th.backdrop.length; i++) this.tile(th.backdrop[i]!, 1 + i * 2, 1);
    for (let i = 0; i < 3; i++) this.tile(th.backdrop[(i + 2) % th.backdrop.length]!, 20 + i * 2, 1);
    // City accents: Aleforge bunting, Shanty flags, Providence bell, Roto lanterns.
    const acc = this.add.graphics();
    if (t.city === 'shanty' || t.city === 'aleforge') {
      for (let x = 0; x < VIEW_W; x += 12) {
        const col = th.accents[(x / 12) % th.accents.length]!;
        acc.fillStyle(col, 1).fillTriangle(x, 2, x + 10, 2, x + 5, t.city === 'shanty' ? 12 : 9);
      }
      acc.lineStyle(1, 0x3a2412, 1).lineBetween(0, 2, VIEW_W, 2);
    }
    if (t.city === 'roto') {
      for (let x = 24; x < VIEW_W; x += 56) {
        acc.fillStyle(0x7a0c14, 1).fillRect(x, 6, 10, 12);
        acc.fillStyle(0xc1121f, 1).fillRect(x + 1, 7, 8, 10);
        acc.fillStyle(0xffb3a0, 0.8).fillRect(x + 3, 10, 4, 4);
      }
      acc.fillStyle(0xc1121f, 0.35).fillRect(0, px(BAR_ROW + 2), VIEW_W, 3);
    }
    if (t.city === 'providence') {
      acc.fillStyle(0xd4a72c, 1).fillCircle(px(15), 12, 7);
      acc.fillStyle(0x7a5a10, 1).fillRect(px(15) - 1, 3, 2, 4);
      for (let x = 20; x < VIEW_W; x += 64) acc.fillStyle(0xe8e4d8, 0.35).fillRect(x, px(2) + 2, 24, 2);
    }
    this.staticLayer.add(acc);
    // Bar counter and taps.
    for (let c = BAR_X0; c <= BAR_X1; c++) this.tile('table', c, BAR_ROW, th.furnitureTint);
    for (let c = 2; c <= 12; c += 2) this.tile('keg', c, 2);
    this.tile('hatch', CELLAR.x, CELLAR.y);
    this.tile('chest', TILL.x, TILL.y - 1, th.furnitureTint);
    // Stage rug.
    const rug = this.add.graphics();
    rug.fillStyle(th.accents[0]!, 0.5).fillRect(px(STAGE.x - 1), px(STAGE.y), px(3), px(1) + 4);
    this.staticLayer.add(rug);
    // Tables and stools.
    for (const tb of f.tables) {
      this.tile('table', tb.x, tb.y, th.furnitureTint);
      this.tile('stool', tb.x - 1, tb.y, th.furnitureTint);
      this.tile('stool', tb.x + 1, tb.y, th.furnitureTint);
    }
    this.tile(t.city === 'providence' ? 'doorStone' : 'doorWood', DOOR.x, DOOR.y);
  }

  private dollKey(look: Look): string {
    return `${look.body.frame}:${look.shirt.frame}:${look.hair.frame}:${look.hat?.frame ?? '-'}`;
  }

  private doll(id: string, look: Look): Doll {
    let d = this.dolls.get(id);
    const key = this.dollKey(look);
    if (d && d.key === key) return d;
    if (d) d.box.destroy(true);
    const parts = [look.body, look.shirt, look.hair, ...(look.hat ? [look.hat] : [])].map((r) => this.img(r, 0, 0));
    const box = this.add.container(0, 0, parts);
    d = { box, parts, key };
    this.dolls.set(id, d);
    return d;
  }

  private place(d: Doll, x: number, y: number, snap = false): void {
    const tx = px(x);
    const ty = px(y) - 5;
    if (snap || Math.abs(d.box.x - tx) > 40 || Math.abs(d.box.y - ty) > 40) d.box.setPosition(tx, ty);
    else d.box.setPosition(d.box.x + (tx - d.box.x) * 0.45, d.box.y + (ty - d.box.y) * 0.45);
    d.box.setDepth(100 + d.box.y);
  }

  // ---------------------------------------------------------------- frame

  override update(time: number): void {
    const w = this.ctrl.world;
    const f = w.floor;
    if (!f) return;
    this.buildStatic(f);
    const t = w.taverns[f.tavernId]!;
    const c = this.ctrl.content;
    const cal = calNow(w, c.time);
    const g = this.gfx;
    g.clear();
    this.labelIdx = 0;
    const seen = new Set<string>();
    const blink = Math.floor(time / 250) % 2 === 0;

    // Taps: fill bars above each tap.
    f.taps.forEach((tap, i) => {
      const lvl = t.tapLevels[tap.drinkId] ?? 0;
      const frac = lvl / c.economy.kegServings;
      const x = px(tap.x) + 3;
      const y = px(BAR_ROW) - 3;
      g.fillStyle(0x1a0f08, 0.85).fillRect(x - 1, y - 12, 12, 12);
      g.fillStyle(drinkHex(c, tap.drinkId), 1).fillRect(x, y - 11 + 10 * (1 - frac), 10, 10 * frac);
      if (lvl <= 0 && blink) g.lineStyle(2, 0xff4040, 1).strokeRect(x - 2, y - 13, 14, 14);
      const cellar = t.cellar[tap.drinkId] ?? 0;
      this.label(`${cellar}`, x + 5, y + 2, cellar ? '#d9c79c' : '#ff7070', 8);
      if (tap.claimedBy) g.fillStyle(0xffe066, 1).fillCircle(x + 12, y - 12, 2);
    });

    // Dirty tables.
    for (const tb of f.tables) {
      if (!tb.dirty) continue;
      g.fillStyle(0xd9c79c, 1).fillRect(px(tb.x) + 4, px(tb.y) + 2, 4, 5);
      g.fillStyle(0xf2e6c8, 1).fillRect(px(tb.x) + 9, px(tb.y) + 4, 3, 3);
      if (blink) g.fillStyle(0xffffff, 0.8).fillRect(px(tb.x) + 12, px(tb.y) + 1, 2, 2);
    }

    // Patrons.
    for (const p of f.patrons) {
      const id = `p${p.id}`;
      seen.add(id);
      const d = this.doll(id, lookFor(p.look, p.seg, p.vip));
      if (this.dragging === p.id) {
        d.box.setVisible(false);
        continue;
      }
      d.box.setVisible(true);
      this.place(d, p.x, p.y, !d.box.getData('placed'));
      d.box.setData('placed', true);
      d.box.setAlpha(p.state === 'leaving' ? 0.6 : 1);
      d.box.setAngle(p.state === 'brawling' ? (blink ? -8 : 8) : 0);
      this.patronOverlay(p, d, blink);
    }

    // Workers.
    for (const wk of f.workers) {
      const id = `w${wk.id}`;
      seen.add(id);
      const look = staffLook(wk.id * 7919, wk.role === 'owner' ? 'owner' : wk.role);
      const d = this.doll(id, look);
      const ownerAway = wk.kind === 'owner' && w.focus.view !== 'floor';
      d.box.setVisible(!ownerAway);
      this.place(d, wk.x, wk.y, !d.box.getData('placed'));
      d.box.setData('placed', true);
      this.workerOverlay(wk, d);
    }

    for (const [id, d] of this.dolls) {
      if (!seen.has(id)) {
        d.box.destroy(true);
        this.dolls.delete(id);
      }
    }

    // Incidents: countdown rings.
    for (const inc of f.incidents) {
      const left = Math.max(0, inc.deadline - w.tick) / (c.floor.brawlWindowTicks * w.meta.timerScale);
      const cx = px(inc.x) + 8;
      const cy = px(inc.y) - 10;
      g.lineStyle(3, 0x1a0f08, 0.9).strokeCircle(cx, cy, 9);
      g.lineStyle(2, left < 0.35 ? 0xff3030 : 0xffa030, 1);
      g.beginPath();
      g.arc(cx, cy, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false);
      g.strokePath();
      this.label('!', cx, cy - 1, blink ? '#ff4040' : '#ffe066', 14);
    }

    // Owner's queued targets.
    const owner = f.workers.find((x) => x.kind === 'owner');
    if (owner) {
      const tasks = [...(owner.task ? [owner.task] : []), ...owner.queue];
      tasks.forEach((task, i) => {
        const pos = this.taskPos(f, task);
        if (!pos) return;
        g.fillStyle(0xffe066, 1).fillCircle(px(pos.x) + 14, px(pos.y) - 8, 5);
        this.label(`${i + 1}`, px(pos.x) + 14, px(pos.y) - 8.5, '#1a0f08', 9);
      });
    }

    // While placing a patron, show which tables can take them.
    if (this.dragging !== null || this.selected !== null) {
      for (const tb of f.tables) {
        const ok = !tb.dirty && (!tb.seats[0] || !tb.seats[1]);
        g.lineStyle(2, ok ? 0x6fe36f : 0xe0524a, ok ? 0.9 : 0.45).strokeRect(px(tb.x - 1) - 1, px(tb.y) - 2, px(3) + 2, px(1) + 4);
      }
    }

    // Tutorial pointer: a bouncing arrow over whatever the current step is about.
    const target = tutorialTarget.value;
    if (target && w.focus.view === 'floor') {
      const bob = Math.sin(time / 160) * 3;
      const ax = px(target.x) + 8;
      const ay = px(target.y) - 16 + bob;
      g.fillStyle(0x1a0f08, 1).fillTriangle(ax - 7, ay - 9, ax + 7, ay - 9, ax, ay + 1);
      g.fillStyle(0xffe066, 1).fillTriangle(ax - 5, ay - 8, ax + 5, ay - 8, ax, ay - 1);
    }

    // Selection ring.
    if (this.selected !== null) {
      const p = f.patrons.find((x) => x.id === this.selected);
      if (p && p.state === 'waiting') g.lineStyle(1, 0xffe066, 1).strokeCircle(px(p.x) + 8, px(p.y) + 3, 9);
      else this.selected = null;
    }

    // Lighting and banners.
    const th = THEMES[t.city];
    let alpha = 0;
    if (cal.phase === 'night') alpha = 0.28;
    if (cal.phase === 'lastCall') alpha = 0.38;
    if (cal.phase === 'holiday') alpha = 0.18;
    this.tint.setFillStyle(cal.phase === 'holiday' ? 0x5a2a00 : th.night, alpha);
    let banner = '';
    if (w.tick < t.closedUntil) banner = 'DOORS SHUT';
    else if (f.closingSince !== undefined) banner = `CLOSING UP - ${f.patrons.filter((p) => p.state !== 'leaving' && p.state !== 'gone').length} FINISHING`;
    else if (cal.phase === 'lastCall') banner = f.lastCallRung ? 'DOORS CLOSED - LAST ORDERS' : 'LAST CALL - RING THE BELL (B)';
    else if (cal.segment === 'holidayKeg') banner = 'HOLIDAY KEG';
    else if (w.focus.view !== 'floor') banner = '';
    this.banner.setText(banner);
    this.banner.setVisible(!!banner && (banner !== 'LAST CALL - RING THE BELL (B)' || blink));

    for (let i = this.labelIdx; i < this.labelPool.length; i++) this.labelPool[i]!.setVisible(false);
    this.consumeFx();
  }

  private taskPos(f: FloorState, task: NonNullable<Worker['task']>): { x: number; y: number } | null {
    switch (task.kind) {
      case 'serve':
      case 'thief':
      case 'greet':
      case 'seat': {
        const p = f.patrons.find((x) => x.id === task.patronId);
        return p ? { x: p.x, y: p.y } : null;
      }
      case 'clear': {
        const tb = f.tables.find((x) => x.id === task.tableId);
        return tb ? { x: tb.x, y: tb.y } : null;
      }
      case 'brawl': {
        const inc = f.incidents.find((x) => x.id === task.incidentId);
        return inc ? { x: inc.x, y: inc.y } : null;
      }
      case 'restock': {
        const i = f.taps.findIndex((x) => x.drinkId === task.drinkId);
        return i >= 0 ? pourPos(i) : null;
      }
    }
  }

  private label(text: string, x: number, y: number, color: string, size: number): void {
    let tx = this.labelPool[this.labelIdx];
    if (!tx) {
      tx = this.add.text(0, 0, '', { fontFamily: 'Kenney Pixel', fontSize: '10px', resolution: 2 }).setOrigin(0.5).setDepth(900);
      this.labelPool.push(tx);
    }
    this.labelIdx++;
    if (tx.text !== text) tx.setText(text);
    const fs = `${size}px`;
    if (tx.style.fontSize !== fs) tx.setFontSize(fs);
    if (tx.style.color !== color) tx.setColor(color);
    tx.setPosition(x, y).setVisible(true);
  }

  private bar(x: number, y: number, frac: number): void {
    const g = this.gfx;
    const col = frac > 0.5 ? 0x6fd36f : frac > 0.25 ? 0xf2c14e : 0xff5050;
    g.fillStyle(0x1a0f08, 0.9).fillRect(x, y, 14, 3);
    g.fillStyle(col, 1).fillRect(x + 1, y + 1, 12 * Math.max(0, Math.min(1, frac)), 1);
  }

  private patronOverlay(p: Patron, d: Doll, blink: boolean): void {
    const g = this.gfx;
    const x = d.box.x;
    const y = d.box.y;
    const c = this.ctrl.content;
    if (p.state === 'waiting') {
      this.bar(x + 1, y - 4, p.patience / p.patienceMax);
      if (p.vip && !p.greeted) this.label('★', x + 8, y - 9, blink ? '#ffd23f' : '#fff4b0', 12);
    } else if (p.state === 'ordered' && p.drinkId) {
      g.fillStyle(0xf8f0dc, 1).fillRoundedRect(x + 3, y - 13, 11, 10, 2);
      g.fillTriangle(x + 6, y - 3, x + 9, y - 3, x + 6, y);
      g.fillStyle(drinkHex(c, p.drinkId), 1).fillRect(x + 5, y - 11, 7, 6);
      if (p.claimedBy) g.lineStyle(1, 0xffe066, 1).strokeRoundedRect(x + 2, y - 14, 13, 12, 2);
      this.bar(x + 1, y - 17, p.patience / p.patienceMax);
    } else if (p.state === 'sneaking') {
      this.label('$', x + 8, y - 6, blink ? '#ff4040' : '#ffe066', 14);
    }
    if (p.vip && p.state !== 'waiting') this.label('★', x + 13, y - 2, '#ffd23f', 8);
    if (p.regular && (p.state === 'drinking' || p.state === 'ordered')) g.fillStyle(0x9fd3e6, 1).fillCircle(x + 2, y + 2, 1.5);
  }

  private workerOverlay(wk: Worker, d: Doll): void {
    const g = this.gfx;
    if (wk.kind === 'owner') {
      g.fillStyle(0xffd23f, 1).fillTriangle(d.box.x + 5, d.box.y - 6, d.box.x + 11, d.box.y - 6, d.box.x + 8, d.box.y - 2);
    }
    if (wk.carrying) {
      const col = wk.carrying === 'keg' ? 0x8a5a3b : drinkHex(this.ctrl.content, wk.carrying);
      g.fillStyle(col, 1).fillRect(d.box.x + 11, d.box.y + 6, wk.carrying === 'keg' ? 6 : 4, wk.carrying === 'keg' ? 7 : 5);
    }
  }

  private consumeFx(): void {
    const w = this.ctrl.world;
    for (const e of w.fx) {
      if (e.tick <= this.lastFxTick) continue;
      sound(e.kind);
      let text = '';
      let color = '#ffe066';
      if (e.kind === 'coin' || e.kind === 'tip') text = `+${e.value}`;
      if (e.kind === 'steal') { text = `-${e.value}`; color = '#ff5050'; }
      if (e.kind === 'thud' && e.value) { text = `-${e.value}`; color = '#ff5050'; }
      if (e.kind === 'caught') { text = 'Caught!'; color = '#9fe89f'; }
      if (e.kind === 'walkout') { text = '✗'; color = '#ff8080'; }
      if (e.kind === 'greet') { text = '★'; color = '#ffd23f'; }
      if (text) this.float(text, px(e.x) + 8, px(e.y) - 6, color);
      if (e.kind === 'brawl' || e.kind === 'thud') this.cameras.main.shake(120, 0.004);
    }
    this.lastFxTick = w.tick;
  }

  private float(text: string, x: number, y: number, color: string): void {
    const t = this.add.text(x, y, text, { fontFamily: 'Kenney Pixel', fontSize: '10px', color, stroke: '#1a0f08', strokeThickness: 3, resolution: 2 })
      .setOrigin(0.5).setDepth(990);
    this.tweens.add({ targets: t, y: y - 16, alpha: 0, duration: 900, ease: 'Sine.out', onComplete: () => t.destroy() });
  }

  // ---------------------------------------------------------------- input

  private tileAt(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    return { x: pointer.worldX / TILE - 0.5, y: pointer.worldY / TILE - 0.3 };
  }

  private hit(pointer: Phaser.Input.Pointer) {
    const f = this.ctrl.world.floor;
    if (!f) return null;
    const at = this.tileAt(pointer);
    const near = <T extends { x: number; y: number }>(items: T[], r: number) => {
      let best: T | null = null;
      let bd = r;
      for (const it of items) {
        const dd = dist(it, at);
        if (dd < bd) { bd = dd; best = it; }
      }
      return best;
    };
    const inc = near(f.incidents.map((i) => ({ ...i, y: i.y - 0.4 })), 1.4);
    if (inc) return { kind: 'incident' as const, id: inc.id };
    const thief = near(f.patrons.filter((p) => p.state === 'sneaking'), 1.1);
    if (thief) return { kind: 'thief' as const, id: thief.id };
    const waiting = near(f.patrons.filter((p) => p.state === 'waiting'), 0.9);
    if (waiting) return { kind: 'waiting' as const, id: waiting.id };
    const ordered = near(f.patrons.filter((p) => p.state === 'ordered'), 1.0);
    if (ordered) return { kind: 'ordered' as const, id: ordered.id };
    const tapIdx = f.taps.findIndex((tp) => Math.abs(tp.x - at.x) < 0.9 && at.y > BAR_ROW - 2.2 && at.y < BAR_ROW + 0.6);
    if (tapIdx >= 0) return { kind: 'tap' as const, drinkId: f.taps[tapIdx]!.drinkId };
    const table = near(f.tables.flatMap((tb) => [{ ...tb }, { ...seatPos(tb, 0), id: tb.id, dirty: tb.dirty }, { ...seatPos(tb, 1), id: tb.id, dirty: tb.dirty }]) as Array<{ x: number; y: number; id: number; dirty: boolean }>, 1.1);
    if (table) return { kind: 'table' as const, id: table.id, dirty: table.dirty };
    return null;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.rightButtonDown()) {
      this.ctrl.dispatch({ type: 'cancelQueue' });
      this.selected = null;
      return;
    }
    const h = this.hit(pointer);
    if (!h) {
      this.selected = null;
      return;
    }
    const d = this.ctrl.dispatch.bind(this.ctrl);
    switch (h.kind) {
      case 'incident': d({ type: 'breakBrawl', incidentId: h.id }); sound('ui'); break;
      case 'thief': d({ type: 'catchThief', patronId: h.id }); sound('ui'); break;
      case 'waiting': {
        const p = this.ctrl.world.floor!.patrons.find((x) => x.id === h.id)!;
        this.dragging = h.id;
        this.selected = h.id;
        this.dragGhost.removeAll(true);
        const look = lookFor(p.look, p.seg, p.vip);
        for (const r of [look.body, look.shirt, look.hair, ...(look.hat ? [look.hat] : [])]) this.dragGhost.add(this.img(r, 0, 0));
        this.dragGhost.setPosition(pointer.worldX - 8, pointer.worldY - 10).setVisible(true).setAlpha(0.85);
        break;
      }
      case 'ordered': d({ type: 'serve', patronId: h.id }); sound('ui'); break;
      case 'tap': d({ type: 'restock', drinkId: h.drinkId }); sound('ui'); break;
      case 'table':
        if (this.selected !== null && !h.dirty) {
          d({ type: 'seat', patronId: this.selected, tableId: h.id });
          this.selected = null;
        } else if (h.dirty) d({ type: 'clear', tableId: h.id });
        sound('ui');
        break;
    }
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (this.dragging !== null) {
      this.dragGhost.setPosition(pointer.worldX - 8, pointer.worldY - 10);
      return;
    }
    const f = this.ctrl.world.floor;
    const h = this.hit(pointer);
    if (!f || !h) {
      hover.value = null;
      return;
    }
    const c = this.ctrl.content;
    if (h.kind === 'ordered' || h.kind === 'waiting') {
      const p = f.patrons.find((x) => x.id === h.id);
      if (!p) return;
      const seg = c.segments.find((s) => s.id === p.seg)?.name ?? p.seg;
      hover.value = `${p.regular ? `${p.regular} · ` : ''}${seg}${p.vip ? ' ★' : ''}${p.drinkId && p.state === 'ordered' ? ` · wants ${drinkOf(c, p.drinkId).name}` : ''}`;
    } else if (h.kind === 'tap') {
      const t = this.ctrl.world.taverns[f.tavernId]!;
      hover.value = `${drinkOf(c, h.drinkId).name} · tap ${t.tapLevels[h.drinkId] ?? 0}/${c.economy.kegServings} · cellar ${t.cellar[h.drinkId] ?? 0} kegs`;
    } else hover.value = null;
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (this.dragging === null) return;
    const id = this.dragging;
    this.dragging = null;
    this.dragGhost.setVisible(false);
    const f = this.ctrl.world.floor;
    if (!f) return;
    const at = this.tileAt(pointer);
    let best: { id: number; d: number } | null = null;
    for (const tb of f.tables) {
      if (tb.dirty || (tb.seats[0] && tb.seats[1])) continue;
      const dd = Math.min(dist(tb, at), dist(seatPos(tb, 0), at), dist(seatPos(tb, 1), at));
      if (dd < 1.6 && (!best || dd < best.d)) best = { id: tb.id, d: dd };
    }
    if (best) {
      this.ctrl.dispatch({ type: 'seat', patronId: id, tableId: best.id });
      this.selected = null;
      sound('seat');
    }
  }
}
