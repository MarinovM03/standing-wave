/**
 * Coordinates are metres: x = length, y = height, z = width.
 */
export const ROOM = { length: 6, width: 4, height: 2.8 } as const;

export type Axis = 'length' | 'width' | 'height';
export type Position = { x: number; y: number; z: number };

export const AXES: readonly Axis[] = ['length', 'width', 'height'];
export const COORDINATE = { length: 'x', width: 'z', height: 'y' } as const satisfies Record<Axis, keyof Position>;

const MIC_MARGIN = 0.08;
// The cabinet's half-diagonal is 0.21 m, so 0.25 m keeps it off the walls at any angle.
const SPEAKER_MARGIN = 0.25;

export const SPEAKER: Position = { x: SPEAKER_MARGIN, y: 0.35, z: SPEAKER_MARGIN };
export const SPEAKER_MIDDLE: Position = { x: ROOM.length / 2, y: SPEAKER.y, z: ROOM.width / 2 };
export const MIC_CORNER: Position = { x: ROOM.length - MIC_MARGIN, y: MIC_MARGIN, z: ROOM.width - MIC_MARGIN };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampMic(position: Position): Position {
  return {
    x: clamp(position.x, MIC_MARGIN, ROOM.length - MIC_MARGIN),
    y: clamp(position.y, MIC_MARGIN, ROOM.height - MIC_MARGIN),
    z: clamp(position.z, MIC_MARGIN, ROOM.width - MIC_MARGIN),
  };
}

export function clampSpeaker(position: Position): Position {
  return {
    x: clamp(position.x, SPEAKER_MARGIN, ROOM.length - SPEAKER_MARGIN),
    y: clamp(position.y, 0, ROOM.height),
    z: clamp(position.z, SPEAKER_MARGIN, ROOM.width - SPEAKER_MARGIN),
  };
}
