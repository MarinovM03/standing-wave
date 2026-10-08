import { KEYS, STAGE } from './copy';
import { element } from './dom';

export type LayoutParts = Readonly<{
  title: HTMLElement;
  actions: HTMLElement;
  dock: HTMLElement;
  toast: HTMLElement;
  dialog: HTMLElement;
}>;

function setDragging(target: 'mic' | 'speaker' | null) {
  document.body.classList.toggle('dragging-mic', target === 'mic');
  document.body.classList.toggle('dragging-speaker', target === 'speaker');
}

// DOM order is the tab order: the top-right buttons, then the room, then the dock.
export function createLayout(root: HTMLElement, parts: LayoutParts) {
  const scene = element('div', { id: 'scene', class: 'stage__scene' });
  const instructions = element('p', { id: 'room-instructions', class: 'sr-only' }, STAGE.instructions);
  const dockArea = element('div', { class: 'dock-area' }, parts.toast, parts.dock);
  const stage = element('main', { class: 'stage', 'aria-label': STAGE.label }, parts.title, parts.actions, scene, instructions, dockArea);
  const restore = element('button', { id: 'restore-ui', class: 'restore glass', type: 'button', hidden: true, 'aria-keyshortcuts': KEYS.hide },
    STAGE.restore, element('kbd', { class: 'key', 'aria-hidden': 'true' }, KEYS.hide));
  root.append(stage, restore, parts.dialog);

  function setHidden(hidden: boolean) {
    document.body.classList.toggle('ui-hidden', hidden);
    restore.hidden = !hidden;
  }

  function showRendererFallback() {
    scene.replaceChildren(element('div', { class: 'webgl-fallback glass' }, element('strong', {}, STAGE.noWebGL), element('p', {}, STAGE.noWebGLHelp)));
  }

  function dispose() {
    document.body.classList.remove('ui-hidden', 'dragging-mic', 'dragging-speaker');
    root.replaceChildren();
  }

  return { stage, scene, restore, setHidden, setDragging, showRendererFallback, dispose };
}
