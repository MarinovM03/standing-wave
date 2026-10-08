import { expect, test, type Page } from '@playwright/test';

type AudioProbe = { contexts: AudioContext[]; oscillators: OscillatorNode[]; gains: GainNode[]; overtaken?: number };
type Target = 'mic' | 'speaker';

let pageErrors: string[];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
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

test.afterEach(() => expect(pageErrors, 'No uncaught browser errors or console errors').toEqual([]));

async function level(page: Page): Promise<number> {
  return Number(await page.locator('#readout-level').getAttribute('data-value'));
}

const callout = (page: Page, id: string) => page.locator(`[data-callout="${id}"]`);
const position = (page: Page, id: Target) => callout(page, id).getAttribute('data-position');

/** Find a projected prop from its callout rather than relying on fixed screen coordinates. */
async function target(page: Page, id: Target): Promise<{ x: number; y: number }> {
  const marker = callout(page, id);
  await expect(marker).toHaveAttribute('data-visible', 'true');
  let point = { x: 0, y: 0 };
  await expect.poll(async () => {
    const stage = await page.locator('canvas').boundingBox();
    if (!stage) return false;
    point = { x: stage.x + Number(await marker.getAttribute('data-x')), y: stage.y + Number(await marker.getAttribute('data-y')) };
    await page.mouse.move(point.x, point.y);
    return page.evaluate(({ x, y }) => {
      const canvas = document.querySelector('canvas');
      return canvas?.style.cursor === 'grab' && document.elementFromPoint(x, y) === canvas;
    }, point);
  }, { message: `The ${id} is exposed and grabbable at its projected point` }).toBe(true);
  return point;
}

