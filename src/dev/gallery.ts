import { SHEETS, SPRITES, TILE } from '../art/atlas.ts';

// dev.html: draws every named sprite so art can be reviewed at check-ins.
const COLS = 12;
const grid = document.getElementById('grid')!;

const images = Object.fromEntries(
  Object.entries(SHEETS).map(([k, s]) => {
    const img = new Image();
    img.src = s.url;
    return [k, img];
  }),
) as Record<keyof typeof SHEETS, HTMLImageElement>;

await Promise.all(Object.values(images).map((img) => img.decode()));

for (const [name, ref] of Object.entries(SPRITES)) {
  const fig = document.createElement('figure');
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d')!;
  const sx = (ref.frame % COLS) * TILE;
  const sy = Math.floor(ref.frame / COLS) * TILE;
  ctx.drawImage(images[ref.sheet], sx, sy, TILE, TILE, 0, 0, TILE, TILE);
  const cap = document.createElement('figcaption');
  cap.textContent = `${name} (${ref.sheet}#${ref.frame})`;
  fig.append(canvas, cap);
  grid.append(fig);
}
