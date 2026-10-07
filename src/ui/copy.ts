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
  level: { label: 'Level', unit: { physics: 'dB re antinode', belief: 'dB re speaker' } },
} as const;
