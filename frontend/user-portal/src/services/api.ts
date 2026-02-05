import axios from 'axios';
import { showErrorToast } from '../stores/toast.store';

// Use nginx proxy (port 80) instead of direct API (port 8000)
// This allows nginx to route /api/v1/farm/* to farm-management:8001
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

// Create axios instance
export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    // Get token from localStorage
    const accessToken = localStorage.getItem('accessToken');

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh the token
        const refreshToken = localStorage.getItem('refreshToken');

        if (refreshToken) {
          // Backend expects snake_case (refresh_token) and returns snake_case (access_token, refresh_token)
          const response = await axios.post(`${API_URL}/v1/auth/refresh`, {
            refresh_token: refreshToken,
          });

          const access_token = response.data.access_token;
          const new_refresh_token = response.data.refresh_token;

          // Update both tokens in localStorage (backend uses rotating refresh tokens)
          localStorage.setItem('accessToken', access_token);
          localStorage.setItem('refreshToken', new_refresh_token);

          // Update the failed request with new token
          originalRequest.headers.Authorization = `Bearer ${access_token}`;

          // Retry the original request
          return apiClient(originalRequest);
        } else {
          // No refresh token available - redirect to login
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login?expired=true';
          return Promise.reject(error);
        }
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login?expired=true';
        return Promise.reject(refreshError);
      }
    }

    // Show error toast for API errors (except 401 which is handled by token refresh above)
    if (error.response) {
      const status = error.response.status;
      // Don't show toast for 401 (handled by redirect) or if this was a retry request
      if (status !== 401 || originalRequest._retry) {
        const message = extractErrorMessage(error.response.data, status);
        showErrorToast(message);
      }
    } else if (error.request) {
      // Network error (no response received)
      showErrorToast('Network error. Please check your connection and try again.');
    }

    return Promise.reject(error);
  }
);

// Extract a human-readable error message from API error response data
function extractErrorMessage(data: any, status: number): string {
  if (!data) return getDefaultErrorMessage(status);

  // Handle string detail (most common: "Campaign not found", etc.)
  if (typeof data.detail === 'string') return data.detail;

  // Handle FastAPI validation errors: detail is an array of objects with 'msg' field
  if (Array.isArray(data.detail) && data.detail.length > 0) {
    const firstError = data.detail[0];
    if (firstError.msg) {
      const field = firstError.loc?.slice(-1)?.[0] || '';
      return field ? `${field}: ${firstError.msg}` : firstError.msg;
    }
    return getDefaultErrorMessage(status);
  }

  // Handle other message formats
  if (typeof data.message === 'string') return data.message;
  if (typeof data.error === 'string') return data.error;

  return getDefaultErrorMessage(status);
}

// Default error messages based on HTTP status codes
function getDefaultErrorMessage(status: number): string {
  switch (status) {
    case 400: return 'Bad request. Please check your input.';
    case 403: return 'You do not have permission to perform this action.';
    case 404: return 'The requested resource was not found.';
    case 409: return 'Conflict. The resource may already exist.';
    case 422: return 'Validation error. Please check your input.';
    case 429: return 'Too many requests. Please try again later.';
    case 500: return 'Internal server error. Please try again later.';
    case 502: return 'Server is temporarily unavailable. Please try again.';
    case 503: return 'Service unavailable. Please try again later.';
    default: return `Request failed (${status}). Please try again.`;
  }
}

export default apiClient;
