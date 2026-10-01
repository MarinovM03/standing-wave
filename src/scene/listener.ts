import * as THREE from 'three';
import type { Position } from '../model/room';
import type { ProjectedLabel, SceneLabels } from './labels';

const TOUCH_HIT_RADIUS = 24;

/** The microphone's visual cue and hit area share one world-space marker. */
export class ListenerMarker {
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
  private readonly hitTargets: THREE.Object3D[] = [];
  private readonly listenerLabel: ProjectedLabel;
  private readonly pointerHits: THREE.Intersection[] = [];
  private readonly projectedHead = new THREE.Vector3();
  private projectedX = Number.NaN;
  private projectedY = Number.NaN;
  private projectedVisible = false;
  private listenerAmplitude = 1;
  private listenerHaloScale = 1;
  private dragging = false;

  constructor(scene: THREE.Scene, labels: SceneLabels) {
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
    scene.add(this.listener);
    this.listenerLabel = labels.add('listener', 'LISTENER <span style="opacity:.5">↔ DRAG</span>', new THREE.Vector3());
    this.listenerLabel.element.dataset.hitRadius = String(TOUCH_HIT_RADIUS);
    this.listenerLabel.element.dataset.micVisible = 'false';
  }

  update(position: Position, amplitude: number): void {
    this.listener.position.set(position.x, 0, position.z);
    this.listenerHead.position.y = position.y;
    this.listenerStem.scale.y = Math.max(0.03, position.y - 0.14);
    this.listenerStem.position.y = (position.y + 0.02) / 2;
    this.listenerLabel.position.set(position.x, position.y + 0.38, position.z);
    this.listenerAmplitude = amplitude;
    this.updateListenerFeedback();
    this.listenerLabel.element.dataset.amplitude = this.listenerAmplitude.toFixed(6);
    this.listenerLabel.element.dataset.pressure = this.listenerAmplitude < 0.13 ? 'quiet' : this.listenerAmplitude > 0.72 ? 'hot' : 'mid';
    this.listenerLabel.element.style.setProperty('--amplitude', this.listenerAmplitude.toFixed(4));
  }

  setDragging(active: boolean): void {
    this.dragging = active;
    this.listenerLabel.element.classList.toggle('is-dragging', active);
    this.updateListenerFeedback();
  }

  setCompactViewport(compact: boolean): void {
    this.listenerHit.scale.setScalar(compact ? 1.65 : 1);
  }

  animate(time: number): void {
    const pulse = 1 + Math.sin(time * 1.8) * this.listenerAmplitude * 0.045;
    this.listenerHalo.scale.setScalar(this.listenerHaloScale * pulse);
  }

  project(camera: THREE.Camera, width: number, height: number): void {
    this.listenerHead.getWorldPosition(this.projectedHead).project(camera);
    const x = Math.round((this.projectedHead.x * 0.5 + 0.5) * width * 2) / 2;
    const y = Math.round((-this.projectedHead.y * 0.5 + 0.5) * height * 2) / 2;
    const visible = this.projectedHead.z >= -1 && this.projectedHead.z <= 1 && x >= 0 && x <= width && y >= 0 && y <= height;
    if (x !== this.projectedX || y !== this.projectedY) {
      this.projectedX = x;
      this.projectedY = y;
      this.listenerLabel.element.dataset.micX = String(x);
      this.listenerLabel.element.dataset.micY = String(y);
    }
    if (visible !== this.projectedVisible) {
      this.projectedVisible = visible;
      this.listenerLabel.element.dataset.micVisible = String(visible);
    }
  }

  hitTest(raycaster: THREE.Raycaster, touchPosition?: THREE.Vector2): boolean {
    // A fixed screen-space target remains finger-sized when the camera zooms out.
    if (touchPosition && this.projectedVisible && Math.hypot(touchPosition.x - this.projectedX, touchPosition.y - this.projectedY) <= TOUCH_HIT_RADIUS) return true;
    this.listener.updateWorldMatrix(true, true);
    this.pointerHits.length = 0;
    raycaster.intersectObjects(this.hitTargets, false, this.pointerHits);
    return this.pointerHits.length > 0;
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
}
