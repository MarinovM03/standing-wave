import { ACTIONS, HELP, TITLE_BLOCK } from './copy';
import { element } from './dom';
import { arrowKeys, icon } from './icons';

export const HELP_ID = 'help-drawer';

type KeyRow = (typeof HELP.keys)[number];

function section(id: keyof typeof HELP.sections, ...content: HTMLElement[]) {
  const heading = element('h3', { id: `help-${id}`, class: 'drawer__heading' }, HELP.sections[id]);
  return element('section', { class: 'drawer__section', 'aria-labelledby': heading.id }, heading, ...content);
}

const items = (tag: 'ul' | 'ol', className: string, texts: readonly string[]) =>
  element(tag, { class: className }, ...texts.map(text => element('li', {}, text)));

function keyRow(row: KeyRow) {
  const keys = 'arrows' in row
    ? [element('kbd', { class: 'key' }, arrowKeys('all'))]
    : row.keys.map(name => element('kbd', { class: 'key' }, name));
  return [element('dt', {}, ...keys), element('dd', {}, row.action)];
}

function sources() {
  return element('ul', { class: 'drawer__sources' }, ...HELP.sources.map(source =>
    element('li', {}, element('a', { href: source.href, target: '_blank', rel: 'noopener noreferrer' }, source.name))));
}

function body() {
  return element('div', { class: 'drawer__body' },
    element('a', {
      class: 'follow drawer__follow', href: ACTIONS.follow.href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': ACTIONS.follow.label,
    }, ACTIONS.follow.text),
    section('idea', ...HELP.idea.map(text => element('p', {}, text))),
    section('steps', items('ol', 'drawer__steps', HELP.steps)),
    section('real', items('ul', 'drawer__list', HELP.real)),
    section('simplified', items('ul', 'drawer__list', HELP.simplified)),
    section('sources', sources()),
    section('keys', element('dl', { class: 'drawer__keys' }, ...HELP.keys.flatMap(keyRow))));
}

// Focus returns to whatever controls the drawer, unless a pointer closed it.
export function createHelp() {
  const abort = new AbortController();
  const signal = abort.signal;
  const close = element('button', { type: 'button', class: 'drawer__close', 'aria-label': HELP.close }, icon('close'));
  const head = element('header', { class: 'drawer__head' },
    element('div', {}, element('p', { class: 'drawer__kicker' }, TITLE_BLOCK.kicker), element('h2', { id: 'help-title', class: 'drawer__title' }, HELP.title)),
    close);
  const dialog = element('dialog', { id: HELP_ID, class: 'drawer', 'aria-labelledby': 'help-title' }, head, body());
  let pointerClose = false;

  close.addEventListener('click', () => dialog.close(), { signal });
  dialog.addEventListener('pointerdown', () => {
    pointerClose = true;
  }, { signal });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  }, { signal });
  dialog.addEventListener('keydown', event => {
    pointerClose = false;
    if (event.key !== 'Tab') return;
    const stops = Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href]')).filter(stop => stop.getClientRects().length > 0);
    const first = stops[0];
    const last = stops.at(-1);
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, { signal });
  dialog.addEventListener('close', () => {
    if (!pointerClose) document.querySelector<HTMLElement>(`[aria-controls="${HELP_ID}"]`)?.focus();
  }, { signal });

  function open() {
    if (dialog.open) return;
    pointerClose = false;
    dialog.showModal();
  }

  function closeDrawer() {
    if (dialog.open) dialog.close();
  }

  function dispose() {
    abort.abort();
    dialog.remove();
  }

  return { element: dialog, isOpen: () => dialog.open, open, close: closeDrawer, dispose };
}
