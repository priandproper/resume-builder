import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built app works when opened from any path / served locally.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
})
