import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Dev-server only. Vite 8 serves raw, untransformed source for requests whose Sec-Fetch-Dest is
 * "document"/"iframe" (a page navigation to a module URL). Some browser setups (e.g. an extension
 * rewriting request headers) send that value for ordinary same-origin module imports, which makes
 * the browser receive raw TSX and render a blank page. Real navigations use mode "navigate", so
 * only same-origin "cors" requests are corrected to "script".
 */
const fixModuleFetchDest: Plugin = {
  name: 'fix-module-fetch-dest',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const h = (req as unknown as { headers: Record<string, string | undefined> }).headers
      if (
        (h['sec-fetch-dest'] === 'document' || h['sec-fetch-dest'] === 'iframe') &&
        h['sec-fetch-mode'] === 'cors' &&
        h['sec-fetch-site'] === 'same-origin'
      ) {
        h['sec-fetch-dest'] = 'script'
      }
      next()
    })
  },
}

export default defineConfig({
  plugins: [react(), fixModuleFetchDest],
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
})
