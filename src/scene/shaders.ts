import * as THREE from 'three';

export const FINISH_SHADER = {
  name: 'FinishShader',
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uFrame: { value: 0 },
    uVignette: { value: 0.3 },
    uGrain: { value: 0.03 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uFrame;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;
    float hash(vec2 point) {
      return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 offset = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      color.rgb *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(offset));
      color.rgb += (hash(floor(vUv * uResolution) + uFrame * 17.0) - 0.5) * uGrain;
      gl_FragColor = color;
    }`,
};

export const BACKDROP_VERTEX = `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

export const BACKDROP_FRAGMENT = `
  uniform vec3 uFloor;
  uniform vec3 uHorizon;
  uniform vec3 uSky;
  varying vec3 vDirection;
  void main() {
    float height = normalize(vDirection).y;
    vec3 color = height < 0.0
      ? mix(uHorizon, uFloor, smoothstep(-0.02, -0.4, height))
      : mix(uHorizon, uSky, smoothstep(0.0, 0.45, height));
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
