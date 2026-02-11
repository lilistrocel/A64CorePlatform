import axios, { AxiosError } from 'axios';
import type { AxiosRequestConfig } from 'axios';
import { showErrorToast, showWarningToast } from '../stores/toast.store';

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

// Token refresh state management - prevents race conditions when multiple requests fail with 401
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: AxiosError) => void;
}> = [];

// 429 rate limit toast debounce - only show one warning per 5 seconds
let lastRateLimitToast = 0;
const RATE_LIMIT_TOAST_DEBOUNCE = 5000;

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

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

// Response interceptor to handle token refresh with queue to prevent race conditions
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean; _rateLimitRetry?: boolean; headers: Record<string, string> };

    // Handle 429 rate limit - wait and retry once
    if (error.response?.status === 429 && !originalRequest._rateLimitRetry) {
      originalRequest._rateLimitRetry = true;

      // Show debounced warning toast (yellow, not red)
      const now = Date.now();
      if (now - lastRateLimitToast > RATE_LIMIT_TOAST_DEBOUNCE) {
        lastRateLimitToast = now;
        showWarningToast('Slowing down requests. Please wait a moment.');
      }

      // Parse Retry-After header (seconds), default to 5s, cap at 30s
      const retryAfter = error.response.headers?.['retry-after'];
      const waitSeconds = Math.min(retryAfter ? parseInt(retryAfter, 10) : 5, 30);

      // Wait then retry once
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
      return apiClient(originalRequest);
    }

    // If error is 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      // If already refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

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

          // Process queued requests with new token
          processQueue(null, access_token);

          // Update the failed request with new token
          originalRequest.headers.Authorization = `Bearer ${access_token}`;

          // Retry the original request
          return apiClient(originalRequest);
        } else {
          // No refresh token available - redirect to login
          processQueue(error, null);
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login?expired=true';
          return Promise.reject(error);
        }
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        processQueue(refreshError as AxiosError, null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login?expired=true';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Show error toast for API errors (except 401/429 which are handled above)
    if (error.response) {
      const status = error.response.status;
      // Don't show toast for 401 (handled by redirect), 429 (handled by backoff/warning toast)
      if (status !== 401 && status !== 429) {
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

  // For 500 errors, ALWAYS use the default user-friendly message
  // This prevents leaking internal error details, stack traces, or exception messages
  if (status >= 500) return getDefaultErrorMessage(status);

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
