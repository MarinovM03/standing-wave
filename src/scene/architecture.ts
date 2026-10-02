import * as THREE from 'three';
import { ROOM, SPEAKER } from '../model/room';
import type { SceneLabels } from './labels';

export function addRoomDimensions(scene: THREE.Scene, labels: SceneLabels): void {
  addDimension(scene, new THREE.Vector3(0, -0.04, ROOM.width + 0.47), new THREE.Vector3(ROOM.length, -0.04, ROOM.width + 0.47), new THREE.Vector3(0, 0, 0.07));
  addDimension(scene, new THREE.Vector3(ROOM.length + 0.44, -0.04, 0), new THREE.Vector3(ROOM.length + 0.44, -0.04, ROOM.width), new THREE.Vector3(0.07, 0, 0));
  addDimension(scene, new THREE.Vector3(ROOM.length + 0.36, 0, -0.18), new THREE.Vector3(ROOM.length + 0.36, ROOM.height, -0.18), new THREE.Vector3(0.065, 0, 0));
  labels.add('dimension', '<b>6.0</b> m', new THREE.Vector3(ROOM.length / 2, -0.07, ROOM.width + 0.65));
  labels.add('dimension', '<b>4.0</b> m', new THREE.Vector3(ROOM.length + 0.67, -0.03, ROOM.width / 2));
  labels.add('dimension', '<b>2.8</b> m', new THREE.Vector3(ROOM.length + 0.64, ROOM.height / 2, -0.22), true);
}

export function addRoomSpeaker(scene: THREE.Scene, labels: SceneLabels): void {
  const speaker = new THREE.Group();
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.58, 0.28), new THREE.MeshStandardMaterial({ color: 0x172021, metalness: 0.2, roughness: 0.52 }));
  cabinet.position.y = 0.32;
  speaker.add(cabinet);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(cabinet.geometry), new THREE.LineBasicMaterial({ color: 0x85908b, transparent: true, opacity: 0.3 }));
  outline.position.copy(cabinet.position);
  speaker.add(outline);
  for (const [height, radius] of [[0.26, 0.105], [0.48, 0.045]]) {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.78, 0.035, 28), new THREE.MeshStandardMaterial({ color: 0x3c4540, metalness: 0.65, roughness: 0.43 }));
    cone.rotation.x = Math.PI / 2;
    cone.position.set(0, height, 0.15);
    speaker.add(cone);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.008, 6, 32), new THREE.MeshStandardMaterial({ color: 0x88816c, metalness: 0.7, roughness: 0.5 }));
    ring.position.set(0, height, 0.171);
    speaker.add(ring);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffc37e }));
  led.position.set(0, 0.08, 0.15);
  speaker.add(led);
  speaker.position.set(SPEAKER.x, 0.022, SPEAKER.z);
  speaker.rotation.y = 0.3;
  scene.add(speaker);
  labels.add('source', '01 / SOURCE', new THREE.Vector3(SPEAKER.x + 0.2, 0.86, SPEAKER.z));
}

function addDimension(scene: THREE.Scene, start: THREE.Vector3, end: THREE.Vector3, tick: THREE.Vector3): void {
  const points = [start, end, start.clone().sub(tick), start.clone().add(tick), end.clone().sub(tick), end.clone().add(tick)];
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x729299, transparent: true, opacity: 0.4 })));
}
