# UI/UX Standards

**Version:** 1.1.0
**Status:** Active
**Created:** 2025-10-19
**Last Updated:** 2025-10-19
**Platform:** A64 Core Platform

---

## Table of Contents
1. [Design Principles](#design-principles)
2. [React/TypeScript Technical Standards](#reacttypescript-technical-standards)
3. [Styled-Components Standards](#styled-components-standards-critical)
4. [Form Handling Standards](#form-handling-standards)
5. [State Management Standards](#state-management-standards)
6. [Routing Standards](#routing-standards)
7. [Color Palette](#color-palette)
8. [Typography](#typography)
9. [Spacing System](#spacing-system)
10. [Component Guidelines](#component-guidelines)
11. [Accessibility Standards](#accessibility-standards)
12. [Common Pitfalls and Solutions](#common-pitfalls-and-solutions)

---

## Design Principles

### 1. KISS (Keep It Simple, Stupid)
- Prioritize clarity over complexity
- Remove unnecessary elements
- Use familiar patterns
- Provide clear feedback

### 2. Consistency
- Use standardized components
- Follow established patterns
- Maintain visual hierarchy
- Keep terminology consistent

### 3. Accessibility First
- WCAG 2.1 AA compliance minimum
- Keyboard navigation support
- Screen reader compatible
- High contrast ratios

### 4. Performance
- Fast initial load (< 3 seconds)
- Smooth animations (60 FPS)
- Responsive interactions (< 100ms)
- Efficient rendering

### 5. Cross-Platform
- Works on Windows and Linux
- Responsive on desktop, tablet, mobile
- Browser compatible (Chrome, Firefox, Safari, Edge)
- Progressive Web App (PWA) support

---

## React/TypeScript Technical Standards

### CRITICAL: Before Creating/Modifying UI Components

**ALWAYS follow these standards to avoid DOM prop warnings and React errors!**

### Technology Stack

- **React:** 18.3.1 (exact version, pinned)
- **TypeScript:** 5.x
- **Styled-Components:** 6.1.19 (CSS-in-JS)
- **Vite:** 7.x (build tool and dev server)
- **React Router:** 6.22.0+
- **Zustand:** 4.4.7+ (state management)
- **React Hook Form:** 7.49.3+ (forms)
- **Zod:** 3.22.4+ (validation)
- **Axios:** 1.6.5+ (HTTP client)

### Component Structure

**Functional Components Only:**

```typescript
// ✅ Correct: Functional component with TypeScript
export function UserProfile({ userId }: UserProfileProps) {
  const [user, setUser] = useState<User | null>(null);

  return (
    <ProfileContainer>
      {/* Component JSX */}
    </ProfileContainer>
  );
}

// ❌ Wrong: Class component (deprecated)
class UserProfile extends React.Component {
  // Don't use class components
}
```

### Component Naming Conventions

- **Component Files:** PascalCase (e.g., `Button.tsx`, `UserProfile.tsx`)
- **Component Functions:** PascalCase (e.g., `export function Button()`)
- **Props Interfaces:** `{ComponentName}Props` (e.g., `ButtonProps`)
- **Styled Components:** `Styled{Name}` or descriptive name (e.g., `StyledButton`, `Container`)

### TypeScript Props

**Always extend HTML element props when wrapping native elements:**

```typescript
// ✅ Correct: Extends native button props
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  children: React.ReactNode;
}

// Standalone interface for custom components
export interface CardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose?: () => void;
}
```

### forwardRef Usage

Use `forwardRef` when component needs to expose a ref (required for form inputs):

```typescript
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, ...props }, ref) => {
    return (
      <InputWrapper>
        {label && <Label>{label}</Label>}
        <StyledInput ref={ref} $hasError={!!error} {...props} />
        {error && <ErrorText>{error}</ErrorText>}
      </InputWrapper>
    );
  }
);

Input.displayName = 'Input'; // Required for React DevTools
```

---

## Styled-Components Standards (CRITICAL)

### The Transient Props Pattern

**THE PROBLEM:**
Custom props passed to styled-components are forwarded to the DOM, causing React warnings:

```
Warning: React does not recognize the `fullWidth` prop on a DOM element.
```

**THE SOLUTION:**
Use **transient props** (props prefixed with `$`) which are NOT passed to the DOM:

### ❌ WRONG: Custom props passed to DOM

```typescript
const StyledButton = styled.button<{ variant: string; fullWidth: boolean }>`
  background: ${({ variant }) => variant === 'primary' ? 'blue' : 'gray'};
  width: ${({ fullWidth }) => fullWidth ? '100%' : 'auto'};
`;

export function Button({ variant, fullWidth, children }: ButtonProps) {
  return <StyledButton variant={variant} fullWidth={fullWidth}>{children}</StyledButton>;
  // ❌ ERROR: 'variant' and 'fullWidth' are passed to <button> DOM element
}
```

### ✅ CORRECT: Transient props are filtered out

```typescript
// Separate interfaces for public and internal props
interface StyledButtonProps {
  $variant: string;
  $fullWidth: boolean;
}

const StyledButton = styled.button<StyledButtonProps>`
  background: ${({ $variant }) => $variant === 'primary' ? 'blue' : 'gray'};
  width: ${({ $fullWidth }) => $fullWidth ? '100%' : 'auto'};
`;

export function Button({ variant = 'primary', fullWidth = false, children, ...props }: ButtonProps) {
  return (
    <StyledButton $variant={variant} $fullWidth={fullWidth} {...props}>
      {children}
    </StyledButton>
  );
  // ✅ CORRECT: $variant and $fullWidth are NOT passed to DOM
}
```

### Complete Component Pattern

```typescript
// 1. Public props interface (what users of the component see)
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  children: React.ReactNode;
}

// 2. Internal styled-component props interface (with transient props)
interface StyledButtonProps {
  $variant: 'primary' | 'secondary' | 'outline';
  $size: 'small' | 'medium' | 'large';
  $fullWidth: boolean;
}

// 3. Component function (converts public props to transient props)
export function Button({
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  children,
  ...props
}: ButtonProps) {
  return (
    <StyledButton
      $variant={variant}
      $size={size}
      $fullWidth={fullWidth}
      {...props}
    >
      {children}
    </StyledButton>
  );
}

// 4. Styled component (uses transient props in styles)
const StyledButton = styled.button<StyledButtonProps>`
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};

  ${({ theme, $variant }) => {
    if ($variant === 'primary') {
      return `
        background: ${theme.colors.primary[500]};
        color: white;
      `;
    }
    // ... other variants
  }}

  ${({ theme, $size }) => {
    if ($size === 'small') {
      return `
        padding: ${theme.spacing.sm} ${theme.spacing.md};
      `;
    }
    // ... other sizes
  }}
`;
```

### Transient Props Checklist

Before committing any styled-component:

- [ ] **Public interface:** Use normal prop names (variant, fullWidth, size)
- [ ] **Internal styled-component interface:** Use transient props ($variant, $fullWidth, $size)
- [ ] **Component function:** Convert public props to transient props when rendering
- [ ] **TypeScript types:** Separate public props interface from styled-component props interface
- [ ] **No console warnings:** Test in browser and verify no prop warnings

### Theme Usage

**ALWAYS use theme values instead of hardcoded values:**

```typescript
// ✅ Correct: Use theme
const Container = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`;

// ❌ Wrong: Hardcoded values
const Container = styled.div`
  padding: 24px;
  background: #f0f0f0;
  border-radius: 8px;
`;
```

---

## Form Handling Standards

### React Hook Form + Zod Pattern

**Standard form implementation:**

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// 1. Define Zod schema
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// 2. Infer TypeScript type from schema
type LoginFormData = z.infer<typeof loginSchema>;

// 3. Component implementation
export function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data);
    } catch (error) {
      // Handle error
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input
        label="Email"
        type="email"
        error={errors.email?.message}
        {...register('email')}
      />

      <Input
        label="Password"
        type="password"
        error={errors.password?.message}
        {...register('password')}
      />

      <Button type="submit">Login</Button>
    </form>
  );
}
```

### Common Validation Patterns

**Email:**
```typescript
email: z.string().email('Invalid email address')
```

**Password with requirements:**
```typescript
password: z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
```

**Password confirmation:**
```typescript
const registerSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});
```

---

## State Management Standards

### Local State (useState)

Use for component-specific state:

```typescript
const [isOpen, setIsOpen] = useState(false);
const [formData, setFormData] = useState({ email: '', password: '' });
const [items, setItems] = useState<Item[]>([]);
```

### Global State (Zustand)

Use for application-wide state:

```typescript
// stores/auth.store.ts
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  login: async (credentials) => {
    const response = await authService.login(credentials);
    set({ user: response.user, isAuthenticated: true });
  },

  logout: async () => {
    await authService.logout();
    set({ user: null, isAuthenticated: false });
  },
}));
```

**Using in components:**
```typescript
export function Profile() {
  const { user, logout } = useAuthStore();
  return <button onClick={logout}>Logout</button>;
}
```

---

## Routing Standards

### React Router Configuration

**ALWAYS add future flags to avoid deprecation warnings:**

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,        // Required to avoid warnings
        v7_relativeSplatPath: true,      // Required to avoid warnings
      }}
    >
      <Routes>
        {/* Your routes */}
      </Routes>
    </BrowserRouter>
  );
}
```

### Protected Route Pattern

```typescript
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <Outlet />;
}
```

---

## Common Pitfalls and Solutions

### 1. Props Passed to DOM

**Problem:**
```
Warning: React does not recognize the `fullWidth` prop on a DOM element.
```

**Solution:**
Use transient props with `$` prefix in styled-components (see [Styled-Components Standards](#styled-components-standards-critical))

### 2. React Router Warnings

**Problem:**
```
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7.
```

**Solution:**
Add future flags to BrowserRouter (see [Routing Standards](#routing-standards))

### 3. Multiple React Instances

**Problem:**
```
Error: Invalid hook call. Hooks can only be called inside the body of a function component.
```

**Solution:**
- Pin React version to exact version in all packages
- Add Vite dedupe configuration:
```typescript
// vite.config.ts
export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom', 'styled-components'],
  },
});
```

### 4. Missing displayName

**Problem:**
React DevTools shows "Anonymous" for forwardRef components

**Solution:**
Always set displayName:
```typescript
export const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  // ...
});

Input.displayName = 'Input'; // ✅ Required
```

---

## CORS Configuration (Frontend-Backend Communication)

### Understanding CORS

**CORS (Cross-Origin Resource Sharing)** is a security mechanism that controls which origins can access your API.

**Common CORS Error:**
```
Access to XMLHttpRequest at 'http://localhost:8000/api/v1/auth/login' from origin 'http://localhost:5173'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

**What is an Origin?**
- Origin = Protocol + Domain + Port
- Example: `http://localhost:5173`
- **Same-Origin:** `http://localhost:5173` → `http://localhost:5173` ✅
- **Cross-Origin:** `http://localhost:5173` → `http://localhost:8000` ❌ (different port)

### Frontend Configuration for CORS

**1. API Base URL Configuration:**

Create a configuration file for API settings:

```typescript
// src/config/api.config.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const apiConfig = {
  baseURL: API_BASE_URL,
  timeout: 10000,
  withCredentials: true,  // REQUIRED if backend allows credentials (cookies/auth)
};
```

**2. Axios Instance with CORS Support:**

```typescript
// src/services/api.ts
import axios from 'axios';
import { apiConfig } from '../config/api.config';

const api = axios.create({
  baseURL: apiConfig.baseURL,
  timeout: apiConfig.timeout,
  withCredentials: apiConfig.withCredentials,  // Send cookies/auth headers
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor (add auth tokens)
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor (handle errors)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized (redirect to login)
      localStorage.removeItem('accessToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

**3. Environment Variables:**

Create `.env` file in frontend root:

```bash
# Development
VITE_API_BASE_URL=http://localhost:8000

# Production (update with actual domain)
VITE_API_BASE_URL=https://api.yourdomain.com
```

**4. Using the API Service:**

```typescript
// src/services/auth.service.ts
import api from './api';

export const authService = {
  async login(credentials: LoginCredentials) {
    const response = await api.post('/api/v1/auth/login', credentials);
    return response.data;
  },

  async register(data: RegisterData) {
    const response = await api.post('/api/v1/auth/register', data);
    return response.data;
  },

  async getCurrentUser() {
    const response = await api.get('/api/v1/auth/me');
    return response.data;
  },
};
```

### Backend CORS Configuration

**CRITICAL:** CORS must be configured on the backend, not the frontend!

**FastAPI (Python) Example:**

```python
# src/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.config import settings

app = FastAPI()

# CORS Configuration
if settings.ENVIRONMENT == "development":
    origins = [
        "http://localhost:5173",      # Vite dev server
        "http://localhost:3000",      # Alternative React dev server
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]
else:
    origins = [
        "https://yourdomain.com",
        "https://www.yourdomain.com",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,              # Allowed origins
    allow_credentials=True,             # Allow cookies/auth headers
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],                # Allow all headers
    expose_headers=["*"],               # Expose headers to frontend
    max_age=600,                        # Cache preflight requests (10 min)
)
```

### Common CORS Issues and Solutions

**1. No 'Access-Control-Allow-Origin' header**

**Problem:**
```
Access to XMLHttpRequest has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header
```

**Solution:**
- Backend is not configured with CORS middleware
- Add CORSMiddleware to backend with correct origins
- Ensure backend is running

**2. Credentials flag mismatch**

**Problem:**
```
Credentials flag is 'true', but 'Access-Control-Allow-Origin' is '*'
```

**Solution:**
- Cannot use wildcard (`*`) with `credentials: true`
- Specify exact origins in backend CORS config:
```python
allow_origins=["http://localhost:5173"]  # Not ["*"]
allow_credentials=True
```

**3. Preflight request failed**

**Problem:**
Browser sends OPTIONS request that fails

**Solution:**
- Backend must handle OPTIONS requests
- Ensure `OPTIONS` is in `allow_methods`
- FastAPI/Express handle this automatically with CORS middleware

**4. Multiple CORS headers**

**Problem:**
```
The 'Access-Control-Allow-Origin' header contains multiple values
```

**Solution:**
- Both backend and proxy (Nginx) are adding CORS headers
- Only add CORS headers in ONE place (prefer backend)
- If using Nginx proxy, disable CORS in backend OR Nginx (not both)

### CORS Best Practices

**Development:**
- ✅ Allow specific localhost ports (`http://localhost:5173`)
- ✅ Include both `localhost` and `127.0.0.1` variants
- ✅ Enable `credentials: true` for authentication
- ❌ Don't use wildcard `*` with credentials

