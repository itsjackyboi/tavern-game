import type { Content } from '../content/schema.ts';
import { spend } from './economy/ledger.ts';
import { syncFloor } from './floor/floor.ts';
import { clamp, staffAt } from './lookup.ts';
import type { Staff, Tavern, World } from './types.ts';
import { makeStaff } from './world.ts';

// Hiring and managing people. The delegation arc lives here: staff automate
// slices of the floor, managers run whole sister taverns.

export type HireResult = 'ok' | 'cash' | 'full' | 'unknown';

export function hireCost(c: Content, tier: Staff['tier'], manager = false): number {
  const t = c.staff.tiers.find((x) => x.id === tier)!;
  return Math.round(t.hireCost * (manager ? 1.8 : 1));
}

export function hireStaff(w: World, c: Content, t: Tavern, archetype: string, tier: Staff['tier']): HireResult {
  const arch = c.staff.archetypes.find((a) => a.id === archetype);
  if (!arch) return 'unknown';
  if (staffAt(w, t.id).length >= c.staff.maxStaffPerTavern) return 'full';
  const co = w.companies[t.companyId]!;
  const cost = hireCost(c, tier);
  if (co.cash < cost) return 'cash';
  spend(co, cost, 'wages', 'Hiring', `${arch.name} (${tier}) for ${t.name}`);
  makeStaff(w, c, { archetype, tier, tavernId: t.id, stream: 'staff' });
  if (w.floor?.tavernId === t.id) syncFloor(w, c);
  return 'ok';
}

export function hireManager(w: World, c: Content, t: Tavern, tier: Staff['tier']): HireResult {
  const co = w.companies[t.companyId]!;
  const cost = hireCost(c, tier, true);
  if (co.cash < cost) return 'cash';
  spend(co, cost, 'wages', 'Hiring', `A ${tier} manager for ${t.name}`);
  if (t.managerId) delete w.staff[t.managerId];
  const m = makeStaff(w, c, { archetype: 'manager', tier, tavernId: t.id, stream: 'staff' });
  t.managerId = m.id;
  t.attention = Math.max(t.attention, 0.8);
  return 'ok';
}

export function fireStaff(w: World, c: Content, staffId: string): void {
  const s = w.staff[staffId];
  if (!s) return;
  const t = w.taverns[s.tavernId];
  if (t?.managerId === staffId) t.managerId = null;
  delete w.staff[staffId];
  if (w.floor && t && w.floor.tavernId === t.id) syncFloor(w, c);
}

export function trainCost(s: Staff): number {
  return Math.round(40 + 160 * s.competence);
}

export function trainStaff(w: World, c: Content, staffId: string): boolean {
  const s = w.staff[staffId];
  if (!s || s.competence >= 0.97) return false;
  const t = w.taverns[s.tavernId]!;
  const co = w.companies[t.companyId]!;
  const cost = trainCost(s);
  if (co.cash < cost) return false;
  spend(co, cost, 'wages', 'Training', s.name);
  s.competence = Math.round(clamp(s.competence + 0.06, 0, 0.97) * 100) / 100;
  s.morale = clamp(s.morale + 0.05, 0, 1);
  void c;
  return true;
}

export function giveRaise(w: World, staffId: string): boolean {
  const s = w.staff[staffId];
  if (!s) return false;
  s.wage = Math.round(s.wage * 1.15 + 1);
  s.morale = clamp(s.morale + 0.2, 0, 1);
  return true;
}

/** Season rollover: fatigue recovers, morale drifts with pay and workload; the unhappy ask for raises. */
export function seasonStaff(w: World, c: Content): Array<{ staff: Staff; tavern: Tavern }> {
  const asks: Array<{ staff: Staff; tavern: Tavern }> = [];
  for (const s of Object.values(w.staff)) {
    const t = w.taverns[s.tavernId];
    if (!t || t.status === 'closed') continue;
    const tier = c.staff.tiers.find((x) => x.id === s.tier)!;
    const payRatio = s.wage / Math.max(1, tier.wage);
    const target = clamp(0.55 + 0.25 * (payRatio - 1) + (t.rep - 50) / 250 - s.fatigue * 0.35, 0.1, 1);
    s.morale = clamp(s.morale + (target - s.morale) * 0.35, 0, 1);
    s.fatigue = clamp(s.fatigue * 0.35, 0, 1);
    const co = w.companies[t.companyId]!;
    if (co.isPlayer && s.morale < 0.4 && s.raiseAsked < w.tick - 4000) {
      s.raiseAsked = w.tick;
      asks.push({ staff: s, tavern: t });
    }
  }
  return asks;
}

/** Travel fee for moving a staff member to another of your taverns. */
export const TRANSFER_FEE = 15;

export type TransferResult = 'ok' | 'bad' | 'same' | 'full' | 'cash';

/** Moves a staff member (not a manager) to another of the company's open taverns. */
export function transferStaff(w: World, c: Content, staffId: string, tavernId: string): TransferResult {
  const s = w.staff[staffId];
  const to = w.taverns[tavernId];
  if (!s || !to || s.archetype === 'manager') return 'bad';
  const from = w.taverns[s.tavernId];
  if (!from || from.companyId !== to.companyId || to.status === 'closed' || to.status === 'building') return 'bad';
  if (from.id === to.id) return 'same';
  if (staffAt(w, to.id).length >= c.staff.maxStaffPerTavern) return 'full';
  const co = w.companies[to.companyId]!;
  if (co.cash < TRANSFER_FEE) return 'cash';
  spend(co, TRANSFER_FEE, 'wages', 'Staff travel', `${s.name}: ${from.name} → ${to.name}`);
  s.tavernId = to.id;
  s.morale = clamp(s.morale - 0.05, 0, 1);
  if (w.floor && (w.floor.tavernId === from.id || w.floor.tavernId === to.id)) syncFloor(w, c);
  return 'ok';
}
