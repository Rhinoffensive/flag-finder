import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so the build works at any GitHub Pages URL.
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: { main: 'index.html', sky: 'sky.html' },
    },
  },
})
