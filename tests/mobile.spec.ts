import { expect, test, type CDPSession, type Page } from '@playwright/test';

type Point = { x: number; y: number };
type MobileProbe = {
  contexts: AudioContext[];
  gains: GainNode[];
  oscillators: OscillatorNode[];
  pointerTypes: string[];
};
declare global {
  interface Window { mobileProbe: MobileProbe }
}

let browserErrors: string[];

test.beforeEach(async ({ page }, testInfo) => {
  browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  await page.addInitScript(() => {
    const probe: MobileProbe = { contexts: [], gains: [], oscillators: [], pointerTypes: [] };
    window.mobileProbe = probe;
    document.addEventListener('pointerdown', event => probe.pointerTypes.push(event.pointerType), true);
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        probe.contexts.push(this);
      }

      override createGain(): GainNode {
        const gain = super.createGain();
        probe.gains.push(gain);
        return gain;
      }

      override createOscillator(): OscillatorNode {
        const oscillator = super.createOscillator();
        probe.oscillators.push(oscillator);
        return oscillator;
      }
    };
  });
  await page.goto('./');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('[data-callout="mic"]')).toBeVisible();
  await expect(page.locator('.webgl-fallback')).toHaveCount(0);
  // Any input lands the intro camera settle, so projected points hold still.
  await page.keyboard.press('Shift');
  await expect(page.locator('canvas')).toHaveAttribute('data-camera', 'home');
  expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  expect(await page.evaluate(() => innerWidth > innerHeight)).toBe(testInfo.project.name.endsWith('landscape'));
  expect(await page.evaluate(() => devicePixelRatio)).toBe(testInfo.project.use.deviceScaleFactor);
  const renderScale = await page.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).width / canvas.getBoundingClientRect().width);
  expect(renderScale, 'Coarse-pointer rendering stays within the mobile DPR budget').toBeLessThanOrEqual(1.51);
});

test.afterEach(async ({ page }) => {
  expect(browserErrors, 'No browser exceptions, WebGL errors, or failed resources').toEqual([]);
  const pointerTypes = await page.evaluate(() => window.mobileProbe.pointerTypes);
  expect(pointerTypes, 'Every test exercises native touch input').toContain('touch');
  expect(pointerTypes, 'Mobile tests never use mouse or hover input').not.toContain('mouse');
});

async function swipe(page: Page, from: Point, to: Point, onStart?: (session: CDPSession) => Promise<void>): Promise<void> {
  const session = await page.context().newCDPSession(page);
  const contact = (point: Point) => ({ id: 1, radiusX: 7, radiusY: 7, force: 1, ...point });
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [contact(from)] });
    await onStart?.(session);
    for (let step = 1; step <= 10; step++) {
      const fraction = step / 10;
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [contact({
          x: from.x + (to.x - from.x) * fraction,
          y: from.y + (to.y - from.y) * fraction,
        })],
      });
    }
  } finally {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  }
}

async function micTarget(page: Page): Promise<Point> {
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const callout = page.locator('[data-callout="mic"]');
  await expect(callout).toHaveAttribute('data-x', /\d/);
  await expect(callout).toHaveAttribute('data-y', /\d/);
  await expect(callout).toHaveAttribute('data-visible', 'true');
  await expect.poll(() => page.evaluate(() => {
    const element = document.querySelector<HTMLDivElement>('[data-callout="mic"]')!;
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    return document.elementFromPoint(rect.left + Number(element.dataset.x), rect.top + Number(element.dataset.y))?.tagName;
  }), { message: 'The resized projected mic head is exposed to touch' }).toBe('CANVAS');
  const point = await page.evaluate(() => {
    const element = document.querySelector<HTMLDivElement>('[data-callout="mic"]')!;
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: rect.left + Number(element.dataset.x), y: rect.top + Number(element.dataset.y) };
  });
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point),
    'The projected 3D mic head is exposed to touch').toBe('CANVAS');
  return point;
}

