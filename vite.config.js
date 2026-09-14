import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const spaFallback = () => ({
  name: 'aviation-intercept-spa-fallback',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const pathname = req.url?.split('?')[0] || '/'
      if (req.method === 'GET' && !pathname.includes('.') && !pathname.startsWith('/@')) {
        req.url = '/index.html'
      }
      next()
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      const pathname = req.url?.split('?')[0] || '/'
      if (req.method === 'GET' && !pathname.includes('.') && !pathname.startsWith('/@')) {
        req.url = '/index.html'
      }
      next()
    })
  }
})

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [spaFallback(), react()],
  server: {
    port: 3000,
    open: true
  }
})
