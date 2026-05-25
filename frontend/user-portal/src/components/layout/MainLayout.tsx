import { useState, useEffect, useRef, useContext, useCallback, useMemo, type ReactNode } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuthStore } from '../../stores/auth.store';
import { useDivisionStore } from '../../stores/division.store';
import { useThemeStore } from '../../stores/theme.store';
import { useFarmingYearStore } from '../../stores/farmingYear.store';
import { useFarmingYearsList } from '../../hooks/queries/useFarmingYears';
import { useFinanceEnabled } from '../../hooks/useCapabilities';
import { getPendingTaskCount } from '../../services/tasksApi';
import { Button } from '@a64core/shared';
import { UnsavedChangesContext } from '../../contexts/UnsavedChangesContext';
import { DivisionSwitcher } from './DivisionSwitcher';
import { AIAssistantPanel, AIAssistantFAB } from '../ai-assistant';

// ─── Navigation item definitions ────────────────────────────────────────────

interface NavItemDef {
  to?: string;              // optional — parent groups don't navigate
  icon: string;
  label: string;
  showBadge?: boolean;
  children?: NavItemDef[];  // group children
  defaultExpanded?: boolean;
}

// Navigation shown for every industry type
const SHARED_NAV_ITEMS: NavItemDef[] = [
  { to: '/dashboard', icon: '📊', label: 'Dashboard' },
];

