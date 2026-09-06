/**
 * Mock Cognito client for E2E testing.
 * Replaces the real cognitoClient when VITE_MOCK_AUTH=true.
 * Accepts any email/password and returns a fake session.
 */

export interface AuthTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  userId: string;
  email: string;
}

const MOCK_TOKENS: AuthTokens = {
  idToken: 'mock-id-token',
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
};

let currentUser: AuthUser | null = null;

export function signIn(
  email: string,
  _password: string,
): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  currentUser = { userId: 'test-user-id', email };
  return Promise.resolve({ user: currentUser, tokens: MOCK_TOKENS });
}

export function signUp(_email: string, _password: string): Promise<{ userConfirmed: boolean }> {
  return Promise.resolve({ userConfirmed: true });
}

export function confirmSignUp(_email: string, _code: string): Promise<void> {
  return Promise.resolve();
}

export function resendConfirmationCode(_email: string): Promise<void> {
  return Promise.resolve();
}

export function signOut(): void {
  currentUser = null;
}

export function getCurrentSession(): Promise<{
  user: AuthUser;
  tokens: AuthTokens;
} | null> {
  if (!currentUser) return Promise.resolve(null);
  return Promise.resolve({ user: currentUser, tokens: MOCK_TOKENS });
}

export function refreshSession(): Promise<{
  user: AuthUser;
  tokens: AuthTokens;
} | null> {
  return getCurrentSession();
}

// Optional test-controlled endpoint simulates one account shared by isolated browsers.
export async function getAccountLanguage(): Promise<string | undefined> {
  if (localStorage.getItem('mock-language-api') !== 'true') return undefined;
  const response = await fetch('https://mock-api.test/test-account-language');
  if (!response.ok) throw new Error('Account language unavailable');
  return (await response.json()).language;
}
export async function saveAccountLanguage(language: 'en' | 'es' | 'it'): Promise<void> {
  if (localStorage.getItem('mock-language-api') !== 'true') return;
  const response = await fetch('https://mock-api.test/test-account-language', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language }),
  });
  if (!response.ok) throw new Error('Account language could not be saved');
}
