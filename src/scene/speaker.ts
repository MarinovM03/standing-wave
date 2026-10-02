import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ROOM, SPEAKER, type Position } from '../model/room';
import { surfaceMaterial } from './materials';
import { MATERIALS, TOKENS } from './palette';
import { BLOOM_LAYER } from './post';
import type { Tier } from './renderer';

// Every point of the cabinet stays within 0.23 m of the driver, inside the model's 0.25 m wall margin.
const CABINET = { width: 0.3, height: 0.7, depth: 0.17, bevel: 0.02 };
const WOOFER = { radius: 0.1, depth: 0.03, cap: 0.034 };
const TWEETER = { radius: 0.022, rise: 0.22 };
const LED = { radius: 0.009, x: 0.1, y: -0.27, intensity: 3 };
const FACE_FRONT_WITHIN = { near: 0.3, far: 1.2 };
const TURN_TIME = 0.12;

// The group's origin is the woofer's centre, which is the model's source point.
export class Speaker {
  readonly driver = new THREE.Group();
  readonly hitTargets: THREE.Object3D[];
  private readonly root = new THREE.Group();
  private yaw = 0;
  private goalYaw = 0;

  constructor(scene: THREE.Scene, tier: Tier) {
    const cabinetMaterial = surfaceMaterial(tier, { color: MATERIALS.cabinet, metalness: 0, roughness: 0.58 });
    const steel = surfaceMaterial(tier, { color: MATERIALS.steel, metalness: 0.85, roughness: 0.36 });
    const rubber = surfaceMaterial(tier, { color: MATERIALS.rubber, metalness: 0, roughness: 0.9, side: THREE.DoubleSide });
    const dome = surfaceMaterial(tier, { color: MATERIALS.baffle, metalness: 0.2, roughness: 0.45 });

    const cabinet = new THREE.Mesh(new RoundedBoxGeometry(CABINET.width, CABINET.height, CABINET.depth, 2, CABINET.bevel), cabinetMaterial);
    cabinet.position.set(0, CABINET.height / 2 - SPEAKER.y, -CABINET.depth / 2);

    const woofer = this.driver;
    woofer.name = 'speaker-driver';
    const trim = new THREE.Mesh(new THREE.TorusGeometry(WOOFER.radius + 0.006, 0.005, 6, 40), steel);
    const surround = new THREE.Mesh(new THREE.TorusGeometry(WOOFER.radius - 0.005, 0.0075, 6, 40), rubber);
    surround.position.z = -0.003;
    const cone = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(WOOFER.radius - 0.012, 0),
      new THREE.Vector2(WOOFER.cap, -WOOFER.depth),
    ], 32), rubber);
    cone.rotation.x = Math.PI / 2;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(WOOFER.cap, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2), dome);
    cap.rotation.x = Math.PI / 2;
    cap.scale.set(1, 0.45, 1);
    cap.position.z = -WOOFER.depth;
    woofer.add(trim, surround, cone, cap);

    const tweeter = new THREE.Group();
    const tweeterTrim = new THREE.Mesh(new THREE.TorusGeometry(TWEETER.radius + 0.012, 0.004, 6, 28), steel);
    const tweeterDome = new THREE.Mesh(new THREE.SphereGeometry(TWEETER.radius, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2), dome);
    tweeterDome.rotation.x = Math.PI / 2;
    tweeterDome.scale.set(1, 0.6, 1);
    tweeter.add(tweeterTrim, tweeterDome);
    tweeter.position.y = TWEETER.rise;

    const led = new THREE.Mesh(
      new THREE.CircleGeometry(LED.radius, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(TOKENS.swatch).multiplyScalar(LED.intensity) }),
    );
    led.position.set(LED.x, LED.y, 0.0015);
    led.name = 'speaker-led';
    led.layers.enable(BLOOM_LAYER);

    this.root.add(cabinet, woofer, tweeter, led);
    scene.add(this.root);
    this.hitTargets = [cabinet];
  }

  setPosition(position: Position): void {
    this.root.position.set(position.x, position.y, position.z);
    this.goalYaw = facingYaw(position);
  }

  tick(delta: number, instant: boolean): void {
    const turn = Math.atan2(Math.sin(this.goalYaw - this.yaw), Math.cos(this.goalYaw - this.yaw));
    this.yaw += instant ? turn : turn * (1 - Math.exp(-delta / TURN_TIME));
    this.root.rotation.y = this.yaw;
  }

  footprint(): { x: number; z: number } {
    const back = CABINET.depth / 2;
    return { x: this.root.position.x - Math.sin(this.yaw) * back, z: this.root.position.z - Math.cos(this.yaw) * back };
  }

  hitDistance(raycaster: THREE.Raycaster, hits: THREE.Intersection[]): number | null {
    hits.length = 0;
    this.root.updateWorldMatrix(true, true);
    raycaster.intersectObjects(this.hitTargets, false, hits);
    return hits[0]?.distance ?? null;
  }
}

// Standing in the middle there's no direction to the middle, so it turns to the front instead.
export function facingYaw(position: Position): number {
  const dx = ROOM.length / 2 - position.x;
  const dz = ROOM.width / 2 - position.z;
  const toCentre = Math.atan2(dx, dz);
  const weight = THREE.MathUtils.smoothstep(Math.hypot(dx, dz), FACE_FRONT_WITHIN.near, FACE_FRONT_WITHIN.far);
  return Math.atan2(Math.sin(toCentre) * weight, Math.cos(toCentre) * weight + (1 - weight));
}