test('tuning, nodes and corners agree with the model and the readouts tween', async ({ page }) => {
  const wavelength = page.locator('#readout-wavelength');
  const mode = page.locator('#readout-mode');
  await expect(page.locator('#frequency-number')).toHaveValue('28.6');
  await expect(page.locator('#readout-frequency')).toHaveText('28.6 Hz');
  await expect(wavelength).toHaveText('12.00 m');
  await expect(wavelength).toHaveAttribute('data-value', '12.00');
  await expect(mode).toHaveText('(1, 0, 0)');
  await expect(page.locator('#readout-level .readout__unit')).toHaveText('dB');
  await page.locator('#mic-node').click();
  expect(await level(page)).toBeLessThan(-30);
  await page.locator('#mic-corner').click();
  expect(await level(page)).toBeGreaterThan(-0.2);

  await wavelength.evaluate(element => {
    const seen: string[] = (element as HTMLElement & { seen?: string[] }).seen = [];
    new MutationObserver(() => seen.push(element.textContent!)).observe(element, { subtree: true, childList: true, characterData: true });
  });
  await page.locator('[data-mode="2"]').click();
  await expect(page.locator('#frequency-number')).toHaveValue('42.9');
  await expect(page.locator('[data-mode="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(wavelength, 'data-value holds the settled number at once').toHaveAttribute('data-value', '8.00');
  await expect(mode).toHaveText('(0, 1, 0)');
  await expect(wavelength).toHaveText('8.00 m');
  const seen = await wavelength.evaluate(element => (element as HTMLElement & { seen: string[] }).seen);
  expect(seen.filter(text => text !== '12.00 m' && text !== '8.00 m').length, 'The text tweens through values in between').toBeGreaterThan(0);
  await page.locator('#frequency').fill('95.2');
  await expect(page.locator('#frequency-number')).toHaveValue('95.2');
  await expect(wavelength).toHaveAttribute('data-value', '3.60');
  await expect(wavelength).toHaveText('3.60 m');
  await expect(mode).toHaveText('(3, 0, 0)');
  await expect(page.locator('[data-mode][aria-pressed="true"]')).toHaveCount(0);
});

test("You'd think swaps the room callouts for distance and Actually brings them back", async ({ page }) => {
  const levelLabel = page.locator('.readout', { has: page.locator('#readout-level') }).locator('.readout__label');
  const canvas = page.getByRole('application', { name: 'Interactive acoustic room' });
  const speakerLabel = callout(page, 'speaker').locator('.callout__label');
  const roomCallouts = async (state: 'shown' | 'hidden') => {
    for (const id of ['node', 'antinode', 'half']) await expect(callout(page, id), id).toHaveAttribute('data-state', state);
    await expect(callout(page, 'distance')).toHaveAttribute('data-state', state === 'shown' ? 'hidden' : 'shown');
  };
  await roomCallouts('shown');
  await expect(levelLabel).toHaveText('Level re antinode');
  await expect(speakerLabel).toHaveText('Speaker 99%');
  await expect(canvas).toHaveAccessibleDescription(/Nodes are quiet planes; antinodes are pressure peaks/);

  await page.locator('#view-wrong').click();
  await expect(page.locator('#view-wrong')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#view-right')).toHaveAttribute('aria-pressed', 'false');
  await roomCallouts('hidden');
  await expect(speakerLabel, "You'd think names the speaker without a value").toHaveText('Speaker');
  await expect(canvas).toHaveAccessibleDescription(/Farther from the speaker is quieter; closer is louder/);
  await expect(page.locator('#readout-mode')).toHaveText('none');
  await expect(levelLabel).toHaveText('Level re speaker');
  expect(await level(page)).toBeLessThan(-10);
  await page.keyboard.press('v');
  await expect(page.locator('#view-right')).toHaveAttribute('aria-pressed', 'true');
  await roomCallouts('shown');
  await page.keyboard.press('v');
  await roomCallouts('hidden');
  await page.locator('#view-right').click();
  await roomCallouts('shown');
  await expect(canvas).toHaveAccessibleDescription(/Nodes are quiet planes/);
  await expect(levelLabel).toHaveText('Level re antinode');
});

test('Play and Space start and stop the note and its swing', async ({ page }) => {
  const play = page.locator('#play');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-swing', 'false');
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await expect(play).toHaveAccessibleName('Stop note');
  await expect(canvas).toHaveAttribute('data-swing', 'true');
  // A click leaves no button focused, so Space plays the note.
  await page.keyboard.press('Space');
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect(play).toHaveAccessibleName('Play note');
  await expect(canvas).toHaveAttribute('data-swing', 'false');
  await page.locator('[data-mode="1"]').click();
  await page.keyboard.press('Space');
  await expect(play, 'Space plays after a click on another dock button').toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  // Space on a focused button presses that button, once.
  await play.focus();
  await page.keyboard.press('Space');
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await canvas.focus();
  await page.keyboard.press('Space');
  await expect(play).toHaveAttribute('aria-pressed', 'false');
});

test('keys pick presets, views, sound and the cinematic camera', async ({ page }) => {
  await page.keyboard.press('3');
  await expect(page.locator('#readout-mode')).toHaveText('(0, 0, 1)');
  await page.keyboard.press('4');
  await expect(page.locator('#readout-mode')).toHaveText('(2, 0, 0)');
  // AZERTY prints " on the Digit3 key.
  await page.locator('canvas').dispatchEvent('keydown', { key: '"', code: 'Digit3', bubbles: true });
  await expect(page.locator('#readout-mode')).toHaveText('(0, 0, 1)');
  await page.keyboard.press('v');
  await expect(page.locator('#view-wrong')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('v');
  await expect(page.locator('#view-right')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('m');
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('m');
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('c');
  await expect(page.locator('#cinematic')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('c');
  await expect(page.locator('#cinematic')).toHaveAttribute('aria-pressed', 'false');
});

test('the interface hides, restores and resets from the keyboard', async ({ page }) => {
  const play = page.locator('#play');
  const cinematic = page.locator('#cinematic');
  await page.keyboard.press('c');
  await page.keyboard.press('/');
  await expect(page.locator('body')).toHaveClass(/ui-hidden/);
  await expect(page.locator('#restore-ui')).toBeVisible();
  await expect(page.locator('.dock')).toBeHidden();
  await expect(page.locator('.actions')).toBeHidden();
  await expect(page.locator('.callouts'), 'Callouts hide with the interface').toHaveCSS('opacity', '0');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/ui-hidden/);
  await expect(page.locator('.callouts')).toHaveCSS('opacity', '1');
  await page.keyboard.press('/');
  await page.locator('#restore-ui').click();
  await expect(page.locator('body')).not.toHaveClass(/ui-hidden/);
  await expect(page.locator('.dock')).toBeVisible();
  await page.keyboard.press('r');
  await expect(page.locator('#frequency-number')).toHaveValue('28.6');
  await expect(cinematic).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await page.keyboard.press('2');
  await page.keyboard.press('/');
  await page.keyboard.press('r');
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveClass(/ui-hidden/);
  await page.keyboard.press('2');
  await page.keyboard.press('Shift+R');
  await expect(page.locator('body')).not.toHaveClass(/ui-hidden/);
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#frequency-number')).toHaveValue('28.6');
  // Native range adjustment stays native; global shortcuts remain available after scrubbing.
  await page.locator('#frequency').focus();
  const micBeforeArrow = await position(page, 'mic');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#frequency-number')).toHaveValue('28.7');
  await expect(callout(page, 'mic')).toHaveAttribute('data-position', micBeforeArrow!);
  await page.keyboard.press('c');
  await expect(cinematic).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('/');
  await expect(page.locator('body')).toHaveClass(/ui-hidden/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await expect(page.locator('#frequency-number')).toHaveValue('28.6');
  await expect(cinematic).toHaveAttribute('aria-pressed', 'false');
});

test('Help, H and ? open the help drawer, and typing in the number field fires no keys', async ({ page }) => {
  await page.locator('#help').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  for (const key of ['h', '?']) {
    await page.keyboard.press(key);
    await expect(page.getByRole('dialog'), `${key} opens the help drawer`).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
  await page.locator('#frequency-number').fill('80');
  await page.keyboard.press('3');
  await expect(page.locator('#readout-mode')).toHaveText('(1, 0, 0)');
});

test('dragging the 3D mic changes its reading', async ({ page }) => {
  const mic = callout(page, 'mic');
  const initialPosition = await position(page, 'mic');
  const initialLevel = await level(page);
  const point = await target(page, 'mic');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await expect(page.locator('body')).toHaveClass(/dragging-mic/);
  await page.mouse.move(point.x - 150, point.y - 25, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('body')).not.toHaveClass(/dragging-mic/);
  await expect(mic).not.toHaveAttribute('data-position', initialPosition!);
  expect(await level(page)).toBeLessThan(initialLevel - 8);
});

test('orbiting, tapping and Q and E leave the mic in place, and a tap never moves the camera', async ({ page }) => {
  const mic = callout(page, 'mic');
  const speaker = callout(page, 'speaker');
  const camera = page.locator('canvas');
  const initialPosition = await position(page, 'mic');
  const canvas = await camera.boundingBox();
  if (!canvas) throw new Error('Canvas is missing');
  const empty = { x: canvas.x + canvas.width * 0.25, y: canvas.y + canvas.height * 0.55 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, empty)).toBe('CANVAS');
  const projection = await speaker.getAttribute('style');
  await page.mouse.click(empty.x, empty.y);
  await expect(camera, 'A tap never moves the camera').toHaveAttribute('data-camera', 'home');
  await expect(speaker).toHaveAttribute('style', projection!);
  await expect(mic).toHaveAttribute('data-position', initialPosition!);

  const before = await mic.getAttribute('style');
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.mouse.move(empty.x + 45, empty.y + 25, { steps: 10 });
  await page.mouse.up();
  await expect(mic).toHaveAttribute('data-position', initialPosition!);
  await expect(mic).not.toHaveAttribute('style', before ?? '');

  for (const key of ['q', 'e']) {
    await page.keyboard.press('r');
    await expect(camera).toHaveAttribute('data-camera', 'home');
    const home = await speaker.getAttribute('style');
    await page.keyboard.down(key);
    await expect(speaker, `${key} orbits the camera`).not.toHaveAttribute('style', home!);
    await page.keyboard.up(key);
    await expect(camera).toHaveAttribute('data-camera', 'free');
    await expect(mic).toHaveAttribute('data-position', initialPosition!);
  }
});

test('the stage fills a phone screen and leaves the mic and speaker clear of the dock', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect.poll(async () => page.locator('canvas').boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  const dock = await page.locator('.dock').boundingBox();
  if (!dock) throw new Error('The dock is missing');
  for (const id of ['mic', 'speaker'] as const) {
    await expect.poll(() => page.evaluate(({ prop, dockTop }) => {
      const marker = document.querySelector<HTMLElement>(`[data-callout="${prop}"]`)!;
      const x = Number(marker.dataset.x);
      const y = Number(marker.dataset.y);
      return marker.dataset.visible === 'true' && y < dockTop && document.elementFromPoint(x, y) === document.querySelector('canvas');
    }, { prop: id, dockTop: dock.y }), `The ${id} sits above the dock, uncovered`).toBe(true);
  }
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
  const point = await target(page, 'mic');
  const before = await position(page, 'mic');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x - 40, point.y - 8, { steps: 8 });
  await page.mouse.up();
  await expect(callout(page, 'mic')).not.toHaveAttribute('data-position', before!);
});

test('mic pressure cue, relative level and real audio gain stay in sync', async ({ page }) => {
  const cue = callout(page, 'mic');
  const play = page.locator('#play');
  const sound = page.locator('#sound');
  const contexts = () => page.evaluate(() => (window as Window & { toneProbe: AudioProbe }).toneProbe.contexts.length);
  const audio = () => page.evaluate(() => {
    const probe = (window as Window & { toneProbe: AudioProbe }).toneProbe;
    return { state: probe.contexts.at(-1)?.state, frequency: probe.oscillators.at(-1)?.frequency.value ?? 0, gain: probe.gains.at(-1)?.gain.value ?? 0 };
  });
  expect(await contexts()).toBe(0);
  await expect(page.locator('.dock #play')).toHaveCount(1);
  await expect(page.locator('.actions #sound')).toHaveCount(1);
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await expect(sound).toHaveAccessibleName('Sound on. Mute sound');
  await page.keyboard.press('m');
  await page.keyboard.press('m');
  expect(await contexts(), 'Sound alone never creates an AudioContext').toBe(0);
  await expect(play).toHaveAccessibleName('Play note');
  await play.click();
  await expect(play).toHaveAccessibleName('Stop note');
  await expect(sound).toHaveAccessibleName('Sound on. Mute sound');
  await expect.poll(async () => (await audio()).state).toBe('running');
  await page.locator('#mic-node').click();
  await expect(cue).toHaveAttribute('data-pressure', 'quiet');
  await expect.poll(async () => (await audio()).gain).toBeLessThan(0.0021);
  expect(await level(page)).toBeLessThan(-30);
  expect(Number(await cue.getAttribute('data-amplitude'))).toBeCloseTo(0.02, 4);
  await page.locator('#mic-corner').click();
  await expect(cue).toHaveAttribute('data-pressure', 'hot');
  const peakAmplitude = Number(await cue.getAttribute('data-amplitude'));
  expect(peakAmplitude).toBeGreaterThan(0.98);
  await expect.poll(async () => (await audio()).gain).toBeCloseTo(peakAmplitude * 0.1, 3);
  expect(await level(page)).toBeGreaterThan(-0.2);
  await page.locator('#frequency').fill('80');
  await expect.poll(async () => (await audio()).frequency).toBeCloseTo(80, 1);
  const pressure = Number(await cue.getAttribute('data-amplitude'));
  await expect.poll(async () => (await audio()).gain).toBeCloseTo(pressure * 0.1, 3);
  expect(await level(page)).toBeCloseTo(20 * Math.log10(pressure), 0);

  await page.evaluate(() => (window as Window & { toneProbe: AudioProbe }).toneProbe.contexts.at(-1)!.suspend());
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await expect(sound).toHaveAccessibleName('Sound off. Enable sound');
  await expect(play, 'The note keeps swinging silently').toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('canvas')).toHaveAttribute('data-swing', 'true');
  await expect(page.locator('#toast')).toContainText('paused the sound');
  await expect.poll(async () => (await audio()).gain).toBe(0);
  await page.evaluate(() => (window as Window & { toneProbe: AudioProbe }).toneProbe.contexts.at(-1)!.resume());
  expect((await audio()).gain).toBe(0);
  await expect(sound).toHaveAttribute('aria-pressed', 'false');

  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await audio()).state).toBe('running');
  await expect.poll(async () => (await audio()).gain).toBeCloseTo(pressure * 0.1, 3);
  await page.keyboard.press('m');
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await audio()).state).toBe('suspended');
  await page.keyboard.press('m');
  await expect.poll(async () => (await audio()).state).toBe('running');
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect(sound, 'Sound stays on as the master switch').toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await audio()).state).toBe('suspended');
  expect(await contexts()).toBe(1);
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
  const play = page.locator('#play');
  const button = page.locator('#sound');
  await play.click();
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(button).toHaveAccessibleName('Starting sound…');
  for (const key of ['Space', 'Space', 'm', 'm']) await page.keyboard.press(key);
  await expect(button).toHaveAttribute('aria-busy', 'true');
  expect(await page.evaluate(() => (window as Window & { toneProbe: AudioProbe }).toneProbe.contexts.length)).toBe(1);
  await page.evaluate(() => (window as Window & { releaseAudioStart: () => void }).releaseAudioStart());
  await expect(button).toHaveAttribute('aria-busy', 'false');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAccessibleName('Sound on. Mute sound');
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
    await play.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toHaveAttribute('aria-busy', 'false');
    await expect(button).toHaveAccessibleName('Sound off. Enable sound');
    await expect(page.locator('#toast')).toContainText('Audio could not start');
    await expect(play, 'The note keeps swinging silently').toHaveAttribute('aria-pressed', 'true');
    await page.locator('#frequency').fill('200');
    await expect(page.locator('#frequency-number')).toHaveValue('200.0');
  }
});

