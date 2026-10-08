import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';

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

type Box = { left: number; top: number; right: number; bottom: number };

const portrait = (page: Page) => page.evaluate(() => innerHeight > innerWidth);

// The sheet and the drawer animate; wait until a box holds still.
async function settled<T>(read: () => Promise<T>): Promise<T> {
  let last = '';
  await expect.poll(async () => {
    const box = JSON.stringify(await read());
    const still = box === last;
    last = box;
    return still;
  }, { intervals: [120] }).toBe(true);
  return JSON.parse(last) as T;
}

const settledDock = (page: Page) => settled<Box>(() => page.locator('.dock').evaluate(element => {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { left, top, right, bottom };
}));

async function setSheet(page: Page, state: 'peek' | 'full'): Promise<void> {
  const handle = page.locator('#sheet-handle');
  if (await handle.getAttribute('aria-expanded') !== String(state === 'full')) await handle.tap();
  await expect(handle).toHaveAttribute('aria-expanded', String(state === 'full'));
  await settledDock(page);
}

async function scenePoints(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const point = (id: string) => {
      const marker = document.querySelector<HTMLElement>(`[data-callout="${id}"]`)!;
      const x = canvas.left + Number(marker.dataset.x);
      const y = canvas.top + Number(marker.dataset.y);
      return { x, y, exposed: marker.dataset.visible === 'true' && document.elementFromPoint(x, y)?.tagName === 'CANVAS' };
    };
    const [left, top, right, bottom] = (document.querySelector<HTMLElement>('.callouts')!.dataset.plate ?? '').split(' ').map(Number);
    return { mic: point('mic'), speaker: point('speaker'), plate: { left, top, right, bottom } };
  });
}

