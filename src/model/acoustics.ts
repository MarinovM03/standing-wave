import { AXES, COORDINATE, ROOM, SPEAKER, type Axis, type Position } from './room';

export const SPEED_OF_SOUND = 343;
export const MODE_Q = 12;
export const FIELD_FLOOR = 0.02;
export const FREQUENCY_MIN = 25;
export const FREQUENCY_MAX = 200;

export type ViewMode = 'physics' | 'belief';
export type Mode = {
  axis: Axis;
  order: number;
  frequency: number;
  /** Conventional order: length, width, height (not Three.js xyz). */
  indices: [number, number, number];
  label: string;
};

/** A pressure mode whose wavelength fits n half-waves along one dimension. */
export function modeForAxis(axis: Axis, order = 1): Mode {
  if (!Number.isInteger(order) || order < 1) {
    throw new RangeError('Mode order must be a positive integer.');
  }
  const indices: [number, number, number] = [0, 0, 0];
  indices[AXES.indexOf(axis)] = order;
  return {
    axis,
    order,
    frequency: (order * SPEED_OF_SOUND) / (2 * ROOM[axis]),
    indices,
    label: `(${indices.join(', ')})`,
  };
}

export const AXIAL_MODES: Mode[] = AXES.flatMap((axis) => {
  const highestOrder = Math.floor((2 * ROOM[axis] * FREQUENCY_MAX) / SPEED_OF_SOUND);
  return Array.from({ length: highestOrder }, (_, index) => modeForAxis(axis, index + 1));
})
  .filter((mode) => mode.frequency >= FREQUENCY_MIN)
  .toSorted((a, b) => a.frequency - b.frequency);

function assertPositiveFrequency(frequency: number): void {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    throw new RangeError('Frequency must be a finite positive number in hertz.');
  }
}

export function getNearestMode(frequency: number): Mode {
  assertPositiveFrequency(frequency);
  return AXIAL_MODES.reduce((nearest, mode) =>
    Math.abs(mode.frequency - frequency) < Math.abs(nearest.frequency - frequency)
      ? mode
      : nearest,
  );
}

export function modeShape(position: Position, mode: Mode): number {
  return Math.cos((mode.order * Math.PI * position[COORDINATE[mode.axis]]) / ROOM[mode.axis]);
}

export function getResponse(frequency: number, mode: Mode): number {
  assertPositiveFrequency(frequency);
  const detuning = (frequency - mode.frequency) / mode.frequency;
  return 1 / Math.sqrt(1 + (2 * MODE_Q * detuning) ** 2);
}

/** How strongly a speaker at this point drives the mode (Russell, Driving Room Modes: Source Location). */
export function coupling(source: Position, mode: Mode): number {
  return Math.abs(modeShape(source, mode));
}

export function sampleField(
  position: Position,
  frequency: number,
  view: ViewMode,
  mode = getNearestMode(frequency),
  source = SPEAKER,
): number {
  if (view === 'belief') {
    const distance = Math.hypot(
      position.x - source.x,
      position.y - source.y,
      position.z - source.z,
    );
    return 1 / (1 + distance);
  }
  return FIELD_FLOOR + (1 - FIELD_FLOOR) * Math.abs(modeShape(position, mode)) * coupling(source, mode) * getResponse(frequency, mode);
}

export function relativeDb(amplitude: number): number {
  return 20 * Math.log10(Math.min(1, Math.max(0.01, amplitude)));
}

/** Wavelength in metres for a frequency in hertz. */
export function wavelength(frequency: number): number {
  assertPositiveFrequency(frequency);
  return SPEED_OF_SOUND / frequency;
}

/** Positions in metres along the mode's axis where its pressure is zero. */
export function nodePlanes(mode: Mode): number[] {
  const size = ROOM[mode.axis];
  return Array.from({ length: mode.order }, (_, index) => ((2 * index + 1) * size) / (2 * mode.order));
}

export function antinodePlanes(mode: Mode): number[] {
  const size = ROOM[mode.axis];
  return Array.from({ length: mode.order + 1 }, (_, index) => (index * size) / mode.order);
}

export function halfWavelength(mode: Mode): number {
  return ROOM[mode.axis] / mode.order;
}

export function micAtNode(mode: Mode, mic: Position): Position {
  return { ...mic, [COORDINATE[mode.axis]]: nodePlanes(mode)[0] };
}
