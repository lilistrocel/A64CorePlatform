# Frontend Architecture

**Version:** 1.0.0
**Status:** Planning
**Created:** 2025-10-19
**Platform:** A64 Core Platform

---

## Overview

The A64 Core Platform frontend architecture consists of **two separate applications** (Admin Portal and User Portal) sharing a common component library. This document describes the technical architecture, technology stack, project structure, and development practices.

---

## Architecture Principles

### 1. Separation of Concerns
- **Admin Portal**: System administration (users, modules, configuration)
- **User Portal**: Business operations (CCM dashboard, modules, profiles)
- **Shared Library**: Common components, theme, services

### 2. Monorepo Structure
- Single repository with multiple packages
- Code sharing via npm workspaces
- Unified build and deployment

### 3. Component-Driven Development
- Reusable UI components
- Consistent design system
- Isolated development and testing

### 4. Type Safety
- TypeScript throughout
- Strict type checking
- API contract validation

### 5. Performance First
- Code splitting
- Lazy loading
- Optimized bundles
- Caching strategies

---

## Technology Stack

### Core Framework

**React 18**
- Component-based architecture
- Hooks for state management
- Concurrent rendering
- Suspense for data fetching

**TypeScript 5**
- Static type checking
- Better IDE support
- Reduced runtime errors
- Self-documenting code

### Build Tool

**Vite 5**
- Lightning-fast HMR
- Optimized production builds
- Native ES modules
- Plugin ecosystem

### Styling

**styled-components**
- CSS-in-JS
- Scoped styles
- Theme support
- Dynamic styling

### State Management

**Zustand**
- Lightweight (< 1KB)
- Simple API
- TypeScript support
- DevTools integration

### Data Fetching

**React Query (TanStack Query)**
- Server state management
- Automatic caching
- Background refetching
- Optimistic updates

**Axios**
- HTTP client
- Request/response interceptors
- TypeScript support
- Automatic JSON transformation

### Routing

**React Router v6**
- Declarative routing
- Nested routes
- Route-based code splitting
- Type-safe navigation

### Forms

**React Hook Form**
- Performance optimized
- Minimal re-renders
- Easy validation

**Zod**
- Schema validation
- TypeScript inference
- Runtime type checking

### UI Components

**Custom Component Library**
- Built with styled-components
- Based on design system
- Fully accessible (WCAG 2.1 AA)

**Optional: shadcn/ui**
- Headless components
- Copy-paste workflow
- Customizable

### Icons

**Lucide React**
- Modern icon library
- Tree-shakeable
- Consistent design
- 1000+ icons

### Testing

**Vitest**
- Unit testing framework
- Fast execution
- Jest-compatible API

**React Testing Library**
- Component testing
- User-centric tests
- Accessibility checking

**Playwright**
- End-to-end testing
- Cross-browser support
- Auto-wait mechanisms

---

## Project Structure

