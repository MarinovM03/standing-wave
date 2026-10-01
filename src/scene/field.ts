import * as THREE from 'three';
import { ROOM, SPEAKER } from '../model/room';
import { getResponse, type Mode, type ViewMode } from '../model/acoustics';
import { type SceneLabels, type ProjectedLabel } from './labels';

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

const hash = (value: number): number => { const result = Math.sin(value) * 43758.5453; return result - Math.floor(result); };

export class PressureField {
  private readonly fieldUniforms = {
    uAxis: { value: 0 },
    uOrder: { value: 1 },
    uResponse: { value: 1 },
    uBelief: { value: 0 },
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uSpeaker: { value: new THREE.Vector3(SPEAKER.x, SPEAKER.y, SPEAKER.z) },
  };
  private readonly curtains: THREE.Mesh[] = [];
  private readonly nodeGroup = new THREE.Group();
  private readonly nodeLabels: ProjectedLabel[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly labels: SceneLabels,
    private mode: Mode,
    private view: ViewMode,
  ) {
    this.buildField();
    this.scene.add(this.nodeGroup);
  }

  update(frequency: number, mode: Mode, view: ViewMode, showNodes: boolean): void {
    const oldMode = this.mode;
    const oldView = this.view;
    this.mode = mode;
    this.view = view;
    this.fieldUniforms.uAxis.value = mode.axis === 'length' ? 0 : mode.axis === 'width' ? 1 : 2;
    this.fieldUniforms.uOrder.value = mode.order;
    this.fieldUniforms.uResponse.value = getResponse(frequency, mode);
    this.fieldUniforms.uBelief.value = view === 'belief' ? 1 : 0;
    if (oldMode.axis !== mode.axis || oldView !== view) this.alignCurtains();
    if (oldMode.axis !== mode.axis || oldMode.order !== mode.order || this.nodeLabels.length === 0) this.rebuildNodeMarkers();
    this.nodeGroup.visible = showNodes && view === 'physics';
    for (const label of this.nodeLabels) label.element.style.display = this.nodeGroup.visible ? '' : 'none';
  }

  advance(delta: number): number {
    this.fieldUniforms.uTime.value += delta;
    return this.fieldUniforms.uTime.value;
  }

  setPixelRatio(pixelRatio: number): void {
    this.fieldUniforms.uPixelRatio.value = pixelRatio;
  }

  private buildField(): void {
    const positions: number[] = [];
    const seeds: number[] = [];
    for (let x = 0.08; x < ROOM.length; x += 0.21) {
      for (let y = 0.12; y < ROOM.height; y += 0.23) {
        for (let z = 0.08; z < ROOM.width; z += 0.21) {
          const seed = x * 23.42 + y * 62.34 + z * 9.93;
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
    const widthMode = this.view === 'physics' && this.mode.axis === 'width';
    for (let i = 0; i < this.curtains.length; i++) {
      const curtain = this.curtains[i];
      const slice = (i + 0.5) / this.curtains.length;
      curtain.rotation.y = widthMode ? Math.PI / 2 : 0;
      curtain.scale.x = widthMode ? ROOM.width : ROOM.length;
      curtain.position.set(widthMode ? ROOM.length * slice : ROOM.length / 2, ROOM.height / 2, widthMode ? ROOM.width / 2 : ROOM.width * slice);
    }
  }

  private rebuildNodeMarkers(): void {
    for (const label of this.nodeLabels) {
      this.labels.remove(label);
    }
    this.nodeLabels.length = 0;
    for (const child of this.nodeGroup.children) {
      const line = child as THREE.LineSegments;
      line.geometry?.dispose();
      if (line.material) (Array.isArray(line.material) ? line.material : [line.material]).forEach((material) => material.dispose());
    }
    this.nodeGroup.clear();
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
      if (order <= 3 || i === Math.floor(order / 2)) this.nodeLabels.push(this.labels.add('node', 'NODE <span style="opacity:.5">/ QUIET</span>', labelPosition));
    }
    const antinodePosition = axis === 'height' ? new THREE.Vector3(ROOM.length * 0.15, ROOM.height + 0.16, ROOM.width * 0.8) : axis === 'width' ? new THREE.Vector3(ROOM.length * 0.68, ROOM.height + 0.15, ROOM.width - 0.1) : new THREE.Vector3(ROOM.length - 0.16, ROOM.height + 0.14, ROOM.width * 0.63);
    this.nodeLabels.push(this.labels.add('antinode', 'ANTINODE <span style="opacity:.5">/ LOUD</span>', antinodePosition));
  }
}
