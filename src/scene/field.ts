import * as THREE from 'three';
import { AXIAL_MODES, FIELD_FLOOR, nodePlanes, type Mode, type ViewMode } from '../model/acoustics';
import { COORDINATE, ROOM, type Position } from '../model/room';
import { halfWaveLine, planeOutline } from './anchors';
import { FIELD } from './palette';
import { BLOOM_LAYER } from './post';
import type { Tier } from './renderer';
import {
  FIELD_FLOOR_FRAGMENT,
  FIELD_POINTS_FRAGMENT,
  FIELD_POINTS_VERTEX,
  FIELD_SURFACE_VERTEX,
  FIELD_WALL_FRAGMENT,
  fieldCommon,
} from './shaders';

export type FieldState = {
  mode: Mode;
  coupling: number;
  response: number;
  view: ViewMode;
  speaker: Position;
  mic: Position;
};

const FADE_SECONDS = 0.2;
const YOUD_THINK_DIM = 0.7;
const SWING_HZ = 1;
const SWING_EASE_SECONDS = 0.3;
const FLOOR = { intensity: 1.5, shade: 0.75, grid: 0.035, lift: 0.004 };
const WALL = { intensity: 0.14, inset: 0.004 };
const POINTS = { intensity: 0.26, size: 0.034, maxSize: 3 };
const PARTICLES = { full: 8000, phone: 3000, plain: 1500 };
// Without the composer each fragment is encoded to sRGB before it blends, which lifts faint glows several times over.
const PLAIN_DIM = { floor: 0.65, points: 0.3 };
const LINE_OPACITY = { node: 0.6, half: 0.7, distance: 0.55 };
const MAX_NODES = Math.max(...AXIAL_MODES.map((mode) => mode.order));
const AXIS_VECTORS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) } as const;

export class Field {
  private readonly uniforms = {
    uAxis: { value: new THREE.Vector3(1, 0, 0) },
    uOrder: { value: 1 },
    uCoupling: { value: 1 },
    uResponse: { value: 1 },
    uBelief: { value: 0 },
    uSwing: { value: 0 },
    uSpeaker: { value: new THREE.Vector3() },
    uActually: { value: new THREE.Color(FIELD.actually) },
    uYoudThink: { value: new THREE.Color(FIELD.youdThink).multiplyScalar(YOUD_THINK_DIM) },
  };
  private readonly pixelRatio = { value: 1 };
  private readonly viewScale = { value: 1 };
  private readonly nodeLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  private readonly halfLine: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly distanceLine: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  private belief = 0;
  private beliefGoal = 0;
  private swing = 0;
  private swingGoal = 0;
  private phase = 0;

