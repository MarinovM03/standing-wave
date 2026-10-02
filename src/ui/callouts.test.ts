import { describe, expect, it } from 'vitest';
import type { ScreenRect } from '../scene/anchors';
import { PLACEMENTS, layoutCallouts, type LayoutItem } from './callouts';

const bounds = { width: 800, height: 500 };
const item = (id: LayoutItem['id'], x: number, y: number): LayoutItem => ({ id, x, y, width: 130, height: 22 });
const ring = ({ x, y }: LayoutItem): ScreenRect => ({ left: x - 4, right: x + 4, top: y - 4, bottom: y + 4 });
const overlaps = (a: ScreenRect, b: ScreenRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('callout placement', () => {
  it('puts a lone label up and to the right', () => {
    const layout = layoutCallouts([item('mic', 400, 250)], bounds, []);
    expect(layout.get('mic')?.placement).toBe(0);
    expect(PLACEMENTS[0]).toMatchObject({ side: 'right' });
  });

  it('moves a label off the plate and away from the edge', () => {
    const plate = { left: 380, right: 700, top: 180, bottom: 240 };
    const nearEdge = layoutCallouts([item('mic', 700, 250)], bounds, [plate]).get('mic')!;
    expect(overlaps(nearEdge.label, plate)).toBe(false);
    expect(nearEdge.label.right).toBeLessThanOrEqual(bounds.width - 4);
  });

  it('keeps its last placement while that still fits', () => {
    const layout = layoutCallouts([item('mic', 400, 250)], bounds, [], new Map([['mic', 4]]));
    expect(layout.get('mic')?.placement).toBe(4);
  });

  it('leaves a callout out when nothing fits', () => {
    expect(layoutCallouts([item('mic', 20, 20)], { width: 40, height: 40 }, []).size).toBe(0);
    expect(layoutCallouts([item('mic', 400, 250)], bounds, [{ left: 390, right: 410, top: 240, bottom: 260 }]).size).toBe(0);
  });

  it('never overlaps labels, rings or the plate, whatever the anchors', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const ids = ['mic', 'speaker', 'node', 'antinode', 'half'] as const;
    for (let round = 0; round < 300; round++) {
      const items = ids.map((id) => item(id, 20 + random() * 760, 20 + random() * 460));
      const plate = { left: 200 + random() * 300, right: 0, top: 300 + random() * 100, bottom: 0 };
      plate.right = plate.left + 220;
      plate.bottom = plate.top + 50;
      const layout = layoutCallouts(items, bounds, [plate]);
      const placed = items.filter(({ id }) => layout.has(id));
      const shapes = placed.flatMap((entry) => [ring(entry), layout.get(entry.id)!.label]);
      for (const shape of shapes) expect(overlaps(shape, plate)).toBe(false);
      for (let first = 0; first < shapes.length; first++) {
        for (let second = first + 1; second < shapes.length; second++) {
          const sameCallout = Math.floor(first / 2) === Math.floor(second / 2);
          if (!sameCallout) expect(overlaps(shapes[first], shapes[second])).toBe(false);
        }
      }
      expect(placed.length).toBeLessThanOrEqual(5);
    }
  });
});
