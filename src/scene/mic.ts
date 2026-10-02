import * as THREE from 'three';
import { relativeDb } from '../model/acoustics';
import type { Position } from '../model/room';
import { surfaceMaterial } from './materials';
import { MATERIALS, TOKENS } from './palette';
import { BLOOM_LAYER } from './post';
import type { Tier } from './renderer';

const BASE = { radius: 0.15, height: 0.026 };
const ROD = 0.011;
const CAPSULE = { radius: 0.026, tip: 0.021, length: 0.2, grille: 0.03 };
const RING = { radius: 0.058, tube: 0.0065, below: 0.05 };
const HIT_RADIUS = 0.22;
const COMPACT_HIT_SCALE = 1.65;
const LEVEL_FLOOR_DB = -40;

// The head's origin is the capsule tip, the point the model measures.
export class Mic {
  readonly hitTargets: THREE.Object3D[];
  private readonly root = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly rod: THREE.Mesh;
  private readonly hit: THREE.Mesh;
  private readonly ring: THREE.MeshBasicMaterial;
  private readonly swatch = new THREE.Color(TOKENS.swatch);

  constructor(scene: THREE.Scene, tier: Tier) {
    const steel = surfaceMaterial(tier, { color: MATERIALS.steel, metalness: 0.88, roughness: 0.34 });
    const dark = surfaceMaterial(tier, { color: MATERIALS.rubber, metalness: 0.4, roughness: 0.6 });

    const base = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(BASE.radius, 0),
      new THREE.Vector2(BASE.radius + 0.002, BASE.height * 0.3),
      new THREE.Vector2(BASE.radius - 0.008, BASE.height * 0.85),
      new THREE.Vector2(BASE.radius - 0.022, BASE.height),
      new THREE.Vector2(0, BASE.height),
    ], 32), steel);
    this.rod = new THREE.Mesh(new THREE.CylinderGeometry(ROD, ROD, 1, 10, 1, true), steel);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(ROD * 1.7, ROD * 1.7, 0.03, 14), dark);
    collar.position.y = -CAPSULE.length - 0.005;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(CAPSULE.tip, CAPSULE.radius, CAPSULE.length - CAPSULE.grille, 16), steel);
    body.position.y = -(CAPSULE.length + CAPSULE.grille) / 2;
    const grille = new THREE.Mesh(new THREE.CylinderGeometry(CAPSULE.tip, CAPSULE.tip, CAPSULE.grille, 16), dark);
    grille.position.y = -CAPSULE.grille / 2;

    this.ring = new THREE.MeshBasicMaterial({ color: this.swatch.clone() });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RING.radius, RING.tube, 8, 40), this.ring);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -RING.below;
    ring.name = 'mic-ring';
    ring.layers.enable(BLOOM_LAYER);

    this.hit = new THREE.Mesh(new THREE.SphereGeometry(HIT_RADIUS, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = -CAPSULE.length / 2;

    this.head.add(collar, body, grille, ring, this.hit);
    this.root.add(base, this.rod, this.head);
    scene.add(this.root);
    this.hitTargets = [this.hit, base, this.rod, body];
  }

  setPosition(position: Position): void {
    this.root.position.set(position.x, 0, position.z);
    this.head.position.y = position.y;
    const bottom = BASE.height;
    const top = Math.max(bottom + 0.01, position.y - CAPSULE.length);
    this.rod.scale.y = top - bottom;
    this.rod.position.y = (top + bottom) / 2;
  }

  setLevel(amplitude: number): void {
    const level = THREE.MathUtils.clamp((relativeDb(amplitude) - LEVEL_FLOOR_DB) / -LEVEL_FLOOR_DB, 0, 1);
    this.ring.color.copy(this.swatch).multiplyScalar(0.05 + 3.2 * level ** 4);
  }

  setCompact(compact: boolean): void {
    this.hit.scale.setScalar(compact ? COMPACT_HIT_SCALE : 1);
  }

  hitDistance(raycaster: THREE.Raycaster, hits: THREE.Intersection[]): number | null {
    hits.length = 0;
    this.root.updateWorldMatrix(true, true);
    raycaster.intersectObjects(this.hitTargets, false, hits);
    return hits[0]?.distance ?? null;
  }
}
