import type { ViewMode } from '../model/acoustics';
import { FREQUENCY_MAX, FREQUENCY_MIN } from '../model/acoustics';
import { MIC_HEIGHT } from '../model/room';
import { DOCK, KEYS } from './copy';
import { clickWithoutFocus, element } from './dom';
import { arrowKeys, icon } from './icons';
import { createSheet, type SheetState } from './sheet';

export type DockPreset = 1 | 2 | 3 | 4;

export type DockState = Readonly<{
  view: ViewMode;
  frequency: number;
  micHeight: number;
  playing: boolean;
  preset: DockPreset | null;
}>;

export type DockEvents = Readonly<{
  view(view: ViewMode): void;
  frequency(frequency: number): void;
  play(): void;
  preset(preset: DockPreset): void;
  micHeight(height: number): void;
  micNode(): void;
  micCorner(): void;
  speakerMiddle(): void;
}>;

const PRESETS: readonly DockPreset[] = [1, 2, 3, 4];

const key = (...content: (Node | string)[]) => element('kbd', { class: 'key', 'aria-hidden': 'true' }, ...content);

function group(name: string, label: HTMLElement, hint: HTMLElement | null, ...controls: HTMLElement[]) {
  const head = element('div', { class: 'dock__head' }, label);
  if (hint) head.append(hint);
  return element('div', { class: `dock__group dock__group--${name}` }, head, ...controls);
}

function button(id: string, text: string, attributes: Record<string, string> = {}, ...extra: (Node | string)[]) {
  return element('button', { id, type: 'button', class: 'dock__button', ...attributes }, text, ...extra);
}

function setAttribute(target: Element, name: string, value: string) {
  if (target.getAttribute(name) !== value) target.setAttribute(name, value);
}

function progress(input: HTMLInputElement, value: number) {
  const min = Number(input.min);
  const share = ((value - min) / (Number(input.max) - min)) * 100;
  input.style.setProperty('--progress', `${share.toFixed(2)}%`);
}

