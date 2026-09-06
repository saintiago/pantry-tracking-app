import { message as translateMessage, t, useLanguage } from '../../i18n/i18n';
import React, { useState, FormEvent } from 'react';
import { useAuth } from '../AuthContext/AuthContext';
import PasswordStrength from '../PasswordStrength/PasswordStrength';

interface SignupFormProps {
  onSwitchToLogin: () => void;
}

const SignupForm: React.FC<SignupFormProps> = ({ onSwitchToLogin }) => {
  useLanguage();
  const { signup, confirmSignUp, resendCode, isLoading, error, clearError } = useAuth();
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
        <h2 style={styles.heading}>{t('Enter confirmation code')}</h2>
        <p style={styles.verifyText}>
          {t('We sent a 6-digit code to')} <strong>{email}</strong>.
        </p>

        {displayError && (
          <div role="alert" style={styles.error}>
            {translateMessage(displayError)}
          </div>
        )}
        {resendMsg && <div style={styles.success}>{translateMessage(resendMsg)}</div>}

        <label style={styles.label} htmlFor="confirm-code">
          {t('Code')}{' '}
        </label>
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
          {isLoading ? t('Confirming…') : t('Confirm')}
        </button>

        <p style={styles.switchText}>
          {t("Didn't get the code?")}{' '}
          <button type="button" onClick={handleResend} style={styles.switchLink}>
            {t('Resend')}{' '}
          </button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form} noValidate>
      <h2 style={styles.heading}>{t('Create an account')}</h2>

      {displayError && (
        <div role="alert" style={styles.error}>
          {translateMessage(displayError)}
        </div>
      )}

      <label style={styles.label} htmlFor="signup-email">
        {t('Email')}{' '}
      </label>
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

      <label style={styles.label} htmlFor="signup-password">
        {t('Password')}{' '}
      </label>
      <input
        id="signup-password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={styles.input}
        placeholder={t('Min 8 chars, upper + lower + digit')}
      />

      <PasswordStrength password={password} />

      <label style={styles.label} htmlFor="signup-confirm-password">
        {t('Confirm password')}{' '}
      </label>
      <input
        id="signup-confirm-password"
        type="password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        style={styles.input}
        placeholder={t('Re-enter your password')}
      />

      <button
        type="submit"
        disabled={isLoading}
        style={{ ...styles.button, opacity: isLoading ? 0.7 : 1 }}
      >
        {isLoading ? t('Creating account…') : t('Sign up')}
      </button>

      <p style={styles.switchText}>
        {t('Already have an account?')}{' '}
        <button type="button" onClick={onSwitchToLogin} style={styles.switchLink}>
          {t('Sign in')}{' '}
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
    backgroundColor: 'var(--color-danger)',
    color: 'var(--color-danger-text)',
    padding: '0.75rem',
    borderRadius: 8,
    fontSize: '0.875rem',
    textAlign: 'center',
  },
  success: {
    backgroundColor: 'var(--color-mint)',
    color: 'var(--color-action)',
    padding: '0.75rem',
    borderRadius: 8,
    fontSize: '0.875rem',
    textAlign: 'center',
  },
  label: { fontSize: '0.875rem', fontWeight: 600 },
  input: {
    padding: '0.75rem',
    borderRadius: 8,
    border: '1px solid var(--color-border)',
    fontSize: '1rem',
    minHeight: 44,
  },
  button: {
    minHeight: 48,
    minWidth: 44,
    padding: '0.75rem',
    borderRadius: 8,
    backgroundColor: 'var(--color-mint)',
    color: 'var(--color-text)',
    fontSize: '1rem',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  switchText: {
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-secondary)',
    marginTop: '0.5rem',
  },
  switchLink: {
    background: 'none',
    border: 'none',
    color: 'var(--color-action)',
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
    color: 'var(--color-text)',
    lineHeight: 1.6,
  },
};

export default SignupForm;
