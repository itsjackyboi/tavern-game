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
- **Leaderboards:** top tens for Fastest Monopoly and Sponsored the Trials, in pre-release (v1.x) and official (v2.0+) eras. They are shared through a Google Sheet (setup: [`gas/README.md`](gas/README.md)).

All end-screen text is final.

### v1.18
- **Tutorial:**
  - It runs with 5× timers, so patrons and decisions wait much longer.
  - Each new lesson pauses the game until you press "Got it, let me try".
- **Beginner / Experienced** (home screen, next to Timers):
  - **Beginner:** the first time you open each menu (Staff, Menu, Build, Brew, Ledger, Taverns, a town, and the Isles map), the game pauses and a short guide explains what's on it and what each number measures.
  - **Experienced:** plays as before.
  - A note says it doesn't change the difficulty. "Show the menu guides again" resets them.
- The home screen no longer squashes the letter on shorter windows.

### v1.17
- **The Long Thirst page** moved to the bottom-left of the **title screen**, so players get the context before they start. It ends with "Only time will tell when a Liquor King will return to the throne."

### v1.16
- **The Long Thirst:** a torn page from the Hoegaarden Hall of Records sits in the bottom-left corner of the board. Click it to read a short record of how the Isles lost their Liquor Kings: Ofkra abolished the Drunken Trials in 412, and Aleforge has been left to its mayors since. The game waits while you read (Esc or a click outside closes it). The text lives in `src/content/data/strings/records.json`.

### v1.15
- **Losing screen:** if you had the bigger Company Value but still lost, it says which towns you weren't established in. The sponsor has to be established in all four.

### v1.14
- **Losing screen:**
  - It says "{winner} was the bigger company." (the line about not being established is gone).
  - It shows your Company Value next to the winner's, and the difference between them.
- **Bankruptcy screen:** "The creditors came knocking and took everything, even the last drop of brew is gone." The game has no placeholder text left.

### v1.13
- **Losing screen:** "Thomas Thatcher Sr. has a favorite brew...and its not yours." It then says the Trials are revived in 463 and **names the company chosen as sponsor**. The bankruptcy screen is the only placeholder left.

### v1.12
- **Switch taverns into the thick of it:** walking into a tavern now shows it as busy as its crowd.
  - Patrons are already waiting on drinks, some about to order, and a line at the door, with a table or two to clear.
  - The line you leave behind isn't counted as walkouts; it's still there if you come straight back.
  - Patrons caught mid-visit no longer leave as if they'd been served badly (that quietly cost reputation on every switch).
- **Keys:**
  - **1–4** switch taverns.
  - **Shift+1–4** answer the top decision; the card shows ⇧1, ⇧2…
- **Staff lists** show **job, skill (Green / Seasoned / Master), then name**, sorted by job and then skill (master first): bartenders, servers, bouncers, cellarers, fiddlers, informants. This applies to the Staff drawer, the left panel and tavern reports.

### v1.11: the pace keeps building
- **The flagship keeps its pace:** while you tend a sister, your household keeps the flagship's bar going and its service never slips. You come back to the same crowd.
- **Sisters build up:** a new sister starts at about half your flagship's pace and builds up to it over its first two seasons (struggling taverns lose the lift).
- **Word of mouth:** every tavern you have open brings 6% more patrons to all of them, so the game gets busier as you grow.
- **Balance:** skilled bots won 8 of 8 runs and average bots 7 of 8, with monopolies at about 59–66 minutes (before: skilled 7 of 8, average 3 of 4).

### v1.10
- **Right panel layout locked**, top to bottom:
  1. Inbox, at a fixed size, shown even when empty
  2. Company Value
  3. Your taverns
  4. A fixed area where decisions appear
- Nothing shifts when requests or decisions arrive.

### v1.9: running several taverns
- **Your taverns** (right panel, under Company Value) shows each tavern's status, reputation (with trend), profit this season, and its staff as icons.
  - A row **flashes red with a chime** when there's a problem there: a dry tap with nothing coming, nobody to serve, struggling, shut by a crisis, or reputation falling fast.
  - Amber rows are worth a look but aren't urgent.
  - The tavern tabs top-left get a red dot too.
- **Inbox pinned:** it has its own strip at the bottom, so requests never push Company Value down.
- **Tavern report:** click a row, or a town you own on the Isles map, to see everything about a tavern without going there:
  - what needs attention and how to fix it
  - progress to Established
  - reputation and trend
  - this season's numbers and last season's profit
  - taps and cellar, with +1 keg and auto-restock
  - staff and attention
  - its requests, answerable there
- **Remote staff:** the Staff drawer (S) picks any of your taverns. Hire, train or fire there, or **move** someone between taverns for a 15◉ travel fee.
- **Supply lines:** keep a tavern stocked with a drink from another of yours. Spare kegs go by sea; if there are none, they're bought at the source, never on credit.
- **All your taverns (N):** every tavern side by side, sortable, with totals.
- **Season report:** with two or more taverns, each season closes with a card per tavern showing profit, reputation change and its biggest problem.

### v1.8
- **Intro letter:** it now sets the scene. It's Year 448, there has been no Liquor King for 36 years (since Ofkra), and Glendolph Galleyway runs Aleforge.
- **Leaderboard test run:** a manual Actions workflow ("Leaderboard test run") sends one labelled test run to the sheet to check the connection.

