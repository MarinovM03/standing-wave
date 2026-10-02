import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { surfaceMaterial } from './materials';
import type { RoomModel } from './model';
import { LIGHTS, STUDIO } from './palette';
import type { Tier } from './renderer';
import { BACKDROP_FRAGMENT, BACKDROP_VERTEX } from './shaders';

const ENVIRONMENT_INTENSITY = 0.45;
const HAZE_DENSITY = 0.02;
const KEY_INTENSITY = 1.9;
const RIM_INTENSITY = 1.7;
const PLAIN_FILL_INTENSITY = 2.4;

export type Studio = { dispose(): void };

export function addStudio(scene: THREE.Scene, renderer: THREE.WebGLRenderer, model: RoomModel, tier: Tier): Studio {
  scene.fog = new THREE.FogExp2(STUDIO.horizon, HAZE_DENSITY);
  const centre = model.plinth.centre;
  const key = new THREE.DirectionalLight(LIGHTS.key, KEY_INTENSITY);
  key.position.set(centre.x - 7, 11, centre.z + 8);
  key.target.position.set(centre.x, 0, centre.z);
  const rim = new THREE.DirectionalLight(LIGHTS.rim, RIM_INTENSITY);
  rim.position.set(centre.x + 9, 6, centre.z - 8);
  rim.target.position.set(centre.x, 1, centre.z);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 72), surfaceMaterial(tier, { color: STUDIO.floor, roughness: 0.94, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centre.x, model.floor, centre.z);
  scene.add(key, key.target, rim, rim.target, floor);

  // Software rendering can't afford image-based light or a shaded backdrop on every pixel.
  if (tier === 'plain') {
    scene.background = new THREE.Color(STUDIO.horizon);
    scene.add(new THREE.HemisphereLight(LIGHTS.key, STUDIO.floor, PLAIN_FILL_INTENSITY));
    return {
      dispose: () => {
        scene.background = null;
        scene.fog = null;
      },
    };
  }

  const environment = reflections(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = ENVIRONMENT_INTENSITY;
  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), new THREE.ShaderMaterial({
    uniforms: {
      uFloor: { value: new THREE.Color(STUDIO.floor) },
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

  return {
    dispose: () => {
      environment.dispose();
      scene.environment = null;
      scene.fog = null;
    },
  };
}

function reflections(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const generator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const checkShaderErrors = renderer.debug.checkShaderErrors;
  renderer.debug.checkShaderErrors = false;
  const environment = generator.fromScene(room, 0.04);
  renderer.debug.checkShaderErrors = checkShaderErrors;
  room.dispose();
  generator.dispose();
  return environment;
}
