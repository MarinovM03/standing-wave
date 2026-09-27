import { expect, test, type Locator, type Page } from '@playwright/test';
import { loadEnv } from 'vite';

const listenerAndSceneControls = '#height, .listener-presets button, .scene-tools button';

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
  const overlaps = await page.locator(listenerAndSceneControls).evaluateAll(elements => {
    const rectangles = elements.map(element => {
      const rect = element.getBoundingClientRect();
      let left = Math.max(0, rect.left);
      let right = Math.min(innerWidth, rect.right);
      let top = Math.max(0, rect.top);
      let bottom = Math.min(innerHeight, rect.bottom);
      // A scrollable listener card may clip controls until they are scrolled into view.
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
      return { id: element.id, left, right, top, bottom };
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
  expect(overlaps, 'Visible listener controls and scene tools do not overlap').toEqual([]);
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

    for (const control of await page.locator(listenerAndSceneControls).all()) {
      await expectExposed(control);
      await expectSeparateControls(page);
    }

    const height = page.locator('#height');
    await expectExposed(height);
    await height.click();
    await page.keyboard.press('End');
    await expect(height).toHaveValue('2.72');
    await expect(page.locator('#height-value')).toContainText('2.72');
    await page.locator('#quiet-button').click();
    await expect(page.locator('.listener-card')).toHaveAttribute('data-pressure', 'quiet');
    await page.locator('#peak-button').click();
    await expect(page.locator('.listener-card')).toHaveAttribute('data-pressure', 'hot');
    await page.locator('#top-button').click();
    await expect(page.locator('#top-button')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#reset-button').click();
    await expect(page.locator('#top-button')).toHaveAttribute('aria-pressed', 'false');

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
      const canvas = document.querySelector('canvas')!;
      const rect = canvas.getBoundingClientRect();
      const mic = document.querySelector<HTMLElement>('.sw-scene-label--listener')!;
      return mic.dataset.micVisible === 'true' && document.elementFromPoint(
        rect.left + Number(mic.dataset.micX), rect.top + Number(mic.dataset.micY),
      ) === canvas;
    }), 'The projected mic is exposed in the room').toBe(true);
    const position = await page.locator('#position-readout').textContent();
    await canvas.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#position-readout')).not.toHaveText(position!);
    expect(errors).toEqual([]);
  });
}

test('raw production HTML contains crawler copy and deployment-aware share metadata', async ({ page, request, baseURL }) => {
  const response = await request.get('./');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('text/html');
  const html = await response.text();
  expect(html).not.toMatch(/%[A-Z_]+%/);
  const content = await page.evaluate(html => {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const meta = (name: string) => document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute('content');
    const structured = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .flatMap(script => {
        const value = JSON.parse(script.textContent || '{}');
        return Array.isArray(value) ? value : value['@graph'] || [value];
      });
    return {
      title: document.title,
      description: meta('description'),
      heading: document.querySelector('#static-explainer h1')?.textContent,
      explanation: document.querySelector('#static-explainer')?.textContent,
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
  expect(content.title).toContain('Standing Wave');
  expect(content.description).toMatch(/room|bass|standing.wave/i);
  expect(content.heading).toContain('Standing Wave');
  expect(content.explanation).toMatch(/speaker/i);
  expect(content.explanation).toMatch(/room/i);
  expect(content.explanation).toMatch(/node|quiet/i);
  expect(content.canonical).toBe(canonical);
  expect(content.ogTitle).toContain('Standing Wave');
  expect(content.ogDescription).toMatch(/room|bass/i);
  expect(content.ogType).toBe('website');
  expect(content.ogUrl).toBe(canonical);
  expect(content.ogImage).toBe(image);
  expect(content.ogAlt).toBeTruthy();
  expect(content.twitterCard).toBe('summary_large_image');
  expect(content.twitterTitle).toContain('Standing Wave');
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
  page.on('requestfailed', request => failures.push(request.url()));
  await page.goto('./');
  await expect(page.locator('canvas')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const references = await page.locator('script[src], link[rel="stylesheet"], link[rel="modulepreload"], link[rel="icon"]').evaluateAll(elements =>
    elements.map(element => element.getAttribute('src') || element.getAttribute('href')!),
  );
  const types = { '.js': /(?:java|ecma)script/, '.css': /text\/css/, '.svg': /image\/svg\+xml/, '.ttf': /font\/ttf|application\/(?:x-font-ttf|font-sfnt|octet-stream)/ };
  for (const resource of resources.filter(resource => /\.(?:js|css|ttf)(?:\?|$)/.test(resource.url))) {
    const url = new URL(resource.url);
    expect(url.pathname).toMatch(new RegExp(`^${base.pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(resource.status, url.pathname).toBe(200);
    const extension = url.pathname.slice(url.pathname.lastIndexOf('.')) as keyof typeof types;
    expect(resource.type, url.pathname).toMatch(types[extension]);
  }
  expect(resources.filter(resource => new URL(resource.url).pathname.endsWith('.ttf')).length).toBeGreaterThanOrEqual(2);
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
  await expect(page.locator('#static-explainer')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveCount(1);
});

test('the static explanation remains readable with JavaScript disabled', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('./');
    const explanation = page.locator('#static-explainer');
    await expect(explanation).toBeVisible();
    await expect(explanation.locator('h1')).toContainText('Standing Wave');
    await expect(explanation).toContainText(/speaker/i);
    await expect(explanation).toContainText(/room/i);
    await expect(page.locator('noscript p')).toBeVisible();
    await expect(page.locator('noscript p')).toContainText(/JavaScript/i);
    await expect(page.locator('canvas, #frequency')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