```
c:/Code/A64CorePlatform/
└── frontend/
    ├── package.json              # Root package (workspaces config)
    ├── tsconfig.json             # Base TypeScript config
    │
    ├── shared/                   # Shared Component Library
    │   ├── src/
    │   │   ├── components/       # Reusable UI components
    │   │   │   ├── common/
    │   │   │   │   ├── Button/
    │   │   │   │   │   ├── Button.tsx
    │   │   │   │   │   ├── Button.stories.tsx
    │   │   │   │   │   ├── Button.test.tsx
    │   │   │   │   │   └── index.ts
    │   │   │   │   ├── Input/
    │   │   │   │   ├── Card/
    │   │   │   │   ├── Modal/
    │   │   │   │   └── [... more components]
    │   │   │   │
    │   │   │   ├── widgets/      # CCM Widget components
    │   │   │   │   ├── StatWidget/
    │   │   │   │   ├── ChartWidget/
    │   │   │   │   ├── TableWidget/
    │   │   │   │   └── [... more widgets]
    │   │   │   │
    │   │   │   └── layout/       # Layout components
    │   │   │       ├── Header/
    │   │   │       ├── Sidebar/
    │   │   │       └── Footer/
    │   │   │
    │   │   ├── theme/            # Design system
    │   │   │   ├── theme.ts      # Theme configuration
    │   │   │   ├── GlobalStyles.tsx
    │   │   │   └── colors.ts
    │   │   │
    │   │   ├── services/         # API services
    │   │   │   ├── api.ts        # Axios instance
    │   │   │   ├── auth.service.ts
    │   │   │   ├── user.service.ts
    │   │   │   ├── module.service.ts
    │   │   │   ├── widget.service.ts
    │   │   │   └── external-api.service.ts
    │   │   │
    │   │   ├── hooks/            # Custom React hooks
    │   │   │   ├── useAuth.ts
    │   │   │   ├── useApi.ts
    │   │   │   ├── usePermissions.ts
    │   │   │   ├── useWidgetData.ts
    │   │   │   └── useDashboardLayout.ts
    │   │   │
    │   │   ├── stores/           # Zustand stores
    │   │   │   ├── authStore.ts
    │   │   │   ├── userStore.ts
    │   │   │   └── moduleStore.ts
    │   │   │
    │   │   ├── types/            # TypeScript types
    │   │   │   ├── api.types.ts
    │   │   │   ├── auth.types.ts
    │   │   │   ├── user.types.ts
    │   │   │   ├── module.types.ts
    │   │   │   ├── widget.types.ts
    │   │   │   └── erp.types.ts
    │   │   │
    │   │   ├── utils/            # Utility functions
    │   │   │   ├── validators.ts
    │   │   │   ├── formatters.ts
    │   │   │   ├── permissions.ts
    │   │   │   └── storage.ts
    │   │   │
    │   │   └── index.ts          # Barrel exports
    │   │
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── vite.config.ts
    │
    ├── admin-portal/             # Admin Frontend
    │   ├── public/
    │   │   ├── index.html
    │   │   └── favicon-admin.ico
    │   │
    │   ├── src/
    │   │   ├── main.tsx          # Entry point
    │   │   ├── App.tsx           # Root component
    │   │   │
    │   │   ├── routes/           # Page components
    │   │   │   ├── index.tsx     # Route configuration
    │   │   │   ├── Dashboard.tsx
    │   │   │   ├── users/
    │   │   │   │   ├── UserList.tsx
    │   │   │   │   ├── UserDetail.tsx
    │   │   │   │   └── RoleManager.tsx
    │   │   │   ├── modules/
    │   │   │   │   ├── ModuleRegistry.tsx
    │   │   │   │   ├── ModuleInstall.tsx
    │   │   │   │   └── LicenseManager.tsx
    │   │   │   ├── system/
    │   │   │   │   ├── DatabaseConfig.tsx
    │   │   │   │   └── ServerHealth.tsx
    │   │   │   └── monitoring/
    │   │   │       ├── AuditLogs.tsx
    │   │   │       └── Performance.tsx
    │   │   │
    │   │   ├── components/       # Admin-specific components
    │   │   │   ├── layout/
    │   │   │   │   ├── AdminHeader.tsx
    │   │   │   │   ├── AdminSidebar.tsx
    │   │   │   │   └── AdminLayout.tsx
    │   │   │   └── charts/
    │   │   │       └── SystemMetrics.tsx
    │   │   │
    │   │   ├── stores/           # Admin-specific stores
    │   │   │   └── adminStore.ts
    │   │   │
    │   │   ├── theme/            # Admin theme (dark)
    │   │   │   └── admin-theme.ts
    │   │   │
    │   │   └── types/
    │   │       └── admin.types.ts
    │   │
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vite.config.ts
    │   ├── Dockerfile
    │   └── nginx.conf
    │
    └── user-portal/              # User Frontend
        ├── public/
        │   ├── index.html
        │   ├── manifest.json     # PWA manifest
        │   └── icons/
        │
        ├── src/
        │   ├── main.tsx
        │   ├── App.tsx
        │   │
        │   ├── routes/
        │   │   ├── index.tsx
        │   │   ├── auth/
        │   │   │   ├── Login.tsx
        │   │   │   ├── Register.tsx
        │   │   │   └── ForgotPassword.tsx
        │   │   ├── dashboard/
        │   │   │   ├── CCMDashboard.tsx
        │   │   │   ├── WidgetMarketplace.tsx
        │   │   │   └── DashboardSettings.tsx
        │   │   ├── profile/
        │   │   │   ├── Profile.tsx
        │   │   │   └── Settings.tsx
        │   │   ├── modules/
        │   │   │   ├── Marketplace.tsx
        │   │   │   ├── MyModules.tsx
        │   │   │   └── ModuleApp.tsx
        │   │   └── integrations/
        │   │       └── ExternalAPIs.tsx
        │   │
        │   ├── components/
        │   │   ├── layout/
        │   │   │   ├── Header.tsx
        │   │   │   ├── Sidebar.tsx
        │   │   │   └── MainLayout.tsx
        │   │   ├── dashboard/
        │   │   │   ├── GridLayout.tsx
        │   │   │   ├── WidgetRenderer.tsx
        │   │   │   └── AddWidgetButton.tsx
        │   │   └── modules/
        │   │       ├── ModuleCard.tsx
        │   │       └── ModuleIframe.tsx
        │   │
        │   ├── stores/
        │   │   ├── moduleStore.ts
        │   │   └── notificationStore.ts
        │   │
        │   ├── theme/
        │   │   └── user-theme.ts
        │   │
        │   └── types/
        │       └── user.types.ts
        │
        ├── package.json
        ├── tsconfig.json
        ├── vite.config.ts
        ├── Dockerfile
        └── nginx.conf
```

---

## Component Development

### Component Structure

Each component follows this structure:

```
Button/
├── Button.tsx           # Component implementation
├── Button.stories.tsx   # Storybook stories (optional)
├── Button.test.tsx      # Unit tests
├── Button.types.ts      # TypeScript types (if complex)
└── index.ts             # Barrel export
```

### Example Component

