import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Local backend URL for the dev proxy — defaults to localhost:3000
  const backendUrl = env.BACKEND_DEV_URL || 'http://localhost:3000';

  return {
    server: {
      port: 8080,
      open: true,
      proxy: {
        // Forward /api/* to the backend in dev — matches VITE_API_URL=/api/v1
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      minify: 'esbuild',
    },
  };
});
