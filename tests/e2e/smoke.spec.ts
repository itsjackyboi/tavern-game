import { expect, test, type Page } from '@playwright/test';

const SHOTS = 'tests/e2e/__screens__';

async function startRun(page: Page, query: string, city = 'aleforge'): Promise<void> {
  await page.goto(`/?${query}`);
  await page.getByTestId(`city-${city}`).click();
  await page.getByTestId('play').click();
  await expect(page.locator('[data-testid="board"] canvas')).toBeVisible();
  await page.waitForFunction(() => (window.__game?.tick() ?? 0) > 5);
}

/** Drags the first waiting patron onto a free table with the real mouse. Returns the patron id. */
async function dragPatronToTable(page: Page): Promise<number> {
  let waiting: { id: number; x: number; y: number } | undefined;
  for (let i = 0; i < 60 && !waiting; i++) {
    await page.evaluate(() => window.__game!.step(20));
    waiting = (await page.evaluate(() => window.__game!.floor()))?.patrons.find((p) => p.state === 'waiting');
  }
  expect(waiting).toBeTruthy();
  const snap = (await page.evaluate(() => window.__game!.floor()))!;
  const table = snap.tables.find((t) => t.free && !t.dirty)!;
  const box = (await page.locator('[data-testid="board"] canvas').boundingBox())!;
  const scale = box.width / 480;
  const at = (x: number, y: number) => ({ x: box.x + (x + 0.5) * 16 * scale, y: box.y + (y + 0.3) * 16 * scale });
  const p = snap.patrons.find((q) => q.id === waiting!.id)!;
  const from = at(p.x, p.y);
  const to = at(table.x, table.y);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await page.evaluate(() => window.__game!.step(2));
  return waiting!.id;
}

test('letter → play → tavern floor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?debug&seed=smoke');
  await expect(page.getByRole('heading', { name: 'Last Call' })).toBeVisible();

  const play = page.getByTestId('play');
  await expect(play).toHaveClass(/play-muted/);
  await page.screenshot({ path: `${SHOTS}/title.png`, animations: 'disabled' });

  await page.getByTestId('letter-envelope').click();
  const letter = page.getByTestId('letter-open');
  await expect(letter).toBeVisible();
  await expect(letter).toContainText('Gregor Ashford');
  await expect(letter).not.toContainText('PLACEHOLDER');
  await page.screenshot({ path: `${SHOTS}/letter.png`, animations: 'disabled' });
  await page.getByTestId('letter-close').click();

  await expect(play).toHaveClass(/play-prominent/);
  await page.getByTestId('city-providence').click();
  await play.click();

  await expect(page.locator('[data-testid="board"] canvas')).toBeVisible();
  await expect(page.getByTestId('hud')).toContainText('Y448');
  await expect(page.getByTestId('hud')).toContainText('Stormtide');

  // The sim runs in real time: the tick count grows.
  await page.waitForFunction(() => (window.__game?.tick() ?? 0) > 20);
  await page.evaluate(() => window.__game!.step(300));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/floor-day.png`, animations: 'disabled' });

  // Jump to night via the debug hook and check the HUD follows.
  await page.evaluate(() => window.__game!.step(600));
  await expect(page.getByTestId('hud-phase')).toHaveClass(/phase-night/);
  await page.screenshot({ path: `${SHOTS}/floor-night.png`, animations: 'disabled' });

  expect(errors).toEqual([]);
});

test('pause stops the clock and hides the board', async ({ page }) => {
  await startRun(page, 'debug&seed=pause');

  await page.keyboard.press('p');
  await expect(page.getByTestId('pause-veil')).toBeVisible();
  const t0 = await page.evaluate(() => window.__game!.tick());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__game!.tick())).toBe(t0);
  const clock = await page.getByTestId('hud-clock').textContent();
  await page.screenshot({ path: `${SHOTS}/paused.png`, animations: 'disabled' });

  await page.waitForTimeout(1100);
  expect(await page.getByTestId('hud-clock').textContent()).toBe(clock);

  await page.getByRole('button', { name: /Resume/ }).click();
  await expect(page.getByTestId('pause-veil')).toBeHidden();
  await page.waitForFunction((t) => window.__game!.tick() > t, t0);
});

test('map view, drawers and the sim keep running across views', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startRun(page, 'debug&seed=views', 'shanty');

  const t0 = await page.evaluate(() => window.__game!.tick());
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__game!.view() === 'world');
  await page.waitForFunction((t) => window.__game!.tick() > t + 10, t0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/world.png`, animations: 'disabled' });

  await page.getByTestId('view-toggle').click();
  await page.waitForFunction(() => window.__game!.view() === 'floor');

  for (const [key, title] of [['s', 'Staff'], ['m', 'Menu'], ['u', 'Build'], ['k', 'Brewing'], ['f', 'Ledger'], ['h', 'How to play']] as const) {
    await page.keyboard.press(key);
    await expect(page.getByTestId('drawer')).toContainText(title);
  }
  await page.screenshot({ path: `${SHOTS}/drawer-help.png`, animations: 'disabled' });
  await page.keyboard.press('Escape');

  // Hire a tapster from the staff drawer and see them on the payroll.
  await page.keyboard.press('s');
  await page.getByTestId('drawer').locator('tbody tr').first().locator('button').first().click();
  await expect(page.getByTestId('drawer')).not.toContainText('Nobody yet.');
  await page.screenshot({ path: `${SHOTS}/drawer-staff.png`, animations: 'disabled' });

  // Run a few seasons: prompts arrive and the log ticker fills.
  await page.evaluate(() => window.__game!.step(3000));
  await expect(page.getByTestId('ticker')).not.toBeEmpty();
  await page.screenshot({ path: `${SHOTS}/later.png`, animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('monopoly win → end screen → leaderboard (mock board)', async ({ page }) => {
  await startRun(page, 'debug&seed=mono&lbmock=ok');
  await page.evaluate(() => {
    window.__game!.grant(1_000_000);
    window.__game!.step(4000);
  });
  await expect(page.getByTestId('end-screen')).toBeVisible();
  await expect(page.getByTestId('end-screen')).toContainText('State sanctioned monopoly!');
  await expect(page.getByTestId('end-screen')).toContainText('has been chosen as the official brewer');
  await expect(page.getByTestId('end-stats')).toContainText('Company Value');
  expect(await page.evaluate(() => window.__game!.status())).toBe('won');

  await page.getByTestId('lb-name').fill('Tester');
  await page.getByTestId('lb-submit').click();
  await expect(page.getByTestId('lb-submit')).toHaveText('On the board!');
  await page.screenshot({ path: `${SHOTS}/end-monopoly.png`, animations: 'disabled' });

  // A win unlocks NG+ on the title screen.
  await page.getByTestId('return-menu').click();
  await expect(page.getByText('NG+')).toBeVisible();

  await page.getByTestId('open-leaderboard').click();
  const board = page.getByTestId('leaderboard');
  await expect(board).toContainText('Tester');
  await page.screenshot({ path: `${SHOTS}/leaderboard.png`, animations: 'disabled' });
  await board.getByRole('button', { name: 'Highest Company Value' }).click();
  await expect(board).toContainText('Tester');
});

test('leaderboard failures queue the run instead of losing it', async ({ page }) => {
  await startRun(page, 'debug&seed=fail&lbmock=fail');
  await page.evaluate(() => {
    window.__game!.grant(1_000_000);
    window.__game!.step(4000);
  });
  await page.getByTestId('lb-name').fill('Offline');
  await page.getByTestId('lb-submit').click();
  await expect(page.getByTestId('lb-submit')).toHaveText('Queued, will retry');
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('last-call:outbox') ?? '[]').length);
  expect(queued).toBe(1);
});