export function createDock(events: DockEvents) {
  const abort = new AbortController();
  const signal = abort.signal;

  const viewLabel = element('span', { class: 'dock__label', id: 'dock-view-label' }, DOCK.view.label);
  const wrong = button('view-wrong', DOCK.view.wrong, { 'aria-pressed': 'false', 'aria-keyshortcuts': KEYS.view });
  const right = button('view-right', DOCK.view.right, { 'aria-pressed': 'true', 'aria-keyshortcuts': KEYS.view });
  const viewGroup = group('view', viewLabel, key(KEYS.view),
    element('div', { class: 'segmented', role: 'group', 'aria-labelledby': 'dock-view-label' }, wrong, right));

  const frequencyRange = element('input', {
    id: 'frequency', class: 'slider', type: 'range', min: FREQUENCY_MIN, max: FREQUENCY_MAX, step: 0.1, value: FREQUENCY_MIN,
  });
  const frequencyNumber = element('input', {
    id: 'frequency-number', class: 'number__field', type: 'number', min: FREQUENCY_MIN, max: FREQUENCY_MAX, step: 0.1,
    inputmode: 'decimal', 'aria-label': DOCK.frequency.field,
  });
  const frequencyGroup = group('frequency', element('label', { class: 'dock__label', for: 'frequency' }, DOCK.frequency.label), key(arrowKeys('horizontal')),
    element('div', { class: 'dock__slider' }, frequencyRange,
      element('label', { class: 'number' }, frequencyNumber, element('span', { class: 'number__unit' }, DOCK.frequency.unit))));

  const playIcon = element('span', { class: 'dock__play-icon' }, icon('play'));
  const playText = element('span', { class: 'dock__play-text' }, DOCK.play.start);
  const play = element('button', {
    id: 'play', type: 'button', class: 'dock__button dock__play', 'aria-pressed': 'false', 'aria-label': DOCK.play.start, 'aria-keyshortcuts': KEYS.play,
  }, playIcon, playText, key(KEYS.play));
  const playGroup = element('div', { class: 'dock__group dock__group--play' }, play);

  const presetButtons = PRESETS.map((preset, index) => button(`mode-${preset}`, DOCK.modes.names[index],
    { 'data-mode': String(preset), 'aria-pressed': 'false', 'aria-keyshortcuts': KEYS.presets[index] }, key(KEYS.presets[index])));
  const modesLabel = element('span', { class: 'dock__label', id: 'dock-modes-label' }, DOCK.modes.label);
  const modesGroup = group('modes', modesLabel, null,
    element('div', { class: 'segmented', role: 'group', 'aria-labelledby': 'dock-modes-label' }, ...presetButtons));

  const heightRange = element('input', {
    id: 'height', class: 'slider', type: 'range', min: MIC_HEIGHT.min.toFixed(2), max: MIC_HEIGHT.max.toFixed(2), step: 0.01, value: MIC_HEIGHT.min,
  });
  const heightValue = element('output', { id: 'height-value', class: 'dock__value', for: 'height', 'aria-live': 'off' });
  const heightGroup = group('height', element('label', { class: 'dock__label', for: 'height' }, DOCK.micHeight.label), key(arrowKeys('horizontal')),
    element('div', { class: 'dock__slider' }, heightRange, heightValue));

  const micNode = button('mic-node', DOCK.mic.node, { 'aria-label': DOCK.mic.nodeAction });
  const micCorner = button('mic-corner', DOCK.mic.corner, { 'aria-label': DOCK.mic.cornerAction });
  const micLabel = element('span', { class: 'dock__label', id: 'dock-mic-label' }, DOCK.mic.label);
  const micGroup = group('mic', micLabel, key(arrowKeys('all')),
    element('div', { class: 'dock__pair', role: 'group', 'aria-labelledby': 'dock-mic-label' }, micNode, micCorner));

  const speakerMiddle = button('speaker-middle', DOCK.speaker.middle, { 'aria-label': DOCK.speaker.middleAction });
  const speakerLabel = element('span', { class: 'dock__label', id: 'dock-speaker-label' }, DOCK.speaker.label);
  const speakerGroup = group('speaker', speakerLabel, null,
    element('div', { class: 'dock__pair', role: 'group', 'aria-labelledby': 'dock-speaker-label' }, speakerMiddle));

  const handle = element('button', {
    id: 'sheet-handle', type: 'button', class: 'dock__handle', 'aria-expanded': 'false', 'aria-controls': 'dock-more', 'aria-label': DOCK.sheet,
  }, element('span', { class: 'dock__grip' }));
  const moreContent = element('div', { class: 'dock__more-content' }, heightGroup, micGroup, speakerGroup);
  const more = element('div', { id: 'dock-more', class: 'dock__more' }, moreContent);

  const root = element('section', { class: 'dock glass', 'aria-label': DOCK.label },
    handle,
    element('div', { class: 'dock__row dock__row--main' }, viewGroup, frequencyGroup, playGroup),
    element('div', { class: 'dock__row dock__row--scene' }, modesGroup, more));
  const sheet = createSheet(root, handle, moreContent);

  let frequency = FREQUENCY_MIN;
  const showFrequency = () => {
    frequencyNumber.value = frequency.toFixed(1);
  };

  let scrubbing = false;
  clickWithoutFocus(root, signal);
  for (const range of [frequencyRange, heightRange]) {
    range.addEventListener('pointerdown', () => {
      scrubbing = true;
    }, { signal });
  }
  for (const type of ['pointerup', 'pointercancel'] as const) {
    window.addEventListener(type, () => {
      scrubbing = false;
    }, { signal });
  }
  wrong.addEventListener('click', () => events.view('belief'), { signal });
  right.addEventListener('click', () => events.view('physics'), { signal });
  frequencyRange.addEventListener('input', () => events.frequency(Number(frequencyRange.value)), { signal });
  frequencyNumber.addEventListener('change', () => {
    events.frequency(Number(frequencyNumber.value));
    showFrequency();
  }, { signal });
  frequencyNumber.addEventListener('blur', showFrequency, { signal });
  play.addEventListener('click', () => events.play(), { signal });
  presetButtons.forEach((presetButton, index) => {
    presetButton.addEventListener('click', () => events.preset(PRESETS[index]), { signal });
  });
  heightRange.addEventListener('input', () => events.micHeight(Number(heightRange.value)), { signal });
  micNode.addEventListener('click', () => events.micNode(), { signal });
  micCorner.addEventListener('click', () => events.micCorner(), { signal });
  speakerMiddle.addEventListener('click', () => events.speakerMiddle(), { signal });

  function render(state: DockState) {
    setAttribute(wrong, 'aria-pressed', String(state.view === 'belief'));
    setAttribute(right, 'aria-pressed', String(state.view === 'physics'));

    frequency = state.frequency;
    frequencyRange.value = String(state.frequency);
    progress(frequencyRange, state.frequency);
    if (document.activeElement !== frequencyNumber) showFrequency();

    const action = state.playing ? DOCK.play.stop : DOCK.play.start;
    setAttribute(play, 'aria-pressed', String(state.playing));
    setAttribute(play, 'aria-label', action);
    if (playText.textContent !== action) {
      playText.textContent = action;
      playIcon.replaceChildren(icon(state.playing ? 'stop' : 'play'));
    }

    presetButtons.forEach((presetButton, index) => setAttribute(presetButton, 'aria-pressed', String(PRESETS[index] === state.preset)));

    heightRange.value = String(state.micHeight);
    progress(heightRange, state.micHeight);
    const height = `${state.micHeight.toFixed(2)} ${DOCK.micHeight.unit}`;
    if (heightValue.textContent !== height) heightValue.textContent = height;
  }

  function dispose() {
    abort.abort();
    sheet.dispose();
    root.remove();
  }

  return {
    element: root,
    render,
    setSheet: (state: SheetState) => sheet.set(state),
    isScrubbing: () => scrubbing,
    dispose,
  };
}
