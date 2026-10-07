import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../scene/palette';
import css from './tokens.css?raw';

type Rgb = readonly [number, number, number];

const declarations = new Map(
  Array.from(css.matchAll(/(--[\w-]+):\s*([^;]+);/g), ([, name, value]) => [name, value.trim()]),
);

function token(name: string): string {
  const value = declarations.get(`--${name}`);
  if (value === undefined) throw new Error(`tokens.css has no --${name}`);
  return value;
}

const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;
const channels = (value: number): Rgb => [(value >> 16) & 255, (value >> 8) & 255, value & 255];

function rgba(value: string): { rgb: Rgb; alpha: number } {
  const match = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(value);
  if (!match) throw new Error(`Not an rgba() colour: ${value}`);
  return { rgb: [Number(match[1]), Number(match[2]), Number(match[3])], alpha: Number(match[4]) };
}

// WCAG 2.2 relative luminance and contrast ratio.
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(channel => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('tokens.css', () => {
  it.each(Object.entries(TOKENS))('--%s matches palette.ts', (name, value) => {
    expect(token(name).toLowerCase()).toBe(hex(value));
  });

  it('draws lines in paper and glass in ink, at the skill opacities', () => {
    expect(rgba(token('line'))).toEqual({ rgb: channels(TOKENS.paper), alpha: 0.1 });
    expect(rgba(token('glass'))).toEqual({ rgb: channels(TOKENS.ink), alpha: 0.72 });
    expect(token('glass-blur')).toBe('16px');
    expect(token('glass-radius')).toBe('14px');
  });

  it('keeps muted and paper text readable on ink and raised', () => {
    for (const background of [TOKENS.ink, TOKENS.raised]) {
      expect(contrast(channels(TOKENS.muted), channels(background))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(channels(TOKENS.paper), channels(background))).toBeGreaterThanOrEqual(7);
    }
  });
});
