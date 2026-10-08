import { ACTIONS, KEYS } from './copy';
import { clickWithoutFocus, element } from './dom';
import { icon, type IconName } from './icons';

export type ActionsState = Readonly<{ sound: boolean; soundPending: boolean; cinematic: boolean }>;

export type ActionsEvents = Readonly<{
  sound(): void;
  cinematic(): void;
  share(): void;
  help(): void;
}>;

function setAttribute(target: Element, name: string, value: string) {
  if (target.getAttribute(name) !== value) target.setAttribute(name, value);
}

function action(id: string, iconName: IconName, label: string, shortcut?: string) {
  const glyph = element('span', { class: 'action__icon' }, icon(iconName));
  const tipText = element('span', {}, label);
  const tip = element('span', { class: 'action__tip', 'aria-hidden': 'true' }, tipText);
  if (shortcut) tip.append(element('kbd', { class: 'key' }, shortcut));
  const root = element('button', { id, type: 'button', class: 'action', 'aria-label': label, 'aria-keyshortcuts': shortcut }, glyph, tip);
  return { root, glyph, tipText };
}

export function createActions(events: ActionsEvents) {
  const abort = new AbortController();
  const signal = abort.signal;
  const sound = action('sound', 'soundOn', ACTIONS.sound.mute, KEYS.sound);
  const cinematic = action('cinematic', 'cinematic', ACTIONS.cinematic, KEYS.cinematic);
  const share = action('share', 'share', ACTIONS.share);
  const help = action('help', 'help', ACTIONS.help, KEYS.help);
  help.root.setAttribute('aria-keyshortcuts', `${KEYS.help} ?`);
  setAttribute(sound.root, 'aria-pressed', 'true');
  setAttribute(cinematic.root, 'aria-pressed', 'false');
  const follow = element('a', {
    class: 'follow', href: ACTIONS.follow.href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': ACTIONS.follow.label,
  }, ACTIONS.follow.text);
  const root = element('nav', { class: 'actions', 'aria-label': ACTIONS.label },
    element('div', { class: 'actions__buttons' }, sound.root, cinematic.root, share.root, help.root), follow);

  clickWithoutFocus(root, signal);
  sound.root.addEventListener('click', () => events.sound(), { signal });
  cinematic.root.addEventListener('click', () => events.cinematic(), { signal });
  share.root.addEventListener('click', () => events.share(), { signal });
  help.root.addEventListener('click', () => events.help(), { signal });

  let soundIcon: IconName = 'soundOn';

  function render(state: ActionsState) {
    const label = state.soundPending ? ACTIONS.sound.starting : state.sound ? ACTIONS.sound.mute : ACTIONS.sound.enable;
    setAttribute(sound.root, 'aria-pressed', String(state.sound));
    setAttribute(sound.root, 'aria-busy', String(state.soundPending));
    setAttribute(sound.root, 'aria-label', label);
    const tip = state.soundPending ? ACTIONS.sound.starting : state.sound ? ACTIONS.sound.on : ACTIONS.sound.off;
    if (sound.tipText.textContent !== tip) sound.tipText.textContent = tip;
    const nextIcon: IconName = state.sound ? 'soundOn' : 'soundOff';
    if (nextIcon !== soundIcon) {
      soundIcon = nextIcon;
      sound.glyph.replaceChildren(icon(nextIcon));
    }
    setAttribute(cinematic.root, 'aria-pressed', String(state.cinematic));
  }

  function dispose() {
    abort.abort();
    root.remove();
  }

  return { element: root, help: help.root, render, dispose };
}
