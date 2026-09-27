import { access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const width = 1200;
const height = 630;
const source = new URL('../public/og.svg', import.meta.url);
const destination = new URL('../public/og.png', import.meta.url);

await access(source);
const browser = await chromium.launch({
  headless: true,
  timeout: 15_000,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
let captureTimeout;

try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(source.href, { waitUntil: 'load', timeout: 15_000 });
  const dimensions = await page.evaluate(() => {
    const svg = document.documentElement;
    if (!(svg instanceof SVGSVGElement)) throw new Error('public/og.svg is not a valid SVG document');
    return { width: svg.width.baseVal.value, height: svg.height.baseVal.value };
  });
  if (dimensions.width !== width || dimensions.height !== height) {
    throw new Error(`Expected a ${width}×${height} SVG; received ${dimensions.width}×${dimensions.height}`);
  }
  await page.waitForFunction(() => document.fonts.status === 'loaded', undefined, { timeout: 15_000 });

  const session = await page.context().newCDPSession(page);
  const { data } = await Promise.race([
    session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    }),
    new Promise((_, reject) => {
      captureTimeout = setTimeout(() => reject(new Error('OG image capture timed out')), 15_000);
    }),
  ]);
  const png = Buffer.from(data, 'base64');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (png.length < 24 || !png.subarray(0, 8).equals(signature)
    || png.toString('ascii', 12, 16) !== 'IHDR'
    || png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) {
    throw new Error(`Chromium did not return a valid ${width}×${height} PNG`);
  }
  await writeFile(destination, png);
  console.log(`Rendered ${fileURLToPath(destination)} (${width}×${height})`);
} finally {
  clearTimeout(captureTimeout);
  await browser.close();
}
