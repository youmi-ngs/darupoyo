import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({command, mode}) => {
  const env = {...loadEnv(mode, process.cwd(), ''), ...process.env};
  if (command === 'build' && !env.VITE_API_BASE_URL) throw new Error('Set VITE_API_BASE_URL=/api (Firebase Hosting) or https://YOUR-BACKEND/api before building');
  if (env.VITE_API_BASE_URL && env.VITE_API_BASE_URL !== '/api' && !/^https?:\/\/[^\s]+\/api\/?$/.test(env.VITE_API_BASE_URL)) throw new Error('VITE_API_BASE_URL must be /api or an HTTP(S) URL ending in /api');
  const target = env.BACKEND_ORIGIN || 'http://127.0.0.1:8080';
  return {
  server: { strictPort: true, proxy: { '/api': target, '/healthz': target } },
  build: { target: 'es2022', rollupOptions: { output: { manualChunks(id) {
    if (id.includes('@firebase/firestore')) return 'firebase-firestore';
    if (id.includes('@firebase/auth')) return 'firebase-auth';
  } } } },
}; });
