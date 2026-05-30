/**
 * Authentication Service
 *
 * Handles user authentication with Amazon Cognito using JWT tokens.
 * Provides methods for sign-in, sign-up, sign-out, and token management.
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
  CognitoUserAttribute,
  ISignUpResult
} from 'amazon-cognito-identity-js';

// Configuration from environment variables
const userPoolId = import.meta.env.VITE_USER_POOL_ID;
const clientId = import.meta.env.VITE_USER_POOL_CLIENT_ID;

if (!userPoolId || !clientId) {
  console.error('Missing Cognito configuration. Please set VITE_USER_POOL_ID and VITE_USER_POOL_CLIENT_ID');
}

// Create Cognito User Pool
const userPool = new CognitoUserPool({
  UserPoolId: userPoolId || '',
  ClientId: clientId || ''
});

export interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

export interface UserInfo {
  email: string;
  sub: string;  // User ID
  emailVerified: boolean;
}

/**
 * Authentication Service Class
 */
export class AuthService {
  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string): Promise<AuthTokens> {
    return new Promise((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: email,
        Password: password
      });

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool
      });

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (session: CognitoUserSession) => {
          console.log('✅ Authentication successful');
          resolve({
            accessToken: session.getAccessToken().getJwtToken(),
            idToken: session.getIdToken().getJwtToken(),
            refreshToken: session.getRefreshToken().getToken()
          });
        },
        onFailure: (err) => {
          console.error('❌ Authentication failed:', err);
          reject(err);
        },
        newPasswordRequired: () => {
          reject(new Error('New password required. Please contact support.'));
        }
      });
    });
  }

  /**
   * Sign up a new user
   */
  async signUp(email: string, password: string): Promise<ISignUpResult> {
    return new Promise((resolve, reject) => {
      const attributeList = [
        new CognitoUserAttribute({
          Name: 'email',
          Value: email
        })
      ];

      userPool.signUp(email, password, attributeList, [], (err, result) => {
        if (err) {
          console.error('❌ Sign up failed:', err);
          reject(err);
          return;
        }

        if (result) {
          console.log('✅ Sign up successful:', result.user.getUsername());
          resolve(result);
        } else {
          reject(new Error('Sign up failed with unknown error'));
        }
      });
    });
  }

  /**
   * Confirm sign up with verification code
   */
  async confirmSignUp(email: string, code: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool
      });

      cognitoUser.confirmRegistration(code, true, (err, result) => {
        if (err) {
          console.error('❌ Confirmation failed:', err);
          reject(err);
          return;
        }
        console.log('✅ Email confirmed successfully');
        resolve(result);
      });
    });
  }

  /**
   * Resend verification code
   */
  async resendConfirmationCode(email: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool
      });

      cognitoUser.resendConfirmationCode((err, result) => {
        if (err) {
          console.error('❌ Resend code failed:', err);
          reject(err);
          return;
        }
        console.log('✅ Confirmation code resent');
        resolve(result);
      });
    });
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser(): CognitoUser | null {
    return userPool.getCurrentUser();
  }

  /**
   * Get current user session
   */
  async getCurrentSession(): Promise<CognitoUserSession | null> {
    const currentUser = this.getCurrentUser();
    if (!currentUser) {
      return null;
    }

    return new Promise((resolve, reject) => {
      currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err) {
          console.error('❌ Failed to get session:', err);
          reject(err);
          return;
        }

        if (session && session.isValid()) {
          resolve(session);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Get access token (JWT) for API authentication
   */
  async getAccessToken(): Promise<string | null> {
    try {
      const session = await this.getCurrentSession();
      if (!session) {
        return null;
      }

      const accessToken = session.getAccessToken().getJwtToken();
      console.log('🔑 Access token retrieved');
      return accessToken;
    } catch (error) {
      console.error('❌ Failed to get access token:', error);
      return null;
    }
  }

  /**
   * Get ID token (JWT) with user identity claims
   */
  async getIdToken(): Promise<string | null> {
    try {
      const session = await this.getCurrentSession();
      return session?.getIdToken().getJwtToken() || null;
    } catch (error) {
      console.error('❌ Failed to get ID token:', error);
      return null;
    }
  }

  /**
   * Get user information from ID token
   */
  async getUserInfo(): Promise<UserInfo | null> {
    try {
      const session = await this.getCurrentSession();
      if (!session) {
        return null;
      }

      const idToken = session.getIdToken();
      const payload = idToken.payload;

      return {
        email: payload.email || '',
        sub: payload.sub || '',
        emailVerified: payload.email_verified === 'true' || payload.email_verified === true
      };
    } catch (error) {
      console.error('❌ Failed to get user info:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const session = await this.getCurrentSession();
      return session !== null && session.isValid();
    } catch (error) {
      return false;
    }
  }

  /**
   * Sign out current user
   */
  signOut(): void {
    const currentUser = this.getCurrentUser();
    if (currentUser) {
      currentUser.signOut();
      console.log('👋 User signed out');
    }
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const currentUser = this.getCurrentUser();
      if (!currentUser) {
        reject(new Error('No authenticated user'));
        return;
      }

      currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session) {
          reject(err || new Error('Failed to get session'));
          return;
        }

        currentUser.changePassword(oldPassword, newPassword, (err, result) => {
          if (err) {
            console.error('❌ Password change failed:', err);
            reject(err);
            return;
          }
          console.log('✅ Password changed successfully');
          resolve(result || 'Password changed successfully');
        });
      });
    });
  }

  /**
   * Initiate forgot password flow
   */
  async forgotPassword(email: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool
      });

      cognitoUser.forgotPassword({
        onSuccess: (data) => {
          console.log('✅ Password reset code sent');
          resolve(data);
        },
        onFailure: (err) => {
          console.error('❌ Forgot password failed:', err);
          reject(err);
        }
      });
    });
  }

  /**
   * Confirm new password with verification code
   */
  async confirmPassword(email: string, code: string, newPassword: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool
      });

      cognitoUser.confirmPassword(code, newPassword, {
        onSuccess: () => {
          console.log('✅ Password reset successful');
          resolve('Password reset successful');
        },
        onFailure: (err) => {
          console.error('❌ Password confirmation failed:', err);
          reject(err);
        }
      });
    });
  }

  /**
   * Refresh the current session
   */
  async refreshSession(): Promise<CognitoUserSession | null> {
    return new Promise((resolve, reject) => {
      const currentUser = this.getCurrentUser();
      if (!currentUser) {
        resolve(null);
        return;
      }

      currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session) {
          reject(err || new Error('Failed to get session'));
          return;
        }

        const refreshToken = session.getRefreshToken();

        currentUser.refreshSession(refreshToken, (err, newSession) => {
          if (err) {
            console.error('❌ Session refresh failed:', err);
            reject(err);
            return;
          }

          console.log('✅ Session refreshed');
          resolve(newSession);
        });
      });
    });
  }
}

// Export singleton instance
export const authService = new AuthService();

// Export type for easier imports
export type { CognitoUserSession };
