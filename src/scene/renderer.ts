import * as THREE from 'three';
import { TOKENS } from './palette';

export type Tier = 'full' | 'plain';

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;
const EXPOSURE = 1.05;

export function createRenderer(): { renderer: THREE.WebGLRenderer; tier: Tier } {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setClearColor(TOKENS.ink, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  const tier: Tier = SOFTWARE_RENDERER.test(rendererName(renderer.getContext())) ? 'plain' : 'full';
  renderer.domElement.dataset.tier = tier;
  return { renderer, tier };
}

// Chrome masks RENDERER, Firefox exposes it and warns when the debug extension is requested.
function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const name = String(gl.getParameter(gl.RENDERER));
  if (!/webkit webgl/i.test(name)) return name;
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : name;
}

export function pixelRatio(tier: Tier, coarsePointer: boolean): number {
  return tier === 'plain' || coarsePointer ? 1 : Math.min(window.devicePixelRatio, 1.5);
}

export const MSAA_SAMPLES = 4;
