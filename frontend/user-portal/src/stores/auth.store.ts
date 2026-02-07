import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authService, isMfaRequired, type User, type LoginCredentials, type RegisterData } from '../services/auth.service';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // MFA state for two-step login flow
  mfaRequired: boolean;
  mfaPendingToken: string | null;
  mfaPendingUserId: string | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  clearError: () => void;
  initializeAuth: () => void;
  verifyMfa: (code: string) => Promise<void>;
  clearMfaState: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // MFA state
      mfaRequired: false,
      mfaPendingToken: null,
      mfaPendingUserId: null,

      initializeAuth: () => {
        // Check if tokens exist in localStorage
        const hasToken = authService.isAuthenticated();
        set({ isAuthenticated: hasToken });

        // Don't automatically load user here - let ProtectedRoute handle it
        // This prevents unnecessary API calls on page load
      },

      login: async (credentials) => {
        set({ isLoading: true, error: null, mfaRequired: false, mfaPendingToken: null, mfaPendingUserId: null });
        try {
          const response = await authService.login(credentials);

          // Check if MFA verification is required
          if (isMfaRequired(response)) {
            // Store temporary MFA token and redirect to MFA verification
            set({
              isLoading: false,
              mfaRequired: true,
              mfaPendingToken: response.mfaToken,
              mfaPendingUserId: response.userId,
              error: null,
            });
            // Don't throw - login page should check mfaRequired and redirect
            return;
          }

          // Normal login - no MFA required
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
            mfaRequired: false,
            mfaPendingToken: null,
            mfaPendingUserId: null,
          });
        } catch (error: any) {
          const errorMessage = error.response?.data?.detail || error.response?.data?.message || 'Invalid email or password. Please try again.';
          set({
            isLoading: false,
            error: typeof errorMessage === 'string' ? errorMessage : 'Invalid email or password. Please try again.',
            mfaRequired: false,
            mfaPendingToken: null,
            mfaPendingUserId: null,
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
          const regErrorMessage = error.response?.data?.detail || error.response?.data?.message || 'Registration failed. Please try again.';
          set({
            isLoading: false,
            error: typeof regErrorMessage === 'string' ? regErrorMessage : 'Registration failed. Please try again.',
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
            mfaRequired: false,
            mfaPendingToken: null,
            mfaPendingUserId: null,
          });
        } catch (error: any) {
          set({ isLoading: false });
          // Logout locally even if API call fails
          set({
            user: null,
            isAuthenticated: false,
            error: null,
            mfaRequired: false,
            mfaPendingToken: null,
            mfaPendingUserId: null,
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

      verifyMfa: async (code: string) => {
        const { mfaPendingToken } = get();
        if (!mfaPendingToken) {
          set({ error: 'No MFA session pending. Please login again.' });
          throw new Error('No MFA session pending');
        }

        set({ isLoading: true, error: null });
        try {
          const response = await authService.verifyMfa(mfaPendingToken, code);
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
            mfaRequired: false,
            mfaPendingToken: null,
            mfaPendingUserId: null,
          });
        } catch (error: any) {
          const errorMessage = error.response?.data?.detail || error.response?.data?.message || 'Invalid verification code. Please try again.';
          set({
            isLoading: false,
            error: typeof errorMessage === 'string' ? errorMessage : 'Invalid verification code. Please try again.',
          });
          throw error;
        }
      },

      clearMfaState: () => {
        set({
          mfaRequired: false,
          mfaPendingToken: null,
          mfaPendingUserId: null,
        });
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
