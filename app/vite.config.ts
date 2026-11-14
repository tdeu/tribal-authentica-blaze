import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production build = the demo (index.html) only. dev/send-check.html is served by `npm run dev` only.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } }, // libauth uses top-level await
  server: { host: true, port: 5190, strictPort: true },
});
