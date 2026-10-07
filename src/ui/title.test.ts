import { describe, expect, it } from 'vitest';
import { getNearestMode, relativeDb, sampleField, wavelength } from '../model/acoustics';
import { SPEAKER } from '../model/room';
import { printed, readoutValues, settled } from './title';

const mic = { x: 4.9, y: 1.2, z: 2.75 };

function readings(frequency: number, view: 'physics' | 'belief') {
  const mode = getNearestMode(frequency);
  return { view, frequency, wavelength: wavelength(frequency), indices: mode.indices, db: relativeDb(sampleField(mic, frequency, view, mode, SPEAKER)) };
}

describe('title readouts', () => {
  it('settle to the shown precision without a negative zero', () => {
    expect(settled(28.5833, 1)).toBe('28.6');
    expect(settled(-0.04, 1)).toBe('0.0');
    expect(settled(-34.04, 1)).toBe('-34.0');
    expect(printed('-34.0')).toBe('−34.0');
  });

  it('read frequency, wavelength, mode and level re antinode in Actually', () => {
    expect(readoutValues(readings(343 / 12, 'physics'))).toEqual({
      frequency: { value: '28.6', unit: 'Hz' },
      wavelength: { value: '12.00', unit: 'm' },
      mode: { value: '(1, 0, 0)' },
      level: { value: expect.stringMatching(/^-?\d+\.\d$/), unit: 'dB re antinode' },
    });
  });

  it('read no mode and level re speaker in You\'d think', () => {
    const values = readoutValues(readings(343 / 12, 'belief'));
    expect(values.mode).toEqual({ value: 'none' });
    expect(values.level.unit).toBe('dB re speaker');
    expect(Number(values.level.value)).toBeLessThan(-10);
  });
});
