import React, { useState, FormEvent } from 'react';
import { useAuth } from './AuthContext';
import PasswordStrength from './PasswordStrength';

interface SignupFormProps {
  onSwitchToLogin: () => void;
}

const SignupForm: React.FC<SignupFormProps> = ({ onSwitchToLogin }) => {
  const { signup, confirmSignUp, resendCode, isLoading, error, clearError } =
    useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  const displayError = localError ?? error;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }

    const result = await signup(email, password);
    if (result) {
      // Always show confirmation step — even if Cognito says the user is
      // already confirmed, the user still needs to log in afterwards.
      setStep('confirm');
    }
  };

  const handleConfirm = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    if (!code.trim()) {
      setLocalError('Please enter the confirmation code');
      return;
    }

    const success = await confirmSignUp(email, code);
    if (success) {
      onSwitchToLogin();
    }
  };

  const handleResend = async () => {
    setResendMsg(null);
    await resendCode(email);
    setResendMsg('Code resent — check your email');
  };

  if (step === 'confirm') {
    return (
      <form onSubmit={handleConfirm} style={styles.form} noValidate>
        <h2 style={styles.heading}>Enter confirmation code</h2>
        <p style={styles.verifyText}>
          We sent a 6-digit code to <strong>{email}</strong>.
        </p>

        {displayError && (
          <div role="alert" style={styles.error}>{displayError}</div>
        )}
        {resendMsg && (
          <div style={styles.success}>{resendMsg}</div>
        )}

        <label style={styles.label} htmlFor="confirm-code">Code</label>
        <input
          id="confirm-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={styles.input}
          placeholder="123456"
          maxLength={6}
        />

        <button
          type="submit"
          disabled={isLoading}
          style={{ ...styles.button, opacity: isLoading ? 0.7 : 1 }}
        >
          {isLoading ? 'Confirming…' : 'Confirm'}
        </button>

        <p style={styles.switchText}>
          Didn't get the code?{' '}
          <button type="button" onClick={handleResend} style={styles.switchLink}>
            Resend
          </button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form} noValidate>
      <h2 style={styles.heading}>Create an account</h2>

      {displayError && (
        <div role="alert" style={styles.error}>{displayError}</div>
      )}

      <label style={styles.label} htmlFor="signup-email">Email</label>
      <input
        id="signup-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={styles.input}
        placeholder="you@example.com"
      />

      <label style={styles.label} htmlFor="signup-password">Password</label>
      <input
        id="signup-password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={styles.input}
        placeholder="Min 8 chars, upper + lower + digit"
      />

      <PasswordStrength password={password} />

      <label style={styles.label} htmlFor="signup-confirm-password">Confirm password</label>
      <input
        id="signup-confirm-password"
        type="password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        style={styles.input}
        placeholder="Re-enter your password"
      />

      <button
        type="submit"
        disabled={isLoading}
        style={{ ...styles.button, opacity: isLoading ? 0.7 : 1 }}
      >
        {isLoading ? 'Creating account…' : 'Sign up'}
      </button>

      <p style={styles.switchText}>
        Already have an account?{' '}
        <button type="button" onClick={onSwitchToLogin} style={styles.switchLink}>
          Sign in
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
  success: {
    backgroundColor: '#f0fdf4',
    color: '#166534',
    padding: '0.75rem',
    borderRadius: 8,
    fontSize: '0.875rem',
    textAlign: 'center',
  },
  label: { fontSize: '0.875rem', fontWeight: 600 },
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
  verifyText: {
    textAlign: 'center',
    fontSize: '0.9375rem',
    color: '#374151',
    lineHeight: 1.6,
  },
};

export default SignupForm;
