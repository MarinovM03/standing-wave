import { element } from './dom';

const SHOW_MS = 3200;

export function createToast() {
  const root = element('div', { id: 'toast', class: 'toast glass', role: 'status', 'aria-live': 'polite' });
  let timer: ReturnType<typeof setTimeout> | undefined;

  function show(message: string) {
    root.textContent = message;
    root.classList.add('toast--visible');
    clearTimeout(timer);
    timer = setTimeout(() => root.classList.remove('toast--visible'), SHOW_MS);
  }

  function dispose() {
    clearTimeout(timer);
    root.remove();
  }

  return { element: root, show, dispose };
}
