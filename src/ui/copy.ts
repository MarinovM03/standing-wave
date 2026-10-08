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
