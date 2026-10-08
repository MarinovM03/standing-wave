import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { surfaceMaterial } from './materials';
import type { RoomModel } from './model';
import { LIGHTS, STUDIO } from './palette';
import type { Tier } from './renderer';
import { BACKDROP_FRAGMENT, BACKDROP_VERTEX } from './shaders';

const REFLECTIONS = { size: 256, sigma: 0.04, intensity: 0.45, fadeSeconds: 1.2 };
const HAZE_DENSITY = 0.02;
const KEY_INTENSITY = 1.9;
const RIM_INTENSITY = 1.7;
const PLAIN_FILL_INTENSITY = 2.4;
const FLOOR_RADIUS = 40;
const FLOOR_FADE = { from: 12, to: 36 };

export type Studio = {
  // Building reflections costs hundreds of milliseconds, so the stage asks for them once the first frame is on screen.
  addReflections(instant: boolean): void;
  tick(delta: number): void;
  dispose(): void;
};

export function addStudio(scene: THREE.Scene, renderer: THREE.WebGLRenderer, model: RoomModel, tier: Tier): Studio {
  scene.fog = new THREE.FogExp2(STUDIO.horizon, HAZE_DENSITY);
  const centre = model.plinth.centre;
  const key = new THREE.DirectionalLight(LIGHTS.key, KEY_INTENSITY);
  key.position.set(centre.x - 7, 11, centre.z + 8);
  key.target.position.set(centre.x, 0, centre.z);
  const rim = new THREE.DirectionalLight(LIGHTS.rim, RIM_INTENSITY);
  rim.position.set(centre.x + 9, 6, centre.z - 8);
  rim.target.position.set(centre.x, 1, centre.z);
  // The studio floor fills most of the frame; lit per pixel it costs a software renderer more than the whole room.
  const floorMaterial = tier === 'plain' ? new THREE.MeshBasicMaterial({ color: STUDIO.floor }) : surfaceMaterial(tier, { color: STUDIO.floor, roughness: 0.94, metalness: 0 });
  floorMaterial.onBeforeCompile = fadeToHorizon;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(FLOOR_RADIUS, 72), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centre.x, model.floor, centre.z);
  scene.add(key, key.target, rim, rim.target, floor);

  // Software rendering can't afford image-based light or a shaded backdrop on every pixel.
  if (tier === 'plain') {
    scene.background = new THREE.Color(STUDIO.horizon);
    scene.add(new THREE.HemisphereLight(LIGHTS.key, STUDIO.floor, PLAIN_FILL_INTENSITY));
    return {
      addReflections: () => {},
      tick: () => {},
      dispose: () => {
        scene.background = null;
        scene.fog = null;
      },
    };
  }

  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), new THREE.ShaderMaterial({
    uniforms: {
      uHorizon: { value: new THREE.Color(STUDIO.horizon) },
      uSky: { value: new THREE.Color(STUDIO.sky) },
    },
    vertexShader: BACKDROP_VERTEX,
    fragmentShader: BACKDROP_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
  }));
  backdrop.position.set(centre.x, model.floor, centre.z);
  backdrop.renderOrder = -1;
  scene.add(backdrop);

  // Materials compile for reflections from the first frame, against an empty map of the same atlas height, so the real one swaps in without recompiling.
  const standIn = cubeUvStandIn(REFLECTIONS.size);
  scene.environment = standIn;
  scene.environmentIntensity = 0;
  let environment: THREE.WebGLRenderTarget | null = null;
  let requested = false;
  let disposed = false;
  let shown = 0;
  return {
    addReflections: (instant) => {
      if (requested) return;
      requested = true;
      void buildReflections(renderer, () => disposed).then((target) => {
        if (!target) return;
        environment = target;
        shown = instant ? 1 : 0;
        scene.environment = target.texture;
        scene.environmentIntensity = REFLECTIONS.intensity * shown;
      });
    },
    tick: (delta) => {
      if (!environment || shown >= 1) return;
      shown = Math.min(1, shown + delta / REFLECTIONS.fadeSeconds);
      scene.environmentIntensity = REFLECTIONS.intensity * THREE.MathUtils.smoothstep(shown, 0, 1);
    },
    dispose: () => {
      disposed = true;
      environment?.dispose();
      standIn.dispose();
      scene.environment = null;
      scene.fog = null;
    },
  };
}