const SHARED_BOTTOM_NAV_ITEMS: NavItemDef[] = [
  { to: '/crm/customers', icon: '👥', label: 'CRM' },
  { to: '/hr', icon: '👔', label: 'HR' },
  { to: '/ai', icon: '🤖', label: 'AI Hub' },
  { to: '/profile', icon: '👤', label: 'Profile' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
];

// Industry-specific navigation items
// Note: Operations and Inventory are NOT here — they live inside OPERATIONS_NAV_GROUP
const VEGETABLE_FRUITS_NAV: NavItemDef[] = [
  { to: '/farm/dashboard', icon: '🏞️', label: 'Farm Manager' },
  { to: '/farm/plants', icon: '🌿', label: 'Plant Library' },
];

const MUSHROOM_NAV: NavItemDef[] = [
  { to: '/mushroom/dashboard', icon: '🍄', label: 'Mushroom Dashboard' },
  { to: '/mushroom/rooms', icon: '🏠', label: 'Room Monitor' },
  { to: '/mushroom/facilities', icon: '🏭', label: 'Facilities' },
  { to: '/mushroom/strains', icon: '🧬', label: 'Strain Library' },
];

// Tools group — shared across all industry types
const TOOLS_NAV_GROUP: NavItemDef = {
  icon: '🧰',
  label: 'Tools',
  defaultExpanded: false,
  children: [
    { to: '/tools/fertilizer-calculator', icon: '💧', label: 'Fertilizer Calculator' },
    { to: '/tools/chemicals', icon: '🧪', label: 'Chemicals Catalog' },
  ],
};

// Purchasing group — visible to procurement + admin roles
const PURCHASING_NAV_GROUP: NavItemDef = {
  icon: '🛒',
  label: 'Purchasing',
  defaultExpanded: false,
  children: [
    { to: '/purchasing/vendors', icon: '📋', label: 'Vendors' },
    { to: '/purchasing/items', icon: '📦', label: 'Purchase Items' },
    { to: '/purchasing/payment-terms', icon: '💳', label: 'Payment Terms' },
    { to: '/purchasing/pr', icon: '📝', label: 'Purchase Requests' },
    { to: '/purchasing/po', icon: '🛒', label: 'Purchase Orders' },
    { to: '/purchasing/gr', icon: '📥', label: 'Goods Receipts' },
    { to: '/purchasing/ap', icon: '🧾', label: 'AP Invoices' },
    { to: '/purchasing/approvals', icon: '✅', label: 'Approval Inbox' },
  ],
};

// Finance group — accountant, finance_admin, auditor, admin, super_admin
const FINANCE_NAV_GROUP: NavItemDef = {
  icon: '📒',
  label: 'Finance',
  defaultExpanded: false,
  children: [
    { to: '/finance/chart-of-accounts', icon: '📋', label: 'Chart of Accounts' },
    { to: '/finance/approval-rules', icon: '✅', label: 'Approval Rules' },
    { to: '/finance/posting-setup', icon: '🗂️', label: 'Posting Setup' },
    { to: '/finance/item-mapping', icon: '🏷️', label: 'Item GL Mapping' },
    { to: '/finance/journal-entries', icon: '📒', label: 'Journal Entries' },
    { to: '/finance/trial-balance', icon: '⚖️', label: 'Trial Balance' },
    { to: '/finance/balance-sheet', icon: '🏛️', label: 'Balance Sheet' },
    { to: '/finance/income-statement', icon: '📊', label: 'Income Statement' },
    { to: '/finance/payments', icon: '💸', label: 'Vendor Payments' },
    { to: '/finance/ap-aging', icon: '📉', label: 'AP Aging' },
    { to: '/finance/vendor-sub-ledger', icon: '📑', label: 'Vendor Sub-Ledger' },
    { to: '/finance/periods', icon: '📅', label: 'Fiscal Periods' },
    { to: '/operations/pnl', icon: '📈', label: 'Operational P&L' },
    { to: '/finance/incoming', icon: '📥', label: 'Incoming Preview' },
  ],
};

// Admin-only navigation (super_admin role required)
const ADMIN_NAV_ITEMS: NavItemDef[] = [
  { to: '/admin/users', icon: '🛡️', label: 'User Management' },
  { to: '/admin/tenant-setup', icon: '🏗️', label: 'Tenant Setup' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function MainLayout() {
  const { user, logout } = useAuthStore();
  const { currentDivision } = useDivisionStore();
  const { mode, toggleTheme } = useThemeStore();
  const { selectedYear, setYear, initialize } = useFarmingYearStore();
  const { data: farmingYearsData } = useFarmingYearsList(5, true);
  // Wave 0 — hide the entire Finance sidebar group when the tenant has
  // modules.financeEnabled=false (or when the capability hasn't loaded yet
  // for an unauthenticated initial paint).
  const financeOn = useFinanceEnabled();
  const navigate = useNavigate();
  const location = useLocation();
  const unsavedChanges = useContext(UnsavedChangesContext);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);

  // ── Sidebar group expanded state ────────────────────────────────────────────
  // Persisted per-user in localStorage. Key: sidebar.expanded.{userId}
  const storageKey = `sidebar.expanded.${user?.userId ?? 'anon'}`;

  const getInitialExpanded = useCallback((): Record<string, boolean> => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      // ignore parse errors
    }
    // Default: honour defaultExpanded on each group
    return {
      Tools: TOOLS_NAV_GROUP.defaultExpanded ?? false,
      Operations: false,
      Purchasing: PURCHASING_NAV_GROUP.defaultExpanded ?? false,
      Finance: FINANCE_NAV_GROUP.defaultExpanded ?? false,
    };
  }, [storageKey]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    getInitialExpanded
  );

  const toggleGroup = useCallback(
    (label: string) => {
      setExpandedGroups((prev) => {
        const next = { ...prev, [label]: !prev[label] };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // storage full — non-fatal
        }
        return next;
      });
    },
    [storageKey]
  );

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

  // Back-to-top button — listens to window scroll (LayoutContainer uses
  // min-height:100vh so the body is the actual scroll container, not <main>).
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 300);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Reason: on route change, scroll only the main content area to top —
  // leave the sidebar's internal scroll position alone so the user stays at
  // the nav item they just clicked. Targeted via ref instead of
  // window.scrollTo so we don't disturb any other independently-scrolled
  // container.
  const mainContentRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    // Reset window scroll too — on layouts where the window is the actual
    // scroll container (no overflow constraint on MainContent), this is the
    // only one that matters. Doesn't move the sidebar because it's
    // position:fixed and its inner <nav> is its own scroll container.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.search]);

  // Determine which industry-specific nav items to show
  const industryNavItems: NavItemDef[] =
    currentDivision?.industryType === 'mushroom' ? MUSHROOM_NAV : VEGETABLE_FRUITS_NAV;

  // Roles that can see the Purchasing sidebar group
  const _PURCHASING_ROLES = new Set([
    'procurement_officer',
    'procurement_manager',
    'admin',
    'super_admin',
    'finance_admin',
  ]);

  // Roles that can see the Finance sidebar group
  const _FINANCE_ROLES = new Set([
    'accountant',
    'finance_admin',
    'auditor',
    'admin',
    'super_admin',
  ]);

  // Build the full ordered navigation list
  const navItems: NavItemDef[] = useMemo(
    () => {
      // Operations group children — Purchasing sub-group is role-gated
      const operationsChildren: NavItemDef[] = [
        { to: '/operations', icon: '📋', label: 'Task Manager', showBadge: true },
        { to: '/inventory', icon: '📦', label: 'Inventory' },
        ...(_PURCHASING_ROLES.has(user?.role ?? '') ? [PURCHASING_NAV_GROUP] : []),
        { to: '/sales', icon: '💰', label: 'Sales' },
        { to: '/logistics', icon: '🚚', label: 'Logistics' },
        { to: '/marketing', icon: '📢', label: 'Marketing' },
      ];

      const OPERATIONS_NAV_GROUP: NavItemDef = {
        icon: '🏭',
        label: 'Operations',
        defaultExpanded: false,
        children: operationsChildren,
      };

      return [
        ...SHARED_NAV_ITEMS,
        ...industryNavItems,
        // Tools group — available to all users
        TOOLS_NAV_GROUP,
        // Operations group — available to all users (Purchasing sub-group is role-gated inside)
        OPERATIONS_NAV_GROUP,
        // Finance group — accountant, finance_admin, auditor, admin, super_admin
        // AND the per-tenant finance module must be enabled (Wave 0)
        ...(financeOn && _FINANCE_ROLES.has(user?.role ?? '') ? [FINANCE_NAV_GROUP] : []),
        // Bottom items — AI Hub is super_admin only
        ...SHARED_BOTTOM_NAV_ITEMS.filter((item) => {
          if (item.to === '/ai') return user?.role === 'super_admin';
          return true;
        }),
        ...(user?.role === 'super_admin' ? ADMIN_NAV_ITEMS : []),
      ];
    },
    [industryNavItems, user?.role, financeOn]
  );

  // ── Recursive nav item renderer ────────────────────────────────────────────
  // depth=0: top-level items/groups; depth=1: children of a top-level group;
  // depth=2: grandchildren (e.g. Purchasing inside Operations).
  // A group is "child-active" if ANY descendant route is currently active.
  const hasActiveDescendant = (item: NavItemDef): boolean => {
    if (!item.children) return false;
    return item.children.some(
      (child) =>
        (child.to && location.pathname.startsWith(child.to)) ||
        hasActiveDescendant(child)
    );
  };

  const renderNavItem = (item: NavItemDef, depth: number): ReactNode => {
    // ── Group item (has children) ──────────────────────────────────────────
    if (item.children) {
      const isExpanded = expandedGroups[item.label] ?? (item.defaultExpanded ?? false);
      const isChildActive = hasActiveDescendant(item);
      return (
        <div key={item.label}>
          <NavGroupHeader
            $childActive={isChildActive}
            $depth={depth}
            onClick={() => toggleGroup(item.label)}
            aria-expanded={isExpanded}
            aria-label={`${item.label} navigation group`}
            style={{ paddingLeft: `calc(${depth} * 14px + 1rem)` }}
          >
            {depth === 0
              ? <NavIcon>{item.icon}</NavIcon>
              : <NavChildIcon>{item.icon}</NavChildIcon>
            }
            <NavGroupLabel>{item.label}</NavGroupLabel>
            <NavGroupCaret $expanded={isExpanded} aria-hidden="true">▾</NavGroupCaret>
          </NavGroupHeader>
          {isExpanded && (
            <NavGroupChildren $depth={depth}>
              {item.children.map((child) => renderNavItem(child, depth + 1))}
            </NavGroupChildren>
          )}
        </div>
      );
    }

    // ── Leaf item ─────────────────────────────────────────────────────────
    return (
      <NavItem
        key={item.to ?? item.label}
        to={item.to!}
        onClick={(e) => handleNavClick(e, item.to!)}
        style={{ paddingLeft: `calc(${depth} * 14px + 1rem)` }}
      >
        {depth === 0
          ? <NavIcon>{item.icon}</NavIcon>
          : <NavChildIcon>{item.icon}</NavChildIcon>
        }
        {item.showBadge ? (
          <NavContent>
            <span>{item.label}</span>
            {pendingTaskCount > 0 && <Badge>{pendingTaskCount}</Badge>}
          </NavContent>
        ) : (
          <span>{item.label}</span>
        )}
      </NavItem>
    );
  };

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
          <UserCard>
            <UserCardTop>
              <UserAvatar>
                {user?.firstName?.[0] || ''}{user?.lastName?.[0] || ''}
              </UserAvatar>
              <UserCardInfo>
                <UserName>{user?.firstName} {user?.lastName}</UserName>
                <UserRole>{user?.role?.replace(/_/g, ' ') || 'User'}</UserRole>
              </UserCardInfo>
            </UserCardTop>
            <UserCardActions>
              <ThemeToggleSmall
                onClick={toggleTheme}
                aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {mode === 'dark' ? '☀️' : '🌙'}
              </ThemeToggleSmall>
              <LogoutSmall onClick={handleLogout} title="Logout">
                Logout
              </LogoutSmall>
            </UserCardActions>
          </UserCard>

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
          {navItems.map((item) => renderNavItem(item, 0))}
        </Nav>

      </Sidebar>

      {/* Overlay for mobile menu */}
      {isMobileMenuOpen && <Overlay onClick={closeMobileMenu} />}

      {/* Main Content */}
      <MainContent ref={mainContentRef}>
        <Outlet />
      </MainContent>

      {/* Back to top — outside MainContent so position:fixed isn't clipped by overflow:auto */}
      <BackToTopButton
        $visible={showBackToTop}
        onClick={scrollToTop}
        aria-label="Scroll to top"
        title="Back to top"
      >
        ↑
      </BackToTopButton>

      {/* AI Assistant — slide-out panel available on every authenticated page */}
      <AIAssistantFAB />
      <AIAssistantPanel />
    </LayoutContainer>
  );
}

