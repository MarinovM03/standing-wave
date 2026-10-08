import type { Position } from '../model/room';
import { CALLOUT_IDS, type Anchors, type CalloutId, type ScreenRect } from '../scene/anchors';
import { element } from './dom';

export type CalloutView = 'physics' | 'belief';
export type CalloutReadings = {
  amplitude: number;
  micDb: number;
  speaker: number;
  node: number;
  antinodeDb: number;
  half: number;
  distance: number;
  positions: { mic: Position; speaker: Position };
};
export type LayoutItem = { id: CalloutId; x: number; y: number; width: number; height: number };
export type Layout = Map<CalloutId, { placement: number; label: ScreenRect }>;

export const PLACEMENTS = [
  { dx: 24, dy: -24, side: 'right' },
  { dx: -24, dy: -24, side: 'left' },
  { dx: 32, dy: 0, side: 'right' },
  { dx: -32, dy: 0, side: 'left' },
  { dx: 24, dy: 24, side: 'right' },
  { dx: -24, dy: 24, side: 'left' },
] as const;

const NAMES: Record<CalloutId, string> = {
  mic: 'Mic',
  speaker: 'Speaker',
  node: 'Node',
  antinode: 'Antinode',
  half: 'Half wavelength',
  distance: 'Distance',
};
const WIDEST: Record<CalloutId, string> = {
  mic: '−40.0 dB',
  speaker: '100%',
  node: '0.00 m',
  antinode: '−40.0 dB',
  half: '0.00 m',
  distance: '0.0 m',
};
const ORDER: Record<CalloutView, readonly CalloutId[]> = {
  physics: ['mic', 'speaker', 'node', 'antinode', 'half'],
  belief: ['mic', 'speaker', 'distance'],
};
const LIMIT = { desktop: 5, phone: 3 };
const TYPE = { desktop: { size: 11, line: 14 }, phone: { size: 10, line: 13 } };
const PADDING = { x: 6, y: 4 };
// JetBrains Mono advances every glyph by 600 units per em.
const ADVANCE = 0.6;
const RING_RADIUS = 4;
const LABEL_GAP = 3;
const EDGE = 4;

