# Original design brief (verbatim)

> This is the project owner's original brief, reproduced verbatim, followed by the answers given during planning.
> Where the planning answers differ from the brief, the answers win. `docs/PLAN.md` is the build plan that reconciles the two.
> The reference map mentioned below is committed as `docs/reference/pintland_map.jpg`.

---

Prompt for Claude Code: "Last Call" — A Long Thirst Tavern RTS
Copy everything below the line into Claude Code as your project brief.
What we're building
A browser-based, single-page real-time strategy game called Last Call, built as static HTML/CSS/JS so it can be hosted on GitHub Pages. The player founds a tavern in one of four Pintland Isles cities during the Long Thirst (Year 412–464, the fifty-two years with no Liquor King, when Aleforge was ruled by a succession of mayors) and races to grow it into an empire with a flagship location plus a sister tavern in each of the other three cities before rival taverns — who react and adapt to the player — squeeze them out. The game ends when the player's tavern network is chosen to sponsor the newly reinstated Drunken Trials, closing out the Long Thirst.
This is a skilled-player game: fast, twitchy, information-dense but readably dense, and unforgiving. Think Diner Dash crossed with Stellaris crossed with a hardcore idle/tycoon game — seconds-scale decisions with decade-scale consequences.
I will attach a reference world map image (`pintland_map.jpg`) to the project. Use it only for relative geography (what's north/south/coastal/inland of what) — do not try to trace or reproduce it pixel-for-pixel. Build the in-game map as an original 8-bit/16-bit pixel-art-style tilemap using open-source/free assets (see Assets section).
The game is built around two distinct, instantly-switchable views — a zoomed-in tavern floor and a zoomed-out world/empire map. See "The two views" section below for the full spec; every other system in this document (the core loop, sister locations, HUD, art direction) should be read with that split in mind.
Setting constraints — read this before writing any content
Everything in the game takes place during the Long Thirst, Year 412–464. This is a hard boundary:

* No Liquor Kings exist yet. The title, the Drunken Trials, and the six founding Liquor Kings (Seamus Bonehardy, Jack Anqoak, Jagerbauhm, Guinnie, Buke, Jameson Pilsner) are all future history relative to this game. Do not reference them, their ships, their companies (Goldcoral Inc.), or any event from their era.
* No references to anything that happens after Year 464. That includes: the Age of Six Kings, Stewards of Aleforge, the Cloister Beast incident, Horrors in Hoegaarden, A Walk on Owe Block, Gideon Drake, John Rump, Mr. BBL, the Southern Bellows Nation's outside contact (that starts much later), the modern Aleforge castle administration, CockPower's clock tower fame, etc.
* What is period-accurate and fair game (pre-412 or ongoing through 412–464):
   * Aleforge's mayors during this exact window, in order: Cromwell (wealthy businessman, hedonistic, did little governing), Bronco Chestnut (Church of Patmos follower, tried to make Aleforge theocratic, unpopular, voted out fast), Glendolph Galleyway (unremarkable), Thomas Thatcher Sr. (historian, reinstated the Drunken Trials after 51 years dormant — that reinstated Trials is your win-condition event, occurring at the very end of the game), then Thomas Thatcher (his son, oversees the famous six-way-tie Trials that ends the Long Thirst and begins the Age of Six Kings — just past your game's ending, referenced only as the sponsorship ceremony the player is being selected for).
   * Isadora Beerchelli's prophecy of the Long Thirst and "Age of Six Kings" (delivered before it happened) can be flavor/rumor text — she foretold it, so it's known lore within this era.
   * Scipium Ofkra, the last Liquor King before the Long Thirst, who abolished the Drunken Trials — his abolition is the reason the Trials don't exist yet in your game world. Good background/flavor-text material.
   * Sackbeard, the Tavern Beast, the founding of Shanty Town and the Windsunk Council, the Shell Tavern, the pirate crash-your-ship-to-join tradition — all long pre-412, so fully available as flavor and mechanics.
   * Providence under Cardinal Addy and the Church of Patmos, ClockHeart Tonic, the Apostles/Friars/Sextons/Circs/Kalifarts caste system — all ongoing/pre-412, fair game.
   * Roto Kaiishi under Xi Jin Ping's successor lineage (Kim Jong Un was Xi's chosen heir; by Year 412+ that mentor-successor system has likely cycled further — treat the current Roto leader as an unnamed "the Magnate" or similar so you're not contradicting later lore about who's running it in later eras) — the flat-fee-no-tax system, the taboo/underground market split, Roto's total lack of pirate hostility, all fair game.
   * John Cum's Cumstead — still run by John Cum himself in this era (his death and John Rump's takeover is Stewards of Aleforge, decades later, post-Long-Thirst). John Cum is alive, eccentric, and the land's dominant wheat/barley grower.
   * The Veilwalkers and Fenwick — ancient, ongoing, unaffected by the Long Thirst's political timeline. Fully available.
   * General geography, the Cloister (closed/dangerous, pre-Fayte-Druids), the Gulf of Aleforge, the Breakback Mountains, Whiskey Shallows, the Gae Strait, Vodkonia as an unexplored/banishment-associated region — all fine as background/map flavor.