**Production:**
- ✅ Use HTTPS only (`https://yourdomain.com`)
- ✅ Whitelist specific domains only
- ✅ Use environment variables for origins
- ❌ Don't include development origins (localhost)
- ❌ Don't use HTTP in production

### CORS Testing Checklist

Before deploying:
- [ ] Backend CORS middleware configured
- [ ] Correct origins for environment (dev/prod)
- [ ] `credentials: true` if using authentication
- [ ] All HTTP methods allowed (GET, POST, PUT, PATCH, DELETE, OPTIONS)
- [ ] Frontend `withCredentials` matches backend `allow_credentials`
- [ ] Environment variables set for API base URL
- [ ] Test actual requests from frontend (not just Postman)
- [ ] Authentication flow works end-to-end
- [ ] No CORS errors in browser console

---

## Checklist: Before Committing UI Code

- [ ] All custom styled-component props use transient props (`$` prefix)
- [ ] React Router has future flags configured
- [ ] All TypeScript types are defined for props and state
- [ ] Forms use React Hook Form + Zod validation
- [ ] Components use semantic HTML elements
- [ ] ARIA labels added for accessibility
- [ ] No hardcoded colors/spacing (use theme)
- [ ] forwardRef components have displayName
- [ ] No console errors or warnings in browser
- [ ] Code follows naming conventions
- [ ] **CORS configured correctly if calling backend APIs**
- [ ] **API base URL uses environment variables**

