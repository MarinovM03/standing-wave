import type { ViewMode } from '../model/acoustics';
import { READOUTS } from './copy';
import { element } from './dom';

export type TitleReadings = Readonly<{
  view: ViewMode;
  frequency: number;
  wavelength: number;
  indices: readonly number[];
  db: number;
}>;

type NumericId = 'frequency' | 'wavelength' | 'level';
type Tween = { from: number; to: number; shown: number; start: number };

const DECIMALS: Readonly<Record<NumericId, number>> = { frequency: 1, wavelength: 2, level: 1 };
const TWEEN_MS = 200;

export function settled(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  return Number(text) === 0 ? (0).toFixed(decimals) : text;
}

export const printed = (settledValue: string) => settledValue.replace('-', '−');

export function readoutValues(readings: TitleReadings) {
  const belief = readings.view === 'belief';
  return {
    frequency: { value: settled(readings.frequency, DECIMALS.frequency), unit: READOUTS.frequency.unit },
    wavelength: { value: settled(readings.wavelength, DECIMALS.wavelength), unit: READOUTS.wavelength.unit },
    mode: { value: belief ? READOUTS.mode.none : `(${readings.indices.join(', ')})` },
    level: { value: settled(readings.db, DECIMALS.level), unit: READOUTS.level.unit[readings.view] },
  };
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

function readout(id: keyof typeof READOUTS) {
  const number = element('span', { class: 'readout__number' });
  const unit = element('span', { class: 'readout__unit' });
  const value = element('dd', { class: 'readout__value', id: `readout-${id}` }, number);
  if (id !== 'mode') value.append(' ', unit);
  const group = element('div', { class: 'readout' }, element('dt', { class: 'readout__label' }, READOUTS[id].label), value);
  return { group, value, number, unit };
}

function setText(target: HTMLElement, text: string) {
  if (target.textContent !== text) target.textContent = text;
}

function staticBlock(): HTMLElement {
  const block = document.querySelector<HTMLElement>('#title-block');
  if (!block) throw new Error('Missing the static title block');
  return block;
}

export function adoptTitleBlock() {
  const block = staticBlock();
  const home = { parent: block.parentNode!, next: block.nextSibling };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const fields = { frequency: readout('frequency'), wavelength: readout('wavelength'), mode: readout('mode'), level: readout('level') };
  const list = element('dl', { class: 'readouts' }, ...Object.values(fields).map(field => field.group));
  block.append(list);

  const targets = new Map<NumericId, number>();
  const tweens = new Map<NumericId, Tween>();
  let frame = 0;

  function paint(now: number) {
    frame = 0;
    for (const [id, tween] of tweens) {
      const t = Math.min(1, (now - tween.start) / TWEEN_MS);
      tween.shown = tween.from + (tween.to - tween.from) * easeOut(t);
      fields[id].number.textContent = printed(settled(tween.shown, DECIMALS[id]));
      if (t === 1) tweens.delete(id);
    }
    if (tweens.size) frame = requestAnimationFrame(paint);
  }

  function setNumber(id: NumericId, value: string) {
    const field = fields[id];
    field.value.dataset.value = value;
    const to = Number(value);
    const previous = targets.get(id);
    targets.set(id, to);
    if (previous === to) return;
    if (previous === undefined || reducedMotion.matches) {
      tweens.delete(id);
      field.number.textContent = printed(value);
      return;
    }
    const from = tweens.get(id)?.shown ?? previous;
    tweens.set(id, { from, to, shown: from, start: performance.now() });
    frame ||= requestAnimationFrame(paint);
  }

  function setReadings(readings: TitleReadings) {
    const values = readoutValues(readings);
    for (const id of ['frequency', 'wavelength', 'level'] as const) {
      setNumber(id, values[id].value);
      setText(fields[id].unit, values[id].unit);
    }
    fields.mode.value.dataset.value = values.mode.value;
    setText(fields.mode.number, values.mode.value);
  }

  function dispose() {
    cancelAnimationFrame(frame);
    list.remove();
    home.parent.insertBefore(block, home.next);
  }

  return { element: block, setReadings, dispose };
}
