import axios from 'axios';
import { apiClient } from './api';

// Use nginx proxy (port 80) for all API calls including auth
// Automatically use host.docker.internal if the page is accessed that way (for Playwright MCP testing)
const getApiUrl = () => {
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'host.docker.internal') {
      return 'http://host.docker.internal/api';
    }
    // Use relative URL to work on any domain (production, staging, etc.)
    return '/api';
  }
  return import.meta.env.VITE_API_URL || '/api';
};

const API_URL = getApiUrl();

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    permissions: string[];
    mfaEnabled?: boolean;
    mfaSetupRequired?: boolean;
  };
}

/**
 * Response returned when MFA is required during login.
 * User must then call verifyMfa with the mfaToken and TOTP code.
 */
export interface MfaLoginRequiredResponse {
  mfaRequired: true;
  mfaToken: string;
  userId: string;
  message: string;
}

/**
 * Type guard to check if login response requires MFA
 */
export function isMfaRequired(response: any): response is MfaLoginRequiredResponse {
  return response && response.mfaRequired === true && typeof response.mfaToken === 'string';
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  permissions: string[];
  timezone?: string;
  locale?: string;
  phone?: string;
  mfaEnabled?: boolean;
  mfaSetupRequired?: boolean;
}

class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    // Load tokens from localStorage on initialization
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  /**
   * Login user with email and password
   * Returns AuthResponse for successful login, or MfaLoginRequiredResponse if MFA is required
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse | MfaLoginRequiredResponse> {
    // Use regular axios for login (no auth token needed)
    const response = await axios.post<any>(`${API_URL}/v1/auth/login`, credentials);

    // Check if MFA is required (mfaRequired=true in response)
    if (response.data.mfaRequired === true) {
      // Return MFA challenge - don't store tokens yet
      return {
        mfaRequired: true,
        mfaToken: response.data.mfaToken,
        userId: response.data.userId,
        message: response.data.message || 'MFA verification required',
      };
    }

    // Backend returns snake_case (access_token, refresh_token)
    // Convert to camelCase for frontend
    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;

    // Store tokens
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    // Return camelCase response
    return {
      accessToken,
      refreshToken,
      user: response.data.user
    };
  }

  /**
   * Register new user (returns tokens for auto-login)
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    // Use regular axios for register (no auth token needed)
    const response = await axios.post<any>(`${API_URL}/v1/auth/register`, data);

    // Backend returns snake_case (access_token, refresh_token)
    // Convert to camelCase for frontend
    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;

    // Store tokens
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    // Return camelCase response
    return {
      accessToken,
      refreshToken,
      user: response.data.user
    };
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      // Only call backend logout if we have a token
      if (this.accessToken) {
        // Use apiClient which will attach the token automatically
        await apiClient.post('/v1/auth/logout');
      }
    } catch (error) {
      // Silently handle logout errors - we'll clear tokens anyway
      console.debug('Logout API call failed (tokens will still be cleared):', error);
    } finally {
      // Clear tokens regardless of API call success
      this.accessToken = null;
      this.refreshToken = null;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<User> {
    // Use apiClient which will attach the token automatically
    const response = await apiClient.get<User>('/v1/auth/me');
    return response.data;
  }

  /**
   * Update current user's profile
   */
  async updateProfile(data: Partial<Pick<User, 'firstName' | 'lastName' | 'timezone' | 'locale' | 'phone'>>): Promise<User> {
    const response = await apiClient.patch<User>('/v1/auth/me', data);
    return response.data;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(): Promise<string> {
    // Backend expects snake_case (refresh_token) and returns snake_case (access_token, refresh_token)
    const response = await axios.post<{ access_token: string; refresh_token: string }>(`${API_URL}/v1/auth/refresh`, {
      refresh_token: this.refreshToken
    });

    // Store both tokens (backend implements rotating refresh tokens)
    this.accessToken = response.data.access_token;
    this.refreshToken = response.data.refresh_token;
    localStorage.setItem('accessToken', this.accessToken);
    localStorage.setItem('refreshToken', this.refreshToken);

    return this.accessToken;
  }

  /**
   * Get access token
   */
  getAccessToken(): string | null {
    // Always get fresh token from localStorage
    return localStorage.getItem('accessToken');
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    // Check localStorage directly for most up-to-date value
    const token = localStorage.getItem('accessToken');
    return !!token;
  }

  /**
   * Get MFA status for the authenticated user
   * Returns: isEnabled, setupRequired, backupCodesRemaining, lastUsed
   */
  async getMfaStatus(): Promise<MfaStatusResponse> {
    const response = await apiClient.get<MfaStatusResponse>('/v1/auth/mfa/status');
    return response.data;
  }

  /**
   * Verify MFA code to complete login
   * @param mfaToken Temporary MFA token from login response
   * @param code 6-digit TOTP code or 8-character backup code
   */
  async verifyMfa(mfaToken: string, code: string): Promise<AuthResponse & MfaVerifyResponseExtras> {
    const response = await axios.post<any>(`${API_URL}/v1/auth/mfa/verify`, {
      mfaToken,
      code,
    });

    // Backend returns snake_case
    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;

    // Store tokens
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    // Return camelCase response with extras
    return {
      accessToken,
      refreshToken,
      user: response.data.user,
      warning: response.data.warning || null,
      backupCodesRemaining: response.data.backup_codes_remaining ?? null,
    };
  }

  /**
   * Regenerate MFA backup codes
   * Requires verification with current TOTP code and password
   * @param totpCode 6-digit TOTP code from authenticator app
   * @param password Current password for additional security
   */
  async regenerateBackupCodes(totpCode: string, password: string): Promise<RegenerateBackupCodesResponse> {
    const response = await apiClient.post<RegenerateBackupCodesResponse>('/v1/auth/mfa/backup-codes', {
      totpCode,
      password,
    });
    return response.data;
  }
}

export interface RegenerateBackupCodesResponse {
  enabled: boolean;
  backupCodes: string[];
  message: string;
}

export interface MfaStatusResponse {
  isEnabled: boolean;
  setupRequired: boolean;
  backupCodesRemaining: number;
  lastUsed: string | null;
  // Legacy fields for backward compatibility
  mfaEnabled?: boolean;
  mfaSetupPending?: boolean;
  hasBackupCodes?: boolean;
}

export interface MfaVerifyResponseExtras {
  warning: string | null;
  backupCodesRemaining: number | null;
}

// Export singleton instance
export const authService = new AuthService();
