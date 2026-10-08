import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ScreenRect } from './anchors';

export type Insets = { top: number; right: number; bottom: number; left: number };
export type Framing = { target: THREE.Vector3; position: THREE.Vector3; offset: { x: number; y: number } };
export type CameraMode = 'intro' | 'home' | 'free' | 'cinematic';

export const NO_INSETS: Insets = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });
export const FOV = 39;

const PORTRAIT = { azimuth: 0.36, elevation: 0.62, aspect: 0.6 };
const LANDSCAPE = { azimuth: 0.5, elevation: 0.42, aspect: 1.4 };
const MARGIN = 0.05;
const MIN_FREE = 0.3;
const INTRO = { seconds: 2, azimuth: -0.55, elevation: 0.16, distance: 1.35 };
const CINEMATIC = { radius: 7, elevation: 0.3, speed: 0.07, follow: 3, blend: 1.4 };
const MOVE_SPEED = 2.4;
const FAST_MOVE_SPEED = 5.5;
const ORBIT_SPEED = 1.1;

export function homeDirection(aspect: number): THREE.Vector3 {
  const t = THREE.MathUtils.smoothstep(aspect, PORTRAIT.aspect, LANDSCAPE.aspect);
  const azimuth = THREE.MathUtils.lerp(PORTRAIT.azimuth, LANDSCAPE.azimuth, t);
  const elevation = THREE.MathUtils.lerp(PORTRAIT.elevation, LANDSCAPE.elevation, t);
  return new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
}

// The view offset moves the optical centre into the free area, so the room never sits under the title or dock.
export function frameView(width: number, height: number, insets: Insets, points: readonly THREE.Vector3[], fov = FOV): Framing {
  const free = {
    left: insets.left,
    top: insets.top,
    width: Math.max(1, width - insets.left - insets.right),
    height: Math.max(1, height - insets.top - insets.bottom),
  };
  const centre = { x: free.left + free.width / 2, y: free.top + free.height / 2 };
  const offset = { x: width / 2 - centre.x, y: height / 2 - centre.y };
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.05, 1000);
  camera.setViewOffset(width, height, offset.x, offset.y, width, height);
  const direction = homeDirection(free.width / free.height);
  const bounds = new THREE.Box3().setFromPoints(points as THREE.Vector3[]);
  const target = bounds.getCenter(new THREE.Vector3());
  const allowed = {
    left: free.left + free.width * MARGIN,
    right: free.left + free.width * (1 - MARGIN),
    top: free.top + free.height * MARGIN,
    bottom: free.top + free.height * (1 - MARGIN),
  };
  const screen = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();

  const place = (distance: number) => {
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };
  const extent = (distance: number) => {
    place(distance);
    const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity, behind: false };
    for (const point of points) {
      screen.copy(point).project(camera);
      if (screen.z <= -1 || screen.z >= 1) box.behind = true;
      const x = (screen.x * 0.5 + 0.5) * width;
      const y = (-screen.y * 0.5 + 0.5) * height;
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
    }
    return box;
  };
  const fits = (distance: number) => {
    const box = extent(distance);
    return !box.behind && box.left >= allowed.left && box.right <= allowed.right && box.top >= allowed.top && box.bottom <= allowed.bottom;
  };

  let distance = 10;
  for (let pass = 0; pass < 4; pass++) {
    let near = 0.5;
    let far = 500;
    for (let step = 0; step < 40; step++) {
      const middle = (near + far) / 2;
      if (fits(middle)) far = middle;
      else near = middle;
    }
    distance = far;
    const box = extent(distance);
    const worldPerPixel = (2 * distance * Math.tan(THREE.MathUtils.degToRad(fov / 2))) / height;
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    target
      .addScaledVector(right, ((box.left + box.right) / 2 - centre.x) * worldPerPixel)
      .addScaledVector(up, -((box.top + box.bottom) / 2 - centre.y) * worldPerPixel);
  }
  place(distance);
  return { target, position: camera.position.clone(), offset };
}

function avoiding(rect: ScreenRect, width: number, height: number): Insets[] {
  const clampX = (x: number) => Math.min(width, Math.max(0, x));
  const clampY = (y: number) => Math.min(height, Math.max(0, y));
  return [
    { ...NO_INSETS, top: clampY(rect.bottom) },
    { ...NO_INSETS, bottom: height - clampY(rect.top) },
    { ...NO_INSETS, left: clampX(rect.right) },
    { ...NO_INSETS, right: width - clampX(rect.left) },
  ];
}

