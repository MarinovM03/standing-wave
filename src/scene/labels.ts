import * as THREE from 'three';

export type ProjectedLabel = { element: HTMLDivElement; position: THREE.Vector3; kind: 'dimension' | 'node' | 'antinode' | 'listener' | 'source'; hiddenInTopView?: boolean; lastX?: number; lastY?: number; lastVisible?: boolean };

/** Projects scene annotations without writing unchanged DOM coordinates each frame. */
export class SceneLabels {
  private readonly items: ProjectedLabel[] = [];
  private readonly layer: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private readonly projection = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.style = document.createElement('style');
    this.style.textContent = `
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
    document.head.append(this.style);
    this.layer = document.createElement('div');
    this.layer.className = 'sw-scene-labels';
    this.layer.setAttribute('aria-hidden', 'true');
    container.append(this.layer);
  }

  add(kind: ProjectedLabel['kind'], text: string, position: THREE.Vector3, hiddenInTopView = false): ProjectedLabel {
    const element = document.createElement('div');
    element.className = `sw-scene-label sw-scene-label--${kind}`;
    element.innerHTML = text;
    this.layer.append(element);
    const label = { element, position, kind, hiddenInTopView };
    this.items.push(label);
    return label;
  }

  remove(label: ProjectedLabel): void {
    label.element.remove();
    const index = this.items.indexOf(label);
    if (index >= 0) this.items.splice(index, 1);
  }

  project(camera: THREE.Camera, width: number, height: number, topView: boolean, showNodes: boolean): void {
    for (const label of this.items) {
      if ((label.kind === 'node' || label.kind === 'antinode') && !showNodes) continue;
      this.projection.copy(label.position).project(camera);
      const x = Math.round((this.projection.x * 0.5 + 0.5) * width * 2) / 2;
      const y = Math.round((-this.projection.y * 0.5 + 0.5) * height * 2) / 2;
      const visible = this.projection.z < 1 && x > 5 && x < width - 5 && y > 5 && y < height - 5 && !(topView && label.hiddenInTopView);
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
  }

  dispose(): void {
    this.layer.remove();
    this.style.remove();
    this.items.length = 0;
  }
}
