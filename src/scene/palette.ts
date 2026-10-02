export const TOKENS = {
  ink: 0x0f0e0c,
  surface: 0x1a1814,
  raised: 0x24211c,
  paper: 0xf0ebdf,
  muted: 0xa39d90,
  signal: 0x6b78ff,
  pencil: 0xff5a3c,
  swatch: 0x3aced3,
} as const;

export const MATERIALS = {
  clay: 0xb4ac9d,
  cut: TOKENS.paper,
  plinth: TOKENS.surface,
  brass: 0xb38e55,
  engraving: 0x3b2d17,
  engravingEdge: 0xe7cf9c,
  cabinet: TOKENS.raised,
  baffle: TOKENS.surface,
  rubber: TOKENS.ink,
  steel: TOKENS.muted,
} as const;

export const LIGHTS = {
  key: 0xffe4c8,
  rim: 0xaec6ff,
} as const;

export const STUDIO = {
  floor: TOKENS.ink,
  horizon: TOKENS.raised,
  sky: TOKENS.ink,
} as const;

export const FIELD = {
  actually: TOKENS.swatch,
  youdThink: TOKENS.paper,
  shade: TOKENS.ink,
  line: TOKENS.paper,
  glow: TOKENS.swatch,
} as const;