test('rapid mute and unmute, then an external resume, settle into one state with one AudioContext', async ({ page }) => {
  await page.evaluate(() => {
    const probe = (window as Window & { toneProbe: AudioProbe }).toneProbe;
    const Probe = window.AudioContext;
    let starting: Promise<void> | null = null;
    probe.overtaken = 0;
    // A slow device: its output takes 300 ms to start, and as in Chromium every resume issued
    // meanwhile settles when it does. A suspend in that window is one Chromium never recovers from.
    window.AudioContext = class extends Probe {
      override resume(): Promise<void> {
        if (this.state === 'running' && !starting) return super.resume();
        starting ??= new Promise(resolve => setTimeout(resolve, 300))
          .then(() => super.resume())
          .finally(() => { starting = null; });
        return starting;
      }
      override suspend(): Promise<void> {
        if (starting) probe.overtaken = (probe.overtaken ?? 0) + 1;
        return super.suspend();
      }
    };
  });
  const cue = callout(page, 'mic');
  const sound = page.locator('#sound');
  const audio = () => page.evaluate(() => {
    const probe = (window as Window & { toneProbe: AudioProbe }).toneProbe;
    return { contexts: probe.contexts.length, state: probe.contexts.at(-1)?.state, gain: probe.gains.at(-1)?.gain.value ?? 0, overtaken: probe.overtaken };
  });
  await page.locator('#mic-corner').click();
  await page.locator('#play').click();
  await expect(sound).toHaveAttribute('aria-busy', 'false');
  await expect.poll(async () => (await audio()).state).toBe('running');
  await page.keyboard.press('m');
  await expect.poll(async () => (await audio()).state).toBe('suspended');

  // Unmute, mute, unmute, mute: the last mute lands while the first unmute's resume is still pending.
  for (let toggle = 0; toggle < 4; toggle++) await page.keyboard.press('m');
  const outcome = await page.evaluate(() => {
    const context = (window as Window & { toneProbe: AudioProbe }).toneProbe.contexts.at(-1)!;
    return Promise.race([
      context.resume().then(() => 'settled'),
      new Promise(resolve => setTimeout(() => resolve('pending'), 3000)),
    ]);
  });
  expect(outcome, 'The external resume settles').toBe('settled');
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await expect(sound).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#play')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await audio()).state).toBe('suspended');
  expect((await audio()).gain).toBeLessThan(0.001);

  await page.keyboard.press('m');
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await expect(sound).toHaveAttribute('aria-busy', 'false');
  await expect.poll(async () => (await audio()).state).toBe('running');
  const amplitude = Number(await cue.getAttribute('data-amplitude'));
  await expect.poll(async () => (await audio()).gain).toBeCloseTo(amplitude * 0.1, 3);
  const settled = await audio();
  expect(settled.contexts).toBe(1);
  expect(settled.overtaken, 'No suspend lands while a resume is pending').toBe(0);
});

