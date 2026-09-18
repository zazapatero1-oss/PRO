/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * GitHub Pages serves 404.html for unknown paths. This emits one that encodes the deep link
 * into `?/path` and bounces to the app root, where index.html restores it before the router
 * boots. The number of base-path segments to keep is baked in from `base` at build time.
 */
function pagesSpaFallback(base: string): Plugin {
  const segments = base.split('/').filter(Boolean).length
  const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><title>FACE-Q Conversation</title>
<script>
  var keep = ${segments};
  var l = window.location;
  l.replace(
    l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
    l.pathname.split('/').slice(0, 1 + keep).join('/') + '/?/' +
    l.pathname.slice(1).split('/').slice(keep).join('/').replace(/&/g, '~and~') +
    (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
    l.hash
  );
</script></head><body></body></html>
`
  return {
    name: 'pages-spa-fallback',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '404.html', source: html })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  let base = env.VITE_BASE_PATH || '/'
  if (!base.startsWith('/')) base = '/' + base
  if (!base.endsWith('/')) base = base + '/'
  return {
    base,
    plugins: [react(), pagesSpaFallback(base)],
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  }
})
