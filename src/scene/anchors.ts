import * as THREE from 'three';
import { antinodePlanes, halfWavelength, nodePlanes, type Mode } from '../model/acoustics';
import { ROOM, type Position } from '../model/room';
import { SLAB } from './model';

export type CalloutId = 'mic' | 'speaker' | 'node' | 'antinode' | 'half' | 'distance';
export type ScreenPoint = { x: number; y: number; visible: boolean };
export type ScreenRect = { left: number; top: number; right: number; bottom: number };
export type Anchors = {
  width: number;
  height: number;
  points: Record<CalloutId, ScreenPoint>;
  plate: ScreenRect | null;
};

export const CALLOUT_IDS: readonly CalloutId[] = ['mic', 'speaker', 'node', 'antinode', 'half', 'distance'];

const DIMENSION_OFFSET = 0.32;
const DIMENSION_TICK = 0.08;
const PLINTH_TOP = -SLAB + 0.004;

export function halfWaveLine(mode: Mode): { start: THREE.Vector3; end: THREE.Vector3; tick: THREE.Vector3 } {
  const span = halfWavelength(mode);
  if (mode.axis === 'length') {
    const z = ROOM.width + DIMENSION_OFFSET;
    return { start: new THREE.Vector3(0, PLINTH_TOP, z), end: new THREE.Vector3(span, PLINTH_TOP, z), tick: new THREE.Vector3(0, 0, DIMENSION_TICK) };
  }
  if (mode.axis === 'width') {
    const x = ROOM.length + DIMENSION_OFFSET;
    return { start: new THREE.Vector3(x, PLINTH_TOP, 0), end: new THREE.Vector3(x, PLINTH_TOP, span), tick: new THREE.Vector3(DIMENSION_TICK, 0, 0) };
  }
  const x = ROOM.length + DIMENSION_OFFSET;
  const z = ROOM.width + DIMENSION_OFFSET;
  return { start: new THREE.Vector3(x, 0, z), end: new THREE.Vector3(x, span, z), tick: new THREE.Vector3(DIMENSION_TICK, 0, 0) };
}

export function planeOutline(mode: Mode, at: number): THREE.Vector3[] {
  const { length: L, width: W, height: H } = ROOM;
  if (mode.axis === 'length') return [new THREE.Vector3(at, 0, 0), new THREE.Vector3(at, 0, W), new THREE.Vector3(at, H, W), new THREE.Vector3(at, H, 0)];
  if (mode.axis === 'width') return [new THREE.Vector3(0, 0, at), new THREE.Vector3(L, 0, at), new THREE.Vector3(L, H, at), new THREE.Vector3(0, H, at)];
  return [new THREE.Vector3(0, at, 0), new THREE.Vector3(L, at, 0), new THREE.Vector3(L, at, W), new THREE.Vector3(0, at, W)];
}

export function anchorWorldPoints(mode: Mode, mic: Position, speaker: Position): Record<CalloutId, THREE.Vector3> {
  const { length: L, width: W, height: H } = ROOM;
  const node = planeOutline(mode, nodePlanes(mode)[0])[2];
  const farAntinode = antinodePlanes(mode).at(-1)!;
  const antinode = mode.axis === 'length'
    ? new THREE.Vector3(farAntinode, H, W / 2)
    : mode.axis === 'width' ? new THREE.Vector3(L / 2, H, farAntinode) : new THREE.Vector3(L / 2, farAntinode, W);
  const half = halfWaveLine(mode);
  const micPoint = new THREE.Vector3(mic.x, mic.y, mic.z);
  const speakerPoint = new THREE.Vector3(speaker.x, speaker.y, speaker.z);
  return {
    mic: micPoint,
    speaker: speakerPoint,
    node,
    antinode,
    half: half.start.clone().lerp(half.end, 0.5),
    distance: speakerPoint.clone().lerp(micPoint, 0.5),
  };
}

const projected = new THREE.Vector3();

export function projectPoint(point: THREE.Vector3, camera: THREE.Camera, width: number, height: number): ScreenPoint {
  projected.copy(point).project(camera);
  const x = Math.round((projected.x * 0.5 + 0.5) * width * 2) / 2;
  const y = Math.round((-projected.y * 0.5 + 0.5) * height * 2) / 2;
  const visible = projected.z > -1 && projected.z < 1 && x >= 0 && x <= width && y >= 0 && y <= height;
  return { x, y, visible };
}

export function projectRect(points: readonly THREE.Vector3[], camera: THREE.Camera, width: number, height: number): ScreenRect | null {
  const rect = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const point of points) {
    projected.copy(point).project(camera);
    if (projected.z <= -1 || projected.z >= 1) return null;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    rect.left = Math.min(rect.left, x);
    rect.right = Math.max(rect.right, x);
    rect.top = Math.min(rect.top, y);
    rect.bottom = Math.max(rect.bottom, y);
  }
  return rect;
}

export function projectAnchors(
  world: Record<CalloutId, THREE.Vector3>,
  plate: readonly THREE.Vector3[],
  camera: THREE.Camera,
  width: number,
  height: number,
): Anchors {
  const points = {} as Record<CalloutId, ScreenPoint>;
  for (const id of CALLOUT_IDS) points[id] = projectPoint(world[id], camera, width, height);
  return { width, height, points, plate: projectRect(plate, camera, width, height) };
}
