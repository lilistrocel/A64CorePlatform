import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { theme, GlobalStyles } from '@a64core/shared';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { Dashboard } from './pages/dashboard/Dashboard';
import { Profile } from './pages/profile/Profile';
import { Settings } from './pages/settings/Settings';
import { FarmManager } from './pages/farm/FarmManager';
import { OperationsDashboard } from './pages/operations/OperationsDashboard';
import { FarmBlocksView } from './pages/operations/FarmBlocksView';
import { BlockTaskList } from './pages/operations/BlockTaskList';
import { AIAnalytics } from './pages/ai/AIAnalytics';
import { ClearCache } from './pages/debug/ClearCache';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { MainLayout } from './components/layout/MainLayout';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Debug routes (development only) */}
          <Route path="/debug/clear-cache" element={<ClearCache />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/farm/*" element={<FarmManager />} />
              <Route path="/operations" element={<OperationsDashboard />} />
              <Route path="/operations/:farmId" element={<FarmBlocksView />} />
              <Route path="/operations/:farmId/:blockId" element={<BlockTaskList />} />
              <Route path="/ai-analytics" element={<AIAnalytics />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