const overlaps = (a: ScreenRect, b: ScreenRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

function crosses(from: { x: number; y: number }, to: { x: number; y: number }, rect: ScreenRect): boolean {
  for (let step = 1; step <= 8; step++) {
    const x = from.x + ((to.x - from.x) * step) / 8;
    const y = from.y + ((to.y - from.y) * step) / 8;
    if (x > rect.left && x < rect.right && y > rect.top && y < rect.bottom) return true;
  }
  return false;
}

function ringRect(item: LayoutItem): ScreenRect {
  return { left: item.x - RING_RADIUS, right: item.x + RING_RADIUS, top: item.y - RING_RADIUS, bottom: item.y + RING_RADIUS };
}

function labelRect(item: LayoutItem, placement: number): ScreenRect {
  const { dx, dy, side } = PLACEMENTS[placement];
  const end = item.x + dx;
  const left = side === 'right' ? end + LABEL_GAP : end - LABEL_GAP - item.width;
  return { left, right: left + item.width, top: item.y + dy - item.height / 2, bottom: item.y + dy + item.height / 2 };
}

// A label keeps its last placement while that still fits, so it doesn't flicker as anchors move.
export function layoutCallouts(
  items: readonly LayoutItem[],
  bounds: { width: number; height: number },
  obstacles: readonly ScreenRect[],
  previous: ReadonlyMap<CalloutId, number> = new Map(),
): Layout {
  const layout: Layout = new Map();
  const taken = [...obstacles];
  const rings = items.map(ringRect);
  items.forEach((item, index) => {
    const ring = rings[index];
    if (ring.left < 0 || ring.top < 0 || ring.right > bounds.width || ring.bottom > bounds.height) return;
    if (taken.some((rect) => overlaps(ring, rect))) return;
    const blockers = [...taken, ...rings.filter((_, other) => other !== index)];
    const last = previous.get(item.id);
    const order = last === undefined ? PLACEMENTS.keys() : [last, ...[...PLACEMENTS.keys()].filter((placement) => placement !== last)];
    for (const placement of order) {
      const label = labelRect(item, placement);
      if (label.left < EDGE || label.top < EDGE || label.right > bounds.width - EDGE || label.bottom > bounds.height - EDGE) continue;
      const end = { x: item.x + PLACEMENTS[placement].dx, y: item.y + PLACEMENTS[placement].dy };
      if (blockers.some((rect) => overlaps(label, rect) || crosses(item, end, rect))) continue;
      layout.set(item.id, { placement, label });
      taken.push(ring, label);
      return;
    }
  });
  return layout;
}

const decibels = (db: number) => `${db > -0.05 ? '0.0' : db.toFixed(1).replace('-', '−')} dB`;

// You'd think has no coupling, so the speaker is named without a value.
export function calloutValues(view: CalloutView, readings: CalloutReadings): Record<CalloutId, string> {
  return {
    mic: decibels(readings.micDb),
    speaker: view === 'belief' ? '' : `${Math.round(readings.speaker * 100)}%`,
    node: `${readings.node.toFixed(2)} m`,
    antinode: decibels(readings.antinodeDb),
    half: `${readings.half.toFixed(2)} m`,
    distance: `${readings.distance.toFixed(1)} m`,
  };
}

const position = ({ x, y, z }: Position) => `${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`;

type Callout = {
  root: HTMLDivElement;
  leader: HTMLSpanElement;
  label: HTMLSpanElement;
  value: HTMLSpanElement;
  x?: number;
  y?: number;
  visible?: boolean;
  shown?: boolean;
  placement?: number;
  width?: number;
};

export function createCallouts(container: HTMLElement) {
  const layer = element('div', { class: 'callouts', 'aria-hidden': 'true' });
  const phone = matchMedia('(max-width: 640px), (max-height: 500px)');
  const callouts = new Map<CalloutId, Callout>();
  for (const id of CALLOUT_IDS) {
    const value = element('span', { class: 'callout__value' });
    const label = element('span', { class: 'callout__label' }, element('span', { class: 'callout__name' }, NAMES[id]), ' ', value);
    const leader = element('span', { class: 'callout__leader' });
    const root = element('div', { class: 'callout', 'data-callout': id, 'data-state': 'hidden', 'data-visible': 'false' }, leader, label);
    layer.append(root);
    callouts.set(id, { root, leader, label, value });
  }
  container.append(layer);
  let view: CalloutView = 'physics';
  let previous: Map<CalloutId, number> = new Map();
  let obstacles: readonly ScreenRect[] = [];

  function setReadings(nextView: CalloutView, readings: CalloutReadings): void {
    view = nextView;
    const text = calloutValues(view, readings);
    for (const [id, callout] of callouts) {
      if (callout.value.textContent !== text[id]) callout.value.textContent = text[id];
    }
    const mic = callouts.get('mic')!.root;
    mic.dataset.amplitude = readings.amplitude.toFixed(6);
    mic.dataset.pressure = readings.amplitude < 0.13 ? 'quiet' : readings.amplitude > 0.72 ? 'hot' : 'mid';
    mic.dataset.position = position(readings.positions.mic);
    callouts.get('speaker')!.root.dataset.position = position(readings.positions.speaker);
  }

  // Interface rects in the container's pixels; labels and rings stay off them.
  function setObstacles(rects: readonly ScreenRect[]): void {
    obstacles = rects;
  }

  function place(anchors: Anchors): void {
    const type = phone.matches ? TYPE.phone : TYPE.desktop;
    const height = type.line + 2 * PADDING.y;
    const named = (id: CalloutId) => view === 'belief' && id === 'speaker';
    const width = (id: CalloutId) => Math.ceil((NAMES[id].length + (named(id) ? 0 : 1 + WIDEST[id].length)) * type.size * ADVANCE) + 2 * PADDING.x;
    const items = ORDER[view]
      .slice(0, phone.matches ? LIMIT.phone : LIMIT.desktop)
      .filter((id) => anchors.points[id].visible)
      .map((id) => ({ id, x: anchors.points[id].x, y: anchors.points[id].y, width: width(id), height }));
    const layout = layoutCallouts(items, anchors, anchors.plate ? [anchors.plate, ...obstacles] : obstacles, previous);
    previous = new Map([...layout].map(([id, { placement }]) => [id, placement]));
    const plate = anchors.plate ? [anchors.plate.left, anchors.plate.top, anchors.plate.right, anchors.plate.bottom].map(Math.round).join(' ') : '';
    if (layer.dataset.plate !== plate) layer.dataset.plate = plate;

    for (const [id, callout] of callouts) {
      const point = anchors.points[id];
      if (point.x !== callout.x || point.y !== callout.y) {
        callout.x = point.x;
        callout.y = point.y;
        callout.root.dataset.x = String(point.x);
        callout.root.dataset.y = String(point.y);
        callout.root.style.transform = `translate3d(${point.x}px,${point.y}px,0)`;
      }
      if (point.visible !== callout.visible) {
        callout.visible = point.visible;
        callout.root.dataset.visible = String(point.visible);
      }
      const placed = layout.get(id);
      const shown = placed !== undefined;
      if (shown !== callout.shown) {
        callout.shown = shown;
        callout.root.dataset.state = shown ? 'shown' : 'hidden';
      }
      if (!placed) continue;
      const labelWidth = placed.label.right - placed.label.left;
      if (placed.placement === callout.placement && labelWidth === callout.width) continue;
      callout.placement = placed.placement;
      callout.width = labelWidth;
      const { dx, dy, side } = PLACEMENTS[placed.placement];
      callout.leader.style.width = `${Math.hypot(dx, dy) - RING_RADIUS}px`;
      callout.leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad) translateX(${RING_RADIUS}px)`;
      callout.label.dataset.side = side;
      callout.label.style.width = `${labelWidth}px`;
      callout.label.style.transform = `translate(${placed.label.left - point.x}px,${placed.label.top - point.y}px)`;
    }
  }

  function dispose(): void {
    layer.remove();
  }

  return { setReadings, setObstacles, place, dispose };
}
