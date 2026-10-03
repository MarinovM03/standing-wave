import { describe, expect, it } from 'vitest';
import { keyCommand, type KeyContext, type KeyPress } from './keys';

const idle: KeyContext = { focus: 'other', dialogOpen: false };

function press(key: string, code: string, extra: Partial<KeyPress> = {}): KeyPress {
  return { key, code, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra };
}

describe('keys', () => {
  it('plays the note with Space unless a button has focus', () => {
    expect(keyCommand(press(' ', 'Space'), idle)).toEqual({ type: 'play' });
    expect(keyCommand(press(' ', 'Space'), { ...idle, focus: 'range' })).toEqual({ type: 'play' });
    expect(keyCommand(press(' ', 'Space'), { ...idle, focus: 'button' })).toBeNull();
  });

  it('selects presets by the digit or by its key code, so AZERTY works', () => {
    expect(keyCommand(press('1', 'Digit1'), idle)).toEqual({ type: 'preset', preset: 1 });
    expect(keyCommand(press('4', 'Numpad4'), idle)).toEqual({ type: 'preset', preset: 4 });
    expect(keyCommand(press('&', 'Digit1'), idle)).toEqual({ type: 'preset', preset: 1 });
    expect(keyCommand(press('é', 'Digit2'), idle)).toEqual({ type: 'preset', preset: 2 });
    expect(keyCommand(press('"', 'Digit3'), idle)).toEqual({ type: 'preset', preset: 3 });
    expect(keyCommand(press("'", 'Digit4'), idle)).toEqual({ type: 'preset', preset: 4 });
    expect(keyCommand(press('5', 'Digit5'), idle)).toBeNull();
  });

  it('follows the printed letter, not its position', () => {
    expect(keyCommand(press('v', 'KeyV'), idle)).toEqual({ type: 'toggleView' });
    expect(keyCommand(press('c', 'KeyC'), idle)).toEqual({ type: 'cinematic' });
    expect(keyCommand(press('m', 'Semicolon'), idle)).toEqual({ type: 'sound' });
    expect(keyCommand(press(',', 'KeyM'), idle)).toBeNull();
    expect(keyCommand(press('h', 'KeyH'), idle)).toEqual({ type: 'help' });
    expect(keyCommand(press('?', 'Slash', { shiftKey: true }), idle)).toEqual({ type: 'help' });
    expect(keyCommand(press('?', 'KeyM', { shiftKey: true }), idle)).toEqual({ type: 'help' });
    expect(keyCommand(press('/', 'Slash'), idle)).toEqual({ type: 'hideUI' });
    expect(keyCommand(press('Escape', 'Escape'), idle)).toEqual({ type: 'escape' });
  });

  it('resets with R and fully resets with Shift+R', () => {
    expect(keyCommand(press('r', 'KeyR'), idle)).toEqual({ type: 'reset' });
    expect(keyCommand(press('R', 'KeyR', { shiftKey: true }), idle)).toEqual({ type: 'fullReset' });
    expect(keyCommand(press('R', 'KeyR'), idle)).toEqual({ type: 'reset' });
  });

  it('moves the mic with the arrows, faster with Shift, and keeps moving while held', () => {
    expect(keyCommand(press('ArrowLeft', 'ArrowLeft'), idle)).toEqual({ type: 'moveMic', dx: -0.1, dz: 0 });
    expect(keyCommand(press('ArrowRight', 'ArrowRight', { shiftKey: true }), idle)).toEqual({ type: 'moveMic', dx: 0.4, dz: 0 });
    expect(keyCommand(press('ArrowUp', 'ArrowUp'), idle)).toEqual({ type: 'moveMic', dx: 0, dz: -0.1 });
    expect(keyCommand(press('ArrowDown', 'ArrowDown', { repeat: true }), idle)).toEqual({ type: 'moveMic', dx: 0, dz: 0.1 });
  });

  it('never fires while typing in a field', () => {
    const typing: KeyContext = { ...idle, focus: 'text' };
    for (const [key, code] of [[' ', 'Space'], ['3', 'Digit3'], ['"', 'Digit3'], ['r', 'KeyR'], ['m', 'KeyM'], ['/', 'Slash'], ['?', 'Slash'], ['ArrowLeft', 'ArrowLeft'], ['Escape', 'Escape']]) {
      expect(keyCommand(press(key, code), typing), key).toBeNull();
    }
    expect(keyCommand(press('R', 'KeyR', { shiftKey: true }), typing)).toBeNull();
  });

  it('leaves slider keys to a focused slider and keeps the other shortcuts', () => {
    const slider: KeyContext = { ...idle, focus: 'range' };
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']) {
      expect(keyCommand(press(key, key), slider), key).toBeNull();
    }
    expect(keyCommand(press('c', 'KeyC'), slider)).toEqual({ type: 'cinematic' });
    expect(keyCommand(press('3', 'Digit3'), slider)).toEqual({ type: 'preset', preset: 3 });
  });

  it('stays out of the way of browser shortcuts, held keys, an open dialog and the camera keys', () => {
    expect(keyCommand(press('r', 'KeyR', { ctrlKey: true }), idle)).toBeNull();
    expect(keyCommand(press('r', 'KeyR', { metaKey: true }), idle)).toBeNull();
    expect(keyCommand(press('1', 'Digit1', { altKey: true }), idle)).toBeNull();
    expect(keyCommand(press('c', 'KeyC', { repeat: true }), idle)).toBeNull();
    expect(keyCommand(press(' ', 'Space'), { ...idle, dialogOpen: true })).toBeNull();
    expect(keyCommand(press('Escape', 'Escape'), { ...idle, dialogOpen: true })).toBeNull();
    for (const key of ['w', 'a', 's', 'd', 'q', 'e', 'Shift']) expect(keyCommand(press(key, ''), idle), key).toBeNull();
  });
});
