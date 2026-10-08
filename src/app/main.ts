import { Stage } from '../scene/stage';
import type { ScreenRect } from '../scene/anchors';
import { COORDINATE } from '../model/room';
import { antinodePlanes, coupling, getNearestMode, halfWavelength, nodePlanes, relativeDb, sampleField, wavelength, type Mode } from '../model/acoustics';
import { createActions } from '../ui/actions';
import { createAnnouncer } from '../ui/announcer';
import { createCallouts } from '../ui/callouts';
import { PAGE, TOASTS } from '../ui/copy';
import { createDock } from '../ui/dock';
import { createHelp } from '../ui/help';
import { createLayout } from '../ui/layout';
import { adoptTitleBlock } from '../ui/title';
import { createToast } from '../ui/toast';
import { NoteAudio, type AudioFailure, type AudioStatus } from './audio';
import { keyCommand, type KeyCommand, type KeyFocus } from './keys';
import { shareLink } from './share';
import { INITIAL_STATE, activePreset, transition, type Action, type LabState } from './state';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const CLEARANCE = 8;

let state: LabState = INITIAL_STATE;
let audioStatus: AudioStatus = 'off';
let toneAnnounced = false;

const title = adoptTitleBlock();
const toast = createToast();
const help = createHelp();
const actions = createActions({
  sound: () => dispatch({ type: 'toggleSound' }),
  cinematic: () => toggleCinematic(),
  share: () => void share(),
  help: () => help.open(),
});
const dock = createDock({
  view: view => dispatch({ type: 'setView', view }),
  frequency: frequency => dispatch({ type: 'setFrequency', frequency }),
  play: () => dispatch({ type: 'togglePlay' }),
  preset: preset => dispatch({ type: 'preset', preset }),
  micHeight: y => dispatch({ type: 'setMicHeight', y }),
  micNode: () => dispatch({ type: 'micToNode' }),
  micCorner: () => dispatch({ type: 'micToCorner' }),
  speakerMiddle: () => dispatch({ type: 'speakerToMiddle' }),
});
const layout = createLayout(document.querySelector<HTMLDivElement>('#app')!, {
  title: title.element, actions: actions.element, dock: dock.element, toast: toast.element, dialog: help.element,
});
const announcer = createAnnouncer(layout.stage);
const callouts = createCallouts(layout.scene);
const audio = new NoteAudio();
const events = new AbortController();
let room: Stage | undefined;

function calloutReadings(mode: Mode, amplitude: number) {
  const { mic, speaker, frequency } = state;
  const antinode = { ...mic, [COORDINATE[mode.axis]]: antinodePlanes(mode).at(-1)! };
  return {
    amplitude,
    micDb: relativeDb(amplitude),
    speaker: coupling(speaker, mode),
    node: nodePlanes(mode)[0],
    antinodeDb: relativeDb(sampleField(antinode, frequency, 'physics', mode, speaker)),
    half: halfWavelength(mode),
    distance: Math.hypot(mic.x - speaker.x, mic.y - speaker.y, mic.z - speaker.z),
    positions: { mic, speaker },
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
  dock.render({ view: state.view, frequency: state.frequency, micHeight: state.mic.y, playing: state.playing, preset: activePreset(state.frequency) });
  actions.render({ sound: state.sound, soundPending: audioStatus === 'starting', cinematic: state.cinematic });
  title.setReadings({ view: state.view, frequency: state.frequency, wavelength: wavelength(state.frequency), indices: mode.indices, db });
  announcer.update(state.view, mode, amplitude);
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
  layout.setHidden(state.uiHidden);
}

function reset(full: boolean) {
  const wasCinematic = state.cinematic;
  dispatch({ type: full ? 'fullReset' : 'reset' });
  if (wasCinematic) room?.setCinematic(false);
  room?.resetCamera();
  if (full) {
    layout.setHidden(state.uiHidden);
    help.close();
  }
  toast.show(full ? TOASTS.fullReset : TOASTS.reset);
}

async function share() {
  const url = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? location.href;
  const result = await shareLink({ title: PAGE.title, text: PAGE.description, url });
  if (result === 'copied') toast.show(TOASTS.copied);
  else if (result === 'failed') toast.show(TOASTS.copyFailed);
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
    case 'help': return help.open();
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

function interfaceRects(): ScreenRect[] {
  const origin = layout.scene.getBoundingClientRect();
  return [title.element, dock.element, actions.element].flatMap(target => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return [];
    return [{
      left: rect.left - origin.left - CLEARANCE,
      top: rect.top - origin.top - CLEARANCE,
      right: rect.right - origin.left + CLEARANCE,
      bottom: rect.bottom - origin.top + CLEARANCE,
    }];
  });
}

let insetsKey = '';

function updateInsets() {
  const rects = interfaceRects();
  const key = rects.map(rect => [rect.left, rect.top, rect.right, rect.bottom].map(Math.round).join(',')).join(';');
  if (key === insetsKey) return;
  insetsKey = key;
  room?.setInsets(rects);
  callouts.setObstacles(rects);
}

audio.onStatusChange = status => {
  audioStatus = status;
  if (status === 'on' && !toneAnnounced) {
    toneAnnounced = true;
    toast.show(TOASTS.toneOn);
  }
  update();
};
audio.onFailure = (failure: AudioFailure) => {
  dispatch({ type: 'soundFailed' });
  toast.show(failure === 'blocked' ? TOASTS.blocked : TOASTS.interrupted);
};

layout.restore.addEventListener('click', () => setUIHidden({ type: 'showUI' }), { signal: events.signal });
document.addEventListener('keydown', event => {
  const command = keyCommand(event, { focus: keyFocus(event.target), dialogOpen: help.isOpen() });
  if (!command) return;
  event.preventDefault();
  run(command);
}, { signal: events.signal });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.playing) dispatch({ type: 'stopNote' });
}, { signal: events.signal });

update();
try {
  room = new Stage(layout.scene, stageState(sampleField(state.mic, state.frequency, state.view, undefined, state.speaker)), {
    onMicMove: position => dispatch({ type: 'moveMic', position }),
    onSpeakerMove: position => dispatch({ type: 'moveSpeaker', position }),
    onDragChange: target => layout.setDragging(target),
    onCameraInteraction: () => {
      if (state.cinematic) dispatch({ type: 'leaveCinematic' });
    },
    onFrame: callouts.place,
  });
  update();
} catch (error) {
  console.error('Unable to initialize the room renderer', error);
  layout.showRendererFallback();
}

const interfaceObserver = new ResizeObserver(updateInsets);
for (const target of [layout.scene, title.element, dock.element, actions.element]) interfaceObserver.observe(target);

if (import.meta.hot) import.meta.hot.dispose(() => {
  events.abort();
  interfaceObserver.disconnect();
  audio.onStatusChange = undefined;
  audio.onFailure = undefined;
  room?.dispose();
  callouts.dispose();
  announcer.dispose();
  audio.dispose();
  title.dispose();
  dock.dispose();
  actions.dispose();
  toast.dispose();
  help.dispose();
  layout.dispose();
});
