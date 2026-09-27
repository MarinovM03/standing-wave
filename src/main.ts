import { RoomScene } from './scene';
import { ToneAudio } from './audio';
import { ROOM, getNearestMode, modeForAxis, sampleField, relativeDb, wavelength } from './acoustics';
import type { Axis, Position, ViewMode } from './acoustics';
import { createExperimentView } from './ui/view';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const initialFrequency = 343 / (2 * ROOM.length);
const initialListener: Position = { x: 4.9, y: 1.2, z: 2.75 };
const state = {
  frequency: initialFrequency,
  listener: { ...initialListener },
  view: 'physics' as ViewMode,
  showNodes: true,
  animate: !reducedMotion.matches,
  cinematic: false,
  topView: false,
  sound: false,
  hidden: false,
};

const view = createExperimentView(document.querySelector<HTMLDivElement>('#app')!);
const { controls } = view;
const sound = new ToneAudio();
const events = new AbortController();
let room: RoomScene | undefined;
let soundPending = false;
let disposed = false;

function update() {
  const mode = getNearestMode(state.frequency);
  const amplitude = sampleField(state.listener, state.frequency, state.view, mode);
  view.render(state, { mode, amplitude, db: relativeDb(amplitude), wavelength: wavelength(state.frequency) }, soundPending);
  sound.update(state.frequency, amplitude);
  room?.setState(state);
}

function setFrequency(value: number) {
  if (!Number.isFinite(value)) return;
  state.frequency = Math.min(200, Math.max(25, value));
  update();
}

function selectMode(axis: Axis, order = 1) {
  state.frequency = modeForAxis(axis, order).frequency;
  state.view = 'physics';
  update();
}

function reset() {
  Object.assign(state, {
    frequency: initialFrequency,
    listener: { ...initialListener },
    view: 'physics',
    showNodes: true,
    animate: !reducedMotion.matches,
    cinematic: false,
    topView: false,
  });
  room?.setCinematic(false);
  room?.resetCamera();
  update();
  view.toast('Experiment reset');
}

function toggleCinematic() {
  state.cinematic = !state.cinematic;
  state.topView = false;
  room?.setCinematic(state.cinematic);
  update();
}

function toggleUI() {
  state.hidden = !state.hidden;
  view.setHidden(state.hidden);
}

controls.frequencyRange.addEventListener('input', () => setFrequency(Number(controls.frequencyRange.value)));
controls.frequencyNumber.addEventListener('change', () => {
  setFrequency(Number(controls.frequencyNumber.value));
  controls.frequencyNumber.value = state.frequency.toFixed(1);
});
controls.frequencyNumber.addEventListener('blur', () => {
  controls.frequencyNumber.value = state.frequency.toFixed(1);
});
controls.heightRange.addEventListener('input', () => {
  state.listener.y = Number(controls.heightRange.value);
  update();
});
controls.modeButtons.forEach(button => {
  button.addEventListener('click', () => selectMode(button.dataset.axis as Axis));
});
controls.belief.addEventListener('click', () => {
  state.view = 'belief';
  update();
});
controls.physics.addEventListener('click', () => {
  state.view = 'physics';
  update();
});
controls.quiet.addEventListener('click', () => {
  const mode = getNearestMode(state.frequency);
  state.view = 'physics';
  const dimension = ROOM[mode.axis];
  state.listener[mode.axis === 'length' ? 'x' : mode.axis === 'width' ? 'z' : 'y'] = dimension / (2 * mode.order);
  update();
});
controls.peak.addEventListener('click', () => {
  state.listener = { x: ROOM.length - .08, y: .08, z: ROOM.width - .08 };
  update();
});
controls.sound.addEventListener('click', async () => {
  if (soundPending) return;
  if (state.sound) {
    sound.disable();
    return;
  }
  soundPending = true;
  update();
  const enabled = await sound.enable();
  if (disposed) return;
  soundPending = false;
  update();
  view.toast(enabled ? 'Tone on · Start with a low device volume' : 'Audio could not start. Your browser may have blocked it.');
});
sound.onStateChange = enabled => {
  state.sound = enabled;
  update();
};
controls.nodes.addEventListener('click', () => {
  state.showNodes = !state.showNodes;
  update();
});
controls.motion.addEventListener('click', () => {
  state.animate = !state.animate;
  update();
});
controls.camera.addEventListener('click', toggleCinematic);
controls.top.addEventListener('click', () => {
  state.topView = !state.topView;
  state.cinematic = false;
  room?.setTopView(state.topView);
  update();
});
controls.reset.addEventListener('click', reset);
controls.restore.addEventListener('click', toggleUI);
controls.how.addEventListener('click', () => controls.dialog.showModal());
controls.dialog.addEventListener('click', event => {
  if (event.target !== controls.dialog) return;
  const box = controls.dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
    controls.dialog.close();
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (state.hidden) toggleUI();
    return;
  }
  if (controls.dialog.open || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target as HTMLElement;
  if (target.matches('input:not([type="range"]), textarea, select, [contenteditable="true"]')) return;
  // Range controls own their adjustment keys, but keep the explorer shortcuts usable.
  if (target.matches('input[type="range"]') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const step = event.shiftKey ? .4 : .1;
    if (event.key === 'ArrowLeft') state.listener.x = Math.max(.08, state.listener.x - step);
    if (event.key === 'ArrowRight') state.listener.x = Math.min(ROOM.length - .08, state.listener.x + step);
    if (event.key === 'ArrowUp') state.listener.z = Math.max(.08, state.listener.z - step);
    if (event.key === 'ArrowDown') state.listener.z = Math.min(ROOM.width - .08, state.listener.z + step);
    update();
    return;
  }
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if (key === '/') {
    event.preventDefault();
    toggleUI();
  } else if (key === 'r') reset();
  else if (key === 'c') toggleCinematic();
  else if (key === '1') selectMode('length');
  else if (key === '2') selectMode('width');
  else if (key === '3') selectMode('height');
  else if (key === '4') selectMode('length', 2);
}, { signal: events.signal });

update();
try {
  room = new RoomScene(controls.scene, position => {
    state.listener = { ...position };
    update();
  });
  room.onCameraInteraction = () => {
    if (state.cinematic || state.topView) {
      state.cinematic = false;
      state.topView = false;
      update();
    }
  };
  room.onListenerDragChange = view.setDragging;
  update();
} catch (error) {
  console.error('Unable to initialize the room renderer', error);
  view.showRendererFallback();
}

if (import.meta.hot) import.meta.hot.dispose(() => {
  disposed = true;
  events.abort();
  sound.onStateChange = undefined;
  if (room) {
    room.onCameraInteraction = undefined;
    room.onListenerDragChange = undefined;
    room.dispose();
  }
  sound.dispose();
  view.dispose();
});
