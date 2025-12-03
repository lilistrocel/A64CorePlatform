import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@a64core/shared': path.resolve(__dirname, '../shared/src'),
    },
    dedupe: ['react', 'react-dom', 'styled-components'], // Deduplicate these packages
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'styled-components'], // Pre-bundle these dependencies
  },
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    port: 5173,
    allowedHosts: [
      'localhost',
      'host.docker.internal', // Allow Docker host access for Playwright MCP testing
      '.localhost', // Allow subdomains
      'user-portal', // Allow nginx to proxy requests in Docker network
      'a64core.com', // Production domain
      '.a64core.com', // Production subdomains
    ],
    headers: {
      // Disable caching in development to prevent cache issues
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
    },
    proxy: {
      // Proxy all API requests through nginx (works both in Docker and local dev)
      '/api': {
        target: 'http://nginx',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,  // Keep path as-is
      },
    },
  },
})
