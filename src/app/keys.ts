import type { Preset } from './state';

export type KeyFocus = 'text' | 'range' | 'button' | 'other';

export type KeyPress = Readonly<{
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
}>;

export type KeyContext = Readonly<{
  focus: KeyFocus;
  dialogOpen: boolean;
}>;

export type KeyCommand =
  | { type: 'play' }
  | { type: 'preset'; preset: Preset }
  | { type: 'toggleView' }
  | { type: 'cinematic' }
  | { type: 'reset' }
  | { type: 'fullReset' }
  | { type: 'sound' }
  | { type: 'help' }
  | { type: 'hideUI' }
  | { type: 'escape' }
  | { type: 'moveMic'; dx: number; dz: number };

const MIC_STEP = 0.1;
const MIC_STEP_FAST = 0.4;
const ARROWS = new Map<string, readonly [number, number]>([
  ['ArrowLeft', [-1, 0]],
  ['ArrowRight', [1, 0]],
  ['ArrowUp', [0, -1]],
  ['ArrowDown', [0, 1]],
]);
const RANGE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
const LETTERS = new Map<string, KeyCommand>([
  ['v', { type: 'toggleView' }],
  ['c', { type: 'cinematic' }],
  ['m', { type: 'sound' }],
  ['h', { type: 'help' }],
  ['?', { type: 'help' }],
  ['/', { type: 'hideUI' }],
]);

function preset(press: KeyPress): Preset | null {
  for (const digit of [1, 2, 3, 4] as const) {
    // The code keeps the digit row working on AZERTY, where those keys print & é " '.
    if (press.key === String(digit) || press.code === `Digit${digit}`) return digit;
  }
  return null;
}

function fullReset(press: KeyPress): boolean {
  return press.shiftKey && !press.repeat && press.key.toLowerCase() === 'r';
}

export function keyCommand(press: KeyPress, context: KeyContext): KeyCommand | null {
  if (context.focus === 'text') return null;
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  if (context.dialogOpen) return fullReset(press) ? { type: 'fullReset' } : null;
  if (context.focus === 'range' && RANGE_KEYS.has(press.key)) return null;

  const arrow = ARROWS.get(press.key);
  if (arrow) {
    const step = press.shiftKey ? MIC_STEP_FAST : MIC_STEP;
    return { type: 'moveMic', dx: arrow[0] * step, dz: arrow[1] * step };
  }
  if (press.key === 'Escape') return { type: 'escape' };
  if (press.repeat) return null;

  if (press.key === ' ' || press.code === 'Space') return context.focus === 'button' ? null : { type: 'play' };
  const digit = preset(press);
  if (digit) return { type: 'preset', preset: digit };
  const letter = press.key.toLowerCase();
  if (letter === 'r') return { type: press.shiftKey ? 'fullReset' : 'reset' };
  return LETTERS.get(letter) ?? null;
}
