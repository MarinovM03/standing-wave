import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ROOM } from '../model/room';
import { surfaceMaterial } from './materials';
import { MATERIALS, TOKENS } from './palette';
import type { Tier } from './renderer';

const WALL = 0.12;
export const SLAB = 0.06;
const PLINTH = { margin: 0.6, height: 0.62, bevel: 0.05 };
const EDGE_OPACITY = 0.55;

export type RoomModel = {
  floor: number;
  plinth: { centre: THREE.Vector3; width: number; height: number; depth: number };
};

export function addRoomModel(scene: THREE.Scene, tier: Tier): RoomModel {
  // Lines along the walls and floor must win the depth test against the faces they lie on.
  const surface = { metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  const clay = surfaceMaterial(tier, { ...surface, color: MATERIALS.clay, roughness: 0.92 });
  const cut = surfaceMaterial(tier, { ...surface, color: MATERIALS.cut, roughness: 0.8 });

  // BoxGeometry face groups run +x, -x, +y, -y, +z, -z.
  scene.add(
    block([ROOM.length + WALL, SLAB, ROOM.width + WALL], [(ROOM.length - WALL) / 2, -SLAB / 2, (ROOM.width - WALL) / 2], [cut, clay, clay, clay, cut, clay]),
    block([ROOM.length + WALL, ROOM.height, WALL], [(ROOM.length - WALL) / 2, ROOM.height / 2, -WALL / 2], [cut, clay, cut, clay, clay, clay]),
    block([WALL, ROOM.height, ROOM.width], [-WALL / 2, ROOM.height / 2, ROOM.width / 2], [clay, clay, cut, clay, cut, clay]),
  );

  const width = ROOM.length + WALL + 2 * PLINTH.margin;
  const depth = ROOM.width + WALL + 2 * PLINTH.margin;
  const centre = new THREE.Vector3((ROOM.length - WALL) / 2, -SLAB - PLINTH.height / 2, (ROOM.width - WALL) / 2);
  const plinth = new THREE.Mesh(
    new RoundedBoxGeometry(width, PLINTH.height, depth, 4, PLINTH.bevel),
    surfaceMaterial(tier, { color: MATERIALS.plinth, roughness: 0.55, metalness: 0 }),
  );
  plinth.position.copy(centre);

  const box = new THREE.BoxGeometry(ROOM.length, ROOM.height, ROOM.width);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(box),
    new THREE.LineBasicMaterial({ color: TOKENS.paper, transparent: true, opacity: EDGE_OPACITY, depthWrite: false }),
  );
  box.dispose();
  edges.position.set(ROOM.length / 2, ROOM.height / 2, ROOM.width / 2);
  scene.add(plinth, edges);

  return { floor: centre.y - PLINTH.height / 2, plinth: { centre, width, height: PLINTH.height, depth } };
}

function block(size: [number, number, number], position: [number, number, number], materials: THREE.Material[]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), materials);
  mesh.position.set(...position);
  return mesh;
}
