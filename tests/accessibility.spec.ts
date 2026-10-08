import { expect, test } from '@playwright/test';

test('the canvas explains the active view and the live region announces settled mode and band changes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  const canvas = page.getByRole('application', { name: 'Interactive acoustic room' });
  const summary = page.locator('#pressure-summary');
  await expect(canvas).toHaveAccessibleDescription(/Nodes are quiet planes; antinodes are pressure peaks/);
  await expect(summary).toHaveAttribute('aria-live', 'polite');
  for (const output of await page.locator('output').all()) await expect(output).toHaveAttribute('aria-live', 'off');
  await expect(summary).toContainText('Nearest length mode (1, 0, 0)');

  await page.getByRole('button', { name: 'Mic to a node' }).click();
  await expect(summary).toContainText('Listener: quiet spot.');
  const quietSummary = await summary.textContent();
  await summary.evaluate(element => {
    element.dataset.mutations = '0';
    new MutationObserver(records => {
      element.dataset.mutations = String(Number(element.dataset.mutations) + records.length);
    }).observe(element, { childList: true });
  });
  const reading = await page.locator('#readout-level').getAttribute('data-value');
  await canvas.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#readout-level')).not.toHaveAttribute('data-value', reading!);
  await page.waitForTimeout(250);
  await expect(summary).toHaveText(quietSummary!);
  await expect(summary).toHaveAttribute('data-mutations', '0');

  await page.getByRole('button', { name: 'Mic to the corner' }).click();
  await expect(summary).toContainText('Listener: pressure peak.');
  await page.locator('[data-mode="2"]').click();
  await expect(summary).toContainText('Nearest width mode (0, 1, 0)');
  await page.locator('#view-wrong').click();
  await expect(canvas).toHaveAccessibleDescription(/Farther from the speaker is quieter; closer is louder/);
  await expect(summary).toContainText('Speaker only. Level falls with distance.');
  await summary.evaluate(element => { element.dataset.mutations = '0'; });
  await page.locator('#frequency').focus();
  await page.keyboard.press('End');
  await expect(page.locator('#frequency-number')).toHaveValue('200.0');
  await page.waitForTimeout(250);
  await expect(summary).toHaveAttribute('data-mutations', '0');
  await page.locator('#view-right').click();
  await expect(summary).toContainText('Room interference.');
  await expect(canvas).toHaveAccessibleDescription(/Nodes are quiet planes/);
  expect(errors).toEqual([]);
});

test('canvas is keyboard reachable, describes its controls and lets focus leave', async ({ page }) => {
  await page.goto('./');
  const canvas = page.getByRole('application', { name: 'Interactive acoustic room' });
  await expect(canvas).toHaveAccessibleDescription(/Use the arrow keys to move the mic/);
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab');
    if (await canvas.evaluate(element => element === document.activeElement)) break;
  }
  await expect(canvas).toBeFocused();
  expect(await canvas.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
  const mic = page.locator('[data-callout="mic"]');
  const position = await mic.getAttribute('data-position');
  await page.keyboard.press('ArrowLeft');
  await expect(mic).not.toHaveAttribute('data-position', position!);
  await page.keyboard.press('Tab');
  await expect(page.locator('#view-wrong')).toBeFocused();
});

test('Tab reaches every top-right button and dock control in order, each with a visible focus ring', async ({ page }) => {
  await page.goto('./');
  const expected = [
    'sound', 'cinematic', 'share', 'help', 'follow', 'canvas',
    'view-wrong', 'view-right', 'frequency', 'frequency-number', 'play',
    'mode-1', 'mode-2', 'mode-3', 'mode-4', 'height', 'mic-node', 'mic-corner', 'speaker-middle',
  ];
  await page.evaluate(() => {
    const log: string[] = (window as Window & { focusLog?: string[] }).focusLog = [];
    document.addEventListener('focusin', event => {
      const focused = event.target as HTMLElement;
      const style = getComputedStyle(focused.closest('.number') ?? focused);
      const visible = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
      const name = focused.id || (focused.matches('canvas') ? 'canvas' : focused.className);
      log.push(visible ? name : `${name} without a focus ring`);
    });
  });
  for (let index = 0; index < expected.length; index++) await page.keyboard.press('Tab');
  const reached = await page.evaluate(() => (window as Window & { focusLog?: string[] }).focusLog);
  expect(reached).toEqual(expected);
});
