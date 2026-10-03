import type { Position } from '../model/room';
import type { Mode, ViewMode } from '../model/acoustics';
import { experimentMarkup } from './template';

type InterfaceState = Readonly<{
  frequency: number;
  mic: Readonly<Position>;
  view: ViewMode;
  playing: boolean;
  cinematic: boolean;
  sound: boolean;
}>;

type Readings = Readonly<{
  mode: Mode;
  amplitude: number;
  db: number;
  wavelength: number;
}>;

export function createExperimentView(root: HTMLElement) {
  root.innerHTML = experimentMarkup;

  function element<T extends HTMLElement = HTMLElement>(id: string): T {
    const found = root.querySelector<T>(`#${id}`);
    if (!found) throw new Error(`Missing interface element: ${id}`);
    return found;
  }

  const controls = {
    frequencyRange: element<HTMLInputElement>('frequency'),
    frequencyNumber: element<HTMLInputElement>('frequency-number'),
    heightRange: element<HTMLInputElement>('height'),
    modeButtons: root.querySelectorAll<HTMLButtonElement>('[data-axis]'),
    belief: element<HTMLButtonElement>('belief-button'),
    physics: element<HTMLButtonElement>('physics-button'),
    quiet: element<HTMLButtonElement>('quiet-button'),
    peak: element<HTMLButtonElement>('peak-button'),
    sound: element<HTMLButtonElement>('sound-button'),
    play: element<HTMLButtonElement>('play'),
    camera: element<HTMLButtonElement>('camera-button'),
    speakerMiddle: element<HTMLButtonElement>('speaker-middle'),
    reset: element<HTMLButtonElement>('reset-button'),
    restore: element<HTMLButtonElement>('restore-ui'),
    how: element<HTMLButtonElement>('how-button'),
    dialog: element<HTMLDialogElement>('how-dialog'),
    scene: element('scene'),
  };
  const display = {
    wavelength: element('wavelength'),
    level: element('level-db'),
    levelFill: element('level-fill'),
    levelStatus: element('level-status'),
    meter: root.querySelector<HTMLElement>('.level-meter')!,
    listenerCard: root.querySelector<HTMLElement>('.listener-card')!,
    position: element('position-readout'),
    height: element('height-value'),
    indices: element('mode-indices'),
    modeName: element('mode-name'),
    modeDescription: element('mode-description'),
    resonance: element('resonance-state'),
    comparison: element('comparison-caption'),
    fieldLow: element('field-low-label'),
    fieldHigh: element('field-high-label'),
    fieldDescription: element('pressure-legend-description'),
    pressureSummary: element('pressure-summary'),
    sound: element('sound-label'),
    drag: element('drag-status'),
    toast: element('toast'),
  };
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let pressureTimer: ReturnType<typeof setTimeout> | undefined;
  let pressureKey = '';

  function render(state: InterfaceState, readings: Readings, soundPending: boolean) {
    const { mode, amplitude, db, wavelength } = readings;
    const { frequencyRange, frequencyNumber, heightRange } = controls;
    frequencyRange.value = String(state.frequency);
    if (document.activeElement !== frequencyNumber) frequencyNumber.value = state.frequency.toFixed(1);
    frequencyRange.style.setProperty('--progress', `${(state.frequency - 25) / 175 * 100}%`);
    display.wavelength.textContent = wavelength.toFixed(2);
    display.level.textContent = db > -0.05 ? '0.0' : db.toFixed(1).replace('-', '−');
    display.levelFill.style.width = `${Math.max(0, (db + 40) / 40 * 100)}%`;
    display.meter.setAttribute('aria-valuenow', db.toFixed(1));

    const quiet = amplitude < 0.13;
    display.levelStatus.textContent = state.view === 'belief'
      ? quiet ? 'FAR FROM SOURCE' : amplitude > .72 ? 'NEAR SOURCE' : 'DISTANCE FALLOFF'
      : quiet ? 'QUIET SPOT' : amplitude > .72 ? 'PRESSURE PEAK' : 'BETWEEN PEAKS';
    display.levelStatus.classList.toggle('quiet', quiet);
    display.listenerCard.dataset.pressure = quiet ? 'quiet' : amplitude > .72 ? 'hot' : 'mid';
    display.meter.setAttribute('aria-valuetext', `${db.toFixed(1)} decibels relative; ${display.levelStatus.textContent.toLowerCase()}`);
    display.listenerCard.style.setProperty('--amplitude', amplitude.toFixed(3));
    display.position.textContent = `${state.mic.x.toFixed(1)} / ${state.mic.z.toFixed(1)} / ${state.mic.y.toFixed(1)} m`;
    heightRange.value = String(state.mic.y);
    display.height.textContent = `${state.mic.y.toFixed(2)} m`;

    display.indices.textContent = `(${mode.indices.join(', ')})`;
    display.modeName.textContent = `${mode.axis[0].toUpperCase() + mode.axis.slice(1)} · ${mode.frequency.toFixed(1)} Hz`;
    const onResonance = Math.abs(state.frequency - mode.frequency) < .6;
    display.resonance.textContent = state.view === 'belief'
      ? 'DISTANCE ONLY'
      : onResonance ? 'ON RESONANCE' : `${Math.abs(state.frequency - mode.frequency).toFixed(1)} Hz FROM MODE`;
    display.resonance.classList.toggle('detuned', !onResonance || state.view === 'belief');
    display.modeDescription.textContent = state.view === 'belief'
      ? 'Distance falloff · no reflections'
      : `${mode.order === 1 ? 'Fundamental' : `Order ${mode.order}`} · ${mode.axis}`;
    controls.modeButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(mode.axis === button.dataset.axis && mode.order === 1 && onResonance));
    });

    controls.physics.setAttribute('aria-pressed', String(state.view === 'physics'));
    controls.belief.setAttribute('aria-pressed', String(state.view === 'belief'));
    display.comparison.textContent = state.view === 'belief'
      ? 'The speaker fades with distance.'
      : onResonance ? 'Same note. Loud peaks. Quiet nodes.' : 'Away from resonance, the pattern fades.';
    document.body.classList.toggle('belief-view', state.view === 'belief');
    display.fieldLow.textContent = state.view === 'belief' ? 'Far' : 'Node';
    display.fieldHigh.textContent = state.view === 'belief' ? 'Near' : 'Antinode';
    const fieldDescription = state.view === 'belief'
      ? 'Farther from the speaker is quieter; closer is louder. This view has no room interference.'
      : 'Nodes are quiet planes; antinodes are pressure peaks. A quiet reading can also result from tuning away from a mode.';
    if (display.fieldDescription.textContent !== fieldDescription) display.fieldDescription.textContent = fieldDescription;

    const nextPressureKey = `${state.view}:${state.view === 'physics' ? mode.indices.join(',') : ''}:${display.listenerCard.dataset.pressure}`;
    if (nextPressureKey !== pressureKey) {
      pressureKey = nextPressureKey;
      clearTimeout(pressureTimer);
      const summary = state.view === 'belief'
        ? `Speaker only. Level falls with distance. Listener: ${display.levelStatus.textContent.toLowerCase()}.`
        : `Room interference. Nearest ${mode.axis} mode (${mode.indices.join(', ')}), ${mode.frequency.toFixed(1)} hertz. Listener: ${display.levelStatus.textContent.toLowerCase()}.`;
      // Announce settled changes of meaning, not every sample during a drag or scrub.
      pressureTimer = setTimeout(() => {
        if (display.pressureSummary.textContent !== summary) display.pressureSummary.textContent = summary;
      }, 180);
    }

    controls.sound.setAttribute('aria-pressed', String(state.sound));
    controls.sound.setAttribute('aria-busy', String(soundPending));
    display.sound.textContent = soundPending ? 'Starting sound…' : state.sound ? 'Sound on' : 'Sound off';
    controls.sound.setAttribute('aria-label', soundPending ? 'Starting sound…' : state.sound ? 'Sound on. Mute sound' : 'Sound off. Enable sound');
    controls.sound.title = soundPending ? 'Starting sound…' : state.sound ? 'Mute sound' : 'Enable sound';
    controls.play.setAttribute('aria-pressed', String(state.playing));
    const playAction = state.playing ? 'Stop note' : 'Play note';
    controls.play.setAttribute('aria-label', playAction);
    controls.play.title = `${playAction} · Space`;
    controls.play.textContent = state.playing ? '■' : '▷';
    controls.camera.setAttribute('aria-pressed', String(state.cinematic));
  }

  function setHidden(hidden: boolean) {
    document.body.classList.toggle('ui-hidden', hidden);
    controls.restore.hidden = !hidden;
  }

  function setDragging(dragging: boolean) {
    document.body.classList.toggle('dragging-mic', dragging);
    display.drag.textContent = dragging ? 'MOVING MIC' : 'DRAG MIC TO MOVE';
  }

  function toast(message: string) {
    display.toast.textContent = message;
    display.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => display.toast.classList.remove('visible'), 3200);
  }

  function showRendererFallback() {
    controls.scene.innerHTML = `<div class="webgl-fallback"><strong>This room needs WebGL.</strong><p>Enable hardware acceleration or open a browser with WebGL support. The frequency and listener controls still work.</p></div>`;
  }

  function dispose() {
    clearTimeout(toastTimer);
    clearTimeout(pressureTimer);
    document.body.classList.remove('belief-view', 'ui-hidden', 'dragging-mic');
    root.replaceChildren();
  }

  return { controls, render, setHidden, setDragging, toast, showRendererFallback, dispose };
}
