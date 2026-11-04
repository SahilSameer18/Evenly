import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  // The browser calls /api on this origin and Vite forwards it, so the refresh cookie (path /api/v1/auth) is same-origin.
  server: { proxy: { '/api': 'http://localhost:5000' } },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.js'] },
})
