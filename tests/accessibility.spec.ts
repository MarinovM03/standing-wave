import { expect, test, type Locator } from '@playwright/test';

async function watch(region: Locator): Promise<() => Promise<string[]>> {
  await region.evaluate(element => {
    const said: string[] = [];
    (element as HTMLElement & { said?: string[] }).said = said;
    new MutationObserver(() => said.push(element.textContent ?? '')).observe(element, { childList: true, characterData: true, subtree: true });
  });
  return () => region.evaluate(element => [...((element as HTMLElement & { said?: string[] }).said ?? [])]);
}

test('the live region is silent at load, then says one sentence per band, mode or view change', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  const canvas = page.getByRole('application', { name: 'Interactive acoustic room' });
  const region = page.locator('#announcer');
  await expect(canvas).toHaveAccessibleDescription(/Nodes are quiet planes; antinodes are pressure peaks/);
  await expect(region).toHaveAttribute('aria-live', 'polite');
  await expect(region).toHaveAttribute('role', 'status');
  await expect(page.locator('#pressure-summary'), 'The old live summary is gone').toHaveCount(0);
  for (const output of await page.locator('output').all()) await expect(output).toHaveAttribute('aria-live', 'off');
  const said = await watch(region);
  await page.waitForTimeout(1000);
  expect(await said(), 'Nothing is announced at load').toEqual([]);
  await expect(region).toHaveText('');

  await page.getByRole('button', { name: 'Mic to a node' }).click();
  await expect(region).toHaveText(/^The mic is in a node band, at −3\d\.\d dB\.$/);
  await canvas.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(900);
  expect(await said(), 'A step inside the band says nothing new').toHaveLength(1);

  await page.getByRole('button', { name: 'Mic to the corner' }).click();
  await expect(region).toHaveText(/^The mic is in an antinode band, at −0\.\d dB\.$/);
  await page.locator('[data-mode="2"]').click();
  await expect(region).toHaveText('Width mode (0, 1, 0) at 42.9 Hz.');
  await page.keyboard.press('v');
  await expect(region).toHaveText("You'd think view: the level only falls with distance from the speaker.");
  await expect(canvas).toHaveAccessibleDescription(/Farther from the speaker is quieter; closer is louder/);
  await page.locator('#view-right').click();
  await expect(region).toHaveText('Actually view: width mode (0, 1, 0) at 42.9 Hz.');
  expect(await said(), 'One sentence per settled change').toHaveLength(5);
  expect(errors).toEqual([]);
});

test('the live region waits out a scrub and names a speaker on a node once', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('[data-callout="mic"]')).toBeVisible();
  const region = page.locator('#announcer');
  const said = await watch(region);
  const slider = (await page.locator('#frequency').boundingBox())!;
  await page.mouse.move(slider.x + 4, slider.y + slider.height / 2);
  await page.mouse.down();
  await page.mouse.move(slider.x + slider.width * 0.6, slider.y + slider.height / 2, { steps: 12 });
  await page.waitForTimeout(1000);
  expect(await said(), 'Nothing is said while the scrub is held').toHaveLength(0);
  await page.mouse.up();
  await expect(region).toHaveText(/^(Length|Width|Height) mode \(\d, \d, \d\) at \d+\.\d Hz(, with the speaker on its node)?\.$/);
  expect(await said(), 'The scrub settles into one sentence').toHaveLength(1);

  await page.keyboard.press('1');
  await expect(region).toHaveText('Length mode (1, 0, 0) at 28.6 Hz.');
  await page.locator('#speaker-middle').click();
  await expect(region).toHaveText("The speaker is on a node, so it can't drive this mode.");
  await page.locator('#speaker-middle').click();
  await page.waitForTimeout(900);
  expect(await said(), 'A speaker on a node is announced once').toHaveLength(3);
  expect(errors).toEqual([]);
});

test('help opens a drawer that keeps focus, closes on Esc or Shift+R and hands focus back to Help', async ({ page }) => {
  await page.goto('./');
  const help = page.locator('#help');
  const drawer = page.getByRole('dialog', { name: 'Help' });
  await expect(help).toHaveAttribute('aria-controls', 'help-drawer');
  await expect(help).toHaveAttribute('aria-haspopup', 'dialog');
  await help.focus();
  await page.keyboard.press('Enter');
  await expect(drawer).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close help' })).toBeFocused();
  for (const heading of ['The idea', 'Try this', "What's real", "What's simplified", 'Sources', 'Keys']) {
    await expect(drawer.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(drawer.locator('.drawer__steps li')).toHaveCount(5);
  await expect(drawer.locator('.drawer__steps li').last()).toContainText('speaker');

  const stops = await drawer.evaluate(element => Array.from(element.querySelectorAll('button, a[href]')).filter(stop => stop.getClientRects().length > 0).length);
  const inside: boolean[] = [];
  for (let index = 0; index < stops + 2; index++) {
    await page.keyboard.press('Tab');
    inside.push(await page.evaluate(() => document.querySelector('#help-drawer')!.contains(document.activeElement)));
  }
  await page.keyboard.press('Shift+Tab');
  inside.push(await page.evaluate(() => document.querySelector('#help-drawer')!.contains(document.activeElement)));
  expect(inside, 'Focus stays inside the drawer').not.toContain(false);
  const mic = page.locator('[data-callout="mic"]');
  const position = await mic.getAttribute('data-position');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('3');
  await expect(mic, 'Shortcuts wait while help is open').toHaveAttribute('data-position', position!);
  await expect(page.locator('#readout-mode')).toHaveText('(1, 0, 0)');

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(help, 'Esc hands focus back to Help').toBeFocused();

  for (const key of ['h', '?']) {
    await page.locator('canvas').focus();
    await page.keyboard.press(key);
    await expect(drawer, `${key} opens help`).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(help).toBeFocused();
  }

  await page.keyboard.press('h');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Shift+R');
  await expect(drawer, 'Shift+R closes help').toBeHidden();
  await expect(help).toBeFocused();

  await help.click();
  await expect(drawer).toBeVisible();
  await page.getByRole('button', { name: 'Close help' }).click();
  await expect(drawer).toBeHidden();
  await page.keyboard.press('Space');
  await expect(page.locator('#play'), 'After a click on Close, Space plays the note').toHaveAttribute('aria-pressed', 'true');
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
