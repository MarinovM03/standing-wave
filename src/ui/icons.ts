const SVG = 'http://www.w3.org/2000/svg';

type Shape = readonly [tag: 'path' | 'circle' | 'rect', attributes: Readonly<Record<string, string | number>>];

const STROKE = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
const FILL = { fill: 'currentColor' };

const SHAPES = {
  soundOn: [
    ['path', { d: 'M3 7.5h3l4-3.5v12l-4-3.5H3z', ...STROKE }],
    ['path', { d: 'M13 7.5c1.2 1.4 1.2 3.6 0 5M15.5 5c2.6 2.8 2.6 7.2 0 10', ...STROKE }],
  ],
  soundOff: [
    ['path', { d: 'M3 7.5h3l4-3.5v12l-4-3.5H3z', ...STROKE }],
    ['path', { d: 'M13.5 8l4 4m0-4l-4 4', ...STROKE }],
  ],
  cinematic: [
    ['rect', { x: 2.5, y: 6, width: 10, height: 8, rx: 1.5, ...STROKE }],
    ['path', { d: 'M12.5 9l5-2.5v7l-5-2.5', ...STROKE }],
  ],
  share: [
    ['path', { d: 'M10 2.5v10M6.5 6L10 2.5 13.5 6', ...STROKE }],
    ['path', { d: 'M5 9.5H4v8h12v-8h-1', ...STROKE }],
  ],
  help: [
    ['circle', { cx: 10, cy: 10, r: 7.5, ...STROKE }],
    ['path', { d: 'M7.8 7.9a2.3 2.3 0 1 1 3.1 2.1c-.6.3-.9.7-.9 1.3v.4', ...STROKE }],
    ['circle', { cx: 10, cy: 14.2, r: 0.9, ...FILL }],
  ],
  play: [['path', { d: 'M6 4.5l9.5 5.5L6 15.5z', ...FILL }]],
  stop: [['rect', { x: 5, y: 5, width: 10, height: 10, rx: 1, ...FILL }]],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof SHAPES;

function svg(viewBox: string, shapes: readonly Shape[], className: string): SVGSVGElement {
  const root = document.createElementNS(SVG, 'svg');
  root.setAttribute('viewBox', viewBox);
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('focusable', 'false');
  root.setAttribute('class', className);
  for (const [tag, attributes] of shapes) {
    const shape = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, String(value));
    root.append(shape);
  }
  return root;
}

export function icon(name: IconName): SVGSVGElement {
  return svg('0 0 20 20', SHAPES[name], 'icon');
}

// The latin font subsets leave out ← and →, so arrow key hints are drawn.
export function arrowKeys(directions: 'horizontal' | 'all'): SVGSVGElement {
  const shapes: Shape[] = [
    ['path', { d: 'M5 2L2 5l3 3M2 5h6', ...STROKE }],
    ['path', { d: 'M17 2l3 3-3 3M20 5h-6', ...STROKE }],
  ];
  if (directions === 'all') {
    shapes.push(['path', { d: 'M26 5l3-3 3 3M29 2v6', ...STROKE }], ['path', { d: 'M35 5l3 3 3-3M38 8V2', ...STROKE }]);
  }
  return svg(directions === 'all' ? '0 0 43 10' : '0 0 22 10', shapes, 'arrow-keys');
}
