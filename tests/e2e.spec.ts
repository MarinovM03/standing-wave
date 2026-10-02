import { expect, test, type Page } from '@playwright/test';

type AudioProbe = { contexts: AudioContext[]; oscillators: OscillatorNode[]; gains: GainNode[] };

let pageErrors: string[];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const audioWindow = window as Window & { toneProbe: AudioProbe };
    const NativeAudioContext = window.AudioContext;
    audioWindow.toneProbe = { contexts: [], oscillators: [], gains: [] };
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) { super(options); audioWindow.toneProbe.contexts.push(this); }
      override createOscillator(): OscillatorNode {
        const oscillator = super.createOscillator();
        audioWindow.toneProbe.oscillators.push(oscillator);
        return oscillator;
      }
      override createGain(): GainNode {
        const gain = super.createGain();
        audioWindow.toneProbe.gains.push(gain);
        return gain;
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
});

test.afterEach(() => expect(pageErrors, 'No uncaught browser errors').toEqual([]));

async function level(page: Page): Promise<number> {
  return Number((await page.locator('#level-db').innerText()).replace('−', '-'));
}

/** Find the projected 3D mic from its callout rather than relying on fixed screen coordinates. */
async function micTarget(page: Page): Promise<{ x: number; y: number }> {
  const callout = page.locator('[data-callout="mic"]');
  await expect(callout).toHaveAttribute('data-visible', 'true');
  let point = { x: 0, y: 0 };
  await expect.poll(async () => {
    const stage = await page.locator('canvas').boundingBox();
    if (!stage) return false;
    point = { x: stage.x + Number(await callout.getAttribute('data-x')), y: stage.y + Number(await callout.getAttribute('data-y')) };
    await page.mouse.move(point.x, point.y);
    return page.evaluate(({ x, y }) => {
      const canvas = document.querySelector('canvas');
      return canvas?.style.cursor === 'grab' && document.elementFromPoint(x, y) === canvas;
    }, point);
  }, { message: 'The mic is exposed and grabbable at its projected tip' }).toBe(true);
  return point;
}

