import { describe, expect, it } from 'vitest';
import { getNearestMode, modeForAxis, nodePlanes } from '../model/acoustics';
import { MIC_CORNER, ROOM, SPEAKER, SPEAKER_MIDDLE } from '../model/room';
import { INITIAL_STATE, PRESETS, transition, type Action, type LabState } from './state';

function run(...actions: Action[]): LabState {
  return actions.reduce(transition, INITIAL_STATE);
}

describe('lab state', () => {
  it('starts on the first length mode with the note stopped and sound on', () => {
    expect(getNearestMode(INITIAL_STATE.frequency).indices).toEqual([1, 0, 0]);
    expect(INITIAL_STATE.frequency).toBeCloseTo(28.58, 2);
    expect(INITIAL_STATE).toMatchObject({ view: 'physics', playing: false, sound: true, cinematic: false, uiHidden: false, speaker: SPEAKER });
  });

  it('selects the four presets and returns to Actually', () => {
    const expected = { 1: [1, 0, 0], 2: [0, 1, 0], 3: [0, 0, 1], 4: [2, 0, 0] } as const;
    for (const preset of [1, 2, 3, 4] as const) {
      const state = run({ type: 'setView', view: 'belief' }, { type: 'preset', preset });
      expect(getNearestMode(state.frequency).indices).toEqual(expected[preset]);
      expect(state.frequency).toBe(modeForAxis(PRESETS[preset].axis, PRESETS[preset].order).frequency);
      expect(state.view).toBe('physics');
    }
  });

  it('clamps the frequency and ignores values that are not numbers', () => {
    expect(run({ type: 'setFrequency', frequency: 5 }).frequency).toBe(25);
    expect(run({ type: 'setFrequency', frequency: 900 }).frequency).toBe(200);
    expect(run({ type: 'setFrequency', frequency: 80 }).frequency).toBe(80);
    expect(run({ type: 'setFrequency', frequency: Number.NaN })).toBe(INITIAL_STATE);
  });

  it('toggles the view, the note, the sound and the interface', () => {
    expect(run({ type: 'toggleView' }).view).toBe('belief');
    expect(run({ type: 'toggleView' }, { type: 'toggleView' }).view).toBe('physics');
    expect(run({ type: 'togglePlay' }).playing).toBe(true);
    expect(run({ type: 'togglePlay' }, { type: 'stopNote' }).playing).toBe(false);
    expect(run({ type: 'toggleSound' }).sound).toBe(false);
    expect(run({ type: 'toggleUI' }).uiHidden).toBe(true);
    expect(run({ type: 'toggleUI' }, { type: 'showUI' }).uiHidden).toBe(false);
    expect(run({ type: 'toggleCinematic' }, { type: 'leaveCinematic' }).cinematic).toBe(false);
  });

  it('keeps the note going silently when sound fails', () => {
    const state = run({ type: 'togglePlay' }, { type: 'soundFailed' });
    expect(state).toMatchObject({ playing: true, sound: false });
  });

  it('resets the experiment but leaves the note, the sound and the interface alone', () => {
    const changed = run(
      { type: 'preset', preset: 3 }, { type: 'toggleView' }, { type: 'micToCorner' }, { type: 'speakerToMiddle' },
      { type: 'toggleCinematic' }, { type: 'togglePlay' }, { type: 'toggleSound' }, { type: 'toggleUI' },
    );
    expect(transition(changed, { type: 'reset' })).toEqual({ ...INITIAL_STATE, playing: true, sound: false, uiHidden: true });
  });

  it('full reset with Shift+R also stops the note and shows the interface, and keeps the sound setting', () => {
    const changed = run({ type: 'preset', preset: 2 }, { type: 'togglePlay' }, { type: 'toggleSound' }, { type: 'toggleUI' }, { type: 'toggleCinematic' });
    expect(transition(changed, { type: 'fullReset' })).toEqual({ ...INITIAL_STATE, sound: false });
  });

  it('nudges the mic and keeps it inside the walls', () => {
    const moved = run({ type: 'nudgeMic', dx: 0.1, dz: -0.4 });
    expect(moved.mic.x).toBeCloseTo(5.0, 10);
    expect(moved.mic.z).toBeCloseTo(2.35, 10);
    const pinned = run({ type: 'micToCorner' }, { type: 'nudgeMic', dx: 0.4, dz: 0.4 });
    expect(pinned.mic).toEqual(MIC_CORNER);
    expect(run({ type: 'setMicHeight', y: 9 }).mic.y).toBe(ROOM.height - 0.08);
  });

  it('moves the mic to the node of the current mode and back to Actually', () => {
    for (const preset of [1, 2, 3, 4] as const) {
      const state = run({ type: 'preset', preset }, { type: 'toggleView' }, { type: 'micToNode' });
      const { axis } = PRESETS[preset];
      const coordinate = axis === 'length' ? 'x' : axis === 'width' ? 'z' : 'y';
      expect(state.mic[coordinate]).toBe(nodePlanes(getNearestMode(state.frequency))[0]);
      expect(state.view).toBe('physics');
    }
  });

  it('places the mic in the corner and the speaker in the middle, clamping drags', () => {
    expect(run({ type: 'micToCorner' }).mic).toEqual(MIC_CORNER);
    expect(run({ type: 'speakerToMiddle' }).speaker).toEqual(SPEAKER_MIDDLE);
    expect(run({ type: 'moveSpeaker', position: { x: -5, y: 0.35, z: 99 } }).speaker).toEqual({ x: 0.25, y: 0.35, z: ROOM.width - 0.25 });
    expect(run({ type: 'moveMic', position: { x: 99, y: 1, z: -1 } }).mic).toEqual({ x: ROOM.length - 0.08, y: 1, z: 0.08 });
  });

  it('never changes the state it is given', () => {
    const frozen = Object.freeze({ ...INITIAL_STATE, mic: Object.freeze({ ...INITIAL_STATE.mic }) });
    expect(() => transition(frozen, { type: 'nudgeMic', dx: 0.1, dz: 0 })).not.toThrow();
    expect(frozen.mic.x).toBe(4.9);
  });
});
