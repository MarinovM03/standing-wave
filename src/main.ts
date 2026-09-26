import './style.css';
import { RoomScene } from './scene';
import { ToneAudio } from './audio';
import { ROOM, getNearestMode, modeForAxis, sampleField, relativeDb, wavelength } from './acoustics';
import type { Axis, Position, ViewMode } from './acoustics';

const waveIcon = `<svg viewBox="0 0 36 28" fill="none" aria-hidden="true"><path d="M2 14C7-2 12-2 18 14S29 30 34 14M2 14C7 30 12 30 18 14S29-2 34 14" stroke="currentColor" stroke-width="1.6"/><path d="M2 14h32" stroke="currentColor" stroke-width=".6" opacity=".4"/></svg>`;
const soundIcon = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 8h3l4-4v12l-4-4H3V8Z" stroke="currentColor" stroke-width="1.3"/><path d="M13 7c2 1.5 2 4.5 0 6m2-9c4 3 4 9 0 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
const cameraIcon = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 6h3l1-2h6l1 2h3v10H3V6Z" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="10.5" r="3" stroke="currentColor" stroke-width="1.2"/></svg>`;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const initialFrequency = 343 / (2 * ROOM.length);
const initialListener: Position = { x: 4.9, y: 1.2, z: 2.75 };
const state = { frequency: initialFrequency, listener: { ...initialListener }, view: 'physics' as ViewMode, showNodes: true, animate: !reducedMotion.matches, cinematic: false, topView: false, sound: false, hidden: false };

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="experience">
    <header class="masthead interface">
      <a class="brand" href="./" aria-label="Standing Wave home">${waveIcon}<span>Standing Wave<span class="brand-period">.</span></span></a>
      <span class="lab-title">SMALL EXPERIMENTS. INVISIBLE THINGS.</span>
      <div class="header-actions"><span class="edition"><i></i> LAB 001</span><button class="text-button" id="how-button">How it works <span>↗</span></button></div>
    </header>

    <main class="stage" aria-label="Interactive room mode experiment">
      <div id="scene"></div>
      <div class="stage-vignette" aria-hidden="true"></div>
      <section class="intro interface">
        <p class="eyebrow"><span class="tiny-line"></span> THE INVISIBLE ARCHITECTURE OF SOUND</p>
        <h1>Same speaker.<br><em>Different bass.</em></h1>
        <p class="tagline play-instruction"><span>↔</span> Scrub frequency. <span>◎</span> Drag the mic.</p>
      </section>

      <section class="comparison interface" aria-label="Compare sound models">
        <div class="segmented">
          <button id="belief-button" aria-pressed="false"><span class="toggle-dot"></span><span class="comparison-label"><small>THE ASSUMPTION</small><strong>Speaker only</strong></span></button>
          <button id="physics-button" aria-pressed="true"><span class="toggle-dot"></span><span class="comparison-label"><small>THE PHYSICS</small><strong>Room interference</strong></span></button>
        </div>
        <p id="comparison-caption">Same note. Loud peaks. Quiet nodes.</p>
      </section>

      <aside class="listener-card interface" aria-label="Listener measurements" data-pressure="hot">
        <div class="card-label"><span class="mint-dot"></span> THE LISTENER <span class="live-label">LIVE</span></div>
        <div class="level-readout"><output id="level-db">−1.5</output><span>dB<span>relative</span></span></div>
        <div class="level-meter" role="meter" aria-label="Relative pressure level" aria-valuemin="-40" aria-valuemax="0" aria-valuenow="-1.5"><div id="level-fill"></div></div>
        <div class="meter-labels"><span>QUIET</span><strong id="level-status">PRESSURE PEAK</strong><span>LOUD</span></div>
        <div class="position-row"><span>POSITION</span><output id="position-readout"></output></div>
        <p class="drag-hint"><span>↔</span><span id="drag-status">DRAG MIC TO MOVE</span></p>
        <label class="height-control" for="height">EAR HEIGHT <output id="height-value">1.20 m</output></label>
        <input id="height" type="range" min="0.08" max="2.72" step="0.01" value="1.2" aria-label="Listener height in metres" />
        <div class="listener-presets"><button id="quiet-button">Find a node <span>↘</span></button><button id="peak-button">Try a corner <span>↗</span></button></div>
      </aside>

      <div class="scene-bottom interface">
        <div class="field-key"><span class="eyebrow">PRESSURE AMPLITUDE</span><div><i class="key-node"></i><span><span id="field-low-label">Node</span> <small>quiet</small></span><span class="key-gradient"></span><i class="key-peak"></i><span><span id="field-high-label">Antinode</span> <small>loud</small></span></div></div>
        <div class="scene-tools"><button id="nodes-button" class="tool-button" aria-pressed="true" title="Show node and antinode labels">Labels</button><button id="top-button" class="tool-button" aria-pressed="false" title="Look straight down into the room">Top view</button><button id="motion-button" class="icon-button" aria-label="Pause field animation" aria-pressed="false" title="Pause field animation">Ⅱ</button><button id="camera-button" class="icon-button" aria-label="Toggle cinematic camera" aria-pressed="false" title="Cinematic camera · C">${cameraIcon}</button><button id="reset-button" class="icon-button" aria-label="Reset experiment" title="Reset experiment · R">↺</button></div>
      </div>
      <div class="room-note interface"><span class="room-dot"></span>6.0 × 4.0 × 2.8 m <span>·</span> SIMPLIFIED ROOM MODES</div>
    </main>

    <section class="console interface" aria-label="Experiment controls">
      <div class="frequency-section">
        <div class="section-heading"><span class="eyebrow"><span class="section-index">01</span> SCRUB FREQUENCY</span><span class="resonance-state" id="resonance-state">ON RESONANCE</span></div>
        <div class="frequency-row"><label class="frequency-value" for="frequency-number"><input id="frequency-number" type="number" min="25" max="200" step="0.1" value="28.6" aria-label="Frequency in hertz"/><span>Hz</span></label><div class="wavelength"><span>WAVELENGTH</span><output id="wavelength">12.00</output><span class="unit">m</span><svg viewBox="0 0 76 20" fill="none" aria-hidden="true"><path d="M1 10C13-5 25-5 38 10s25 15 37 0" stroke="currentColor" stroke-width="1.2"/></svg></div></div>
        <div class="frequency-track"><input id="frequency" type="range" min="25" max="200" step="0.1" value="28.6" aria-label="Frequency"/><div class="resonance-ticks" aria-hidden="true"></div></div>
        <div class="range-labels"><span>25 Hz <small>DEEP BASS</small></span><span>↔ DRAG TO TUNE</span><span>200 Hz</span></div>
      </div>
      <div class="mode-section">
        <div class="section-heading"><span class="eyebrow"><span class="section-index">02</span> MEET A ROOM MODE</span><span class="shortcut-hint">PRESS 1–3</span></div>
        <div class="mode-buttons">
          <button data-axis="length" class="mode-button" aria-pressed="true"><span class="axis-icon">↔</span><span>Length <small>28.6 Hz</small></span><kbd>1</kbd></button>
          <button data-axis="width" class="mode-button" aria-pressed="false"><span class="axis-icon">⤢</span><span>Width <small>42.9 Hz</small></span><kbd>2</kbd></button>
          <button data-axis="height" class="mode-button" aria-pressed="false"><span class="axis-icon">↕</span><span>Height <small>61.3 Hz</small></span><kbd>3</kbd></button>
        </div>
        <div class="mode-detail"><span id="mode-indices">(1, 0, 0)</span><p id="mode-description">Fundamental · length</p></div>
        <div class="mode-meta"><span>NEAREST AXIAL MODE <strong id="mode-name">Length · 28.6 Hz</strong></span><button id="sound-button" aria-pressed="false">${soundIcon}<span id="sound-label">Enable sound</span></button></div>
      </div>
    </section>
    <footer class="footer interface"><div><span class="key-pair"><kbd>DRAG</kbd> orbit</span><span class="key-pair"><kbd>SCROLL</kbd> zoom</span><span class="key-pair"><kbd>W A S D</kbd> move</span><span class="key-pair"><kbd>C</kbd> cinematic</span><span class="key-pair"><kbd>R</kbd> reset</span><span class="key-pair"><kbd>/</kbd> hide UI</span></div><span class="footer-note">A ROOM YOU CAN LISTEN TO.</span></footer>
  </div>
  <button id="restore-ui" hidden>Show interface <kbd>/</kbd></button>
  <div id="toast" role="status" aria-live="polite"></div>
  <dialog id="how-dialog" aria-labelledby="dialog-title">
    <form method="dialog"><button class="dialog-close icon-button" aria-label="Close explanation">×</button></form>
    <p class="eyebrow">STANDING WAVE / FIELD NOTES 001</p>
    <h2 id="dialog-title">The room plays along.</h2>
    <p class="dialog-lede">The bass isn't louder in the corner because the speaker is. The room is stacking the wave. Bass bounces between walls; at certain frequencies, the returning wave lines up with the next one. Some places get a pressure peak. Others nearly cancel.</p>
    <div class="explanation-grid"><section><span>01 / WAVELENGTH</span><h3>Does the wave fit?</h3><p>At 28.6 Hz, a sound wave is about 12 metres long. Half of it fits in this 6-metre room: its first length mode.</p></section><section><span>02 / NODES</span><h3>A quiet place.</h3><p>A pressure node is where this mode cancels. In the first length mode, drag the mic through the dark central band. The speaker hasn't changed.</p></section><section><span>03 / ANTINODES</span><h3>The walls get loud.</h3><p>A pressure antinode is a peak. Each axial mode peaks at its pair of opposing boundaries. Corners meet several walls, so bass often builds there.</p></section></div>
    <div class="model-note"><h3>Real relationships. A simplified room.</h3><p>Rigid rectangular room, sound speed 343 m/s. We isolate the nearest axial mode and soften its response away from resonance. Real rooms mix many modes, absorb sound, and have furnishings. The speaker-only view is a simple distance model. Levels are relative to an ideal mode peak, never calibrated sound pressure levels.</p><p>Amber shows pressure amplitude, not moving air. The gentle pulse is slowed for visibility; your tone plays at the selected frequency. This is a steady-state mode explorer, not a simulation of sound travelling or reverberation.</p></div>
    <div class="dialog-controls"><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> length / width / height</span><span><kbd>4</kbd> second length mode</span><span><kbd>C</kbd> cinematic</span><span><kbd>R</kbd> reset experiment</span><span><kbd>/</kbd> interface</span><span><kbd>ESC</kbd> close / show UI</span><span>Drag to orbit · right-drag to pan · scroll to zoom</span><span>WASD to move · Shift to move faster</span><span><kbd>←</kbd><kbd>→</kbd> mic along length · <kbd>↑</kbd><kbd>↓</kbd> mic along width</span></div>
    <p class="audio-note">Sound starts only when you ask. Begin at a comfortable device volume; small speakers may not reproduce the lowest tones.</p>
  </dialog>
