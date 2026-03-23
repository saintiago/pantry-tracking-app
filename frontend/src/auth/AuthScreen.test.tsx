import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import AuthScreen from './AuthScreen';
import { AuthProvider } from './AuthContext';
import * as cognito from './cognitoClient';

jest.mock('./cognitoClient');
const mockedCognito = cognito as jest.Mocked<typeof cognito>;

function renderAuthScreen() {
  return render(
    <AuthProvider>
      <AuthScreen />
    </AuthProvider>,
  );
}

describe('AuthScreen', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedCognito.getCurrentSession.mockResolvedValue(null);
  });

  it('renders login form by default', async () => {
    renderAuthScreen();
    await waitFor(() =>
      expect(screen.getByText('Welcome back')).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('switches to signup form when "Sign up" is clicked', async () => {
    const user = userEvent.setup();
    renderAuthScreen();
    await waitFor(() =>
      expect(screen.getByText('Welcome back')).toBeInTheDocument(),
    );

    await user.click(screen.getByText('Sign up'));

    expect(screen.getByText('Create an account')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
  });

  it('switches back to login form from signup', async () => {
    const user = userEvent.setup();
    renderAuthScreen();
    await waitFor(() =>
      expect(screen.getByText('Welcome back')).toBeInTheDocument(),
    );

    await user.click(screen.getByText('Sign up'));
    expect(screen.getByText('Create an account')).toBeInTheDocument();

    await user.click(screen.getByText('Sign in'));
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });

  it('displays error message on failed login', async () => {
    const user = userEvent.setup();
    mockedCognito.signIn.mockRejectedValue(
      new Error('Incorrect username or password'),
    );

    renderAuthScreen();
    await waitFor(() =>
      expect(screen.getByText('Welcome back')).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText('Email'), 'bad@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(
        screen.getByText('Incorrect username or password'),
      ).toBeInTheDocument(),
    );
  });

  it('shows password mismatch error on signup', async () => {
    const user = userEvent.setup();
    renderAuthScreen();
    await waitFor(() =>
      expect(screen.getByText('Welcome back')).toBeInTheDocument(),
    );

    await user.click(screen.getByText('Sign up'));

    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm password'), 'Different1');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  });

  it('shows confirmation code form after successful signup', async () => {
    const user = userEvent.setup();
    mockedCognito.signUp.mockResolvedValue({ userConfirmed: false });

    renderAuthScreen();
    await waitFor(() =>
      expect(screen.getByText('Welcome back')).toBeInTheDocument(),
    );

    await user.click(screen.getByText('Sign up'));

    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm password'), 'Password1');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() =>
      expect(screen.getByText('Enter confirmation code')).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('confirms signup and switches to login on valid code', async () => {
    const user = userEvent.setup();
    mockedCognito.signUp.mockResolvedValue({ userConfirmed: false });
    mockedCognito.confirmSignUp.mockResolvedValue(undefined);

    renderAuthScreen();
    await waitFor(() =>
      expect(screen.getByText('Welcome back')).toBeInTheDocument(),
    );

    await user.click(screen.getByText('Sign up'));
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'Password1');
    await user.type(screen.getByLabelText('Confirm password'), 'Password1');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() =>
      expect(screen.getByLabelText('Code')).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText('Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(screen.getByText('Welcome back')).toBeInTheDocument(),
    );
  });
});
