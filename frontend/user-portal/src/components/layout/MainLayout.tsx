import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuthStore } from '../../stores/auth.store';
import { Button } from '@a64core/shared';

export function MainLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <LayoutContainer>
      {/* Mobile Header */}
      <MobileHeader>
        <Logo><LogoImg src="/a64logo_white.png" alt="A64 Core" /></Logo>
        <MenuButton onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} aria-label="Toggle menu">
          <span></span>
          <span></span>
          <span></span>
        </MenuButton>
      </MobileHeader>

      {/* Sidebar - Hidden on mobile, visible on desktop */}
      <Sidebar $isOpen={isMobileMenuOpen}>
        <SidebarHeader>
          <Logo><LogoImg src="/a64logo_white.png" alt="A64 Core" /></Logo>
          <UserInfo>
            <UserName>{user?.firstName} {user?.lastName}</UserName>
            <UserRole>{user?.role || 'User'}</UserRole>
          </UserInfo>
        </SidebarHeader>

        <Nav>
          <NavItem to="/dashboard" onClick={closeMobileMenu}>
            <NavIcon>📊</NavIcon>
            <span>Dashboard</span>
          </NavItem>
          <NavItem to="/farm/dashboard" onClick={closeMobileMenu}>
            <NavIcon>🏞️</NavIcon>
            <span>Farm Manager</span>
          </NavItem>
          <NavItem to="/profile" onClick={closeMobileMenu}>
            <NavIcon>👤</NavIcon>
            <span>Profile</span>
          </NavItem>
          <NavItem to="/settings" onClick={closeMobileMenu}>
            <NavIcon>⚙️</NavIcon>
            <span>Settings</span>
          </NavItem>
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
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: ${({ theme }) => theme.spacing.sm};

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
`;

const Logo = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.primary[500]};
  margin-bottom: ${({ theme }) => theme.spacing.md};

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
