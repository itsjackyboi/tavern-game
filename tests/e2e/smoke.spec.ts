import { expect, test } from '@playwright/test';

// M0 exit: open the letter, close it, Play becomes prominent, Play, the canvas appears.
test('letter → play → tavern floor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?debug&seed=smoke');
  await expect(page.getByRole('heading', { name: 'Last Call' })).toBeVisible();

  const play = page.getByTestId('play');
  await expect(play).toHaveClass(/play-muted/);
  await page.screenshot({ path: 'tests/e2e/__screens__/m0-title.png', animations: 'disabled' });

  await page.getByTestId('letter-envelope').click();
  const letter = page.getByTestId('letter-open');
  await expect(letter).toBeVisible();
  await expect(letter).toContainText('PLACEHOLDER');
  await page.screenshot({ path: 'tests/e2e/__screens__/m0-letter.png', animations: 'disabled' });
  await page.getByTestId('letter-close').click();

  await expect(play).toHaveClass(/play-prominent/);
  await page.getByTestId('city-providence').click();
  await play.click();

  await expect(page.locator('[data-testid="board"] canvas')).toBeVisible();
  await expect(page.getByTestId('hud')).toContainText('Y448');
  await expect(page.getByTestId('hud')).toContainText('Stormtide');

  // The sim runs in real time: the tick count grows.
  await page.waitForFunction(() => (window.__game?.tick() ?? 0) > 20);
  await page.screenshot({ path: 'tests/e2e/__screens__/m0-floor-day.png', animations: 'disabled' });

  // Jump to night via the debug hook and check the HUD follows.
  await page.evaluate(() => window.__game!.step(900));
  await expect(page.getByTestId('hud-phase')).toHaveClass(/phase-night/);
  await page.screenshot({ path: 'tests/e2e/__screens__/m0-floor-night.png', animations: 'disabled' });

  expect(errors).toEqual([]);
});

test('pause stops the clock and hides the board', async ({ page }) => {
  await page.goto('/?debug&seed=pause');
  await page.getByTestId('play').click();
  await page.waitForFunction(() => (window.__game?.tick() ?? 0) > 5);

  await page.keyboard.press('p');
  await expect(page.getByTestId('pause-veil')).toBeVisible();
  const t0 = await page.evaluate(() => window.__game!.tick());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__game!.tick())).toBe(t0);
  const clock = await page.getByTestId('hud-clock').textContent();
  await page.screenshot({ path: 'tests/e2e/__screens__/m0-paused.png', animations: 'disabled' });

  await page.waitForTimeout(1100);
  expect(await page.getByTestId('hud-clock').textContent()).toBe(clock);

  await page.getByRole('button', { name: /Resume/ }).click();
  await expect(page.getByTestId('pause-veil')).toBeHidden();
  await page.waitForFunction((t) => window.__game!.tick() > t, t0);
});

test('dev.html sprite gallery renders', async ({ page }) => {
  await page.goto('/dev.html');
  await expect(page.locator('figure').first()).toBeVisible();
  expect(await page.locator('figure').count()).toBeGreaterThan(20);
});
