import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { version } = require('./package.json') as { version: string };

function mockAuthPlugin(): Plugin | null {
  if (process.env.VITE_MOCK_AUTH !== 'true') return null;

  const realPath = path
    .resolve(__dirname, 'src/auth/cognitoClient/cognitoClient.ts')
    .split(path.sep)
    .join('/');
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

export default defineConfig(({ command }) => {
  if (command === 'build' && process.env.VITE_MOCK_AUTH === 'true') {
    throw new Error('Mock authentication must never be included in a production build.');
  }
  return {
    plugins: [mockAuthPlugin(), react()].filter(Boolean),
    optimizeDeps: { include: ['@pantry/domain'] },
    build: {
      outDir: 'build',
      commonjsOptions: { include: [/node_modules/, /packages[\\/]domain[\\/]dist/] },
    },
    define: {
      global: 'globalThis',
      __APP_VERSION__: JSON.stringify(version),
      'globalThis.__VITE_ENV__': JSON.stringify({
        VITE_USER_POOL_ID: process.env.VITE_USER_POOL_ID ?? '',
        VITE_USER_POOL_CLIENT_ID: process.env.VITE_USER_POOL_CLIENT_ID ?? '',
        VITE_API_URL: process.env.VITE_API_URL ?? '',
      }),
    },
  };
});