---

## Color Palette

### Primary Colors (User Portal - Light Theme)

```typescript
primary: {
  50: '#e3f2fd',   // Lightest
  100: '#bbdefb',
  200: '#90caf9',
  300: '#64b5f6',
  400: '#42a5f5',
  500: '#2196f3',  // Main brand color
  600: '#1e88e5',
  700: '#1976d2',
  800: '#1565c0',
  900: '#0d47a1',  // Darkest
}
```

### Secondary Colors

```typescript
secondary: {
  50: '#f3e5f5',
  500: '#9c27b0',  // Accent color
  900: '#4a148c',
}
```

### Neutral Colors

```typescript
neutral: {
  50: '#fafafa',   // Background
  100: '#f5f5f5',  // Surface
  200: '#eeeeee',
  300: '#e0e0e0',  // Borders
  500: '#9e9e9e',  // Disabled
  700: '#616161',  // Secondary text
  900: '#212121',  // Primary text
}
```

### Semantic Colors

```typescript
success: '#4caf50',  // Green
warning: '#ff9800',  // Orange
error: '#f44336',    // Red
info: '#2196f3',     // Blue
```

### Admin Portal Colors (Dark Theme)

```typescript
background: '#1a1a1a',
surface: '#2a2a2a',
primary: {
  500: '#f59e0b',  // Amber (admin identifier)
  700: '#d97706',
},
textPrimary: '#ffffff',
textSecondary: '#a3a3a3',
```

