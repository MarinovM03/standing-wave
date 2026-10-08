type Attributes = Record<string, string | number | boolean | undefined>;

// Strings become text nodes, never markup.
export function element<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Attributes = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    if (name === 'class') node.className = String(value);
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  node.append(...children);
  return node;
}

// A pointer press leaves no button focused, so Space plays the note afterwards instead of pressing a button again.
export function clickWithoutFocus(container: HTMLElement, signal: AbortSignal): void {
  container.addEventListener('mousedown', event => {
    if (!(event.target instanceof Element) || !event.target.closest('button')) return;
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, { signal });
}
