import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/src/renderers') || id.includes('node_modules/three/build')) return 'three-renderer';
          if (id.includes('node_modules/three/')) return 'three';
        },
      },
    },
  },
});
