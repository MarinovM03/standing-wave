import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { halfWavelength, modeForAxis } from '../model/acoustics';
import { ROOM, SPEAKER } from '../model/room';
import { anchorWorldPoints, halfWaveLine, projectAnchors, projectPoint, projectRect } from './anchors';

function camera(offset = { x: 0, y: 0 }) {
  const view = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100);
  view.setViewOffset(800, 600, offset.x, offset.y, 800, 600);
  view.position.set(0, 0, 10);
  view.lookAt(0, 0, 0);
  view.updateMatrixWorld();
  return view;
}

describe('anchor projection', () => {
  it('puts the point the camera looks at in the middle of the canvas', () => {
    expect(projectPoint(new THREE.Vector3(0, 0, 0), camera(), 800, 600)).toEqual({ x: 400, y: 300, visible: true });
  });

  it('maps up to the top of the canvas and right to the right', () => {
    const point = projectPoint(new THREE.Vector3(1, 1, 0), camera(), 800, 600);
    expect(point.x).toBeGreaterThan(400);
    expect(point.y).toBeLessThan(300);
  });

  it('hides points behind the camera or off the canvas', () => {
    expect(projectPoint(new THREE.Vector3(0, 0, 20), camera(), 800, 600).visible).toBe(false);
    expect(projectPoint(new THREE.Vector3(40, 0, 0), camera(), 800, 600).visible).toBe(false);
  });

  it('follows the view offset that frames the room beside the interface', () => {
    const point = projectPoint(new THREE.Vector3(0, 0, 0), camera({ x: 100, y: -50 }), 800, 600);
    expect(point).toEqual({ x: 300, y: 350, visible: true });
  });

  it('bounds a rectangle, or gives up when a corner is behind the camera', () => {
    const square = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    const rect = projectRect(square, camera(), 800, 600)!;
    expect(rect.left).toBeLessThan(400);
    expect(rect.right).toBeGreaterThan(400);
    expect((rect.left + rect.right) / 2).toBeCloseTo(400);
    expect((rect.top + rect.bottom) / 2).toBeCloseTo(300);
    expect(projectRect([...square, new THREE.Vector3(0, 0, 30)], camera(), 800, 600)).toBeNull();
  });

  it('projects every callout and the plate in one pass', () => {
    const world = anchorWorldPoints(modeForAxis('length'), { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const anchors = projectAnchors(world, [new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, 1, 0)], camera(), 800, 600);
    expect(anchors.points.mic).toEqual({ x: 400, y: 300, visible: true });
    expect(anchors.plate).not.toBeNull();
    expect(Object.keys(anchors.points)).toHaveLength(6);
  });
});

describe('anchor positions', () => {
  const mic = { x: 4.9, y: 1.2, z: 2.75 };

  it('rings the speaker at its driver and the mic at its tip', () => {
    const world = anchorWorldPoints(modeForAxis('length'), mic, SPEAKER);
    expect(world.speaker.toArray()).toEqual([SPEAKER.x, SPEAKER.y, SPEAKER.z]);
    expect(world.mic.toArray()).toEqual([mic.x, mic.y, mic.z]);
    expect(world.distance.toArray()).toEqual([(mic.x + SPEAKER.x) / 2, (mic.y + SPEAKER.y) / 2, (mic.z + SPEAKER.z) / 2]);
  });

  it.each([
    ['length', 'x', ROOM.length / 2],
    ['width', 'z', ROOM.width / 2],
    ['height', 'y', ROOM.height / 2],
  ] as const)('puts the %s node callout on the node plane', (axis, coordinate, at) => {
    expect(anchorWorldPoints(modeForAxis(axis), mic, SPEAKER).node[coordinate]).toBeCloseTo(at);
  });

  it('puts the antinode callout on the far antinode plane', () => {
    expect(anchorWorldPoints(modeForAxis('length', 2), mic, SPEAKER).antinode.x).toBe(ROOM.length);
    expect(anchorWorldPoints(modeForAxis('width'), mic, SPEAKER).antinode.z).toBe(ROOM.width);
    expect(anchorWorldPoints(modeForAxis('height'), mic, SPEAKER).antinode.y).toBe(ROOM.height);
  });

  it.each([1, 2, 3])('draws the dimension one half wavelength long for order %i', (order) => {
    const mode = modeForAxis('length', order);
    const { start, end } = halfWaveLine(mode);
    expect(start.distanceTo(end)).toBeCloseTo(halfWavelength(mode));
    expect(anchorWorldPoints(mode, mic, SPEAKER).half.x).toBeCloseTo(halfWavelength(mode) / 2);
  });

  it('keeps the dimension outside the room', () => {
    for (const axis of ['length', 'width', 'height'] as const) {
      const { start } = halfWaveLine(modeForAxis(axis));
      expect(start.x > ROOM.length || start.z > ROOM.width).toBe(true);
    }
  });
});
