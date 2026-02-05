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
  };
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  permissions: string[];
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
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    // Use regular axios for login (no auth token needed)
    const response = await axios.post<any>(`${API_URL}/v1/auth/login`, credentials);

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
  async updateProfile(data: Partial<Pick<User, 'firstName' | 'lastName'>> & { phone?: string }): Promise<User> {
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
}

// Export singleton instance
export const authService = new AuthService();