---

## Typography

### Font Families

**Primary (UI Text):**
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
```

**Monospace (Code):**
```css
font-family: 'JetBrains Mono', 'Courier New', monospace;
```

### Font Sizes

```typescript
fontSize: {
  xs: '0.75rem',    // 12px - Labels, captions
  sm: '0.875rem',   // 14px - Secondary text
  base: '1rem',     // 16px - Body text (DEFAULT)
  lg: '1.125rem',   // 18px - Subheadings
  xl: '1.25rem',    // 20px - Headings
  '2xl': '1.5rem',  // 24px - Page titles
  '3xl': '1.875rem',// 30px - Hero text
  '4xl': '2.25rem', // 36px - Display
}
```

### Font Weights

```typescript
fontWeight: {
  light: 300,      // Rarely used
  regular: 400,    // Body text
  medium: 500,     // Emphasis
  semibold: 600,   // Headings
  bold: 700,       // Strong emphasis
}
```

### Line Heights

```typescript
lineHeight: {
  tight: 1.25,     // Headings
  normal: 1.5,     // Body text (DEFAULT)
  relaxed: 1.75,   // Long-form content
}
```

### Typography Usage

**Page Title:**
```typescript
font-size: 2xl (24px)
font-weight: semibold (600)
line-height: tight (1.25)
color: textPrimary
```

**Section Heading:**
```typescript
font-size: xl (20px)
font-weight: semibold (600)
line-height: tight (1.25)
```

**Body Text:**
```typescript
font-size: base (16px)
font-weight: regular (400)
line-height: normal (1.5)
color: textPrimary
```

**Secondary Text:**
```typescript
font-size: sm (14px)
font-weight: regular (400)
color: textSecondary
```

**Caption/Label:**
```typescript
font-size: xs (12px)
font-weight: medium (500)
color: textSecondary
text-transform: uppercase
letter-spacing: 0.5px
```

---

## Spacing System

### Spacing Scale

```typescript
spacing: {
  xs: '0.25rem',   // 4px - Tight spacing
  sm: '0.5rem',    // 8px - Component padding
  md: '1rem',      // 16px - Default spacing
  lg: '1.5rem',    // 24px - Section spacing
  xl: '2rem',      // 32px - Large spacing
  '2xl': '3rem',   // 48px - Page margins
  '3xl': '4rem',   // 64px - Hero spacing
}
```

### Usage Guidelines

**Component Padding:**
- Small buttons: `sm` (8px)
- Regular buttons: `md` (16px)
- Cards: `lg` (24px)

**Component Margins:**
- Between elements: `md` (16px)
- Between sections: `xl` (32px)
- Page margins: `2xl` (48px)

**Gap (Flexbox/Grid):**
- Tight lists: `sm` (8px)
- Default: `md` (16px)
- Spacious layouts: `lg` (24px)

---

## Border Radius

```typescript
borderRadius: {
  none: '0',
  sm: '0.25rem',   // 4px - Subtle rounding
  md: '0.5rem',    // 8px - DEFAULT
  lg: '0.75rem',   // 12px - Cards
  xl: '1rem',      // 16px - Modals
  full: '9999px',  // Circular (pills, avatars)
}
```

**Usage:**
- Buttons: `md` (8px)
- Cards: `lg` (12px)
- Modals: `xl` (16px)
- Pills/Badges: `full`
- Avatar images: `full`

---

## Shadows

```typescript
shadows: {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',       // Subtle
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',     // DEFAULT
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',   // Elevated
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',   // Floating
}
```

**Usage:**
- Cards: `md`
- Dropdowns: `lg`
- Modals: `xl`
- Buttons (hover): `sm`

---

## Component Guidelines

### Buttons

**Primary Button:**
```typescript
background: primary[500]
color: white
padding: md
border-radius: md
font-weight: medium
hover: background → primary[700]
```

**Secondary Button:**
```typescript
background: transparent
color: primary[500]
border: 1px solid primary[500]
padding: md
border-radius: md
hover: background → primary[50]
```

**Sizes:**
- Small: padding `sm`, font-size `sm`
- Medium: padding `md`, font-size `base` (DEFAULT)
- Large: padding `lg`, font-size `lg`

---

### Input Fields

**Text Input:**
```typescript
border: 1px solid neutral[300]
border-radius: md
padding: md
font-size: base
background: white
focus: border → primary[500], shadow → sm
```

**States:**
- Default: `border neutral[300]`
- Focus: `border primary[500]`
- Error: `border error`
- Disabled: `background neutral[100], opacity 0.6`

**Label:**
```typescript
font-size: sm
font-weight: medium
margin-bottom: xs
color: textPrimary
```

---

### Cards

```typescript
background: surface
border-radius: lg
padding: lg
box-shadow: md
border: 1px solid neutral[200]
```

**Card Header:**
```typescript
font-size: lg
font-weight: semibold
margin-bottom: md
```

**Card Body:**
```typescript
font-size: base
line-height: normal
```

---

### Modals

```typescript
background: white
border-radius: xl
padding: xl
box-shadow: xl
max-width: 600px
```

**Backdrop:**
```typescript
background: rgba(0, 0, 0, 0.5)
backdrop-filter: blur(4px)
```

---

### Tables

**Header:**
```typescript
background: neutral[50]
font-weight: semibold
font-size: sm
text-transform: uppercase
letter-spacing: 0.5px
padding: md
border-bottom: 2px solid neutral[200]
```

**Row:**
```typescript
border-bottom: 1px solid neutral[200]
padding: md
hover: background → neutral[50]
```

**Cell:**
```typescript
padding: md
font-size: base
```

---

## Icons

**Icon Library:** Lucide React

**Icon Sizes:**
- Small: 16px
- Medium: 20px (DEFAULT)
- Large: 24px
- Extra Large: 32px

**Usage:**
```typescript
import { Home, User, Settings } from 'lucide-react';

