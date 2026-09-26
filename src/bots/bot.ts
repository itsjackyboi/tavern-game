import { CITY_IDS, type Content, type IngredientId } from '../content/schema.ts';
import { effectValue } from '../content/validate.ts';
import { upgradePrice } from '../sim/actions.ts';
import type { Command } from '../sim/commands.ts';
import { companyTaverns } from '../sim/company.ts';
import { cityOf, drinkOf, idx, kegCost, player, playerTaverns, segOf, staffAt } from '../sim/lookup.ts';
import { canFound, foundingCost } from '../sim/network.ts';
import { hireCost } from '../sim/staff.ts';
import { calendarAt } from '../sim/time.ts';
import type { World } from '../sim/types.ts';

// Headless bot players for balance runs and tests. Never bundled into the game.
// The floor bot plays the focused tavern like a human with a reaction delay and
// an actions-per-minute budget; the world bot makes the strategic calls.

export interface BotProfile {
  name: string;
  /** Ticks between floor actions (reaction latency). */
  latency: number;
  /** Plays the floor at all (staffOnly/idle profiles don't). */
  floor: boolean;
  /** Makes strategic decisions. */
  strategy: boolean;
  /** Answers prompts (otherwise they time out to defaults). */
  prompts: boolean;
}

export const PROFILES: Record<string, BotProfile> = {
  expert: { name: 'expert', latency: 5, floor: true, strategy: true, prompts: true },
  skilled: { name: 'skilled', latency: 8, floor: true, strategy: true, prompts: true },
  average: { name: 'average', latency: 12, floor: true, strategy: true, prompts: true },
  novice: { name: 'novice', latency: 18, floor: true, strategy: false, prompts: false },
  staffOnly: { name: 'staffOnly', latency: 999999, floor: false, strategy: true, prompts: true },
  idle: { name: 'idle', latency: 999999, floor: false, strategy: false, prompts: false },
};

export class Bot {
  private nextFloor = 0;
  private nextWorld = 0;
  private triedPairs = 0;
  constructor(readonly profile: BotProfile) {}

  /** Commands to issue this tick. */
  think(w: World, c: Content): Command[] {
    const out: Command[] = [];
    if (this.profile.floor && w.tick >= this.nextFloor) {
      this.nextFloor = w.tick + this.profile.latency;
      const cmd = floorMove(w, c);
      if (cmd) out.push(cmd);
    }
    if (w.tick >= this.nextWorld) {
      this.nextWorld = w.tick + 60;
      if (this.profile.prompts) out.push(...answerPrompts(w, c));
      if (this.profile.strategy) out.push(...this.strategy(w, c));
    }
    return out;
  }

  private strategy(w: World, c: Content): Command[] {
    const out: Command[] = [];
    const me = player(w);
    const mine = playerTaverns(w);
    const cash = () => me.cash;
    let budget = cash() - 60;

    // Menus: fill every tap with the best unlocked drinks for the city.
    for (const t of mine) {
      if (t.status === 'building') continue;
      const best = [...me.unlocked]
        .filter((d) => !(drinkOf(c, d).recipe.spiritweed && me.spiritweed < 4))
        .filter((d) => !cityOf(c, t.city).contraband.includes(d))
        .map((d) => [d, drinkScore(w, c, t.city, d)] as const)
        .sort((a, b) => b[1] - a[1])
        .slice(0, t.taps)
        .map(([d]) => d);
      const cur = t.menu.map((m) => m.drinkId);
      if (best.join() !== cur.join()) out.push({ type: 'setMenu', tavernId: t.id, drinkIds: best });
    }

    // Found sisters as soon as it's affordable with a cushion.
    const targets = [...CITY_IDS].filter((x) => x !== w.meta.homeCity).sort((a, b) => foundingCost(w, c, a) - foundingCost(w, c, b));
    for (const city of targets) {
      if (canFound(w, c, city) === 'ok' && budget > foundingCost(w, c, city) + 150) {
        out.push({ type: 'found', city });
        budget -= foundingCost(w, c, city) + 150;
        break;
      }
    }

    // Staff: tapster, runner, then door/cellar/stage as money allows.
    const order: Array<[string, number]> = [['tapster', 1], ['runner', 1], ['tapster', 2], ['bruiser', 1], ['cellarer', 1], ['runner', 2], ['fiddler', 1], ['tapster', 3], ['informant', 1]];
    for (const t of mine) {
      if (t.status === 'building') continue;
      const staff = staffAt(w, t.id);
      const busy = (t.lastKpi?.served ?? 0) + (t.lastKpi?.walkouts ?? 0) * 2;
      const maxStaff = Math.min(8, 1 + Math.floor(busy / 14) + Math.floor(t.tables / 6));
      for (const [arch, n] of order) {
        if (staff.length >= maxStaff) break;
        const role = c.staff.archetypes.find((a) => a.id === arch)!.role;
        if (staff.filter((s) => s.role === role).length >= n) continue;
        const tier = budget > 900 ? 'seasoned' : 'green';
        if (budget > hireCost(c, tier) * 3 + 150) {
          out.push({ type: 'hire', tavernId: t.id, archetype: arch, tier });
          budget -= hireCost(c, tier) * 3 + 150;
        }
        break;
      }
      // Grow the room when it's full.
      const lt = upgradePrice(c, t, 'longtables');
      if (lt !== null && budget > lt * 1.6 && t.agg.occupancy + (w.floor?.tavernId === t.id ? w.floor.patrons.length : 0) > t.tables * 2 * 0.4) {
        out.push({ type: 'upgrade', tavernId: t.id, upgradeId: 'longtables' });
        budget -= lt;
      }
      const tap = upgradePrice(c, t, 'brass-tap');
      if (tap !== null && budget > tap * 3 && me.unlocked.length > t.taps) {
        out.push({ type: 'upgrade', tavernId: t.id, upgradeId: 'brass-tap' });
        budget -= tap;
      }
      for (const u of ['copper-kettles', 'memorial-print', 'bouncers-door']) {
        const p = upgradePrice(c, t, u);
        if (p !== null && budget > p * 4) {
          out.push({ type: 'upgrade', tavernId: t.id, upgradeId: u });
          budget -= p;
        }
      }
      if (t.managerId && w.staff[t.managerId]!.tier === 'green' && budget > 800) {
        out.push({ type: 'hireManager', tavernId: t.id, tier: 'seasoned' });
        budget -= 200;
      }
    }

    // Research a new recipe pair now and then.
    if (budget > 250 && this.triedPairs < 28) {
      const ings: IngredientId[] = ['barley', 'hops', 'molasses', 'spice', 'redEarth', 'fruit', 'imports'];
      outer: for (let i = 0; i < ings.length; i++) {
        for (let j = i + 1; j < ings.length; j++) {
          const key = [ings[i], ings[j]].sort().join('+');
          if (w.research.tried.includes(key)) continue;
          if (!c.drinks.some((d) => d.discover && [...d.discover].sort().join('+') === key)) continue;
          out.push({ type: 'research', a: ings[i]!, b: ings[j]! });
          this.triedPairs++;
          break outer;
        }
      }
    }
    void companyTaverns;
    return out;
  }
}

