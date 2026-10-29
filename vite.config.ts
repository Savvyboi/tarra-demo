import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE_PATH || './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          vendor: ['react', 'react-dom', 'supercluster', 'dompurify', 'lucide-react'],
        },
        // The MapLibre worker is emitted as an asset. Give it a .js extension so every
        // static host serves it with a JavaScript MIME type, which module workers require.
        assetFileNames: (assetInfo) => {
          const names = assetInfo.names ?? [];
          return names.some((n) => n.endsWith('.mjs'))
            ? 'assets/[name]-[hash].js'
            : 'assets/[name]-[hash][extname]';
        },
      },
    },
    chunkSizeWarningLimit: 1100,
  },
});
