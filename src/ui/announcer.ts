import { coupling, type Mode, type ViewMode } from '../model/acoustics';
import type { Position } from '../model/room';
import { ANNOUNCE, STAGE } from './copy';
import { element } from './dom';
import { printed, settled } from './title';

export type Band = 'node' | 'between' | 'antinode';

export type Reading = Readonly<{
  view: ViewMode;
  mode: Mode;
  mic: Readonly<Position>;
  speaker: Readonly<Position>;
  db: number;
}>;

// Long enough to outlast a key's repeat delay, so a held key settles once.
const SETTLE_MS = 600;
// The mode shape at −18 dB and −3 dB, the 6 dB contours' third line and the half-power point.
const NODE_BAND = 0.125;
const ANTINODE_BAND = 0.708;

export function band(shape: number): Band {
  return shape < NODE_BAND ? 'node' : shape > ANTINODE_BAND ? 'antinode' : 'between';
}

type Settled = Readonly<{ view: ViewMode; mode: Mode; band: Band; speakerOnNode: boolean; speaker: string; db: number }>;

function settle(reading: Reading): Settled {
  const { view, mode, mic, speaker, db } = reading;
  return {
    view,
    mode,
    band: band(coupling(mic, mode)),
    speakerOnNode: coupling(speaker, mode) < NODE_BAND,
    speaker: `${speaker.x} ${speaker.y} ${speaker.z}`,
    db,
  };
}

const modeKey = (mode: Mode) => mode.indices.join(',');

function same(a: Settled, b: Settled): boolean {
  return a.view === b.view && modeKey(a.mode) === modeKey(b.mode) && a.band === b.band && a.speakerOnNode === b.speakerOnNode && a.speaker === b.speaker;
}

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? '');
}

function modeValues(now: Settled) {
  const axis = ANNOUNCE.axes[now.mode.axis];
  return {
    axis,
    Axis: axis[0].toUpperCase() + axis.slice(1),
    indices: `(${now.mode.indices.join(', ')})`,
    frequency: now.mode.frequency.toFixed(1),
    speaker: now.speakerOnNode ? ANNOUNCE.speakerOnNode : '',
  };
}

// The most telling change wins: the view, then the mode, then the speaker, then the mic.
export function announcement(before: Reading, after: Reading): string | null {
  const was = settle(before);
  const now = settle(after);
  if (now.view !== was.view) return now.view === 'belief' ? ANNOUNCE.belief : fill(ANNOUNCE.physics, modeValues(now));
  if (now.view === 'belief') return null;
  if (modeKey(now.mode) !== modeKey(was.mode)) return fill(ANNOUNCE.mode, modeValues(now));
  if (now.speakerOnNode && !was.speakerOnNode && now.speaker !== was.speaker) return ANNOUNCE.speaker;
  if (now.band !== was.band && now.band !== 'between') return fill(ANNOUNCE[now.band], { level: printed(settled(now.db, 1)) });
  return null;
}

export function createAnnouncer(container: HTMLElement, busy: () => boolean) {
  const description = element('p', { id: 'room-view', class: 'sr-only' });
  const region = element('p', { id: 'announcer', class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  container.append(description, region);
  let announced: Reading | undefined;
  let latest: Reading | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function speak() {
    if (!announced || !latest) return;
    if (busy()) {
      timer = setTimeout(speak, SETTLE_MS);
      return;
    }
    const text = announcement(announced, latest);
    announced = latest;
    if (text) region.textContent = text;
  }

  function update(reading: Reading) {
    if (description.textContent !== STAGE.view[reading.view]) description.textContent = STAGE.view[reading.view];
    latest = reading;
    if (!announced) {
      announced = reading;
      return;
    }
    clearTimeout(timer);
    if (!same(settle(announced), settle(reading))) timer = setTimeout(speak, SETTLE_MS);
  }

  function dispose() {
    clearTimeout(timer);
    description.remove();
    region.remove();
  }

  return { update, dispose };
}
