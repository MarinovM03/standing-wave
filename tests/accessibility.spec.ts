import { expect, test } from '@playwright/test';

test('pressure legend explains both models and announces settled mode and band changes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  const legend = page.getByRole('group', { name: 'PRESSURE AMPLITUDE' });
  const summary = page.locator('#pressure-summary');
  await expect(legend).toHaveAccessibleDescription(/Nodes are quiet planes; antinodes are pressure peaks/);
  await expect(summary).toHaveAttribute('aria-live', 'polite');
  for (const output of await page.locator('output').all()) await expect(output).toHaveAttribute('aria-live', 'off');
  await expect(summary).toContainText('Nearest length mode (1, 0, 0)');

  await page.getByRole('button', { name: 'Find a node' }).click();
  await expect(summary).toContainText('Listener: quiet spot.');
  const quietSummary = await summary.textContent();
  await summary.evaluate(element => {
    element.dataset.mutations = '0';
    new MutationObserver(records => {
      element.dataset.mutations = String(Number(element.dataset.mutations) + records.length);
    }).observe(element, { childList: true });
  });
  const reading = await page.locator('#level-db').textContent();
  await page.getByRole('application', { name: 'Interactive acoustic room' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#level-db')).not.toHaveText(reading!);
  await page.waitForTimeout(250);
  await expect(summary).toHaveText(quietSummary!);
  await expect(summary).toHaveAttribute('data-mutations', '0');

  await page.getByRole('button', { name: 'Try a corner' }).click();
  await expect(summary).toContainText('Listener: pressure peak.');
  await page.locator('[data-axis="width"]').click();
  await expect(summary).toContainText('Nearest width mode (0, 1, 0)');
  await page.locator('#belief-button').click();
  await expect(legend).toHaveAccessibleDescription(/Farther from the speaker is quieter; closer is louder/);
  await expect(summary).toContainText('Speaker only. Level falls with distance.');
  await summary.evaluate(element => { element.dataset.mutations = '0'; });
  await page.locator('#frequency').focus();
  await page.keyboard.press('End');
  await expect(page.locator('#frequency-number')).toHaveValue('200.0');
  await page.waitForTimeout(250);
  await expect(summary).toHaveAttribute('data-mutations', '0');
  await page.locator('#physics-button').click();
  await expect(summary).toContainText('Room interference.');
  expect(errors).toEqual([]);
});

test('canvas is keyboard reachable, describes its controls and lets focus leave', async ({ page }) => {
  await page.goto('./');
  const canvas = page.getByRole('application', { name: 'Interactive acoustic room' });
  await expect(canvas).toHaveAccessibleDescription(/Use arrow keys to move the listener/);
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab');
    if (await canvas.evaluate(element => element === document.activeElement)) break;
  }
  await expect(canvas).toBeFocused();
  expect(await canvas.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
  const position = await page.locator('#position-readout').textContent();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#position-readout')).not.toHaveText(position!);
  await page.keyboard.press('Tab');
  await expect(page.locator('#belief-button')).toBeFocused();
});