test('a mic drag owns one touch', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const point = await target(page, 'mic');
  const session = await page.context().newCDPSession(page);
  const first = { id: 1, x: point.x, y: point.y, radiusX: 5, radiusY: 5 };
  const second = { id: 2, x: point.x + 35, y: point.y + 15, radiusX: 5, radiusY: 5 };
  const initial = await position(page, 'mic');
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  await expect(page.locator('body')).toHaveClass(/dragging-mic/);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [first, { ...second, x: second.x + 40 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] });
  await expect(page.locator('body')).toHaveClass(/dragging-mic/);
  await expect(callout(page, 'mic')).toHaveAttribute('data-position', initial!);
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...first, x: first.x - 35 }] });
  await expect(callout(page, 'mic')).not.toHaveAttribute('data-position', initial!);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('body')).not.toHaveClass(/dragging-mic/);
  await session.detach();
});

for (const id of ['mic', 'speaker'] as const) {
  test(`R, C and lost pointer capture release a ${id} drag`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.addEventListener('pointerdown', event => {
        if (event.target instanceof HTMLCanvasElement) (window as Window & { dragPointerId: number }).dragPointerId = event.pointerId;
      }, true);
    });
    const dragging = new RegExp(`dragging-${id}`);
    for (const interruption of ['reset', 'cinematic', 'capture']) {
      await page.keyboard.press('r');
      const prop = await target(page, id);
      await page.mouse.move(prop.x, prop.y);
      await page.mouse.down();
      await expect(page.locator('body')).toHaveClass(dragging);
      if (interruption === 'capture') {
        // Apply pending capture before releasing it so the browser emits lostpointercapture.
        await page.mouse.move(prop.x + 1, prop.y);
        await page.evaluate(() => document.querySelector('canvas')!.releasePointerCapture((window as Window & { dragPointerId: number }).dragPointerId));
        await page.mouse.move(prop.x + 2, prop.y);
      } else await page.keyboard.press(interruption === 'reset' ? 'r' : 'c');
      await expect(page.locator('body'), `${interruption} releases the drag`).not.toHaveClass(dragging);
      expect(await page.evaluate(() => document.querySelector('canvas')!.hasPointerCapture((window as Window & { dragPointerId: number }).dragPointerId))).toBe(false);
      const released = await position(page, id);
      await page.mouse.move(prop.x - 60, prop.y - 20, { steps: 4 });
      await expect(callout(page, id), `The ${id} stays put once released`).toHaveAttribute('data-position', released!);
      await page.mouse.up();
    }
  });
}

