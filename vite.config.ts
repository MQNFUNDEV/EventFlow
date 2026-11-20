import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// GitHub Pages project-site base path.
export default defineConfig({
  base: '/EventFlow/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
})
