import axios from 'axios';
import { apiClient } from './api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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
    const response = await axios.post<AuthResponse>(`${API_URL}/v1/auth/login`, credentials);

    // Store tokens
    this.accessToken = response.data.accessToken;
    this.refreshToken = response.data.refreshToken;
    localStorage.setItem('accessToken', this.accessToken);
    localStorage.setItem('refreshToken', this.refreshToken);

    return response.data;
  }

  /**
   * Register new user
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    // Use regular axios for register (no auth token needed)
    const response = await axios.post<AuthResponse>(`${API_URL}/v1/auth/register`, data);

    // Store tokens
    this.accessToken = response.data.accessToken;
    this.refreshToken = response.data.refreshToken;
    localStorage.setItem('accessToken', this.accessToken);
    localStorage.setItem('refreshToken', this.refreshToken);

    return response.data;
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
   * Refresh access token using refresh token
   */
  async refreshAccessToken(): Promise<string> {
    const response = await axios.post<{ accessToken: string }>(`${API_URL}/v1/auth/refresh`, {
      refreshToken: this.refreshToken
    });

    this.accessToken = response.data.accessToken;
    localStorage.setItem('accessToken', this.accessToken);

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