// The room goes above, below, left or right of each rect; the framing that shows it largest wins.
export function frameClear(width: number, height: number, rects: readonly ScreenRect[], points: readonly THREE.Vector3[], fov = FOV): Framing {
  const roomy = (insets: Insets) => width - insets.left - insets.right >= width * MIN_FREE && height - insets.top - insets.bottom >= height * MIN_FREE;
  let candidates: Insets[] = [NO_INSETS];
  for (const rect of rects) {
    if (rect.right - rect.left < 2 || rect.bottom - rect.top < 2 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= width || rect.top >= height) continue;
    const next = candidates.flatMap((insets) => avoiding(rect, width, height).map((side) => ({
      top: Math.max(insets.top, side.top),
      right: Math.max(insets.right, side.right),
      bottom: Math.max(insets.bottom, side.bottom),
      left: Math.max(insets.left, side.left),
    }))).filter(roomy);
    if (next.length) candidates = next;
  }
  let best: Framing | undefined;
  let bestDistance = Infinity;
  for (const insets of candidates) {
    const framing = frameView(width, height, insets, points, fov);
    const distance = framing.position.distanceTo(framing.target);
    if (distance < bestDistance) {
      best = framing;
      bestDistance = distance;
    }
  }
  return best!;
}

type RigEvents = {
  onUserCamera(): void;
};

export class CameraRig {
  readonly controls: OrbitControls;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly element: HTMLElement;
  private readonly fitPoints: readonly THREE.Vector3[];
  private readonly events: RigEvents;
  private readonly reducedMotion: boolean;
  private readonly pressed = new Set<string>();
  private readonly introFrom = new THREE.Spherical();
  private readonly introTo = new THREE.Spherical();
  private readonly offset = new THREE.Vector3();
  private readonly step = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly orbitGoal = new THREE.Vector3();
  private obstacles: readonly ScreenRect[] = [];
  private width = 1;
  private height = 1;
  private home: Framing;
  private current: CameraMode = 'home';
  private introTime = 0;
  private orbitAngle = 0;
  private orbitBlend = 1;
  private fast = false;

  constructor(camera: THREE.PerspectiveCamera, element: HTMLElement, fitPoints: readonly THREE.Vector3[], reducedMotion: boolean, events: RigEvents) {
    this.camera = camera;
    this.element = element;
    this.fitPoints = fitPoints;
    this.reducedMotion = reducedMotion;
    this.events = events;
    this.controls = new OrbitControls(camera, element);
    this.controls.enableDamping = !reducedMotion;
    this.controls.dampingFactor = 0.065;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 24;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minPolarAngle = 0.04;
    this.controls.panSpeed = 0.55;
    this.controls.rotateSpeed = 0.48;
    this.controls.zoomSpeed = 0.65;
    this.home = frameView(1, 1, NO_INSETS, fitPoints);
    this.enter('home');
  }

  get mode(): CameraMode {
    return this.current;
  }

  private enter(mode: CameraMode): void {
    this.current = mode;
    this.element.dataset.camera = mode;
  }

  resize(width: number, height: number): void {
    const previous = this.home.position.distanceTo(this.home.target);
    this.width = width;
    this.height = height;
    this.refit();
    if (this.current === 'free') {
      const scale = this.home.position.distanceTo(this.home.target) / previous;
      this.camera.position.sub(this.controls.target).multiplyScalar(scale).add(this.controls.target);
      this.controls.update();
    } else if (this.current === 'home') this.snapHome();
  }

  setObstacles(rects: readonly ScreenRect[]): void {
    this.obstacles = rects;
    this.refit();
    if (this.current === 'home') this.snapHome();
  }

  reset(): void {
    this.pressed.clear();
    this.enter('home');
    this.snapHome();
  }

  startIntro(): void {
    if (this.reducedMotion) {
      this.reset();
      return;
    }
    this.reset();
    this.offset.copy(this.home.position).sub(this.home.target);
    this.introTo.setFromVector3(this.offset);
    this.introFrom.set(this.introTo.radius * INTRO.distance, Math.max(0.05, this.introTo.phi - INTRO.elevation), this.introTo.theta + INTRO.azimuth);
    this.introTime = 0;
    this.enter('intro');
    this.applyIntro(0);
  }

  skipIntro(): void {
    if (this.current === 'intro') this.reset();
  }

  setCinematic(enabled: boolean, focus: THREE.Vector3): void {
    this.pressed.clear();
    this.clearMomentum();
    if (!enabled) {
      if (this.current === 'cinematic') this.reset();
      return;
    }
    this.enter('cinematic');
    this.offset.copy(this.camera.position).sub(focus);
    this.orbitAngle = Math.atan2(this.offset.x, this.offset.z);
    this.orbitBlend = this.reducedMotion ? 1 : 0;
    if (this.reducedMotion) {
      this.controls.target.copy(focus);
      this.applyOrbit();
    }
  }

