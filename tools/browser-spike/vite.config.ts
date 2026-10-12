import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

// This policy belongs to the isolated lab, not to the application gateway.
// The blocked entry proves that ordinary script-src 'self' forbids WASM.
function labHeaders(): Plugin {
  const install = (server: { middlewares: { use: (handler: (req: { url?: string }, res: { setHeader: (name: string, value: string) => void }, next: () => void) => void) => void } }, development: boolean) => {
    server.middlewares.use((req, res, next) => {
      const wasm = req.url?.split('?')[0] === '/blocked.html' ? '' : " 'wasm-unsafe-eval'"
      res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'${wasm}; style-src 'self'${development ? " 'unsafe-inline'" : ''}; img-src 'self' blob:; connect-src 'self'${development ? ' ws: wss:' : ''}; worker-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; manifest-src 'self'`)
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Referrer-Policy', 'no-referrer')
      res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()')
      next()
    })
  }
  return { name: 'lab-headers', configureServer: server => install(server, true), configurePreviewServer: server => install(server, false) }
}

export default defineConfig({
  plugins: [labHeaders()],
  server: { strictPort: true, cors: false, allowedHosts: ['localhost', 'photobunker-lab.orb.local'] },
  preview: { strictPort: true, allowedHosts: ['localhost', 'photobunker-lab.orb.local'] },
  build: { rollupOptions: { input: ['index.html', 'blocked.html'] } },
  worker: { format: 'es' },
})
