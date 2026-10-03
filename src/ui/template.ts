const waveIcon = `<svg viewBox="0 0 36 28" fill="none" aria-hidden="true"><path d="M2 14C7-2 12-2 18 14S29 30 34 14M2 14C7 30 12 30 18 14S29-2 34 14" stroke="currentColor" stroke-width="1.6"/><path d="M2 14h32" stroke="currentColor" stroke-width=".6" opacity=".4"/></svg>`;
const soundIcon = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 8h3l4-4v12l-4-4H3V8Z" stroke="currentColor" stroke-width="1.3"/><path d="M13 7c2 1.5 2 4.5 0 6m2-9c4 3 4 9 0 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
const cameraIcon = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 6h3l1-2h6l1 2h3v10H3V6Z" stroke="currentColor" stroke-width="1.2"/><circle cx="10" cy="10.5" r="3" stroke="currentColor" stroke-width="1.2"/></svg>`;
export const experimentMarkup = `
  <div class="experience">
    <header class="masthead interface">
      <a class="brand" href="./" aria-label="Standing Wave home">${waveIcon}<span>Standing Wave<span class="brand-period">.</span></span></a>
      <span class="lab-title">SMALL EXPERIMENTS. INVISIBLE THINGS.</span>
      <div class="header-actions">
        <span class="edition"><i></i> LAB 001</span>
        <button id="sound-button" type="button" aria-pressed="false" aria-label="Sound off. Enable sound">${soundIcon}<span id="sound-label">Sound off</span></button>
        <button class="text-button" id="how-button">How it works <span>↗</span></button>
      </div>
    </header>
    <main class="stage" aria-label="Interactive room mode experiment">
      <div id="scene"></div>
      <p id="room-instructions" class="sr-only">Use arrow keys to move the listener, or hold Shift for larger steps. W, A, S, D move the camera. C toggles cinematic orbit; R resets. Tab moves to the next control. On touch screens, drag the mic to move it, drag empty space to orbit, and pinch to zoom.</p>
      <p id="pressure-summary" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
      <div class="stage-vignette" aria-hidden="true"></div>
      <section class="intro interface">
        <p class="eyebrow"><span class="tiny-line"></span> THE INVISIBLE ARCHITECTURE OF SOUND</p>
        <h1>Same speaker.<br><em>Different bass.</em></h1>
        <p class="tagline play-instruction"><span>↔</span> Scrub frequency. <span>◎</span> Drag the mic.</p>
      </section>
      <section class="comparison interface" aria-label="Compare sound models">
        <div class="segmented">
          <button id="belief-button" aria-pressed="false">
            <span class="toggle-dot"></span>
            <span class="comparison-label"><small>THE ASSUMPTION</small><strong>Speaker only</strong></span>
          </button>
          <button id="physics-button" aria-pressed="true">
            <span class="toggle-dot"></span>
            <span class="comparison-label"><small>THE PHYSICS</small><strong>Room interference</strong></span>
          </button>
        </div>
        <p id="comparison-caption">Same note. Loud peaks. Quiet nodes.</p>
      </section>
      <aside class="listener-card interface" aria-label="Listener measurements" data-pressure="hot">
        <div class="card-label"><span class="mint-dot"></span> THE LISTENER <span class="live-label">LIVE</span></div>
        <div class="level-readout">
          <output id="level-db" aria-live="off">−1.5</output>
          <span>dB<span>relative</span></span>
        </div>
        <div class="level-meter" role="meter" aria-label="Relative pressure level" aria-valuemin="-40" aria-valuemax="0" aria-valuenow="-1.5">
          <div id="level-fill"></div>
        </div>
        <div class="meter-labels">
          <span>QUIET</span>
          <strong id="level-status">PRESSURE PEAK</strong>
          <span>LOUD</span>
        </div>
        <div class="position-row">
          <span>POSITION</span>
          <output id="position-readout" aria-live="off"></output>
        </div>
        <p class="drag-hint"><span>↔</span><span id="drag-status">DRAG MIC TO MOVE</span></p>
        <label class="height-control" for="height">EAR HEIGHT <output id="height-value" aria-live="off">1.20 m</output></label>
        <input id="height" type="range" min="0.08" max="2.72" step="0.01" value="1.2" aria-label="Listener height in metres" />
        <div class="listener-presets">
          <button id="quiet-button">Find a node <span>↘</span></button>
          <button id="peak-button">Try a corner <span>↗</span></button>
        </div>
      </aside>
      <div class="scene-bottom interface">
        <div class="field-key" role="group" aria-labelledby="pressure-legend-title" aria-describedby="pressure-legend-description pressure-summary">
          <span id="pressure-legend-title" class="eyebrow">PRESSURE AMPLITUDE</span>
          <p id="pressure-legend-description" class="sr-only">Nodes are quiet planes; antinodes are pressure peaks. A quiet reading can also result from tuning away from a mode.</p>
          <div>
            <i class="key-node"></i>
            <span><span id="field-low-label">Node</span> <small>quiet</small></span>
            <span class="key-gradient"></span>
            <i class="key-peak"></i>
            <span><span id="field-high-label">Antinode</span> <small>loud</small></span>
          </div>
        </div>
        <div class="scene-tools">
          <button id="speaker-middle" class="tool-button" title="Move the speaker to the middle of the room">Speaker middle</button>
          <button id="play" class="icon-button" aria-label="Play note" aria-pressed="false" title="Play note · Space">▷</button>
          <button id="camera-button" class="icon-button" aria-label="Toggle cinematic camera" aria-pressed="false" title="Cinematic camera · C">${cameraIcon}</button>
          <button id="reset-button" class="icon-button" aria-label="Reset experiment" title="Reset experiment · R">↺</button>
        </div>
      </div>
      <div class="room-note interface"><span class="room-dot"></span>6.0 × 4.0 × 2.8 m <span>·</span> SIMPLIFIED ROOM MODES</div>
    </main>
    <section class="console interface" aria-label="Experiment controls">
      <div class="frequency-section">
        <div class="section-heading">
          <span class="eyebrow"><span class="section-index">01</span> SCRUB FREQUENCY</span>
          <span class="resonance-state" id="resonance-state">ON RESONANCE</span>
        </div>
        <div class="frequency-row">
          <label class="frequency-value" for="frequency-number">
            <input id="frequency-number" type="number" min="25" max="200" step="0.1" value="28.6" aria-label="Frequency in hertz"/>
            <span>Hz</span>
          </label>
          <div class="wavelength">
            <span>WAVELENGTH</span>
            <output id="wavelength" aria-live="off">12.00</output>
            <span class="unit">m</span>
            <svg viewBox="0 0 76 20" fill="none" aria-hidden="true"><path d="M1 10C13-5 25-5 38 10s25 15 37 0" stroke="currentColor" stroke-width="1.2"/></svg>
          </div>
        </div>
        <div class="frequency-track">
          <input id="frequency" type="range" min="25" max="200" step="0.1" value="28.6" aria-label="Frequency"/>
          <div class="resonance-ticks" aria-hidden="true"></div>
        </div>
        <div class="range-labels">
          <span>25 Hz <small>DEEP BASS</small></span>
          <span>↔ DRAG TO TUNE</span>
          <span>200 Hz</span>
        </div>
      </div>
      <div class="mode-section">
        <div class="section-heading">
          <span class="eyebrow"><span class="section-index">02</span> MEET A ROOM MODE</span>
          <span class="shortcut-hint">PRESS 1–3</span>
        </div>
        <div class="mode-buttons">
          <button data-axis="length" class="mode-button" aria-pressed="true">
            <span class="axis-icon">↔</span>
            <span>Length <small>28.6 Hz</small></span>
            <kbd>1</kbd>
          </button>
          <button data-axis="width" class="mode-button" aria-pressed="false">
            <span class="axis-icon">⤢</span>
            <span>Width <small>42.9 Hz</small></span>
            <kbd>2</kbd>
          </button>
          <button data-axis="height" class="mode-button" aria-pressed="false">
            <span class="axis-icon">↕</span>
            <span>Height <small>61.3 Hz</small></span>
            <kbd>3</kbd>
          </button>
        </div>
        <div class="mode-detail">
          <span id="mode-indices">(1, 0, 0)</span>
          <p id="mode-description">Fundamental · length</p>
        </div>
        <div class="mode-meta">
          <span>NEAREST AXIAL MODE <strong id="mode-name">Length · 28.6 Hz</strong></span>
        </div>
      </div>
    </section>
    <footer class="footer interface">
      <div>
        <span class="key-pair"><kbd>DRAG</kbd> orbit</span>
        <span class="key-pair"><kbd>SCROLL</kbd> zoom</span>
        <span class="key-pair"><kbd>W A S D</kbd> move</span>
        <span class="key-pair"><kbd>C</kbd> cinematic</span>
        <span class="key-pair"><kbd>R</kbd> reset</span>
        <span class="key-pair"><kbd>/</kbd> hide UI</span>
      </div>
      <span class="footer-note">A ROOM YOU CAN LISTEN TO.</span>
    </footer>
  </div>
  <button id="restore-ui" hidden>Show interface <kbd>/</kbd></button>
  <div id="toast" role="status" aria-live="polite"></div>
  <dialog id="how-dialog" aria-labelledby="dialog-title">
    <form method="dialog">
      <button class="dialog-close icon-button" aria-label="Close explanation">×</button>
    </form>
    <p class="eyebrow">STANDING WAVE / FIELD NOTES 001</p>
    <h2 id="dialog-title">The room plays along.</h2>
    <p class="dialog-lede">
      The bass isn't louder in the corner because the speaker is. The room is stacking the wave.
      Bass bounces between walls; at certain frequencies, the returning wave lines up with the
      next one. Some places get a pressure peak. Others nearly cancel.
    </p>
    <div class="explanation-grid">
      <section>
        <span>01 / WAVELENGTH</span>
        <h3>Does the wave fit?</h3>
        <p>At 28.6 Hz, a sound wave is about 12 metres long. Half of it fits in this 6-metre room: its first length mode.</p>
      </section>
      <section>
        <span>02 / NODES</span>
        <h3>A quiet place.</h3>
        <p>
          A pressure node is where this mode cancels. In the first length mode, drag the mic
          through the dark central band. The speaker hasn't changed.
        </p>
      </section>
      <section>
        <span>03 / ANTINODES</span>
        <h3>The walls get loud.</h3>
        <p>
          A pressure antinode is a peak. Each axial mode peaks at its pair of opposing boundaries.
          Corners meet several walls, so bass often builds there.
        </p>
      </section>
    </div>
    <div class="model-note">
      <h3>Real relationships. A simplified room.</h3>
      <p>
        Rigid rectangular room, sound speed 343 m/s. We isolate the nearest axial mode and soften
        its response away from resonance. Real rooms mix many modes, absorb sound, and have
        furnishings. The speaker-only view is a simple distance model. Levels are relative to an
        ideal mode peak, never calibrated sound pressure levels.
      </p>
      <p>
        Amber shows pressure amplitude, not moving air. The gentle pulse is slowed for visibility;
        your tone plays at the selected frequency. This is a steady-state mode explorer, not a
        simulation of sound travelling or reverberation.
      </p>
    </div>
    <div class="dialog-controls">
      <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> length / width / height</span>
      <span><kbd>4</kbd> second length mode</span>
      <span><kbd>C</kbd> cinematic</span>
      <span><kbd>R</kbd> reset experiment</span>
      <span><kbd>/</kbd> interface</span>
      <span><kbd>ESC</kbd> close / show UI</span>
      <span>Drag to orbit · right-drag to pan · scroll to zoom</span>
      <span>WASD to move · Shift to move faster</span>
      <span><kbd>←</kbd><kbd>→</kbd> mic along length · <kbd>↑</kbd><kbd>↓</kbd> mic along width</span>
    </div>
    <p class="audio-note">
      Sound starts only when you ask. Begin at a comfortable device volume; small speakers may not
      reproduce the lowest tones.
    </p>
  </dialog>
`;