<Home size={20} color="#2196f3" />
```

**Icon with Text:**
```typescript
<Button>
  <User size={16} />
  <span>Profile</span>
</Button>
```

---

## Responsive Breakpoints

```typescript
breakpoints: {
  mobile: '320px',   // Mobile phones
  tablet: '768px',   // Tablets
  desktop: '1024px', // Desktop
  wide: '1440px',    // Large screens
}
```

**Media Queries:**
```typescript
// Mobile-first approach
const Button = styled.button`
  padding: ${({ theme }) => theme.spacing.sm};

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    padding: ${({ theme }) => theme.spacing.md};
  }

  @media (min-width: ${({ theme }) => theme.breakpoints.desktop}) {
    padding: ${({ theme }) => theme.spacing.lg};
  }
`;
```

---

## Accessibility Standards

### WCAG 2.1 AA Compliance

**Color Contrast:**
- Normal text (< 18px): minimum 4.5:1
- Large text (≥ 18px): minimum 3:1
- UI components: minimum 3:1

**Keyboard Navigation:**
- All interactive elements focusable
- Visible focus indicators
- Logical tab order
- Keyboard shortcuts documented

**Screen Readers:**
- Semantic HTML (`<button>`, `<nav>`, `<main>`)
- ARIA labels where needed
- Alt text for images
- Form labels associated with inputs

**Example:**
```typescript
<button
  aria-label="Close modal"
  onClick={handleClose}
  tabIndex={0}
