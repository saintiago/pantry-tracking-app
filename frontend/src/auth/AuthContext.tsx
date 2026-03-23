import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import type { AuthUser } from './cognitoClient';
import * as cognito from './cognitoClient';

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<{ userConfirmed: boolean } | null>;
  confirmSignUp: (email: string, code: string) => Promise<boolean>;
  resendCode: (email: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    error: null,
  });

  // Check for existing session on mount
  useEffect(() => {
    let cancelled = false;
    cognito
      .getCurrentSession()
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setState({
            isAuthenticated: true,
            isLoading: false,
            user: result.user,
            error: null,
          });
        } else {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const result = await cognito.signIn(email, password);
      setState({
        isAuthenticated: true,
        isLoading: false,
        user: result.user,
        error: null,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Authentication failed';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
    }
  }, []);

  const signup = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<{ userConfirmed: boolean } | null> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const result = await cognito.signUp(email, password);
        setState((prev) => ({ ...prev, isLoading: false }));
        return result;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Registration failed';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
        return null;
      }
    },
    [],
  );

  const confirmSignUpFn = useCallback(
    async (email: string, code: string): Promise<boolean> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        await cognito.confirmSignUp(email, code);
        setState((prev) => ({ ...prev, isLoading: false }));
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Confirmation failed';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
        return false;
      }
    },
    [],
  );

  const resendCode = useCallback(async (email: string): Promise<void> => {
    try {
      await cognito.resendConfirmationCode(email);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to resend code';
      setState((prev) => ({
        ...prev,
        error: message,
      }));
    }
  }, []);

  const logout = useCallback(() => {
    cognito.signOut();
    setState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      error: null,
    });
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      signup,
      confirmSignUp: confirmSignUpFn,
      resendCode,
      logout,
      clearError,
    }),
    [state, login, signup, confirmSignUpFn, resendCode, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
