import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ROOM, getNearestMode, sampleField, type Position, type ViewMode, type Mode } from './acoustics';
import { addRoomArchitecture, addRoomLighting, addRoomSpeaker } from './scene/architecture';
import { PressureField } from './scene/field';
import { SceneLabels } from './scene/labels';
import { ListenerMarker } from './scene/listener';

type SceneState = {
  frequency: number;
  listener: Position;
  view: ViewMode;
  showNodes: boolean;
  animate: boolean;
};

export class RoomScene {
  onCameraInteraction?: () => void;
  onListenerDragChange?: (active: boolean) => void;

  private readonly container: HTMLElement;
  private readonly onListenerMove: (position: Position) => void;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(39, 1, 0.05, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();
  private readonly listener: ListenerMarker;
  private readonly labels: SceneLabels;
  private readonly field: PressureField;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  private readonly dragPoint = new THREE.Vector3();
  private readonly dragOffset = new THREE.Vector3();
  private readonly movementForward = new THREE.Vector3();
  private readonly movementRight = new THREE.Vector3();
  private readonly movementStep = new THREE.Vector3();
  private readonly resizeObserver: ResizeObserver;
  private readonly abort = new AbortController();
  private readonly pressed = new Set<string>();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private state: SceneState = { frequency: 343 / 12, listener: { x: 4.8, y: 1.2, z: 2 }, view: 'physics', showNodes: true, animate: true };
  private mode: Mode = getNearestMode(this.state.frequency);
  private frame = 0;
  private width = 1;
  private height = 1;
  private dragging = false;
  private dragPointerId: number | null = null;
  private pointerDown: { id: number; x: number; y: number; moved: boolean } | null = null;
  private cinematic = false;
  private topView = false;
  private cinematicAngle = 0;
  private cinematicRadius = 10;
  private hoverListener = false;
  private disposed = false;
  private shiftPressed = false;
  private narrowViewport = false;

  constructor(container: HTMLElement, onListenerMove: (position: Position) => void) {
    this.container = container;
    this.onListenerMove = onListenerMove;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x070e11, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.className = 'room-canvas';
    this.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none;';
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D acoustic room. Drag the mint listener to measure pressure, or drag the room to orbit.');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.tabIndex = 0;
    container.append(this.renderer.domElement);

    this.labels = new SceneLabels(container);

    addRoomLighting(this.scene);

    addRoomArchitecture(this.scene, this.labels);
    this.field = new PressureField(this.scene, this.labels, this.mode, this.state.view);
    addRoomSpeaker(this.scene, this.labels);

    this.listener = new ListenerMarker(this.scene, this.labels);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.reducedMotion;
    this.controls.dampingFactor = 0.065;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 24;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minPolarAngle = 0.04;
    this.controls.enablePan = true;
    this.controls.panSpeed = 0.55;
    this.controls.rotateSpeed = 0.48;
    this.controls.zoomSpeed = 0.65;
    this.controls.addEventListener('start', this.handleCameraStart);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown, { capture: true, signal: this.abort.signal });
    canvas.addEventListener('pointermove', this.handlePointerMove, { capture: true, signal: this.abort.signal });
    canvas.addEventListener('pointerup', this.handlePointerUp, { capture: true, signal: this.abort.signal });
    canvas.addEventListener('pointercancel', this.handlePointerCancel, { capture: true, signal: this.abort.signal });
    canvas.addEventListener('lostpointercapture', this.handlePointerCancel, { signal: this.abort.signal });
    window.addEventListener('keydown', this.handleKeyDown, { signal: this.abort.signal });
    window.addEventListener('keyup', this.handleKeyUp, { signal: this.abort.signal });
    window.addEventListener('blur', () => { this.pressed.clear(); this.shiftPressed = false; this.handlePointerCancel(); }, { signal: this.abort.signal });
    this.resize();
    this.resetCamera();
    this.setState(this.state);
    this.render();
  }

  setState(next: SceneState): void {
    if (this.dragging && next.listener.y !== this.state.listener.y) this.handlePointerCancel();
    this.state = { ...next, listener: { ...next.listener } };
    this.mode = getNearestMode(next.frequency);
    this.field.update(next.frequency, this.mode, next.view, next.showNodes);
    this.listener.update(next.listener, sampleField(next.listener, next.frequency, next.view, this.mode));
  }

