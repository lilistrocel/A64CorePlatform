import { useState, useEffect, useRef, useContext, useCallback, useMemo, type ReactNode } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Home,
  Factory,
  Dna,
  ClipboardList,
  Wrench,
  Droplet,
  FlaskConical,
  ShoppingCart,
  Package,
  CreditCard,
  FileEdit,
  Inbox,
  Receipt,
  CheckCircle2,
  CircleDollarSign,
  FileStack,
  Truck,
  Megaphone,
  Banknote,
  Undo2,
  RefreshCw,
  TrendingDown,
  Tag,
  BookOpen,
  FolderCog,
  PenLine,
  Scale,
  Landmark,
  TrendingUp,
  Wallet,
  Calendar,
  Shield,
  Construction,
  Users,
  Contact,
  Bot,
  User,
  Settings,
  Leaf,
  Mountain,
  ArrowUp,
  ChevronDown,
  Maximize,
  Minimize,
} from 'lucide-react';
import { monoLabel } from '@a64core/shared';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useAuthStore } from '../../stores/auth.store';
import { useDivisionStore } from '../../stores/division.store';
import { useFarmingYearStore } from '../../stores/farmingYear.store';
import { useFarmingYearsList } from '../../hooks/queries/useFarmingYears';
import { useFinanceEnabled } from '../../hooks/useCapabilities';
import { getPendingTaskCount } from '../../services/tasksApi';
import { UnsavedChangesContext } from '../../contexts/UnsavedChangesContext';
import { DivisionSwitcher } from './DivisionSwitcher';
import { AIAssistantPanel, AIAssistantFAB } from '../ai-assistant';
import { AutoNameBanner } from '../common/AutoNameBanner';

// ─── Navigation item definitions ────────────────────────────────────────────
// Night Observatory (T-901, spec §6): every nav icon is a lucide-react line
// icon, not an emoji. Rendered at 17px, currentColor, 1.6px stroke.

interface NavItemDef {
  to?: string;              // optional — parent groups don't navigate
  icon: LucideIcon;
  label: string;
  showBadge?: boolean;
  sectionLabel?: string;    // optional Space Mono divider rendered ABOVE this item (spec §4 "Sidebar")
  children?: NavItemDef[];  // group children
  defaultExpanded?: boolean;
}

// Navigation shown for every industry type
const SHARED_NAV_ITEMS: NavItemDef[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', sectionLabel: 'Operations' },
];

