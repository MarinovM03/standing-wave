import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { RoomModel } from './model';
import { surfaceMaterial } from './materials';
import { MATERIALS } from './palette';
import type { Tier } from './renderer';

const PLATE = { width: 2.6, height: 0.46, depth: 0.03, offset: 1.45 };
const TEXTURE = { width: 2048, height: 362 };
const TITLE = 'MARINOV LABS · No. 02';
const HANDLE = '@marinovm10';
const FONT_FAMILY = '"JetBrains Mono", monospace';
const WHITE = new THREE.Color(1, 1, 1);
const BLACK = new THREE.Color(0, 0, 0);

export type MakerPlate = { dispose(): void };

export function addMakerPlate(scene: THREE.Scene, renderer: THREE.WebGLRenderer, model: RoomModel, tier: Tier): MakerPlate {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE.width;
  canvas.height = TEXTURE.height;
  const context = canvas.getContext('2d')!;
  brushBrass(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const brass = { metalness: 0.9, roughness: 0.45 };
  const face = surfaceMaterial(tier, { ...brass, map: texture });
  const rim = surfaceMaterial(tier, { ...brass, color: MATERIALS.brass });
  const plate = new THREE.Mesh(new RoundedBoxGeometry(PLATE.width, PLATE.height, PLATE.depth, 2, 0.008), [rim, rim, rim, rim, face, rim]);
  const { centre, depth } = model.plinth;
  plate.position.set(centre.x + PLATE.offset, centre.y, centre.z + depth / 2 + PLATE.depth / 2);
  scene.add(plate);

  let disposed = false;
  void Promise.all([document.fonts.load(`700 100px ${FONT_FAMILY}`), document.fonts.load(`600 100px ${FONT_FAMILY}`)])
    .catch(() => undefined)
    .then(() => {
      if (disposed) return;
      engrave(context);
      texture.needsUpdate = true;
    });

  return {
    dispose: () => {
      disposed = true;
      texture.dispose();
    },
  };
}

function brushBrass(context: CanvasRenderingContext2D): void {
  const { width, height } = context.canvas;
  const base = new THREE.Color(MATERIALS.brass);
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, base.clone().lerp(WHITE, 0.16).getStyle());
  gradient.addColorStop(0.55, base.getStyle());
  gradient.addColorStop(1, base.clone().lerp(BLACK, 0.18).getStyle());
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  // A fixed Park-Miller sequence keeps the brushed streaks identical on every load.
  let seed = 48271;
  for (let y = 0; y < height; y += 2) {
    seed = (seed * 16807) % 2147483647;
    const streak = seed / 2147483647;
    context.globalAlpha = 0.03 + 0.05 * streak;
    context.fillStyle = (streak > 0.5 ? WHITE : BLACK).getStyle();
    context.fillRect(0, y, width, 1);
  }
  context.globalAlpha = 1;
}

function engrave(context: CanvasRenderingContext2D): void {
  const { width, height } = context.canvas;
  const ink = new THREE.Color(MATERIALS.engraving).getStyle();
  const edge = new THREE.Color(MATERIALS.engravingEdge).getStyle();
  context.lineWidth = 6;
  context.strokeStyle = edge;
  context.strokeRect(25, 27, width - 50, height - 50);
  context.strokeStyle = ink;
  context.strokeRect(24, 24, width - 48, height - 48);
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  for (const [text, weight, size, baseline] of [[TITLE, 700, 136, 0.5], [HANDLE, 600, 100, 0.82]] as const) {
    context.font = `${weight} ${size}px ${FONT_FAMILY}`;
    context.fillStyle = edge;
    context.fillText(text, width / 2, height * baseline + 3);
    context.fillStyle = ink;
    context.fillText(text, width / 2, height * baseline);
  }
}
