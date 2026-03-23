import React, { useState, FormEvent } from 'react';
import { useAuth } from './AuthContext';

interface LoginFormProps {
  onSwitchToSignup: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToSignup }) => {
  const { login, isLoading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    await login(email, password);
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form} noValidate>
      <h2 style={styles.heading}>Welcome back</h2>

      {error && (
        <div role="alert" style={styles.error}>
          {error}
        </div>
      )}

      <label style={styles.label} htmlFor="login-email">
        Email
      </label>
      <input
        id="login-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={styles.input}
        placeholder="you@example.com"
      />

      <label style={styles.label} htmlFor="login-password">
        Password
      </label>
      <input
        id="login-password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={styles.input}
        placeholder="Enter your password"
      />

      <button
        type="submit"
        disabled={isLoading}
        style={{
          ...styles.button,
          opacity: isLoading ? 0.7 : 1,
        }}
      >
        {isLoading ? 'Signing in…' : 'Sign in'}
      </button>

      <p style={styles.switchText}>
        Don&apos;t have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignup}
          style={styles.switchLink}
        >
          Sign up
        </button>
      </p>
    </form>
  );
};

const styles: Record<string, React.CSSProperties> = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
    maxWidth: 400,
  },
  heading: {
    fontSize: '1.5rem',
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: '0.5rem',
  },
  error: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    padding: '0.75rem',
    borderRadius: 8,
    fontSize: '0.875rem',
    textAlign: 'center',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  input: {
    padding: '0.75rem',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    fontSize: '1rem',
    minHeight: 44,
  },
  button: {
    minHeight: 48,
    minWidth: 44,
    padding: '0.75rem',
    borderRadius: 8,
    backgroundColor: '#4a90d9',
    color: '#ffffff',
    fontSize: '1rem',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  switchText: {
    textAlign: 'center',
    fontSize: '0.875rem',
    color: '#6b7280',
    marginTop: '0.5rem',
  },
  switchLink: {
    background: 'none',
    border: 'none',
    color: '#4a90d9',
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    minHeight: 'auto',
    minWidth: 'auto',
    fontSize: '0.875rem',
    textDecoration: 'underline',
  },
};

export default LoginForm;
