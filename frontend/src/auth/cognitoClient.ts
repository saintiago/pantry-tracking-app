import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';
import { USER_POOL_ID, USER_POOL_CLIENT_ID } from '../config';

let userPool: CognitoUserPool | null = null;

function getUserPool(): CognitoUserPool {
  if (!userPool) {
    userPool = new CognitoUserPool({
      UserPoolId: USER_POOL_ID,
      ClientId: USER_POOL_CLIENT_ID,
    });
  }
  return userPool;
}

export interface AuthTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  userId: string;
  email: string;
}

function extractUser(session: CognitoUserSession): AuthUser {
  const payload = session.getIdToken().decodePayload();
  return {
    userId: payload['sub'] as string,
    email: payload['email'] as string,
  };
}

function extractTokens(session: CognitoUserSession): AuthTokens {
  return {
    idToken: session.getIdToken().getJwtToken(),
    accessToken: session.getAccessToken().getJwtToken(),
    refreshToken: session.getRefreshToken().getToken(),
  };
}

export function signUp(
  email: string,
  password: string,
): Promise<{ userConfirmed: boolean }> {
  return new Promise((resolve, reject) => {
    const pool = getUserPool();
    const attributes = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
    ];

    pool.signUp(email, password, attributes, [], (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ userConfirmed: result?.userConfirmed === true });
    });
  });
}

export function confirmSignUp(
  email: string,
  code: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const pool = getUserPool();
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    cognitoUser.confirmRegistration(code, true, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export function resendConfirmationCode(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const pool = getUserPool();
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    cognitoUser.resendConfirmationCode((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export function signIn(
  email: string,
  password: string,
): Promise<{ user: AuthUser; tokens: AuthTokens }> {
  return new Promise((resolve, reject) => {
    const pool = getUserPool();
    const cognitoUser = new CognitoUser({ Username: email, Pool: pool });
    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    cognitoUser.authenticateUser(authDetails, {
      onSuccess(session) {
        resolve({ user: extractUser(session), tokens: extractTokens(session) });
      },
      onFailure(err) {
        reject(err);
      },
    });
  });
}

export function signOut(): void {
  const pool = getUserPool();
  const currentUser = pool.getCurrentUser();
  if (currentUser) {
    currentUser.signOut();
  }
}

export function getCurrentSession(): Promise<{
  user: AuthUser;
  tokens: AuthTokens;
} | null> {
  return new Promise((resolve) => {
    const pool = getUserPool();
    const currentUser = pool.getCurrentUser();
    if (!currentUser) {
      resolve(null);
      return;
    }

    currentUser.getSession(
      (err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session || !session.isValid()) {
          resolve(null);
          return;
        }
        resolve({ user: extractUser(session), tokens: extractTokens(session) });
      },
    );
  });
}

export function refreshSession(): Promise<{
  user: AuthUser;
  tokens: AuthTokens;
} | null> {
  return new Promise((resolve) => {
    const pool = getUserPool();
    const currentUser = pool.getCurrentUser();
    if (!currentUser) {
      resolve(null);
      return;
    }

    currentUser.getSession(
      (err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session) {
          resolve(null);
          return;
        }

        const refreshToken = session.getRefreshToken();
        currentUser.refreshSession(
          refreshToken,
          (refreshErr: Error | null, newSession: CognitoUserSession) => {
            if (refreshErr || !newSession) {
              resolve(null);
              return;
            }
            resolve({
              user: extractUser(newSession),
              tokens: extractTokens(newSession),
            });
          },
        );
      },
    );
  });
}
