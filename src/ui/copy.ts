export const TITLE_BLOCK = {
  kicker: 'No. 02 · ACOUSTICS',
  title: 'Standing Wave',
} as const;

export const HOOK = {
  youdThink: "You'd think bass gets quieter the farther you stand from the speaker.",
  actually: 'Actually, the room stacks the wave into loud and quiet planes.',
} as const;

export const PAGE = {
  title: `${TITLE_BLOCK.title} · Marinov Labs`,
  siteName: 'Marinov Labs',
  description: `${HOOK.youdThink} ${HOOK.actually}`,
  shareAlt: 'Standing Wave: same speaker, different bass. A speaker and a microphone in a dark room with amber-lit walls and a glass plane between them.',
} as const;

export const NOSCRIPT = {
  needs: 'The interactive room needs JavaScript and WebGL.',
  idea: 'Bass reflects between the walls of a closed room. At certain notes the reflections line up with the sound from the speaker. Pressure then piles up at the walls and cancels on quiet planes between them. Stand on one of those planes and the bass almost vanishes, though the speaker plays just as loud.',
} as const;

export const READOUTS = {
  frequency: { label: 'Frequency', unit: 'Hz' },
  wavelength: { label: 'Wavelength', unit: 'm' },
  mode: { label: 'Mode', none: 'none' },
  level: { label: { physics: 'Level re antinode', belief: 'Level re speaker' }, unit: 'dB' },
} as const;

export const STAGE = {
  label: 'Interactive room mode experiment',
  instructions: 'Use the arrow keys to move the mic, or hold Shift for larger steps. W, A, S and D move the camera; Q and E orbit it. C toggles the cinematic camera and R resets. Tab moves to the next control. On a touch screen, drag the mic or the speaker to move it, drag empty space to orbit and pinch to zoom.',
  view: {
    physics: 'Nodes are quiet planes; antinodes are pressure peaks. A quiet reading can also come from tuning away from a mode.',
    belief: 'Farther from the speaker is quieter; closer is louder. This view has no room interference.',
  },
  restore: 'Show interface',
  noWebGL: 'This room needs WebGL.',
  noWebGLHelp: 'Turn on hardware acceleration or open a browser with WebGL. The controls still work.',
} as const;

export const DOCK = {
  label: 'Experiment controls',
  view: { label: 'View', wrong: "You'd think", right: 'Actually' },
  frequency: { label: 'Frequency', unit: 'Hz', field: 'Frequency in hertz' },
  play: { start: 'Play note', stop: 'Stop note' },
  modes: { label: 'Room mode', names: ['Length', 'Width', 'Height', 'Length ×2'] },
  micHeight: { label: 'Mic height', unit: 'm' },
  mic: { label: 'Mic', node: 'Node', nodeAction: 'Mic to a node', corner: 'Corner', cornerAction: 'Mic to the corner' },
  speaker: { label: 'Speaker', middle: 'Middle', middleAction: 'Speaker to the middle' },
  sheet: 'More controls',
} as const;

export const ACTIONS = {
  label: 'Lab actions',
  sound: { on: 'Sound on', off: 'Sound off', mute: 'Sound on. Mute sound', enable: 'Sound off. Enable sound', starting: 'Starting sound…' },
  cinematic: 'Cinematic camera',
  share: 'Share',
  help: 'Help',
  follow: { text: 'Follow @marinovm10', label: 'Follow @marinovm10 on X (opens in a new tab)', href: 'https://x.com/marinovm10' },
} as const;

export const TOASTS = {
  reset: 'Experiment reset',
  fullReset: 'Full reset',
  toneOn: 'Tone on · Start with a low device volume',
  blocked: 'Audio could not start. Your browser may have blocked it.',
  interrupted: 'The browser paused the sound. Press M to turn it back on.',
  copied: 'Link copied',
  copyFailed: 'Could not copy the link. Copy it from the address bar.',
} as const;

// Printed key names, not quantities.
export const KEYS = {
  view: 'V',
  play: 'Space',
  presets: ['1', '2', '3', '4'],
  sound: 'M',
  cinematic: 'C',
  help: 'H',
  hide: '/',
} as const;

