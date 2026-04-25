import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../AuthContext';
import * as cognito from '../../cognitoClient/cognitoClient';

// Mock the cognito client module
jest.mock('../../cognitoClient/cognitoClient');
const mockedCognito = cognito as jest.Mocked<typeof cognito>;

// Helper component that exposes auth state for testing
function AuthConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <span data-testid="user">{auth.user ? auth.user.email : 'null'}</span>
      <span data-testid="error">{auth.error ?? 'null'}</span>
      <button onClick={() => auth.login('test@example.com', 'Password1')}>
        Login
      </button>
      <button onClick={() => auth.signup('test@example.com', 'Password1')}>
        Signup
      </button>
      <button onClick={auth.logout}>Logout</button>
      <button onClick={auth.clearError}>Clear Error</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>,
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedCognito.getCurrentSession.mockResolvedValue(null);
  });

  it('starts in loading state and resolves to unauthenticated when no session', async () => {
    renderWithProvider();
    // Initially loading
    expect(screen.getByTestId('loading').textContent).toBe('true');
    // After session check resolves
    await waitFor(() =>
      expect(screen.getByTestId('loading').textContent).toBe('false'),
    );
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('null');
  });

  it('auto-authenticates when an existing session is found', async () => {
    mockedCognito.getCurrentSession.mockResolvedValue({
      user: { userId: 'u1', email: 'existing@example.com' },
      tokens: {
        idToken: 'id',
        accessToken: 'access',
        refreshToken: 'refresh',
      },
    });

    renderWithProvider();

    await waitFor(() =>
      expect(screen.getByTestId('authenticated').textContent).toBe('true'),
    );
    expect(screen.getByTestId('user').textContent).toBe('existing@example.com');
  });

  it('login sets authenticated state on success', async () => {
    const user = userEvent.setup();
    mockedCognito.signIn.mockResolvedValue({
      user: { userId: 'u2', email: 'test@example.com' },
      tokens: {
        idToken: 'id',
        accessToken: 'access',
        refreshToken: 'refresh',
      },
    });

    renderWithProvider();
    await waitFor(() =>
      expect(screen.getByTestId('loading').textContent).toBe('false'),
    );

    await user.click(screen.getByText('Login'));

    await waitFor(() =>
      expect(screen.getByTestId('authenticated').textContent).toBe('true'),
    );
    expect(screen.getByTestId('user').textContent).toBe('test@example.com');
  });

  it('login sets error on failure', async () => {
    const user = userEvent.setup();
    mockedCognito.signIn.mockRejectedValue(new Error('Invalid credentials'));

    renderWithProvider();
    await waitFor(() =>
      expect(screen.getByTestId('loading').textContent).toBe('false'),
    );

    await user.click(screen.getByText('Login'));

    await waitFor(() =>
      expect(screen.getByTestId('error').textContent).toBe(
        'Invalid credentials',
      ),
    );
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
  });

  it('signup calls cognito signUp', async () => {
    const user = userEvent.setup();
    mockedCognito.signUp.mockResolvedValue({ userConfirmed: false });

    renderWithProvider();
    await waitFor(() =>
      expect(screen.getByTestId('loading').textContent).toBe('false'),
    );

    await user.click(screen.getByText('Signup'));

    await waitFor(() =>
      expect(mockedCognito.signUp).toHaveBeenCalledWith(
        'test@example.com',
        'Password1',
      ),
    );
  });

  it('logout clears auth state', async () => {
    const user = userEvent.setup();
    mockedCognito.getCurrentSession.mockResolvedValue({
      user: { userId: 'u1', email: 'test@example.com' },
      tokens: {
        idToken: 'id',
        accessToken: 'access',
        refreshToken: 'refresh',
      },
    });

    renderWithProvider();
    await waitFor(() =>
      expect(screen.getByTestId('authenticated').textContent).toBe('true'),
    );

    await user.click(screen.getByText('Logout'));

    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('null');
    expect(mockedCognito.signOut).toHaveBeenCalled();
  });

  it('clearError resets error to null', async () => {
    const user = userEvent.setup();
    mockedCognito.signIn.mockRejectedValue(new Error('Bad password'));

    renderWithProvider();
    await waitFor(() =>
      expect(screen.getByTestId('loading').textContent).toBe('false'),
    );

    await user.click(screen.getByText('Login'));
    await waitFor(() =>
      expect(screen.getByTestId('error').textContent).toBe('Bad password'),
    );

    await user.click(screen.getByText('Clear Error'));
    expect(screen.getByTestId('error').textContent).toBe('null');
  });

  it('throws when useAuth is used outside AuthProvider', () => {
    // Suppress console.error for this test
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<AuthConsumer />)).toThrow(
      'useAuth must be used within an AuthProvider',
    );
    spy.mockRestore();
  });
});
