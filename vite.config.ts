import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      minify: false,
      // Disable cache for debugging
      cache: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.match(/\/react(-dom)?\//) || id.match(/\/scheduler\//)) {
                return 'vendor-react';
              }
              if (id.match(/\/firebase\//)) {
                return 'vendor-firebase';
              }
              if (id.match(/\/recharts\//)) {
                return 'vendor-charts';
              }
              if (id.match(/\/(motion|framer-motion)\//) || id.match(/\/lucide-react\//)) {
                return 'vendor-ui';
              }
            }
            // Unmatched ids roll up into the default chunk
            return undefined;
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
