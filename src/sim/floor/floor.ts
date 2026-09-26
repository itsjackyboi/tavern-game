import { log } from '../log.ts';
import type { Content } from '../../content/schema.ts';
import { applyVisitRep, recordSale, servingSatisfaction, spend } from '../economy/ledger.ts';
import {
  availableDrinks, cityOf, prefOf, clamp, drinkOf, drinkQuality, idx, isOpenNow, modsFor, segOf, servingPrice, staffAt,
  tavernUpgradeSum, type ModTotals,
} from '../lookup.ts';
import { chance, pick, rand, randInt } from '../rng.ts';
import { calNow } from '../time.ts';
import type { FloorState, FloorTable, FxEvent, Incident, Patron, Pos, Staff, Task, Tavern, Worker, World } from '../types.ts';
import {
  CELLAR, DOOR, DOOR_POST, MAX_TABLES, OWNER_HOME, QUEUE_SLOTS, STAGE, TABLE_SLOTS, TILL, dist, pourPos, seatPos, servePos, tapPos,
} from './layout.ts';

// The focused tavern's floor, simulated agent by agent (the Diner-Dash layer).
// Every other tavern runs the aggregate model in ../aggregate.ts.

const OWNER_ID = 1;
const ACTIVE: Patron['state'][] = ['seated', 'ordered', 'drinking', 'brawling'];

export function fx(w: World, kind: FxEvent['kind'], x: number, y: number, value = 0): void {
  w.fx.push({ tick: w.tick, kind, x, y, value });
  if (w.fx.length > 80) w.fx.splice(0, w.fx.length - 80);
}

function nextId(f: FloorState): number {
  f.nextId += 1;
  return f.nextId;
}

/** Identifies the current shift; the Holiday Keg gets its own key (-1 - yearIndex). */
export function shiftKey(cal: { segment: string; shiftIndex: number; yearIndex: number }): number {
  return cal.segment === 'holidayKeg' ? -1 - cal.yearIndex : cal.shiftIndex;
}

// ---------------------------------------------------------------- construction

function buildTables(t: Tavern, existing: FloorTable[]): FloorTable[] {
  const n = Math.min(t.tables, MAX_TABLES);
  const out: FloorTable[] = [];
  for (let i = 0; i < n; i++) {
    const slot = TABLE_SLOTS[i]!;
    out.push(existing[i] ?? { id: i, x: slot.x, y: slot.y, seats: [0, 0], dirty: false, claimedBy: 0 });
  }
  return out;
}

function buildTaps(t: Tavern): FloorState['taps'] {
  return t.menu.slice(0, t.taps).map((m, i) => ({ drinkId: m.drinkId, ...tapPos(i), claimedBy: 0 }));
}

function staffWorker(f: FloorState, s: Staff): Worker {
  const home =
    s.role === 'bar' ? { x: 6 + (f.workers.length % 3) * 2, y: 3 } :
    s.role === 'door' ? DOOR_POST :
    s.role === 'cellar' ? { x: CELLAR.x + 1, y: CELLAR.y } :
    s.role === 'stage' ? STAGE :
    { x: 15, y: 9 };
  return {
    id: nextId(f), kind: 'staff', staffId: s.id, role: s.role, x: home.x, y: home.y, homeX: home.x, homeY: home.y,
    task: null, queue: [], timer: 0, carrying: null, cooldown: 0,
  };
}

/** Rebuilds fixtures and the staff roster after upgrades, hires or menu changes. */
export function syncFloor(w: World, c: Content): void {
  const f = w.floor;
  if (!f) return;
  const t = w.taverns[f.tavernId];
  if (!t) return;
  f.tables = buildTables(t, f.tables);
  const oldTaps = f.taps;
  f.taps = buildTaps(t);
  for (const tap of f.taps) tap.claimedBy = oldTaps.find((o) => o.drinkId === tap.drinkId)?.claimedBy ?? 0;
  const onFloor = staffAt(w, t.id).filter((s) => s.role !== 'intel');
  const keep = f.workers.filter((wk) => wk.kind === 'owner' || onFloor.some((s) => s.id === wk.staffId));
  for (const wk of f.workers) if (!keep.includes(wk)) releaseTask(f, wk);
  f.workers = keep;
  for (const s of onFloor) if (!f.workers.some((wk) => wk.staffId === s.id)) f.workers.push(staffWorker(f, s));
  void c;
}

export function materializeFloor(w: World, c: Content, t: Tavern): FloorState {
  const f: FloorState = {
    tavernId: t.id, tables: [], taps: [], patrons: [], workers: [], incidents: [], nextId: 1, spawnAcc: 0,
    lastCallRung: false, shiftIndex: shiftKey(calNow(w, c.time)),
  };
  f.tables = buildTables(t, []);
  f.taps = buildTaps(t);
  f.workers.push({
    id: OWNER_ID, kind: 'owner', staffId: null, role: 'owner', x: OWNER_HOME.x, y: OWNER_HOME.y,
    homeX: OWNER_HOME.x, homeY: OWNER_HOME.y, task: null, queue: [], timer: 0, carrying: null, cooldown: 0,
  });
  f.nextId = 10;
  for (const s of staffAt(w, t.id)) if (s.role !== 'intel') f.workers.push(staffWorker(f, s));

  // Seat the aggregate occupancy as patrons already mid-visit.
  const segs = Object.entries(t.demand.segRates);
  let occ = Math.min(Math.round(t.agg.occupancy), f.tables.length * 2);
  let backlog = Math.round(t.agg.backlog);
  const mods = modsFor(w, c, t);
  const drinks = availableDrinks(w, c, t, mods);
  for (const table of f.tables) {
    for (let s = 0; s < 2 && occ > 0; s++) {
      const segId = segs.length ? weighted(w, segs) : idx(c).segsByCity[t.city][0]!.id;
      const p = newPatron(w, c, f, t, segId, mods);
      const pos = seatPos(table, s);
      p.x = pos.x; p.y = pos.y; p.tx = pos.x; p.ty = pos.y;
      p.tableId = table.id; p.seat = s;
      table.seats[s] = p.id;
      if (backlog > 0 && drinks.length) {
        p.state = 'ordered';
        p.drinkId = pick(w, 'floor', drinks);
        p.patience = p.patienceMax = Math.round(c.floor.orderPatienceTicks * segOf(c, segId).patience * w.meta.timerScale);
        backlog--;
      } else {
        p.state = 'drinking';
        p.drinkId = drinks.length ? pick(w, 'floor', drinks) : null;
        p.timer = randInt(w, 'floor', 20, c.demand.drinkSeconds * 20);
        p.drinksLeft = randInt(w, 'floor', 1, 2);
      }
      f.patrons.push(p);
      occ--;
    }
  }
  return f;
}

