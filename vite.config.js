import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base:'./' so the built site works both on Vercel and GitHub Pages (relative paths).
export default defineConfig({
  base: './',
  plugins: [react()],
  // Bind to 0.0.0.0 so the VS Code Dev Container forwards the port to the
  // Windows host (otherwise localhost:5173 is only reachable inside the container).
  server: {
    host: true,
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // split heavy vendors into their own cacheable chunks
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
})
