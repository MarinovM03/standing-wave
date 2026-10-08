import { expect, test, type Locator, type Page } from '@playwright/test';
import { loadEnv } from 'vite';
import { HOOK, PAGE, TITLE_BLOCK } from '../src/ui/copy';

const controls = '.dock button:not(#sheet-handle), .dock input, .actions button, .actions a';

async function expectExposed(control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  await expect.poll(() => control.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit !== null && (hit === element || element.contains(hit));
  }), `${await control.getAttribute('id')} receives input at its visible centre`).toBe(true);
}

async function expectSeparateControls(page: Page): Promise<void> {
  const overlaps = await page.locator(controls).evaluateAll(elements => {
    const rectangles = elements.map(element => {
      const rect = element.getBoundingClientRect();
      let left = Math.max(0, rect.left);
      let right = Math.min(innerWidth, rect.right);
      let top = Math.max(0, rect.top);
      let bottom = Math.min(innerHeight, rect.bottom);
      // A clipping container hides whatever falls outside it.
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const bounds = parent.getBoundingClientRect();
        if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
          left = Math.max(left, bounds.left);
          right = Math.min(right, bounds.right);
        }
        if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
          top = Math.max(top, bounds.top);
          bottom = Math.min(bottom, bounds.bottom);
        }
      }
      return { id: element.id || element.className, left, right, top, bottom };
    });
    const collisions: string[] = [];
    for (let first = 0; first < rectangles.length; first++) {
      for (const second of rectangles.slice(first + 1)) {
        const a = rectangles[first];
        const width = Math.min(a.right, second.right) - Math.max(a.left, second.left);
        const height = Math.min(a.bottom, second.bottom) - Math.max(a.top, second.top);
        if (width > 1 && height > 1) collisions.push(`${a.id} overlaps ${second.id}`);
      }
    }
    return collisions;
  });
  expect(overlaps, 'Dock controls and top-right buttons do not overlap').toEqual([]);
}

for (const viewport of [{ width: 1440, height: 420 }, { width: 1440, height: 650 }, { width: 1024, height: 500 }, { width: 844, height: 320 }]) {
  test(`short ${viewport.width}×${viewport.height} viewport keeps room and controls usable`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto('./');
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(page.locator('.webgl-fallback')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);

    for (const control of await page.locator(controls).all()) await expectExposed(control);
    await expectSeparateControls(page);

    const height = page.locator('#height');
    await expectExposed(height);
    await height.click();
    await page.keyboard.press('End');
    await expect(height).toHaveValue('2.72');
    await expect(page.locator('#height-value')).toContainText('2.72');
    const mic = page.locator('[data-callout="mic"]');
    await page.locator('#mic-node').click();
    await expect(mic).toHaveAttribute('data-pressure', 'quiet');
    await page.locator('#mic-corner').click();
    await expect(mic).toHaveAttribute('data-pressure', 'hot');
    await page.locator('#cinematic').click();
    await expect(page.locator('#cinematic')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('r');
    await expect(page.locator('#cinematic')).toHaveAttribute('aria-pressed', 'false');

    const frequency = page.locator('#frequency');
    await expectExposed(frequency);
    await frequency.click();
    await page.keyboard.press('End');
    await expect(page.locator('#frequency-number')).toHaveValue('200.0');

    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.height).toBeGreaterThan(140);
    await expect.poll(() => page.evaluate(() => {
      const room = document.querySelector('canvas')!;
      const rect = room.getBoundingClientRect();
      const marker = document.querySelector<HTMLElement>('[data-callout="mic"]')!;
      return marker.dataset.visible === 'true' && document.elementFromPoint(
        rect.left + Number(marker.dataset.x), rect.top + Number(marker.dataset.y),
      ) === room;
    }), 'The projected mic is exposed in the room').toBe(true);
    const position = await mic.getAttribute('data-position');
    await canvas.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(mic).not.toHaveAttribute('data-position', position!);
    expect(errors).toEqual([]);
  });
}

