import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages project site path (repository name: EventFlow).
export default defineConfig({
  base: '/EventFlow/',
  plugins: [react()],
})