/** Turns the floor back into aggregate numbers when focus moves elsewhere. Open incidents resolve as if ignored. */
export function collapseFloor(w: World, c: Content): void {
  const f = w.floor;
  if (!f) return;
  const t = w.taverns[f.tavernId];
  if (t) {
    for (const inc of [...f.incidents]) failBrawl(w, c, f, t, inc);
    for (const p of f.patrons) {
      if (p.state === 'sneaking') steal(w, c, f, t, p);
      if (p.state === 'waiting' || p.state === 'arriving') t.kpi.walkouts += 1;
    }
    t.agg.occupancy = f.patrons.filter((p) => ACTIVE.includes(p.state) || p.state === 'toSeat').length;
    t.agg.backlog = f.patrons.filter((p) => p.state === 'ordered').length;
  }
  w.floor = null;
}

// ---------------------------------------------------------------- patrons

function weighted(w: World, entries: Array<[string, number]>): string {
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let r = rand(w, 'floor') * total;
  for (const [k, v] of entries) {
    r -= v;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}

function newPatron(w: World, c: Content, f: FloorState, t: Tavern, segId: string, mods: ModTotals): Patron {
  const seg = segOf(c, segId);
  const cal = calNow(w, c.time);
  const city = cityOf(c, t.city);
  const nightDrinks = cal.isNight ? (seg.night?.drinks ?? 1) * city.nightThirst : 1;
  // Unbiased: the expected count matches the aggregate model's drinks-per-visit.
  const want = c.demand.drinksPerVisit * seg.drinks * nightDrinks * (0.6 + 0.8 * rand(w, 'floor'));
  const drinks = Math.max(1, Math.floor(want) + (chance(w, 'floor', want - Math.floor(want)) ? 1 : 0));
  const vip = seg.vip || chance(w, 'floor', 0.015);
  const theftP = seg.theft * city.theftMult * mods.theft * (1 + tavernUpgradeSum(c, t, 'theft'));
  const thief = !vip && chance(w, 'floor', clamp(theftP * 2.2, 0, 0.4));
  const regular = t.regulars.length && chance(w, 'floor', 0.12) ? pick(w, 'floor', t.regulars) : null;
  const patienceMax = Math.round(
    (vip ? c.floor.vipWindowTicks : c.floor.seatPatienceTicks) * seg.patience * w.meta.timerScale * (regular ? 1.3 : 1),
  );
  return {
    id: nextId(f), seg: segId, state: 'arriving', x: DOOR.x, y: DOOR.y + 1, tx: DOOR.x, ty: DOOR.y, tableId: -1, seat: -1,
    drinkId: null, timer: 0, patience: patienceMax, patienceMax, drinksLeft: drinks, sat: 0, satN: 0, vip, greeted: !vip,
    thief, regular, look: randInt(w, 'floor', 0, 99999), claimedBy: 0, queueSlot: -1, angry: false,
  };
}

function freeQueueSlot(f: FloorState): number {
  for (let i = 0; i < QUEUE_SLOTS.length; i++) if (!f.patrons.some((p) => p.queueSlot === i && (p.state === 'waiting' || p.state === 'arriving'))) return i;
  return -1;
}

function spawn(w: World, c: Content, f: FloorState, t: Tavern, phase: string): void {
  if (phase === 'lastCall' || f.lastCallRung || !isOpenNow(w, t)) return;
  const rate = t.demand.rate;
  if (rate <= 0) return;
  if (!chance(w, 'floor', clamp(rate / 20, 0, 0.5))) return;
  const segs = Object.entries(t.demand.segRates);
  if (!segs.length) return;
  const slot = freeQueueSlot(f);
  if (slot < 0) {
    t.kpi.walkouts += 1;
    t.rep = clamp(t.rep - 0.05, 0, 100);
    return;
  }
  const mods = modsFor(w, c, t);
  const p = newPatron(w, c, f, t, weighted(w, segs), mods);
  p.queueSlot = slot;
  const q = QUEUE_SLOTS[slot]!;
  p.tx = q.x; p.ty = q.y;
  f.patrons.push(p);
  if (p.vip) fx(w, 'vip', q.x, q.y);
}

function moveToward(e: { x: number; y: number }, tx: number, ty: number, speed: number): boolean {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d <= speed) {
    e.x = tx; e.y = ty;
    return true;
  }
  e.x += (dx / d) * speed;
  e.y += (dy / d) * speed;
  return false;
}