test('raw production HTML contains crawler copy and deployment-aware share metadata', async ({ page, request, baseURL }) => {
  const response = await request.get('./');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('text/html');
  const html = await response.text();
  expect(html).not.toMatch(/%[A-Z_]+%/);
  expect(html, 'No em dashes in the page or its meta tags').not.toContain('—');
  const content = await page.evaluate(source => {
    const document = new DOMParser().parseFromString(source, 'text/html');
    const meta = (name: string) => document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute('content');
    const structured = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .flatMap(script => {
        const value = JSON.parse(script.textContent || '{}');
        return Array.isArray(value) ? value : value['@graph'] || [value];
      });
    return {
      title: document.title,
      description: meta('description'),
      headings: document.querySelectorAll('h1').length,
      kicker: document.querySelector('#title-block .title-block__kicker')?.textContent,
      heading: document.querySelector('#title-block h1')?.textContent,
      hook: document.querySelector('#title-block .title-block__hook')?.textContent?.replace(/\s+/g, ' ').trim(),
      explanation: document.querySelector('noscript')?.textContent,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
      ogTitle: meta('og:title'), ogDescription: meta('og:description'), ogType: meta('og:type'),
      ogUrl: meta('og:url'), ogImage: meta('og:image'), ogAlt: meta('og:image:alt'),
      twitterCard: meta('twitter:card'), twitterTitle: meta('twitter:title'), twitterImage: meta('twitter:image'),
      app: structured.find(value => [value['@type']].flat().includes('WebApplication')),
    };
  }, html);
  const basePath = new URL(baseURL!).pathname;
  const siteURL = loadEnv('production', process.cwd(), ['SITE_URL']).SITE_URL?.trim();
  const canonical = siteURL ? new URL(basePath, siteURL).href : basePath;
  const image = siteURL ? new URL(`${basePath}og.png`, siteURL).href : `${basePath}og.png`;
  expect(content.title).toBe(PAGE.title);
  expect(content.description).toBe(PAGE.description);
  expect(content.headings).toBe(1);
  expect(content.kicker).toBe(TITLE_BLOCK.kicker);
  expect(content.heading).toBe(TITLE_BLOCK.title);
  expect(content.hook).toBe(`${HOOK.youdThink} ${HOOK.actually}`);
  expect(content.explanation).toMatch(/JavaScript/);
  expect(content.explanation).toMatch(/speaker/i);
  expect(content.explanation).toMatch(/room/i);
  expect(content.explanation).toMatch(/node|quiet/i);
  expect(content.canonical).toBe(canonical);
  expect(content.ogTitle).toBe(PAGE.title);
  expect(content.ogDescription).toBe(PAGE.description);
  expect(content.ogType).toBe('website');
  expect(content.ogUrl).toBe(canonical);
  expect(content.ogImage).toBe(image);
  expect(content.ogAlt).toBeTruthy();
  expect(content.twitterCard).toBe('summary_large_image');
  expect(content.twitterTitle).toBe(PAGE.title);
  expect(content.twitterImage).toBe(image);
  expect(content.app?.name).toContain('Standing Wave');
  expect(content.app?.url).toBe(canonical);
});

test('production assets load beneath the configured base with real file types', async ({ page, request, baseURL }) => {
  const resources: { url: string; status: number; type: string }[] = [];
  const failures: string[] = [];
  const base = new URL(baseURL!);
  page.on('response', response => {
    if (new URL(response.url()).origin === base.origin) resources.push({
      url: response.url(), status: response.status(), type: response.headers()['content-type'] || '',
    });
  });
  page.on('requestfailed', failed => failures.push(failed.url()));
  await page.goto('./');
  await expect(page.locator('canvas')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const references = await page.locator('script[src], link[rel="stylesheet"], link[rel="modulepreload"], link[rel="icon"]').evaluateAll(elements =>
    elements.map(element => element.getAttribute('src') || element.getAttribute('href')!),
  );
  const types = { '.js': /(?:java|ecma)script/, '.css': /text\/css/, '.svg': /image\/svg\+xml/, '.woff2': /font\/woff2|application\/(?:font-woff2|octet-stream)/ };
  for (const resource of resources.filter(entry => /\.(?:js|css|woff2)(?:\?|$)/.test(entry.url))) {
    const url = new URL(resource.url);
    expect(url.pathname).toMatch(new RegExp(`^${base.pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(resource.status, url.pathname).toBe(200);
    const extension = url.pathname.slice(url.pathname.lastIndexOf('.')) as keyof typeof types;
    expect(resource.type, url.pathname).toMatch(types[extension]);
  }
  expect(resources.filter(resource => new URL(resource.url).pathname.endsWith('.woff2')).length).toBeGreaterThanOrEqual(3);
  for (const reference of references) {
    const url = new URL(reference, baseURL);
    expect(url.origin).toBe(base.origin);
    expect(url.pathname.startsWith(base.pathname)).toBe(true);
    const response = await request.get(url.href);
    expect(response.status(), url.pathname).toBe(200);
    const extension = url.pathname.slice(url.pathname.lastIndexOf('.')) as keyof typeof types;
    expect(response.headers()['content-type'], url.pathname).toMatch(types[extension]);
    if (extension === '.css') expect(await response.text()).not.toMatch(/url\(\s*['"]?\/fonts\//);
  }
  const image = await request.get(new URL('og.png', baseURL).href);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toContain('image/png');
  const bytes = await image.body();
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
  expect(failures).toEqual([]);
  await expect(page.locator('.stage > #title-block'), 'The app adopts the static title block').toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  expect(await page.evaluate(() => [
    document.documentElement.textContent ?? '',
    ...Array.from(document.querySelectorAll('*'), element => Array.from(element.attributes, attribute => attribute.value)).flat(),
  ].filter(text => text.includes('—'))), 'No em dashes in the page text or attributes').toEqual([]);
});

test('the title block and its explanation show with JavaScript disabled', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('./');
    const titleBlock = page.locator('#title-block');
    await expect(titleBlock).toBeVisible();
    await expect(titleBlock.locator('h1')).toHaveText(TITLE_BLOCK.title);
    await expect(titleBlock).toContainText(HOOK.youdThink);
    await expect(titleBlock).toContainText(HOOK.actually);
    await expect(page.locator('h1')).toHaveCount(1);
    const explanation = page.locator('.no-script');
    await expect(explanation).toBeVisible();
    await expect(explanation).toContainText(/JavaScript/);
    await expect(explanation).toContainText(/speaker/i);
    await expect(explanation).toContainText(/room/i);
    await expect(page.locator('canvas, #frequency')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