/** How good a drink is for a city: margin weighted by the city's segment tastes. */
function drinkScore(w: World, c: Content, city: (typeof CITY_IDS)[number], drinkId: string): number {
  const d = drinkOf(c, drinkId);
  const cost = kegCost(w, c, drinkId, city, player(w), null) / c.economy.kegServings;
  let fit = 0;
  for (const s of idx(c).segsByCity[city]) fit += s.weight * (s.prefs[d.category] ?? 0);
  return (d.price - cost) * (1 + fit) + d.quality / 25;
}

function answerPrompts(w: World, c: Content): Command[] {
  const out: Command[] = [];
  const me = player(w);
  for (const p of w.prompts.active) {
    const def = idx(c).prompt.get(p.defId)!;
    let best = def.defaultOption;
    let bestV = -Infinity;
    def.options.forEach((o, i) => {
      if (o.cost && me.cash < o.cost + 250) return;
      const v = effectValue(o.effects, c) - (o.cost ?? 0) * 0.8;
      if (v > bestV) { bestV = v; best = i; }
    });
    out.push({ type: 'answer', uid: p.uid, option: best });
  }
  return out;
}

/** One floor action, most urgent first. */
function floorMove(w: World, c: Content): Command | null {
  const f = w.floor;
  if (!f || w.focus.view !== 'floor') return null;
  const t = w.taverns[f.tavernId]!;
  const owner = f.workers.find((x) => x.kind === 'owner')!;
  const cal = calendarAt(w.tick, c.time);
  if (cal.phase === 'lastCall' && !f.lastCallRung && f.patrons.filter((p) => p.state !== 'leaving').length <= 3) return { type: 'ringBell' };
  const inc = f.incidents.find((i) => i.claimedBy !== owner.id);
  if (inc) return { type: 'breakBrawl', incidentId: inc.id };
  const thief = f.patrons.find((p) => p.state === 'sneaking' && p.claimedBy === 0);
  if (thief) return { type: 'catchThief', patronId: thief.id };
  // Seating is instant for the owner, so it's always worth doing.
  const waiting = f.patrons.filter((p) => p.state === 'waiting').sort((a, b) => Number(b.vip) - Number(a.vip) || a.patience - b.patience);
  const table = f.tables.find((tb) => !tb.dirty && (!tb.seats[0] || !tb.seats[1]));
  if (waiting.length && table) return { type: 'seat', patronId: waiting[0]!.id, tableId: table.id };
  if (owner.queue.length >= 2) return null;
  const empty = f.taps.find((tp) => (t.tapLevels[tp.drinkId] ?? 0) <= 0 && (t.cellar[tp.drinkId] ?? 0) > 0 && !tp.claimedBy);
  if (empty) return { type: 'restock', drinkId: empty.drinkId };
  const order = f.patrons
    .filter((p) => p.state === 'ordered' && !p.claimedBy && p.drinkId && (t.tapLevels[p.drinkId] ?? 0) > 0)
    .sort((a, b) => a.patience - b.patience)[0];
  if (order) return { type: 'serve', patronId: order.id };
  const dirty = f.tables.find((tb) => tb.dirty && !tb.claimedBy);
  if (dirty) return { type: 'clear', tableId: dirty.id };
  void segOf;
  return null;
}