* When in doubt about whether a name or event is safe to use, err toward inventing an original NPC/rival/vendor rather than pulling a named character from a concept-era (post-464) storyline.

The four playable home cities
Player picks ONE as their home base at game start. Sister taverns must eventually be established in the other three. Each city gets a starting buff and a nerf, and each should feel mechanically distinct, not just re-skinned.
Aleforge (the Brewer's Capital)

* Buff: Cheapest, highest-quality ale supply — home turf discount on all Brewers' Lane ingredient purchases, and a base +quality bonus on any ale-category drink.
* Nerf: Highest rent/real-estate cost of the four cities (it's the commercial center; land is expensive) and the most rival tavern density from turn one — you're never the only game in town here.
* Flavor mechanic: Aleforge cares about brewing pedigree. Reputation gains here are weighted toward "craft/quality" actions (new recipes, aging, brewing competitions) rather than volume or spectacle.

Shanty Town (the Pirate Cliffs)

* Buff: Grog and favor-based economy — you can pay for some goods/labor in barrels and reputation instead of coin, which smooths early cash flow, and pirate patrons tip enormously when happy.
* Nerf: Structurally violent customer base — brawls trigger more often and do more property/inventory damage than in any other city; the Windsunk Council can levy sudden "tribute" demands you can't simply decline without a reputation/safety hit.
* Flavor mechanic: Loyalty here is factional (Tide Callers / Coral-eyed / Ashen Oath / Captains & crews / Drifters) — different factions want different drink/decor/entertainment profiles, and pleasing one can annoy another.

Providence (the Tonic City)

* Buff: Extremely disciplined, high-spending clientele — Apostles tithe-adjacent spending habits mean high average ticket size and low theft/damage.
* Nerf: Heavily regulated — the Church of Patmos dictates what may be brewed/sold, tithes skim a cut of your revenue automatically, and running afoul of Friars/Sextons on patrol can shut you down temporarily.
* Flavor mechanic: A day/night personality-flip mechanic unique to Providence — patrons are stiff, orderly, tonic-fueled by day and wildly uninhibited (and thirstier) after the Hangover bell tolls at night. Staffing/menu decisions should differ between day-shift and night-shift service.

Roto Kaiishi (the Floating Free Market)

* Buff: No taxes on sales, only a flat yearly operating fee — once paid, marginal revenue is the best in the game, and the completely open market means you can source rare/exotic ingredients unavailable elsewhere.
* Nerf: No regulation also means no protection — theft, counterfeit goods, and price manipulation from rival stalls hit you harder here than anywhere else, and there's a hard taboo system (certain goods can only be sold underground/after dark) that limits your legitimate menu if you don't manage a black-market side channel.
* Flavor mechanic: Price volatility — Roto's open market means ingredient costs swing quickly based on regional supply events (a storm near Aleforge spikes ale-bean prices in Roto within the hour, etc.), rewarding players who watch the market rather than just their own taproom.

The two views (zoomed-in tavern floor vs. zoomed-out world map)
This is a structural pillar, not a UI nicety — the game should feel like two different games that share one economy, and switching between them should be instant (a single keypress/button/scroll-zoom, no loading screen, no pause required, though the player can optionally pause the sim while reading the zoomed-out view if that's needed for legibility — see the open question at the end of this section).
Zoomed-in view: the tavern floor (micro scale)
This is the Diner-Dash-like reflex layer, scoped to one tavern at a time — always your currently-selected home-city or sister-city location, never all of them at once.

* Shows the actual tavern interior as a small 8-bit scene: tables, bar, kegs, doorway, staff sprites, patron sprites moving, ordering, drinking, brawling.
* This is where the reflex-layer decisions from the core loop happen: seating patrons, routing orders, catching a thief, breaking up a brawl, greeting a VIP, restocking a keg before it runs dry, handling a Friar/Council inspection in person.
* This is also where intra-town relationships live and are visibly worked: individual named regulars and their loyalty, rival tavern owners in the same town who you can see, needle, undercut, or occasionally cooperate with (e.g. a temporary price-fixing truce against a third rival), local supplier relationships (the miller, the fishmonger, the smuggler), and town-faction standing (Windsunk factions in Shanty Town, the Apostle castes in Providence, etc.) as it plays out patron-by-patron rather than as an abstract meter.
* Staff are managed here individually — assign a bartender to the bar, a bouncer to the door, a runner to tables — as short, snappy drag/click/hotkey actions, not a menu screen.
* Every tavern the player owns (home + each sister location) has its own zoomed-in floor, but only the currently "in-focus" one runs at full simulation detail while you're looking at it; the others tick forward using the simplified zoomed-out-view math (see Sister Locations below) so the player isn't asked to watch four floors at once.

Zoomed-out view: the world/empire map (macro scale)
This is the strategic layer, scoped to the whole map and your whole network at once.

* Shows the 8-bit overworld map (see Visual Style) with Aleforge, Shanty Town, Providence, and Roto Kaiishi as nodes, plus supply-chain nodes like John Cum's Cumstead, trade routes drawn between them, and small icons/pins for your own taverns, known rival taverns, and in-flight events.
* This is where inter-tavern logistics and resource management happen: routing ingredient shipments between cities, deciding which sister location gets a surplus keg shipment this week, setting each location's autonomous buy/sell policy, comparing price boards across cities (this is also where Roto's price-volatility system is most legible — watch it here, not just on the tavern floor), and allocating your limited attention/manager-upgrade investment across locations.
* This is where town-level (not patron-level) relationships are managed: your standing with the Church of Patmos as an institution, the Windsunk Council as a body, Roto's market authority, and Cumstead as a supplier — the aggregate reputation/pressure meters, tribute/tithe demands, and the "long-reach" cultural/religious/market ripple effects described below surface primarily at this scale, since they're about a town's relationship to your whole operation, not about any one patron.
* This is where you found a new sister location (choosing the city, committing capital, appointing a manager) and where you review/approve each sister location's queued decisions rather than dropping into its tavern floor.
* The sister-location completion tracker (0–3 of 3), the cross-city reputation summary, and the overall run timer live here as the primary dashboard, echoed in miniature on the zoomed-in view's HUD edge so you're never fully blind to macro state while handling a micro crisis.

How they connect

* A crisis or opportunity at either scale should be able to surface a prompt at the other scale — e.g. a macro-level supply shortfall (zoomed-out) can trigger a scarcity event you feel on the tavern floor (zoomed-in: a specific drink goes unavailable and patrons grumble), and a zoomed-in win (a spectacular night, a VIP won over) can feed a macro-level reputation tick you see reflected on the world map.
* The reflex layer (seconds) belongs almost entirely to the zoomed-in view; the tactical layer (10–30 sec) can happen in either depending on scope (a same-town rival price move is tactical-and-zoomed-in, a cross-city supply reroute is tactical-and-zoomed-out); the strategic layer (minutes) belongs mostly to the zoomed-out view.
* Open question to resolve with me before building: should the currently-unfocused tavern floors (including sister locations) fully pause while you're zoomed out managing logistics, or keep running in simplified/background simulation the whole time? I'd lean toward "keep running in background, simplified" so the game still feels real-time and pressured even while you're on the world map, but flag if you see a strong reason to do it differently.

Core gameplay loop (this is the heart of the design — spend the most iteration time here)
This must feel like real-time strategy, not idle-clicker-with-a-timer. Concretely:

1. The player's flagship tavern runs continuously in real time (game-time compressed — define your own ratio, e.g. 1 real minute ≈ 1 in-game day, tunable) with patrons flowing in, orders queueing, stock depleting, staff needing direction, and rival taverns visibly (or semi-visibly, via scouting) taking actions.
2. Decisions arrive as short-fuse prompts — a rival undercuts your price, a Windsunk tribute demand lands, a Veilwalker offers a vow-trade instead of coin, a keg goes bad, a brawl breaks out, a Friar shows up to inspect your stock. Give the player a visible countdown (2–8 seconds for the highest-tension ones, longer for strategic ones) and require a choice before it resolves itself (usually badly, or via a default "safe but weak" auto-resolution) if they don't act.
3. Layered decision speed, not uniform speed:
   * Reflex layer (1–5 sec): tap the right ingredient/keg/patron under time pressure, break up a brawl, catch a thief, greet a VIP before they leave.
   * Tactical layer (10–30 sec): respond to a rival's price move, choose which of 2–3 event outcomes to pursue, allocate a staff member to a task.
   * Strategic layer (minutes, but still ticking against competitors): set your menu/pricing policy, decide what to brew/stock next, choose expansion targets, negotiate supplier contracts, decide how to spend reputation/influence points.
4. Competing taverns are adaptive, not scripted. Build a lightweight AI director per rival tavern that:
   * Tracks what's working for the player (which drink category, which price band, which customer segment) and shifts its own strategy to contest it (undercut price, copy a popular drink, poach a supplier, target the same faction).
   * Escalates over time — early game rivals are passive/local; mid-game rivals start actively scouting and sabotaging; late-game rivals in other cities start trying to open sister locations in the same cities you're targeting, racing you for market entry.
   * Has a small distinct "personality" per rival (aggressive undercutter, quality snob, brawler/intimidator, smooth briber) so players learn to read and counter archetypes rather than fighting a monolith.
5. The core numbers to juggle at all times, visible in a compact always-on HUD, never a separate menu you have to pause to check. Split naturally across the two views (see "The two views" above): the zoomed-in HUD leans on the first few, the zoomed-out dashboard leans on the last few, but a slim summary strip of the other view's key numbers should always be visible no matter which view you're in:
   * Coin (and, in Shanty Town, a parallel Favor/Barrel currency)
   * Stock levels per key ingredient (visually, not as a spreadsheet — think icon + fill bar)
   * Reputation (local per-tavern, and eventually cross-city/institutional reputation once sister locations exist)
   * Staff morale/fatigue
   * Rival pressure/threat level per competitor (a simple visible meter, not hidden math)
   * A running game-timer and the sister-location completion tracker (0–3 of 3 established)
6. Sister locations open once the player has enough capital + reputation to found one in a specific other city, founded and overseen from the zoomed-out view. Once open, a sister location:
   * Needs periodic (not continuous) attention — think "check in every so often, assign a manager NPC, approve/deny a decision queue from the zoomed-out view" rather than a full second real-time tavern floor to babysit. The player can zoom into a sister location's tavern floor directly if they want hands-on control for a stretch, but the game should never require it.
   * Can be neglected into failure if genuinely ignored too long, but should have a manager-competence stat the player can invest in to reduce how often it needs attention.
   * Should visually/mechanically reflect the buff/nerf of whatever city it's in, so managing four different city-flavors at once is a real skill test.
7. Endgame: once all three sister locations are established and stable, and the flagship has hit a reputation/scale threshold, trigger the finale sequence — Thomas Thatcher's reinstated Drunken Trials, and the in-fiction announcement that the player's tavern network has been selected as sponsor. This should be a scripted, celebratory, non-interactive (or lightly interactive) closing sequence, not just a "you win" screen — it's the emotional payoff for the whole run.

Long-reach decisions (the "you won't see this coming" system)
I specifically want some choices to ripple into systems the player wouldn't expect a tavern-management decision to touch — market, culture, and religion, explicitly. Build a small number of these as genuine branching threads, not just flavor text. Examples to build from (invent more in this spirit):

* What you serve shapes local culture. If a tavern in Providence consistently pushes ClockHeart Tonic-adjacent drinks over traditional ale, over time it can nudge the Church of Patmos's influence up in that city (more tithe pressure, but also more high-spending Apostle patrons) — versus leaning into smuggled Aleforge ale, which slowly erodes Church control (less tithe skim, but the Friars start actively harassing you).
* Who you buy from shapes a rivalry. Exclusively buying wheat/barley from John Cum's Cumstead versus diversifying to smaller farms changes Cumstead's price/availability over time (single-buyer dependency risk) but also affects a slow-building Cumstead-vs-independent-farmers tension that eventually surfaces as an event chain (price shocks, a farmer's strike, etc.) — remember Cumstead is a major supplier, not the exclusive one; other, smaller/rougher wheat and barley sources should exist at worse price/quality trade-offs.
* How you treat the Veilwalkers matters even if you never see them. A tavern that occasionally trades in vow/promise-based deals (instead of pure coin) with Fenwick-adjacent suppliers builds slow, invisible goodwill that eventually pays off as unexpected boons (a supply that never runs out, immunity to a bad-luck event) — while a tavern that ignores or disrespects that system accumulates bad-luck modifiers (spoilage, brawls, bad weather events) that seem random until the player realizes the pattern.
* Rapid Shanty Town expansion normalizes pirate culture elsewhere. If the player's Shanty Town tavern (home or sister) grows very fast and very loud, it should very slightly shift the cultural tone of your other cities' patron pools over a long time horizon (a few more grog-and-brawl-friendly patrons showing up even in staid Providence) — a subtle cross-city cultural-diffusion system tied to your own success, which can be good (Shanty Town-style tips are generous) or bad (more brawls city-wide).
* Price wars have second-order effects on rivals' desperation. Crushing a rival on price doesn't just remove them — a rival pushed to the edge of bankruptcy has a chance to flip to "desperate" behavior (undercutting to a loss, sabotage, bribery of your staff, or in the worst case selling out to/merging with a bigger competitor who's now tougher). Total annihilation isn't always the safe play.

Make sure the game surfaces some signal that these systems exist (a "Cultural Winds" or "Undercurrents" indicator, sparingly used) without turning it into another number to optimize every second — this should reward players who think a few moves ahead, not punish players who didn't read a wiki.
Naming — lore names, no lore dumps
Wherever the game needs a name for a drink, dish, decoration, event, upgrade, or minor NPC, prefer naming it after something in the Pintland lore (a place, person, object, faction, or story beat from the Long-Thirst-safe list above). Do NOT include explanatory lore text in the UI — players who know Pintland will get the reference from the name alone, and the description text should be pure gameplay information (cost, effect, stat delta), never worldbuilding.
Examples of the tone to hit:

* A drink called "Sackbeard's Last Stand" → description is just "+2 Rowdy Patron appeal, 15% brawl chance, 8 coin cost" — no retelling of the tavern-beast story.
* An upgrade called "Windsunk Charter" → description is just "Unlocks Favor-currency trading, +10% pirate faction reputation gain" — not an explanation of what the Windsunk Council is.
* A Roto Kaiishi menu item called "Xi's Flat Fee Special" → just the stats.
* An event called "The Friars Come Knocking" → a two-line gameplay prompt (inspection incoming, hide/comply/bribe, consequences per choice), no sermon.

This applies to essentially everything nameable in the game: drinks, food, furniture/decor, staff archetypes, rival tavern names, supplier names, event titles, achievement/milestone names, even loading-screen tips.
Information density — the "quick and easy to read" mandate
Because decisions must be made in seconds, ruthlessly minimize text and cognitive load everywhere:

* HUD numbers should be icon + bar/number, not sentences.
* Event prompts: one short headline, at most one short line of context, 2–4 single-word-or-short-phrase choice buttons. No paragraphs, ever, during live play.
* Tooltips are fine for players who hover/pause, but nothing required for play should be tooltip-gated.
* Use color and iconography (consistent, learnable) over text wherever possible — a threat meter should be a color-shifting bar, not a "Threat Level: Moderate" label.
* The letter (see below) and the endgame sequence are the two places where longer prose is allowed and appropriate. Everywhere else, cut copy aggressively.

The opening letter
On the homepage/title screen, include a "Read your letter before you begin" interaction — a sealed/foldable letter graphic the player clicks/opens before the Play button becomes prominent. I will supply the actual letter text later; for now, build the mechanism (an opened/unopened state, period-appropriate parchment styling, a close-and-proceed-to-play flow) with clearly marked placeholder text so I can drop in the real copy afterward. Don't invent flavor text for the letter itself — just scaffold it.
Visual style

* 8-bit / 16-bit pixel art, readable at a glance — think SNES-era tycoon/strategy game (Theme Hospital, RollerCoaster Tycoon 1's sprite era, or Stardew Valley's tile density) rather than photorealistic.
* The two views should be visually distinct enough that the player never wonders which one they're in: the zoomed-in tavern floor is a dense, warm, close-up interior scene (Stardew-interior density); the zoomed-out world map is a cooler, more schematic overworld with clean node-and-route iconography (closer to a strategy-game campaign map than a tycoon sim). Consider a snappy zoom/pan transition (even just a quick fade or slide) between them so the switch reads as intentional, not jarring.
* Use open-source/free asset packs (e.g. Kenney.nl's asset packs, OpenGameArt.org CC0/CC-BY content, itch.io explicitly-free/CC0 tilesets) for tiles, sprites, and UI chrome. Do not use copyrighted commercial game assets. Document in the repo which packs were used and their licenses.
* The world map should be a stylized, simplified 8-bit overworld map, NOT a 1:1 recreation of the reference image. Include, at their correct relative positions:
   * Providence (north)
   * Roto Kaiishi (northeast, offshore/floating)
   * Shanty Town (central-east coast, cliffs, near the Gulf of Aleforge)
   * Aleforge (east coast, island cluster)
   * John Cum's Cumstead (south-central inland — a supplier location/node, not a playable city)
   * The Breakback Mountains and Whiskey Shallows as a general western/central landmass backdrop for orientation
* Deliberately omit (per your instruction) as too minor/irrelevant for this game's scope: The Mansion, Vodkonia, Sodomire Gaol, Fenwick (keep Veilwalkers as an off-map narrative/event presence, not a visitable map location), Fentmaxxer's Observatory, Name, and any other micro-locations not load-bearing for this game.
* I will provide the reference world map image (`pintland_map.jpg`) in the project folder for your general geographic orientation only.

Sound design
Audio is doing real gameplay work here, not just ambience — split it into three layers:

* UI/interaction SFX: a distinct, snappy click/tap sound per interaction category (not one generic click for everything) — e.g. a different sound for selecting a menu item, confirming a purchase, opening the zoomed-out map, assigning staff, resolving an event prompt correctly vs. fumbling it, a coin/cash-register sound for a sale, a glass-clink for a completed order, a thud/crash for a brawl or dropped keg. These should be short (well under a second), non-fatiguing on repeat (since some will fire dozens of times a minute at a busy tavern), and layered/randomized slightly (2–3 variations per common sound) so they don't grate.
* Menu/UI ambience: softer, distinct audio states for opening/closing the two main views (see "The two views") and any modal/event-prompt popups, so sound reinforces which layer of the game you're in even without looking.
* Background music, per town, distinct per view: each of the four cities gets its own light chiptune/period-appropriate background music bed reflecting its character — e.g. Aleforge warm and brassy/festive, Shanty Town a rowdier sea-shanty-inflected loop, Providence something more restrained and bell-chime-driven by day with a looser/wilder night variant (tying into its day/night flip mechanic), Roto Kaiishi something with a more exotic/market-bustle feel. The zoomed-out world-map view should have its own separate, calmer/more strategic theme (or a subdued blend of whichever cities you currently operate in) distinct from any single tavern floor's music, reinforcing the visual-style split between the two views. Music should loop cleanly and duck/soften automatically under high-tension event prompts rather than compete with them.
* Source all audio from free/CC0/CC-BY libraries (e.g. OpenGameArt.org, Kenney.nl's audio packs, freesound.org-sourced CC0 content) and document licenses/attributions alongside the visual asset credits.

Staffing and delegation progression
The game should have a real difficulty/scope arc, not a flat difficulty from minute one: you start doing everything yourself, and unlock the ability to delegate as you grow, which is what makes expanding to sister locations possible at all.

* Early game: the player personally handles every reflex-layer action on the tavern floor — seating patrons, pouring drinks, running food, handling the till, breaking up brawls, restocking. No staff, or at most one very limited helper. This is intentionally the most hands-on, highest-APM stretch of the game.
* Mid game: as coin/reputation allow, the player hires named staff archetypes (bartender, server/runner, bouncer, cellarer/stock-keeper, etc. — lore-named per the naming convention above) who can be assigned to automatically handle a slice of the reflex layer (a hired bartender auto-serves drinks at some competence level; a bouncer auto-intervenes in brawls with some success rate) freeing the player to focus on tactical-layer decisions instead of every individual click. Staff should have a visible competence/skill stat and a morale/fatigue stat (already noted in the core-loop HUD) that the player can invest in (training, pay raises, better working conditions) to raise the ceiling on how much they can be trusted to handle alone.
* Late game: a fully-staffed flagship tavern can run its reflex layer almost entirely on autopilot under the player's tactical oversight (approving big decisions, handling only the highest-stakes prompts personally), which is what frees up the player's actual attention to live in the zoomed-out view — founding and overseeing sister locations, managing logistics, and playing the long-reach/cultural systems. This progression should feel earned and should be the primary way the game's moment-to-moment pacing shifts from "frantic solo bartender" to "empire manager," rather than the difficulty simply dropping off.
* A sister location's "manager NPC" (mentioned earlier) is this same staffing system applied at the whole-tavern level rather than the individual-task level — a manager is essentially a hired "staff member" whose job is running an entire remote tavern's reflex+tactical layers at some competence level, with the same investable competence stat.
* Make delegation a genuine trade-off, not a strict upgrade: a fully-staffed tavern is slightly less efficient/profitable per-action than a perfectly-played player-run tavern (skilled players who stay hands-on longer should be rewarded for it), so there's a real strategic choice in when to start delegating and how much, not just "delegate everything the instant you can afford it."

Random crisis events
On top of the routine reflex/tactical event prompts described in the core loop, build a small pool of rarer, higher-stakes crisis events that are NOT guaranteed or scheduled — no fixed timer, no "every N minutes." Roll for them probabilistically throughout a run so that a typical playthrough sees roughly 2–3 of these, never the same fixed set in the same order, and not every crisis in the pool needs to appear in a given run.
These should feel like genuine story beats — bigger than a routine brawl-or-thief prompt, usually with a short multi-choice resolution (still fast to read and decide on, per the information-density rules, just weightier in consequence) and lasting effects rather than an instant resolve-and-forget. Some can be pulled from period-accurate Long Thirst lore, others invented from whole cloth in the same tone — mix both. Build at least 8–10 into the initial pool so runs don't feel repetitive; examples to seed the pool with:

* Lore-grounded examples:
   * A visible tremor of the coming end of an era — a rumor spreads (echoing Isadora Beerchelli's old prophecy) that the Long Thirst won't last forever, and taverns across the isles get restless; a short window where reputation swings are amplified, for better or worse.
   * A Church of Patmos crackdown in Providence — Cardinal Addy's Friars sweep the city harder than usual for a stretch (tighter regulation, temporary sales restrictions) regardless of your own standing, forcing a real adaptation window, not just a personal-inspection event.
   * A Windsunk Council tribute levy in Shanty Town — a lump-sum or ongoing demand from the Council itself (not a single tavern-level shakedown) that hits every tavern in town, including rivals, and can be paid, resisted, or informally negotiated with lasting reputation consequences either way.
   * A Roto Kaiishi taboo crackdown — the underground/after-dark market gets raided or restricted for a stretch, disrupting anyone leaning on it.
   * A bad harvest at John Cum's Cumstead — a supply shock (weather, or John Cum's own volatility per his lore) spikes wheat/barley prices isles-wide for a while, rewarding players who diversified suppliers per the long-reach systems above.
   * A Veilwalker omen — an unexplained ill-tidings event (echoing the vow-breaking curse lore) hits a player who's been ignoring/disrespecting vow-trade opportunities, while a player in good standing gets an unexpected boon instead.
* Invented-in-tone examples (Claude Code: invent more like these):
   * A rival tavern owner in your home town proposes a temporary truce/cartel against a third, more dangerous rival — accept and share the upside (and the risk of getting caught colluding), or refuse and go it alone.
   * A traveling entertainer/performer passes through offering a one-time reputation/appeal boost in exchange for a steep short-term cost.
   * A structural mishap (a keg room flood, a kitchen fire, a collapsed cellar shelf) forces an emergency triage decision under real time pressure — save the stock, save the fixtures, or save the day's revenue, not all three.
   * A star employee gets a rival job offer / poaching attempt — counter-offer, let them go, or risk them leaving mid-shift.
   * A counterfeit-coin or bad-batch-ingredient scandal breaks out, and the player has to manage the reputational fallout of a problem that wasn't really their fault.

Crisis events should be able to fire from either the zoomed-in or zoomed-out view depending on their scope (a keg-room flood is zoomed-in/tavern-local; a Council-wide tribute levy or Cumstead harvest shock is zoomed-out/town-or-isles-wide), consistent with "The two views" section above.
Scoreboard / global leaderboard

* Build a global leaderboard hosted via Google Sheets/Docs as the backend, in the same spirit as the Mario-style scoreboard project on my GitHub (Claude Code: please ask me for that repo/link if you need to see the exact integration pattern I used before, since you may not have access to it — check for it in my GitHub account and reference its approach to reading/writing a Google Sheet from a static GitHub Pages site if you find it).
* The leaderboard should track, at minimum: player name/handle, home city chosen, final completion time (how fast they achieved all 3 sister locations + endgame), and peak reputation/score metric.
* Because this is a static GitHub Pages site, use whatever proven pattern works for write access without exposing secrets client-side (e.g., a lightweight serverless function/Google Apps Script Web App endpoint that the static site POSTs to, since GitHub Pages can't hold server secrets) — investigate and pick the most robust approach, and document the setup steps (since a Google Apps Script deployment or similar will need to be configured by me outside of pure static hosting).
* In-game, show an always-visible or easily-toggled run timer and a compact live/cached leaderboard panel.

Suggested features / things you may not have considered (my own additions — take or leave)

* A "rumor mill" ambient ticker — short, low-priority scrolling text of things happening elsewhere (a rival opened in Aleforge, Roto ale-bean prices spiked) that rewards attentive players without forcing them to read it.
* A recipe/menu-crafting metagame — combining ingredients to discover new named drinks (naming them per the lore-name rule above) as a light progression system between the twitch-decision moments, giving the strategic layer something concrete to build toward.
* Difficulty via information asymmetry, not just bigger numbers — rivals could get harder not by having bigger stat multipliers but by revealing less of their intentions to you, forcing better read-and-react play from skilled players.
* A "last call" mechanic at day's end — a short nightly ritual/minigame (closing tabs, kicking out stragglers, doing a stock count) that's low-stakes most nights but occasionally spikes into a real decision point (a VIP wants one more round past close — serve them and risk a Church/Council penalty, or refuse and lose reputation).
* New Game+/prestige for replayability — since there are 4 possible home cities, consider whether beating the game once should unlock a harder mode, a different endgame flavor per starting city, or cross-save bragging rights (e.g., "Aleforge start, 41 minutes" as a leaderboard category alongside overall fastest).
* Accessibility valve for the twitch layer — even hardcore-target games benefit from a difficulty/reflex-window setting (extend prompt timers by X%) so you don't accidentally gate out players with slower reaction times who still want the strategic depth; consider whether you want this as a real settings option even if the "true" leaderboard requires default timing.
* Save/resume — given the real-time nature, decide explicitly whether the game pauses when the tab loses focus/closes, or keeps running "offline" and reconciles on return (each has very different design implications for a competitive leaderboard — I'd lean toward pausing on tab-close for fairness, but flag this decision back to me if you disagree).

Deliverable format

* Single GitHub Pages-hostable static site: HTML/CSS/JS (vanilla or a lightweight framework bundled to static output — your call, but justify the choice), no server-side runtime required except for the Google-Sheets-backed leaderboard write path described above.
* Clean, documented repo structure separating: game engine/loop code, city/rival AI logic, content data (drinks/events/names — ideally in a structured data file so I can easily edit copy and add content later without touching code), assets (with license attributions), and the leaderboard integration.
* Do not start building yet. This document is the brief. Before writing code, restate your understanding of the scope back to me, flag any open questions (especially around the leaderboard backend approach, the game-time-to-real-time ratio, the background-simulation-vs-pause question in "The two views," and the tuning of crisis-event frequency/pool size), and propose a build order/milestone plan so we can check in before you sink hours into any one system.


design choices. each town should have its own distinct design, pull from the lore here. providence is more medieval and uses more stone and more developed building techniques. shanty town is a chaotic collection of crashed ships so primarily wood with some bright colorful flags. roto kaiishi is a lot of market stalls stacked on top of each other in the ocean, primarily black, grey and red color tones. aleforge is a bit more whimsical with different colored roofs in interesting shapes. 

last but not least, i will be using opus 5.5 ultracode for the planning phase then move to opus 5.5 high for actual execution

---

## Planning-phase answers (verbatim, in order)

1. "one last note, read the lore documentation in my google drive, main lore, hoegaarden doc and economy pitch for some context."
2. **Time scale:** "1 season per shift, late era choice. no hard stop."
3. **Assets:** "you will be in a container that can access those sites so still use them"
4. **Pausing:** "Clock stops, board hidden"
5. **Losing:** "Rival race + deadline (Recommended)"
6. **What "no hard stop" means:** "you will win only if you are leading at year 463 and get chosen for the sponsor ship. there will also be an option to continue playing in "freeplay." similar to sid miers civilization 1 more turn mechanic. if you continue in freeplay, include a note telling the player that they did not achieve the sponsorship and their time will not included on the leaderboard"
7. **Scoring:** "one small inconsistency i thought of. the game ends in year 463 when you get chosen for the sponsorship but the main goal is become the biggest tavern company in the isles in the shortest amount of time. there should be some other metric by which players are being scored in order to achieve that goal independent of the date."
   The plan answers this with Company Value (CV) and the leaderboard metric "time to Top Tap" (PLAN §1, §2.6).
