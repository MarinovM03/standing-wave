import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ROOM } from '../model/room';
import { FOV, NO_INSETS, frameView, homeDirection, type Framing, type Insets } from './camera';

const room = [0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].map((z) =>
  new THREE.Vector3(x * ROOM.length, y * ROOM.height, z * ROOM.width))));

function screenBox(framing: Framing, width: number, height: number) {
  const camera = new THREE.PerspectiveCamera(FOV, width / height, 0.05, 1000);
  camera.setViewOffset(width, height, framing.offset.x, framing.offset.y, width, height);
  camera.position.copy(framing.position);
  camera.lookAt(framing.target);
  camera.updateMatrixWorld();
  const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (const point of room) {
    const ndc = point.clone().project(camera);
    const x = (ndc.x * 0.5 + 0.5) * width;
    const y = (-ndc.y * 0.5 + 0.5) * height;
    box.left = Math.min(box.left, x);
    box.right = Math.max(box.right, x);
    box.top = Math.min(box.top, y);
    box.bottom = Math.max(box.bottom, y);
  }
  return { ...box, x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
}

function freeArea(width: number, height: number, insets: Insets) {
  return { left: insets.left, top: insets.top, right: width - insets.right, bottom: height - insets.bottom };
}

describe('framing from insets', () => {
  it('centres the room on the canvas when nothing covers it', () => {
    const framing = frameView(1440, 900, NO_INSETS, room);
    const box = screenBox(framing, 1440, 900);
    expect(framing.offset).toEqual({ x: 0, y: 0 });
    expect(box.x).toBeCloseTo(720, 0);
    expect(box.y).toBeCloseTo(450, 0);
  });

  it.each<[number, number, Insets]>([
    [1440, 900, { top: 140, right: 0, bottom: 220, left: 360 }],
    [390, 844, { top: 120, right: 0, bottom: 300, left: 0 }],
    [844, 390, { top: 0, right: 300, bottom: 0, left: 0 }],
  ])('frames the room inside the area the interface leaves at %ix%i', (width, height, insets) => {
    const framing = frameView(width, height, insets, room);
    const free = freeArea(width, height, insets);
    const box = screenBox(framing, width, height);
    expect(framing.offset.x).toBeCloseTo(width / 2 - (free.left + free.right) / 2);
    expect(framing.offset.y).toBeCloseTo(height / 2 - (free.top + free.bottom) / 2);
    expect(box.left).toBeGreaterThanOrEqual(free.left);
    expect(box.right).toBeLessThanOrEqual(free.right);
    expect(box.top).toBeGreaterThanOrEqual(free.top);
    expect(box.bottom).toBeLessThanOrEqual(free.bottom);
    expect(box.x).toBeCloseTo((free.left + free.right) / 2, 0);
    expect(box.y).toBeCloseTo((free.top + free.bottom) / 2, 0);
  });

  it('fills the free area up to its margin on the tighter side', () => {
    const framing = frameView(1440, 900, NO_INSETS, room);
    const box = screenBox(framing, 1440, 900);
    const widthUse = (box.right - box.left) / 1440;
    const heightUse = (box.bottom - box.top) / 900;
    expect(Math.max(widthUse, heightUse)).toBeCloseTo(0.9, 2);
  });

  it('pulls back on a narrow screen and looks down more steeply', () => {
    const desktop = frameView(1440, 900, NO_INSETS, room);
    const phone = frameView(390, 844, NO_INSETS, room);
    expect(phone.position.distanceTo(phone.target)).toBeGreaterThan(desktop.position.distanceTo(desktop.target));
    expect(homeDirection(390 / 844).y).toBeGreaterThan(homeDirection(1440 / 900).y);
  });

  it('moves the room clear of a dock that grows', () => {
    const open = screenBox(frameView(390, 844, NO_INSETS, room), 390, 844);
    const docked = screenBox(frameView(390, 844, { top: 0, right: 0, bottom: 400, left: 0 }, room), 390, 844);
    expect(docked.bottom).toBeLessThanOrEqual(444);
    expect(docked.y).toBeLessThan(open.y);
  });
});
