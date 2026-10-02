import * as THREE from 'three';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import type { Tier } from './renderer';
import { FINISH_SHADER } from './shaders';

export const BLOOM_LAYER = 1;

const BLOOM = { strength: 0.9, radius: 0.45, threshold: 1 };
const DEPTH_OF_FIELD = { aperture: 0.0012, maxblur: 0.006 };
const GRAIN_PERIOD = 64;

export type Post = {
  render(delta: number): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  setDepthOfField(enabled: boolean, focus: number): void;
  dispose(): void;
};

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, tier: Tier, samples: number): Post {
  if (tier === 'plain') {
    return {
      render: () => renderer.render(scene, camera),
      setSize: (width, height, pixelRatio) => {
        renderer.setPixelRatio(pixelRatio);
        renderer.setSize(width, height, false);
      },
      setDepthOfField: () => {},
      dispose: () => {},
    };
  }

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples }));
  const depthOfField = new DepthOfFieldPass(scene, camera, { focus: 10, ...DEPTH_OF_FIELD });
  const bloom = new SelectiveBloomPass(scene, camera);
  const output = new OutputPass();
  const finish = new ShaderPass(FINISH_SHADER);
  const passes = [new RenderPass(scene, camera), depthOfField, bloom, output, finish];
  for (const pass of passes) composer.addPass(pass);
  depthOfField.enabled = false;
  let frame = 0;

  return {
    render: (delta) => {
      finish.uniforms.uFrame.value = frame++ % GRAIN_PERIOD;
      composer.render(delta);
    },
    setSize: (width, height, pixelRatio) => {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      finish.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
    },
    setDepthOfField: (enabled, focus) => {
      depthOfField.enabled = enabled;
      (depthOfField.uniforms as Record<string, THREE.IUniform<number>>).focus.value = focus;
    },
    dispose: () => {
      for (const pass of passes) pass.dispose();
      composer.dispose();
    },
  };
}

// Points and additive glows don't write depth, so they must not blur as if they were solid.
class DepthOfFieldPass extends BokehPass {
  private readonly hidden: THREE.Object3D[] = [];

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    this.scene.traverseVisible((object) => {
      const material = (object as THREE.Mesh).material;
      if (material && !Array.isArray(material) && !material.depthWrite) this.hidden.push(object);
    });
    for (const object of this.hidden) object.visible = false;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    for (const object of this.hidden) object.visible = true;
    this.hidden.length = 0;
  }
}

// Bloom samples only objects on BLOOM_LAYER, with everything else drawn black as an occluder,
// so specular highlights on brass and metal can never bloom however bright they get.
class SelectiveBloomPass extends Pass {
  private readonly bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
  private readonly source = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  private readonly occluder = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), side: THREE.DoubleSide });
  private readonly blend = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
    vertexShader: CopyShader.vertexShader,
    fragmentShader: CopyShader.fragmentShader,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }));
  private readonly swapped = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private readonly hidden: THREE.Object3D[] = [];

  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.Camera) {
    super();
    this.needsSwap = false;
  }

  override setSize(width: number, height: number): void {
    this.source.setSize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)));
    this.bloom.setSize(width / 2, height / 2);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    if (!this.isolateBloomLayer()) return;
    const { background, fog } = this.scene;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    this.scene.background = null;
    this.scene.fog = null;
    renderer.setRenderTarget(this.source);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.scene.background = background;
    this.scene.fog = fog;
    this.restore();
    this.bloom.render(renderer, writeBuffer, this.source, 0, false);
    (this.blend.material as THREE.ShaderMaterial).uniforms.tDiffuse.value = this.bloom.renderTargetsHorizontal[0].texture;
    renderer.setRenderTarget(readBuffer);
    this.blend.render(renderer);
    renderer.autoClear = autoClear;
  }

  override dispose(): void {
    this.bloom.dispose();
    this.source.dispose();
    this.occluder.dispose();
    this.blend.material.dispose();
    this.blend.dispose();
  }

  private isolateBloomLayer(): boolean {
    let glowing = false;
    this.scene.traverse((object) => {
      if (object.layers.isEnabled(BLOOM_LAYER)) glowing = true;
    });
    if (!glowing) return false;
    this.scene.traverseVisible((object) => {
      if (object.layers.isEnabled(BLOOM_LAYER)) return;
      const mesh = object as THREE.Mesh;
      const materials = mesh.isMesh ? [mesh.material].flat() : [];
      if (mesh.isMesh && materials.every((material) => !material.transparent)) {
        this.swapped.set(mesh, mesh.material);
        mesh.material = this.occluder;
      } else if (mesh.isMesh || (object as THREE.Points).isPoints || (object as THREE.Line).isLine || (object as THREE.Sprite).isSprite) {
        this.hidden.push(object);
      }
    });
    for (const object of this.hidden) object.visible = false;
    return true;
  }

  private restore(): void {
    for (const [mesh, material] of this.swapped) mesh.material = material;
    for (const object of this.hidden) object.visible = true;
    this.swapped.clear();
    this.hidden.length = 0;
  }
}
