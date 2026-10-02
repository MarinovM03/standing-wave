import { describe, expect, it } from 'vitest';
import { TOUCH_RADIUS, chooseTarget, type TargetCandidate } from './pointer';

const at = { x: 100, y: 100 };
const candidate = (id: TargetCandidate['id'], rayDistance: number | null, dx = 0, dy = 0): TargetCandidate =>
  ({ id, rayDistance, screen: { x: at.x + dx, y: at.y + dy } });

describe('pointer target choice', () => {
  it('takes the object the ray hits first', () => {
    expect(chooseTarget([candidate('speaker', 8), candidate('mic', 5)], at, false)).toBe('mic');
    expect(chooseTarget([candidate('speaker', 4), candidate('mic', 5)], at, true)).toBe('speaker');
  });

  it('gives a mouse only what it hits', () => {
    expect(chooseTarget([candidate('mic', null, 3, 0)], at, false)).toBeNull();
  });

  it('lets a finger take the closest anchor inside the touch radius', () => {
    expect(chooseTarget([candidate('speaker', null, 20, 0), candidate('mic', null, 0, 12)], at, true)).toBe('mic');
    expect(chooseTarget([candidate('mic', null, TOUCH_RADIUS, 0)], at, true)).toBe('mic');
  });

  it('gives a finger nothing beyond the touch radius', () => {
    expect(chooseTarget([candidate('mic', null, TOUCH_RADIUS + 1, 0)], at, true)).toBeNull();
  });

  it('prefers a direct hit to a nearer anchor', () => {
    expect(chooseTarget([candidate('mic', null, 2, 0), candidate('speaker', 9, 20, 0)], at, true)).toBe('speaker');
  });

  it('ignores anchors that are off screen', () => {
    expect(chooseTarget([{ id: 'mic', rayDistance: null, screen: null }], at, true)).toBeNull();
  });
});
