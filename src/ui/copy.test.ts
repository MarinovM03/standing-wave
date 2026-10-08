import { describe, expect, it } from 'vitest';
import * as copy from './copy';
import fonts from './styles/fonts.css?raw';

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

const UNIT = /^\s?(?:Hz|kHz|m\/s|ms|m|dB|s|%)(?!\w)/;

// "No. 02" names a lab, "×2" is a factor and "@marinovm10" a handle; every other number is a quantity.
function unitless(text: string): string[] {
  return Array.from(text.matchAll(/\d+(?:\.\d+)?/g))
    .filter(match => !/(?:No\. |×|[a-z])$/i.test(text.slice(0, match.index)) && !UNIT.test(text.slice(match.index + match[0].length)))
    .map(match => match[0]);
}

function latinRanges(): [number, number][] {
  const lists = fonts.split('@font-face')
    .filter(block => block.includes('latin.woff2'))
    .map(block => /unicode-range:([^;]+);/.exec(block)![1].trim());
  expect(lists).toHaveLength(3);
  expect(new Set(lists).size, 'the three latin subsets share one range').toBe(1);
  return lists[0].split(',').map(range => {
    const [start, end = start] = range.trim().replace(/^U\+/i, '').split('-');
    return [parseInt(start, 16), parseInt(end, 16)];
  });
}

const all = strings(copy);
// Key names and source titles are names, not quantities.
const prose = strings({
  ...copy,
  KEYS: undefined,
  HELP: { ...copy.HELP, keys: copy.HELP.keys.map(row => row.action), sources: copy.HELP.sources.map(source => source.href) },
});

describe('copy', () => {
  it('has no em dashes', () => {
    for (const text of all) expect(text, text).not.toMatch(/—/);
  });

  it('gives every number a unit', () => {
    expect(unitless('A 6 metre room, 343 m/s, No. 02, Length ×2, @marinovm10')).toEqual(['6']);
    for (const text of prose) expect(unitless(text), text).toEqual([]);
  });

  it('follows the hook formula with an Actually line under 12 words', () => {
    expect(copy.HOOK.youdThink).toMatch(/^You'd think .+\.$/);
    expect(copy.HOOK.actually).toMatch(/^Actually, .+\.$/);
    expect(copy.HOOK.actually.split(/\s+/).length).toBeLessThan(12);
    expect(copy.PAGE.description).toBe(`${copy.HOOK.youdThink} ${copy.HOOK.actually}`);
  });

  it('gives help five steps that end with the speaker break, and every simplification the lab makes', () => {
    expect(copy.HELP.steps).toHaveLength(5);
    expect(copy.HELP.steps.at(-1)).toMatch(/^Break it: .*speaker/);
    const simplified = copy.HELP.simplified.join(' ');
    expect(simplified).toMatch(/cutaway is only for viewing/);
    expect(simplified).toMatch(/closed rigid box/);
    expect(simplified).toMatch(/brightness is a display ramp/);
    expect(simplified).toMatch(/contours carry the true level/);
  });

  it('only uses glyphs the bundled latin subsets cover', () => {
    const ranges = latinRanges();
    for (const text of all) {
      for (const glyph of text) {
        const code = glyph.codePointAt(0)!;
        expect(ranges.some(([start, end]) => code >= start && code <= end), `U+${code.toString(16)} in "${text}"`).toBe(true);
      }
    }
  });
});