export const HELP = {
  title: 'Help',
  close: 'Close help',
  sections: {
    idea: 'The idea',
    steps: 'Try this',
    real: "What's real",
    simplified: "What's simplified",
    sources: 'Sources',
    keys: 'Keys',
  },
  idea: [
    'A bass note is a wave several metres long. In a closed room it bounces between opposite walls.',
    'At certain notes the reflections line up with the sound leaving the speaker, and the room holds a standing wave. Pressure piles up at the walls and cancels on quiet planes between them.',
    'Stand on one of those planes and the bass almost vanishes, though the speaker plays just as loud.',
  ],
  steps: [
    'Pick Length. At 28.6 Hz the wave is 12 m long, so half of it spans the 6 m room.',
    'Drag the mic toward the middle of the room, or press Node. The level drops into a node, a quiet plane.',
    'Now drag it to the wall opposite the speaker. The level climbs back to an antinode, though the speaker is farther away.',
    "Switch to You'd think. There the level only falls with distance. Switch back to Actually.",
    'Break it: drag the speaker to the middle of the room, or press Middle. It now sits on the node, so the length mode goes silent everywhere. Length ×2 still plays.',
  ],
  real: [
    'The room is 6.0 m long, 4.0 m wide and 2.8 m high, and sound travels at 343 m/s.',
    'Each mode fits a whole number of half waves between two opposite walls. The first length mode is 343 m/s over twice the 6.0 m length: 28.6 Hz.',
    'Pressure peaks at the walls, the antinodes, and cancels on flat planes between them, the nodes. Neighbouring lobes swing in opposite phase while the nodes stay put.',
    'A speaker drives a mode as strongly as that mode is where the speaker stands. The mic hears the same factor where it stands, so swapping the two gives the same level.',
    'The tone plays at the chosen frequency, and its level follows the level readout.',
  ],
  simplified: [
    'One mode at a time: the nearest axial mode. A real room plays many modes at once, including ones that run across corners.',
    'The room is an empty rigid box, with no furniture, doors, absorption, echoes or reverberation.',
    'The cutaway is only for viewing. The model is a closed rigid box.',
    'The floor brightness is a display ramp that fades evenly from antinode to node. The contours carry the true level, one line every 6 dB.',
    'Off resonance, the level falls on a smooth illustrative curve, not measured absorption.',
    'Levels are relative to an ideal antinode, not calibrated sound pressure. A 2% floor keeps nodes from reading as perfect silence, and readings stop at −40 dB.',
    'The speaker is a point at its woofer centre, with no directivity.',
    "You'd think is a plain distance falloff from the speaker, not a full free-field model.",
    'The swing is slowed to 1 Hz so you can see it. The tone plays at the real frequency.',
  ],
  sources: [
    { name: 'Daniel A. Russell, Penn State: Driving room modes, source location', href: 'https://www.acs.psu.edu/drussell/Demos/roommodes/driving.html' },
    { name: 'Purdue ME 513: Modes in a rectangular room', href: 'https://engineering.purdue.edu/ME513/animations/room.htm' },
  ],
  keys: [
    { keys: [KEYS.play], action: 'Play or stop the note' },
    { keys: KEYS.presets, action: 'Length, width, height and second length modes' },
    { keys: [KEYS.view], action: "Switch between You'd think and Actually" },
    { keys: [], arrows: true, action: 'Move the mic; hold Shift for bigger steps' },
    { keys: [KEYS.cinematic], action: 'Cinematic camera' },
    { keys: ['R'], action: 'Reset the experiment' },
    { keys: ['Shift', 'R'], action: 'Full reset' },
    { keys: [KEYS.sound], action: 'Sound on or off' },
    { keys: [KEYS.help, '?'], action: 'Open help' },
    { keys: [KEYS.hide], action: 'Hide or show the interface' },
    { keys: ['Esc'], action: 'Close help or show the interface' },
    { keys: ['W', 'A', 'S', 'D'], action: 'Move the camera' },
    { keys: ['Q', 'E'], action: 'Orbit the camera' },
    { keys: ['Drag'], action: 'Orbit, or move the mic or the speaker' },
    { keys: ['Right-drag'], action: 'Pan' },
    { keys: ['Wheel'], action: 'Zoom, or pinch on a touch screen' },
  ],
} as const;

// One sentence per settled change; {name} fills from the reading.
export const ANNOUNCE = {
  belief: "You'd think view: the level only falls with distance from the speaker.",
  physics: 'Actually view: {axis} mode {indices} at {frequency} Hz{speaker}.',
  mode: '{Axis} mode {indices} at {frequency} Hz{speaker}.',
  speakerOnNode: ', with the speaker on its node',
  speaker: "The speaker is on a node, so it can't drive this mode.",
  node: 'The mic is in a node band, at {level} dB.',
  antinode: 'The mic is in an antinode band, at {level} dB.',
  axes: { length: 'length', width: 'width', height: 'height' },
} as const;
