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

**M0 (scaffold and guardrails)** is done:
- a title screen with the sealed letter (placeholder copy)
- a home-city picker
- a placeholder tavern floor running on the real sim clock
- the pause veil, the CI and Pages workflows, and the lore lint

Gameplay starts in M1.

## Running it

```sh
npm install
npm run dev            # http://localhost:5173
```

URL flags:
- `?debug` marks the run unranked, shows a DEBUG badge and exposes `window.__game` test hooks.
- `?seed=abc` fixes the run seed.
- `?city=aleforge|shanty|providence|roto` forces the home city.

Keys: `P` or `Esc` pauses and resumes. Pausing stops the clock and hides the board. Switching
tabs or windows also pauses.

`dev.html` (`http://localhost:5173/dev.html`) shows every named sprite.

## Checks

```sh
npm run check          # typecheck, unit tests, validate-content, build, lore-lint
npm run e2e            # Playwright: letter → play → floor, pause, dev gallery
```

- In the Claude Code sandbox, run e2e with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.
- `@playwright/test` is pinned to 1.56.1 to match that Chromium.
- Screenshots land in `tests/e2e/__screens__/`.

## Editing content

All tunable numbers and names live in `src/content/data/`:
- `tuning/time.json`: shift length, start and end year
- `tuning/economy.json`: the monopoly ratio, starting Duckets
- `cities.json`, `mayors.json`
- `strings/letter.json`: the opening letter

Run `npm run gen-schema` once. VS Code then autocompletes and checks these files, using
`.vscode/settings.json`.

Content rules, enforced by `npm run validate-content` and the tests:
- **No description or lore fields.** Card text is generated from stats. The letter is the only prose file.
- **No post-464 names.** `npm run lore-lint` scans the source and the built `dist/` against `tools/lore/forbidden.json`.

**To drop in the real letter:** edit `src/content/data/strings/letter.json` and set `"placeholder": false`.

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
src/views/      Phaser scenes (render only)
src/ui/         Preact HUD, title screen, letter, pause veil
src/input/      global hotkeys
src/art/        sprite atlas and per-city palettes
tools/          fetch-assets, validate-content, gen-json-schema, lore-lint
tests/          unit, architecture, lore, asset and e2e tests
```
