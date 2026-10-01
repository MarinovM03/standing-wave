import { describe, expect, it } from 'vitest';
import { MIC_CORNER, ROOM, SPEAKER, SPEAKER_MIDDLE, clampMic, clampSpeaker } from './room';

describe('room limits', () => {
  it('keeps the mic inside the walls, floor and ceiling', () => {
    expect(clampMic({ x: -1, y: -1, z: -1 })).toEqual({ x: 0.08, y: 0.08, z: 0.08 });
    expect(clampMic({ x: 99, y: 99, z: 99 })).toEqual({ x: ROOM.length - 0.08, y: ROOM.height - 0.08, z: ROOM.width - 0.08 });
    expect(clampMic({ x: 3, y: 1.2, z: 2 })).toEqual({ x: 3, y: 1.2, z: 2 });
  });

  it('keeps the speaker cabinet off the walls', () => {
    expect(clampSpeaker({ x: 0, y: 0.35, z: 0 })).toEqual(SPEAKER);
    expect(clampSpeaker({ x: 99, y: 0.35, z: 99 })).toEqual({ x: ROOM.length - 0.25, y: 0.35, z: ROOM.width - 0.25 });
    expect(clampSpeaker({ x: 3, y: 9, z: 2 })).toEqual({ x: 3, y: ROOM.height, z: 2 });
  });

  it('leaves the presets where they are', () => {
    expect(clampMic(MIC_CORNER)).toEqual(MIC_CORNER);
    expect(clampSpeaker(SPEAKER)).toEqual(SPEAKER);
    expect(clampSpeaker(SPEAKER_MIDDLE)).toEqual(SPEAKER_MIDDLE);
    expect(SPEAKER_MIDDLE).toEqual({ x: ROOM.length / 2, y: SPEAKER.y, z: ROOM.width / 2 });
  });
});