// PMREM lays a cube of size n out in an atlas 4n texels high, and three keys the shader on that height alone.
function cubeUvStandIn(size: number): THREE.DataTexture {
  const height = 4 * size;
  const texture = new THREE.DataTexture(new Uint8Array(4 * height), 1, height);
  texture.mapping = THREE.CubeUVReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}

type PmremInternals = {
  _setSize?(size: number): void;
  _allocateTargets?(): THREE.WebGLRenderTarget;
  _blurMaterial?: THREE.Material | null;
  _ggxMaterial?: THREE.Material | null;
};

// PMREMGenerator has no public way to warm its filters, so this reaches its private materials; if they move, fromScene compiles them as before.
function pmremFilters(generator: THREE.PMREMGenerator): THREE.Material[] {
  /* oxlint-disable no-underscore-dangle */
  const internals = generator as unknown as PmremInternals;
  if (typeof internals._setSize !== 'function' || typeof internals._allocateTargets !== 'function') return [];
  internals._setSize(REFLECTIONS.size);
  internals._allocateTargets().dispose();
  return [internals._blurMaterial, internals._ggxMaterial].filter((material): material is THREE.Material => !!material);
  /* oxlint-enable no-underscore-dangle */
}

async function buildReflections(renderer: THREE.WebGLRenderer, cancelled: () => boolean): Promise<THREE.WebGLRenderTarget | null> {
  const generator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const background = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  await compileInParallel(renderer, generator, room, background);
  let environment: THREE.WebGLRenderTarget | null = null;
  if (!cancelled()) {
    // r186's PMREM shader trips a harmless ANGLE D3D11 precision note (X4122) that would be logged as an error.
    const checkShaderErrors = renderer.debug.checkShaderErrors;
    renderer.debug.checkShaderErrors = false;
    environment = generator.fromScene(room, REFLECTIONS.sigma, 0.1, 100, { size: REFLECTIONS.size });
    renderer.debug.checkShaderErrors = checkShaderErrors;
  }
  background.dispose();
  room.dispose();
  generator.dispose();
  return environment;
}

// fromScene compiles its filters on first use, which blocks for about 750 ms on ANGLE D3D11, so they compile in parallel first.
function compileInParallel(renderer: THREE.WebGLRenderer, generator: THREE.PMREMGenerator, room: THREE.Scene, background: THREE.Material): Promise<unknown> {
  if (!renderer.extensions.has('KHR_parallel_shader_compile')) return Promise.resolve();
  // The program key includes which attributes a geometry has, so these stand-ins match PMREM's background box and planes.
  const filters = new THREE.Scene();
  filters.add(new THREE.Mesh(new THREE.BoxGeometry(), background));
  const plane = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  for (const material of pmremFilters(generator)) filters.add(new THREE.Mesh(plane, material));
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  const ready = Promise.all([
    renderer.compileAsync(room, new THREE.PerspectiveCamera(90, 1, 0.1, 100)),
    renderer.compileAsync(filters, new THREE.OrthographicCamera()),
  ]);
  renderer.setRenderTarget(previous);
  return ready.finally(() => {
    target.dispose();
    filters.traverse((object) => (object as THREE.Mesh).geometry?.dispose());
  });
}

// The floor melts into the haze colour before its edge, so it meets the backdrop without a seam.
function fadeToHorizon(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vStudioRadius;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStudioRadius = length(position.xy);');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vStudioRadius;')
    .replace('#include <fog_fragment>', `#include <fog_fragment>
      #ifdef USE_FOG
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(${FLOOR_FADE.from.toFixed(1)}, ${FLOOR_FADE.to.toFixed(1)}, vStudioRadius));
      #endif`);
}
