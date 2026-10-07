/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import { HOOK, NOSCRIPT, PAGE, TITLE_BLOCK } from './src/ui/copy';

const HTML_COPY: Readonly<Record<string, string>> = {
  PAGE_TITLE: PAGE.title,
  SITE_NAME: PAGE.siteName,
  DESCRIPTION: PAGE.description,
  SHARE_ALT: PAGE.shareAlt,
  KICKER: TITLE_BLOCK.kicker,
  TITLE: TITLE_BLOCK.title,
  YOUD_THINK: HOOK.youdThink,
  ACTUALLY: HOOK.actually,
  NOSCRIPT_NEEDS: NOSCRIPT.needs,
  NOSCRIPT_IDEA: NOSCRIPT.idea,
};

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, character => `&#${character.charCodeAt(0)};`);

function fillCopy(html: string): string {
  return html.replace(/%COPY_([A-Z_]+)%/g, (_, key: string) => {
    const text = HTML_COPY[key];
    if (text === undefined) throw new Error(`index.html asks for unknown copy %COPY_${key}%`);
    return escapeHtml(text);
  });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['BASE_PATH', 'SITE_URL']);
  const requestedBase = env.BASE_PATH?.trim() || '/standing-wave/';
  if (!requestedBase.startsWith('/') || requestedBase.startsWith('//') || /[?#\\\s*:]/.test(requestedBase)
    || requestedBase.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('BASE_PATH must be a root-relative URL path, such as /standing-wave/');
  }
  const base = requestedBase === '/' ? '/' : `${requestedBase.replace(/\/+$/, '')}/`;
  let origin = '';
  if (env.SITE_URL?.trim()) {
    const site = new URL(env.SITE_URL.trim());
    if (!['https:', 'http:'].includes(site.protocol) || site.username || site.password || site.pathname !== '/' || site.search || site.hash) {
      throw new Error('SITE_URL must be an HTTP(S) origin without a path, credentials, query, or fragment');
    }
    origin = site.origin;
  }
  const canonical = `${origin}${base}`;
  const shareImage = `${canonical}og.png`;

  return {
    base,
    plugins: [{
      name: 'standing-wave-copy',
      transformIndexHtml: { order: 'pre', handler: fillCopy },
    }, {
      name: 'standing-wave-document',
      transformIndexHtml: {
        order: 'post',
        handler: () => [
          { tag: 'link', attrs: { rel: 'canonical', href: canonical } },
          { tag: 'meta', attrs: { property: 'og:url', content: canonical } },
          { tag: 'meta', attrs: { property: 'og:image', content: shareImage } },
          { tag: 'meta', attrs: { name: 'twitter:image', content: shareImage } },
          {
            tag: 'script', attrs: { type: 'application/ld+json' },
            children: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: TITLE_BLOCK.title,
              description: PAGE.description,
              url: canonical,
              image: shareImage,
              applicationCategory: 'EducationalApplication',
              browserRequirements: 'Requires JavaScript and WebGL for the interactive room',
              isAccessibleForFree: true,
              inLanguage: 'en',
            }).replace(/</g, '\\u003c'),
          },
        ].map(tag => ({ ...tag, injectTo: 'head' as const })),
      },
      generateBundle() {
        // Pages serves dist at its root; preserve the public prefix when proxying assets.
        if (base !== '/') this.emitFile({
          type: 'asset', fileName: '_redirects',
          source: `${base.slice(0, -1)} ${base} 301\n${base}* /:splat 200\n`,
        });
      },
    }],
    test: {
      // Vitest blanks CSS imports, ?raw included; the token and copy tests read the source.
      css: { include: [/\.css\?raw$/] },
    },
    build: {
      rollupOptions: {
        output: {
          // Keep the renderer cacheable independently of the small application shell.
          manualChunks(id) {
            if (id.includes('node_modules/three/src/renderers') || id.includes('node_modules/three/build')) return 'three-renderer';
            if (id.includes('node_modules/three/')) return 'three';
          },
        },
      },
    },
  };
});
