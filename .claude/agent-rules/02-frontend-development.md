# Frontend Development Agent Rules

**Specialization:** React, TypeScript, styled-components, CORS, UI/UX
**Prerequisites:** Must follow `00-core-philosophy.md`

---

## CRITICAL: MCP Tool Usage for Frontend Work

**MANDATORY: ALL frontend testing and verification MUST use Playwright MCP.**

### When to Use Playwright MCP

**ALWAYS use Playwright MCP for:**
- ✅ Testing UI components after implementation
- ✅ Verifying user flows and interactions
- ✅ Debugging browser behavior
- ✅ Testing API integration from frontend
- ✅ Visual confirmation of changes
- ✅ Checking for console errors
- ✅ Verifying CORS configuration

**Example:**
```
✅ CORRECT: After implementing login form
  → Use Playwright MCP to test the form
  → Navigate, fill fields, submit, verify redirect

❌ WRONG: After implementing login form
  → Manually test in browser
  → Take screenshots
  → Use curl to test API
```

### Frontend Testing Workflow

1. **Implement Component/Feature**
   - Write React/TypeScript code
   - Follow UI standards

2. **Test with Playwright MCP** (MANDATORY)
   - `browser_navigate` to page
   - `browser_snapshot` to see structure
   - `browser_click` / `browser_type` to interact
   - `browser_console_messages` to check for errors
   - Verify network requests with `browser_network_requests`

3. **Verify Backend Integration with mongosh** (TEMPORARY WORKAROUND)
   - ⚠️ **CRITICAL:** MongoDB MCP is currently broken (connection doesn't persist)
   - ✅ Use mongosh via Bash for database verification
   - ✅ Pattern: `mongosh --eval "db.collection.find()" mongodb://localhost:27017/a64core_db --quiet`
   - Check for correct data structure

---

## React Component Standards

### Component Structure

```typescript
import React from 'react'
import styled from 'styled-components'

interface ComponentProps {
  // Props interface
  title: string
  onClick?: () => void
}

export const Component: React.FC<ComponentProps> = ({ title, onClick }) => {
  return (
    <StyledWrapper>
      <h1>{title}</h1>
    </StyledWrapper>
  )
}

const StyledWrapper = styled.div`
  /* Styles here */
`
```

### TypeScript Standards

- **Always** use TypeScript, never plain JavaScript
- **Always** define interfaces for props
- **Always** type all variables and functions
- Use `React.FC<PropsType>` for components
- Avoid `any` type - use `unknown` if type is truly unknown

---

## Styled-Components Best Practices

### Transient Props (CRITICAL)

**ALWAYS use `$` prefix for props that shouldn't be passed to DOM:**

```typescript
// ✅ CORRECT
const Button = styled.button<{ $primary?: boolean }>`
  background: ${props => props.$primary ? 'blue' : 'gray'};
`
<Button $primary>Click Me</Button>

// ❌ WRONG - Causes DOM prop warnings
const Button = styled.button<{ primary?: boolean }>`
  background: ${props => props.primary ? 'blue' : 'gray'};
`
<Button primary>Click Me</Button>
```

### Style Organization

```typescript
const StyledComponent = styled.div`
  /* Layout */
  display: flex;
  flex-direction: column;

  /* Spacing */
  padding: 1rem;
  margin: 0.5rem;

  /* Colors */
  background-color: ${props => props.theme.colors.primary};
  color: ${props => props.theme.colors.text};

  /* Typography */
  font-size: 1rem;
  font-weight: 500;

  /* Responsive */
  @media (max-width: 768px) {
    padding: 0.5rem;
  }
`
```

---

## API Integration

### Using API Services

**Service pattern:**
```typescript
// src/services/api.ts
import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,  // CRITICAL for auth cookies
})

export const userApi = {
  getUser: (id: string) => api.get(`/users/${id}`),
  createUser: (data: UserCreate) => api.post('/users', data),
}
```

### Testing API Integration

**MANDATORY: Use Playwright MCP to test API calls from frontend:**

```
After implementing API integration:
1. Use Playwright MCP to navigate to the page
2. Use browser_evaluate to make API call
3. Use browser_network_requests to verify request was sent
4. Use browser_console_messages to check for errors
5. Use MongoDB MCP to verify backend received data correctly
```

---

## CORS Configuration

### Frontend CORS Setup

**Vite Configuration:**
```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
```

### Testing CORS with Playwright MCP

**When debugging CORS issues:**
1. Use `browser_navigate` to load page
2. Use `browser_console_messages(onlyErrors: true)` to see CORS errors
3. Use `browser_network_requests()` to see request headers
4. Fix configuration
5. Verify fix with Playwright MCP

---

## State Management

### Using Zustand

```typescript
import { create } from 'zustand'

interface StoreState {
  user: User | null
  setUser: (user: User | null) => void
}

export const useStore = create<StoreState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}))
```

### Zustand Persistence

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useStore = create(
  persist<StoreState>(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
    }),
    {
      name: 'app-storage',
    }
  )
)
```

---

## React Router

### Route Structure

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>
    </BrowserRouter>
  )
}
```

