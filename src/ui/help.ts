import { element } from './dom';

const keys = (...names: string[]) => names.map(name => element('kbd', { class: 'key' }, name));

function section(index: string, title: string, text: string) {
  return element('section', {}, element('span', {}, index), element('h3', {}, title), element('p', {}, text));
}

function explainer() {
  return [
    element('form', { method: 'dialog' }, element('button', { class: 'dialog-close', 'aria-label': 'Close explanation' }, '×')),
    element('p', { class: 'dialog-kicker' }, 'STANDING WAVE / FIELD NOTES 001'),
    element('h2', { id: 'dialog-title' }, 'The room plays along.'),
    element('p', { class: 'dialog-lede' }, "The bass isn't louder in the corner because the speaker is. The room is stacking the wave. Bass bounces between walls; at certain frequencies, the returning wave lines up with the next one. Some places get a pressure peak. Others nearly cancel."),
    element('div', { class: 'explanation-grid' },
      section('01 / WAVELENGTH', 'Does the wave fit?', 'At 28.6 Hz, a sound wave is about 12 metres long. Half of it fits in this 6-metre room: its first length mode.'),
      section('02 / NODES', 'A quiet place.', "A pressure node is where this mode cancels. In the first length mode, drag the mic through the dark central band. The speaker hasn't changed."),
      section('03 / ANTINODES', 'The walls get loud.', 'A pressure antinode is a peak. Each axial mode peaks at its pair of opposing boundaries. Corners meet several walls, so bass often builds there.')),
    element('div', { class: 'model-note' },
      element('h3', {}, 'Real relationships. A simplified room.'),
      element('p', {}, "Rigid rectangular room, sound speed 343 m/s. We isolate the nearest axial mode and soften its response away from resonance. Real rooms mix many modes, absorb sound, and have furnishings. The You'd think view is a simple distance model. Levels are relative to an ideal mode peak, never calibrated sound pressure levels."),
      element('p', {}, 'The glow shows pressure amplitude, not moving air. The gentle pulse is slowed for visibility; your tone plays at the selected frequency. This is a steady-state mode explorer, not a simulation of sound travelling or reverberation.')),
    element('div', { class: 'dialog-controls' },
      element('span', {}, ...keys('1', '2', '3'), ' length / width / height'),
      element('span', {}, ...keys('4'), ' second length mode'),
      element('span', {}, ...keys('C'), ' cinematic'),
      element('span', {}, ...keys('R'), ' reset experiment'),
      element('span', {}, ...keys('/'), ' interface'),
      element('span', {}, ...keys('ESC'), ' close / show UI'),
      element('span', {}, 'Drag to orbit · right-drag to pan · scroll to zoom'),
      element('span', {}, 'WASD to move · Shift to move faster'),
      element('span', {}, ...keys('Left', 'Right'), ' mic along length · ', ...keys('Up', 'Down'), ' mic along width')),
    element('p', { class: 'audio-note' }, 'Sound starts only when you ask. Begin at a comfortable device volume; small speakers may not reproduce the lowest tones.'),
  ];
}

export function createHelp() {
  const abort = new AbortController();
  const dialog = element('dialog', { id: 'how-dialog', class: 'explainer', 'aria-labelledby': 'dialog-title' }, ...explainer());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  }, { signal: abort.signal });

  function open() {
    if (!dialog.open) dialog.showModal();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function dispose() {
    abort.abort();
    dialog.remove();
  }

  return { element: dialog, isOpen: () => dialog.open, open, close, dispose };
}
