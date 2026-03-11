import { useState, useEffect, useContext, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { useAuthStore } from '../../stores/auth.store';
import { useDivisionStore } from '../../stores/division.store';
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
  { to: '/marketing', icon: '📢', label: 'Marketing' },
  { to: '/ai-analytics', icon: '🤖', label: 'AI Analytics' },
  { to: '/ai-dashboard', icon: '📋', label: 'AI Dashboard' },
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
  const navigate = useNavigate();
  const location = useLocation();
  const unsavedChanges = useContext(UnsavedChangesContext);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);

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
    ...SHARED_BOTTOM_NAV_ITEMS,
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