### v1.7
- **Reputation box** on the left, between Rivals here and Word around the Isles. It shows the current tavern's reputation (0–100) with a marker at 40 (the sister-tavern bar), and whether it has been **rising, falling or steady** over the last minute, with a small trend line. With several taverns it also shows your network average. It replaces the small number on the tavern tab.
- **Home page:**
  - The example names are now "Jack_Anqoak" and "The Gilded Tankard".
  - The Timers dropdown (whose text was cut off) is now three buttons: Standard, Assisted ×1.5 and Assisted ×2. A note under them says what the chosen option changes.
- **Shared leaderboard connected:** finished runs now go to the Google Sheet, and the in-game Leaderboards show the shared top tens.

### v1.6
- **How to play pauses the game** while it's open (no veil, so you can read it). Close it with H, Esc or ✕ and play carries on.
- **New How to play sections:**
  - **Reputation:** what raises and lowers it.
  - **Sister taverns:** the rep 40 bar, founding, getting established, struggling and closing.
  - **The four towns and their taverns:** costs, lots, rivals and informants in each.

### v1.5
- **Shared leaderboard, like the Mario board:**
  - Every finished run is logged to the Google Sheet's `runs` tab.
  - The game shows a top ten for Fastest Monopoly and a top ten for Sponsored the Trials (by Company Value).
  - v1.x runs are pre-release records; from v2.0 they're official.
  - Setup is in [`gas/README.md`](gas/README.md).
- **Home page:** big "Who's pouring?" fields for your innkeeper name and tavern name. Both are remembered and shown on the boards. Runs are recorded automatically when they end.
- **Closing time:** the season no longer moves on while patrons are still inside.
  - The doors close and the calendar waits (up to 45 s) for the last of them.
  - Without the bell, stragglers are still fined.
- **Clearer decisions:** options whose only effect is a cost say what they do, e.g. "Post extra doormen: the gang is kept out". The hired-thugs decision is reworded.

### v1.4
- **New brews:** discovering a recipe at the brewing bench plays a chime and shows a big notice in the drink's own colour. The new recipe is marked NEW at the top of Your recipes. A batch that finds nothing just says so, without an error.

### v1.3
- **Letter and win screens:**
  - The real opening letter from Gregor Ashford.
  - The State-sanctioned monopoly and Drunken Trials win screens, with your company's name, total time, Company Value and Return to menu.
  - The loss and bankruptcy screens still use placeholder text.
- **Word around the Isles:**
  - Bigger, with tags (Intel / Rumour / News / Alert) and fresh lines glowing.
  - Rival intel depends on your informants: none (only vague gossip in your own city), green, seasoned or master.
  - Seasoned and master informants file a report on local rivals each season; master reports include their purses and plans.
  - An informant covers its own city fully and your other cities one level lower.
  - Rivals don't go easier on you without an informant; you just hear less.
- **Fix:** a season's profit was announced twice (again when the Holiday Keg ended). Each season is now announced once, and a year summary is added.

### v1.2
- **Where the money goes:**
  - Every Duckets movement is filed under a reason.
  - Money in (blue) and out (orange) pops up at the bottom of the board with the reason, e.g. "−140 Rent, The Last Call (season end)".
  - The Ledger shows whole-run totals by reason, a year-by-year profit-or-loss chart, the latest transactions, and recent decisions with what they did.
- **Auto-restock** no longer orders kegs on credit. It used to be able to push you 75 Duckets into debt.
- **Decisions:**
  - They sit bottom-right, bigger, with a chime and a seconds countdown.
  - Every choice lists its effects before you pick.
  - A receipt afterwards shows what actually happened, including when time ran out.
- **Drinks:** every drink has its own colour (checked distinct), used on taps, order bubbles and lists.
- **Brew tab:** shows how each drink on tap is selling: share of orders, who likes it, and how patrons feel about its price.
- **Pausing** dims the board instead of hiding it.
- **Fix:** the news feed on the left now updates live.

### v1.1
- **Layout:**
  - Decision cards sit at the bottom-left, under the news feed. They no longer push the Company Value list around.
  - The Company Value list shows every company, yours highlighted.
- **Warnings:**
  - Big toasts across the top of the board. Repeats merge; click one to dismiss it.
  - Standing banners for being out of Duckets, low on Duckets, in debt, facing bankruptcy, or a dry tap.
- **Last Call:** ringing the bell closes the doors. Patrons inside get their last orders, even past the end of the shift, and a notice says so.
- **Tutorial:** a guided first shift from the title screen. It covers the controls only and gives no strategy advice. Tutorial runs are unranked and never overwrite your saved run.
- **Pause menu:** How to play, fullscreen, sound, and Save & return to title.
- **Smaller improvements:**
  - A version tag in the bottom-right corner.
  - Tables glow green or red while you're seating someone.
  - A floor-trouble badge on the map button.
  - A season profit toast.
  - Confirmations before firing staff or abandoning a saved run.
  - The title screen remembers your city, name and timers.

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
- `P` or `Esc` pauses and resumes. Pausing stops the clock and opens the menu. Switching tabs or windows also pauses.
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

Bump `APP_VERSION` in `src/version.ts` (v1.1 → v1.2 …) on each publish.

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
