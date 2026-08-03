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
  /**
   * The authenticated user. This is the full `User` shape, not a subset —
   * it previously declared a narrow inline type carrying `id` but neither
   * `userId` nor `organizationId`, which made every `set({ user: response.user })`
   * in auth.store.ts a type error even though the runtime payload was correct.
   * The backend returns `userId` (see UserResponse in src/models/user.py).
   */
  user: User;
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

/**
 * Status of Cloudflare Access integration on this deployment.
 * GET /api/v1/auth/cf-access/status — public, no auth required.
 */
export interface CfAccessStatusResponse {
  /** Whether Cloudflare Access sign-in is available at all. */
  enabled: boolean;
  /** Phase 2: when true, password login/register are local-only break-glass. */
  exclusive: boolean;
}

/** localStorage key tracking which flow issued the current session's tokens. */
const AUTH_METHOD_KEY = 'authMethod';

export interface User {
  /** Legacy field — backend may return this alongside userId. Prefer userId. */
  id?: string;
  /** Primary key on the runtime object — always present after login. */
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  permissions: string[];
  /** Organization the user belongs to. null for super_admin platform users. */
  organizationId: string | null;
  /** Divisions the user has access to. */
  divisionAccess?: string[];
  /** User's default division. */
  defaultDivisionId?: string | null;
  timezone?: string;
  locale?: string;
  phone?: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  mfaEnabled?: boolean;
  mfaSetupRequired?: boolean;
  /** Which credential flow provisioned/authenticates this account. */
  authProvider?: 'password' | 'cloudflare_access';
  /**
   * True when firstName/lastName were auto-derived from the email
   * local-part at provisioning time (e.g. a Cloudflare Access JIT-provisioned
   * account) rather than entered by a human. Backend clears this the moment
   * the user edits either name field via PATCH /api/v1/auth/me. Optional
   * because accounts created before this field existed, and any backend
   * response predating it, simply omit it — treated as `false`/undetermined.
   */
  nameAutoDerived?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  /** Memoized cf-access/status lookup — shared across all callers for the page's lifetime. */
  private cfAccessStatusPromise: Promise<CfAccessStatusResponse> | null = null;

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

    // Mark this session as password-originated. Set unconditionally (even
    // before the MFA branch resolves) so logout() never mistakes a completed
    // password+MFA login for a Cloudflare Access one — see cfAccessSession()
    // for the mirrored CF-side marker.
    localStorage.setItem(AUTH_METHOD_KEY, 'password');

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
    // Registration is always password-based.
    localStorage.setItem(AUTH_METHOD_KEY, 'password');

    // Return camelCase response
    return {
      accessToken,
      refreshToken,
      user: response.data.user
    };
  }

  /**
   * Logout user
   *
   * Cloudflare-aware: clearing our own localStorage tokens does NOT clear
   * Cloudflare Access's `CF_Authorization` cookie. If we stopped here, the
   * very next page load would silently re-authenticate through Cloudflare
   * and the "logout" would appear to do nothing. When the session that is
   * ending originated from the Cloudflare exchange (tracked via the
   * `authMethod` flag set by cfAccessSession()/login()), a full-page,
   * same-origin navigation to /cdn-cgi/access/logout lets Cloudflare
   * intercept the request at the edge and clear its own cookie — there is
   * no fetch/XHR equivalent that reaches the edge the same way, so this
   * MUST be a real top-level navigation, not a background request.
   */
  async logout(): Promise<void> {
    // Capture BEFORE clearing — read once, act on it after cleanup below.
    const authMethod = localStorage.getItem(AUTH_METHOD_KEY);

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
      localStorage.removeItem(AUTH_METHOD_KEY);
    }

    if (authMethod === 'cloudflare_access') {
      window.location.href = '/cdn-cgi/access/logout';
    }
  }

  /**
   * Cloudflare Access status for this deployment. Public, no auth required —
   * safe to call before any session exists so the login page can render
   * correctly. Memoized: the underlying network call only happens once per
   * page load; every subsequent call (including from a different component,
   * e.g. Login.tsx AND ProtectedRoute mounting independently) shares the
   * same in-flight/resolved promise instead of refetching per route change.
   */
  cfAccessStatus(): Promise<CfAccessStatusResponse> {
    if (!this.cfAccessStatusPromise) {
      this.cfAccessStatusPromise = axios
        .get<CfAccessStatusResponse>(`${API_URL}/v1/auth/cf-access/status`)
        .then((response) => response.data)
        .catch((error) => {
          // Allow a fresh attempt on the next call site rather than caching a failure.
          this.cfAccessStatusPromise = null;
          throw error;
        });
    }
    return this.cfAccessStatusPromise;
  }

  /**
   * Exchange the Cloudflare Access edge session for our own app JWT.
   *
   * No request body — Cloudflare's `Cf-Access-Jwt-Assertion` header (or the
   * `CF_Authorization` cookie) is added automatically by the edge/browser,
   * so this is a plain POST. Possible outcomes (caller/store handles each):
   *  - 200 TokenResponse shape           -> tokens stored below, resolved
   *  - 200 MFA-challenge shape           -> resolved, no tokens stored yet
   *  - 403 {status: "pending_activation"} -> rejects; store reads the flag
   *  - 404 (CF Access disabled)          -> rejects
   *  - 401 (no valid CF Access session)  -> rejects
   */
  async cfAccessSession(): Promise<AuthResponse | MfaLoginRequiredResponse> {
    // Mark the flow as CF-originated up front, before we know the outcome.
    // Even the pending-activation (403) case benefits: the "Sign out" action
    // on the pending screen should still clear the CF edge cookie, not just
    // our (nonexistent) local tokens. A subsequent successful password
    // login overwrites this via login()'s own marker.
    localStorage.setItem(AUTH_METHOD_KEY, 'cloudflare_access');

    const response = await axios.post<any>(`${API_URL}/v1/auth/cf-access/session`);

    if (response.data.mfaRequired === true) {
      return {
        mfaRequired: true,
        mfaToken: response.data.mfaToken,
        userId: response.data.userId,
        message: response.data.message || 'MFA verification required',
      };
    }

    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;

    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    return {
      accessToken,
      refreshToken,
      user: response.data.user,
    };
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
