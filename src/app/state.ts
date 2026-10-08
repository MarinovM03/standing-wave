import { FREQUENCY_MAX, FREQUENCY_MIN, getNearestMode, micAtNode, modeForAxis, type ViewMode } from '../model/acoustics';
import { MIC_CORNER, SPEAKER, SPEAKER_MIDDLE, clampMic, clampSpeaker, type Axis, type Position } from '../model/room';

export type LabState = Readonly<{
  frequency: number;
  mic: Readonly<Position>;
  speaker: Readonly<Position>;
  view: ViewMode;
  playing: boolean;
  sound: boolean;
  cinematic: boolean;
  uiHidden: boolean;
}>;

export type Preset = 1 | 2 | 3 | 4;

export const PRESETS: Readonly<Record<Preset, { axis: Axis; order: number }>> = {
  1: { axis: 'length', order: 1 },
  2: { axis: 'width', order: 1 },
  3: { axis: 'height', order: 1 },
  4: { axis: 'length', order: 2 },
};

const RESONANCE_HZ = 0.6;

export function activePreset(frequency: number): Preset | null {
  const mode = getNearestMode(frequency);
  if (Math.abs(frequency - mode.frequency) >= RESONANCE_HZ) return null;
  for (const preset of [1, 2, 3, 4] as const) {
    if (PRESETS[preset].axis === mode.axis && PRESETS[preset].order === mode.order) return preset;
  }
  return null;
}

export const INITIAL_STATE: LabState = {
  frequency: modeForAxis('length').frequency,
  mic: { x: 4.9, y: 1.2, z: 2.75 },
  speaker: SPEAKER,
  view: 'physics',
  playing: false,
  sound: true,
  cinematic: false,
  uiHidden: false,
};

export type Action =
  | { type: 'setFrequency'; frequency: number }
  | { type: 'preset'; preset: Preset }
  | { type: 'setView'; view: ViewMode }
  | { type: 'toggleView' }
  | { type: 'togglePlay' }
  | { type: 'stopNote' }
  | { type: 'toggleSound' }
  | { type: 'soundFailed' }
  | { type: 'toggleCinematic' }
  | { type: 'leaveCinematic' }
  | { type: 'toggleUI' }
  | { type: 'showUI' }
  | { type: 'reset' }
  | { type: 'fullReset' }
  | { type: 'nudgeMic'; dx: number; dz: number }
  | { type: 'setMicHeight'; y: number }
  | { type: 'moveMic'; position: Position }
  | { type: 'moveSpeaker'; position: Position }
  | { type: 'micToNode' }
  | { type: 'micToCorner' }
  | { type: 'speakerToMiddle' };

function experiment(state: LabState): LabState {
  const { frequency, mic, speaker, view, cinematic } = INITIAL_STATE;
  return { ...state, frequency, mic, speaker, view, cinematic };
}

export function transition(state: LabState, action: Action): LabState {
  switch (action.type) {
    case 'setFrequency':
      if (!Number.isFinite(action.frequency)) return state;
      return { ...state, frequency: Math.min(FREQUENCY_MAX, Math.max(FREQUENCY_MIN, action.frequency)) };
    case 'preset': {
      const { axis, order } = PRESETS[action.preset];
      return { ...state, frequency: modeForAxis(axis, order).frequency, view: 'physics' };
    }
    case 'setView':
      return { ...state, view: action.view };
    case 'toggleView':
      return { ...state, view: state.view === 'physics' ? 'belief' : 'physics' };
    case 'togglePlay':
      return { ...state, playing: !state.playing };
    case 'stopNote':
      return { ...state, playing: false };
    case 'toggleSound':
      return { ...state, sound: !state.sound };
    case 'soundFailed':
      return { ...state, sound: false };
    case 'toggleCinematic':
      return { ...state, cinematic: !state.cinematic };
    case 'leaveCinematic':
      return { ...state, cinematic: false };
    case 'toggleUI':
      return { ...state, uiHidden: !state.uiHidden };
    case 'showUI':
      return { ...state, uiHidden: false };
    case 'reset':
      return experiment(state);
    case 'fullReset':
      return { ...experiment(state), playing: false, uiHidden: false };
    case 'nudgeMic':
      return { ...state, mic: clampMic({ ...state.mic, x: state.mic.x + action.dx, z: state.mic.z + action.dz }) };
    case 'setMicHeight':
      return Number.isFinite(action.y) ? { ...state, mic: clampMic({ ...state.mic, y: action.y }) } : state;
    case 'moveMic':
      return { ...state, mic: clampMic(action.position) };
    case 'moveSpeaker':
      return { ...state, speaker: clampSpeaker(action.position) };
    case 'micToNode':
      return { ...state, view: 'physics', mic: micAtNode(getNearestMode(state.frequency), state.mic) };
    case 'micToCorner':
      return { ...state, mic: MIC_CORNER };
    case 'speakerToMiddle':
      return { ...state, speaker: SPEAKER_MIDDLE };
  }
}
