import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the app runs on :5173 and the API on :3000. Proxying keeps
// cookies same-origin, so the refresh cookie works exactly as in production.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/hook': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
