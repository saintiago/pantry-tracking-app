// App configuration — populated from Vite env vars or CDK outputs after deployment.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env: Record<string, string> = (globalThis as any).__VITE_ENV__ ?? {};

export const USER_POOL_ID: string = env.VITE_USER_POOL_ID ?? '';
export const USER_POOL_CLIENT_ID: string = env.VITE_USER_POOL_CLIENT_ID ?? '';
export const API_URL: string = env.VITE_API_URL ?? '';

declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