  setCinematic(enabled: boolean): void {
    this.handlePointerCancel();
    this.clearCameraMomentum();
    this.cinematic = enabled;
    if (enabled) {
      this.topView = false;
      const x = this.camera.position.x - this.controls.target.x;
      const z = this.camera.position.z - this.controls.target.z;
      this.cinematicAngle = Math.atan2(x, z);
      this.cinematicRadius = Math.hypot(x, z);
    }
  }

  setTopView(enabled: boolean): void {
    this.handlePointerCancel();
    this.clearCameraMomentum();
    this.topView = enabled;
    this.cinematic = false;
    if (enabled) {
      this.controls.target.set(ROOM.length / 2, 0.5, ROOM.width / 2);
      const distance = this.width < 800 ? Math.max(8.7, 10.8 / this.camera.aspect) : 11.4;
      this.camera.position.set(ROOM.length / 2 + 0.001, distance, ROOM.width / 2 + 0.001);
      this.controls.update();
    } else this.resetCamera();
  }

  resetCamera(): void {
    this.clearCameraMomentum();
    this.handlePointerCancel();
    this.pressed.clear();
    this.topView = false;
    this.cinematic = false;
    const target = new THREE.Vector3(ROOM.length / 2, 1.12, ROOM.width / 2);
    const distance = this.width < 800 ? Math.max(9.8, 11.5 / (this.width / this.height)) : 12.1;
    this.controls.maxDistance = Math.max(24, distance * 1.6);
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(new THREE.Vector3(1.05, 0.77, 1.22).normalize().multiplyScalar(distance));
    this.controls.update();
  }

