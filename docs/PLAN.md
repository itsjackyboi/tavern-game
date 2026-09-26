# Last Call: a Long Thirst tavern RTS (build plan)

## Context

The repo `itsjackyboi/tavern-game` is empty (no commits) on branch `claude/nice-hopper-fvq71l`. The user gave a long design brief for **Last Call**. It is a static-site, GitHub Pages–hosted, pixel-art real-time tavern strategy game set during the Long Thirst of the Pintland Isles.

This plan does three things. It restates the scope, records the decisions the user made during planning, and lays out a milestone build order. A later execution session (Opus 5.5 "high") works from it. The plan draws on:
- the Master Lore Compendium
- the Hoegaarden Hall of Records (almost entirely post-464, so it is barely usable)
- the Pintland Economy Pitch
- the user's `Mario` repo (Google Sheets leaderboard) and `TD-PINT` repo (Kenney asset pipeline, headless sim and bot, Playwright tests)

**First action of the execution session (M0):** commit this plan as `docs/PLAN.md`. Commit the user's original brief, verbatim from the conversation, as `docs/BRIEF.md`. Commit the attached reference map as `docs/reference/pintland_map.jpg`; it is used only for geography and never shipped in the build. Commit and push to `claude/nice-hopper-fvq71l` after every milestone. Don't open PRs unless asked.

---

## 1. Decisions locked with the user

