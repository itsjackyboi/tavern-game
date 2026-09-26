import { expect, test, type Page } from '@playwright/test';

const SHOTS = 'tests/e2e/__screens__';

async function startRun(page: Page, query: string, city = 'aleforge'): Promise<void> {
  await page.goto(`/?${query}`);
  await page.getByTestId(`city-${city}`).click();
  await page.getByTestId('play').click();
  await expect(page.locator('[data-testid="board"] canvas')).toBeVisible();
  await page.waitForFunction(() => (window.__game?.tick() ?? 0) > 5);
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
  await expect(letter).toContainText('PLACEHOLDER');
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
  await expect(page.getByTestId('end-screen')).toContainText('Monopoly!');
  expect(await page.evaluate(() => window.__game!.status())).toBe('won');

  await page.getByTestId('lb-name').fill('Tester');
  await page.getByTestId('lb-submit').click();
  await expect(page.getByTestId('lb-submit')).toHaveText('On the board!');
  await page.screenshot({ path: `${SHOTS}/end-monopoly.png`, animations: 'disabled' });

  // A win unlocks NG+ on the title screen.
  await page.getByRole('button', { name: 'New run' }).click();
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
