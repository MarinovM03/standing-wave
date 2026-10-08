import * as THREE from 'three';
import { coupling, getNearestMode, getResponse, type ViewMode } from '../model/acoustics';
import { ROOM, clampMic, clampSpeaker, type Position } from '../model/room';
import { anchorWorldPoints, projectAnchors, projectPoint, type Anchors, type CalloutId, type ScreenRect } from './anchors';
import { CameraRig, FOV } from './camera';
import { addContactShadows, type ContactShadows } from './contact';
import { addStudio, type Studio } from './environment';
import { Field } from './field';
import { Mic } from './mic';
import { addRoomModel } from './model';
import { addMakerPlate, type MakerPlate } from './plate';
import { PointerInput, type DragTarget, type TargetCandidate } from './pointer';
import { createPost, type Post } from './post';
import { MSAA_SAMPLES, createRenderer, pixelRatio, type Tier } from './renderer';
import { Speaker } from './speaker';

export type StageState = {
  frequency: number;
  mic: Position;
  speaker: Position;
  view: ViewMode;
  swing: boolean;
  // The same amplitude the readout and the tone use, so the ring can't disagree with them.
  level: number;
};

export type StageEvents = {
  onMicMove(position: Position): void;
  onSpeakerMove(position: Position): void;
  onDragChange?(target: DragTarget | null): void;
  onCameraInteraction?(): void;
  onFrame?(anchors: Anchors): void;
};

export class Stage {
  private readonly container: HTMLElement;
  private readonly events: StageEvents;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly tier: Tier;
  private readonly post: Post;
  private readonly studio: Studio;
  private readonly plate: MakerPlate;
  private readonly contact: ContactShadows;
  private readonly field: Field;
  private readonly speaker: Speaker;
  private readonly mic: Mic;
  private readonly rig: CameraRig;
  private readonly pointer: PointerInput;
  private readonly timer = new THREE.Timer();
  private readonly resizeObserver: ResizeObserver;
  private readonly abort = new AbortController();
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly coarsePointer = matchMedia('(pointer: coarse)');
  private readonly hits: THREE.Intersection[] = [];
  private readonly micTip = new THREE.Vector3();
  private state: StageState;
  private world: Record<CalloutId, THREE.Vector3>;
  private frame = 0;
  private width = 1;
  private height = 1;
  private disposed = false;