### Protected Routes

```typescript
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useStore()

  if (!user) {
    return <Navigate to="/login" />
  }

  return <>{children}</>
}
```

### Testing Routes with Playwright MCP

**ALWAYS test navigation with Playwright MCP:**
```
1. browser_navigate('/login')
2. browser_type(email, password)
3. browser_click(submit button)
4. Verify redirect to /dashboard
5. Check user is logged in (MongoDB MCP)
```

---

## Form Handling

### Controlled Forms

```typescript
const [formData, setFormData] = useState({ email: '', password: '' })

const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setFormData({ ...formData, [e.target.name]: e.target.value })
}

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  await api.post('/login', formData)
}
```

### Form Validation

- Use Zod for schema validation
- Validate on blur and submit
- Show clear error messages
- **Test with Playwright MCP** to verify validation works

---

## Error Handling

### Error Boundaries

```typescript
class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />
    }
    return this.props.children
  }
}
```

### API Error Handling

```typescript
try {
  const response = await api.post('/endpoint', data)
  return response.data
} catch (error) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) {
      // Handle unauthorized
    }
    throw new Error(error.response?.data?.detail || 'Request failed')
  }
  throw error
}
```

---

## Performance Optimization

### Memoization

```typescript
// Memoize expensive computations
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(data)
}, [data])

// Memoize callbacks
const handleClick = useCallback(() => {
  doSomething(value)
}, [value])

// Memoize components
const MemoizedComponent = React.memo(Component)
```

### Code Splitting

```typescript
import { lazy, Suspense } from 'react'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <DashboardPage />
    </Suspense>
  )
}
```

---

## Testing Frontend Components

### Unit Testing with React Testing Library

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

test('button click triggers callback', async () => {
  const handleClick = jest.fn()
  render(<Button onClick={handleClick}>Click Me</Button>)

  const button = screen.getByRole('button')
  await userEvent.click(button)

  expect(handleClick).toHaveBeenCalledTimes(1)
})
```

### Integration Testing with Playwright MCP

**MANDATORY for complete user flows:**

```
Test Workflow:
1. Implement login flow
2. Use Playwright MCP:
   - Navigate to /login
   - Type email and password
   - Click submit button
   - Verify redirect to /dashboard
   - Check for success message
3. Use MongoDB MCP to verify session/token created
```

---

## Accessibility

### ARIA Attributes

```typescript
<button
  aria-label="Close modal"
  aria-pressed={isPressed}
  role="button"
>
  X
</button>
```

### Keyboard Navigation

- Ensure all interactive elements are keyboard accessible
- Use proper tab order
- Provide keyboard shortcuts for common actions
- **Test with Playwright MCP** using `browser_press_key`

---

## Common Pitfalls to Avoid

### 1. DOM Prop Warnings
❌ Passing non-standard props to DOM elements
✅ Use `$` prefix for styled-components transient props

### 2. Missing withCredentials
❌ Not setting `withCredentials: true` in axios
✅ Always set for auth cookies to work

### 3. CORS Issues
❌ Not configuring proxy in vite.config.ts
✅ Configure proxy for `/api` routes

### 4. Not Testing with MCP Tools
❌ Manual browser testing only
✅ ALWAYS use Playwright MCP to verify functionality

### 5. Forgetting Error Handling
❌ No try-catch in async functions
✅ Always handle errors and show user feedback

---

## Frontend Development Checklist

Before considering a feature complete:
- [ ] TypeScript types defined for all props/state
- [ ] Styled-components using transient props (`$prefix`)
- [ ] API integration with proper error handling
- [ ] CORS configuration verified
- [ ] **Tested with Playwright MCP** (MANDATORY)
- [ ] **Backend integration verified with MongoDB MCP**
- [ ] Accessibility attributes added
- [ ] Responsive design implemented
- [ ] Console has no errors or warnings
- [ ] Performance optimized (memoization, code splitting)

---

## Remember: MCP Tools Are Mandatory

**CRITICAL Rules:**
1. ✅ ALWAYS use Playwright MCP after implementing UI features
2. ✅ ALWAYS verify backend data with MongoDB MCP
3. ❌ NEVER skip MCP testing for "quick changes"
4. ❌ NEVER use manual browser testing as proof of functionality
5. ❌ NEVER use curl to test API integration

**Why MCP tools matter:**
- Playwright MCP shows actual browser behavior
- Catches visual regressions
- Verifies user experience
- Provides debugging information
- Ensures consistent testing

---

**Last Updated:** 2025-11-01
**Version:** 1.0.0
