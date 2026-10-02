import * as THREE from 'three';

export type DragTarget = 'mic' | 'speaker';
export type TargetCandidate = {
  id: DragTarget;
  rayDistance: number | null;
  screen: { x: number; y: number } | null;
};

export const TOUCH_RADIUS = 24;
const SLOP = { touch: 8, mouse: 5 };

/** A direct hit on the nearest object wins. A finger also takes the closest anchor within its touch radius. */
export function chooseTarget(candidates: readonly TargetCandidate[], pointer: { x: number; y: number }, touch: boolean): DragTarget | null {
  let chosen: DragTarget | null = null;
  let nearest = Infinity;
  for (const candidate of candidates) {
    if (candidate.rayDistance !== null && candidate.rayDistance < nearest) {
      chosen = candidate.id;
      nearest = candidate.rayDistance;
    }
  }
  if (chosen || !touch) return chosen;
  nearest = TOUCH_RADIUS;
  for (const candidate of candidates) {
    if (!candidate.screen) continue;
    const distance = Math.hypot(candidate.screen.x - pointer.x, candidate.screen.y - pointer.y);
    if (distance <= nearest) {
      chosen = candidate.id;
      nearest = distance;
    }
  }
  return chosen;
}

export type PointerHost = {
  readonly canvas: HTMLCanvasElement;
  readonly camera: THREE.Camera;
  candidates(raycaster: THREE.Raycaster): TargetCandidate[];
  heightOf(target: DragTarget): number;
  positionOf(target: DragTarget): { x: number; z: number };
  move(target: DragTarget, x: number, z: number): void;
  tapFloor(x: number, z: number): void;
  dragChanged(target: DragTarget | null): void;
  input(): void;
  cameraGesture(): void;
  setOrbitEnabled(enabled: boolean): void;
};

type Press = { id: number; x: number; y: number; moved: boolean; slop: number };

/**
 * Sits in front of OrbitControls on the canvas. A press on the mic or speaker becomes a drag that
 * no other finger can take over; a press elsewhere only reaches the camera once it moves past the slop,
 * so a tap never moves the camera and instead places the mic on the floor.
 */
export class PointerInput {
  private readonly host: PointerHost;
  private readonly abort = new AbortController();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  private readonly hit = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private press: Press | null = null;
  private target: DragTarget | null = null;
  private dragPointer: number | null = null;
  private hovering = false;

  constructor(host: PointerHost) {
    this.host = host;
    const { canvas } = host;
    const options = { capture: true, signal: this.abort.signal };
    canvas.addEventListener('pointerdown', this.down, options);
    canvas.addEventListener('pointermove', this.move, options);
    canvas.addEventListener('pointerup', this.up, options);
    canvas.addEventListener('pointercancel', this.cancelEvent, options);
    canvas.addEventListener('lostpointercapture', this.cancelEvent, { signal: this.abort.signal });
    canvas.addEventListener('wheel', this.wheel, { capture: true, passive: true, signal: this.abort.signal });
  }

  get dragging(): DragTarget | null {
    return this.target;
  }

  cancel(): void {
    const pointer = this.dragPointer;
    this.dragPointer = null;
    if (this.target) {
      this.target = null;
      this.host.dragChanged(null);
    }
    this.press = null;
    this.hovering = false;
    this.host.setOrbitEnabled(true);
    this.host.canvas.style.cursor = 'default';
    if (pointer !== null && this.host.canvas.hasPointerCapture(pointer)) this.host.canvas.releasePointerCapture(pointer);
  }

  dispose(): void {
    this.cancel();
    this.abort.abort();
  }

  private swallow(event: Event): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private aim(event: PointerEvent): void {
    const rect = this.host.canvas.getBoundingClientRect();
    this.ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.host.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc, this.host.camera);
  }

  private pick(event: PointerEvent): DragTarget | null {
    this.aim(event);
    const rect = this.host.canvas.getBoundingClientRect();
    return chooseTarget(this.host.candidates(this.raycaster), { x: event.clientX - rect.left, y: event.clientY - rect.top }, event.pointerType === 'touch');
  }

  private down = (event: PointerEvent): void => {
    if (this.target) {
      this.swallow(event);
      return;
    }
    this.host.input();
    if (event.button !== 0 || !event.isPrimary || event.ctrlKey || event.metaKey || event.shiftKey) {
      this.press = null;
      this.host.cameraGesture();
      return;
    }
    this.press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, slop: event.pointerType === 'touch' ? SLOP.touch : SLOP.mouse };
    const target = this.pick(event);
    if (!target) return;
    this.target = target;
    this.dragPointer = event.pointerId;
    this.plane.constant = -this.host.heightOf(target);
    const position = this.host.positionOf(target);
    if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) this.offset.set(position.x - this.hit.x, 0, position.z - this.hit.z);
    else this.offset.set(0, 0, 0);
    this.host.setOrbitEnabled(false);
    this.host.dragChanged(target);
    this.host.canvas.setPointerCapture(event.pointerId);
    this.host.canvas.style.cursor = 'grabbing';
    this.swallow(event);
  };

  private move = (event: PointerEvent): void => {
    if (this.target && event.pointerId !== this.dragPointer) {
      this.swallow(event);
      return;
    }
    const press = this.press?.id === event.pointerId ? this.press : null;
    if (press && !press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= press.slop) {
      press.moved = true;
      if (!this.target) this.host.cameraGesture();
    }
    if (this.target) {
      if (event.pointerType !== 'touch' || press?.moved) {
        this.aim(event);
        if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) this.host.move(this.target, this.hit.x + this.offset.x, this.hit.z + this.offset.z);
      }
      this.swallow(event);
      return;
    }
    if (press && !press.moved) {
      this.swallow(event);
      return;
    }
    if (event.buttons === 0) this.hover(event);
  };

  private up = (event: PointerEvent): void => {
    if (this.target) {
      if (event.pointerId !== this.dragPointer) {
        this.swallow(event);
        return;
      }
      this.cancel();
      this.hover(event);
      this.swallow(event);
      return;
    }
    const press = this.press?.id === event.pointerId ? this.press : null;
    this.press = null;
    if (!press || press.moved || event.button !== 0) return;
    this.aim(event);
    this.plane.constant = 0;
    if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) this.host.tapFloor(this.hit.x, this.hit.z);
  };

  private cancelEvent = (event: PointerEvent): void => {
    if (this.dragPointer !== null && event.pointerId !== this.dragPointer) return;
    this.cancel();
  };

  private wheel = (): void => {
    this.host.input();
    this.host.cameraGesture();
  };

  private hover(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    const hovering = this.pick(event) !== null;
    if (hovering === this.hovering) return;
    this.hovering = hovering;
    this.host.canvas.style.cursor = hovering ? 'grab' : 'default';
  }
}
