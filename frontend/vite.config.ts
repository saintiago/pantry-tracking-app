import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function mockAuthPlugin(): Plugin | null {
  if (process.env.VITE_MOCK_AUTH !== 'true') return null;

  const realPath = path.resolve(__dirname, 'src/auth/cognitoClient/cognitoClient.ts').split(path.sep).join('/');
  const mockPath = path.resolve(__dirname, '../e2e/mocks/cognitoClient.ts');
  const mockContent = fs.readFileSync(mockPath, 'utf-8');

  console.log('[mock-auth] Active — cognitoClient.ts replaced with e2e mock');

  return {
    name: 'mock-cognito-auth',
    enforce: 'pre',
    load(id) {
      if (id === realPath) {
        return mockContent;
      }
    },
  };
}

export default defineConfig({
  plugins: [mockAuthPlugin(), react()].filter(Boolean),
  build: {
    outDir: 'build',
  },
  define: {
    global: 'globalThis',
    'globalThis.__VITE_ENV__': JSON.stringify({
      VITE_USER_POOL_ID: process.env.VITE_USER_POOL_ID ?? '',
      VITE_USER_POOL_CLIENT_ID: process.env.VITE_USER_POOL_CLIENT_ID ?? '',
      VITE_API_URL: process.env.VITE_API_URL ?? '',
    }),
  },
});
