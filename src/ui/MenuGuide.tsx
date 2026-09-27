import { useEffect, useState } from 'preact/hooks';
import type { GameController } from '../app/controller.ts';
import { drawer, uiFrame } from './bus.ts';
import { getMode, markGuideSeen, seenGuides } from './guideMode.ts';

// Beginner mode: the first time each menu (or the Isles map) opens, the game
// pauses and a short guide explains what's on it and what each thing measures.

interface Guide {
  title: string;
  intro: string;
  items: Array<[string, string]>;
}

export const GUIDES: Record<string, Guide> = {
  staff: {
    title: 'Staff',
    intro: 'Hire, train and manage the people who work your taverns.',
    items: [
      ['Tavern buttons', 'With more than one tavern, pick which one you’re staffing.'],
      ['Hire table', 'Rows are jobs, columns are skill (Green → Seasoned → Master). The price is the hiring fee; hover it for the wage each season and how skilled they’ll be.'],
      ['Jobs', 'Bartenders pour, servers seat patrons and clear tables, bouncers stop brawls and thieves, cellarers restock taps, fiddlers lift the mood, informants bring news of rivals.'],
      ['Manager', 'Sister taverns only: answers that tavern’s requests and slows how quickly it slips while you’re away.'],
      ['On the payroll', 'Each person reads job, skill, then name.'],
      ['C number', 'Competence, 0–100: how quickly and well they work. Training raises it.'],
      ['Green bar / red bar', 'Morale (green) and fatigue (red). Unhappy or tired staff work slower.'],
      ['◉ number', 'Their wage, paid at the end of every season.'],
      ['Train · Raise · Move to · Fire', 'Train adds competence; a raise costs more wage but lifts morale; Move sends them to another of your taverns; Fire asks you to click twice.'],
    ],
  },
  menu: {
    title: 'Menu & prices',
    intro: 'What’s on your taps and what you charge for it.',
    items: [
      ['Each drink', 'Name in its own colour. Q is its quality (0–100); higher quality pleases patrons, and Aleforge cares about it most.'],
      ['Price slider', 'From 60% to 180% of the list price. Next to it: the price of one pour, what a keg costs you, and your margin (profit on each pour).'],
      ['Tags', '“contraband” sells but draws the wardens; “night only” sells after dark only.'],
      ['Cellar and +keg buttons', 'Kegs waiting in the cellar, and buttons to order more. Orders arrive after a short wait.'],
      ['Selling', 'For each drink on tap: its share of orders, how many of today’s patrons like it, and whether its price feels cheap, fair, steep or very steep. Adjust the price sliders above to match.'],
      ['Known recipes', 'Drinks you can pour but aren’t: add one when a tap is free.'],
      ['Restock policy', 'Auto-order keeps this many kegs of each drink in the cellar. It never borrows money.'],
    ],
  },
  upgrades: {
    title: 'Build',
    intro: 'Improve this tavern, or the whole company.',
    items: [
      ['Top line', 'Tables (two seats each), taps, and decor (how inviting the room is).'],
      ['Each upgrade', 'What it does, how many you own out of the most you can have, and its price.'],
      ['Company', 'These apply to every tavern you own, now and later.'],
    ],
  },
  research: {
    title: 'Brewing bench',
    intro: 'Discover new recipes.',
    items: [
      ['Ingredients', 'Pick two and brew. Each attempt costs Duckets. A pairing that works gives a new recipe; one that doesn’t is crossed off.'],
      ['Your recipes', 'Everything you can pour. New discoveries are marked NEW.'],
      ['Spiritweed', 'A rare ingredient that only comes from Veilwalker vows.'],
    ],
  },
  finance: {
    title: 'Ledger',
    intro: 'Where your money came from and where it went.',
    items: [
      ['Money in / out', 'Totals by reason for the whole run.'],
      ['Year chart', 'Income, spending and profit for each year.'],
      ['Latest money in and out', 'Every recent payment and why (drink sales are left out, there are too many).'],
      ['Recent decisions', 'What each decision you answered actually did.'],
      ['Moneylender', 'Borrow when cash is short. Interest is charged every season until you repay.'],
      ['Grain source', 'Where your barley comes from: cheaper or better, and some sources earn favor.'],
    ],
  },
  network: {
    title: 'All your taverns',
    intro: 'Every tavern you run, side by side. Click a column to sort, a row to open its report.',
    items: [
      ['Rep', 'Reputation (0–100) and whether it’s rising ▲ or falling ▼.'],
      ['Season / Last', 'Profit so far this season (rent and wages are paid at the end), and last season’s profit.'],
      ['Served · Walkouts · Happy', 'Drinks served, the share of visitors who gave up and left, and how happy visits were.'],
      ['Staff · Service', 'Who works there, and how fast it serves while you’re away (a visit resets it).'],
      ['Issues', 'Anything that needs you: dry taps, nobody to serve, struggling and more.'],
    ],
  },
  city: {
    title: 'A town',
    intro: 'Click any town on the Isles map to see it.',
    items: [
      ['Your tavern there', 'Its report: what needs attention, reputation, this season’s numbers, taps and cellar, staff, requests and supply lines, all without going there.'],
      ['Found a tavern', 'If you don’t have one there yet: the cost, free lots, and the reputation you need.'],
      ['Price board', 'What ingredients cost in this town right now, and which way prices are moving.'],
      ['Taverns', 'Every tavern in town and its share of the patrons.'],
      ['Ship kegs here', 'Send kegs by sea from another of your taverns. Voyages can be lost; insurance pays you back.'],
    ],
  },
  world: {
    title: 'The Isles map',
    intro: 'The four towns of the Isles. Press Tab to go back to your floor.',
    items: [
      ['Towns', 'Aleforge, Shanty Town, Providence and Roto Kaiishi. Click one to see its prices, taverns and whether you can found a tavern there.'],
      ['Your taverns', 'Marked on the map; the list on the right shows how each is doing.'],
      ['Ships', 'Kegs at sea between your taverns.'],
    ],
  },
};

