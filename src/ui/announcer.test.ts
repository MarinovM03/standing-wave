import { describe, expect, it } from 'vitest';
import { micAtNode, modeForAxis } from '../model/acoustics';
import { MIC_CORNER, SPEAKER, SPEAKER_MIDDLE } from '../model/room';
import { announcement, band, type Reading } from './announcer';

const length = modeForAxis('length');
const start: Reading = { view: 'physics', mode: length, mic: { x: 4.9, y: 1.2, z: 2.75 }, speaker: SPEAKER, db: -1.6 };

describe('announcer', () => {
  it('says nothing when nothing that matters changed', () => {
    expect(announcement(start, start)).toBeNull();
    expect(announcement(start, { ...start, db: -2.4, mic: { ...start.mic, x: 5.1 } })).toBeNull();
  });

  it('names the view, and the mode when Actually returns', () => {
    const belief = { ...start, view: 'belief' } as const;
    expect(announcement(start, belief)).toBe("You'd think view: the level only falls with distance from the speaker.");
    expect(announcement(belief, start)).toBe('Actually view: length mode (1, 0, 0) at 28.6 Hz.');
  });

  it('names a new mode, and says when the speaker sits on its node', () => {
    expect(announcement(start, { ...start, mode: modeForAxis('width') })).toBe('Width mode (0, 1, 0) at 42.9 Hz.');
    const middle = { ...start, mode: modeForAxis('length', 2), speaker: SPEAKER_MIDDLE };
    expect(announcement(middle, { ...middle, mode: length })).toBe('Length mode (1, 0, 0) at 28.6 Hz, with the speaker on its node.');
  });

  it('announces a speaker landing on a node once', () => {
    const landed = { ...start, speaker: SPEAKER_MIDDLE };
    expect(announcement(start, landed)).toBe("The speaker is on a node, so it can't drive this mode.");
    expect(announcement(landed, { ...landed, speaker: { ...SPEAKER_MIDDLE, z: 1.5 } })).toBeNull();
  });

  it('announces the mic entering a node or an antinode band, with its level', () => {
    const node = { ...start, mic: micAtNode(length, start.mic), db: -34 };
    expect(announcement(start, node)).toBe('The mic is in a node band, at −34.0 dB.');
    const between = { ...start, mic: { ...start.mic, x: 2 }, db: -6 };
    expect(announcement(node, between)).toBeNull();
    expect(announcement(between, { ...start, mic: MIC_CORNER, db: -0.1 })).toBe('The mic is in an antinode band, at −0.1 dB.');
  });

  it('keeps one sentence per change, the view first', () => {
    const everything = { ...start, view: 'belief', mode: modeForAxis('height'), speaker: SPEAKER_MIDDLE } as const;
    expect(announcement(start, everything)).toMatch(/^You'd think view/);
    expect(announcement({ ...start, view: 'belief' }, { ...everything, mic: MIC_CORNER })).toBeNull();
  });

  it('bands the mode shape at −18 dB and −3 dB', () => {
    expect(band(0)).toBe('node');
    expect(band(0.12)).toBe('node');
    expect(band(0.5)).toBe('between');
    expect(band(0.75)).toBe('antinode');
  });
});
