import { newBrew } from '../ui/bus.ts';
import { spawnPrompt } from '../sim/prompts.ts';
import type { CityId } from '../content/schema.ts';
import type { GameController } from './controller.ts';

// Exposed on window.__game only for ?debug runs (which are unranked) and dev builds.
// Playwright uses these to drive and inspect the game deterministically.

export interface TestHooks {
  step(n: number): void;
  tick(): number;
  calendar(): ReturnType<GameController['calendar']>;
  paused(): string | null;
  pause(): void;
  resume(): void;
  /** Debug only: adds Duckets to the player (e.g. to force a monopoly). */
  grant(duckets: number): void;
  status(): string;
  timerScale(): number;
  view(): 'floor' | 'world';
  prompts(): number;
  /** Debug only: empties the player's purse (to see the money warnings). */
  drain(): void;
  phase(): string;
  /** Debug only: brings in a decision by id. */
  prompt(id: string): void;
  /** Debug only: founds a sister in a town and steps until it opens; returns its id. */
  sister(city: string): string;
  /** Debug only: empties a tavern's taps, cellar and orders, and turns off auto-restock. */
  dry(tavernId: string): void;
  /** Summary of a tavern for assertions. */
  tavern(id: string): { staff: number; cellar: Record<string, number>; orders: number; shipmentsTo: number; supplyLines: number; restock: number; menu: string[] } | null;
  focusId(): string;
  /** Debug only: ends the run as a loss or bankruptcy (to see the end screens). */
  end(kind: 'lost' | 'bankrupt'): void;
  /** Debug only: messes up `n` floor tables. */
  mess(n: number): void;
  /** Debug only: sets morale and fatigue for every staff member at the focused tavern. */
  mood(morale: number, fatigue: number): void;
  /** Debug only: sets cash (can be negative). */
  cash(n: number): void;
  /** Debug only: unlocks a recipe as if just brewed and returns its id. */
  discover(): string | null;
  floor(): {
    patrons: Array<{ id: number; state: string; x: number; y: number }>;
    tables: Array<{ id: number; x: number; y: number; dirty: boolean; free: boolean }>;
  } | null;
}

declare global {
  interface Window {
    __game?: TestHooks;
  }
}

export function installTestHooks(ctrl: GameController): void {
  window.__game = {
    step: (n) => ctrl.step(n),
    tick: () => ctrl.world.tick,
    calendar: () => ctrl.calendar(),
    paused: () => ctrl.paused,
    pause: () => ctrl.pause('manual'),
    resume: () => ctrl.resume(),
    grant: (n) => {
      const me = ctrl.world.companies[ctrl.world.playerId];
      if (me) me.cash += n;
    },
    status: () => ctrl.world.run.status,
    timerScale: () => ctrl.world.meta.timerScale,
    view: () => ctrl.world.focus.view,
    prompts: () => ctrl.world.prompts.active.length,
    drain: () => {
      const me = ctrl.world.companies[ctrl.world.playerId];
      if (me) me.cash = 0;
    },
    phase: () => ctrl.calendar().phase,
    prompt: (id) => {
      spawnPrompt(ctrl.world, ctrl.content, id, { tavernId: ctrl.world.focus.tavernId, vars: { rival: 'The Gulf Tapworks' } });
      ctrl.step(1);
    },
    sister: (city) => {
      const w = ctrl.world;
      const me = w.companies[w.playerId]!;
      me.cash += 6000;
      for (const t of Object.values(w.taverns)) if (t.companyId === w.playerId) t.rep = Math.max(t.rep, 60);
      ctrl.dispatch({ type: 'found', city: city as CityId });
      ctrl.step(1340);
      return Object.values(ctrl.world.taverns).find((t) => t.companyId === w.playerId && t.city === city)?.id ?? '';
    },
    dry: (id) => {
      const t = ctrl.world.taverns[id];
      if (!t) return;
      t.autoRestock = false;
      t.orders = [];
      for (const k of Object.keys(t.cellar)) t.cellar[k] = 0;
      for (const k of Object.keys(t.tapLevels)) t.tapLevels[k] = 0;
      ctrl.step(1);
    },
    tavern: (id) => {
      const w = ctrl.world;
      const t = w.taverns[id];
      if (!t) return null;
      return {
        staff: Object.values(w.staff).filter((s) => s.tavernId === id && s.role !== 'manage').length,
        cellar: { ...t.cellar },
        orders: t.orders.reduce((n, o) => n + o.kegs, 0),
        shipmentsTo: w.shipments.filter((s) => s.toId === id).length,
        supplyLines: (w.supplyLines ?? []).filter((l) => l.toId === id).length,
        restock: t.restockTarget,
        menu: t.menu.map((m) => m.drinkId),
      };
    },
    focusId: () => ctrl.world.focus.tavernId,
    end: (kind) => {
      const r = ctrl.world.run;
      r.status = kind;
      r.endTick = ctrl.world.tick;
      r.finalCV = ctrl.world.companies[ctrl.world.playerId]!.cv;
      r.verdictDone = true;
      ctrl.step(1);
    },
    mess: (n) => {
      const f = ctrl.world.floor;
      if (!f) return;
      for (const t of f.tables.slice(0, n)) t.dirty = true;
      ctrl.step(1);
    },
    mood: (morale, fatigue) => {
      for (const s of Object.values(ctrl.world.staff)) {
        if (s.tavernId !== ctrl.world.focus.tavernId) continue;
        s.morale = morale;
        s.fatigue = fatigue;
      }
      ctrl.step(1);
    },
    cash: (n) => {
      ctrl.world.companies[ctrl.world.playerId]!.cash = n;
      ctrl.step(1);
    },
    discover: () => {
      const me = ctrl.world.companies[ctrl.world.playerId]!;
      const d = ctrl.content.drinks.find((x) => !me.unlocked.includes(x.id) && !x.recipe.spiritweed);
      if (!d) return null;
      me.unlocked.push(d.id);
      newBrew.value = { drinkId: d.id, tavernId: ctrl.world.focus.tavernId, at: 0 };
      return d.id;
    },
    floor: () => {
      const f = ctrl.world.floor;
      if (!f) return null;
      return {
        patrons: f.patrons.map((p) => ({ id: p.id, state: p.state, x: p.x, y: p.y })),
        tables: f.tables.map((t) => ({ id: t.id, x: t.x, y: t.y, dirty: t.dirty, free: !t.seats[0] && !t.seats[1] })),
      };
    },
  };
}
