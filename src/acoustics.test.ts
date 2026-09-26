import { describe, expect, it } from 'vitest';
import {
  AXIAL_MODES,
  FIELD_FLOOR,
  MODE_Q,
  ROOM,
  SPEAKER,
  getNearestMode,
  getResponse,
  modeForAxis,
  modeShape,
  relativeDb,
  sampleField,
  wavelength,
  type Axis,
  type Position,
} from './acoustics';

const centre = { x: ROOM.length / 2, y: ROOM.height / 2, z: ROOM.width / 2 };
const coordinateForAxis = { length: 'x', width: 'z', height: 'y' } as const;

describe('rigid rectangular-room eigenmodes', () => {
  it('uses metres, hertz and conventional length/width/height indices', () => {
    expect(modeForAxis('length').frequency).toBeCloseTo(28.583333333);
    expect(modeForAxis('width').frequency).toBeCloseTo(42.875);
    expect(modeForAxis('height').frequency).toBeCloseTo(61.25);
    expect(modeForAxis('height').indices).toEqual([0, 0, 1]);
    expect(modeForAxis('width', 2).indices).toEqual([0, 2, 0]);
    expect(wavelength(28.583333333)).toBeCloseTo(12);
    expect(wavelength(100)).toBeCloseTo(3.43);
  });

  it.each<Axis>(['length', 'width', 'height'])('%s fundamental has wall antinodes and a central node', (axis) => {
    const mode = modeForAxis(axis);
    const coordinate = coordinateForAxis[axis];
    const nearWall: Position = { ...centre, [coordinate]: 0 };
    const farWall: Position = { ...centre, [coordinate]: ROOM[axis] };
    expect(modeShape(nearWall, mode)).toBeCloseTo(1);
    expect(modeShape(farWall, mode)).toBeCloseTo(-1);
    expect(modeShape(centre, mode)).toBeCloseTo(0);
    expect(sampleField(nearWall, mode.frequency, 'physics', mode)).toBeCloseTo(1);
    expect(sampleField(centre, mode.frequency, 'physics', mode)).toBeCloseTo(FIELD_FLOOR);
  });

  it('second order has two interior nodes and an antinode in the middle', () => {
    const mode = modeForAxis('length', 2);
    expect(mode.frequency).toBeCloseTo(57.1666666667);
    expect(modeShape({ ...centre, x: ROOM.length / 4 }, mode)).toBeCloseTo(0);
    expect(modeShape({ ...centre, x: (3 * ROOM.length) / 4 }, mode)).toBeCloseTo(0);
    expect(modeShape(centre, mode)).toBeCloseTo(-1);
  });

  it('isolates a nearest mode while retaining coincident modes in the catalogue', () => {
    expect(getNearestMode(29).indices).toEqual([1, 0, 0]);
    expect(getNearestMode(43).indices).toEqual([0, 1, 0]);
    expect(getNearestMode(61).indices).toEqual([0, 0, 1]);
    const coincident = AXIAL_MODES.filter((mode) => Math.abs(mode.frequency - 85.75) < 0.001);
    expect(coincident.map((mode) => mode.indices)).toEqual([[3, 0, 0], [0, 2, 0]]);
    expect(getNearestMode(85.75).indices).toEqual([3, 0, 0]);
    expect(AXIAL_MODES.every((mode) => mode.frequency >= 25 && mode.frequency <= 200)).toBe(true);
  });

  it('keeps the source away from nodes of every included mode', () => {
    for (const mode of AXIAL_MODES) expect(Math.abs(modeShape(SPEAKER, mode))).toBeGreaterThan(0.01);
  });
});

describe('normalized explanatory response', () => {
  it('peaks at resonance and reaches -3dB at the chosen half-bandwidth', () => {
    const mode = modeForAxis('length');
    expect(getResponse(mode.frequency, mode)).toBe(1);
    const halfBandwidth = mode.frequency / (2 * MODE_Q);
    expect(getResponse(mode.frequency + halfBandwidth, mode)).toBeCloseTo(Math.SQRT1_2);
    expect(getResponse(mode.frequency - halfBandwidth, mode)).toBeCloseTo(Math.SQRT1_2);
    expect(getResponse(mode.frequency + 10, mode)).toBeLessThan(getResponse(mode.frequency + 2, mode));
  });

  it('keeps pressure and response bounded across the full frequency and room range', () => {
    for (let frequency = 25; frequency <= 200; frequency += 2.5) {
      const mode = getNearestMode(frequency);
      expect(getResponse(frequency, mode)).toBeGreaterThan(0);
      expect(getResponse(frequency, mode)).toBeLessThanOrEqual(1);
      for (let fraction = 0; fraction <= 1; fraction += 0.1) {
        const position = { x: fraction * ROOM.length, y: fraction * ROOM.height, z: fraction * ROOM.width };
        const physics = sampleField(position, frequency, 'physics', mode);
        const belief = sampleField(position, frequency, 'belief', mode);
        expect(physics).toBeGreaterThanOrEqual(FIELD_FLOOR);
        expect(physics).toBeLessThanOrEqual(1);
        expect(belief).toBeGreaterThan(0);
        expect(belief).toBeLessThanOrEqual(1);
      }
    }
  });

  it('distinguishes distance-only intuition from a far-wall pressure antinode', () => {
    const mode = modeForAxis('length');
    const node = { ...SPEAKER, x: 3 };
    const farWall = { ...SPEAKER, x: 6 };
    expect(sampleField(farWall, mode.frequency, 'belief')).toBeLessThan(sampleField(node, mode.frequency, 'belief'));
    expect(sampleField(farWall, mode.frequency, 'physics')).toBeGreaterThan(sampleField(node, mode.frequency, 'physics'));
    expect(sampleField(SPEAKER, mode.frequency, 'belief')).toBe(1);
  });

  it('reports pressure amplitude in relative dB with a finite display floor', () => {
    expect(relativeDb(1)).toBe(0);
    expect(relativeDb(0.5)).toBeCloseTo(-6.0205999);
    expect(relativeDb(0)).toBe(-40);
    expect(relativeDb(0.001)).toBe(-40);
    expect(relativeDb(2)).toBe(0);
    expect(relativeDb(FIELD_FLOOR)).toBeCloseTo(-33.9794);
  });

  it('rejects nonphysical input units instead of returning a plausible-looking result', () => {
    expect(() => wavelength(0)).toThrow(RangeError);
    expect(() => getNearestMode(Number.NaN)).toThrow(RangeError);
    expect(() => getResponse(-1, modeForAxis('length'))).toThrow(RangeError);
    expect(() => modeForAxis('length', 0)).toThrow(RangeError);
    expect(() => modeForAxis('length', 1.5)).toThrow(RangeError);
  });
});
