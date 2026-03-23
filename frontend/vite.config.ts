import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
  },
  define: {
    'globalThis.__VITE_ENV__': JSON.stringify({
      VITE_USER_POOL_ID: process.env.VITE_USER_POOL_ID ?? '',
      VITE_USER_POOL_CLIENT_ID: process.env.VITE_USER_POOL_CLIENT_ID ?? '',
      VITE_API_URL: process.env.VITE_API_URL ?? '',
    }),
  },
});