```typescript
// Button.tsx
import styled from 'styled-components';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({
  variant = 'primary',
  size = 'medium',
  disabled = false,
  children,
  onClick,
}: ButtonProps) {
  return (
    <StyledButton
      variant={variant}
      size={size}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </StyledButton>
  );
}

const StyledButton = styled.button<ButtonProps>`
  // Use theme for styling
  background: ${({ theme, variant }) =>
    variant === 'primary' ? theme.colors.primary[500] : 'transparent'};
  color: ${({ theme, variant }) =>
    variant === 'primary' ? 'white' : theme.colors.primary[500]};
  padding: ${({ theme, size }) =>
    size === 'small' ? theme.spacing.sm : theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-family: ${({ theme }) => theme.typography.fontFamily.primary};

  &:hover:not(:disabled) {
    background: ${({ theme, variant }) =>
      variant === 'primary' ? theme.colors.primary[700] : theme.colors.primary[50]};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
```

---

## State Management

### Global State (Zustand)

```typescript
// stores/authStore.ts
import create from 'zustand';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (email, password) => {
    const response = await authService.login(email, password);
    set({
      user: response.user,
      token: response.accessToken,
      isAuthenticated: true,
    });
  },

  logout: () => {
    localStorage.removeItem('access_token');
    set({ user: null, token: null, isAuthenticated: false });
  },
}));
```

### Server State (React Query)

```typescript
// hooks/useModules.ts
import { useQuery } from '@tanstack/react-query';
import { moduleService } from '../services/module.service';

export function useModules() {
  return useQuery({
    queryKey: ['modules'],
    queryFn: moduleService.getInstalled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });
}
```

---

## API Integration

### Axios Setup

```typescript
// services/api.ts
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Handle token refresh
      const refreshed = await refreshToken();
      if (refreshed) {
        return api(error.config);
      }
      // Redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

---

## Routing

### Route Configuration

```typescript
// routes/index.tsx
import { createBrowserRouter } from 'react-router-dom';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <CCMDashboard /> },
      { path: 'profile', element: <Profile /> },
      { path: 'modules', element: <ModuleMarketplace /> },
      { path: 'modules/:moduleName', element: <ModuleApp /> },
    ],
  },
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { path: 'login', element: <Login /> },
      { path: 'register', element: <Register /> },
    ],
  },
]);
```

### Protected Routes

```typescript
function ProtectedRoute({ children, requiredPermission }: Props) {
  const { isAuthenticated, user } = useAuthStore();
  const hasPermission = user?.permissions.includes(requiredPermission);

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" />;
  }

  if (!hasPermission) {
    return <div>Access Denied</div>;
  }

  return children;
}
```

---

## Build & Deployment

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@a64core/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
```

### Docker Configuration

```dockerfile
# Dockerfile (for both portals)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package*.json ./
COPY frontend/shared ./frontend/shared
COPY frontend/user-portal ./frontend/user-portal

# Install dependencies
RUN npm ci

# Build shared library
RUN npm run build --workspace=shared

# Build user portal
RUN npm run build --workspace=user-portal

# Production stage
FROM nginx:1.25-alpine

COPY --from=builder /app/frontend/user-portal/dist /usr/share/nginx/html
COPY frontend/user-portal/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

---

## Performance Optimization

### Code Splitting

```typescript
// Lazy load routes
const ModuleApp = lazy(() => import('./routes/modules/ModuleApp'));

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/modules/:moduleName" element={<ModuleApp />} />
      </Routes>
    </Suspense>
  );
}
```

### Bundle Size Monitoring

```bash
# Analyze bundle size
npm run build -- --analyze
```

### Caching Strategy

- API responses: React Query (5-60 minutes)
- Static assets: Browser cache (1 year)
- Service Worker: Cache first, network fallback

---

## Testing Strategy

### Unit Tests (Vitest)

```typescript
// Button.test.tsx
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { theme } from '@a64core/shared';
import { Button } from './Button';

describe('Button', () => {
  it('renders children', () => {
    render(
      <ThemeProvider theme={theme}>
        <Button>Click me</Button>
      </ThemeProvider>
    );
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <Button onClick={onClick}>Click me</Button>
      </ThemeProvider>
    );
    screen.getByText('Click me').click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

### E2E Tests (Playwright)

```typescript
// tests/e2e/login.spec.ts
import { test, expect } from '@playwright/test';

test('user can login', async ({ page }) => {
  await page.goto('/auth/login');

  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('h1')).toContainText('Dashboard');
});
```

---

## Security

### XSS Prevention
- Sanitize user input
- Use React's built-in escaping
- Validate all data from API

### CSRF Protection
- Use SameSite cookies
- CSRF tokens for state-changing operations

### Secure Token Storage
- httpOnly cookies (recommended)
- Or localStorage with short expiry

### Content Security Policy

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';" />
```

---

## References

- [CCM Architecture](./CCM-Architecture.md)
- [UI Standards](./UI-Standards.md)
- [Widget Development Guide](./Widget-Development-Guide.md)
- [Frontend Implementation Plan](./Frontend-Implementation-Plan.md)

---

**End of Frontend Architecture Documentation**
