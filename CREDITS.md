# Credits

Last Call uses free, openly licensed art, fonts and sound effects. Every pack's original
licence file is kept in [`public/assets/licenses/`](public/assets/licenses/) and ships with
the game.

The files are downloaded by [`tools/fetch-assets.mjs`](tools/fetch-assets.mjs), which reads
[`tools/assets.config.json`](tools/assets.config.json). They come from the public mirror
[series-ai/jam-ready-assets](https://github.com/series-ai/jam-ready-assets), which records the
source and licence of every pack.

## Art, fonts and sound effects

All packs below are by **Kenney** ([kenney.nl](https://kenney.nl)), released under
**CC0 1.0 (public domain)**. Attribution is not required, but it is given here with thanks.

| Pack (id) | Used for | Files |
|---|---|---|
| Tiny Town (`kenney-tiny-town`) | town and world-map tiles, buildings, props | `public/assets/sprites/tiny-town.png` |
| Tiny Dungeon (`kenney-tiny-dungeon`) | characters (patrons, staff, avatar), interior floors and walls, items | `public/assets/sprites/tiny-dungeon.png` |
| UI Pack: Pixel Adventure (`kenney-ui-pack-pixel-adventure`) | parchment, wood and steel frames and buttons | `public/assets/ui/*` |
| Kenney Fonts (`kenney-fonts`) | Kenney Pixel and Kenney Mini UI fonts | `public/assets/fonts/*` |
| Interface Sounds (`kenney-interface-sounds`) | UI clicks, confirm, error, glass clink | `public/assets/audio/ui-*.ogg`, `glass-clink.ogg` |
| RPG Audio (`kenney-rpg-audio`) | coin and sale sounds | `public/assets/audio/coin-*.ogg` |
| Impact Sounds (`kenney-impact-sounds`) | brawl thuds, dropped kegs | `public/assets/audio/thud-*.ogg`, `punch-*.ogg` |
| Tiny Factory (`kenney-tiny-factory`) | brewing kettles, tanks, crates and pipes for interiors | `public/assets/sprites/tiny-factory.png` |
| Roguelike Characters (`kenney-roguelike-characters`) | layered patron and staff characters (bodies, clothes, hair, hats) | `public/assets/sprites/roguelike-characters.png` |

Tiny Factory and Roguelike Characters were supplied directly by the project owner as the
original Kenney zips; their licence files are copied into `public/assets/licenses/`.

## Code libraries

| Library | Licence |
|---|---|
| [Phaser](https://phaser.io) 3.90 | MIT |
| [Preact](https://preactjs.com) and @preact/signals | MIT |
| [zod](https://zod.dev) | MIT |

## Adding a pack

Only CC0 packs are configured so far. CC-BY packs are allowed, but each needs an attribution
line in this file naming the author, the work and the licence. Add the pack to
`tools/assets.config.json`, run `npm run fetch-assets`, then add a row here.
`tests/assets.test.ts` fails if a configured pack has no licence file or no row in this file.