  constructor(scene: THREE.Scene, tier: Tier, phone: boolean) {
    const plain = tier === 'plain';
    const common = fieldCommon(ROOM, FIELD_FLOOR);
    const surface = (fragment: string, extra: Record<string, THREE.IUniform>, blending: THREE.Blending, premultipliedAlpha: boolean) => new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, ...extra },
      vertexShader: FIELD_SURFACE_VERTEX,
      fragmentShader: `${common}\n${fragment}`,
      transparent: true,
      depthWrite: false,
      blending,
      premultipliedAlpha,
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.length, ROOM.width), surface(FIELD_FLOOR_FRAGMENT, {
      uIntensity: { value: FLOOR.intensity * (plain ? PLAIN_DIM.floor : 1) },
      uShade: { value: FLOOR.shade },
      uGrid: { value: FLOOR.grid },
      uLine: { value: new THREE.Color(FIELD.line) },
    }, THREE.NormalBlending, true));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(ROOM.length / 2, FLOOR.lift, ROOM.width / 2);

    const particles = plain ? PARTICLES.plain : phone ? PARTICLES.phone : PARTICLES.full;
    const points = new THREE.Points(particleGeometry(particles), new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uIntensity: { value: POINTS.intensity * (plain ? PLAIN_DIM.points : 1) }, uPointSize: { value: POINTS.size }, uMaxPointSize: { value: POINTS.maxSize }, uPixelRatio: this.pixelRatio, uViewScale: this.viewScale },
      vertexShader: `${common}\n${FIELD_POINTS_VERTEX}`,
      fragmentShader: `${common}\n${FIELD_POINTS_FRAGMENT}`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));

    const glows: THREE.Object3D[] = [floor, points];
    // A software renderer shades every pixel on the CPU, and the wall glow is the subtlest layer.
    if (!plain) {
      const wallMaterial = surface(FIELD_WALL_FRAGMENT, { uIntensity: { value: WALL.intensity } }, THREE.AdditiveBlending, false);
      const backWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.length, ROOM.height), wallMaterial);
      backWall.position.set(ROOM.length / 2, ROOM.height / 2, WALL.inset);
      const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.height), wallMaterial);
      sideWall.rotation.y = Math.PI / 2;
      sideWall.position.set(WALL.inset, ROOM.height / 2, ROOM.width / 2);
      glows.push(backWall, sideWall);
    }
    for (const glow of glows) {
      glow.layers.enable(BLOOM_LAYER);
      glow.renderOrder = 1;
    }

    this.nodeLines = new THREE.LineSegments(lineGeometry(MAX_NODES * 8), new THREE.LineDashedMaterial({
      color: FIELD.line, transparent: true, opacity: LINE_OPACITY.node, depthWrite: false, dashSize: 0.09, gapSize: 0.07,
    }));
    this.halfLine = new THREE.LineSegments(lineGeometry(6), new THREE.LineBasicMaterial({
      color: FIELD.line, transparent: true, opacity: LINE_OPACITY.half, depthWrite: false,
    }));
    this.distanceLine = new THREE.Line(lineGeometry(2), new THREE.LineDashedMaterial({
      color: FIELD.line, transparent: true, opacity: 0, depthWrite: false, dashSize: 0.09, gapSize: 0.07,
    }));
    for (const line of [this.nodeLines, this.halfLine, this.distanceLine]) line.renderOrder = 3;
    scene.add(...glows, this.nodeLines, this.halfLine, this.distanceLine);
  }

  update({ mode, coupling, response, view, speaker, mic }: FieldState): void {
    const { uniforms } = this;
    uniforms.uAxis.value.copy(AXIS_VECTORS[COORDINATE[mode.axis]]);
    uniforms.uOrder.value = mode.order;
    uniforms.uCoupling.value = coupling;
    uniforms.uResponse.value = response;
    uniforms.uSpeaker.value.set(speaker.x, speaker.y, speaker.z);
    this.beliefGoal = view === 'belief' ? 1 : 0;
    this.drawNodes(mode);
    this.drawHalfWave(mode);
    writeSegments(this.distanceLine.geometry, [[new THREE.Vector3(speaker.x, speaker.y, speaker.z), new THREE.Vector3(mic.x, mic.y, mic.z)]]);
  }

  setSwing(playing: boolean): void {
    this.swingGoal = playing ? 1 : 0;
  }

  // Points keep a world size, so the scale is CSS pixels per metre at one metre away.
  setViewport(height: number, fov: number, pixelRatio: number): void {
    this.viewScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
    this.pixelRatio.value = pixelRatio;
  }

  tick(delta: number): void {
    this.belief = approach(this.belief, this.beliefGoal, delta / FADE_SECONDS);
    this.swing = approach(this.swing, this.swingGoal, delta / SWING_EASE_SECONDS);
    if (this.swing > 0) this.phase = (this.phase + delta * SWING_HZ) % 1;
    this.uniforms.uBelief.value = this.belief;
    this.uniforms.uSwing.value = Math.sin(this.phase * Math.PI * 2) * this.swing;
    fade(this.nodeLines, LINE_OPACITY.node * (1 - this.belief));
    fade(this.halfLine, LINE_OPACITY.half * (1 - this.belief));
    fade(this.distanceLine, LINE_OPACITY.distance * this.belief);
  }

  private drawNodes(mode: Mode): void {
    const segments: [THREE.Vector3, THREE.Vector3][] = [];
    for (const at of nodePlanes(mode)) {
      const corners = planeOutline(mode, at);
      corners.forEach((corner, index) => segments.push([corner, corners[(index + 1) % corners.length]]));
    }
    writeSegments(this.nodeLines.geometry, segments);
  }

  private drawHalfWave(mode: Mode): void {
    const { start, end, tick } = halfWaveLine(mode);
    writeSegments(this.halfLine.geometry, [
      [start, end],
      [start.clone().sub(tick), start.clone().add(tick)],
      [end.clone().sub(tick), end.clone().add(tick)],
    ]);
  }
}

function approach(value: number, goal: number, step: number): number {
  return value < goal ? Math.min(goal, value + step) : Math.max(goal, value - step);
}

function fade(line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial | THREE.LineDashedMaterial>, opacity: number): void {
  line.material.opacity = opacity;
  line.visible = opacity > 0.005;
}

function lineGeometry(vertices: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(vertices), 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  return geometry;
}

// Rewriting a fixed buffer in place means mode changes never allocate geometry.
function writeSegments(geometry: THREE.BufferGeometry, segments: readonly (readonly [THREE.Vector3, THREE.Vector3])[]): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const distance = geometry.getAttribute('lineDistance') as THREE.BufferAttribute;
  segments.forEach(([start, end], index) => {
    position.setXYZ(index * 2, start.x, start.y, start.z);
    position.setXYZ(index * 2 + 1, end.x, end.y, end.z);
    distance.setX(index * 2, 0);
    distance.setX(index * 2 + 1, start.distanceTo(end));
  });
  position.needsUpdate = true;
  distance.needsUpdate = true;
  geometry.setDrawRange(0, segments.length * 2);
  geometry.computeBoundingSphere();
}

// A fixed seed keeps the jittered grid identical on every load.
function particleGeometry(count: number): THREE.BufferGeometry {
  const cell = Math.cbrt((ROOM.length * ROOM.width * ROOM.height) / count);
  const nx = Math.round(ROOM.length / cell);
  const ny = Math.round(ROOM.height / cell);
  const nz = Math.round(ROOM.width / cell);
  const positions = new Float32Array(nx * ny * nz * 3);
  const seeds = new Float32Array(nx * ny * nz);
  let seed = 48271;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  let index = 0;
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      for (let z = 0; z < nz; z++) {
        positions[index * 3] = ((x + random()) / nx) * ROOM.length;
        positions[index * 3 + 1] = ((y + random()) / ny) * ROOM.height;
        positions[index * 3 + 2] = ((z + random()) / nz) * ROOM.width;
        seeds[index++] = random();
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  return geometry;
}