function freeSeat(f: FloorState, p: Patron): void {
  const table = f.tables.find((tb) => tb.id === p.tableId);
  if (table && p.seat >= 0 && table.seats[p.seat] === p.id) {
    table.seats[p.seat] = 0;
    table.dirty = true;
  }
  p.tableId = -1;
  p.seat = -1;
}

/** `quiet`: turned away at the door at closing time, which costs no reputation. */
function leave(w: World, c: Content, f: FloorState, t: Tavern, p: Patron, angry: boolean, quiet = false): void {
  if (p.state === 'leaving' || p.state === 'gone') return;
  const mods = modsFor(w, c, t);
  const wasSeated = p.tableId >= 0;
  freeSeat(f, p);
  p.state = 'leaving';
  p.angry = angry;
  p.queueSlot = -1;
  p.claimedBy = 0;
  p.tx = DOOR.x; p.ty = DOOR.y + 1;
  const sat = angry ? 0.08 : p.satN ? p.sat / p.satN : 0.4;
  const q = p.drinkId ? drinkQuality(w, c, t, p.drinkId, mods) : 40;
  if (angry && !wasSeated) {
    t.kpi.walkouts += 1;
    fx(w, 'walkout', p.x, p.y);
  }
  if (quiet) return;
  applyVisitRep(w, c, t, sat, angry ? 20 : q, mods, p.vip ? 3 : 1);
  if (!angry && sat > 0.75 && !p.regular && t.regulars.length < 6 && chance(w, 'floor', 0.08)) {
    t.regulars.push(`${pick(w, 'floor', c.staff.firstNames)} ${pick(w, 'floor', c.staff.epithets)}`);
  }
}

function orderDrink(w: World, c: Content, t: Tavern, p: Patron, mods: ModTotals, night: boolean): string | null {
  const drinks = availableDrinks(w, c, t, mods);
  if (!drinks.length) return null;
  const seg = segOf(c, p.seg);
  const scores = drinks.map((id) => {
    const d = drinkOf(c, id);
    const pref = prefOf(seg, d.category, night);
    return [id, Math.max(0.05, 1 + pref) * (drinkQuality(w, c, t, id, mods) / 60)] as [string, number];
  });
  return weighted(w, scores);
}

function updatePatrons(w: World, c: Content, f: FloorState, t: Tavern, night: boolean): void {
  const mods = modsFor(w, c, t);
  const walk = (c.floor.walkTilesPerSecond / 20) * 0.8;
  for (const p of f.patrons) {
    switch (p.state) {
      case 'arriving':
        if (moveToward(p, p.tx, p.ty, walk)) p.state = 'waiting';
        break;
      case 'waiting':
        p.patience -= 1;
        if (p.patience <= 0) {
          if (p.vip && !p.greeted) t.rep = clamp(t.rep - 3 * mods.repSwing, 0, 100);
          leave(w, c, f, t, p, true);
        }
        break;
      case 'toSeat':
        if (moveToward(p, p.tx, p.ty, walk)) {
          p.state = 'seated';
          p.timer = c.floor.orderDelayTicks;
        }
        break;
      case 'seated':
        p.timer -= 1;
        if (p.timer <= 0) {
          if (p.thief && p.satN > 0) {
            startSneak(w, c, f, p);
            break;
          }
          const d = orderDrink(w, c, t, p, mods, night);
          if (!d) {
            leave(w, c, f, t, p, true);
            break;
          }
          p.drinkId = d;
          p.state = 'ordered';
          p.patience = p.patienceMax = Math.round(c.floor.orderPatienceTicks * segOf(c, p.seg).patience * w.meta.timerScale);
        }
        break;
      case 'ordered':
        p.patience -= 1;
        if (p.patience <= 0) leave(w, c, f, t, p, true);
        break;
      case 'drinking':
        p.timer -= 1;
        if (p.timer <= 0) {
          p.drinksLeft -= 1;
          if (p.drinksLeft > 0 && !f.lastCallRung) {
            p.state = 'seated';
            p.timer = c.floor.orderDelayTicks;
          } else if (p.thief) {
            startSneak(w, c, f, p);
          } else {
            leave(w, c, f, t, p, false);
          }
        }
        break;
      case 'sneaking':
        moveToward(p, p.tx, p.ty, walk * 0.55);
        if (w.tick >= p.timer) {
          steal(w, c, f, t, p);
        }
        break;
      case 'leaving':
        if (moveToward(p, p.tx, p.ty, walk * 1.2)) p.state = 'gone';
        break;
      default:
        break;
    }
  }
}

function startSneak(w: World, c: Content, f: FloorState, p: Patron): void {
  freeSeat(f, p);
  p.state = 'sneaking';
  p.tx = TILL.x; p.ty = TILL.y + 1.2;
  p.timer = w.tick + Math.round(c.floor.thiefWindowTicks * w.meta.timerScale);
  p.claimedBy = 0;
}

function steal(w: World, c: Content, f: FloorState, t: Tavern, p: Patron): void {
  const co = w.companies[t.companyId]!;
  const amount = Math.round(clamp(co.cash * 0.03, 6, 60) * cityOf(c, t.city).theftMult);
  spend(co, amount, 'other', 'Theft', `A thief at ${t.name}`);
  t.kpi.thefts += 1;
  fx(w, 'steal', p.x, p.y, amount);
  p.thief = false;
  leave(w, c, f, t, p, false);
  p.tx = DOOR.x; p.ty = DOOR.y + 1;
}

// ---------------------------------------------------------------- incidents

