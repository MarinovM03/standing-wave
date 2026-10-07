import { Stage } from '../scene/stage';
import { COORDINATE, type Axis } from '../model/room';
import { antinodePlanes, coupling, getNearestMode, halfWavelength, nodePlanes, relativeDb, sampleField, wavelength, type Mode } from '../model/acoustics';
import { createCallouts } from '../ui/callouts';
import { adoptTitleBlock } from '../ui/title';
import { createExperimentView } from '../ui/view';
import { NoteAudio, type AudioFailure, type AudioStatus } from './audio';
import { keyCommand, type KeyCommand, type KeyFocus } from './keys';
import { INITIAL_STATE, transition, type Action, type LabState, type Preset } from './state';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const AXIS_PRESETS: Record<Axis, Preset> = { length: 1, width: 2, height: 3 };

let state: LabState = INITIAL_STATE;
let audioStatus: AudioStatus = 'off';
let toneAnnounced = false;

const view = createExperimentView(document.querySelector<HTMLDivElement>('#app')!);
const { controls } = view;
const title = adoptTitleBlock();
controls.scene.before(title.element);
const audio = new NoteAudio();
const callouts = createCallouts(controls.scene);
const events = new AbortController();
let room: Stage | undefined;

function calloutReadings(mode: Mode, amplitude: number) {
  const { mic, speaker, frequency } = state;
  const antinode = { ...mic, [COORDINATE[mode.axis]]: antinodePlanes(mode).at(-1)! };
  return {
    amplitude,
    micDb: relativeDb(amplitude),
    speaker: state.view === 'belief' ? 1 : coupling(speaker, mode),
    node: nodePlanes(mode)[0],
    antinodeDb: relativeDb(sampleField(antinode, frequency, 'physics', mode, speaker)),
    half: halfWavelength(mode),
    distance: Math.hypot(mic.x - speaker.x, mic.y - speaker.y, mic.z - speaker.z),
  };
}

function stageState(amplitude: number) {
  const { frequency, mic, speaker, playing } = state;
  return { frequency, mic, speaker, view: state.view, swing: playing && !reducedMotion.matches, level: amplitude };
}

function update() {
  const mode = getNearestMode(state.frequency);
  const amplitude = sampleField(state.mic, state.frequency, state.view, mode, state.speaker);
  const db = relativeDb(amplitude);
  const waveLength = wavelength(state.frequency);
  view.render(state, { mode, amplitude, db, wavelength: waveLength }, audioStatus === 'starting');
  title.setReadings({ view: state.view, frequency: state.frequency, wavelength: waveLength, indices: mode.indices, db });
  callouts.setReadings(state.view, calloutReadings(mode, amplitude));
  audio.update(state.frequency, amplitude);
  room?.setState(stageState(amplitude));
}

function dispatch(action: Action) {
  state = transition(state, action);
  // Runs inside the gesture that changed the state, so the browser lets the note start.
  if (state.playing && state.sound) audio.start();
  else audio.stop();
  update();
}

function toggleCinematic() {
  dispatch({ type: 'toggleCinematic' });
  room?.setCinematic(state.cinematic);
}

function setUIHidden(action: Action) {
  dispatch(action);
  view.setHidden(state.uiHidden);
}

function reset(full: boolean) {
  const wasCinematic = state.cinematic;
  dispatch({ type: full ? 'fullReset' : 'reset' });
  if (wasCinematic) room?.setCinematic(false);
  room?.resetCamera();
  if (full) {
    view.setHidden(state.uiHidden);
    if (controls.dialog.open) controls.dialog.close();
  }
  view.toast(full ? 'Full reset' : 'Experiment reset');
}

function openHelp() {
  if (!controls.dialog.open) controls.dialog.showModal();
}

function run(command: KeyCommand) {
  switch (command.type) {
    case 'play': return dispatch({ type: 'togglePlay' });
    case 'preset': return dispatch({ type: 'preset', preset: command.preset });
    case 'toggleView': return dispatch({ type: 'toggleView' });
    case 'cinematic': return toggleCinematic();
    case 'reset': return reset(false);
    case 'fullReset': return reset(true);
    case 'sound': return dispatch({ type: 'toggleSound' });
    case 'help': return openHelp();
    case 'hideUI': return setUIHidden({ type: 'toggleUI' });
    case 'escape': return setUIHidden({ type: 'showUI' });
    case 'moveMic': return dispatch({ type: 'nudgeMic', dx: command.dx, dz: command.dz });
  }
}

