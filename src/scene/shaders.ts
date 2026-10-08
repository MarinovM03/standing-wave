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
  uniform vec3 uHorizon;
  uniform vec3 uSky;
  varying vec3 vDirection;
  void main() {
    float height = normalize(vDirection).y;
    gl_FragColor = vec4(mix(uHorizon, uSky, smoothstep(0.0, 0.45, height)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const glsl = (value: number) => value.toFixed(4);

// Coupling, response and the room size come from the model; only the cosine mode shape is restated for the GPU.
export function fieldCommon(room: { length: number; width: number; height: number }, floor: number): string {
  return `
    #define FIELD_PI 3.141592653589793
    #define ROOM_SIZE vec3(${glsl(room.length)}, ${glsl(room.height)}, ${glsl(room.width)})
    #define FIELD_FLOOR ${glsl(floor)}
    #define SWING_DEPTH 0.35
    #define BELIEF_POWER 1.4
    uniform vec3 uAxis;
    uniform float uOrder;
    uniform float uCoupling;
    uniform float uResponse;
    uniform float uBelief;
    uniform float uSwing;
    uniform vec3 uSpeaker;
    uniform vec3 uActually;
    uniform vec3 uYoudThink;
    float modeShape(vec3 point) {
      return cos(FIELD_PI * uOrder * dot(point / ROOM_SIZE, uAxis));
    }
    float fieldLevel(vec3 point) {
      float actually = FIELD_FLOOR + (1.0 - FIELD_FLOOR) * abs(modeShape(point)) * uCoupling * uResponse;
      float youdThink = 1.0 / (1.0 + distance(point, uSpeaker));
      return mix(actually, youdThink, uBelief);
    }
    float fieldSwing(vec3 point) {
      return 1.0 + SWING_DEPTH * sign(modeShape(point)) * uSwing * (1.0 - uBelief);
    }
    float fieldBrightness(vec3 point) {
      return pow(fieldLevel(point), mix(2.0, BELIEF_POWER, uBelief)) * fieldSwing(point);
    }
    vec3 fieldColor() {
      return mix(uActually, uYoudThink, uBelief);
    }`;
}

export const FIELD_SURFACE_VERTEX = `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

// Premultiplied: rgb is the light the field adds, alpha how much of the lit clay beneath it gives way.
export function floorFragment(ramp: number, contour: { stepsPerNeper: number; pixels: number; crowd: readonly [number, number] }): string {
  return `
  #define RAMP_POWER ${glsl(ramp)}
  #define CONTOUR_STEPS_PER_NEPER ${glsl(contour.stepsPerNeper)}
  #define CONTOUR_PIXELS ${glsl(contour.pixels)}
  #define CONTOUR_CROWD vec2(${glsl(contour.crowd[0])}, ${glsl(contour.crowd[1])})
  uniform float uIntensity;
  uniform vec2 uKeep;
  uniform float uContour;
  uniform float uGrid;
  uniform vec3 uLine;
  varying vec3 vWorld;
  void main() {
    vec2 cell = abs(fract(vWorld.xz + 0.5) - 0.5) / fwidth(vWorld.xz);
    float grid = 1.0 - min(min(cell.x, cell.y), 1.0);
    float level = fieldLevel(vWorld);
    float steps = CONTOUR_STEPS_PER_NEPER * log(level);
    float spacing = max(fwidth(steps), 1e-4);
    // Lines fade where they crowd towards a node, and 0 dB gets none since only the antinode itself reaches it.
    float contour = (1.0 - smoothstep(0.0, CONTOUR_PIXELS, abs(fract(steps + 0.5) - 0.5) / spacing))
      * (1.0 - smoothstep(CONTOUR_CROWD.x, CONTOUR_CROWD.y, spacing))
      * step(0.5, -steps);
    // Level squared stays flat for a metre around an antinode; this ramp falls evenly with distance across a cosine mode.
    float ramp = pow(1.0 - acos(min(level, 1.0)) / (0.5 * FIELD_PI), RAMP_POWER);
    float brightness = mix(ramp, pow(level, BELIEF_POWER), uBelief) * fieldSwing(vWorld);
    vec3 color = fieldColor();
    vec3 light = color * (brightness * uIntensity + contour * uContour) + uLine * grid * uGrid;
    float keep = mix(uKeep.x, uKeep.y, min(brightness, 1.0));
    gl_FragColor = vec4(light, 1.0 - keep);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
}

export const FIELD_WALL_FRAGMENT = `
  uniform float uIntensity;
  varying vec3 vWorld;
  void main() {
    float lift = 0.6 + 0.4 * (1.0 - vWorld.y / ROOM_SIZE.y);
    gl_FragColor = vec4(fieldColor() * fieldBrightness(vWorld) * uIntensity * lift, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export const FIELD_POINTS_VERTEX = `
  uniform float uPixelRatio;
  uniform float uPointSize;
  uniform float uViewScale;
  uniform float uMaxPointSize;
  attribute float aSeed;
  varying float vBrightness;
  void main() {
    float level = fieldLevel(position);
    float brightness = fieldBrightness(position);
    vBrightness = brightness * brightness * (0.4 + 0.6 * aSeed);
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * view;
    float size = uPointSize * uViewScale * (0.5 + 0.7 * level) / -view.z;
    gl_PointSize = clamp(size * uPixelRatio, 1.0, uMaxPointSize * uPixelRatio);
    // A point can't draw smaller than a pixel, so far points give up brightness instead, as their area would.
    vBrightness *= min(1.0, size * size / 2.25);
  }`;

export const FIELD_POINTS_FRAGMENT = `
  uniform float uIntensity;
  varying float vBrightness;
  void main() {
    vec2 offset = gl_PointCoord - 0.5;
    float radius = dot(offset, offset) * 4.0;
    if (radius > 1.0) discard;
    gl_FragColor = vec4(fieldColor() * exp(-4.0 * radius) * vBrightness * uIntensity, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