  private clearCameraMomentum(): void {
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

  private setDragFeedback(active: boolean): void {
    this.dragging = active;
    this.listener.setDragging(active);
    this.onListenerDragChange?.(active);
  }

  dispose(): void {
    if (this.disposed) return;
    this.handlePointerCancel();
    this.pressed.clear();
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('start', this.handleCameraStart);
    this.controls.dispose();
    const disposedMaterials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      const renderable = object as THREE.Mesh;
      renderable.geometry?.dispose();
      const materials = renderable.material ? (Array.isArray(renderable.material) ? renderable.material : [renderable.material]) : [];
      for (const material of materials) if (!disposedMaterials.has(material)) { material.dispose(); disposedMaterials.add(material); }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.dispose();
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    const wasInitialized = this.width > 1;
    if (this.dragging && (rect.width !== this.width || rect.height !== this.height)) this.handlePointerCancel();
    const previousAspect = this.width / this.height;
    const isNarrow = rect.width < 800;
    const changedBreakpoint = wasInitialized && isNarrow !== this.narrowViewport;
    this.narrowViewport = isNarrow;
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isNarrow ? 1.5 : 1.75));
    this.field.setPixelRatio(this.renderer.getPixelRatio());
    this.listener.setCompactViewport(isNarrow);
    this.camera.aspect = this.width / this.height;
    this.camera.setViewOffset(this.width, this.height, this.width > 900 ? -this.width * 0.035 : 0, this.height * -0.015, this.width, this.height);
    this.camera.updateProjectionMatrix();
    if (changedBreakpoint) {
      this.resetCamera();
      this.onCameraInteraction?.();
    } else if (wasInitialized && isNarrow) {
      // Keep a mobile room usable when the interface expands into a full-screen view,
      // preserving the user's orbit angle and pan instead of resetting the camera.
      const previousFit = Math.max(9.8, 11.5 / previousAspect);
      const nextFit = Math.max(9.8, 11.5 / this.camera.aspect);
      this.camera.position.sub(this.controls.target).multiplyScalar(nextFit / previousFit).add(this.controls.target);
      this.cinematicRadius *= nextFit / previousFit;
      this.controls.maxDistance = Math.max(24, nextFit * 1.6);
    }
  }

  private setRay(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private moveListener(point: THREE.Vector3): void {
    this.onListenerMove({ x: THREE.MathUtils.clamp(point.x, 0.08, ROOM.length - 0.08), y: this.state.listener.y, z: THREE.MathUtils.clamp(point.z, 0.08, ROOM.width - 0.08) });
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (this.dragging) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.button !== 0) return;
    if (!event.isPrimary || event.ctrlKey || event.metaKey || event.shiftKey) {
      this.pointerDown = null;
      return;
    }
    this.pointerDown = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    this.setRay(event);
    if (this.listener.hitTest(this.raycaster)) {
      this.clearCameraMomentum();
      this.pressed.clear();
      this.dragPointerId = event.pointerId;
      this.setDragFeedback(true);
      this.controls.enabled = false;
      this.cinematic = false;
      this.dragPlane.constant = -this.state.listener.y;
      if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint)) {
        this.dragOffset.set(this.state.listener.x - this.dragPoint.x, 0, this.state.listener.z - this.dragPoint.z);
      } else this.dragOffset.set(0, 0, 0);
      this.onCameraInteraction?.();
      this.renderer.domElement.setPointerCapture(event.pointerId);
      this.renderer.domElement.style.cursor = 'grabbing';
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.dragging && event.pointerId !== this.dragPointerId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.pointerDown?.id === event.pointerId && Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y) >= 5) {
      this.pointerDown.moved = true;
    }
    this.setRay(event);
    if (this.dragging) {
      if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint)) this.moveListener(this.dragPoint.add(this.dragOffset));
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const hovering = this.listener.hitTest(this.raycaster);
    if (hovering !== this.hoverListener) {
      this.hoverListener = hovering;
      this.renderer.domElement.style.cursor = hovering ? 'grab' : 'default';
    }
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (this.dragging) {
      if (event.pointerId !== this.dragPointerId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      this.dragPointerId = null;
      this.setDragFeedback(false);
      this.controls.enabled = true;
      if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
      this.setRay(event);
      this.hoverListener = this.listener.hitTest(this.raycaster);
      this.renderer.domElement.style.cursor = this.hoverListener ? 'grab' : 'default';
      this.pointerDown = null;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.pointerDown?.id !== event.pointerId) return;
    if (!this.pointerDown.moved && event.button === 0 && Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y) < 5) {
      this.setRay(event);
      if (this.raycaster.ray.intersectPlane(this.floorPlane, this.dragPoint) && this.dragPoint.x >= 0 && this.dragPoint.x <= ROOM.length && this.dragPoint.z >= 0 && this.dragPoint.z <= ROOM.width) this.moveListener(this.dragPoint);
    }
    this.pointerDown = null;
  };

  private handlePointerCancel = (event?: PointerEvent): void => {
    if (event && this.dragPointerId !== null && event.pointerId !== this.dragPointerId) return;
    const pointerId = this.dragPointerId;
    this.dragPointerId = null;
    if (this.dragging) this.setDragFeedback(false);
    this.pointerDown = null;
    this.controls.enabled = true;
    this.hoverListener = false;
    this.renderer.domElement.style.cursor = 'default';
    if (pointerId !== null && this.renderer.domElement.hasPointerCapture(pointerId)) this.renderer.domElement.releasePointerCapture(pointerId);
  };

  private handleCameraStart = (): void => {
    this.cinematic = false;
    this.topView = false;
    this.onCameraInteraction?.();
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    this.shiftPressed = event.shiftKey;
    if (target?.matches('input:not([type="range"]),textarea,select,[contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) {
      this.pressed.clear();
      return;
    }
    if ('wasd'.includes(event.key.toLowerCase()) && event.key.length === 1) {
      this.pressed.add(event.key.toLowerCase());
      this.cinematic = false;
      this.onCameraInteraction?.();
      event.preventDefault();
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => { this.pressed.delete(event.key.toLowerCase()); this.shiftPressed = event.shiftKey; };

  private render = (): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.render);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (document.hidden) return;
    // The app defaults motion off for reduced-motion preferences; an explicit play
    // or cinematic command remains a working opt-in rather than a dead control.
    if (this.state.animate) {
      const time = this.field.advance(delta);
      this.listener.animate(time);
    }
    if (this.cinematic && !this.dragging) {
      this.cinematicAngle += delta * (this.reducedMotion ? 0.035 : 0.045);
      this.camera.position.x = this.controls.target.x + Math.sin(this.cinematicAngle) * this.cinematicRadius;
      this.camera.position.z = this.controls.target.z + Math.cos(this.cinematicAngle) * this.cinematicRadius;
    }
    if (this.pressed.size > 0 && !this.dragging) {
      const forward = this.movementForward;
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 0.01) forward.set(0, 0, -1);
      forward.normalize();
      const right = this.movementRight.crossVectors(forward, this.camera.up).normalize();
      const step = this.movementStep.set(0, 0, 0);
      if (this.pressed.has('w')) step.add(forward);
      if (this.pressed.has('s')) step.sub(forward);
      if (this.pressed.has('d')) step.add(right);
      if (this.pressed.has('a')) step.sub(right);
      step.multiplyScalar(delta * (this.shiftPressed ? 5.5 : 2.4));
      this.camera.position.add(step);
      this.controls.target.add(step);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.project(this.camera, this.width, this.height, this.topView, this.state.showNodes && this.state.view === 'physics');
  };
}