// ─── Styled Components ───────────────────────────────────────────────────────

const LayoutContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral[50]};
  /* Reason: do NOT set overflow-x here. LayoutContainer is the sidebar's
     parent, and overflow on a sticky element's ancestor breaks sticky.
     Horizontal clipping is done on MainContent (sibling of Sidebar) instead. */

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
    /* Reason: was 'position: static' which made the sidebar scroll with the
       page on desktop. When window scrolled down to reach a lower nav item,
       clicking it then triggered the route-change reset of window scroll —
       which visually scrolled the sidebar back to the top because it was
       part of the normal flow.
       Sticky + height:100vh + flex-shrink:0 pins the sidebar to the viewport.
       The inner <Nav> has overflow-y:auto with flex:1 so the nav list scrolls
       INSIDE the sidebar instead of pushing the whole sidebar down. Window
       scroll only affects MainContent now. */
    position: sticky;
    top: 0;
    height: 100vh;
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
  padding: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
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
  /* Sidebar logo — banner ~2.9:1, sidebar width ~240-280px so cap height
     at 70px (→ ~200px wide, fits with breathing room). */
  height: clamp(40px, 5vw, 70px);
  width: auto;
  display: block;
  margin: 0 auto;
`;

const UserCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const UserCardTop = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const UserAvatar = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const UserCardInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const UserName = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const UserRole = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textDisabled};
  text-transform: capitalize;
`;

const UserCardActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding-top: ${({ theme }) => theme.spacing.xs};
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const ThemeToggleSmall = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.neutral[100]};
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms ease;
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[300]};
  }
`;

const LogoutSmall = styled.button`
  flex: 1;
  padding: 6px 0;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[100]};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: pointer;
  font-family: inherit;
  transition: all 150ms ease;

  &:hover {
    background: ${({ theme }) => theme.colors.errorBg};
    color: ${({ theme }) => theme.colors.error};
  }
`;

const DivisionSwitcherWrapper = styled.div`
  /* Provides consistent vertical spacing between user info and the switcher */
`;

const Nav = styled.nav`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
`;

const NavItem = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  min-height: 36px;
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
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
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
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  min-height: 36px;
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

// ── Group nav styled components ───────────────────────────────────────────────

interface NavGroupHeaderProps {
  $childActive: boolean;
  $depth: number;
}

const NavGroupHeader = styled.button<NavGroupHeaderProps>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  /* Horizontal padding is overridden inline via style prop for depth-based indentation;
     vertical padding and min-height remain constant for touch target compliance. */
  padding: ${({ theme }) => theme.spacing.md};
  min-height: 36px;
  width: 100%;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ $childActive, theme }) =>
    $childActive ? `${theme.colors.primary[500]}0d` : 'transparent'};
  color: ${({ $childActive, theme }) =>
    $childActive ? theme.colors.primary[500] : theme.colors.textSecondary};
  /* Sub-group headers (depth >= 1) use smaller font and lighter weight */
  font-size: ${({ $depth, theme }) =>
    $depth >= 1 ? theme.typography.fontSize.sm : theme.typography.fontSize.base};
  font-weight: ${({ $depth, theme }) =>
    $depth >= 1
      ? theme.typography.fontWeight.regular
      : theme.typography.fontWeight.medium};
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const NavGroupLabel = styled.span`
  flex: 1;
