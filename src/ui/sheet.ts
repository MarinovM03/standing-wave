export type SheetState = 'peek' | 'full';

// The phone sheet in phone.css: narrow screens, except short landscape ones, which get the side column.
export const SHEET_MEDIA = '(max-width: 640px) and (orientation: portrait), (max-width: 640px) and (min-height: 560px)';

const DRAG_START = 6;
const SNAP = 0.25;
// Chrome can drop the click for a tap that follows a drag, so presses act on release; the click after one is ignored.
const PRESS_CLICK_MS = 500;

type Drag = { pointer: number; startY: number; from: number; height: number; moved: boolean };

export function createSheet(root: HTMLElement, handle: HTMLButtonElement, content: HTMLElement) {
  const abort = new AbortController();
  const signal = abort.signal;
  const media = matchMedia(SHEET_MEDIA);
  let state: SheetState = 'peek';
  let drag: Drag | null = null;
  let pressEnded = -Infinity;

  const fullHeight = () => content.offsetHeight;
  const show = (height: number) => root.style.setProperty('--sheet-more', `${Math.round(height)}px`);

  function set(next: SheetState) {
    state = next;
    root.dataset.sheet = next;
    handle.setAttribute('aria-expanded', String(next === 'full'));
    show(next === 'full' ? fullHeight() : 0);
  }

  const toggle = () => set(state === 'full' ? 'peek' : 'full');

  function end(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { moved, from, height } = drag;
    drag = null;
    delete root.dataset.sheetDrag;
    const released = event.type === 'pointerup';
    if (released) pressEnded = performance.now();
    if (!moved) {
      if (released) toggle();
      return;
    }
    const threshold = from === 0 ? SNAP : 1 - SNAP;
    set(height > fullHeight() * threshold ? 'full' : 'peek');
  }

  handle.addEventListener('pointerdown', event => {
    if (!media.matches || !event.isPrimary || event.button !== 0) return;
    handle.setPointerCapture(event.pointerId);
    const from = state === 'full' ? fullHeight() : 0;
    drag = { pointer: event.pointerId, startY: event.clientY, from, height: from, moved: false };
  }, { signal });
  handle.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < DRAG_START) return;
    drag.moved = true;
    root.dataset.sheetDrag = '';
    drag.height = Math.min(fullHeight(), Math.max(0, drag.from - dy));
    show(drag.height);
  }, { signal });
  handle.addEventListener('pointerup', end, { signal });
  handle.addEventListener('pointercancel', end, { signal });
  handle.addEventListener('lostpointercapture', end, { signal });
  handle.addEventListener('click', () => {
    if (performance.now() - pressEnded > PRESS_CLICK_MS) toggle();
  }, { signal });

  const resize = new ResizeObserver(() => {
    if (state === 'full' && !drag) show(fullHeight());
  });
  resize.observe(content);
  media.addEventListener('change', () => set(state), { signal });
  set('peek');

  function dispose() {
    abort.abort();
    resize.disconnect();
  }

  return { get state() { return state; }, set, dispose };
}
