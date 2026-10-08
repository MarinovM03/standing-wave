import type { Mode, ViewMode } from '../model/acoustics';
import { STAGE } from './copy';
import { element } from './dom';

const SETTLE_MS = 180;

function pressure(amplitude: number) {
  return amplitude < 0.13 ? 'quiet' : amplitude > 0.72 ? 'hot' : 'mid';
}

function listener(view: ViewMode, amplitude: number) {
  const level = pressure(amplitude);
  if (view === 'belief') return level === 'quiet' ? 'far from source' : level === 'hot' ? 'near source' : 'distance falloff';
  return level === 'quiet' ? 'quiet spot' : level === 'hot' ? 'pressure peak' : 'between peaks';
}

export function createAnnouncer(container: HTMLElement) {
  const description = element('p', { id: 'room-view', class: 'sr-only' });
  const summary = element('p', { id: 'pressure-summary', class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  container.append(description, summary);
  let key = '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  function update(view: ViewMode, mode: Mode, amplitude: number) {
    if (description.textContent !== STAGE.view[view]) description.textContent = STAGE.view[view];
    const nextKey = `${view}:${view === 'physics' ? mode.indices.join(',') : ''}:${pressure(amplitude)}`;
    if (nextKey === key) return;
    key = nextKey;
    clearTimeout(timer);
    const text = view === 'belief'
      ? `Speaker only. Level falls with distance. Listener: ${listener(view, amplitude)}.`
      : `Room interference. Nearest ${mode.axis} mode (${mode.indices.join(', ')}), ${mode.frequency.toFixed(1)} hertz. Listener: ${listener(view, amplitude)}.`;
    // Announce settled changes of meaning, not every sample during a drag or scrub.
    timer = setTimeout(() => {
      if (summary.textContent !== text) summary.textContent = text;
    }, SETTLE_MS);
  }

  function dispose() {
    clearTimeout(timer);
    description.remove();
    summary.remove();
  }

  return { update, dispose };
}