>
  <X size={20} />
</button>
```

---

## Animation & Transitions

### Transition Timing

```typescript
transition: {
  fast: '150ms',       // Hover effects
  normal: '300ms',     // DEFAULT
  slow: '500ms',       // Complex animations
}

easing: {
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)', // DEFAULT
}
```

### Usage

**Button Hover:**
```typescript
transition: background-color 150ms ease-in-out
```

**Modal Fade In:**
```typescript
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

animation: fadeIn 300ms ease-in-out;
```

**Skeleton Loading:**
```typescript
@keyframes shimmer {
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
}

animation: shimmer 2s infinite linear;
```

---

## Loading States

### Spinner

```typescript
<Spinner size="small|medium|large" />
```

### Skeleton Screen

```typescript
<SkeletonCard />
<SkeletonTable rows={5} />
<SkeletonChart />
```

### Progress Bar

```typescript
<ProgressBar value={75} max={100} />
```

---

## Error States

### Error Message

```typescript
<Alert severity="error">
  <AlertIcon />
  <AlertTitle>Error</AlertTitle>
  <AlertDescription>
    Failed to load data. Please try again.
  </AlertDescription>
</Alert>
```

### Form Validation Error

```typescript
<Input
  error={true}
  helperText="Email is required"
/>
```

---

## Empty States

### No Data

```typescript
<EmptyState
  icon={<Database size={48} />}
  title="No data available"
  description="There's no data to display yet. Add some data to get started."
  action={<Button>Add Data</Button>}