`;

const NavGroupCaret = styled.span<{ $expanded: boolean }>`
  font-size: 12px;
  transition: transform 0.15s ease;
  transform: ${({ $expanded }) => ($expanded ? 'rotate(0deg)' : 'rotate(-90deg)')};
  color: ${({ theme }) => theme.colors.textDisabled};
`;

const NavGroupChildren = styled.div<{ $depth: number }>`
  display: flex;
  flex-direction: column;
  gap: 1px;
  /* Each depth level adds 14px of left indent on top of the base 16px */
  padding-left: ${({ $depth }) => 16 + $depth * 14}px;
`;

const NavChildIcon = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
`;

const BackToTopButton = styled.button<{ $visible: boolean }>`
  position: fixed;
  bottom: 32px;
  right: 32px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  font-size: 20px;
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  cursor: pointer;
  box-shadow: ${({ theme }) => theme.shadows.lg};
  z-index: ${({ theme }) => theme.zIndex.sticky};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 200ms ease, transform 200ms ease;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transform: ${({ $visible }) => ($visible ? 'translateY(0)' : 'translateY(16px)')};
  pointer-events: ${({ $visible }) => ($visible ? 'auto' : 'none')};

  &:hover {
    background: ${({ theme }) => theme.colors.primary[700]};
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }

  @media (max-width: 640px) {
    bottom: 20px;
    right: 20px;
  }
`;

const MainContent = styled.main`
  flex: 1;
  width: 100%;
  /* Horizontal clip — was previously on body/html/#root via the shared
     GlobalStyles. Moved here because clipping on ancestors of the sticky
     sidebar breaks position:sticky (CSS spec promotes the unspecified axis
     to 'auto', making the element a scroll container). MainContent is a
     sibling of Sidebar, so clipping here is safe. */
  overflow-x: hidden;
  /* min-width:0 lets flex-shrink work so wide tables clip correctly */
  min-width: 0;

  /* Account for mobile header on mobile */
  margin-top: 64px;

  @media (min-width: 1024px) {
    margin-top: 0;
  }
`;
