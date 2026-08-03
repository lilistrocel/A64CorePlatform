import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authService, isMfaRequired, type User, type LoginCredentials, type RegisterData } from '../services/auth.service';
import { useDivisionStore } from './division.store';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // MFA state for two-step login flow
  mfaRequired: boolean;
  mfaPendingToken: string | null;
  mfaPendingUserId: string | null;

  // Cloudflare Access: set when a cfAccessLogin() attempt resolves to
  // "account recognized by the IdP but awaiting admin approval" (403
  // pending_activation). Not persisted — see partialize below.
  pendingActivation: boolean;
  /** Best-effort email surfaced by the pending_activation error payload, for display only. */
  pendingActivationEmail: string | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Attempt to exchange the Cloudflare Access edge session for app tokens.
   * Resolves silently on success (including the MFA-challenge branch, which
   * reuses the same mfaRequired/mfaPendingToken state as password login).
   * On the pending_activation outcome, sets pendingActivation instead of
   * throwing. Any other failure (401 no CF session, 404 disabled, etc.) is
   * re-thrown so callers can decide how to react — ProtectedRoute swallows
   * it, Login's explicit button click surfaces a message.
   */
  cfAccessLogin: () => Promise<void>;
  loadUser: () => Promise<void>;
  /**
   * Refresh the authenticated user's data by calling GET /auth/me.
   * Used after operations that change the user document (e.g., org assignment)
   * to reflect the new organizationId in the client-side store without
   * requiring a full logout/login cycle.
   */
  refreshUser: () => Promise<void>;
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

      // Cloudflare Access state
      pendingActivation: false,
      pendingActivationEmail: null,

      initializeAuth: () => {
        // Check if tokens exist in localStorage
        const hasToken = authService.isAuthenticated();
        set({ isAuthenticated: hasToken });

        // Don't automatically load user here - let ProtectedRoute handle it
        // This prevents unnecessary API calls on page load
      },

      login: async (credentials) => {
        set({
          isLoading: true,
          error: null,
          mfaRequired: false,
          mfaPendingToken: null,
          mfaPendingUserId: null,
          pendingActivation: false,
          pendingActivationEmail: null,
        });
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

      cfAccessLogin: async () => {
        set({
          isLoading: true,
          error: null,
          pendingActivation: false,
          pendingActivationEmail: null,
          mfaRequired: false,
          mfaPendingToken: null,
          mfaPendingUserId: null,
        });
        try {
          const response = await authService.cfAccessSession();

          if (isMfaRequired(response)) {
            set({
              isLoading: false,
              mfaRequired: true,
              mfaPendingToken: response.mfaToken,
              mfaPendingUserId: response.userId,
              error: null,
            });
            return;
          }

          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
            mfaRequired: false,
            mfaPendingToken: null,
            mfaPendingUserId: null,
            pendingActivation: false,
            pendingActivationEmail: null,
          });
        } catch (error: any) {
          // FastAPI wraps whatever a route passes as `detail`, so a dict detail
          // arrives as {detail: {detail, status}} — one level deeper than a
          // plain-string detail. Read both shapes: the nested one is what the
          // backend actually sends today, the flat one guards against the
          // wrapper changing. Getting this wrong made a successful Cloudflare
          // sign-in show "Unable to sign in" instead of the pending screen.
          const body = error?.response?.data;
          const payload =
            body && typeof body.detail === 'object' && body.detail !== null
              ? body.detail
              : body;

          if (error?.response?.status === 403 && payload?.status === 'pending_activation') {
            set({
              isLoading: false,
              error: null,
              pendingActivation: true,
              // Best-effort — only set if the backend actually included it.
              pendingActivationEmail: typeof payload?.email === 'string'
                ? payload.email
                : null,
            });
            return;
          }

          // 401 (no CF session at the edge), 404 (CF Access disabled on this
          // deployment), or any other failure. These are EXPECTED outcomes
          // for password-only users and for ProtectedRoute's silent
          // background attempt, so no global error banner is set here —
          // callers that need to react (Login page's explicit button click)
          // catch the re-thrown error themselves.
          set({ isLoading: false });
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
            pendingActivation: false,
            pendingActivationEmail: null,
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
            pendingActivation: false,
            pendingActivationEmail: null,
          });
        } finally {
          // Always clear division state on logout so the next user starts fresh
          useDivisionStore.getState().clearDivisionState();
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

      refreshUser: async () => {
        // Silently refresh the user document from GET /auth/me.
        // Does not set isLoading to avoid full-page loading states — this is a
        // background refresh triggered after in-page mutations (e.g. org assignment).
        if (!authService.isAuthenticated()) return;
        try {
          const user = await authService.getCurrentUser();
          set({ user, isAuthenticated: true });
        } catch {
          // Non-fatal — if refresh fails, the old user state remains.
          // The user may need to log out and back in for the change to appear.
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