/>
```

---

## Z-Index Layers

```typescript
zIndex: {
  base: 0,          // Default
  dropdown: 1000,   // Dropdowns
  sticky: 1050,     // Sticky headers
  modal: 1100,      // Modals
  popover: 1200,    // Popovers
  tooltip: 1300,    // Tooltips
  notification: 1400, // Toast notifications
}
```

---

## Best Practices

### DO:
✅ Use centralized theme system
✅ Follow established component patterns
✅ Test on all breakpoints
✅ Ensure keyboard accessibility
✅ Provide loading/error states
✅ Use semantic HTML
✅ Maintain consistent spacing
✅ Test with screen readers
✅ Use appropriate font sizes (minimum 14px)
✅ Provide clear feedback for user actions

### DON'T:
❌ Hardcode colors or spacing
❌ Create custom components for existing patterns
❌ Ignore mobile breakpoints
❌ Use color as only indicator
❌ Skip loading states
❌ Use non-semantic HTML (`<div>` for buttons)
❌ Use inconsistent spacing
❌ Forget alt text for images
❌ Use tiny fonts (< 12px)
❌ Leave users guessing about state changes

---

## Component Library Reference

All components available in `@a64core/shared`:

**Layout:**
- `<Container>`
- `<Grid>`
- `<Flex>`
- `<Box>`

**Forms:**
- `<Input>`
- `<Select>`
- `<Checkbox>`
- `<Radio>`
- `<Toggle>`
- `<TextArea>`

**Buttons:**
- `<Button>`
- `<IconButton>`
- `<ButtonGroup>`

**Feedback:**
- `<Alert>`
- `<Toast>`
- `<Spinner>`
- `<Progress>`
- `<Skeleton>`

**Overlay:**
- `<Modal>`
- `<Drawer>`
- `<Popover>`
- `<Tooltip>`

**Data Display:**
- `<Table>`
- `<Card>`
- `<Badge>`
- `<Tag>`
- `<Avatar>`

**Navigation:**
- `<Tabs>`
- `<Breadcrumb>`
- `<Pagination>`

---

## References

- [Frontend Architecture](./Frontend-Architecture.md)
- [Widget Development Guide](./Widget-Development-Guide.md)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Lucide Icons](https://lucide.dev/)

---

**End of UI/UX Standards**
