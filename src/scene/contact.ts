import * as THREE from 'three';
import { ROOM, SPEAKER, type Position } from '../model/room';
import type { RoomModel } from './model';

const JUNCTION = 0.45;
const IN_ROOM_LIFT = 0.021;
const IN_ROOM_ORDER = 2;

export type ContactShadows = {
  setMic(position: Position): void;
  dispose(): void;
};

export function addContactShadows(scene: THREE.Scene, model: RoomModel, mic: Position): ContactShadows {
  const textures = [softRect(), radial(), fade()];
  const [plinthTexture, blobTexture, fadeTexture] = textures;

  const { centre, width, depth } = model.plinth;
  const plinth = flat(new THREE.PlaneGeometry(width * 1.3, depth * 1.4), shadowMaterial(plinthTexture));
  plinth.position.set(centre.x, model.floor + 0.004, centre.z);

  const fadeMaterial = shadowMaterial(fadeTexture);
  const alongBack = flat(new THREE.PlaneGeometry(ROOM.length, JUNCTION), fadeMaterial);
  alongBack.position.set(ROOM.length / 2, IN_ROOM_LIFT, JUNCTION / 2);
  const alongSide = flat(new THREE.PlaneGeometry(ROOM.width, JUNCTION), fadeMaterial);
  alongSide.rotation.z = Math.PI / 2;
  alongSide.position.set(JUNCTION / 2, IN_ROOM_LIFT, ROOM.width / 2);
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.length, JUNCTION), fadeMaterial);
  backWall.rotation.z = Math.PI;
  backWall.position.set(ROOM.length / 2, JUNCTION / 2, 0.003);
  const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, JUNCTION), fadeMaterial);
  sideWall.rotation.set(0, Math.PI / 2, Math.PI);
  sideWall.position.set(0.003, JUNCTION / 2, ROOM.width / 2);

  const blobMaterial = shadowMaterial(blobTexture);
  const speaker = flat(new THREE.PlaneGeometry(0.8, 0.8), blobMaterial);
  speaker.position.set(SPEAKER.x, IN_ROOM_LIFT + 0.001, SPEAKER.z);
  const micBlob = flat(new THREE.PlaneGeometry(0.62, 0.62), blobMaterial);
  micBlob.position.set(mic.x, IN_ROOM_LIFT + 0.001, mic.z);

  for (const mesh of [alongBack, alongSide, backWall, sideWall, speaker, micBlob]) mesh.renderOrder = IN_ROOM_ORDER;
  scene.add(plinth, alongBack, alongSide, backWall, sideWall, speaker, micBlob);

  return {
    setMic: (position) => micBlob.position.set(position.x, IN_ROOM_LIFT + 0.001, position.z),
    dispose: () => {
      for (const texture of textures) texture.dispose();
    },
  };
}

function shadowMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false });
}

function flat(geometry: THREE.PlaneGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  return new THREE.CanvasTexture(canvas);
}

function softRect(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (context) => {
    context.shadowColor = 'rgba(0, 0, 0, 0.8)';
    context.shadowBlur = 30;
    context.shadowOffsetX = 1000;
    context.fillRect(30 - 1000, 37, 196, 182);
  });
}

function radial(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (context) => {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  });
}

function fade(): THREE.CanvasTexture {
  return canvasTexture(4, 128, (context) => {
    const gradient = context.createLinearGradient(0, 0, 0, 128);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 4, 128);
  });
}