test('a speaker moved to the middle stops driving the first length mode', async ({ page }) => {
  const speaker = callout(page, 'speaker');
  const speakerLabel = speaker.locator('.callout__label');
  await expect(speakerLabel).toHaveText('Speaker 99%');
  const start = { position: await position(page, 'speaker'), level: await level(page) };
  const point = await target(page, 'speaker');
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await expect(page.locator('body')).toHaveClass(/dragging-speaker/);
  await page.mouse.move(point.x + 120, point.y + 40, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('body')).not.toHaveClass(/dragging-speaker/);
  await expect(speaker).not.toHaveAttribute('data-position', start.position!);
  expect(await level(page), 'The mic hears the speaker from its new spot').not.toBe(start.level);

  await page.locator('#speaker-middle').click();
  await expect(speaker).toHaveAttribute('data-position', '3.00 0.35 2.00');
  await expect(speakerLabel).toHaveText('Speaker 0%');
  for (const spot of ['#mic-corner', '#mic-node']) {
    await page.locator(spot).click();
    expect(await level(page), spot).toBeLessThanOrEqual(-30);
  }
  await page.locator('canvas').focus();
  for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowUp', 'Shift+ArrowLeft', 'Shift+ArrowDown']) {
    await page.keyboard.press(key);
    expect(await level(page), `after ${key}`).toBeLessThanOrEqual(-30);
  }

  // You'd think measures distance from the speaker's new spot.
  await page.locator('#mic-corner').click();
  await page.keyboard.press('v');
  const distance = Math.hypot(5.92 - 3, 0.08 - 0.35, 3.92 - 2);
  await expect(callout(page, 'distance').locator('.callout__value')).toHaveText(`${distance.toFixed(1)} m`);
  expect(await level(page)).toBeCloseTo(20 * Math.log10(1 / (1 + distance)), 1);
});
