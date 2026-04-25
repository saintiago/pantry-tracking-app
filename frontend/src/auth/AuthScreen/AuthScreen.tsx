import React, { useState } from 'react';
import { useAuth } from '../AuthContext/AuthContext';
import LoginForm from '../LoginForm/LoginForm';
import SignupForm from '../SignupForm/SignupForm';

type AuthView = 'login' | 'signup';

const AuthScreen: React.FC = () => {
  const [view, setView] = useState<AuthView>('login');
  const { clearError } = useAuth();

  const switchView = (next: AuthView) => {
    clearError();
    setView(next);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.appTitle}>🥫 Pantry Tracker</h1>
        {view === 'login' ? (
          <LoginForm onSwitchToSignup={() => switchView('signup')} />
        ) : (
          <SignupForm onSwitchToLogin={() => switchView('login')} />
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '1rem',
    backgroundColor: '#f5f5f5',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    maxWidth: 440,
    padding: '2rem 1.5rem',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  appTitle: {
    fontSize: '1.75rem',
    fontWeight: 700,
    marginBottom: '1.5rem',
    textAlign: 'center',
  },
};

export default AuthScreen;