function maybeBrawl(w: World, c: Content, f: FloorState, t: Tavern, p: Patron, mods: ModTotals, night: boolean): void {
  if (f.incidents.length >= c.floor.maxIncidents || p.vip) return;
  const seg = segOf(c, p.seg);
  const d = p.drinkId ? drinkOf(c, p.drinkId) : null;
  const base = (night ? (seg.night?.brawl ?? seg.brawl) : seg.brawl) * cityOf(c, t.city).brawlMult;
  const prob = base * (1 + (d?.brawl ?? 0)) * mods.brawl * (1 + tavernUpgradeSum(c, t, 'brawl')) * (night ? 1.4 : 1) * 2.5;
  if (!chance(w, 'floor', clamp(prob, 0, 0.6))) return;
  let partner: Patron | null = null;
  let best = 99;
  for (const o of f.patrons) {
    if (o.id === p.id || o.vip || !['drinking', 'ordered', 'seated'].includes(o.state)) continue;
    const dd = dist(o, p);
    if (dd < best) { best = dd; partner = o; }
  }
  if (!partner || best > 9) return;
  p.state = 'brawling';
  partner.state = 'brawling';
  const inc: Incident = {
    id: nextId(f), kind: 'brawl', patronIds: [p.id, partner.id], x: (p.x + partner.x) / 2, y: (p.y + partner.y) / 2,
    deadline: w.tick + Math.round(c.floor.brawlWindowTicks * w.meta.timerScale), claimedBy: 0,
  };
  f.incidents.push(inc);
  fx(w, 'brawl', inc.x, inc.y);
}

function resolveBrawl(w: World, f: FloorState, inc: Incident): void {
  for (const id of inc.patronIds) {
    const p = f.patrons.find((x) => x.id === id);
    if (!p || p.state !== 'brawling') continue;
    p.state = 'drinking';
    p.timer = 40;
    p.sat += 0.35;
    p.satN += 1;
  }
  f.incidents = f.incidents.filter((i) => i.id !== inc.id);
  fx(w, 'calm', inc.x, inc.y);
}

function failBrawl(w: World, c: Content, f: FloorState, t: Tavern, inc: Incident): void {
  const co = w.companies[t.companyId]!;
  const mods = modsFor(w, c, t);
  const damage = Math.round((15 + rand(w, 'floor') * 25) * cityOf(c, t.city).damageMult);
  spend(co, damage, 'other', 'Brawl damage', `A brawl at ${t.name}`);
  t.rep = clamp(t.rep - 2 * mods.repSwing, 0, 100);
  t.kpi.brawls += 1;
  for (const id of inc.patronIds) {
    const p = f.patrons.find((x) => x.id === id);
    if (p && p.state === 'brawling') leave(w, c, f, t, p, true);
  }
  for (const o of f.patrons) if (ACTIVE.includes(o.state) && dist(o, inc) < 4) { o.sat += 0.2; o.satN += 1; }
  f.incidents = f.incidents.filter((i) => i.id !== inc.id);
  fx(w, 'thud', inc.x, inc.y, damage);
}

// ---------------------------------------------------------------- workers

function workerRates(w: World, c: Content, wk: Worker): { speed: number; action: number } {
  const base = c.floor.walkTilesPerSecond / 20;
  if (wk.kind === 'owner') return { speed: base, action: 1 };
  const s = wk.staffId ? w.staff[wk.staffId] : undefined;
  const comp = s?.competence ?? 0.5;
  const eff = (0.6 + 0.4 * comp) * (0.7 + 0.3 * (s?.morale ?? 0.7)) * (1 - 0.3 * (s?.fatigue ?? 0)) * c.floor.delegationEff;
  return { speed: base * eff, action: 1 / eff };
}

function releaseTask(f: FloorState, wk: Worker): void {
  const task = wk.task;
  wk.task = null;
  wk.carrying = null;
  if (!task) return;
  const clear = (o: { claimedBy: number } | undefined) => { if (o && o.claimedBy === wk.id) o.claimedBy = 0; };
  if (task.kind === 'serve' || task.kind === 'thief' || task.kind === 'greet' || task.kind === 'seat') clear(f.patrons.find((p) => p.id === task.patronId));
  if (task.kind === 'clear' || task.kind === 'seat') clear(f.tables.find((tb) => tb.id === task.tableId));
  if (task.kind === 'brawl') clear(f.incidents.find((i) => i.id === task.incidentId));
  if (task.kind === 'restock') clear(f.taps.find((tp) => tp.drinkId === task.drinkId));
}

function claim(o: { claimedBy: number }, wk: Worker): boolean {
  if (o.claimedBy && o.claimedBy !== wk.id) return false;
  o.claimedBy = wk.id;
  return true;
}

function tapIndex(f: FloorState, drinkId: string): number {
  return f.taps.findIndex((tp) => tp.drinkId === drinkId);
}

function freeSeatSlot(f: FloorState, reserved: Set<string>): { table: FloorTable; seat: number } | null {
  for (const table of f.tables) {
    if (table.dirty) continue;
    for (let s = 0; s < 2; s++) if (!table.seats[s] && !reserved.has(`${table.id}:${s}`)) return { table, seat: s };
  }
  return null;
}