function keyFocus(target: EventTarget | null): KeyFocus {
  if (!(target instanceof HTMLElement)) return 'other';
  if (target.matches('input[type="range"]')) return 'range';
  if (target.matches('button, summary, [role="button"], input:is([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"])')) return 'button';
  if (target.isContentEditable || target.matches('input, textarea, select')) return 'text';
  return 'other';
}

audio.onStatusChange = status => {
  audioStatus = status;
  if (status === 'on' && !toneAnnounced) {
    toneAnnounced = true;
    view.toast('Tone on · Start with a low device volume');
  }
  update();
};
audio.onFailure = (failure: AudioFailure) => {
  dispatch({ type: 'soundFailed' });
  view.toast(failure === 'blocked'
    ? 'Audio could not start. Your browser may have blocked it.'
    : 'The browser paused the sound. Press M to turn it back on.');
};

controls.frequencyRange.addEventListener('input', () => dispatch({ type: 'setFrequency', frequency: Number(controls.frequencyRange.value) }));
controls.frequencyNumber.addEventListener('change', () => {
  dispatch({ type: 'setFrequency', frequency: Number(controls.frequencyNumber.value) });
  controls.frequencyNumber.value = state.frequency.toFixed(1);
});
controls.frequencyNumber.addEventListener('blur', () => {
  controls.frequencyNumber.value = state.frequency.toFixed(1);
});
controls.heightRange.addEventListener('input', () => dispatch({ type: 'setMicHeight', y: Number(controls.heightRange.value) }));
controls.modeButtons.forEach(button => {
  button.addEventListener('click', () => dispatch({ type: 'preset', preset: AXIS_PRESETS[button.dataset.axis as Axis] }));
});
controls.belief.addEventListener('click', () => dispatch({ type: 'setView', view: 'belief' }));
controls.physics.addEventListener('click', () => dispatch({ type: 'setView', view: 'physics' }));
controls.quiet.addEventListener('click', () => dispatch({ type: 'micToNode' }));
controls.peak.addEventListener('click', () => dispatch({ type: 'micToCorner' }));
controls.sound.addEventListener('click', () => dispatch({ type: 'toggleSound' }));
controls.play.addEventListener('click', () => dispatch({ type: 'togglePlay' }));
controls.camera.addEventListener('click', toggleCinematic);
controls.speakerMiddle.addEventListener('click', () => dispatch({ type: 'speakerToMiddle' }));
controls.reset.addEventListener('click', () => reset(false));
controls.restore.addEventListener('click', () => setUIHidden({ type: 'toggleUI' }));
controls.how.addEventListener('click', openHelp);
controls.dialog.addEventListener('click', event => {
  if (event.target !== controls.dialog) return;
  const box = controls.dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
    controls.dialog.close();
  }
});

document.addEventListener('keydown', event => {
  const command = keyCommand(event, { focus: keyFocus(event.target), dialogOpen: controls.dialog.open });
  if (!command) return;
  event.preventDefault();
  run(command);
}, { signal: events.signal });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.playing) dispatch({ type: 'stopNote' });
}, { signal: events.signal });

update();
try {
  room = new Stage(controls.scene, stageState(sampleField(state.mic, state.frequency, state.view, undefined, state.speaker)), {
    onMicMove: position => dispatch({ type: 'moveMic', position }),
    onSpeakerMove: position => dispatch({ type: 'moveSpeaker', position }),
    onDragChange: target => view.setDragging(target === 'mic'),
    onCameraInteraction: () => {
      if (state.cinematic) dispatch({ type: 'leaveCinematic' });
    },
    onFrame: callouts.place,
  });
  update();
} catch (error) {
  console.error('Unable to initialize the room renderer', error);
  view.showRendererFallback();
}

if (import.meta.hot) import.meta.hot.dispose(() => {
  events.abort();
  audio.onStatusChange = undefined;
  audio.onFailure = undefined;
  room?.dispose();
  callouts.dispose();
  audio.dispose();
  title.dispose();
  view.dispose();
});
