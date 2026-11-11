import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // The browser calls /api on the Vite server, which forwards to the
      // NestJS API. Same origin for the browser, so no CORS setup in dev.
      proxy: {
        '/api': { target: env.VITE_API_PROXY_TARGET || 'http://localhost:3000', changeOrigin: true },
      },
    },
  };
});