| Topic | Decision |
|---|---|
| **Time scale** | **1 shift = 1 season. Late-era start.** The run starts at **Year 448, Stormtide** and runs to the **end of Year 463**: 16 years, 48 season-shifts plus 16 short Holiday Kegs, about 54 min of sim time. All tunable. |
| **Goal and score** | **The goal is to become the biggest tavern company in the Isles in the shortest time.** Size is measured by one number, **Company Value (CV)** (§2.6). CV is computed the same way for the player and every rival company, and is always visible as a rank. The score is **date-independent**: the leaderboard ranks by **run-clock time to "Top Tap"**, the moment you became the biggest company. The in-game year is display only. |
| **Win / lose** | **The verdict comes at the end of Year 463.** If you are established in all four cities and hold the **#1 CV**, Mayor Thomas Thatcher Sr. picks your company to sponsor the reinstated Drunken Trials and the finale plays. Otherwise another company is chosen and the run is lost. Bankruptcy also ends the run. **A leaderboard entry needs both** a Top Tap time and being chosen at 463. Reaching the top and then losing the lead does not count. |
| **Freeplay** | After the Year-463 verdict, the player may continue in **Freeplay** ("One More Keg", like Civ's "one more turn"). If they were *not* chosen, show a clear note: *they did not achieve the sponsorship, and the run is not on the leaderboard.* |
| **Pause** | **The clock stops and the board is hidden.** Manual pause, a hidden tab and window blur all freeze the sim and the ranked clock, and veil the play area. Resuming after closing the tab restores the save paused. Pause and session counts are recorded for transparency but not penalised. |
| **Rival race** | Every rival company has a CV. The strongest (the "arch-rival network") expands into all four cities and competes for #1 CV. |
| **Assets** | **Use real CC0 packs.** Kenney, OpenGameArt and itch.io CC0 packs, plus CC-BY only with attribution. The execution container can reach those sites. The public GitHub mirror `series-ai/jam-ready-assets` (318 CC0 packs, including Kenney and Pixel-boy's *Ninja Adventure* with CC0 music) is also reachable, even from this planning container. |
| **Background sim** | Unfocused taverns keep running as a simplified aggregate sim. This follows the user's lean. |

**Defaults I chose for the remaining open questions** (the user can override):
- **Leaderboard columns:**
  - rank by **Top Tap time** (run clock, mm:ss)
  - Mario-style **splits**: first sister, third sister, first time #1 in CV, Top Tap
  - **final CV** at 463, used as the tiebreak
  - **peak CV**
  - home city
  - Categories: overall, per home city, Assisted (extended timers), NG+.
- **After Top Tap is stamped:** the time is locked in. The player may speed the sim up to 2× or 4× to reach the 463 verdict faster, but still has to hold the lead. Speed-up is never available before the stamp.
- **Currency:** "Duckets" (from the Economy Pitch). Shanty Town also has Favor (barrels).
- **Finale:** Thatcher Sr. proclaims the Trials' return and names the player's network sponsor. No winner of any Trials is ever shown. There is no reference to the six-way tie beyond "the Trials will be held".
- **Freeplay past 463:** the calendar keeps counting generically. No new mayors, eras or post-464 content.

---

## 2. Scope restated (game design summary)

### 2.1 Run structure and time
- **Sim:** 20 Hz fixed step. The initial tuning lives in `content/data/tuning/time.json`:
  - One **season-shift** is about 65 s (1300 ticks). Each season is one representative day and night:
    - Stormtide and Goldsun: **day** for the first ~60%, then the **Hangover bell**, then **night**. A short **Last Call** ritual ends the shift.
    - **Veilfrost is entirely night** (canon: 117 days of night). Providence is in wild mode for the whole shift, Roto's after-dark taboo market is open all shift, and Veilwalker activity peaks.
  - The **Holiday Keg** (~8 s) comes at year end:
    - The Hoppy Holidays pirate rush at the Shell Tavern boosts Shanty Town.
    - Annual bookkeeping: the Roto flat fee, licences, the yearly ledger strip.
    - It is also a bell-timing mini-game. Ring too early and you lose sales; ring too late and you get brawls, or fines in Providence.
- **Season character:**
  - Stormtide: fewer arrivals, patrons linger, shipping risk.
  - Goldsun: peak trade, calm seas.
  - Veilfrost: night; rowdy, high spend; omens.
- **Acts:**
  - **Act I, 448–451 (Mayor Galleyway).** Found and grow the flagship. Rivals are local and passive.
  - **Holiday Keg 451: Aleforge mayoral election.** Thatcher Sr. wins, as in canon. The player's Aleforge standing can shift voting-group moods.
  - **Act II, 452–459 (Thatcher Sr., the "old ways" revival).** Expansion. Rivals scout, sabotage and expand. Thatcher's revival raises Aleforge demand for craft and traditional ales, which feeds CV through the market.
  - **460: Thatcher Sr. announces the Trials will return and that a tavern network will sponsor them.** Act III starts: the public sponsorship race, with rivals at maximum escalation.
  - **End of 463:** the verdict, then the finale or the loss screen, with Freeplay offered.
  - The mayor years are **not canon**. They live in `content/data/mayors.json`.
- **Skilled-player target:** Top Tap around the 30–42 min mark. Experts reach it around 25 min. The rest of the run is spent defending the lead, optionally sped up.

### 2.2 The four home cities
Each city has a starting buff and nerf and its own rules hook, `CityRules`.

**Aleforge.**
- Buff: Brewers' Lane discount and +ale quality.
- Nerf: highest rent and the highest rival density (4 rivals).
- Reputation is weighted toward craft actions: new recipes, aging, and the Hall of Ale / "Beckoning the New Brews" competitions.
- **Canon hook:** the *Shorelan ban*. ClockHeart Tonic is contraband in Aleforge in this era. It has high demand but carries raid and fine risk.
- Patron segments are the canon voting groups: Farmers, Brewers, Craftsmen, Traders, Miners, Pirates.

**Shanty Town.**
- Buff: a parallel **Favor** currency ("a room? a barrel") and large pirate tips.
- Nerf: brawls are more frequent and more damaging, and the **Windsunk Council** makes tribute demands.
- It has **5 factions with conflicting tastes:**
  - Tide Callers
  - Coral-eyed
  - Ashen Oath: anti-grog fanatics. Ignoring them raises arson risk.
  - Captains & Crews
  - Drifters
- Crash-your-ship rite decor.

**Providence.**
- Buff: high-ticket, low-theft patrons (Apostles).
- Nerf: the Church of Patmos sets a sanctioned menu, a tithe skim is automatic, and Friar inspections can close you temporarily.
- **Day/night flip:** orderly and tonic-driven by day, wild and thirsty after the Hangover bell. Staffing and menus differ by phase.
- Castes appear as patrons, staff or inspectors: Apostles, Friars (inspectors), Sextons (cellarers who pilfer), Circs (tonic brewers), and rare Kalifart VIPs.
- Cheap brewing equipment; Providence exports brewing tools.

**Roto Kaiishi.**
- Buff: no sales tax, only a flat yearly fee paid at the Holiday Keg. Exotic ingredients: spices, silks for decor, and **red-earth mineral** for tonic.
- Nerf: theft, counterfeit Duckets and price manipulation.
- **Taboo system:** taboo goods sell only through the underground channel at night.
- **Price volatility:** supply shocks elsewhere hit Roto's prices within the season.
- Pirates never raid Roto shipping. The ruler is "the Magnate" (unnamed).

### 2.3 Two views, one economy
- **Tavern floor (zoomed in).** A warm, dense interior at 16 px tiles on a 480×270 logical canvas with integer scaling. This is the Diner-Dash layer:
  - The avatar has an action queue: seat by drag, pour, deliver, restock kegs, break up brawls, catch thieves, greet VIPs.
  - Named regulars, same-town rival owners and thugs appear as special patrons.
  - Suppliers and faction standing show patron by patron.
  - Staff are dragged onto stations or assigned by hotkey.
  - Only the **focused** tavern runs agent-level simulation.
- **World map (zoomed out).** A cooler, schematic overworld with nodes and routes. Relative geography follows the reference map:
  - Providence: north.
  - Roto Kaiishi: northeast, offshore.
  - Shanty Town: central-east coastal cliffs on the Gulf of Aleforge, reached from Providence via Blodello Bridge.
  - Aleforge: an east-coast island cluster.
  - John Cum's Cumstead: south-central inland, a supplier node.
  - Breakback Mountains, Whiskey Shallows and Brandywine Brush form the backdrop.
  - Omitted: the Mansion, Vodkonia, Sodomire Gaol, Fenwick (the Veilwalkers stay off-map), the Observatory, Name.
  - Functions:
    - shipments along routes
    - per-city price boards (Roto volatility is most visible here)
    - per-tavern autonomous buy/sell and menu policy
    - institution standings: Patmos, Windsunk, the Roto market, Cumstead, Aleforge City Hall
    - founding sisters
    - the managers' decision inbox
    - sister tracker 0–3, CV league table (all companies), milestone ladder, run clock
- **Switching** is instant: `Tab`, a HUD button, or the mouse wheel (zoom out past a threshold for the world; zoom in on a node to focus that city's tavern). A quick zoom or fade transition plays, with distinct audio states. Each view shows a slim strip of the other view's key numbers.
- **In world view the focused floor keeps running with staff only**: the avatar is "in the office". Incidents surface as edge alerts with a jump hotkey. Early solo play therefore punishes looking away; this *is* the delegation arc.

### 2.4 Core loop and decision layers
- **Reflex layer (1–5 s):** in-world incidents drawn on the canvas at the character involved: thief, brawl, VIP greet, dry keg, spill. At most 3 incidents at once. The governor only caps; it never rubber-bands against the player.
- **Tactical layer (10–30 s):** DOM prompt cards shown in either view with a tavern/city badge.
  - At most 2 are visible.
  - Hotkeys `1`–`3` answer the top card and `` ` `` cycles between cards.
  - Countdown bars are CSS animations measured in sim ticks, so they freeze on pause.
  - If ignored, a card auto-resolves to its default. The default is always the worst or second-worst option, and content lint enforces that.
- **Strategic layer (minutes):** menu and pricing policy, brewing and stocking, recipe discovery, supplier contracts, expansion, and spending influence. These are mostly world-map panels plus the manager inbox; the floor view shows a badge only.
- **Always-on HUD** (icons and bars, no sentences):
  - Duckets, plus Favor where relevant
  - stock fill bars per key ingredient
  - reputation: local, plus the network total
  - staff morale and fatigue chips
  - per-rival pressure meters (colour-shifting)
  - run clock, Year/Season, sister tracker 0/3
  - Company Value, CV rank, and the race bar against the top rival
  - the Cultural Winds vane
- **Last Call ritual** at the end of each shift: close tabs, click out stragglers, stock-count flash. It is occasionally a real decision, e.g. a VIP wants one more round past close, with a Friar or Council penalty risk.

### 2.5 Staffing and delegation arc
- **Early:** solo. The avatar does everything; this is peak APM.
- **Mid:** hire lore-named archetypes and assign them to stations. Examples:
  - Brewers' Lane Tapster (bartender)
  - Keeldrift Runner (server)
  - Rum Ridge Bruiser (bouncer)
  - Sexton Cellarer (stock; skims)
  - Circ Distiller (brewing)
  - Tide Caller Fiddler (entertainment)
  - Drifter Informant (intel)
- **Staff stats:** competence, speed, morale and fatigue, plus wages. Invest in them through training, raises and conditions.
- **Late:** a near-autopilot flagship lets attention move to the world map.
- **Delegation is a real trade-off.** Staff and managers run at `delegationEff` ≈ 0.90–0.95 of skilled play. The player also gets an "Owner's Touch" bonus on personally served orders.
- A **manager** is the same system at whole-tavern scale. Managers execute policy and answer inbox items using their own default choices; quality scales with competence.

### 2.6 Sister locations, Company Value and Top Tap
- **Founding happens on the world map.** It needs Duckets, network reputation, and a free **lot/licence**. Each city has a limited number of lots, and rivals race for them.
- A new sister then chooses its layout and appoints a manager.
- **Lifecycle:** building → establishing → established, or struggling → closed.
- **Neglect** decays an attention meter, which is buffered by manager competence. Genuine neglect leads to closure.
- **Company Value (CV)** is the single size metric, measured in Duckets. It has the same formula for the player and every rival company:
  - cash
  - tavern asset value: fixtures, upgrades and capacity, depreciated
  - stock at market prices
  - 3 × trailing-year net profit (an earnings multiple)
  - brand value: Σ tavern rep × city market size
  - minus debt
- **HUD:** CV and your **CV rank among all companies**, plus a small race bar against the top rival. Rival CVs are shown with intel-dependent noise.
- **Milestone ladder** (each step is timestamped on the run clock and becomes a leaderboard split): Taproom → Alehouse Chain (first sister) → Two-City Concern → Four-City Company (third sister) → **#1 in CV** → **Top Tap**.
- **Top Tap criteria** (draft; tunable):
  - The flagship and 3 sisters are all *established*.
  - Every sister has rep ≥ 50 and non-negative profit over the trailing year.
  - The flagship has rep ≥ 75.
  - Your CV is ≥ 1.10× the next-biggest company.
  - All of this **holds for 3 consecutive seasons**. The clock is stamped when the hold completes.
- **Sponsorship at 463** goes to the company that is established in all four cities and has the highest CV. There is no separate standing formula, so "biggest company" and "chosen sponsor" can never disagree. The arch-rival network races on CV too.

### 2.7 Rival AI (adaptive, archetyped)
- **Setup:**
  - Rival taverns per city: Aleforge 4, Shanty 3, Providence 2, Roto 3. They have invented, lore-flavoured names.
  - Archetypes: Undercutter, Quality Snob, Brawler/Intimidator, Briber.
  - One **arch-rival network** is always a race candidate.
- **Player tracking:** EMAs of the player's revenue share per bucket, where buckets are (drink category | price band | segment) × city.
  - Two EMAs per bucket: fast (½ yr) and slow (3 yr).
  - `threat = fast × (1 + max(0, fast − slow)/slow)`.
  - Rivals see the threat values with noise ∝ (1 − their knowledge of that city).
- **Decisions every ~0.1 year:**
  - `U = w_archetype[a] × threat_b × fit × aggression − cost/cash − risk + tierBonus`.
  - Choice is a softmax whose temperature falls each Act.
- **Escalation tiers:**
  - **T0:** price, quality and marketing, locally.
  - **T1** (Act II, or the player has 2+ taverns): scouting, rumours, poaching, thugs, bribing Friars or the Council.
  - **T2** (Act III, or the player has any sister): opening sisters in the player's target cities.
- **Mood state machine:** confident → pressured → **desperate**. Desperate rivals use loss-leader prices, sabotage, and bribes to your low-loyalty staff (who become moles). From there a rival may recover, collapse, or be merged into a same-city rival that becomes tougher.
- **Information asymmetry is the difficulty lever.** Each action is telegraphed as intel or rumour, and its fidelity falls as rival secrecy rises each Act. The player can buy intel: informants, gossiping staff, loyal regulars.

### 2.8 Long-reach systems ("Undercurrents")
These are hidden variables, visible in the dev overlay.

| Variable | Driven by | Effect |
|---|---|---|
| `church[city]` | Pious items and Apostle trade raise it; tonic, grog and spirits lower it | ≥40: Apostle patrons appear. ≥60: tithe levies spread. ≥80: menu edicts and Friar shutdowns. Low in Providence: reform chain. |
| `cumstead.dependency`, `farmerTension` | Network grain share, price squeezing | Price hikes, then a fair-price chain, then embargo and strike crisis weight |
| `veilGoodwill` | Honouring or neglecting vow-trades, e.g. "no fish on Night of the Earthen Veil", "one keg poured to the earth each Veilfrost" | Boons (a supply that never runs dry, immunity to one bad-luck event) versus spoilage, shipwreck and brawl modifiers |
| `pirateCulture[city]` | Your Shanty growth rate × Shanty shipping volume | Shifts the patron mix elsewhere: tips up, brawls up |
| `consolidation` | Crushing rivals | Higher merge chance, tougher merged rivals |

**Cultural Winds:** a small vane in the world HUD. At most one gust per season, for the largest recent threshold crossing, with a vague line of text from `winds.json`. It is not a number to optimise.

### 2.9 Crises, era events and holidays
- **Crisis roller:** runs on seasons, on its own RNG stream.
  - Nothing fires in the first 6 seasons, and each crisis is followed by at least a 9-season gap.
  - The hazard rises with eligible time, decays 0.85× per crisis, and is scaled by condition weights. Hard cap: 4 per run.
  - **Monte Carlo test** (10k runs of 48 seasons): P(2–3 crises) ≥ 0.6, P(0) < 0.03.
  - Crises run as multi-stage chains. They fire in the floor view or the world view depending on scope.
- **Initial pool (14):**
  - The Beerchelli Murmurs: prophecy rumours amplify reputation swings.
  - Addy's Sweep: Patmos crackdown.
  - The Windsunk Levy: a town-wide tribute.
  - Taboo Tide: Roto underground raid.
  - Cumstead Blight: harvest shock across the isles, driven by John Cum's volatility.
  - The Veil Turns: omen or boon, depending on goodwill.
  - The Cartel Offer: a rival proposes a truce against a third rival.
  - Rum Ridge Showmen: a travelling troupe offers a big appeal boost at a steep cost.
  - Cellar Flood / Kitchen Fire: triage stock, fixtures or revenue.
  - The Poaching Letter: your star employee is poached.
  - Clipped Duckets: counterfeit-coin scandal.
  - Stormtide Wreckers: a shipping-loss wave.
  - Night of the False Sun: an Ashen Oath arson threat.
  - Shorelan Raid: an Aleforge contraband sweep.
- **Scheduled era events:** the 451 election, the 460 Trials announcement, the 463 verdict.
- **Holidays:** at most one featured holiday per season, each a light modifier:
  - Brewmasters Eve/Day
  - Beer Day
  - Providas
  - Liquor Day
  - Night of the Earthen Veil
  - Unholy Pilgrimage (a crawl surge across every tavern)
  - Festival of the Red Tide
  - Beggars Dance
  - Hoppy Holidays

### 2.10 Economy
- **Duckets as a closed loop**, following the Economy Pitch:
  - Wages go to city purses, and city purses feed demand.
  - Taxes, tithes, tribute and fees go to institution accounts or a sink.
  - Suppliers have finite stock and restock rates.
- **~8 ingredients:** Barley/Wheat, Hops, Molasses, Spice, Red-earth, Brine-fish, Spiritweed (vow-only), and Imported goods (Bjor Hjarta stout, Taverna wine).
- **Suppliers:**
  - Cumstead: cheap, with dependency risk.
  - Brandywine smallholders: rougher quality.
  - Brewers' Lane.
  - Roto stalls: volatile.
  - Providence Circs: church-gated.
  - Fenwick: vows.
- **Drinks** by category: Ale, Stout, Grog/Rum, Tonic, Spirits, Cider. Each has a recipe, price band, quality, appeal by segment, brawl modifier and prep time.
- **Recipe discovery metagame:** combining ingredients unlocks new lore-named drinks.
- **Shipments:**
  - Stormtide risk; pirate raids unless your Windsunk standing is high; never raided to or from Roto.
  - **Voyage Wager** insurance: in the Economy Pitch, insurance began as gambling on voyages.
  - Moneylender loans.
  - Arbitrage is intended.
- **Mercantile levers:** Assbell Subsidy, monopoly charters, tariffs.
- **Late unlocks:** Stein's Charter (sister founding) and the O'Fern Tunnels (secret fast links to Aleforge).

### 2.11 Presentation
- **Title screen:** a sealed wax letter. Clicking it opens a parchment with **clearly marked placeholder copy only**. Play becomes prominent after the letter is opened and closed. The same click also unlocks the AudioContext.
- **Rumour-mill ticker:** low priority.
- **Settings:** reflex/tactical timer extension of ×1.5 or ×2, which puts the run in the **Assisted** leaderboard category. Also reduced motion, key remap, UI scale, and volumes per bus.
- **NG+** unlocks after a win: heavier modifiers such as rivals starting at T1 or higher secrecy.
- **Art direction per city** (the user's words):
  - Providence: medieval grey stone, advanced masonry, slate, bell spire.
  - Shanty Town: a chaotic stack of crashed ships, mostly wood, with bright mismatched flags.
  - Roto Kaiishi: market stalls stacked on stilts in the ocean, strictly **black, grey and red**.
  - Aleforge: whimsical, with **differently coloured roofs in odd shapes**.
  - Interiors match: stone halls with pews; a ship-hull interior with hammocks and flags; lacquered stalls with red lanterns; warm wood with colourful kettles and keg walls.
- **Audio:**
  - Per-category UI SFX, with 2–3 variants each plus pitch and volume jitter.
  - Separate ambience states for each view and for modals.
  - Per-city music: Aleforge brassy/festive; Shanty sea-shanty; Providence restrained bells by day and looser at night; Roto market bustle.
  - A calmer world-map theme.
  - Music ducks under prompts with tension ≥ 2.

---

## 3. Lore guardrails (enforced by CI lore-lint)

**Fair game** (pre-464 or ongoing):
- Aleforge's history:
  - the Liquor Kings up to **Scipium Ofkra**, who abolished the Trials
  - **Isadora Beerchelli**'s prophecy
  - Elric Stein's taverners, Oswain O'Fern's tunnels, Sean Assbell's subsidies, the Shorelan ban, Wendell the Democrator's voting groups
  - Frenic Hallis and the Sackbeard Memorial Well
- Mayors **Cromwell** and **Bronco Chestnut** as backstory flavour; **Glendolph Galleyway** and **Thomas Thatcher Sr.** live.
- Aleforge places: Brewers' Lane, the Hall of Ale, the Aleforge Bazaar, the Lighthouse & Customs.
- Sackbeard, the Tavern Beast and the Shell Tavern; Shanty Town's founding and rites, the Windsunk Council and its laws, the Books of Captains, the First Pour, the Pour Eternal legend, and the factions.
- Providence: Cardinal Addy, the castes, ClockHeart Tonic, the Hangover bell, the red-earth bell, the lake port, the Festival of the Red Tide.
- Roto: Xi's flat fee and taboos, the pirate-protected fence, the Magnate (unnamed).
- John Cum (alive, widowed, volatile, Veilwalker-blessed fields); Veilwalker vows and curses.
- The calendar (seasons, Kegs, day names); the holidays listed in §2.9; off-isles imports (Bjor Hjarta stout, Taverna wine).

**Forbidden** (listed in `tools/lore/forbidden.json`; checked case-insensitively over `src`, `content`, `public` and the built `dist`):
- The six Liquor Kings and their nicknames, ships and crews: Seamus/Bonehardy, Jack Anqoak, Jagerbauhm, Guinnie/O'Guinness, Buke, Jameson Pilsner.
- Goldcoral, Gideon Drake, John Rump, Mr. BBL, Susan Plinket, MAMA/MAA.
- Owe Block, the Cloister Beast, Stewards of Aleforge, Horror(s) in Hoegaarden, the Rotted Soul, Nethergate, Fayte Druids.
- CockPower, Aldridge Industries, Stormveil/Albatross, Sexton Gobbler, Day of Hollow Tongues, Hogwilly's.
- The Southern Bellows contact, and the modern castle administration.

**Uncertain era, so don't use as named NPCs; invent instead:** Glub Tuppus Wepple and the Gilded Tankard, Rollo, Old Salty, the OAM office-holders, the Krappenschitz, Wolendi/Derecho, and other modern Aleforge notables.

**Lint rule for "Liquor King":** allowed only in past-tense references such as Scipium; the six Kings' names are always forbidden.

**UI copy rule:** content schemas have **no free-text description fields**. Card and item descriptions are generated from stats, so lore text can't reach the UI. Longer prose is allowed only in the letter (placeholder) and the finale script.

---

## 4. Technical architecture

**Stack** (pin exact versions, commit the lockfile):

| Package | Why |
|---|---|
| **Vite 8 + TypeScript ~6.0** | `tsc --noEmit` typecheck only. TS 7 is the Go port, so avoid it for now. |
| **Phaser 3.90.0** | Renders both views: tweens, particles, camera zoom and shake, drag input, `textures.addCanvas`. The session knows v3 well, and v4 buys nothing at 480×270. |
| **Preact + @preact/signals** | DOM HUD, panels and prompt cards. The view model is derived from the world at 10 Hz. |
| **zod** | Content schemas, plus generated JSON Schema so the user gets VS Code autocomplete when editing content. |
| **Vitest** | Tests. |
| **@playwright/test 1.56.1** | Must match the preinstalled `chromium-1194`. |
| **zzfx** (MIT) | Procedural SFX gap-fill. |

- **Deploy:** GitHub Actions. `ci.yml` runs on all branches: typecheck, unit/calibration tests, validate-content, lore-lint, build, e2e. `pages.yml` deploys `main` to Pages. The user sets the Pages source to "GitHub Actions" and merges to publish.
- Vite `base: './'` so the build works under any Pages subpath.

**Directory layout:**
```
src/main.ts  app/{controller.ts (loop, pause/visibility/blur, autosave, run clock, URL flags), testHooks.ts}
src/sim/     PURE (no DOM, Phaser, Math.random or Date; arch.test enforces this)
  world.ts step.ts rng.ts (named sfc32 streams) time.ts commands.ts hash.ts
  economy/{ledger,market,inventory,suppliers,shipping,finance,bookkeeping}.ts
  tavern/{staff,reputation,patronPool,regulars,recipes}.ts
  floor/{floorSim,patronFsm,staffAi,avatar,grid,incidents,materialize,collapse}.ts
  aggregate/{aggregateSim,model,fit}.ts
  cities/{rules,aleforge,shanty,providence,roto}.ts  politics/{mayors,institutions}.ts
  network/{sisters,managers,policy,win}.ts  rivals/{director,archetypes,tracking,actions,mood,intel}.ts
  prompts/{queue,effects}.ts  crises/roller.ts  undercurrents/{undercurrents,winds}.ts  rumor/rumors.ts  save/{serialize,migrate}.ts
src/bots/    floorBot, worldBot, profiles (novice/average/skilled/expert/staffOnly/idle); never bundled
src/content/ schema.ts index.ts data/*.json (cities, segments, factions, drinks, ingredients, recipes, decor, staff,
             suppliers, routes, institutions, rivals, prompts, crises, mayors, holidays, winds, rumors, achievements,
             tips, strings/*, tuning/{time,economy,difficulty,targets,aggregate-fit}.json, audio/*)
src/views/   BootScene, FloorScene, WorldScene, TitleScene, FinaleScene, floor/*, world/*, fx/*, anchors.ts
src/ui/      root.tsx vm.ts hud/ prompts/ panels/ ticker.tsx title/SealedLetter.tsx settings/ leaderboard/
src/input/   hotkeys.ts (one global window manager → Commands) bindings.json pointer.ts
src/art/     atlas.ts (named sprite keys → vendor sheet frames) palettes.ts (per-city recolour ramps)
             composers/{character,interior,building-<city>,worldmap}.ts overrides.ts
src/audio/   engine.ts (sfx/amb/music buses, ducking) sfx.ts music.ts ambience.ts director.ts
src/leaderboard/ adapter.ts mockAdapter.ts appsScriptAdapter.ts outbox.ts config.ts shared/validate.js (ES5)
gas/Code.gs appsscript.json README.md   (tools/build-gas.ts inlines shared/validate.js)
tools/  fetch-assets.mjs convert-audio.mjs cut-sheets.mjs atlas.html validate-content.ts gen-json-schema.ts
        lore-lint.ts lore/forbidden.json calibrate.ts balance.ts build-gas.ts verify-run.ts
tests/  unit/ invariants/ calibration/ balance/ gas/ e2e/ scenarios/ arch.test.ts lore.test.ts
dev.html (sprite/audio gallery for user check-ins)   CREDITS.md   assets/{sprites,ui,fonts,audio,licenses}/
```

**Core contracts:**
- **Stepping:** `stepWorld(world, content, cmds)` mutates plain-JSON `World`. All input is a `Command` applied at the next tick. The renderers only read. Derived caches (flow fields, pools) live outside `World`.
- **System order per tick:**
  1. time
  2. cities (phase and night; price walks at 1 Hz)
  3. market demand
  4. focused floor sim
  5. aggregate sims (all other taverns, including rivals)
  6. shipping
  7. staff
  8. rivals
  9. undercurrents and crises (1 Hz)
  10. prompt timeouts
  11. network (win and loss)
  12. rollovers
  13. metrics
- **One demand model.** `market.ts` computes per-city, per-segment arrivals and splits them across taverns by logit choice. The inputs are quality, price, reputation by segment, faction fit, decor, and a "stay home" option. The floor spawner, the aggregate sim and the rivals all use it.
- **One accounting API.** Money and stock move only through `ledger.transfer`, `recordSale`, `consumeStock`, `recordIncident` and `rep.apply`. Tests enforce conservation.
- **Materialize and collapse on focus change:**
  - Materialize: occupancy becomes seated patrons at sampled visit phases, and backlog becomes waiting orders.
  - Collapse: the reverse. **Open incidents resolve as if ignored**, so you can't dodge a brawl by switching away.
- **Calibration.** `tools/calibrate.ts` fits the aggregate throughput coefficients against the floor sim run by the `staffOnly` bot. CI enforces this chain on held-out configs:

  `aggregate ≈ floor(staffOnly) ±10% < floor(skilled) (≥1.10×) ≤ floor(expert) (≥1.25×)`

  A fully staffed late game still needs skilled play to be at least 1.05× the aggregate. This is how "delegation never beats skilled play" is made testable.
- **Prompt system.** Tiers, caps, scope badges and priority work as in §2.4. Content defines `tier`, `scope`, `countdown`, `options[{effects: EffectSpec[]}]`, `defaultOption` and `tension`. `EffectSpec` is an interpreter with an EV estimator used by the lint. Manager proposals use the same system.
- **Save:** `{v, contentHash, build, clock{simMs, pausedMs, pauses, sessions}, world, cmdLog}`.
  - Stored gzipped in localStorage via `CompressionStream`.
  - Saved at each season rollover, on `visibilitychange` to hidden, and on `pagehide`.
  - A single slot with Continue or Abandon only, no save-scumming.
  - **Replay test:** seed + `cmdLog` must reproduce the same world hash. Avoid runtime `Math.exp`/`pow` in the sim; use precomputed constants.
- **`?debug`** turns on a tuning overlay:
  - speed up to 8×
  - jump to year or act
  - trigger any crisis
  - view undercurrents
  - FPS and sim-ms readout
  Debug runs are unranked. `?seed=`, `?city=` and `?lbmock=fail|slow` are also supported.

**Art pipeline** (reusing TD-PINT's approach):
- `tools/fetch-assets.mjs` pulls chosen packs from the `series-ai/jam-ready-assets` mirror (`media.githubusercontent.com` for LFS files), or from kenney.nl, OpenGameArt or itch where needed. It records each pack's `License.txt` in `assets/licenses/`.
- `CREDITS.md` lists pack, author, licence and usage.
- **Candidate packs, all 16 px CC0:**
  - Kenney Tiny Town, Tiny Dungeon, Tiny Battle
  - Kenney Pirate Pack / Pixel Shmup ship parts, for Shanty wrecks
  - Kenney Roguelike RPG / Indoor, for interiors
  - Kenney UI Pack: Pixel Adventure, Kenney Fonts
  - Pixel-boy *Ninja Adventure*, for characters, FX and CC0 music
  - Shade *Puny Characters*
  - Kenney audio: Interface, Impact, RPG, Retro, Casino (coins), Music Jingles
  - OpenGameArt CC0 chiptune loops, for per-city music
- **City looks come from composers:**
  - pack pieces
  - **per-city palette recolours** (Roto locked to black/grey/red; Aleforge roofs randomised from a whimsical colour and shape set)
  - composition rules: Shanty buildings made from hull and plank and flag parts; Roto stalls stacked on stilts; Providence stone and spire
- Hand-authored 16 px gap-fill sprites only where no pack piece fits. `tools/atlas.html` / `dev.html` show every named sprite.
- **Audio gap-fill:** zzfx SFX variants; a tiny data-driven tracker only if a suitable CC0 loop can't be found for a city.

**Leaderboard** (the Mario pattern, hardened):
- **Client:**
  - `text/plain` POST, which avoids the CORS preflight.
  - Read the body as text and detect HTML error pages.
  - A localStorage outbox with backoff and ok / retry / refused handling.
  - `GET ?board=<cat>&n=25` returns the top N only, cached for 60 s.
- **`gas/Code.gs`:**
  - `@OnlyCurrentDoc`, and `LockService.tryLock`.
  - A build allowlist held in Script Properties, so the client can't pick the era.
  - Bounds and plausibility checks: splits are monotonic; `topTapMs ≤ simMs`; `realMs ≥ topTapMs`; `topTapMs` ≥ 0.8 × the expert-bot best; the run reached the 463 verdict with `chosen = true`.
  - Duplicate `runId`s are rejected.
  - Formula-injection escaping: prefix `'` on any cell starting with `= + - @`, tab or CR.
  - CacheService rate limits: 1 per 60 s per client, 30 per minute globally.
  - An append-only `runs` tab, plus an incrementally maintained top-100 per category and an admin `hidden` column.
- **Payload:** `runId, clientId, name (≤16, allow-listed chars), homeCity, category, topTapMs, splits{firstSisterMs, thirdSisterMs, firstNo1Ms}, finalCV, peakCV, simMs, realMs, pauses, sessions, chosen, seed, build, contentHash, cmdDigest`.
- The board sorts by `topTapMs`, then `finalCV` descending. Both the sort key and the tiebreak are constants in `Code.gs`, so ranking can be changed later.
- **`tests/gas`** runs `Code.gs` under a `node:vm` shim of SpreadsheetApp, LockService and CacheService.
- **`gas/README.md`** gives the user's deploy steps, including "Manage deployments → New version" so the URL is kept. Honest mode only; `tools/verify-run.ts` replays disputed top runs.

---

## 5. Reuse from the user's existing repos
Read them over raw.githubusercontent on branch `master`, or clone read-only.
- `itsjackyboi/Mario`: `tools/leaderboard.gs` (doPost/doGet, LockService, append-only log), `src/cloud.js` (send helper, `parseBody`, outbox, backoff, 45 s cache), and the README's "The shared board" setup steps.
- `itsjackyboi/TD-PINT`:
  - asset pipeline: `tools/fetch-assets.mjs` (the mirror plus licence capture), `tools/convert-audio.mjs`, `tools/cut-ui.mjs`, `tools/atlas.html`, `src/ui/sprites.js` (atlas naming), `CREDITS.md` format
  - headless sim and bot pattern: `tools/sim.mjs`, `src/core/bot.js`, the builds JSON
  - `tools/browser-test.mjs` / `mobile-test.mjs` Playwright patterns, the `?debug`/`?seed` conventions, auto-pause on visibility
- `itsjackyboi/Simulator` is optional reference for Pintland causal-web tone. Its content is era-mixed, so don't copy names.

---

## 6. Milestones

Each milestone ends with a green CI, tests, a `?debug` scenario plus a Playwright smoke test with screenshots, and a commit and push. ★ marks a user check-in; stop and ask before continuing.

| # | Milestone | Exit criteria |
|---|---|---|
| **M0** | **Scaffold and guardrails.** Docs (PLAN, BRIEF, reference map); Vite/TS/Phaser/Preact/Vitest/Playwright; CI and Pages workflows; `arch.test`; lore-lint plus `forbidden.json`; content loader and validator; `fetch-assets` spike that pulls the first packs with licences into `CREDITS.md`; title screen with the sealed-letter scaffold and placeholder copy. | CI green. E2E: open the letter, then Play, then the canvas appears. Lore-lint catches a planted name. **User action:** set the Pages source to GitHub Actions. |
| **M1** | **Solo floor loop (one city, pack art).** Patron state machine; avatar action queue; taps, kegs, cellar; patience; brawl and thief incidents; season shift with day/Hangover/night phases and Last Call; 3-drink menu; Year/Season clock; pause veil. | Money and stock conservation tests; patron state-machine tests; replay-hash test; `floorBot` plays 2 years headless; playable in the browser. |
| **M2 ★** | **Core-loop depth and feel (the fun gate).** Staff hiring, stations, drag and hotkeys, competence/morale/fatigue; tactical prompt engine; VIPs; named regulars; combos; Holiday Keg bell; first SFX set with variants; particles and shake; full Aleforge interior art; character composer. | Throughput rises with competence. `floor(skilled) ≥ 1.1× floor(staffOnly)`. **Check-in #1: core loop feel. Iterate here most.** |
| **M3** | **Economy and aggregate sim.** zod schemas and JSON Schema; drinks, ingredients, recipes; menu and pricing; logit demand; ledger accounts; suppliers with finite stock; bookkeeping (rent, wages, fees); loans; `aggregateSim`, materialize/collapse, `calibrate`. | Calibration invariant chain and conservation suites green. A debug second tavern focuses and unfocuses without drift (±5% revenue). |
| **M4** | **World map and trade.** Overworld with nodes, routes, Cumstead; `Tab`/wheel switching with transition; price boards; Roto volatility; shipments with Stormtide and pirate risk; Voyage Wager; edge alerts; rumour ticker v0. | Price processes stay bounded; shipment determinism. E2E: switching views keeps sim ticks continuous. |
| **M5 ★** | **Sisters, managers, win and loss.** Lots and licences; the founding lifecycle; managers and autonomy; strategic inbox; policy editor; **Company Value** and the league table; milestone ladder and splits; Top Tap hold and stamp; post-stamp speed-up; Year-463 verdict; loss screen; **Freeplay with the not-on-leaderboard note**; ranked clock; autosave and Continue. | CV unit tests (same formula for player and rivals; depreciation; debt). The bot reaches Top Tap and wins a no-rival debug run. Save → reload → continue gives the same hash as an uninterrupted run. **Check-in #2: delegation arc and world-map readability.** |
| **M6 ★** | **City identities.** `CityRules` for all four cities (§2.2), per-city interiors and building composers, per-city palettes, Galleyway→Thatcher election, 460 announcement. | One rules test file per city. Each `?city=` start is playable. **Check-in #3: per-city art direction.** |
| **M7 ★** | **Rivals.** Director, archetypes, tracking, tiers, moods and merges, intel telegraphs, arch-rival network race, rival agents on the floor. | The undercutter contests a dominated ale bucket within 2 years. Telegraph fidelity falls monotonically with secrecy. Merges conserve assets. **Check-in #4: difficulty and readability.** |
| **M8** | **Undercurrents and crises.** Undercurrent variables, winds, crisis roller plus 14-crisis pool with chains, vow-trades, holidays, recipe discovery v0, debug crisis console. | Roller Monte Carlo passes. Every crisis option resolves without throwing. Threshold-crossing tests pass. |
| **M9** | **Balance and performance.** Bot profiles (novice/average/skilled/expert/staffOnly/idle); `tools/balance.ts` with workers plus surrogate mode; `targets.json`. | Skilled bots reach Top Tap at ~30–42 min; experts at ~25 min; average bots win ≤ 40%; idle and novice lose; all-delegate never beats skilled; no degenerate strategy dominates. Sim p95 ≤ 2 ms per frame. 20-run CI smoke check. |
| **M10 ★** | **Audio.** Buses and ducking; full SFX map; ambience per view; per-city music including Providence day/night; world and title themes. | Audio gallery in `dev.html`. **Check-in #5: sound.** |
| **M11** | **Presentation and settings.** Final letter flow; guided opening year; settings including Assisted timers; achievements and tips; animation polish. | E2E runs through settings. Lore-lint over `dist` is clean. |
| **M12** | **Leaderboard.** Adapters (mock and Apps Script); shared validation; `Code.gs` plus shim tests; outbox; leaderboard UI with categories. | Mock end-to-end in Playwright passes. **User action:** deploy the Apps Script and paste the URL into `src/leaderboard/config.ts`. |
| **M13 ★** | **Finale and NG+.** Time-skip to the 463 verdict, the Thatcher Sr. proclamation scene (placeholder copy), sponsor reveal, results and submit, NG+ modifiers. | Full-run e2e via debug fast-forward (unranked). **Final check-in: lore review of every name in `content/data`.** |

**If scope must be cut, cut in this order:** recipe metagame, merges, NG+, Veilwalker boons (keep the penalties), ambience layers. Never cut M1/M2 iteration time.

---

## 7. Verification
- **Every milestone:**
  - `npm run typecheck && npm test && npm run validate-content && npm run lore-lint && npm run build`
  - `npx playwright test` against `vite preview`, using the preinstalled Chromium with `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`
  - Attach the screenshots from `tests/e2e/__screens__` to the check-in message.
- **Sim correctness:**
  - conservation invariants (money, stock, patrons)
  - replay-hash determinism
  - floor↔aggregate calibration chain
  - crisis-roller Monte Carlo
  - per-city rules tests
  - rival behaviour tests
- **Balance:** `node tools/balance.ts --profiles=all --seeds=32` writes a markdown report to `docs/balance/` on every balance pass.
- **Leaderboard:**
  - `tests/gas` runs the shim against `Code.gs`: validation, injection escaping, rate limit, top-N.
  - Playwright with `?lbmock` covers success, failure and slow cases.
  - A live check happens after the user deploys the Apps Script; `script.google.com` is not reachable from the sandbox.
- **Manual:** play a full run on each home city before M13 sign-off.

## 8. Top risks
1. **Core loop isn't fun.** M2 is a hard gate with a user check-in; iterate before building breadth.
2. **Floor/aggregate drift or exploits.** Shared demand and accounting, collapse-as-ignored, and CI calibration.
3. **Readability overload.** Hard caps (3 incidents, 2 cards, 1 toast, 2 edge alerts), badges not interrupts for strategic items, shape plus colour coding.
4. **Per-city art from generic packs.** Palette recolours plus composers plus minimal gap-fill sprites, reviewed at check-in #3.
5. **Balance to the time targets.** Every number lives in `tuning/*.json`, tuned with bot batches plus surrogate mode, with human check-ins.
6. **Determinism.** The `arch.test` bans, named RNG streams, replay tests from M1.
7. **Leaderboard spoofing.** Honest mode with plausibility checks only; don't over-invest.
8. **Lore leakage.** Lint over `dist`, stat-generated descriptions, and the final name review.