/** Staff pick work according to their role. */
function pickTask(w: World, c: Content, f: FloorState, t: Tavern, wk: Worker): Task | null {
  const unclaimed = <T extends { claimedBy: number }>(o: T) => !o.claimedBy;
  const serveTask = (): Task | null => {
    const orders = f.patrons.filter((p) => p.state === 'ordered' && unclaimed(p) && p.drinkId && (t.tapLevels[p.drinkId] ?? 0) > 0 && tapIndex(f, p.drinkId) >= 0);
    orders.sort((a, b) => a.patience - b.patience);
    const p = orders[0];
    return p ? { kind: 'serve', patronId: p.id, drinkId: p.drinkId!, stage: 'toTap' } : null;
  };
  const restockTask = (low: number): Task | null => {
    const tap = f.taps.find((tp) => unclaimed(tp) && (t.tapLevels[tp.drinkId] ?? 0) <= low && (t.cellar[tp.drinkId] ?? 0) > 0);
    return tap ? { kind: 'restock', drinkId: tap.drinkId, stage: 'toCellar' } : null;
  };
  switch (wk.role) {
    case 'bar': {
      const hasCellarer = f.workers.some((x) => x.role === 'cellar');
      return serveTask() ?? (hasCellarer ? null : restockTask(0));
    }
    case 'floor': {
      const waiting = f.patrons.filter((p) => p.state === 'waiting' && p.greeted && unclaimed(p));
      if (waiting.length) {
        const slot = freeSeatSlot(f, new Set());
        const p = waiting.sort((a, b) => a.patience - b.patience)[0]!;
        if (slot) return { kind: 'seat', patronId: p.id, tableId: slot.table.id, stage: 'go' };
      }
      const dirty = f.tables.find((tb) => tb.dirty && unclaimed(tb));
      if (dirty) return { kind: 'clear', tableId: dirty.id, stage: 'go' };
      return f.workers.some((x) => x.role === 'bar') ? null : serveTask();
    }
    case 'door': {
      const inc = f.incidents.find(unclaimed);
      if (inc) return { kind: 'brawl', incidentId: inc.id, stage: 'go' };
      const thief = f.patrons.find((p) => p.state === 'sneaking' && unclaimed(p));
      if (thief) return { kind: 'thief', patronId: thief.id, stage: 'go' };
      const vip = f.patrons.find((p) => p.state === 'waiting' && !p.greeted && unclaimed(p));
      if (vip) return { kind: 'greet', patronId: vip.id, stage: 'go' };
      return null;
    }
    case 'cellar':
      return restockTask(c.economy.kegServings * c.floor.tapLowFraction);
    default:
      return null;
  }
}

function lockTask(f: FloorState, wk: Worker, task: Task): boolean {
  switch (task.kind) {
    case 'serve':
    case 'thief':
    case 'greet': {
      const p = f.patrons.find((x) => x.id === task.patronId);
      return !!p && claim(p, wk);
    }
    case 'seat': {
      const p = f.patrons.find((x) => x.id === task.patronId);
      const tb = f.tables.find((x) => x.id === task.tableId);
      return !!p && !!tb && claim(p, wk);
    }
    case 'clear': {
      const tb = f.tables.find((x) => x.id === task.tableId);
      return !!tb && claim(tb, wk);
    }
    case 'brawl': {
      const inc = f.incidents.find((x) => x.id === task.incidentId);
      return !!inc && claim(inc, wk);
    }
    case 'restock': {
      const tap = f.taps.find((x) => x.drinkId === task.drinkId);
      return !!tap && claim(tap, wk);
    }
  }
}