const SHARED_BOTTOM_NAV_ITEMS: NavItemDef[] = [
  { to: '/crm/customers', icon: Users, label: 'CRM' },
  { to: '/hr', icon: Contact, label: 'HR' },
  { to: '/ai', icon: Bot, label: 'AI Hub' },
  { to: '/profile', icon: User, label: 'Profile' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

// Industry-specific navigation items
// Note: Operations and Inventory are NOT here — they live inside OPERATIONS_NAV_GROUP
const VEGETABLE_FRUITS_NAV: NavItemDef[] = [
  { to: '/farm/dashboard', icon: Mountain, label: 'Farm Manager' },
  { to: '/farm/plants', icon: Leaf, label: 'Plant Library' },
];

// No dashboard entry here: /dashboard already resolves to the mushroom
// dashboard for a mushroom division, so listing it again was two nav items for
// one screen. The /mushroom/dashboard route still exists for direct links.
const MUSHROOM_NAV: NavItemDef[] = [
  { to: '/mushroom/rooms', icon: Home, label: 'Room Monitor' },
  { to: '/mushroom/facilities', icon: Factory, label: 'Facilities' },
  { to: '/mushroom/strains', icon: Dna, label: 'Strain Library' },
];

// Genetics Repo — shared across all industry types. The lab is common to every
// department (vegetables, mushrooms, animals), so this sits outside the
// industry-specific nav rather than inside MUSHROOM_NAV / VEGETABLE_FRUITS_NAV.
const GENETICS_NAV_GROUP: NavItemDef = {
  icon: Dna,
  label: 'Genetics Repo',
  defaultExpanded: false,
  children: [
    { to: '/genetics', icon: Dna, label: 'Lines' },
    { to: '/genetics/media', icon: FlaskConical, label: 'Media & Recipes' },
  ],
};

// Protocols (SOPs) — shared. Sits next to Genetics Repo because the two are
// used together: the procedure and the record of having followed it.
const PROTOCOLS_NAV_ITEM: NavItemDef = {
  to: '/protocols',
  icon: ClipboardList,
  label: 'Protocols',
  sectionLabel: 'Library',
};

// Tools group — shared across all industry types
const TOOLS_NAV_GROUP: NavItemDef = {
  icon: Wrench,
  label: 'Tools',
  defaultExpanded: false,
  children: [
    { to: '/tools/fertilizer-calculator', icon: Droplet, label: 'Fertilizer Calculator' },
    { to: '/tools/chemicals', icon: FlaskConical, label: 'Chemicals Catalog' },
  ],
};

// Purchasing group — visible to procurement + admin roles
const PURCHASING_NAV_GROUP: NavItemDef = {
  icon: ShoppingCart,
  label: 'Purchasing',
  defaultExpanded: false,
  children: [
    { to: '/purchasing/vendors', icon: ClipboardList, label: 'Vendors' },
    { to: '/purchasing/items', icon: Package, label: 'Purchase Items' },
    { to: '/purchasing/payment-terms', icon: CreditCard, label: 'Payment Terms' },
    { to: '/purchasing/pr', icon: FileEdit, label: 'Purchase Requests' },
    { to: '/purchasing/po', icon: ShoppingCart, label: 'Purchase Orders' },
    { to: '/purchasing/gr', icon: Inbox, label: 'Goods Receipts' },
    { to: '/purchasing/ap', icon: Receipt, label: 'AP Invoices' },
    { to: '/purchasing/approvals', icon: CheckCircle2, label: 'Approval Inbox' },
  ],
};

// Sales group — full Wave 3 surface (Wave 3 rebuild closed by T-200.11; the
// legacy flat /sales entry has been folded in as Dashboard).
const SALES_NAV_GROUP: NavItemDef = {
  icon: CircleDollarSign,
  label: 'Sales',
  defaultExpanded: false,
  children: [
    // Overview
    { to: '/sales', icon: LayoutDashboard, label: 'Dashboard' },
    // Forward cycle (Quote → Receipt) — in document-chain order
    { to: '/sales/quotes', icon: ClipboardList, label: 'Quotes' },
    { to: '/sales/orders-v2', icon: FileStack, label: 'Sales Orders' },
    { to: '/sales/deliveries', icon: Package, label: 'Deliveries' },
    { to: '/sales/ar-invoices', icon: Receipt, label: 'AR Invoices' },
    { to: '/sales/customer-receipts', icon: Banknote, label: 'Customer Receipts' },
    // Returns cycle (RR → RTN → ARC)
    { to: '/sales/return-requests', icon: Undo2, label: 'Return Requests' },
    { to: '/sales/returns-v2', icon: RefreshCw, label: 'Returns' },
    { to: '/sales/ar-credit-notes', icon: FileEdit, label: 'AR Credit Notes' },
    // Reports + reference + admin
    { to: '/sales/reports/ar-aging', icon: TrendingDown, label: 'AR Aging' },
    { to: '/sales/stock', icon: Package, label: 'Stock' },
    { to: '/sales/items', icon: Tag, label: 'Sales Items Config' },
  ],
};

// Finance group — accountant, finance_admin, auditor, admin, super_admin
const FINANCE_NAV_GROUP: NavItemDef = {
  icon: BookOpen,
  label: 'Finance',
  defaultExpanded: false,
  children: [
    { to: '/finance/chart-of-accounts', icon: ClipboardList, label: 'Chart of Accounts' },
    { to: '/finance/approval-rules', icon: CheckCircle2, label: 'Approval Rules' },
    { to: '/finance/posting-setup', icon: FolderCog, label: 'Posting Setup' },
    { to: '/finance/item-mapping', icon: Tag, label: 'Item GL Mapping' },
    { to: '/finance/journal-entries', icon: BookOpen, label: 'Journal Entries' },
    { to: '/finance/journal-entries/new', icon: PenLine, label: 'New Manual JE' },
    { to: '/finance/trial-balance', icon: Scale, label: 'Trial Balance' },
    { to: '/finance/balance-sheet', icon: Landmark, label: 'Balance Sheet' },
    { to: '/finance/income-statement', icon: TrendingUp, label: 'Income Statement' },
    { to: '/finance/cash-flow', icon: Wallet, label: 'Cash Flow' },
    { to: '/finance/payments', icon: Wallet, label: 'Vendor Payments' },
    { to: '/finance/ap-aging', icon: TrendingDown, label: 'AP Aging' },
    { to: '/finance/vendor-sub-ledger', icon: FileStack, label: 'Vendor Sub-Ledger' },
    { to: '/finance/periods', icon: Calendar, label: 'Fiscal Periods' },
    { to: '/operations/pnl', icon: TrendingUp, label: 'Operational P&L' },
    { to: '/finance/incoming', icon: Inbox, label: 'Incoming Preview' },
  ],
};

// Admin-only navigation (super_admin role required)
const ADMIN_NAV_ITEMS: NavItemDef[] = [
  { to: '/admin/users', icon: Shield, label: 'User Management' },
  { to: '/admin/tenant-setup', icon: Construction, label: 'Tenant Setup' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function MainLayout() {
  const { user, logout } = useAuthStore();
  const { currentDivision } = useDivisionStore();
  const { selectedYear, setYear, initialize } = useFarmingYearStore();
  const { data: farmingYearsData } = useFarmingYearsList(5, true);
  // Wave 0 — hide the entire Finance sidebar group when the tenant has
  // modules.financeEnabled=false (or when the capability hasn't loaded yet
  // for an unauthenticated initial paint).
  const financeOn = useFinanceEnabled();
  const navigate = useNavigate();
  const location = useLocation();
  const unsavedChanges = useContext(UnsavedChangesContext);
  const { isFullscreen, toggle: toggleFullscreen, isSupported: isFullscreenSupported } = useFullscreen();
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
      Sales: SALES_NAV_GROUP.defaultExpanded ?? false,
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
    // position:fixed and its inner SidebarNavScroll is its own scroll
    // container (SidebarFooter sits outside it and never scrolls).
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
        { to: '/operations', icon: ClipboardList, label: 'Task Manager', showBadge: true },
        { to: '/inventory', icon: Package, label: 'Inventory' },
        ...(_PURCHASING_ROLES.has(user?.role ?? '') ? [PURCHASING_NAV_GROUP] : []),
        SALES_NAV_GROUP,
        { to: '/logistics', icon: Truck, label: 'Logistics' },
        { to: '/marketing', icon: Megaphone, label: 'Marketing' },
      ];

      const OPERATIONS_NAV_GROUP: NavItemDef = {
        icon: Factory,
        label: 'Operations',
        defaultExpanded: false,
        children: operationsChildren,
      };

      return [
        ...SHARED_NAV_ITEMS,
        ...industryNavItems,
        // Genetics Repo — shared lab, visible to every industry type
        GENETICS_NAV_GROUP,
        // Protocols — the written procedures behind that work
        PROTOCOLS_NAV_ITEM,
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
    const ItemIcon = item.icon;
    const label = (
      <>
        {item.sectionLabel && (
          <SectionLabel key={`${item.sectionLabel}-label`}>{item.sectionLabel}</SectionLabel>
        )}
      </>
    );

    // ── Group item (has children) ──────────────────────────────────────────
    if (item.children) {
      const isExpanded = expandedGroups[item.label] ?? (item.defaultExpanded ?? false);
      const isChildActive = hasActiveDescendant(item);
      return (
        <div key={item.label}>
          {label}
          <NavGroupHeader
            $childActive={isChildActive}
            $depth={depth}
            onClick={() => toggleGroup(item.label)}
            aria-expanded={isExpanded}
            aria-label={`${item.label} navigation group`}
            style={{ paddingLeft: `calc(${depth} * 14px + 1rem)` }}
          >
            <NavIcon><ItemIcon size={17} strokeWidth={1.6} /></NavIcon>
            <NavGroupLabel>{item.label}</NavGroupLabel>
            <NavGroupCaret $expanded={isExpanded} aria-hidden="true">
              <ChevronDown size={13} strokeWidth={1.8} />
            </NavGroupCaret>
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
      <div key={item.to ?? item.label}>
        {label}
        <NavItem
          to={item.to!}
          onClick={(e) => handleNavClick(e, item.to!)}
          style={{ paddingLeft: `calc(${depth} * 14px + 1rem)` }}
        >
          <NavIcon><ItemIcon size={17} strokeWidth={1.6} /></NavIcon>
          {item.showBadge ? (
            <NavContent>
              <span>{item.label}</span>
              {pendingTaskCount > 0 && <Badge>{pendingTaskCount}</Badge>}
            </NavContent>
          ) : (
            <span>{item.label}</span>
          )}
        </NavItem>
      </div>
    );
  };

  return (
    <LayoutContainer>
      {/* Mobile Header */}
      <MobileHeader>
        <MobileLogo>
          <Emblem>
            <img src="/brand/mark_mono.svg" alt="A20Core" />
          </Emblem>
        </MobileLogo>
        <MobileHeaderActions>
          {isFullscreenSupported && (
            <MobileIconButton
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              aria-pressed={isFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize size={20} strokeWidth={1.8} /> : <Maximize size={20} strokeWidth={1.8} />}
            </MobileIconButton>
          )}
          <MenuButton
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </MenuButton>
        </MobileHeaderActions>
      </MobileHeader>

      {/* Sidebar */}
      <Sidebar $isOpen={isMobileMenuOpen} aria-label="Sidebar">
        {/* Scroll region for header + nav ONLY. SidebarFooter is a sibling
            below this, outside the scroll region, so it always stays
            visible/pinned to the bottom of the sidebar regardless of how
            long the nav list grows — see SidebarNavScroll definition for
            details. SidebarHeader is position:sticky inside it, so it reads
            as "pinned" at the top of the scroll region while Nav scrolls
            beneath it. */}
        <SidebarNavScroll>
          <SidebarHeader>
            <LogoRow>
              <Emblem>
                {/* Official brand mark (never redrawn — brand contract §2) inside
                    the Night Observatory gold-glow ring per spec §4/mockup l.77-79. */}
                <img src="/brand/mark_mono.svg" alt="" />
              </Emblem>
              <Wordmark>
                <b>A20</b>
                <span>Core</span>
              </Wordmark>
            </LogoRow>

            {/* Org / workspace chip — spec §4 "Sidebar" — restyled in DivisionSwitcher.tsx */}
            <DivisionSwitcher />
          </SidebarHeader>

          <Nav aria-label="Main navigation">
            {navItems.map((item) => renderNavItem(item, 0))}
          </Nav>
        </SidebarNavScroll>

        {/* Footer — FY selector chip + user chip, per mockup l.103-109.
            Sibling of SidebarNavScroll (not nested inside it) so it is
            always in view, never scrolled off with the nav list — this is
            the fix for the footer being unreachable when the nav overflows
            the viewport. */}
        <SidebarFooter>
          <FooterTopRow>
            <FarmingYearDropdown
              years={farmingYearsData?.years ?? []}
              selectedYear={selectedYear}
              onSelect={setYear}
            />
            {isFullscreenSupported && (
              <FullscreenChip
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                aria-pressed={isFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? <Minimize size={14} strokeWidth={1.8} /> : <Maximize size={14} strokeWidth={1.8} />}
              </FullscreenChip>
            )}
          </FooterTopRow>
          <UserChip>
            <UserAvatar>
              {user?.firstName?.[0] || ''}{user?.lastName?.[0] || ''}
            </UserAvatar>
            <UserChipInfo>
              <UserName>{user?.firstName} {user?.lastName}</UserName>
              <UserRole>{user?.role?.replace(/_/g, ' ') || 'User'}</UserRole>
            </UserChipInfo>
            <LogoutSmall onClick={handleLogout} title="Logout" aria-label="Logout">
              Logout
            </LogoutSmall>
          </UserChip>
        </SidebarFooter>
      </Sidebar>

      {/* Overlay for mobile menu */}
      {isMobileMenuOpen && <Overlay onClick={closeMobileMenu} />}

      {/* Main Content */}
      <MainContent ref={mainContentRef}>
        <AutoNameBanner />
        <Outlet />
      </MainContent>

      {/* Back to top — outside MainContent so position:fixed isn't clipped by overflow:auto */}
      <BackToTopButton
        $visible={showBackToTop}
        onClick={scrollToTop}
        aria-label="Scroll to top"
        title="Back to top"
      >
        <ArrowUp size={18} strokeWidth={2} />
      </BackToTopButton>

      {/* AI Assistant — slide-out panel available on every authenticated page.
          This is the app's one floating action affordance (spec deliverable F) —
          restyled to the gold FAB treatment in AIAssistantFAB.tsx itself. */}
      <AIAssistantFAB />
      <AIAssistantPanel />
    </LayoutContainer>
  );
}

// ─── Styled Components ───────────────────────────────────────────────────────
// Night Observatory (T-901 Phase 2, spec §4 "Sidebar"). Visual ground truth:
// Brand_Engineering/Brand/A20Core_NightObservatory_Glass.html lines 69-109,250-283.

const LayoutContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  /* Night Observatory sky-blocker fix (spec §7): NO opaque background here.
     The fixed Sky layer is mounted once at the app shell (App.tsx AppShell,
     z-index:1) and must show through every routed page — an opaque
     LayoutContainer background paints over it on every screen. */
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
  background: rgba(14, 19, 48, 0.55);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  height: 64px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;

  @supports not (backdrop-filter: blur(1px)) {
    background: ${({ theme }) => theme.colors.glass.opaque};
  }

  @media (min-width: 1024px) {
    display: none;
  }
`;

const MobileLogo = styled.div`
  display: flex;
  align-items: center;
`;

const MobileHeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};

  @media (min-width: 1024px) {
    display: none;
  }
`;

/* Muted icon button beside the hamburger — not gold (spec §3 budget is
   already spent on logo/active-nav/stat-thread/CTA/focus-ring/section
   underline/harvesting; this is ordinary chrome, celeste/cream on hover
   like the rest of the header). */
const MobileIconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: ${({ theme }) => theme.spacing.sm};
  min-width: 44px; /* WCAG touch target minimum */
  min-height: 44px; /* WCAG touch target minimum */
  color: ${({ theme }) => theme.colors.textSecondary};
  transition: color 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
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
  width: 248px;
  background: rgba(14, 19, 48, 0.55);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  border-right: 1px solid ${({ theme }) => theme.colors.line};
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 50;
  transform: translateX(${({ $isOpen }) => ($isOpen ? '0' : '-100%')});
  transition: transform 0.3s ease-in-out;
  /* Reason: no overflow here — SidebarNavScroll (the flex:1 child wrapping
     header+nav) is the ONLY scroll container. Having overflow-y:auto on
     both this aside AND the inner nav produced two competing/nested
     scrollbars on short viewports. Setting overflow-y on an ANCESTOR of a
     position:sticky element can neutralise that stickiness (see
     GlobalStyles.tsx html-rule comment for the general mechanism); this
     aside is itself the sticky element, but the scroll boundary is kept
     one level down regardless, on a plain descendant div, to stay clear of
     that class of bug entirely. SidebarFooter is a second,
     flex-shrink:0 child of this aside (sibling of SidebarNavScroll, not
     nested inside it) so it is never part of the scrollable region and
     always stays visible at the bottom of the sidebar. */

  @supports not (backdrop-filter: blur(1px)) {
    background: ${({ theme }) => theme.colors.glass.opaque};
  }

  @media (min-width: 1024px) {
    /* Reason: was 'position: static' which made the sidebar scroll with the
       page on desktop. When window scrolled down to reach a lower nav item,
       clicking it then triggered the route-change reset of window scroll —
       which visually scrolled the sidebar back to the top because it was
       part of the normal flow.
       Sticky + height:100vh + flex-shrink:0 pins the sidebar to the viewport.
       SidebarNavScroll (flex:1, min-height:0, overflow-y:auto) fills the
       space left over after SidebarFooter's natural height and is the sole
       scroll region — SidebarFooter (flex-shrink:0) is pinned below it and
       always stays on-screen. Window scroll only affects MainContent now. */
    position: sticky;
    top: 0;
    height: 100vh;
    transform: translateX(0);
    flex-shrink: 0;
  }

  /* Mockup breakpoint (spec §4 "Sidebar" / brief l.243): sidebar hides under
     900px. The app's own mobile-menu breakpoint is 1024px (desktop kicks in
     above it) — preserved as-is; this rule only affects the narrow band
     between 900-1024px is unaffected since $isOpen/transform already governs
     visibility below 1024px via the mobile menu toggle. No behaviour change. */
`;

// Scroll region for header + nav ONLY — SidebarFooter is a sibling of this
// component in the JSX (inside Sidebar, after this element), not a child of
// it, so the footer (farming-year selector, fullscreen toggle, user chip) is
// never part of the scrollable content and can't be scrolled out of view.
// SidebarHeader inside here is position:sticky, so it reads as a "pinned
// header" while Nav scrolls beneath it.
// flex:1 + min-height:0 together are what let this element actually shrink
// to fit inside Sidebar's height:100vh (a bare flex:1 is not enough — flex
// items default to min-height:auto, which floors this element's height at
// its content size and lets it overflow the sticky aside instead of
// clipping/scrolling internally; min-height:0 removes that floor). Without
// min-height:0 here, a full nav (mushroom + operations + purchasing + sales
// + logistics + marketing + finance) overflows the aside, the aside itself
// never becomes a scroll container (overflow-y stays 'visible' by design —
// see the Sidebar comment above), and neither the sidebar nor the page
// scrolls: everything below the overflow point, including SidebarFooter,
// becomes permanently unreachable. That was the actual bug this component
// fixes.
const SidebarNavScroll = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 26px 16px 22px;

  /* Thin, cosmosHi-thumb scrollbar (night-observatory-spec.md §9) is already
     applied globally via the universal-selector rule in GlobalStyles.tsx —
     no per-component override needed here. */
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  /* Cosmos Ink scrim (#0E1330), not pure black — brand contract §1. */
  background: rgba(14, 19, 48, 0.5);
  z-index: 45;

  @media (min-width: 1024px) {
    display: none;
  }
`;

const SidebarHeader = styled.div`
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* Sticky within SidebarNavScroll — stays pinned at the top while Nav
     content scrolls beneath it (matches the previous "pinned header" look).
     Needs its own opaque-ish background since scrolled nav content passes
     behind it — the glass base tint keeps the sky consistent instead of an
     opaque block. The negative margin below cancels out SidebarNavScroll's
     own 26px/16px top/side padding so this header sits flush with the
     scroll region's edges, then padding re-adds equivalent inset for its
     own content. */
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgba(14, 19, 48, 0.55);
  padding-bottom: 14px;
  margin: -26px -16px 6px;
  padding: 26px 16px 14px;

  @supports not (backdrop-filter: blur(1px)) {
    background: ${({ theme }) => theme.colors.glass.opaque};
  }
`;

const LogoRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 4px 10px;
`;

const Emblem = styled.span`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 3px solid ${({ theme }) => theme.colors.secondary[500]};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  /* The ONE logo gold glow — spec §3 gold-discipline budget item #1. */
  box-shadow: 0 0 24px rgba(220, 185, 79, 0.4), inset 0 0 10px rgba(220, 185, 79, 0.22);

  img {
    width: 68%;
    height: 68%;
    display: block;
  }
`;

const Wordmark = styled.span`
  font-size: 1.55rem;
  color: ${({ theme }) => theme.colors.textPrimary};
  display: flex;

  b {
    font-weight: 800;
  }

  span {
    font-weight: 600;
  }
`;

// ── Footer: FY chip + user chip (mockup l.103-109) ─────────────────────────

const SidebarFooter = styled.div`
  /* flex-shrink:0 — this is a direct sibling of SidebarNavScroll (flex:1)
     inside Sidebar, not nested inside it, so it is never part of the
     scrollable nav region and always stays visible pinned to the bottom of
     the viewport-height aside. No margin-top:auto needed to "push" it down
     the way the static mockup does: SidebarNavScroll's flex:1 already grows
     to consume all space Sidebar has left over, which puts this element
     immediately after it — i.e. at the bottom — automatically.
     Horizontal/bottom padding (16px/22px) reproduces what SidebarNavScroll's
     own padding used to give this element for free back when it was nested
     inside that scroll region. */
  flex-shrink: 0;
  padding: 16px 16px 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const FooterTopRow = styled.div`
  display: flex;
  align-items: stretch;
  gap: 8px;
`;

/* Fullscreen toggle — glass chip matching FyTrigger's treatment (spec §4
   generic control pattern), deliberately NOT gold: this is ordinary footer
   chrome, not one of the spec §3 gold-budget items. Height matches
   FyTrigger's natural height via FooterTopRow's default flex
   align-items:stretch. */
const FullscreenChip = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const UserChip = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 2px;
`;

const UserAvatar = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, ${({ theme }) => theme.colors.bright.lapis}, ${({ theme }) => theme.colors.bright.lavender});
  color: ${({ theme }) => theme.colors.onDark};
  font-size: 0.66rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
`;

const UserChipInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const UserName = styled.div`
  font-size: 0.8rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const UserRole = styled.div`
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: capitalize;
`;

const LogoutSmall = styled.button`
  flex-shrink: 0;
  padding: 4px 8px;
  font-size: 0.62rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.muted};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  transition: all 150ms ease-in-out;

  &:hover {
    color: ${({ theme }) => theme.colors.bright.coral};
    border-color: ${({ theme }) => theme.colors.bright.coral};
  }
`;

// ── Nav ──────────────────────────────────────────────────────────────────

const Nav = styled.nav`
  /* No flex:1/overflow here — SidebarNavScroll (ancestor) is the single
     scroll container and sizes this naturally within its scrollable
     content. */
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const SectionLabel = styled.div`
  ${monoLabel}
  font-size: 0.6rem;
  letter-spacing: 0.16em;
  color: ${({ theme }) => theme.colors.muted};
  padding: 14px 12px 6px;
`;

const NavItem = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  min-height: 36px;
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.muted};
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  border: 1px solid transparent;
  position: relative;
  transition: all 0.18s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  /* Active state — the ONE nav gold treatment (spec §3 gold-discipline budget
     item #2): gold-hi text on a gold-tinted gradient with a gold border and
     the 3px glowing edge bar, per mockup l.97-102. */
  &.active {
    color: ${({ theme }) => theme.colors.secondary[500]};
    background: linear-gradient(90deg, rgba(220, 185, 79, 0.14), rgba(220, 185, 79, 0.04));
    border-color: rgba(220, 185, 79, 0.3);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(220, 185, 79, 0.15);

    &::before {
      content: '';
      position: absolute;
      left: -6px;
      top: 20%;
      bottom: 20%;
      width: 3px;
      border-radius: 3px;
      background: ${({ theme }) => theme.colors.secondary[500]};
      box-shadow: 0 0 10px ${({ theme }) => theme.colors.secondary[500]};
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const NavIcon = styled.span`
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
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
  color: ${({ theme }) => theme.colors.onDark};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  border-radius: ${({ theme }) => theme.borderRadius.full};
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
      <FyTrigger onClick={() => setOpen((o) => !o)} $open={open}>
        <span>{selectedLabel}</span>
        <FyArrow $open={open} aria-hidden="true">
          <ChevronDown size={12} strokeWidth={1.8} />
        </FyArrow>
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

// ── Farming Year Dropdown Styles — glass chip per mockup `.fy` (l.104-105) ──

const FyWrapper = styled.div`
  position: relative;
`;

const FyTrigger = styled.button<{ $open: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 9px 12px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme, $open }) => ($open ? theme.colors.secondary[500] : theme.colors.glass.border)};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.66rem;
  letter-spacing: 0.1em;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.glass.border};
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const FyArrow = styled.span<{ $open: boolean }>`
  display: flex;
  color: ${({ theme }) => theme.colors.muted};
  transition: transform 0.15s ease;
  transform: ${({ $open }) => ($open ? 'rotate(180deg)' : 'rotate(0)')};
`;

const FyMenu = styled.div`
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  right: 0;
  background: ${({ theme }) => theme.colors.cosmosHi};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(4, 6, 18, 0.5);
  z-index: ${({ theme }) => theme.zIndex.dropdown};
  max-height: 240px;
  overflow-y: auto;
`;

const FyItem = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  font-size: 0.8rem;
  font-weight: ${({ $active }) => ($active ? 700 : 400)};
  color: ${({ $active, theme }) => ($active ? theme.colors.secondary[500] : theme.colors.textPrimary)};
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.1s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }
`;

const FyItemLabel = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// keyframes are compiled statically and cannot read the theme via props, so the
// glow is tinted off emerald-b (#54D39B -> rgb(84, 211, 155)) directly.
const ledPulse = keyframes`
  0%, 100% {
    box-shadow: 0 0 4px 1px rgba(84, 211, 155, 0.4);
  }
  50% {
    box-shadow: 0 0 8px 3px rgba(84, 211, 155, 0.7);
  }
`;

const GreenLed = styled.span`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.success};
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
  gap: 12px;
  /* Horizontal padding is overridden inline via style prop for depth-based indentation;
     vertical padding and min-height remain constant for touch target compliance. */
  padding: 10px 12px;
  min-height: 36px;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 10px;
  background: ${({ $childActive }) => ($childActive ? 'rgba(180, 200, 220, 0.07)' : 'transparent')};
  color: ${({ $childActive, theme }) =>
    $childActive ? theme.colors.textPrimary : theme.colors.muted};
  /* All depths use base font-size to match leaf NavItem siblings. Top-level
     groups (depth 0) use semibold to stand out as parent containers; sub-
     groups (depth 1+) use medium so they look identical to their leaf
     siblings — the caret differentiates them as expandable. */
  font-size: 0.9rem;
  font-weight: ${({ $depth }) => ($depth >= 1 ? 500 : 700)};
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: all 0.18s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const NavGroupLabel = styled.span`
  flex: 1;
`;

const NavGroupCaret = styled.span<{ $expanded: boolean }>`
  display: flex;
  color: ${({ theme }) => theme.colors.muted};
  transition: transform 0.15s ease;
  transform: ${({ $expanded }) => ($expanded ? 'rotate(0deg)' : 'rotate(-90deg)')};
`;

const NavGroupChildren = styled.div<{ $depth: number }>`
  display: flex;
  flex-direction: column;
  gap: 1px;
  /* Each depth level adds 14px of left indent on top of the base 16px */
  padding-left: ${({ $depth }) => 16 + $depth * 14}px;
`;

// ── Back to top ────────────────────────────────────────────────────────────

const BackToTopButton = styled.button<{ $visible: boolean }>`
  position: fixed;
  bottom: 32px;
  right: 32px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  box-shadow: 0 12px 32px rgba(4, 6, 18, 0.5);
  z-index: ${({ theme }) => theme.zIndex.sticky};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 200ms ease, transform 200ms ease, border-color 150ms ease;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transform: ${({ $visible }) => ($visible ? 'translateY(0)' : 'translateY(16px)')};
  pointer-events: ${({ $visible }) => ($visible ? 'auto' : 'none')};

  @supports not (backdrop-filter: blur(1px)) {
    background: ${({ theme }) => theme.colors.glass.opaque};
  }

  &:hover {
    border-color: rgba(180, 200, 220, 0.4);
    color: ${({ theme }) => theme.colors.textPrimary};
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: opacity 200ms ease;

    &:hover {
      transform: none;
    }
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

  /* Reserve space so the fixed gold AIAssistantFAB (position:fixed,
     bottom-right, z-index 895 — see AIAssistantFAB.tsx) never sits on top
     of the last piece of routed content. LayoutContainer/body is the
     actual scroll axis (min-height:100vh, no overflow set — see the
     back-to-top comment above), but MainContent is where routed page
     content lives, so padding-bottom here — not moving the FAB — is what
     lets a user scroll every page clear of it. Values mirror
     AIAssistantFAB's own two size/offset breakpoints exactly:
     52px + 88px offset desktop, 48px + 24px offset at its <=640px query. */
  padding-bottom: 140px;

  @media (min-width: 1024px) {
    margin-top: 0;
  }

  @media (max-width: 640px) {
    padding-bottom: 72px;
  }
`;
