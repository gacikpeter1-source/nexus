import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Target modern but broadly supported browser versions.
    // Chrome 87 covers Android Chrome on devices from 2020+.
    // Without an explicit target Vite may skip transpilation of syntax
    // that breaks older Android WebViews.
    target: ['es2020', 'chrome87', 'firefox78', 'safari14'],
  },
})


