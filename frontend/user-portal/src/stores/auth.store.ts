import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authService, type User, type LoginCredentials, type RegisterData } from '../services/auth.service';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  clearError: () => void;
  initializeAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      initializeAuth: () => {
        // Check if tokens exist in localStorage
        const hasToken = authService.isAuthenticated();
        set({ isAuthenticated: hasToken });

        // Don't automatically load user here - let ProtectedRoute handle it
        // This prevents unnecessary API calls on page load
      },

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.login(credentials);
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.message || 'Login failed. Please try again.',
          });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.register(data);
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.message || 'Registration failed. Please try again.',
          });
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await authService.logout();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          set({ isLoading: false });
          // Logout locally even if API call fails
          set({
            user: null,
            isAuthenticated: false,
            error: null,
          });
        }
      },

      loadUser: async () => {
        if (!authService.isAuthenticated()) {
          set({ isAuthenticated: false, user: null });
          return;
        }

        set({ isLoading: true });
        try {
          const user = await authService.getCurrentUser();
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: any) {
          // If token is invalid, clear authentication
          await authService.logout();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Initialize auth on app start
if (typeof window !== 'undefined') {
  useAuthStore.getState().initializeAuth();

  // Cross-tab session synchronization
  // Listen for localStorage changes from other tabs to detect logout/login
  window.addEventListener('storage', (event) => {
    // Detect token removal (logout in another tab)
    if (event.key === 'accessToken' && event.newValue === null) {
      // Another tab logged out - clear auth state in this tab too
      useAuthStore.setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }

    // Detect token added (login in another tab)
    if (event.key === 'accessToken' && event.newValue && !event.oldValue) {
      // Another tab logged in - update auth state
      useAuthStore.setState({ isAuthenticated: true });
      useAuthStore.getState().loadUser();
    }

    // Detect Zustand auth-storage changes (covers persist middleware updates)
    if (event.key === 'auth-storage' && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        const state = parsed.state || parsed;
        if (state.isAuthenticated === false) {
          // Another tab logged out via Zustand persist
          useAuthStore.setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        } else if (state.isAuthenticated === true && state.user) {
          // Another tab logged in - sync user data
          useAuthStore.setState({
            user: state.user,
            isAuthenticated: true,
          });
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
  });
}
