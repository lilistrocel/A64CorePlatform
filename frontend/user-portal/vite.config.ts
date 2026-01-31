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
  build: {
    // Code splitting configuration
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React libraries
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI framework
          'vendor-ui': ['styled-components', 'lucide-react'],
          // Charts library (heavy)
          'vendor-charts': ['recharts'],
          // Map libraries (very heavy)
          'vendor-maps': ['maplibre-gl', '@turf/turf'],
          // Form and state management
          'vendor-state': ['zustand', 'react-hook-form', '@hookform/resolvers', 'zod'],
          // HTTP and data fetching
          'vendor-data': ['axios', '@tanstack/react-query'],
        },
      },
    },
    // Increase chunk size warning limit (we're optimizing, not hiding)
    chunkSizeWarningLimit: 600,
    // Enable source maps for debugging (optional, remove for smaller builds)
    sourcemap: false,
    // Minification settings (esbuild is default and faster)
    minify: 'esbuild',
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
      'a20core.com', // Cloudflare tunnel domain
      '.a20core.com', // Cloudflare tunnel subdomains
    ],
    headers: {
      // Disable caching in development to prevent cache issues
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
    },
    proxy: {
      // Proxy all API requests through nginx
      // Uses localhost for local dev, nginx for Docker
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,  // Keep path as-is
      },
    },
  },
})
