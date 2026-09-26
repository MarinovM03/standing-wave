/**
 * Coordinates are metres: x = length, y = height, z = width.
 */
export const ROOM = { length: 6, width: 4, height: 2.8 } as const;
export const SPEED_OF_SOUND = 343;
export const SPEAKER: Position = { x: 0.25, y: 0.35, z: 0.25 };
export const MODE_Q = 12;
export const FIELD_FLOOR = 0.02;
export const FREQUENCY_MIN = 25;
export const FREQUENCY_MAX = 200;

export type Axis = 'length' | 'width' | 'height';
export type ViewMode = 'physics' | 'belief';
export type Position = { x: number; y: number; z: number };
export type Mode = {
  axis: Axis;
  order: number;
  frequency: number;
  /** Conventional order: length, width, height (not Three.js xyz). */
  indices: [number, number, number];
  label: string;
};

const AXES: Axis[] = ['length', 'width', 'height'];

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
  .sort((a, b) => a.frequency - b.frequency);

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
  const distance =
    mode.axis === 'length' ? position.x : mode.axis === 'width' ? position.z : position.y;
  return Math.cos((mode.order * Math.PI * distance) / ROOM[mode.axis]);
}

export function getResponse(frequency: number, mode: Mode): number {
  assertPositiveFrequency(frequency);
  const detuning = (frequency - mode.frequency) / mode.frequency;
  return 1 / Math.sqrt(1 + (2 * MODE_Q * detuning) ** 2);
}

export function sampleField(
  position: Position,
  frequency: number,
  view: ViewMode,
  mode = getNearestMode(frequency),
): number {
  if (view === 'belief') {
    const distance = Math.hypot(
      position.x - SPEAKER.x,
      position.y - SPEAKER.y,
      position.z - SPEAKER.z,
    );
    return 1 / (1 + distance);
  }
  return FIELD_FLOOR + (1 - FIELD_FLOOR) * Math.abs(modeShape(position, mode)) * getResponse(frequency, mode);
}

export function relativeDb(amplitude: number): number {
  return 20 * Math.log10(Math.min(1, Math.max(0.01, amplitude)));
}

/** Wavelength in metres for a frequency in hertz. */
export function wavelength(frequency: number): number {
  assertPositiveFrequency(frequency);
  return SPEED_OF_SOUND / frequency;
}
