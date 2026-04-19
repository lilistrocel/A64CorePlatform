import { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuthStore } from '../../stores/auth.store';
import { useDivisionStore } from '../../stores/division.store';
import { useThemeStore } from '../../stores/theme.store';
import { useFarmingYearStore } from '../../stores/farmingYear.store';
import { useFarmingYearsList } from '../../hooks/queries/useFarmingYears';
import { getPendingTaskCount } from '../../services/tasksApi';
import { Button } from '@a64core/shared';
import { UnsavedChangesContext } from '../../contexts/UnsavedChangesContext';
import { DivisionSwitcher } from './DivisionSwitcher';

// ─── Navigation item definitions ────────────────────────────────────────────

interface NavItemDef {
  to: string;
  icon: string;
  label: string;
  showBadge?: boolean;
}

// Navigation shown for every industry type
const SHARED_NAV_ITEMS: NavItemDef[] = [
  { to: '/dashboard', icon: '📊', label: 'Dashboard' },
];

const SHARED_BOTTOM_NAV_ITEMS: NavItemDef[] = [
  { to: '/crm/customers', icon: '👥', label: 'CRM' },
  { to: '/hr', icon: '👔', label: 'HR' },
  { to: '/logistics', icon: '🚚', label: 'Logistics' },
  { to: '/sales', icon: '💰', label: 'Sales' },
  { to: '/pnl', icon: '📈', label: 'P&L' },
  { to: '/marketing', icon: '📢', label: 'Marketing' },
  { to: '/ai', icon: '🤖', label: 'AI Hub' },
  { to: '/profile', icon: '👤', label: 'Profile' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
];

// Industry-specific navigation items
const VEGETABLE_FRUITS_NAV: NavItemDef[] = [
  { to: '/farm/dashboard', icon: '🏞️', label: 'Farm Manager' },
  { to: '/farm/block-monitor', icon: '🌾', label: 'Block Monitor' },
  { to: '/operations', icon: '📋', label: 'Operations', showBadge: true },
  { to: '/inventory', icon: '📦', label: 'Inventory' },
];

const MUSHROOM_NAV: NavItemDef[] = [
  { to: '/mushroom/dashboard', icon: '🍄', label: 'Mushroom Dashboard' },
  { to: '/mushroom/rooms', icon: '🏠', label: 'Room Monitor' },
  { to: '/mushroom/facilities', icon: '🏭', label: 'Facilities' },
  { to: '/mushroom/strains', icon: '🧬', label: 'Strain Library' },
];

// Admin-only navigation (super_admin role required)
const ADMIN_NAV_ITEMS: NavItemDef[] = [
  { to: '/admin/users', icon: '🛡️', label: 'User Management' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function MainLayout() {
  const { user, logout } = useAuthStore();
  const { currentDivision } = useDivisionStore();
  const { mode, toggleTheme } = useThemeStore();
  const { selectedYear, setYear, initialize } = useFarmingYearStore();
  const { data: farmingYearsData } = useFarmingYearsList(5, true);
  const navigate = useNavigate();
  const location = useLocation();
  const unsavedChanges = useContext(UnsavedChangesContext);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);

  // Initialize global year to the current farming year on first load
  useEffect(() => {
    if (farmingYearsData?.years) {
      const currentYear = farmingYearsData.years.find((y) => y.isCurrent);
      if (currentYear) {
        initialize(currentYear.year);
      }
    }
  }, [farmingYearsData, initialize]);

  // Load pending task count on mount and refresh every 30 seconds
  useEffect(() => {
    loadPendingTaskCount();
    const interval = setInterval(loadPendingTaskCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Intercept sidebar navigation clicks when form has unsaved changes
  const handleNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, to: string) => {
      if (unsavedChanges?.isDirty) {
        if (location.pathname === to) return;
        e.preventDefault();
        unsavedChanges.checkNavigationAllowed(to, () => {
          navigate(to);
        });
      }
      closeMobileMenu();
    },
    [unsavedChanges, location.pathname, navigate]
  );

  const loadPendingTaskCount = async () => {
    try {
      const count = await getPendingTaskCount();
      setPendingTaskCount(count);
    } catch (error) {
      // Non-critical — fail silently so the layout still renders
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  // Determine which industry-specific nav items to show
  const industryNavItems: NavItemDef[] =
    currentDivision?.industryType === 'mushroom' ? MUSHROOM_NAV : VEGETABLE_FRUITS_NAV;

  // Build the full ordered navigation list
  const navItems: NavItemDef[] = [
    ...SHARED_NAV_ITEMS,
    ...industryNavItems,
    // AI Hub is super_admin only; P&L requires super_admin or finance.view permission
    ...SHARED_BOTTOM_NAV_ITEMS.filter((item) => {
      if (item.to === '/ai') return user?.role === 'super_admin';
      if (item.to === '/pnl') {
        if (user?.role === 'super_admin') return true;
        const perms = (user as unknown as { permissions?: string[] })?.permissions;
        return Array.isArray(perms) && perms.includes('finance.view');
      }
      return true;
    }),
    ...(user?.role === 'super_admin' ? ADMIN_NAV_ITEMS : []),
  ];

  return (
    <LayoutContainer>
      {/* Mobile Header */}
      <MobileHeader>
        <Logo>
          <LogoImg src="/a64logo_dark.png" alt="A64 Core" />
        </Logo>
        <MenuButton
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </MenuButton>
      </MobileHeader>

      {/* Sidebar */}
      <Sidebar $isOpen={isMobileMenuOpen} aria-label="Sidebar">
        <SidebarHeader>
          <Logo>
            <LogoImg src="/a64logo_dark.png" alt="A64 Core" />
          </Logo>
          <UserInfo>
            <UserName>
              {user?.firstName} {user?.lastName}
            </UserName>
            <UserRole>{user?.role || 'User'}</UserRole>
          </UserInfo>

          {/* Division switcher sits between user info and the main nav */}
          <DivisionSwitcherWrapper>
            <DivisionSwitcher />
          </DivisionSwitcherWrapper>
        </SidebarHeader>

        {/* Global farming year selector */}
        <FarmingYearDropdown
          years={farmingYearsData?.years ?? []}
          selectedYear={selectedYear}
          onSelect={setYear}
        />

        <Nav aria-label="Main navigation">
          {navItems.map((item) => (
            <NavItem
              key={item.to}
              to={item.to}
              onClick={(e) => handleNavClick(e, item.to)}
            >
              <NavIcon>{item.icon}</NavIcon>
              {item.showBadge ? (
                <NavContent>
                  <span>{item.label}</span>
                  {pendingTaskCount > 0 && <Badge>{pendingTaskCount}</Badge>}
                </NavContent>
              ) : (
                <span>{item.label}</span>
              )}
            </NavItem>
          ))}
        </Nav>

        <SidebarFooter>
          <ThemeToggleButton
            onClick={toggleTheme}
            aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <ThemeToggleIcon aria-hidden="true">
              {mode === 'dark' ? '☀️' : '🌙'}
            </ThemeToggleIcon>
            <span>{mode === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </ThemeToggleButton>
          <Button variant="outline" fullWidth onClick={handleLogout}>
            Logout
          </Button>
        </SidebarFooter>
      </Sidebar>

      {/* Overlay for mobile menu */}
      {isMobileMenuOpen && <Overlay onClick={closeMobileMenu} />}

      {/* Main Content */}
      <MainContent>
        <Outlet />
      </MainContent>
    </LayoutContainer>
  );
}

// ─── Styled Components ───────────────────────────────────────────────────────

const LayoutContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral[50]};

  @media (min-width: 1024px) {
    flex-direction: row;
  }
`;

const MobileHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  height: 64px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;

  @media (min-width: 1024px) {
    display: none;
  }
`;

const MenuButton = styled.button`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: ${({ theme }) => theme.spacing.sm};
  min-width: 44px; /* WCAG touch target minimum */
  min-height: 44px; /* WCAG touch target minimum */

  span {
    display: block;
    width: 24px;
    height: 2px;
    background: ${({ theme }) => theme.colors.textPrimary};
    transition: all 0.3s ease;
  }

  @media (min-width: 1024px) {
    display: none;
  }
`;

interface SidebarProps {
  $isOpen: boolean;
}

const Sidebar = styled.aside<SidebarProps>`
  width: 280px;
  background: ${({ theme }) => theme.colors.surface};
  border-right: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 50;
  transform: translateX(${({ $isOpen }) => ($isOpen ? '0' : '-100%')});
  transition: transform 0.3s ease-in-out;
  overflow-y: auto;

  @media (min-width: 1024px) {
    position: static;
    transform: translateX(0);
    flex-shrink: 0;
  }
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 45;

  @media (min-width: 1024px) {
    display: none;
  }
`;

const SidebarHeader = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Logo = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.primary[500]};

  @media (min-width: 1024px) {
    font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  }
`;

const LogoImg = styled.img`
  height: 48px;
  width: auto;
  display: block;
  margin: 0 auto;

  @media (min-width: 1024px) {
    height: 60px;
  }
`;

const UserInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const UserName = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const UserRole = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: capitalize;
`;

const DivisionSwitcherWrapper = styled.div`
  /* Provides consistent vertical spacing between user info and the switcher */
`;

const Nav = styled.nav`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  overflow-y: auto;
`;

const NavItem = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  min-height: 44px; /* WCAG touch target minimum */
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-decoration: none;
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &.active {
    background: ${({ theme }) => `${theme.colors.primary[500]}15`};
    color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const NavIcon = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
`;

const NavContent = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex: 1;
`;

const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 ${({ theme }) => theme.spacing.xs};
  background: ${({ theme }) => theme.colors.error};
  color: white;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  border-radius: ${({ theme }) => theme.borderRadius.full};
`;

const SidebarFooter = styled.div`
  padding: ${({ theme }) => theme.spacing.xl};
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const ThemeToggleButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md};
  min-height: 44px; /* WCAG touch target minimum */
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
    color: ${({ theme }) => theme.colors.textPrimary};
    border-color: ${({ theme }) => theme.colors.neutral[400]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const ThemeToggleIcon = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  line-height: 1;
`;

// ── Farming Year Custom Dropdown ──────────────────────────────────────────

interface FarmingYearOption {
  year: number;
  display: string;
  isCurrent?: boolean;
}

interface FarmingYearDropdownProps {
  years: FarmingYearOption[];
  selectedYear: number | null;
  onSelect: (year: number | null) => void;
}

function FarmingYearDropdown({ years, selectedYear, onSelect }: FarmingYearDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedLabel = selectedYear === null
    ? 'All Years'
    : years.find((y) => y.year === selectedYear)?.display ?? `Year ${selectedYear}`;

  return (
    <FyWrapper ref={ref}>
      <FyLabel>📅 Farming Year</FyLabel>
      <FyTrigger onClick={() => setOpen((o) => !o)} $open={open}>
        <span>{selectedLabel}</span>
        <FyArrow $open={open}>▾</FyArrow>
      </FyTrigger>
      {open && (
        <FyMenu>
          <FyItem
            $active={selectedYear === null}
            onClick={() => { onSelect(null); setOpen(false); }}
          >
            All Years
          </FyItem>
          {years.map((y) => (
            <FyItem
              key={y.year}
              $active={selectedYear === y.year}
              onClick={() => { onSelect(y.year); setOpen(false); }}
            >
              <FyItemLabel>{y.display}</FyItemLabel>
              {y.isCurrent && <GreenLed />}
            </FyItem>
          ))}
        </FyMenu>
      )}
    </FyWrapper>
  );
}

// ── Farming Year Dropdown Styles ──────────────────────────────────────────

const FyWrapper = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  flex-shrink: 0;
  position: relative;
`;

const FyLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 6px;
`;

const FyTrigger = styled.button<{ $open: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md};
  min-height: 44px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ $open, theme }) => ($open ? theme.colors.surface : 'transparent')};
  border: 1px solid ${({ $open, theme }) => ($open ? theme.colors.primary[500] : theme.colors.neutral[300])};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
  }
`;

const FyArrow = styled.span<{ $open: boolean }>`
  font-size: 12px;
  transition: transform 0.15s ease;
  transform: ${({ $open }) => ($open ? 'rotate(180deg)' : 'rotate(0)')};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const FyMenu = styled.div`
  position: absolute;
  top: 100%;
  left: ${({ theme }) => theme.spacing.lg};
  right: ${({ theme }) => theme.spacing.lg};
  margin-top: 4px;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  z-index: ${({ theme }) => theme.zIndex.dropdown};
  max-height: 240px;
  overflow-y: auto;
`;

const FyItem = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ $active, theme }) => ($active ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.regular)};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary[500] : theme.colors.textPrimary)};
  background: ${({ $active, theme }) => ($active ? theme.colors.infoBg : 'transparent')};
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.1s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }

  &:first-child {
    border-radius: ${({ theme }) => `${theme.borderRadius.md} ${theme.borderRadius.md} 0 0`};
  }

  &:last-child {
    border-radius: ${({ theme }) => `0 0 ${theme.borderRadius.md} ${theme.borderRadius.md}`};
  }
`;

const FyItemLabel = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ledPulse = keyframes`
  0%, 100% {
    box-shadow: 0 0 4px 1px rgba(16, 185, 129, 0.4);
  }
  50% {
    box-shadow: 0 0 8px 3px rgba(16, 185, 129, 0.7);
  }
`;

const GreenLed = styled.span`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10B981;
  flex-shrink: 0;
  animation: ${ledPulse} 2s ease-in-out infinite;
`;

const MainContent = styled.main`
  flex: 1;
  overflow-y: auto;
  width: 100%;

  /* Account for mobile header on mobile */
  margin-top: 64px;

  @media (min-width: 1024px) {
    margin-top: 0;
  }
`;
