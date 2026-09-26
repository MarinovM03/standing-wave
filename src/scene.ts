import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ROOM, SPEAKER, getNearestMode, getResponse, sampleField, type Position, type ViewMode, type Mode } from './acoustics';

type SceneState = {
  frequency: number;
  listener: Position;
  view: ViewMode;
  showNodes: boolean;
  animate: boolean;
};

type ProjectedLabel = { element: HTMLDivElement; position: THREE.Vector3; kind: 'dimension' | 'node' | 'antinode' | 'listener' | 'source'; lastX?: number; lastY?: number; lastVisible?: boolean };

// The rendering shaders use the same single-mode pressure envelope as acoustics.ts.
// Animation is deliberately slow and decorative; these are not sound-speed wavefronts.
const FIELD_GLSL = `
  uniform float uAxis;
  uniform float uOrder;
  uniform float uResponse;
  uniform float uBelief;
  uniform float uTime;
  uniform vec3 uSpeaker;
  float field(vec3 p) {
    float coordinate = uAxis < 0.5 ? p.x / 6.0 : (uAxis < 1.5 ? p.z / 4.0 : p.y / 2.8);
    float pressure = 0.02 + 0.98 * abs(cos(3.14159265 * uOrder * coordinate)) * uResponse;
    float distanceOnly = 1.0 / (1.0 + distance(p, uSpeaker));
    return mix(pressure, distanceOnly, uBelief);
  }
`;

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
  private readonly listener = new THREE.Group();
  private readonly listenerHead = new THREE.Group();
  private readonly listenerStem: THREE.Mesh;
  private readonly listenerHalo: THREE.Mesh;
  private readonly listenerOuterRing: THREE.Mesh;
  private readonly listenerCap: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly listenerBodyMaterial: THREE.MeshStandardMaterial;
  private readonly listenerHit: THREE.Mesh;
  private readonly listenerGlowUniforms = { uLevel: { value: 1 }, uDrag: { value: 0 } };
  private readonly quietMicColor = new THREE.Color(0x436d70);
  private readonly hotMicColor = new THREE.Color(0xbdffe0);
  private readonly curtains: THREE.Mesh[] = [];
  private readonly speaker = new THREE.Group();
  private readonly hitTargets: THREE.Object3D[] = [];
  private readonly nodeGroup = new THREE.Group();
  private readonly labels: ProjectedLabel[] = [];
  private readonly labelLayer: HTMLDivElement;
  private readonly labelStyle: HTMLStyleElement;
  private readonly dimensionLabels: ProjectedLabel[] = [];
  private readonly nodeLabels: ProjectedLabel[] = [];
  private readonly listenerLabel: ProjectedLabel;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  private readonly dragPoint = new THREE.Vector3();
  private readonly dragOffset = new THREE.Vector3();
  private readonly projection = new THREE.Vector3();
  private readonly movementForward = new THREE.Vector3();
  private readonly movementRight = new THREE.Vector3();
  private readonly movementStep = new THREE.Vector3();
  private readonly pointerHits: THREE.Intersection[] = [];
  private readonly resizeObserver: ResizeObserver;
  private readonly abort = new AbortController();
  private readonly fieldUniforms = {
    uAxis: { value: 0 },
    uOrder: { value: 1 },
    uResponse: { value: 1 },
    uBelief: { value: 0 },
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uSpeaker: { value: new THREE.Vector3(SPEAKER.x, SPEAKER.y, SPEAKER.z) },
  };
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
  private listenerAmplitude = 1;
  private listenerHaloScale = 1;
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

    this.labelStyle = document.createElement('style');
    this.labelStyle.textContent = `
      .sw-scene-labels { position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:2; }
      .sw-scene-label { position:absolute; left:0; top:0; white-space:nowrap; font:9px/1.45 'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace; text-transform:uppercase; letter-spacing:1.5px; color:#738d94; will-change:transform; text-shadow:0 1px 8px #071015; }
      .sw-scene-label b { font-size:10px; font-weight:500; }
      .sw-scene-label--node { padding:5px 8px; color:#a6d4d8; background:#0b171ac9; border-left:1px solid #78a6ad70; }
      .sw-scene-label--antinode { padding:5px 8px; color:#f2b368; background:#171711c9; border-left:1px solid #e49a4e70; }
      .sw-scene-label--listener { padding:5px 9px; color:#b9ffdc; background:#10251fe6; border:1px solid #5dbc9238; border-radius:3px; font-size:9px; letter-spacing:1.1px; }
      .sw-scene-label--listener::before { content:''; display:inline-block; width:4px; height:4px; border-radius:50%; background:#a4f9cf; margin-right:6px; box-shadow:0 0 8px #a4f9cf; }
      .sw-scene-label--listener[data-pressure='quiet'] { color:#98b9bc; border-color:#5e899334; background:#112025ef; }
      .sw-scene-label--listener[data-pressure='quiet']::before { background:#799ba0; box-shadow:none; }
      .sw-scene-label--listener[data-pressure='hot'] { color:#d0ffe5; border-color:#8bd7b16b; box-shadow:0 0 18px #65c69e0e; }
      .sw-scene-label--listener.is-dragging { border-color:#b3f9d9; background:#1c3b31f2; box-shadow:0 0 20px #71dbac24; }
      .sw-scene-label--source { color:#8d9695; font-size:8px; letter-spacing:1.5px; }
      @media(max-width:700px) { .sw-scene-label { font-size:8px; letter-spacing:.7px; } .sw-scene-label--node,.sw-scene-label--antinode { padding:3px 5px; } .sw-scene-label--source { display:none; } }
    `;
    document.head.append(this.labelStyle);
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'sw-scene-labels';
    this.labelLayer.setAttribute('aria-hidden', 'true');
    container.append(this.labelLayer);

    this.scene.add(new THREE.AmbientLight(0x80b5bb, 0.8));
    const keyLight = new THREE.DirectionalLight(0xcde4da, 2.7);
    keyLight.position.set(4, 9, 7);
    this.scene.add(keyLight);
    const amberLight = new THREE.PointLight(0xffb35c, 12, 11, 2);
    amberLight.position.set(0.6, 1.8, 1.3);
    this.scene.add(amberLight);
    const tealLight = new THREE.PointLight(0x65c3be, 9, 10, 2);
    tealLight.position.set(6.3, 2.2, 4.5);
    this.scene.add(tealLight);
    const rimLight = new THREE.DirectionalLight(0x487d88, 1.6);
    rimLight.position.set(-4, 3, -5);
    this.scene.add(rimLight);

    this.buildArchitecture();
    this.buildField();
    this.buildSpeaker();

    this.listenerBodyMaterial = new THREE.MeshStandardMaterial({ color: 0xa1dbc3, metalness: 0.65, roughness: 0.25, emissive: 0x48a884, emissiveIntensity: 0.3 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x49605d, metalness: 0.85, roughness: 0.24 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.055, 32), darkMetal);
    base.position.y = 0.08;
    this.listener.add(base);
    this.listenerStem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.023, 1, 12), darkMetal);
    this.listener.add(this.listenerStem);
    const micBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.15, 5, 16), this.listenerBodyMaterial);
    this.listenerHead.add(micBody);
    const grille = new THREE.Mesh(new THREE.SphereGeometry(0.063, 16, 10), new THREE.MeshStandardMaterial({ color: 0x263c36, metalness: 0.5, roughness: 0.65 }));
    grille.position.y = 0.1;
    this.listenerHead.add(grille);
    this.listenerCap = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 10), new THREE.MeshBasicMaterial({ color: 0xc0ffe3 }));
    this.listenerCap.position.y = 0.15;
    this.listenerHead.add(this.listenerCap);
    const micGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.listenerGlowUniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uLevel; uniform float uDrag; varying vec2 vUv;
        void main() { vUv = uv; vec4 p = modelViewMatrix * vec4(0.0,0.0,0.0,1.0); p.xy += position.xy * (0.3 + uLevel * 0.55 + uDrag * 0.09); gl_Position = projectionMatrix * p; }`,
      fragmentShader: `uniform float uLevel; uniform float uDrag; varying vec2 vUv;
        void main() { float d = length(vUv - 0.5) * 2.0; float glow = exp(-d*d*7.5) * (1.0-smoothstep(0.7,1.0,d)); gl_FragColor=vec4(0.5,1.0,0.77,glow*(0.025+uLevel*0.43+uDrag*0.07)); }`,
    }));
    micGlow.position.y = 0.15;
    this.listenerHead.add(micGlow);
    this.listenerHit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.listenerHead.add(this.listenerHit);
    this.hitTargets.push(this.listenerHit, micBody, base, this.listenerStem);
    this.listener.add(this.listenerHead);
    const haloMaterial = new THREE.MeshBasicMaterial({ color: 0x98f5cf, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    this.listenerHalo = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.23, 64), haloMaterial);
    this.listenerHalo.rotation.x = -Math.PI / 2;
    this.listenerHalo.position.y = 0.039;
    this.listener.add(this.listenerHalo);
    this.listenerOuterRing = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.31, 64), new THREE.MeshBasicMaterial({ color: 0x98f5cf, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    this.listenerOuterRing.rotation.x = -Math.PI / 2;
    this.listenerOuterRing.position.y = 0.038;
    this.listener.add(this.listenerOuterRing);
    this.scene.add(this.listener);
    this.listenerLabel = this.addLabel('listener', 'LISTENER <span style="opacity:.5">↔ DRAG</span>', new THREE.Vector3());

    this.scene.add(this.nodeGroup);
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
    const oldMode = this.mode;
    const oldView = this.state.view;
    this.state = { ...next, listener: { ...next.listener } };
    this.mode = getNearestMode(next.frequency);
    this.fieldUniforms.uAxis.value = this.mode.axis === 'length' ? 0 : this.mode.axis === 'width' ? 1 : 2;
    this.fieldUniforms.uOrder.value = this.mode.order;
    this.fieldUniforms.uResponse.value = getResponse(next.frequency, this.mode);
    this.fieldUniforms.uBelief.value = next.view === 'belief' ? 1 : 0;
    this.listener.position.set(next.listener.x, 0, next.listener.z);
    this.listenerHead.position.y = next.listener.y;
    this.listenerStem.scale.y = Math.max(0.03, next.listener.y - 0.14);
    this.listenerStem.position.y = (next.listener.y + 0.02) / 2;
    this.listenerLabel.position.set(next.listener.x, next.listener.y + 0.38, next.listener.z);
    this.listenerAmplitude = sampleField(next.listener, next.frequency, next.view, this.mode);
    this.updateListenerFeedback();
    this.listenerLabel.element.dataset.amplitude = this.listenerAmplitude.toFixed(6);
    this.listenerLabel.element.dataset.pressure = this.listenerAmplitude < 0.13 ? 'quiet' : this.listenerAmplitude > 0.72 ? 'hot' : 'mid';
    this.listenerLabel.element.style.setProperty('--amplitude', this.listenerAmplitude.toFixed(4));
    if (oldMode.axis !== this.mode.axis || oldView !== next.view) this.alignCurtains();
    if (oldMode.axis !== this.mode.axis || oldMode.order !== this.mode.order || this.nodeLabels.length === 0) this.rebuildNodeMarkers();
    this.nodeGroup.visible = next.showNodes && next.view === 'physics';
    for (const label of this.nodeLabels) label.element.style.display = next.showNodes && next.view === 'physics' ? '' : 'none';
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

  private updateListenerFeedback(): void {
    const amplitude = this.listenerAmplitude;
    this.listenerBodyMaterial.emissiveIntensity = 0.035 + amplitude * 0.72;
    this.listenerCap.material.color.copy(this.quietMicColor).lerp(this.hotMicColor, amplitude);
    this.listenerCap.scale.setScalar(0.8 + amplitude * 1.05);
    this.listenerGlowUniforms.uLevel.value = amplitude;
    this.listenerGlowUniforms.uDrag.value = this.dragging ? 1 : 0;
    this.listenerHaloScale = 0.76 + amplitude * 0.65 + (this.dragging ? 0.14 : 0);
    this.listenerHalo.scale.setScalar(this.listenerHaloScale);
    (this.listenerHalo.material as THREE.MeshBasicMaterial).opacity = 0.16 + amplitude * 0.68 + (this.dragging ? 0.12 : 0);
    this.listenerOuterRing.scale.setScalar(0.76 + amplitude * 0.54 + (this.dragging ? 0.08 : 0));
    (this.listenerOuterRing.material as THREE.MeshBasicMaterial).opacity = 0.035 + amplitude * 0.35;
  }

  private setDragFeedback(active: boolean): void {
    this.dragging = active;
    this.listenerLabel.element.classList.toggle('is-dragging', active);
    this.updateListenerFeedback();
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
    this.labelLayer.remove();
    this.labelStyle.remove();
  }

  private buildArchitecture(): void {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(ROOM.length + 0.13, 0.16, ROOM.width + 0.13), new THREE.MeshStandardMaterial({ color: 0x101d22, metalness: 0.4, roughness: 0.58 }));
    slab.position.set(ROOM.length / 2, -0.085, ROOM.width / 2);
    this.scene.add(slab);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(ROOM.length - 0.2, 0.1, ROOM.width - 0.2), new THREE.MeshStandardMaterial({ color: 0x060c0e, roughness: 0.9 }));
    plinth.position.set(ROOM.length / 2, -0.21, ROOM.width / 2);
    this.scene.add(plinth);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x1d3037, metalness: 0.18, roughness: 0.7, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.length, ROOM.height), wallMaterial);
    back.position.set(ROOM.length / 2, ROOM.height / 2, -0.01);
    this.scene.add(back);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.height), wallMaterial);
    side.rotation.y = Math.PI / 2;
    side.position.set(-0.01, ROOM.height / 2, ROOM.width / 2);
    this.scene.add(side);

    const gridPoints: THREE.Vector3[] = [];
    for (let x = 0; x <= ROOM.length + 0.01; x += 0.5) gridPoints.push(new THREE.Vector3(x, 0.004, 0), new THREE.Vector3(x, 0.004, ROOM.width));
    for (let z = 0; z <= ROOM.width + 0.01; z += 0.5) gridPoints.push(new THREE.Vector3(0, 0.004, z), new THREE.Vector3(ROOM.length, 0.004, z));
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints), new THREE.LineBasicMaterial({ color: 0x315059, transparent: true, opacity: 0.3 }));
    this.scene.add(grid);
    const wallGrid: THREE.Vector3[] = [];
    for (let y = 0.4; y < ROOM.height; y += 0.4) wallGrid.push(new THREE.Vector3(0, y, 0), new THREE.Vector3(ROOM.length, y, 0), new THREE.Vector3(0, y, 0), new THREE.Vector3(0, y, ROOM.width));
    for (let x = 0.5; x < ROOM.length; x += 0.5) wallGrid.push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, ROOM.height, 0));
    for (let z = 0.5; z < ROOM.width; z += 0.5) wallGrid.push(new THREE.Vector3(0, 0, z), new THREE.Vector3(0, ROOM.height, z));
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wallGrid), new THREE.LineBasicMaterial({ color: 0x477079, transparent: true, opacity: 0.035 })));
    const boxEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(ROOM.length, ROOM.height, ROOM.width)), new THREE.LineBasicMaterial({ color: 0x688b91, transparent: true, opacity: 0.38 }));
    boxEdges.position.set(ROOM.length / 2, ROOM.height / 2, ROOM.width / 2);
    this.scene.add(boxEdges);
    const brightFloor = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.019, 0), new THREE.Vector3(ROOM.length, 0.019, 0), new THREE.Vector3(ROOM.length, 0.019, ROOM.width), new THREE.Vector3(0, 0.019, ROOM.width)]), new THREE.LineBasicMaterial({ color: 0x718d8d, transparent: true, opacity: 0.45 }));
    this.scene.add(brightFloor);

    this.dimension(new THREE.Vector3(0, -0.04, ROOM.width + 0.47), new THREE.Vector3(ROOM.length, -0.04, ROOM.width + 0.47), new THREE.Vector3(0, 0, 0.07));
    this.dimension(new THREE.Vector3(ROOM.length + 0.44, -0.04, 0), new THREE.Vector3(ROOM.length + 0.44, -0.04, ROOM.width), new THREE.Vector3(0.07, 0, 0));
    this.dimension(new THREE.Vector3(ROOM.length + 0.36, 0, -0.18), new THREE.Vector3(ROOM.length + 0.36, ROOM.height, -0.18), new THREE.Vector3(0.065, 0, 0));
    this.dimensionLabels.push(this.addLabel('dimension', '<b>6.0</b> m', new THREE.Vector3(ROOM.length / 2, -0.07, ROOM.width + 0.65)));
    this.dimensionLabels.push(this.addLabel('dimension', '<b>4.0</b> m', new THREE.Vector3(ROOM.length + 0.67, -0.03, ROOM.width / 2)));
    this.dimensionLabels.push(this.addLabel('dimension', '<b>2.8</b> m', new THREE.Vector3(ROOM.length + 0.64, ROOM.height / 2, -0.22)));
  }

  private buildField(): void {
    const positions: number[] = [];
    const seeds: number[] = [];
    const hash = (value: number): number => { const result = Math.sin(value) * 43758.5453; return result - Math.floor(result); };
    for (let x = 0.08; x < ROOM.length; x += 0.21) {
      for (let y = 0.12; y < ROOM.height; y += 0.23) {
        for (let z = 0.08; z < ROOM.width; z += 0.21) {
          const seed = x * 23.42 + y * 62.34 + z * 9.93;
          // Small deterministic offsets avoid the moiré of a perfect projected lattice.
          // Field strength is still evaluated at each particle's actual position.
          positions.push(x + (hash(seed) - 0.5) * 0.055, y + (hash(seed + 41) - 0.5) * 0.055, z + (hash(seed + 83) - 0.5) * 0.055);
          seeds.push(hash(seed + 127));
        }
      }
    }
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    pointGeometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    const pointMaterial = new THREE.ShaderMaterial({
      uniforms: this.fieldUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `${FIELD_GLSL}
        uniform float uPixelRatio;
        attribute float aSeed;
        varying float vAmplitude;
        varying float vSeed;
        void main() {
          vAmplitude = field(position);
          vSeed = aSeed;
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewPosition;
          gl_PointSize = clamp((0.8 + vAmplitude * 1.05) * uPixelRatio * (10.0 / -viewPosition.z), 0.5, 3.1);
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform float uBelief;
        varying float vAmplitude;
        varying float vSeed;
        void main() {
          float radius = length(gl_PointCoord - 0.5) * 2.0;
          if (radius > 1.0) discard;
          float glow = exp(-radius * radius * 3.3);
          float alpha = glow * pow(vAmplitude, 2.2) * (0.09 + 0.035 * vSeed) * (0.97 + 0.03 * cos(uTime * 2.4));
          vec3 warm = mix(vec3(0.8, 0.38, 0.10), vec3(1.0, 0.70, 0.34), vAmplitude);
          vec3 color = mix(warm, vec3(0.38, 0.73, 0.87), uBelief);
          gl_FragColor = vec4(color, alpha);
        }`,
    });
    this.scene.add(new THREE.Points(pointGeometry, pointMaterial));

    const floorMaterial = new THREE.ShaderMaterial({
      uniforms: this.fieldUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: 'varying vec3 vPosition; varying vec2 vUv; void main(){vPosition=position; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `${FIELD_GLSL}
        varying vec3 vPosition;
        varying vec2 vUv;
        void main() {
          vec3 p = vec3(vUv.x * 6.0, 0.02, (1.0 - vUv.y) * 4.0);
          float amplitude = field(p);
          float grid = max(1.0 - smoothstep(0.002, 0.006, abs(fract(vUv.x * 6.0 + 0.5) - 0.5)), 1.0 - smoothstep(0.003, 0.009, abs(fract(vUv.y * 4.0 + 0.5) - 0.5)));
          vec3 quiet = vec3(0.017, 0.040, 0.049);
          vec3 peak = mix(vec3(0.66, 0.35, 0.12), vec3(0.25, 0.65, 0.81), uBelief);
          vec3 color = mix(quiet, peak, pow(amplitude, 2.25));
          color += vec3(0.014, 0.023, 0.024) * grid;
          gl_FragColor = vec4(color, 0.94);
        }`,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.length, ROOM.width), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(ROOM.length / 2, 0.016, ROOM.width / 2);
    this.scene.add(floor);

    const curtainMaterial = new THREE.ShaderMaterial({
      uniforms: this.fieldUniforms,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vWorld; varying vec2 vUv; void main(){vWorld=(modelMatrix*vec4(position,1.0)).xyz; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `${FIELD_GLSL}
        varying vec3 vWorld;
        varying vec2 vUv;
        void main() {
          float amplitude = field(vWorld);
          float edge = 0.62 + 0.38 * sin(vUv.y * 3.14159);
          float alpha = pow(amplitude, 2.55) * edge * 0.14;
          vec3 color = mix(vec3(1.0, 0.53, 0.19), vec3(0.29, 0.69, 0.85), uBelief);
          gl_FragColor = vec4(color, alpha);
        }`,
    });
    for (let i = 0; i < 5; i++) {
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1, ROOM.height), curtainMaterial);
      this.curtains.push(curtain);
      this.scene.add(curtain);
    }
    this.alignCurtains();
  }

  private alignCurtains(): void {
    const widthMode = this.state.view === 'physics' && this.mode.axis === 'width';
    for (let i = 0; i < this.curtains.length; i++) {
      const curtain = this.curtains[i];
      const slice = (i + 0.5) / this.curtains.length;
      curtain.rotation.y = widthMode ? Math.PI / 2 : 0;
      curtain.scale.x = widthMode ? ROOM.width : ROOM.length;
      curtain.position.set(widthMode ? ROOM.length * slice : ROOM.length / 2, ROOM.height / 2, widthMode ? ROOM.width / 2 : ROOM.width * slice);
    }
  }

  private buildSpeaker(): void {
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.58, 0.28), new THREE.MeshStandardMaterial({ color: 0x172021, metalness: 0.2, roughness: 0.52 }));
    cabinet.position.y = 0.32;
    this.speaker.add(cabinet);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(cabinet.geometry), new THREE.LineBasicMaterial({ color: 0x85908b, transparent: true, opacity: 0.3 }));
    outline.position.copy(cabinet.position);
    this.speaker.add(outline);
    for (const [height, radius] of [[0.26, 0.105], [0.48, 0.045]]) {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.78, 0.035, 28), new THREE.MeshStandardMaterial({ color: 0x3c4540, metalness: 0.65, roughness: 0.43 }));
      cone.rotation.x = Math.PI / 2;
      cone.position.set(0, height, 0.15);
      this.speaker.add(cone);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.008, 6, 32), new THREE.MeshStandardMaterial({ color: 0x88816c, metalness: 0.7, roughness: 0.5 }));
      ring.position.set(0, height, 0.171);
      this.speaker.add(ring);
    }
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffc37e }));
    led.position.set(0, 0.08, 0.15);
    this.speaker.add(led);
    this.speaker.position.set(SPEAKER.x, 0.022, SPEAKER.z);
    this.speaker.rotation.y = 0.3;
    this.scene.add(this.speaker);
    this.addLabel('source', '01 / SOURCE', new THREE.Vector3(SPEAKER.x + 0.2, 0.86, SPEAKER.z));
  }

  private rebuildNodeMarkers(): void {
    for (const label of this.nodeLabels) {
      label.element.remove();
      const index = this.labels.indexOf(label);
      if (index >= 0) this.labels.splice(index, 1);
    }
    this.nodeLabels.length = 0;
    for (const child of [...this.nodeGroup.children]) {
      const line = child as THREE.LineSegments;
      line.geometry?.dispose();
      if (line.material) (Array.isArray(line.material) ? line.material : [line.material]).forEach((material) => material.dispose());
      this.nodeGroup.remove(child);
    }
    const { axis, order } = this.mode;
    for (let i = 0; i < order; i++) {
      const coordinate = (2 * i + 1) / (2 * order);
      let points: THREE.Vector3[];
      let labelPosition: THREE.Vector3;
      if (axis === 'length') {
        const x = coordinate * ROOM.length;
        points = [new THREE.Vector3(x, 0.035, 0), new THREE.Vector3(x, 0.035, ROOM.width), new THREE.Vector3(x, ROOM.height, ROOM.width), new THREE.Vector3(x, ROOM.height, 0), new THREE.Vector3(x, 0.035, 0)];
        labelPosition = new THREE.Vector3(x, ROOM.height + 0.14, ROOM.width * 0.63);
      } else if (axis === 'width') {
        const z = coordinate * ROOM.width;
        points = [new THREE.Vector3(0, 0.035, z), new THREE.Vector3(ROOM.length, 0.035, z), new THREE.Vector3(ROOM.length, ROOM.height, z), new THREE.Vector3(0, ROOM.height, z), new THREE.Vector3(0, 0.035, z)];
        labelPosition = new THREE.Vector3(ROOM.length * 0.57, ROOM.height + 0.14, z);
      } else {
        const y = coordinate * ROOM.height;
        points = [new THREE.Vector3(0, y, 0), new THREE.Vector3(ROOM.length, y, 0), new THREE.Vector3(ROOM.length, y, ROOM.width), new THREE.Vector3(0, y, ROOM.width), new THREE.Vector3(0, y, 0)];
        labelPosition = new THREE.Vector3(ROOM.length + 0.13, y, ROOM.width * 0.62);
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: 0x83aeb5, transparent: true, opacity: 0.42, dashSize: 0.07, gapSize: 0.06 }));
      line.computeLineDistances();
      this.nodeGroup.add(line);
      if (order <= 3 || i === Math.floor(order / 2)) this.nodeLabels.push(this.addLabel('node', 'NODE <span style="opacity:.5">/ QUIET</span>', labelPosition));
    }
    const antinodePosition = axis === 'height' ? new THREE.Vector3(ROOM.length * 0.15, ROOM.height + 0.16, ROOM.width * 0.8) : axis === 'width' ? new THREE.Vector3(ROOM.length * 0.68, ROOM.height + 0.15, ROOM.width - 0.1) : new THREE.Vector3(ROOM.length - 0.16, ROOM.height + 0.14, ROOM.width * 0.63);
    this.nodeLabels.push(this.addLabel('antinode', 'ANTINODE <span style="opacity:.5">/ LOUD</span>', antinodePosition));
  }

  private addLabel(kind: ProjectedLabel['kind'], text: string, position: THREE.Vector3): ProjectedLabel {
    const element = document.createElement('div');
    element.className = `sw-scene-label sw-scene-label--${kind}`;
    element.innerHTML = text;
    this.labelLayer.append(element);
    const label = { element, position, kind };
    this.labels.push(label);
    return label;
  }

  private dimension(start: THREE.Vector3, end: THREE.Vector3, tick: THREE.Vector3): void {
    const points = [start, end, start.clone().sub(tick), start.clone().add(tick), end.clone().sub(tick), end.clone().add(tick)];
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x729299, transparent: true, opacity: 0.4 })));
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
    this.fieldUniforms.uPixelRatio.value = this.renderer.getPixelRatio();
    this.listenerHit.scale.setScalar(isNarrow ? 1.65 : 1);
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

  private isPointerOnListener(): boolean {
    this.listener.updateWorldMatrix(true, true);
    this.pointerHits.length = 0;
    this.raycaster.intersectObjects(this.hitTargets, false, this.pointerHits);
    return this.pointerHits.length > 0;
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
    if (this.isPointerOnListener()) {
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
    const hovering = this.isPointerOnListener();
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
      this.hoverListener = this.isPointerOnListener();
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
      this.fieldUniforms.uTime.value += delta;
      const pulse = 1 + Math.sin(this.fieldUniforms.uTime.value * 1.8) * this.listenerAmplitude * 0.045;
      this.listenerHalo.scale.setScalar(this.listenerHaloScale * pulse);
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
    for (const label of this.labels) {
      if ((label.kind === 'node' || label.kind === 'antinode') && !this.nodeGroup.visible) continue;
      this.projection.copy(label.position).project(this.camera);
      const x = Math.round((this.projection.x * 0.5 + 0.5) * this.width * 2) / 2;
      const y = Math.round((-this.projection.y * 0.5 + 0.5) * this.height * 2) / 2;
      const visible = this.projection.z < 1 && x > 5 && x < this.width - 5 && y > 5 && y < this.height - 5 && !(this.topView && label.kind === 'dimension' && label === this.dimensionLabels[2]);
      if (visible !== label.lastVisible) {
        label.element.style.visibility = visible ? 'visible' : 'hidden';
        label.lastVisible = visible;
      }
      if (x !== label.lastX || y !== label.lastY) {
        label.element.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
        label.lastX = x;
        label.lastY = y;
      }
    }
  };
}