test('a run survives a reload and resumes paused', async ({ page }) => {
  await page.goto('/?seed=resume');
  await page.getByTestId('play').click();
  await expect(page.locator('[data-testid="board"] canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.reload();
  const cont = page.getByTestId('continue');
  await expect(cont).toBeVisible();
  await cont.click();
  await expect(page.getByTestId('pause-veil')).toBeVisible();
  await page.getByRole('button', { name: /Resume/ }).click();
  await expect(page.getByTestId('pause-veil')).toBeHidden();
});

test('dev.html sprite gallery renders', async ({ page }) => {
  await page.goto('/dev.html');
  await expect(page.locator('figure').first()).toBeVisible();
  expect(await page.locator('figure').count()).toBeGreaterThan(20);
});

test('drag a waiting patron onto a table with the mouse', async ({ page }) => {
  await startRun(page, 'debug&seed=drag');
  const id = await dragPatronToTable(page);
  const after = (await page.evaluate(() => window.__game!.floor()))!.patrons.find((q) => q.id === id);
  expect(after?.state).not.toBe('waiting');
});

test('version tag shows on the title and in game', async ({ page }) => {
  await page.goto('/?debug&seed=ver');
  await expect(page.getByTestId('version')).toHaveText('v1.4');
  await page.getByTestId('play').click();
  await expect(page.getByTestId('version')).toHaveText('v1.4');
});

test('decisions sit bottom-right, show their effects, and leave a receipt', async ({ page }) => {
  await startRun(page, 'debug&seed=layout');
  for (let i = 0; i < 40 && (await page.locator('.right-panel [data-testid="prompt-card"]').count()) === 0; i++) {
    await page.evaluate(() => window.__game!.step(200));
  }
  const card = page.locator('.right-panel [data-testid="prompt-card"]').first();
  await expect(card).toBeVisible();
  await expect(page.locator('.left-panel [data-testid="prompt-card"]')).toHaveCount(0);
  await expect(card.locator('.opt-effects').first()).not.toBeEmpty();
  await page.screenshot({ path: `${SHOTS}/decision.png`, animations: 'disabled' });
  await page.keyboard.press('1');
  await expect(page.getByTestId('receipts')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/receipt.png`, animations: 'disabled' });
  const rows = page.locator('[data-testid="league"] .league-row');
  expect(await rows.count()).toBeGreaterThan(8);
  await expect(page.locator('[data-testid="league"] .league-row.me')).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/layout.png`, animations: 'disabled' });
});

test('running out of Duckets puts up a banner that stays', async ({ page }) => {
  await startRun(page, 'debug&seed=broke');
  await page.evaluate(() => window.__game!.drain());
  await expect(page.getByTestId('money-alert')).toBeVisible();
  await expect(page.getByTestId('money-alert')).toContainText('Out of Duckets');
  await page.screenshot({ path: `${SHOTS}/out-of-duckets.png`, animations: 'disabled' });
});

test('the Last Call bell closes the doors', async ({ page }) => {
  await startRun(page, 'debug&seed=bell');
  for (let i = 0; i < 80 && (await page.evaluate(() => window.__game!.phase())) !== 'lastCall'; i++) {
    await page.evaluate(() => window.__game!.step(20));
  }
  await page.keyboard.press('b');
  await expect(page.getByTestId('toasts')).toContainText('Doors closed');
  await page.screenshot({ path: `${SHOTS}/doors-closed.png`, animations: 'disabled' });
});

test('pause menu: save & return to title, then continue', async ({ page }) => {
  await page.goto('/?seed=exit');
  await page.getByTestId('play').click();
  await expect(page.locator('[data-testid="board"] canvas')).toBeVisible();
  await page.waitForTimeout(800);
  await page.keyboard.press('p');
  await expect(page.getByTestId('pause-veil')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/pause-menu.png`, animations: 'disabled' });
  await page.getByTestId('exit-title').click();
  await expect(page.getByTestId('continue')).toBeVisible();
  // Starting a new run now asks first.
  await page.getByTestId('play').click();
  await expect(page.getByTestId('play')).toHaveText('Abandon saved run?');
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('pause-veil')).toBeVisible();
});

test('tutorial walks through the first steps', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug');
  await page.getByTestId('tutorial-start').click();
  const coach = page.getByTestId('tutorial');
  await expect(coach).toContainText('Welcome');
  await page.screenshot({ path: `${SHOTS}/tutorial-welcome.png`, animations: 'disabled' });
  await page.getByTestId('tutorial-next').click();
  await expect(coach).toContainText('Seat a patron');
  await dragPatronToTable(page);
  await expect(coach).toContainText('Pour and serve');
  await page.screenshot({ path: `${SHOTS}/tutorial-serve.png`, animations: 'disabled' });
  await page.getByTestId('tutorial-skip').click();
  await expect(coach).toContainText('Kegs and taps');
  await page.getByTestId('tutorial-end').click();
  await expect(coach).toBeHidden();
  expect(errors).toEqual([]);
});

test('the ledger shows totals by reason and a year-by-year chart', async ({ page }) => {
  await startRun(page, 'debug&seed=ledger');
  await page.evaluate(() => window.__game!.step(9000));
  // The news feed on the left keeps up with the Isles.
  await expect(page.locator('.feed .tick-line').first()).toBeVisible();
  await page.keyboard.press('f');
  await expect(page.getByTestId('ledger-totals')).toContainText('Rent');
  await expect(page.getByTestId('profit-chart').locator('path').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/ledger.png`, animations: 'disabled' });
  await page.keyboard.press('k');
  await expect(page.getByTestId('sales')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/brew-sales.png`, animations: 'disabled' });
});

test('a new brew chimes and says so; a dud batch is just crossed off', async ({ page }) => {
  await startRun(page, 'debug&seed=brew');
  await page.keyboard.press('k');
  const drawer = page.getByTestId('drawer');
  await drawer.getByRole('button', { name: 'Barley & Wheat' }).click();
  await drawer.getByRole('button', { name: 'Hops' }).click();
  await drawer.getByRole('button', { name: /Brew a test batch/ }).click();
  await expect(page.getByTestId('toasts')).toContainText('New brew discovered: Hall of Ale Amber');
  await expect(drawer.getByTestId('recipe-new')).toContainText('Hall of Ale Amber');
  await expect(drawer.getByTestId('brew-result')).toContainText('A new recipe');
  await page.screenshot({ path: `${SHOTS}/brew-discovery.png`, animations: 'disabled' });
  await drawer.getByRole('button', { name: 'Hops' }).click();
  await drawer.getByRole('button', { name: 'Roto Spice' }).click();
  await drawer.getByRole('button', { name: /Brew a test batch/ }).click();
  await expect(drawer.getByTestId('brew-result')).toContainText('Nothing new');
  await expect(page.locator('.toast-error')).toHaveCount(0);
});
