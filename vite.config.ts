import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(({ command }) => {
  // `.env` sets NODE_ENV=development for the API and Vite would inherit it,
  // shipping React's development build inside `npm run build`. Force the
  // production mode for a build regardless of the local environment file.
  if (command === 'build') process.env.NODE_ENV = 'production';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        '@shared': path.resolve(import.meta.dirname, 'shared'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:8787',
          changeOrigin: true,
        },
        '/sitemap.xml': {
          target: 'http://localhost:8787',
          changeOrigin: true,
        },
        '/robots.txt': {
          target: 'http://localhost:8787',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      // Do not publish source maps in the production bundle.
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-query': ['@tanstack/react-query'],
          },
        },
      },
    },
  };
});

