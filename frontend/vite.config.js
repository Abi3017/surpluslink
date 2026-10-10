import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // While developing, forward /api requests to the Express backend.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
