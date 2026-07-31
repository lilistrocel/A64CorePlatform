/**
 * Breadcrumb Component
 *
 * Provides hierarchical navigation showing the current page location.
 * Used on detail pages to enable easy navigation back to parent pages.
 */

import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

// ============================================================================
// TYPES
// ============================================================================

/** A `lucide-react` icon component's minimal prop surface — matches what
 * every lucide icon accepts without importing the `lucide-react` type
 * (this package doesn't otherwise depend on it). */
type IconComponent = ComponentType<{ size?: number; strokeWidth?: number }>;

export interface BreadcrumbItem {
  label: string;
  path?: string; // If undefined, item is not clickable (current page)
  /** Either a legacy string (emoji or plain text, rendered as-is — the
   * original API, kept working for existing callers) or a `lucide-react`
   * icon component, e.g. `icon: Sprout`. Widened for Night Observatory
   * (spec §6: no emoji icons) without breaking the string form. */
  icon?: string | IconComponent;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const BreadcrumbContainer = styled.nav`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  margin-bottom: 16px;
  font-size: 14px;
`;

const BreadcrumbList = styled.ol`
  display: flex;
  align-items: center;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
`;

const BreadcrumbListItem = styled.li`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const BreadcrumbLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 6px;
  color: ${({ theme }) => theme.colors.celeste};
  text-decoration: none;
  font-weight: 500;
  transition: color 150ms ease-in-out;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

const BreadcrumbCurrent = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  color: ${({ theme }) => theme.colors.muted};
  font-weight: 500;
`;

const Separator = styled.span`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 12px;
  opacity: 0.6;
`;

const Icon = styled.span`
  font-size: 14px;
`;

const IconGlyph = styled.span`
  display: inline-flex;
  align-items: center;
`;

// ============================================================================
// COMPONENT
// ============================================================================

/** Renders either form of `BreadcrumbItem.icon` — string (legacy) or a
 * `lucide-react` component (Night Observatory). */
function renderIcon(icon: BreadcrumbItem['icon']) {
  if (!icon) return null;
  if (typeof icon === 'string') return <Icon>{icon}</Icon>;
  const IconComponent = icon;
  return (
    <IconGlyph aria-hidden="true">
      <IconComponent size={14} strokeWidth={1.6} />
    </IconGlyph>
  );
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (items.length === 0) return null;

  return (
    <BreadcrumbContainer aria-label="Breadcrumb" className={className}>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <BreadcrumbListItem key={item.label}>
              {index > 0 && <Separator>/</Separator>}

              {item.path && !isLast ? (
                <BreadcrumbLink to={item.path}>
                  {renderIcon(item.icon)}
                  {item.label}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbCurrent aria-current={isLast ? 'page' : undefined}>
                  {renderIcon(item.icon)}
                  {item.label}
                </BreadcrumbCurrent>
              )}
            </BreadcrumbListItem>
          );
        })}
      </BreadcrumbList>
    </BreadcrumbContainer>
  );
}

export default Breadcrumb;
