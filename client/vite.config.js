import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// The money engine is pure JavaScript with no imports from outside its folder, so the client shares it
// with the server: the live split preview then uses exactly the maths the server will use.
const ledger = fileURLToPath(new URL('../server/src/ledger/index.js', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  resolve: { alias: { '@ledger': ledger } },
  // The browser calls /api on this origin and Vite forwards it, so the refresh cookie (path /api/v1/auth) is same-origin.
  server: { proxy: { '/api': 'http://localhost:5000' }, fs: { allow: ['..'] } },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.js'] },
})