async function expectRoomAndFrequencyInViewport(page: Page): Promise<void> {
  const canvas = page.locator('canvas');
  await expect(canvas, 'The room is fully visible before any scrolling').toBeInViewport({ ratio: 1 });
  await expect(page.locator('#frequency'), 'Frequency is reachable in the first viewport').toBeInViewport({ ratio: 1 });
  const box = await canvas.boundingBox();
  expect(box!.width, 'The room has usable horizontal space').toBeGreaterThanOrEqual(220);
  expect(box!.height, 'The room has usable vertical space').toBeGreaterThanOrEqual(120);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function expectTouchTargets(page: Page): Promise<void> {
  const targets = await page.locator([
    '#frequency', '#height', '.actions button', '.dock button',
  ].join(',')).evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { name: element.id, width: box.width, height: box.height };
  }));
  for (const target of targets) {
    expect(target.width, `${target.name} has a 44px-wide touch area`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.name} has a 44px-high touch area`).toBeGreaterThanOrEqual(44);
  }
}

async function audioState(page: Page) {
  return page.evaluate(() => {
    const probe = window.mobileProbe;
    return {
      contextCount: probe.contexts.length,
      state: probe.contexts[0]?.state,
      gain: probe.gains[0]?.gain.value ?? 0,
      frequency: probe.oscillators[0]?.frequency.value ?? 0,
    };
  });
}

async function expectSoundControlVisible(page: Page): Promise<void> {
  const button = page.locator('#sound');
  await expect(button).toHaveCount(1);
  await expect(page.locator('.actions #sound')).toHaveCount(1);
  await expect(button, 'Sound stays available on the full-screen stage').toBeInViewport({ ratio: 1 });
  const box = await button.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await button.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('#sound') === element;
  }), 'The visible sound control is exposed to touch').toBe(true);
}

test('touch users can load, scrub, select every mode and compare sound models', async ({ page }) => {
  await expectRoomAndFrequencyInViewport(page);
  await expectTouchTargets(page);
  await expectSoundControlVisible(page);
  await expect(page.locator('#frequency-number')).toHaveValue('28.6');
  await expect(page.locator('#readout-wavelength')).toHaveAttribute('data-value', '12.00');
  const slider = page.locator('#frequency');
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  if (!box) throw new Error('Frequency slider has no touch target');
  expect(box.height).toBeGreaterThanOrEqual(44);
  await swipe(page,
    { x: box.x + box.width * 0.2, y: box.y + box.height / 2 },
    { x: box.x + box.width * 0.75, y: box.y + box.height / 2 });
  await expect.poll(async () => Number(await page.locator('#frequency-number').inputValue())).toBeGreaterThan(100);
  await expect(page.locator('#readout-wavelength')).not.toHaveAttribute('data-value', '12.00');

  for (const [preset, frequency, indices] of [
    ['3', '61.3', '(0, 0, 1)'],
    ['2', '42.9', '(0, 1, 0)'],
    ['1', '28.6', '(1, 0, 0)'],
  ]) {
    await page.locator(`[data-mode="${preset}"]`).tap();
    await expect(page.locator('#frequency-number')).toHaveValue(frequency);
    await expect(page.locator('#readout-mode')).toHaveText(indices);
  }

  await page.locator('#view-wrong').tap();
  await expect(page.locator('#view-wrong')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#readout-mode')).toHaveText('none');
  await page.locator('#view-right').tap();
  await expect(page.locator('#view-right')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#readout-mode')).toHaveText('(1, 0, 0)');

  // Exercise a live orientation transition, preserving the experiment in this page.
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: originalViewport.height, height: originalViewport.width });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectRoomAndFrequencyInViewport(page);
  await expectTouchTargets(page);
  await expect(page.locator('#frequency-number')).toHaveValue('28.6');
  const rotatedSlider = await slider.boundingBox();
  if (!rotatedSlider) throw new Error('Frequency slider disappeared after rotation');
  await swipe(page,
    { x: rotatedSlider.x + rotatedSlider.width * 0.2, y: rotatedSlider.y + rotatedSlider.height / 2 },
    { x: rotatedSlider.x + rotatedSlider.width * 0.75, y: rotatedSlider.y + rotatedSlider.height / 2 });
  await expect.poll(async () => Number(await page.locator('#frequency-number').inputValue())).toBeGreaterThan(100);
  await micTarget(page);
  await page.setViewportSize(originalViewport);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectRoomAndFrequencyInViewport(page);

  await page.locator('#help').tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  const closeButton = page.getByRole('button', { name: 'Close explanation' });
  const closeBox = await closeButton.boundingBox();
  expect(closeBox!.width).toBeGreaterThanOrEqual(44);
  expect(closeBox!.height).toBeGreaterThanOrEqual(44);
  await closeButton.tap();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('a finger drags the mic directly while an empty-room gesture only orbits', async ({ page }) => {
  const target = await micTarget(page);
  const mic = page.locator('[data-callout="mic"]');
  const positionBefore = await mic.getAttribute('data-position');
  const canvasBox = await page.locator('canvas').boundingBox();
  if (!canvasBox) throw new Error('Room canvas has no touch target');
  const roomLabel = page.locator('[data-callout="speaker"]');
  const roomProjectionBefore = await roomLabel.getAttribute('style');
  const destination = { x: target.x - Math.min(70, canvasBox.width * 0.16), y: target.y - 12 };
  // Start near the edge of the 48px touch area, beyond the small visible mic mesh.
  await swipe(page, { x: target.x + 20, y: target.y }, destination, async session => {
    await expect(page.locator('body')).toHaveClass(/dragging-mic/);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x: target.x + 23, y: target.y + 3, radiusX: 7, radiusY: 7, force: 1 }],
    });
    await expect(mic, 'Small finger jitter does not move the mic').toHaveAttribute('data-position', positionBefore!);
  });
  await expect(page.locator('body')).not.toHaveClass(/dragging-mic/);
  await expect(mic).not.toHaveAttribute('data-position', positionBefore!);
  await expect(roomLabel, 'Mic dragging does not orbit the camera').toHaveAttribute('style', roomProjectionBefore!);

  const positionAfter = await mic.getAttribute('data-position');
  const projectionBefore = await page.locator('[data-callout="mic"]').getAttribute('style');
  const emptyPoint = { x: canvasBox.x + canvasBox.width * 0.15, y: canvasBox.y + canvasBox.height * 0.25 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, emptyPoint)).toBe('CANVAS');
  await swipe(page, emptyPoint, { x: emptyPoint.x + 65, y: emptyPoint.y + 20 }, async () => {
    await expect(page.locator('body')).not.toHaveClass(/dragging-mic/);
  });
  await expect(mic).toHaveAttribute('data-position', positionAfter!);
  await expect(page.locator('[data-callout="mic"]')).not.toHaveAttribute('style', projectionBefore!);
});

test('the note starts on a tap, follows pressure, and stops when the tab hides', async ({ page }) => {
  expect((await audioState(page)).contextCount).toBe(0);
  const button = page.locator('#sound');
  const play = page.locator('#play');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAccessibleName('Sound on. Mute sound');
  await expectSoundControlVisible(page);
  await page.locator('#mic-corner').tap();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => scrollY), 'The full-screen stage does not scroll').toBe(0);
  await expectSoundControlVisible(page);
  await play.tap();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await expect(play).toHaveAccessibleName('Stop note');
  await expect.poll(async () => (await audioState(page)).state).toBe('running');
  await expect.poll(async () => (await audioState(page)).gain).toBeGreaterThan(0.08);
  await page.locator('#mic-node').tap();
  await expect.poll(async () => (await audioState(page)).gain).toBeLessThan(0.0021);
  await page.locator('[data-mode="2"]').tap();
  await expect.poll(async () => (await audioState(page)).frequency).toBeCloseTo(42.9, 1);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expectSoundControlVisible(page);
  await button.tap();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(button).toHaveAccessibleName('Sound off. Enable sound');
  await expect.poll(async () => (await audioState(page)).state).toBe('suspended');

  await page.locator('#mic-corner').tap();
  await button.tap();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await audioState(page)).gain).toBeGreaterThan(0.08);
  // Headless tabs do not reliably become hidden. Simulate only Page Visibility;
  // the AudioContext, gesture permission, gain fade and suspension remain real.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect(play).toHaveAccessibleName('Play note');
  await expect(button, 'Sound stays on as the master switch').toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await audioState(page)).state).toBe('suspended');
  expect((await audioState(page)).gain).toBeLessThan(0.001);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    Reflect.deleteProperty(document, 'visibilityState');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  expect((await audioState(page)).state).toBe('suspended');
  expect((await audioState(page)).contextCount).toBe(1);
});
