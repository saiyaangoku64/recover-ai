import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    rolldownOptions: {
      output: {
        // Split heavy deps into their own chunks so the app chunk stays lean
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('react-router')) {
            return 'vendor-react';
          }
          return 'vendor';
        },
      },
    },
  },
})