  takeOver(): void {
    if (this.current === 'free') return;
    if (this.current === 'intro') this.reset();
    this.enter('free');
    this.events.onUserCamera();
  }

  setKey(key: string, down: boolean, shift: boolean): boolean {
    this.fast = shift;
    if (!'wasdqe'.includes(key) || key.length !== 1) return false;
    if (down) {
      this.pressed.add(key);
      this.takeOver();
    } else this.pressed.delete(key);
    return true;
  }

  clearKeys(): void {
    this.pressed.clear();
    this.fast = false;
  }

  tick(delta: number, focus: THREE.Vector3): void {
    if (this.current === 'intro') {
      this.introTime += delta;
      this.applyIntro(Math.min(1, this.introTime / INTRO.seconds));
      if (this.introTime >= INTRO.seconds) this.enter('home');
    } else if (this.current === 'cinematic') {
      this.controls.target.lerp(focus, 1 - Math.exp(-delta * CINEMATIC.follow));
      if (!this.reducedMotion) this.orbitAngle += delta * CINEMATIC.speed;
      this.orbitBlend = Math.min(1, this.orbitBlend + delta / CINEMATIC.blend);
      this.applyOrbit();
    }
    if (this.pressed.size > 0) this.applyKeys(delta);
    this.controls.update();
  }

  private refit(): void {
    this.home = frameClear(this.width, this.height, this.obstacles, this.fitPoints);
    this.camera.aspect = this.width / this.height;
    this.camera.setViewOffset(this.width, this.height, this.home.offset.x, this.home.offset.y, this.width, this.height);
    this.camera.updateProjectionMatrix();
    this.controls.maxDistance = Math.max(24, this.home.position.distanceTo(this.home.target) * 1.6);
    if (this.current === 'intro') {
      this.offset.copy(this.home.position).sub(this.home.target);
      this.introTo.setFromVector3(this.offset);
    }
  }

  private snapHome(): void {
    this.controls.target.copy(this.home.target);
    this.camera.position.copy(this.home.position);
    this.clearMomentum();
  }

  private applyIntro(progress: number): void {
    const eased = 1 - (1 - progress) ** 3;
    const lerp = THREE.MathUtils.lerp;
    this.offset.setFromSphericalCoords(
      lerp(this.introFrom.radius, this.introTo.radius, eased),
      lerp(this.introFrom.phi, this.introTo.phi, eased),
      lerp(this.introFrom.theta, this.introTo.theta, eased),
    );
    this.controls.target.copy(this.home.target);
    this.camera.position.copy(this.home.target).add(this.offset);
  }

  private applyOrbit(): void {
    const { radius, elevation } = CINEMATIC;
    this.orbitGoal.set(
      Math.sin(this.orbitAngle) * Math.cos(elevation) * radius,
      Math.sin(elevation) * radius,
      Math.cos(this.orbitAngle) * Math.cos(elevation) * radius,
    ).add(this.controls.target);
    const blend = this.orbitBlend * this.orbitBlend * (3 - 2 * this.orbitBlend);
    this.camera.position.lerp(this.orbitGoal, blend);
  }

  private applyKeys(delta: number): void {
    this.camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 0.01) this.forward.set(0, 0, -1);
    this.forward.normalize();
    this.right.crossVectors(this.forward, this.camera.up).normalize();
    this.step.set(0, 0, 0);
    if (this.pressed.has('w')) this.step.add(this.forward);
    if (this.pressed.has('s')) this.step.sub(this.forward);
    if (this.pressed.has('d')) this.step.add(this.right);
    if (this.pressed.has('a')) this.step.sub(this.right);
    this.step.multiplyScalar(delta * (this.fast ? FAST_MOVE_SPEED : MOVE_SPEED));
    this.camera.position.add(this.step);
    this.controls.target.add(this.step);
    const turn = (this.pressed.has('q') ? 1 : 0) - (this.pressed.has('e') ? 1 : 0);
    if (turn !== 0) {
      this.offset.copy(this.camera.position).sub(this.controls.target).applyAxisAngle(this.camera.up, turn * ORBIT_SPEED * delta);
      this.camera.position.copy(this.controls.target).add(this.offset);
    }
  }

  // Updating once without damping spends the queued orbit; restoring the pose discards its effect.
  private clearMomentum(): void {
    const damping = this.controls.enableDamping;
    const position = this.camera.position.clone();
    const target = this.controls.target.clone();
    this.controls.enableDamping = false;
    this.controls.update();
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    this.controls.update();
    this.controls.enableDamping = damping;
  }

  dispose(): void {
    this.controls.dispose();
  }
}