/** Advances a worker's current task. Returns true when the task is finished (or failed). */
function runTask(w: World, c: Content, f: FloorState, t: Tavern, wk: Worker, night: boolean): boolean {
  const task = wk.task!;
  const { speed, action } = workerRates(w, c, wk);
  const mods = modsFor(w, c, t);
  switch (task.kind) {
    case 'serve': {
      const p = f.patrons.find((x) => x.id === task.patronId);
      if (!p || (p.state !== 'ordered' && task.stage !== 'toPatron')) return true;
      const ti = tapIndex(f, task.drinkId);
      if (ti < 0) return true;
      if (task.stage === 'toTap') {
        const pp = pourPos(ti);
        if (moveToward(wk, pp.x, pp.y, speed)) {
          if ((t.tapLevels[task.drinkId] ?? 0) <= 0) {
            fx(w, 'error', pp.x, pp.y);
            return true;
          }
          task.stage = 'pour';
          wk.timer = Math.round(c.floor.pourTicks * action * (wk.role === 'bar' ? 0.75 : 1));
        }
        return false;
      }
      if (task.stage === 'pour') {
        wk.timer -= 1;
        if (wk.timer > 0) return false;
        t.tapLevels[task.drinkId] = Math.max(0, (t.tapLevels[task.drinkId] ?? 0) - 1);
        wk.carrying = task.drinkId;
        task.stage = 'toPatron';
        fx(w, 'pour', wk.x, wk.y);
        return false;
      }
      // toPatron
      const sp = servePos(p);
      if (!moveToward(wk, sp.x, sp.y, speed)) return false;
      wk.carrying = null;
      if (p.state !== 'ordered' || p.drinkId !== task.drinkId) return true; // wasted pour
      deliver(w, c, f, t, p, wk.kind === 'owner', mods, night);
      return true;
    }
    case 'restock': {
      const ti = tapIndex(f, task.drinkId);
      if (ti < 0) return true;
      if (task.stage === 'toCellar') {
        if (moveToward(wk, CELLAR.x, CELLAR.y, speed)) {
          if ((t.cellar[task.drinkId] ?? 0) < 1) {
            fx(w, 'error', CELLAR.x, CELLAR.y);
            return true;
          }
          task.stage = 'grab';
          wk.timer = Math.round(c.floor.restockTicks * action * 0.5);
        }
        return false;
      }
      if (task.stage === 'grab') {
        if (--wk.timer > 0) return false;
        wk.carrying = 'keg';
        task.stage = 'toTap';
        return false;
      }
      if (task.stage === 'toTap') {
        const pp = pourPos(ti);
        if (moveToward(wk, pp.x, pp.y, speed * 0.85)) {
          task.stage = 'install';
          wk.timer = Math.round(c.floor.restockTicks * action * 0.5);
        }
        return false;
      }
      if (--wk.timer > 0) return false;
      wk.carrying = null;
      if ((t.cellar[task.drinkId] ?? 0) >= 1) {
        t.cellar[task.drinkId] = (t.cellar[task.drinkId] ?? 0) - 1;
        t.tapLevels[task.drinkId] = c.economy.kegServings;
        fx(w, 'restock', wk.x, wk.y);
        const co = w.companies[t.companyId]!;
        const skim = wk.staffId ? (c.staff.archetypes.find((a) => a.id === w.staff[wk.staffId!]?.archetype)?.skim ?? 0) : 0;
        if (skim > 0 && chance(w, 'floor', skim * 5)) spend(co, 4, 'other', 'Theft', 'Your cellarer pocketed some');
      }
      return true;
    }
    case 'clear': {
      const tb = f.tables.find((x) => x.id === task.tableId);
      if (!tb || !tb.dirty) return true;
      if (task.stage === 'go') {
        const sp = servePos(tb);
        if (moveToward(wk, sp.x, sp.y, speed)) {
          task.stage = 'work';
          wk.timer = Math.round(c.floor.clearTicks * action);
        }
        return false;
      }
      if (--wk.timer > 0) return false;
      tb.dirty = false;
      return true;
    }
    case 'seat': {
      const p = f.patrons.find((x) => x.id === task.patronId);
      const tb = f.tables.find((x) => x.id === task.tableId);
      if (!p || !tb || p.state !== 'waiting') return true;
      if (moveToward(wk, p.x, p.y - 1, speed)) {
        const seat = !tb.seats[0] ? 0 : !tb.seats[1] ? 1 : -1;
        if (seat < 0 || tb.dirty) return true;
        seatPatron(w, f, p, tb, seat);
      }
      return false;
    }
    case 'brawl': {
      const inc = f.incidents.find((x) => x.id === task.incidentId);
      if (!inc) return true;
      if (!moveToward(wk, inc.x, inc.y + 0.6, speed * 1.2)) return false;
      if (wk.kind === 'owner') {
        resolveBrawl(w, f, inc);
      } else {
        const comp = wk.staffId ? (w.staff[wk.staffId]?.competence ?? 0.5) : 0.5;
        if (chance(w, 'floor', 0.55 + 0.4 * comp)) resolveBrawl(w, f, inc);
        else {
          inc.claimedBy = 0;
          wk.cooldown = 20;
        }
      }
      return true;
    }
    case 'thief': {
      const p = f.patrons.find((x) => x.id === task.patronId);
      if (!p || p.state !== 'sneaking') return true;
      if (!moveToward(wk, p.x, p.y, speed * 1.25)) return false;
      p.thief = false;
      fx(w, 'caught', p.x, p.y);
      t.rep = clamp(t.rep + 0.5, 0, 100);
      leave(w, c, f, t, p, false);
      return true;
    }
    case 'greet': {
      const p = f.patrons.find((x) => x.id === task.patronId);
      if (!p || p.state !== 'waiting' || p.greeted) return true;
      if (!moveToward(wk, p.x, p.y - 1, speed * 1.1)) return false;
      p.greeted = true;
      p.patience = p.patienceMax = Math.round(c.floor.seatPatienceTicks * 1.5 * w.meta.timerScale);
      fx(w, 'greet', p.x, p.y);
      t.rep = clamp(t.rep + 0.3, 0, 100);
      return true;
    }
  }
}

function seatPatron(w: World, f: FloorState, p: Patron, tb: FloorTable, seat: number): void {
  tb.seats[seat] = p.id;
  p.tableId = tb.id;
  p.seat = seat;
  p.queueSlot = -1;
  p.claimedBy = 0;
  const pos = seatPos(tb, seat);
  p.tx = pos.x; p.ty = pos.y;
  p.state = 'toSeat';
  fx(w, 'seat', pos.x, pos.y);
}

function deliver(w: World, c: Content, f: FloorState, t: Tavern, p: Patron, byOwner: boolean, mods: ModTotals, night: boolean): void {
  const seg = segOf(c, p.seg);
  const wait = 1 - clamp(p.patience / Math.max(1, p.patienceMax), 0, 1);
  let sat = servingSatisfaction(w, c, t, seg, p.drinkId!, wait, mods, night);
  if (byOwner) sat = clamp(sat + 0.05, 0, 1);
  if (p.regular) sat = clamp(sat + 0.05, 0, 1);
  p.sat += sat;
  p.satN += 1;
  const price = servingPrice(c, t, p.drinkId!, mods);
  let tip = price * (seg.tip + mods.tips) * sat * (p.vip ? 2.2 : 1);
  if (byOwner) tip *= 1 + c.floor.ownersTouch;
  if (seg.favorTips && cityOf(c, t.city).favor) {
    const co = w.companies[t.companyId]!;
    co.favor += tip * 0.4 / c.economy.favorToDuckets;
    tip *= 0.6;
  }
  recordSale(w, c, t, p.drinkId!, price, tip, mods);
  fx(w, tip > price * 0.15 ? 'tip' : 'coin', p.x, p.y - 0.5, Math.round(price + tip));
  fx(w, 'clink', p.x, p.y);
  p.state = 'drinking';
  p.timer = Math.round(c.demand.drinkSeconds * 20 * (0.8 + 0.4 * rand(w, 'floor')));
  p.claimedBy = 0;
  maybeBrawl(w, c, f, t, p, mods, night);
}