export function MenuGuide({ ctrl }: { ctrl: GameController }) {
  void uiFrame.value;
  const [open, setOpen] = useState<string | null>(null);
  const view = ctrl.world.focus.view;
  const which = drawer.value && drawer.value !== 'help' ? drawer.value : view === 'world' ? 'world' : null;
  // Beginner mode only; never in the tutorial, and not in debug runs unless asked (?guides).
  const on = !ctrl.tutorial && getMode() === 'beginner' && (!ctrl.debug || new URLSearchParams(location.search).has('guides'));

  useEffect(() => {
    if (!on || !which || open || !GUIDES[which] || seenGuides().has(which)) return;
    markGuideSeen(which);
    setOpen(which);
    if (!ctrl.paused) ctrl.pause('guide');
  }, [which, on, open]);

  const close = () => {
    setOpen(null);
    if (ctrl.paused === 'guide') ctrl.resume();
  };
  // Closing the menu closes its guide.
  useEffect(() => {
    if (open && which !== open) close();
  }, [which, open]);
  useEffect(() => () => { if (ctrl.paused === 'guide') ctrl.resume(); }, []);

  const g = open ? GUIDES[open] : null;
  if (!g) return null;
  return (
    <div class="menu-guide" role="dialog" aria-label={`${g.title} guide`} data-testid="menu-guide">
      <div class="mg-head">
        <span class="mg-tag">New here?</span>
        <b>{g.title}</b>
      </div>
      <p class="mg-intro">{g.intro}</p>
      <dl class="mg-items">
        {g.items.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div class="mg-actions">
        <span class="small muted">⏸ Paused while you read</span>
        <button class="btn btn-primary btn-small" onClick={close} data-testid="menu-guide-ok">Got it</button>
      </div>
    </div>
  );
}
