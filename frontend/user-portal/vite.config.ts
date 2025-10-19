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
  },
})
