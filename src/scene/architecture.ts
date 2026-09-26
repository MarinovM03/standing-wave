import * as THREE from 'three';
import { ROOM, SPEAKER } from '../acoustics';
import type { SceneLabels } from './labels';

export function addRoomLighting(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0x80b5bb, 0.8));
  const keyLight = new THREE.DirectionalLight(0xcde4da, 2.7);
  keyLight.position.set(4, 9, 7);
  scene.add(keyLight);
  const amberLight = new THREE.PointLight(0xffb35c, 12, 11, 2);
  amberLight.position.set(0.6, 1.8, 1.3);
  scene.add(amberLight);
  const tealLight = new THREE.PointLight(0x65c3be, 9, 10, 2);
  tealLight.position.set(6.3, 2.2, 4.5);
  scene.add(tealLight);
  const rimLight = new THREE.DirectionalLight(0x487d88, 1.6);
  rimLight.position.set(-4, 3, -5);
  scene.add(rimLight);
}

export function addRoomArchitecture(scene: THREE.Scene, labels: SceneLabels): void {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(ROOM.length + 0.13, 0.16, ROOM.width + 0.13), new THREE.MeshStandardMaterial({ color: 0x101d22, metalness: 0.4, roughness: 0.58 }));
  slab.position.set(ROOM.length / 2, -0.085, ROOM.width / 2);
  scene.add(slab);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(ROOM.length - 0.2, 0.1, ROOM.width - 0.2), new THREE.MeshStandardMaterial({ color: 0x060c0e, roughness: 0.9 }));
  plinth.position.set(ROOM.length / 2, -0.21, ROOM.width / 2);
  scene.add(plinth);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x1d3037, metalness: 0.18, roughness: 0.7, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.length, ROOM.height), wallMaterial);
  back.position.set(ROOM.length / 2, ROOM.height / 2, -0.01);
  scene.add(back);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.height), wallMaterial);
  side.rotation.y = Math.PI / 2;
  side.position.set(-0.01, ROOM.height / 2, ROOM.width / 2);
  scene.add(side);

  const gridPoints: THREE.Vector3[] = [];
  for (let x = 0; x <= ROOM.length + 0.01; x += 0.5) gridPoints.push(new THREE.Vector3(x, 0.004, 0), new THREE.Vector3(x, 0.004, ROOM.width));
  for (let z = 0; z <= ROOM.width + 0.01; z += 0.5) gridPoints.push(new THREE.Vector3(0, 0.004, z), new THREE.Vector3(ROOM.length, 0.004, z));
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints), new THREE.LineBasicMaterial({ color: 0x315059, transparent: true, opacity: 0.3 }));
  scene.add(grid);
  const wallGrid: THREE.Vector3[] = [];
  for (let y = 0.4; y < ROOM.height; y += 0.4) wallGrid.push(new THREE.Vector3(0, y, 0), new THREE.Vector3(ROOM.length, y, 0), new THREE.Vector3(0, y, 0), new THREE.Vector3(0, y, ROOM.width));
  for (let x = 0.5; x < ROOM.length; x += 0.5) wallGrid.push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, ROOM.height, 0));
  for (let z = 0.5; z < ROOM.width; z += 0.5) wallGrid.push(new THREE.Vector3(0, 0, z), new THREE.Vector3(0, ROOM.height, z));
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wallGrid), new THREE.LineBasicMaterial({ color: 0x477079, transparent: true, opacity: 0.035 })));
  const boxEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(ROOM.length, ROOM.height, ROOM.width)), new THREE.LineBasicMaterial({ color: 0x688b91, transparent: true, opacity: 0.38 }));
  boxEdges.position.set(ROOM.length / 2, ROOM.height / 2, ROOM.width / 2);
  scene.add(boxEdges);
  const brightFloor = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.019, 0), new THREE.Vector3(ROOM.length, 0.019, 0), new THREE.Vector3(ROOM.length, 0.019, ROOM.width), new THREE.Vector3(0, 0.019, ROOM.width)]), new THREE.LineBasicMaterial({ color: 0x718d8d, transparent: true, opacity: 0.45 }));
  scene.add(brightFloor);

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
