# Last Call

A real-time tavern strategy game set in the Pintland Isles during the Long Thirst.
You found a tavern in one of four cities and race to become the biggest tavern company in
the Isles before adaptive rivals squeeze you out. You win by **monopoly** (twice the Company
Value of the next-biggest company, instantly) or by **sponsorship** (still #1 when Mayor
Thatcher Sr. reinstates the Drunken Trials at the end of Year 463).

It is a static site built for GitHub Pages.

- Design brief: [`docs/BRIEF.md`](docs/BRIEF.md)
- Build plan and milestones: [`docs/PLAN.md`](docs/PLAN.md)
- Asset credits and licences: [`CREDITS.md`](CREDITS.md)

## Status

The whole game is playable end to end:
- **Tavern floor:** a Diner-Dash layer. Seat, pour, restock, break up brawls, catch thieves, greet VIPs, and ring Last Call.
- **Isles map:** founding sisters, shipping, price boards, the league table, milestones and institution standing.
- **Staff and managers:** hiring, training, raises and morale. Managers answer the inbox for you.
- **Economy:** menu and pricing, auto-restock, the brewing bench (recipe discovery), and loans.
- **Rivals:** adaptive, archetyped rivals and an arch-rival network. They escalate by act.
- **Events:** prompts, crises, holidays, eras, Veilwalker vows and undercurrents.
- **Win or lose:** monopoly (instant), sponsorship at the end of 463, a loss, or bankruptcy. Freeplay ("One More Keg") is offered afterwards.
- **Autosave** and Continue.
- **Audio:** Kenney samples, procedural fallbacks, per-city chiptune, and ducking.
- **Leaderboards:** two boards, Fastest Monopoly and Highest Company Value. They are local until the shared board is deployed (see [`gas/README.md`](gas/README.md)).

The letter and finale text are still clearly marked placeholders.

## Running it

```sh
npm install
npm run dev            # http://localhost:5173
```

URL flags:
- `?debug` marks the run unranked, shows a DEBUG badge and exposes `window.__game` test hooks.
- `?seed=abc` fixes the run seed.
- `?city=aleforge|shanty|providence|roto` forces the home city.
- `?debug&speed=4` runs the sim faster (debug only).
- `?lbmock=ok|fail|slow` swaps the leaderboard for an in-memory mock (tests).

Keys:
- `P` or `Esc` pauses and resumes. Pausing stops the clock and hides the board. Switching tabs or windows also pauses.
- `Tab` switches between the floor and the Isles map.
- `1`–`3` answer the top card. `Q`/`W`/`E`/`C` are quick floor actions.
- `B` rings the bell.
- `S`/`M`/`U`/`K`/`F`/`H` open the staff, menu, build, brew, ledger and help drawers.
- `Ctrl+1`–`4` switches tavern.

Help (`H`) lists these, and has the volume sliders.

`dev.html` (`http://localhost:5173/dev.html`) shows every named sprite.

## Checks

```sh
npm run check          # typecheck, unit tests, validate-content, build, lore-lint
npm run e2e            # Playwright: title → floor, pause, map and drawers, monopoly → leaderboard, save/continue
npm run balance        # bot runs per city and profile (TRACE=1 for a yearly trace)
npm run build-gas      # regenerate gas/Code.gs after editing the template or shared validation
```

- In the Claude Code sandbox, run e2e with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.
- `@playwright/test` is pinned to 1.56.1 to match that Chromium.
- Screenshots land in `tests/e2e/__screens__/`.

## Editing content

All tunable numbers and names live in `src/content/data/`:
- `tuning/time.json`: shift length, start and end year
- `tuning/economy.json`: the monopoly ratio, starting Duckets
- `cities.json`, `mayors.json`
- `drinks.json`, `ingredients.json`, `segments.json`, `staff.json`, `upgrades.json`
- `rivals.json`, `prompts.json`, `modifiers.json`, `crises.json`, `holidays.json`
- `strings/letter.json`: the opening letter
- `strings/finale.json`: the end-screen text
- `strings/rumors.json`, `strings/winds.json`, `strings/tips.json`: ticker lines

Run `npm run gen-schema` once. VS Code then autocompletes and checks these files, using
`.vscode/settings.json`.

Content rules, enforced by `npm run validate-content` and the tests:
- **No description or lore fields.** Card text is generated from stats. The letter is the only prose file.
- **No post-464 names.** `npm run lore-lint` scans the source and the built `dist/` against `tools/lore/forbidden.json`.

**To drop in the real letter or finale:** edit `src/content/data/strings/letter.json` or
`finale.json`, and set `"placeholder": false`.

## Assets

`npm run fetch-assets` downloads the CC0 packs listed in `tools/assets.config.json` into
`public/assets/`, with each pack's licence. The files are committed, so you only need to
re-run it to add or refresh packs.

## Deploying

The `Deploy to GitHub Pages` workflow publishes `main`. It needs a one-time setting: repo
**Settings → Pages → Source: GitHub Actions**.

## Layout

```
src/sim/        pure deterministic simulation (no DOM, Phaser, Math.random or Date; enforced by tests/arch.test.ts)
src/app/        real-time loop, pause rules, run clock, test hooks
src/content/    zod schemas, validation, data/*.json
src/bots/       scripted players for balance runs (never bundled)
src/views/      Phaser scenes (render only): FloorScene, WorldScene
src/ui/         Preact HUD, panels, prompt cards, drawers, title, end screen, leaderboards
src/audio/      Web Audio engine, songs, and the audio director
src/leaderboard/ adapters (local, mock, Apps Script), outbox, shared ES5 validation
src/input/      global hotkeys
src/art/        sprite atlas, character composer, per-city themes and palettes
gas/            the Apps Script leaderboard (see gas/README.md)
tools/          fetch-assets, validate-content, gen-json-schema, lore-lint, balance, build-gas
tests/          unit, architecture, lore, asset, Apps Script shim and e2e tests
```