test('tuning, nodes, corners and the source-only comparison agree with the model', async ({ page }) => {
  await expect(page.locator('#frequency-number')).toHaveValue('28.6');
  await expect(page.locator('#wavelength')).toHaveText('12.00');
  await page.locator('#quiet-button').click();
  expect(await level(page)).toBeLessThan(-30);
  await page.locator('#peak-button').click();
  expect(await level(page)).toBeGreaterThan(-0.2);
  await page.locator('#belief-button').click();
  await expect(page.locator('#belief-button')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#field-low-label')).toHaveText('Far');
  await expect(page.locator('#field-high-label')).toHaveText('Near');
  expect(await level(page)).toBeLessThan(-10);
  await page.locator('#physics-button').click();
  await expect(page.locator('#field-low-label')).toHaveText('Node');
  await expect(page.locator('#field-high-label')).toHaveText('Antinode');
  await page.locator('[data-axis="width"]').click();
  await expect(page.locator('#frequency-number')).toHaveValue('42.9');
  await expect(page.locator('#mode-indices')).toHaveText('(0, 1, 0)');
  await page.locator('#frequency').fill('95.2');
  await expect(page.locator('#frequency-number')).toHaveValue('95.2');
  await expect(page.locator('#wavelength')).toHaveText('3.60');
  await expect(page.locator('#mode-indices')).toHaveText('(3, 0, 0)');
});

test('keyboard exploration, interface restore and explanation modal work', async ({ page }) => {
  await page.locator('#motion-button').click();
  await expect(page.locator('#motion-button')).toHaveAttribute('title', 'Play field animation');
  await page.locator('#motion-button').click();
  await expect(page.locator('#motion-button')).toHaveAttribute('title', 'Pause field animation');
  await page.locator('canvas').focus();
  await page.keyboard.press('3');
  await expect(page.locator('#mode-indices')).toHaveText('(0, 0, 1)');
  await page.keyboard.press('4');
  await expect(page.locator('#mode-indices')).toHaveText('(2, 0, 0)');
  await page.keyboard.press('c');
  await expect(page.locator('#camera-button')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('/');
  await expect(page.locator('body')).toHaveClass(/ui-hidden/);
  await expect(page.locator('#restore-ui')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/ui-hidden/);
  await page.keyboard.press('r');
  await expect(page.locator('#frequency-number')).toHaveValue('28.6');
  await expect(page.locator('#camera-button')).toHaveAttribute('aria-pressed', 'false');
  // Native range adjustment stays native; global shortcuts remain available after scrubbing.
  await page.locator('#frequency').focus();
  const listenerBeforeArrow = await page.locator('#position-readout').innerText();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#frequency-number')).toHaveValue('28.7');
  await expect(page.locator('#position-readout')).toHaveText(listenerBeforeArrow);
  await page.keyboard.press('c');
  await expect(page.locator('#camera-button')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('/');
  await expect(page.locator('body')).toHaveClass(/ui-hidden/);
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/ui-hidden/);
  await page.keyboard.press('r');
  await expect(page.locator('#frequency-number')).toHaveValue('28.6');
  await expect(page.locator('#camera-button')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#how-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.locator('#frequency-number').fill('80');
  await page.keyboard.press('3');
  await expect(page.locator('#mode-indices')).toHaveText('(1, 0, 0)');
});

test('dragging the 3D mic changes its reading while orbiting preserves its position', async ({ page }) => {
  const initialPosition = await page.locator('#position-readout').innerText();
  const initialLevel = await level(page);
  const target = await micTarget(page);
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await expect(page.locator('body')).toHaveClass(/dragging-mic/);
  await page.mouse.move(target.x - 150, target.y - 25, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('body')).not.toHaveClass(/dragging-mic/);
  await expect(page.locator('#position-readout')).not.toHaveText(initialPosition);
  expect(await level(page)).toBeLessThan(initialLevel - 8);
  await page.keyboard.press('r');
  const before = await page.locator('[data-callout="mic"]').getAttribute('style');
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('Canvas is missing');
  const origin = { x: canvas.x + canvas.width * 0.77, y: canvas.y + canvas.height * 0.53 };
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.mouse.move(origin.x + 45, origin.y + 25, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('#position-readout')).toHaveText(initialPosition);
  await expect(page.locator('[data-callout="mic"]')).not.toHaveAttribute('style', before ?? '');
});

test('phone layout fits the viewport and leaves the mic available to drag', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  // A responsive canvas has been laid out and its projected labels updated.
  await expect.poll(async () => (await page.locator('canvas').boundingBox())?.height).toBeLessThan(350);
  const slider = await page.locator('#frequency').boundingBox();
  if (!slider) throw new Error('Frequency slider is missing');
  expect(slider.y).toBeGreaterThan(0);
  expect(slider.y + slider.height).toBeLessThanOrEqual(844);
  expect(slider.height).toBeGreaterThanOrEqual(44);
  const initialFrequency = await page.locator('#frequency').inputValue();
  // Real browser touch events exercise the native range instead of assigning its value.
  const session = await page.context().newCDPSession(page);
  const touchY = slider.y + slider.height / 2;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: slider.x + 12, y: touchY, radiusX: 5, radiusY: 5, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: slider.x + slider.width * 0.55, y: touchY, radiusX: 5, radiusY: 5, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#frequency')).not.toHaveValue(initialFrequency);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await session.detach();
  await page.keyboard.press('r');
  const target = await micTarget(page);
  const before = await page.locator('#position-readout').innerText();
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(target.x - 40, target.y - 8, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#position-readout')).not.toHaveText(before);
});

test('mic pressure cue, relative level and real audio gain stay in sync', async ({ page }) => {
  const cue = page.locator('[data-callout="mic"]');
  const audio = () => page.evaluate(() => {
    const probe = (window as Window & { toneProbe: AudioProbe }).toneProbe;
    return { state: probe.contexts.at(-1)?.state, frequency: probe.oscillators.at(-1)?.frequency.value ?? 0, gain: probe.gains.at(-1)?.gain.value ?? 0 };
  });
  expect(await page.evaluate(() => (window as Window & { toneProbe: AudioProbe }).toneProbe.contexts.length)).toBe(0);
  await expect(page.locator('.masthead #sound-button')).toHaveCount(1);
  await expect(page.locator('#sound-label')).toHaveText('Sound off');
  await page.locator('#sound-button').click();
  await expect(page.locator('#sound-button')).toHaveAccessibleName('Sound on. Mute sound');
  await expect(page.locator('#sound-label')).toHaveText('Sound on');
  await expect.poll(async () => (await audio()).state).toBe('running');
  await page.locator('#quiet-button').click();
  await expect(cue).toHaveAttribute('data-pressure', 'quiet');
  await expect.poll(async () => (await audio()).gain).toBeLessThan(0.0021);
  expect(await level(page)).toBeLessThan(-30);
  expect(Number(await cue.getAttribute('data-amplitude'))).toBeCloseTo(0.02, 4);
  await page.locator('#peak-button').click();
  await expect(cue).toHaveAttribute('data-pressure', 'hot');
  await expect.poll(async () => (await audio()).gain).toBeGreaterThan(0.099);
  expect(await level(page)).toBeGreaterThan(-0.2);
  const peakAmplitude = Number(await cue.getAttribute('data-amplitude'));
  expect((await audio()).gain).toBeCloseTo(peakAmplitude * 0.1, 3);
  await page.locator('#frequency').fill('80');
  await expect.poll(async () => (await audio()).frequency).toBeCloseTo(80, 1);
  const pressure = Number(await cue.getAttribute('data-amplitude'));
  await expect.poll(async () => (await audio()).gain).toBeCloseTo(pressure * 0.1, 3);
  expect(await level(page)).toBeCloseTo(20 * Math.log10(pressure), 0);
  await page.evaluate(() => (window as Window & { toneProbe: AudioProbe }).toneProbe.contexts.at(-1)!.suspend());
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#sound-label')).toHaveText('Sound off');
  await expect.poll(async () => (await audio()).gain).toBe(0);
  // The app suspends the context again 180 ms after muting, and Chromium never settles a resume that a suspend overtakes.
  await page.waitForTimeout(250);
  await page.evaluate(() => (window as Window & { toneProbe: AudioProbe }).toneProbe.contexts.at(-1)!.resume());
  expect((await audio()).gain).toBe(0);
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#sound-button').click();
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#sound-button').click();
  await expect.poll(async () => (await audio()).state).toBe('suspended');
});

test('sound startup cannot overlap and failure paths leave the lab usable', async ({ page }) => {
  await page.evaluate(() => {
    const Native = window.AudioContext;
    const audioWindow = window as Window & { releaseAudioStart: () => void };
    window.AudioContext = class extends Native {
      override async resume(): Promise<void> {
        await new Promise<void>(resolve => { audioWindow.releaseAudioStart = resolve; });
        return super.resume();
      }
    };
  });
  const button = page.locator('#sound-button');
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#sound-label')).toHaveText('Starting sound…');
  await expect(button).toHaveAccessibleName('Starting sound…');
  // Dispatch bypasses disabled-button hit testing and exercises the handler's guard.
  await button.dispatchEvent('click');
  expect(await page.evaluate(() => (window as Window & { toneProbe: AudioProbe }).toneProbe.contexts.length)).toBe(1);
  await page.evaluate(() => (window as Window & { releaseAudioStart: () => void }).releaseAudioStart());
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sound-label')).toHaveText('Sound on');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');

  for (const failure of ['denied', 'unsupported']) {
    await page.reload();
    await page.evaluate(kind => {
      if (kind === 'unsupported') {
        Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
        Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
      } else {
        const Native = window.AudioContext;
        window.AudioContext = class extends Native {
          override resume(): Promise<void> { return Promise.reject(new DOMException('Blocked', 'NotAllowedError')); }
        };
      }
    }, failure);
    await button.click();
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toHaveAccessibleName('Sound off. Enable sound');
    await expect(page.locator('#sound-label')).toHaveText('Sound off');
    await expect(page.locator('#toast')).toContainText('Audio could not start');
    await page.locator('#frequency').fill('200');
    await expect(page.locator('#frequency-number')).toHaveValue('200.0');
  }
});

test('mic drag owns one touch and releases capture when interrupted', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const target = await micTarget(page);
  const session = await page.context().newCDPSession(page);
  const first = { id: 1, x: target.x, y: target.y, radiusX: 5, radiusY: 5 };
  const second = { id: 2, x: target.x + 35, y: target.y + 15, radiusX: 5, radiusY: 5 };
  const initial = await page.locator('#position-readout').innerText();
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  await expect(page.locator('body')).toHaveClass(/dragging-mic/);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [first, { ...second, x: second.x + 40 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] });
  await expect(page.locator('body')).toHaveClass(/dragging-mic/);
  await expect(page.locator('#position-readout')).toHaveText(initial);
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...first, x: first.x - 35 }] });
  await expect(page.locator('#position-readout')).not.toHaveText(initial);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('body')).not.toHaveClass(/dragging-mic/);
  await session.detach();

  await page.evaluate(() => {
    document.addEventListener('pointerdown', event => {
      if (event.target instanceof HTMLCanvasElement) (window as Window & { micPointerId: number }).micPointerId = event.pointerId;
    }, true);
  });
  for (const interruption of ['reset', 'cinematic', 'capture']) {
    await page.keyboard.press('r');
    const mic = await micTarget(page);
    await page.mouse.move(mic.x, mic.y);
    await page.mouse.down();
    await expect(page.locator('body')).toHaveClass(/dragging-mic/);
    if (interruption === 'capture') {
      // Apply pending capture before releasing it so the browser emits lostpointercapture.
      await page.mouse.move(mic.x + 1, mic.y);
      await page.evaluate(() => document.querySelector('canvas')!.releasePointerCapture((window as Window & { micPointerId: number }).micPointerId));
      await page.mouse.move(mic.x + 2, mic.y);
    } else await page.keyboard.press(interruption === 'reset' ? 'r' : 'c');
    await expect(page.locator('body'), `${interruption} releases drag feedback`).not.toHaveClass(/dragging-mic/);
    expect(await page.evaluate(() => document.querySelector('canvas')!.hasPointerCapture((window as Window & { micPointerId: number }).micPointerId))).toBe(false);
    await page.mouse.up();
  }
});
