/**
 * AIHubTabBar Component
 *
 * Horizontal tab bar for the 4 AI Hub sections.
 * Each tab has its own accent color. Active tab shows a colored bottom border
 * and colored text. Touch-optimized with 48px minimum height.
 * Horizontally scrollable on small screens.
 */

import styled from 'styled-components';
import type { AIHubSection } from '../../types/aiHub';

// ============================================================================
// TYPES
// ============================================================================

export interface AIHubTabBarProps {
  activeSection: AIHubSection;
  onSectionChange: (section: AIHubSection) => void;
}

interface TabDefinition {
  section: AIHubSection;
  label: string;
  subtitle: string;
  icon: string;
  color: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TABS: TabDefinition[] = [
  { section: 'control', label: 'Control', subtitle: 'Execute & Manage', icon: '⚙️', color: '#F59E0B' },
  { section: 'monitor', label: 'Monitor', subtitle: 'Live Data',         icon: '📡', color: '#3B82F6' },
  { section: 'report',  label: 'Report',  subtitle: 'Generate & Export', icon: '📊', color: '#8B5CF6' },
  { section: 'advise',  label: 'Advise',  subtitle: 'Expert Guidance',   icon: '💡', color: '#10B981' },
];

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const TabBarContainer = styled.nav`
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  flex-shrink: 0;

  /* Hide scrollbar but keep functionality */
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

interface TabButtonProps {
  $isActive: boolean;
  $accentColor: string;
}

const TabButton = styled.button<TabButtonProps>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 0 20px;
  min-height: 48px;
  min-width: 80px;
  border: none;
  border-bottom: 3px solid ${({ $isActive, $accentColor }) =>
    $isActive ? $accentColor : 'transparent'};
  background: transparent;
  color: ${({ $isActive, $accentColor, theme }) => ($isActive ? $accentColor : theme.colors.textSecondary)};
  font-size: 14px;
  font-weight: ${({ $isActive }) => ($isActive ? '600' : '500')};
  cursor: pointer;
  white-space: nowrap;
  transition: all 150ms ease-in-out;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    color: ${({ $accentColor }) => $accentColor};
    background: ${({ $accentColor }) => `${$accentColor}10`};
  }

  &:focus-visible {
    outline: 2px solid ${({ $accentColor }) => $accentColor};
    outline-offset: -2px;
  }

  @media (min-width: 640px) {
    padding: 0 28px;
    font-size: 15px;
    min-height: 56px;
  }
`;

const TabMainRow = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const TabIcon = styled.span`
  font-size: 16px;
  line-height: 1;

  @media (max-width: 400px) {
    display: none;
  }
`;

const TabSubtitle = styled.span`
  display: none;
  font-size: 10px;
  font-weight: 400;
  opacity: 0.75;
  letter-spacing: 0.2px;

  @media (min-width: 640px) {
    display: block;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function AIHubTabBar({ activeSection, onSectionChange }: AIHubTabBarProps) {
  return (
    <TabBarContainer role="tablist" aria-label="AI Hub sections">
      {TABS.map((tab) => (
        <TabButton
          key={tab.section}
          role="tab"
          aria-selected={activeSection === tab.section}
          aria-controls={`ai-hub-panel-${tab.section}`}
          id={`ai-hub-tab-${tab.section}`}
          $isActive={activeSection === tab.section}
          $accentColor={tab.color}
          onClick={() => onSectionChange(tab.section)}
        >
          <TabMainRow>
            <TabIcon aria-hidden="true">{tab.icon}</TabIcon>
            {tab.label}
          </TabMainRow>
          <TabSubtitle aria-hidden="true">{tab.subtitle}</TabSubtitle>
        </TabButton>
      ))}
    </TabBarContainer>
  );
}