  constructor(container: HTMLElement, state: StageState, events: StageEvents) {
    this.container = container;
    this.events = events;
    this.state = state;
    const { renderer, tier } = createRenderer();
    this.renderer = renderer;
    this.tier = tier;
    const canvas = renderer.domElement;
    canvas.className = 'room-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
    canvas.setAttribute('aria-label', 'Interactive acoustic room');
    canvas.setAttribute('aria-describedby', 'room-instructions room-view pressure-summary');
    canvas.setAttribute('role', 'application');
    canvas.tabIndex = 0;
    container.append(canvas);

    const model = addRoomModel(this.scene, tier);
    this.studio = addStudio(this.scene, renderer, model, tier);
    this.plate = addMakerPlate(this.scene, renderer, model, tier);
    this.field = new Field(this.scene, tier, this.coarsePointer.matches);
    this.speaker = new Speaker(this.scene, tier);
    this.mic = new Mic(this.scene, tier);
    this.contact = addContactShadows(this.scene, model, state.mic);
    this.post = createPost(renderer, this.scene, this.camera, tier, MSAA_SAMPLES);
    this.timer.connect(document);

    const roomCorners = [0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].map((z) =>
      new THREE.Vector3(x * ROOM.length, y * ROOM.height, z * ROOM.width))));
    this.rig = new CameraRig(this.camera, canvas, [...roomCorners, ...this.plate.corners], this.reducedMotion, {
      onUserCamera: () => this.events.onCameraInteraction?.(),
    });
    this.pointer = new PointerInput({
      canvas,
      camera: this.camera,
      candidates: (raycaster) => this.candidates(raycaster),
      heightOf: (target) => this.state[target].y,
      positionOf: (target) => this.state[target],
      move: (target, x, z) => this.moveTarget(target, x, z),
      tapFloor: (x, z) => {
        if (x >= 0 && x <= ROOM.length && z >= 0 && z <= ROOM.width) this.moveTarget('mic', x, z);
      },
      dragChanged: (target) => {
        if (target && (this.rig.mode === 'cinematic' || this.rig.mode === 'intro')) this.rig.takeOver();
        this.events.onDragChange?.(target);
      },
      input: () => this.rig.skipIntro(),
      cameraGesture: () => this.rig.takeOver(),
      setOrbitEnabled: (enabled) => {
        this.rig.controls.enabled = enabled;
      },
    });

    this.world = anchorWorldPoints(getNearestMode(state.frequency), state.mic, state.speaker);
    this.setState(state);
    this.speaker.tick(0, true);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    const signal = this.abort.signal;
    window.addEventListener('keydown', this.keyDown, { signal });
    window.addEventListener('keyup', this.keyUp, { signal });
    window.addEventListener('blur', () => {
      this.rig.clearKeys();
      this.pointer.cancel();
    }, { signal });
    this.coarsePointer.addEventListener('change', () => this.resize(), { signal });
    this.resize();
    this.rig.startIntro();
    void this.post.compile().catch(() => undefined).then(() => this.render());
  }

  setState(next: StageState): void {
    if (this.pointer.dragging === 'mic' && next.mic.y !== this.state.mic.y) this.pointer.cancel();
    this.state = { ...next, mic: { ...next.mic }, speaker: { ...next.speaker } };
    const mode = getNearestMode(next.frequency);
    this.field.update({
      mode,
      coupling: coupling(next.speaker, mode),
      response: getResponse(next.frequency, mode),
      view: next.view,
      speaker: next.speaker,
      mic: next.mic,
    });
    this.field.setSwing(next.swing);
    this.renderer.domElement.dataset.swing = String(next.swing);
    this.speaker.setPosition(next.speaker);
    this.mic.setPosition(next.mic);
    this.mic.setLevel(next.level);
    this.contact.setMic(next.mic);
    this.micTip.set(next.mic.x, next.mic.y, next.mic.z);
    this.world = anchorWorldPoints(mode, next.mic, next.speaker);
  }

  setCinematic(enabled: boolean): void {
    this.pointer.cancel();
    this.rig.setCinematic(enabled, this.micTip);
  }

  resetCamera(): void {
    this.pointer.cancel();
    this.rig.reset();
  }

  // Rects in the container's pixels that the home framing keeps the room and the plate clear of.
  setInsets(rects: readonly ScreenRect[]): void {
    this.rig.setObstacles(rects);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pointer.dispose();
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.resizeObserver.disconnect();
    this.rig.dispose();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      const renderable = object as THREE.Mesh;
      renderable.geometry?.dispose();
      if (renderable.material) for (const material of [renderable.material].flat()) materials.add(material);
    });
    for (const material of materials) material.dispose();
    this.contact.dispose();
    this.plate.dispose();
    this.studio.dispose();
    this.post.dispose();
    this.timer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private candidates(raycaster: THREE.Raycaster): TargetCandidate[] {
    const screen = (id: CalloutId) => {
      const point = projectPoint(this.world[id], this.camera, this.width, this.height);
      return point.visible ? point : null;
    };
    return [
      { id: 'mic', rayDistance: this.mic.hitDistance(raycaster, this.hits), screen: screen('mic') },
      { id: 'speaker', rayDistance: this.speaker.hitDistance(raycaster, this.hits), screen: screen('speaker') },
    ];
  }

  private moveTarget(target: DragTarget, x: number, z: number): void {
    if (target === 'mic') this.events.onMicMove(clampMic({ x, y: this.state.mic.y, z }));
    else this.events.onSpeakerMove(clampSpeaker({ x, y: this.state.speaker.y, z }));
  }

  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    if (this.pointer.dragging && (width !== this.width || height !== this.height)) this.pointer.cancel();
    this.width = width;
    this.height = height;
    this.post.setSize(width, height, pixelRatio(this.tier, this.coarsePointer.matches));
    this.field.setViewport(height, FOV, this.renderer.getPixelRatio());
    this.mic.setCompact(width < 800 || this.coarsePointer.matches);
    this.rig.resize(width, height);
  }

  private keyDown = (event: KeyboardEvent): void => {
    this.rig.skipIntro();
    const target = event.target as HTMLElement | null;
    if (target?.matches('input:not([type="range"]),textarea,select,[contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey
      || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) {
      this.rig.clearKeys();
      return;
    }
    if (!this.pointer.dragging && this.rig.setKey(event.key.toLowerCase(), true, event.shiftKey)) event.preventDefault();
  };

  private keyUp = (event: KeyboardEvent): void => {
    this.rig.setKey(event.key.toLowerCase(), false, event.shiftKey);
  };

  private render = (timestamp?: number): void => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.render);
    this.timer.update(timestamp);
    // The first frame runs inside the constructor, so the next rAF timestamp can be earlier than it.
    const delta = THREE.MathUtils.clamp(this.timer.getDelta(), 0, 0.05);
    if (document.hidden) return;
    this.field.tick(delta);
    this.speaker.tick(delta, this.reducedMotion);
    const footprint = this.speaker.footprint();
    this.contact.setSpeaker(footprint.x, footprint.z);
    this.rig.tick(delta, this.micTip);
    this.post.setDepthOfField(this.rig.mode === 'cinematic', this.camera.position.distanceTo(this.micTip));
    this.post.render(delta);
    this.events.onFrame?.(projectAnchors(this.world, this.plate.corners, this.camera, this.width, this.height));
  };
}