`;

function element<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const frequencyRange = element<HTMLInputElement>('frequency');
const frequencyNumber = element<HTMLInputElement>('frequency-number');
const heightRange = element<HTMLInputElement>('height');
const dialog = element<HTMLDialogElement>('how-dialog');
const sound = new ToneAudio();
let soundPending = false;
let room: RoomScene | undefined;
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string) { element('toast').textContent = message; element('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => element('toast').classList.remove('visible'), 3200); }

function update() {
  const mode = getNearestMode(state.frequency);
  const amplitude = sampleField(state.listener, state.frequency, state.view, mode);
  const db = relativeDb(amplitude);
  frequencyRange.value = String(state.frequency);
  if (document.activeElement !== frequencyNumber) frequencyNumber.value = state.frequency.toFixed(1);
  frequencyRange.style.setProperty('--progress', `${(state.frequency - 25) / 175 * 100}%`);
  element('wavelength').textContent = wavelength(state.frequency).toFixed(2);
  element('level-db').textContent = db > -0.05 ? '0.0' : db.toFixed(1).replace('-', '−');
  element('level-fill').style.width = `${Math.max(0, (db + 40) / 40 * 100)}%`;
  document.querySelector('.level-meter')!.setAttribute('aria-valuenow', db.toFixed(1));
  const nearNode = amplitude < 0.13;
  element('level-status').textContent = state.view === 'belief'
    ? nearNode ? 'FAR FROM SOURCE' : amplitude > .72 ? 'NEAR SOURCE' : 'DISTANCE FALLOFF'
    : nearNode ? 'QUIET SPOT' : amplitude > .72 ? 'PRESSURE PEAK' : 'BETWEEN PEAKS';
  element('level-status').classList.toggle('quiet', nearNode);
  const listenerCard = document.querySelector<HTMLElement>('.listener-card')!;
  listenerCard.dataset.pressure = nearNode ? 'quiet' : amplitude > .72 ? 'hot' : 'mid';
  listenerCard.style.setProperty('--amplitude', amplitude.toFixed(3));
  element('position-readout').textContent = `${state.listener.x.toFixed(1)} / ${state.listener.z.toFixed(1)} / ${state.listener.y.toFixed(1)} m`;
  heightRange.value = String(state.listener.y);
  element('height-value').textContent = `${state.listener.y.toFixed(2)} m`;
  element('mode-indices').textContent = `(${mode.indices.join(', ')})`;
  element('mode-name').textContent = `${mode.axis[0].toUpperCase() + mode.axis.slice(1)} · ${mode.frequency.toFixed(1)} Hz`;
  const onResonance = Math.abs(state.frequency - mode.frequency) < .6;
  element('resonance-state').textContent = state.view === 'belief' ? 'DISTANCE ONLY' : onResonance ? 'ON RESONANCE' : `${Math.abs(state.frequency - mode.frequency).toFixed(1)} Hz FROM MODE`;
  element('resonance-state').classList.toggle('detuned', !onResonance || state.view === 'belief');
  const description = state.view === 'belief' ? 'Distance falloff · no reflections' : `${mode.order === 1 ? 'Fundamental' : `Order ${mode.order}`} · ${mode.axis}`;
  element('mode-description').textContent = description;
  document.querySelectorAll<HTMLButtonElement>('[data-axis]').forEach(button => button.setAttribute('aria-pressed', String(mode.axis === button.dataset.axis && mode.order === 1 && onResonance)));
  element('physics-button').setAttribute('aria-pressed', String(state.view === 'physics'));
  element('belief-button').setAttribute('aria-pressed', String(state.view === 'belief'));
  element('comparison-caption').textContent = state.view === 'belief' ? 'The speaker fades with distance.' : onResonance ? 'Same note. Loud peaks. Quiet nodes.' : 'Away from resonance, the pattern fades.';
  document.body.classList.toggle('belief-view', state.view === 'belief');
  element('field-low-label').textContent = state.view === 'belief' ? 'Far' : 'Node';
  element('field-high-label').textContent = state.view === 'belief' ? 'Near' : 'Antinode';
  element('sound-button').setAttribute('aria-pressed', String(state.sound));
  element<HTMLButtonElement>('sound-button').disabled = soundPending;
  element('sound-button').setAttribute('aria-busy', String(soundPending));
  element('sound-label').textContent = soundPending ? 'Starting sound…' : state.sound ? 'Sound on' : 'Enable sound';
  element('nodes-button').setAttribute('aria-pressed', String(state.showNodes));
  element('motion-button').setAttribute('aria-pressed', String(!state.animate));
  element('motion-button').setAttribute('aria-label', state.animate ? 'Pause field animation' : 'Play field animation');
  element('motion-button').title = state.animate ? 'Pause field animation' : 'Play field animation';
  element('motion-button').textContent = state.animate ? 'Ⅱ' : '▷';
  element('camera-button').setAttribute('aria-pressed', String(state.cinematic));
  element('top-button').setAttribute('aria-pressed', String(state.topView));
  sound.update(state.frequency, amplitude);
  room?.setState(state);
}

function setFrequency(value: number) { if (!Number.isFinite(value)) return; state.frequency = Math.min(200, Math.max(25, value)); update(); }
function selectMode(axis: Axis, order = 1) { state.frequency = modeForAxis(axis, order).frequency; state.view = 'physics'; update(); }
function reset() { Object.assign(state, { frequency: initialFrequency, listener: { ...initialListener }, view: 'physics', showNodes: true, animate: !reducedMotion.matches, cinematic: false, topView: false }); room?.setCinematic(false); room?.resetCamera(); update(); toast('Experiment reset'); }
function toggleCinematic() { state.cinematic = !state.cinematic; state.topView = false; room?.setCinematic(state.cinematic); update(); }
function toggleUI() { state.hidden = !state.hidden; document.body.classList.toggle('ui-hidden', state.hidden); element<HTMLButtonElement>('restore-ui').hidden = !state.hidden; }

frequencyRange.addEventListener('input', () => setFrequency(Number(frequencyRange.value)));
frequencyNumber.addEventListener('change', () => { setFrequency(Number(frequencyNumber.value)); frequencyNumber.value = state.frequency.toFixed(1); });
frequencyNumber.addEventListener('blur', () => { frequencyNumber.value = state.frequency.toFixed(1); });
heightRange.addEventListener('input', () => { state.listener.y = Number(heightRange.value); update(); });
document.querySelectorAll<HTMLButtonElement>('[data-axis]').forEach(button => button.addEventListener('click', () => selectMode(button.dataset.axis as Axis)));
element('belief-button').addEventListener('click', () => { state.view = 'belief'; update(); });
element('physics-button').addEventListener('click', () => { state.view = 'physics'; update(); });
element('quiet-button').addEventListener('click', () => { const mode = getNearestMode(state.frequency); state.view = 'physics'; const dimension = ROOM[mode.axis]; state.listener[mode.axis === 'length' ? 'x' : mode.axis === 'width' ? 'z' : 'y'] = dimension / (2 * mode.order); update(); });
element('peak-button').addEventListener('click', () => { state.listener = { x: ROOM.length - .08, y: .08, z: ROOM.width - .08 }; update(); });
element('sound-button').addEventListener('click', async () => {
  if (soundPending) return;
  if (state.sound) { sound.disable(); return; }
  soundPending = true;
  update();
  const enabled = await sound.enable();
  soundPending = false;
  update();
  toast(enabled ? 'Tone on · Start with a low device volume' : 'Audio could not start. Your browser may have blocked it.');
});
sound.onStateChange = enabled => { state.sound = enabled; update(); };
element('nodes-button').addEventListener('click', () => { state.showNodes = !state.showNodes; update(); });
element('motion-button').addEventListener('click', () => { state.animate = !state.animate; update(); });
element('camera-button').addEventListener('click', toggleCinematic);
element('top-button').addEventListener('click', () => { state.topView = !state.topView; state.cinematic = false; room?.setTopView(state.topView); update(); });
element('reset-button').addEventListener('click', reset);
element('restore-ui').addEventListener('click', toggleUI);
element('how-button').addEventListener('click', () => dialog.showModal());
dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { if (state.hidden) toggleUI(); return; }
  if (dialog.open || event.ctrlKey || event.metaKey || event.altKey) return;
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
  if (key === '/') { event.preventDefault(); toggleUI(); }
  else if (key === 'r') reset();
  else if (key === 'c') toggleCinematic();
  else if (key === '1') selectMode('length');
  else if (key === '2') selectMode('width');
  else if (key === '3') selectMode('height');
  else if (key === '4') selectMode('length', 2);
});

update();
try {
  room = new RoomScene(element('scene'), position => { state.listener = { ...position }; update(); });
  room.onCameraInteraction = () => { if (state.cinematic || state.topView) { state.cinematic = false; state.topView = false; update(); } };
  room.onListenerDragChange = dragging => {
    document.body.classList.toggle('dragging-mic', dragging);
    element('drag-status').textContent = dragging ? 'MOVING MIC' : 'DRAG MIC TO MOVE';
  };
  update();
} catch (error) {
  console.error('Unable to initialize the room renderer', error);
  element('scene').innerHTML = `<div class="webgl-fallback"><strong>This room needs WebGL.</strong><p>Enable hardware acceleration or open a browser with WebGL support. The frequency and listener controls still work.</p></div>`;
}

if (import.meta.hot) import.meta.hot.dispose(() => { room?.dispose(); sound.dispose(); clearTimeout(toastTimer); });