function updateWorkers(w: World, c: Content, f: FloorState, t: Tavern, night: boolean, ownerActive: boolean): void {
  for (const wk of f.workers) {
    if (wk.kind === 'owner' && !ownerActive) continue;
    if (wk.cooldown > 0) wk.cooldown -= 1;
    if (!wk.task) {
      if (wk.kind === 'owner') {
        while (!wk.task && wk.queue.length) {
          const next = wk.queue.shift()!;
          if (lockTask(f, wk, next)) wk.task = next;
        }
      } else if (wk.cooldown <= 0) {
        const next = pickTask(w, c, f, t, wk);
        if (next && lockTask(f, wk, next)) wk.task = next;
        else wk.cooldown = 6;
      }
    }
    if (wk.task) {
      if (runTask(w, c, f, t, wk, night)) {
        releaseTask(f, wk);
        if (wk.kind === 'staff') {
          const s = w.staff[wk.staffId!];
          wk.cooldown = Math.round(8 * (1.4 - (s?.competence ?? 0.5)));
        }
      } else if (wk.kind === 'staff' && wk.staffId) {
        const s = w.staff[wk.staffId];
        if (s) s.fatigue = clamp(s.fatigue + 0.00012, 0, 1);
      }
    } else {
      moveToward(wk, wk.homeX, wk.homeY, workerRates(w, c, wk).speed * 0.6);
    }
  }
}

// ---------------------------------------------------------------- owner commands

export type FloorCommand =
  | { type: 'seat'; patronId: number; tableId: number }
  | { type: 'serve'; patronId: number }
  | { type: 'restock'; drinkId: string }
  | { type: 'clear'; tableId: number }
  | { type: 'breakBrawl'; incidentId: number }
  | { type: 'catchThief'; patronId: number }
  | { type: 'greet'; patronId: number }
  | { type: 'cancelQueue' }
  | { type: 'ringBell' };

function owner(f: FloorState): Worker {
  return f.workers.find((x) => x.kind === 'owner')!;
}

function enqueue(c: Content, f: FloorState, task: Task): boolean {
  const o = owner(f);
  if (o.queue.length >= c.floor.ownerQueueMax) return false;
  const same = (a: Task) => JSON.stringify(a) === JSON.stringify(task);
  if ((o.task && same(o.task)) || o.queue.some(same)) return false;
  o.queue.push(task);
  return true;
}

/** Applies a player floor command. Unknown or stale targets are ignored. */
export function applyFloorCommand(w: World, c: Content, cmd: FloorCommand): void {
  const f = w.floor;
  if (!f) return;
  const t = w.taverns[f.tavernId];
  if (!t) return;
  switch (cmd.type) {
    case 'seat': {
      const p = f.patrons.find((x) => x.id === cmd.patronId);
      const tb = f.tables.find((x) => x.id === cmd.tableId);
      if (!p || !tb || p.state !== 'waiting' || tb.dirty) return;
      if (p.vip && !p.greeted) {
        p.greeted = true;
        fx(w, 'greet', p.x, p.y);
        t.rep = clamp(t.rep + 0.3, 0, 100);
      }
      const seat = !tb.seats[0] ? 0 : !tb.seats[1] ? 1 : -1;
      if (seat < 0) return;
      seatPatron(w, f, p, tb, seat);
      return;
    }
    case 'serve': {
      const p = f.patrons.find((x) => x.id === cmd.patronId);
      if (!p || p.state !== 'ordered' || !p.drinkId) return;
      if (tapIndex(f, p.drinkId) < 0) return;
      if ((t.tapLevels[p.drinkId] ?? 0) <= 0) {
        fx(w, 'error', p.x, p.y);
        const ti = tapIndex(f, p.drinkId);
        if ((t.cellar[p.drinkId] ?? 0) > 0) enqueue(c, f, { kind: 'restock', drinkId: p.drinkId, stage: 'toCellar' });
        if (ti >= 0) enqueue(c, f, { kind: 'serve', patronId: p.id, drinkId: p.drinkId, stage: 'toTap' });
        return;
      }
      enqueue(c, f, { kind: 'serve', patronId: p.id, drinkId: p.drinkId, stage: 'toTap' });
      return;
    }
    case 'restock':
      if (tapIndex(f, cmd.drinkId) >= 0) enqueue(c, f, { kind: 'restock', drinkId: cmd.drinkId, stage: 'toCellar' });
      return;
    case 'clear': {
      const tb = f.tables.find((x) => x.id === cmd.tableId);
      if (tb?.dirty) enqueue(c, f, { kind: 'clear', tableId: tb.id, stage: 'go' });
      return;
    }
    case 'breakBrawl': {
      const inc = f.incidents.find((x) => x.id === cmd.incidentId);
      if (!inc) return;
      // Brawls jump the queue: the owner drops what they're carrying.
      const o = owner(f);
      if (o.task && o.task.kind !== 'brawl') {
        o.queue.unshift(o.task);
        releaseTask(f, o);
      }
      if (inc.claimedBy && inc.claimedBy !== o.id) inc.claimedBy = 0;
      o.queue = o.queue.filter((q) => !(q.kind === 'brawl' && q.incidentId === inc.id));
      o.queue.unshift({ kind: 'brawl', incidentId: inc.id, stage: 'go' });
      return;
    }
    case 'catchThief': {
      const p = f.patrons.find((x) => x.id === cmd.patronId);
      if (!p || p.state !== 'sneaking') return;
      const o = owner(f);
      if (o.task && o.task.kind !== 'thief') {
        o.queue.unshift(o.task);
        releaseTask(f, o);
      }
      if (p.claimedBy && p.claimedBy !== o.id) p.claimedBy = 0;
      o.queue.unshift({ kind: 'thief', patronId: p.id, stage: 'go' });
      return;
    }
    case 'greet': {
      const p = f.patrons.find((x) => x.id === cmd.patronId);
      if (p && p.state === 'waiting' && !p.greeted) enqueue(c, f, { kind: 'greet', patronId: p.id, stage: 'go' });
      return;
    }
    case 'cancelQueue': {
      const o = owner(f);
      o.queue = [];
      releaseTask(f, o);
      return;
    }
    case 'ringBell': {
      const cal = calNow(w, c.time);
      if (cal.phase !== 'lastCall' || f.lastCallRung) return;
      // Doors close: nobody new comes in, the queue goes home without hard feelings,
      // and everyone inside gets one last round, which carries on past the end of the shift.
      f.lastCallRung = true;
      for (const p of f.patrons) {
        if (p.state === 'waiting' || p.state === 'arriving') leave(w, c, f, t, p, false, true);
        else p.drinksLeft = Math.min(p.drinksLeft, 1);
      }
      fx(w, 'bell', 8, 3);
      log(w, 'event', `Last Call at ${t.name}: doors closed, serving the last orders.`, t.city);
      return;
    }
  }
}

