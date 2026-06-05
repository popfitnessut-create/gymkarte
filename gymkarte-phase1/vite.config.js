import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// レンダラープロセス（React）用のVite設定
// Electronのfileプロトコルで読み込むため base を './' に設定
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