/** The mic, the speaker and the plate sit in the free room: above the sheet in portrait, left of the dock in landscape. */
async function expectSceneClearOfDock(page: Page): Promise<void> {
  const upright = await portrait(page);
  await expect.poll(async () => {
    const dock = await settledDock(page);
    const { mic, speaker, plate } = await scenePoints(page);
    const clear = (x: number, y: number) => upright ? y < dock.top : x < dock.left;
    const ok = mic.exposed && speaker.exposed && clear(mic.x, mic.y) && clear(speaker.x, speaker.y) && clear(plate.right, plate.bottom);
    return ok ? 'clear' : JSON.stringify({ dock, mic, speaker, plate });
  }, { message: 'The mic, speaker and plate sit clear of the dock' }).toBe('clear');
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

async function expectSceneAndFrequency(page: Page): Promise<void> {
  await expect(page.locator('canvas'), 'The stage fills the screen').toBeInViewport({ ratio: 1 });
  await expect(page.locator('#frequency'), 'Frequency is on screen without scrolling').toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Nothing overflows sideways').toBe(true);
  await expectSceneClearOfDock(page);
}

async function expectSideDock(page: Page): Promise<void> {
  await expect(page.locator('#sheet-handle'), 'The side dock has no sheet handle').toBeHidden();
  const layout = await page.locator('.dock').evaluate(element => ({
    width: innerWidth,
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    overflow: getComputedStyle(element).overflowY,
    scrolls: element.scrollHeight > element.clientHeight,
  }));
  expect(layout.left, 'The dock sits on the right half').toBeGreaterThan(layout.width / 2);
  expect(layout.right, 'The dock sits on the right edge').toBeGreaterThan(layout.width - 40);
  expect(layout.overflow).toBe('auto');
  expect(layout.scrolls, 'The column scrolls its controls').toBe(true);
}

async function expectTouchTargets(page: Page): Promise<void> {
  const upright = await portrait(page);
  if (upright) await setSheet(page, 'full');
  const targets = await page.locator([
    '#frequency', '#height', '.actions button', '.dock button', '.dock .number',
  ].join(',')).evaluateAll(elements => elements.filter(element => element.getClientRects().length > 0).map(element => {
    const box = element.getBoundingClientRect();
    return { name: element.id || element.className, width: box.width, height: box.height };
  }));
  const names = targets.map(target => target.name);
  expect(names).toEqual(expect.arrayContaining(['sound', 'help', 'view-wrong', 'play', 'mode-4', 'mic-node', 'speaker-middle']));
  if (upright) expect(names).toContain('sheet-handle');
  for (const target of targets) {
    expect(target.width, `${target.name} has a 44px-wide touch area`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.name} has a 44px-high touch area`).toBeGreaterThanOrEqual(44);
  }
  if (upright) await setSheet(page, 'peek');
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
  await expectSceneAndFrequency(page);
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
  await expectSceneAndFrequency(page);
  if (!await portrait(page)) await expectSideDock(page);
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
  await expectSceneAndFrequency(page);
});

test('portrait has a two-height sheet and landscape a scrolling dock on the right', async ({ page }) => {
  if (!await portrait(page)) {
    await expectSideDock(page);
    await expectSceneClearOfDock(page);
    await expect(page.locator('#play'), 'Play is in the first screen of the column').toBeInViewport({ ratio: 1 });
    await page.locator('#speaker-middle').tap();
    await expect(page.locator('[data-callout="speaker"]')).toHaveAttribute('data-position', '3.00 0.35 2.00');
    return;
  }
  const handle = page.locator('#sheet-handle');
  const more = ['#height', '#mic-node', '#mic-corner', '#speaker-middle'];
  const peek = ['#view-wrong', '#view-right', '#play', '#frequency', '[data-mode="1"]', '[data-mode="4"]'];
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
  for (const selector of peek) await expect(page.locator(selector), `${selector} is in the peek height`).toBeInViewport({ ratio: 1 });
  for (const selector of more) await expect(page.locator(selector), `${selector} waits for the full height`).toBeHidden();
  const peekBox = await settledDock(page);
  await expectSceneClearOfDock(page);

  await handle.tap();
  await expect(handle).toHaveAttribute('aria-expanded', 'true');
  const fullBox = await settledDock(page);
  expect(fullBox.top, 'The full height is taller').toBeLessThan(peekBox.top - 100);
  for (const selector of [...peek, ...more]) await expect(page.locator(selector), `${selector} is in the full height`).toBeInViewport({ ratio: 1 });
  await expectSceneClearOfDock(page);

  await handle.tap();
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
  await settledDock(page);
  for (const selector of more) await expect(page.locator(selector)).toBeHidden();

  const grip = (await handle.boundingBox())!;
  const x = grip.x + grip.width / 2;
  await swipe(page, { x, y: grip.y + grip.height / 2 }, { x, y: grip.y + grip.height / 2 - 160 });
  await expect(handle, 'Dragging the handle up opens the sheet').toHaveAttribute('aria-expanded', 'true');
  const opened = await settledDock(page);
  const raised = (await handle.boundingBox())!;
  await swipe(page, { x, y: raised.y + raised.height / 2 }, { x, y: raised.y + raised.height / 2 + 160 });
  await expect(handle, 'Dragging it down drops it to peek').toHaveAttribute('aria-expanded', 'false');
  expect((await settledDock(page)).top).toBeGreaterThan(opened.top + 100);

  await handle.tap();
  await expect(handle, 'A tap right after a drag still toggles').toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Shift+R');
  await expect(handle, 'Shift+R resets the sheet to peek').toHaveAttribute('aria-expanded', 'false');
  await expectSceneClearOfDock(page);
});

test('help opens as a drawer from the right and holds Follow', async ({ page }) => {
  await page.locator('#help').tap();
  const drawer = page.locator('#help-drawer');
  await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible();
  const box = await settled(() => drawer.boundingBox());
  expect(Math.round(box!.x + box!.width), 'The drawer meets the right edge').toBe(await page.evaluate(() => innerWidth));
  for (const heading of ['The idea', 'Try this', "What's real", "What's simplified", 'Sources', 'Keys']) {
    await expect(drawer.getByRole('heading', { name: heading, exact: true })).toHaveCount(1);
  }
  await expect(page.locator('.actions .follow'), 'Follow leaves the top-right on phones').toBeHidden();
  const follow = drawer.getByRole('link', { name: /Follow @marinovm10/ });
  await expect(follow).toBeVisible();
  await expect(follow).toHaveAttribute('href', 'https://x.com/marinovm10');
  const closeButton = page.getByRole('button', { name: 'Close help' });
  for (const target of [closeButton, follow] as Locator[]) {
    const size = await target.boundingBox();
    expect(size!.width).toBeGreaterThanOrEqual(44);
    expect(size!.height).toBeGreaterThanOrEqual(44);
  }
  await closeButton.tap();
  await expect(drawer).not.toBeVisible();
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

test('a tap leaves the camera still and a pinch zooms', async ({ page }) => {
  const camera = page.locator('canvas');
  const speaker = page.locator('[data-callout="speaker"]');
  const canvasBox = (await camera.boundingBox())!;
  const empty = { x: canvasBox.x + canvasBox.width * 0.15, y: canvasBox.y + canvasBox.height * 0.25 };
  const projection = await speaker.getAttribute('style');
  await page.touchscreen.tap(empty.x, empty.y);
  await expect(camera, 'A tap never moves the camera').toHaveAttribute('data-camera', 'home');
  await expect(speaker).toHaveAttribute('style', projection!);

  const spread = () => page.evaluate(() => {
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const point = (id: string) => {
      const marker = document.querySelector<HTMLElement>(`[data-callout="${id}"]`)!;
      return { x: canvas.left + Number(marker.dataset.x), y: canvas.top + Number(marker.dataset.y) };
    };
    const mic = point('mic');
    const source = point('speaker');
    return Math.hypot(mic.x - source.x, mic.y - source.y);
  });
  const before = await spread();
  const session = await page.context().newCDPSession(page);
  const fingers = (gap: number) => [
    { id: 1, x: empty.x - gap, y: empty.y, radiusX: 5, radiusY: 5, force: 1 },
    { id: 2, x: empty.x + gap, y: empty.y, radiusX: 5, radiusY: 5, force: 1 },
  ];
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(15) });
    for (let step = 1; step <= 10; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(15 + step * 8) });
  } finally {
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  }
  await expect(camera).toHaveAttribute('data-camera', 'free');
  await expect.poll(spread, { message: 'Spreading two fingers brings the room closer' }).toBeGreaterThan(before * 1.05);
});

test('the note starts on a tap, follows pressure, and stops when the tab hides', async ({ page }) => {
  expect((await audioState(page)).contextCount).toBe(0);
  const button = page.locator('#sound');
  const play = page.locator('#play');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAccessibleName('Sound on. Mute sound');
  await expectSoundControlVisible(page);
  await expect(play, 'Play is in the peek height').toBeInViewport({ ratio: 1 });
  if (await portrait(page)) await setSheet(page, 'full');
  await expect(play, 'Play stays in the full height').toBeInViewport({ ratio: 1 });
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