// ---------------------------------------------------------------- tick

export function stepFloor(w: World, c: Content): void {
  const f = w.floor;
  if (!f) return;
  const t = w.taverns[f.tavernId];
  if (!t) return;
  const cal = calNow(w, c.time);
  const key = shiftKey(cal);
  if (key !== f.shiftIndex) {
    // A new shift (or the Holiday Keg) begins: settle stragglers from the last one.
    settleShift(w, c, f, t);
    f.shiftIndex = key;
  }
  spawn(w, c, f, t, cal.phase);
  updatePatrons(w, c, f, t, cal.isNight);
  for (const inc of [...f.incidents]) if (w.tick >= inc.deadline) failBrawl(w, c, f, t, inc);
  updateWorkers(w, c, f, t, cal.isNight, w.focus.view === 'floor');
  f.patrons = f.patrons.filter((p) => p.state !== 'gone');
}

/** Patrons still inside and not on their way out. */
export function patronsInside(f: FloorState): Patron[] {
  return f.patrons.filter((p) => p.state !== 'gone' && p.state !== 'leaving');
}

/** Not ringing Last Call leaves stragglers: a fine (double in Providence) past the first few. */
function strayFine(w: World, c: Content, t: Tavern, inside: number): void {
  if (inside <= 3) return;
  const co = w.companies[t.companyId]!;
  const mult = t.city === 'providence' ? 2 : 1;
  const fine = Math.round(c.floor.lastCallStragglerFine * mult * (inside - 3));
  spend(co, fine, 'other', 'Fines', `Stragglers after closing at ${t.name} (bell not rung)`);
  if (t.city === 'providence' && co.isPlayer) w.institutions.church = clamp(w.institutions.church - 1, -100, 100);
  fx(w, 'thud', DOOR.x, DOOR.y - 1, fine);
}

/**
 * Closing time with people still inside: the doors close as the bell would
 * (fining stragglers if it wasn't rung) and the calendar waits while they finish.
 */
export function closeUp(w: World, c: Content): void {
  const f = w.floor;
  if (!f || f.closingSince !== undefined) return;
  const t = w.taverns[f.tavernId]!;
  f.closingSince = w.tick;
  if (!f.lastCallRung) {
    strayFine(w, c, t, patronsInside(f).length);
    f.lastCallRung = true;
    fx(w, 'bell', 8, 3);
  }
  for (const p of f.patrons) {
    if (p.state === 'waiting' || p.state === 'arriving') leave(w, c, f, t, p, false, true);
    else p.drinksLeft = Math.min(p.drinksLeft, 1);
  }
  log(w, 'event', `Closing up at ${t.name}: the last patrons are finishing.`, t.city);
}

/**
 * End of a shift. Closing time normally waits for everyone to leave; anyone
 * still here (the wait ran out, or the bell was never rung) goes home now.
 */
function settleShift(w: World, c: Content, f: FloorState, t: Tavern): void {
  const inside = patronsInside(f);
  const rung = f.lastCallRung;
  if (!rung) strayFine(w, c, t, inside.length);
  for (const inc of [...f.incidents]) failBrawl(w, c, f, t, inc);
  if (rung) {
    for (const p of inside) {
      if (p.state === 'sneaking') steal(w, c, f, t, p);
      else leave(w, c, f, t, p, false, true);
    }
    for (const p of f.patrons) p.state = 'gone';
    f.patrons = [];
  } else {
    for (const p of inside) {
      if (p.state === 'sneaking') steal(w, c, f, t, p);
      else leave(w, c, f, t, p, false);
    }
    for (const p of f.patrons) p.state = 'gone';
    f.patrons = [];
  }
  f.incidents = [];
  f.lastCallRung = false;
  f.closingSince = undefined;
  for (const wk of f.workers) {
    releaseTask(f, wk);
    wk.queue = [];
    wk.x = wk.homeX;
    wk.y = wk.homeY;
  }
  for (const tb of f.tables) tb.claimedBy = 0;
  for (const tp of f.taps) tp.claimedBy = 0;
}

/** Positions for renderers and tests. */
export function patronPos(p: Patron): Pos {
  return { x: p.x, y: p.y };
}
