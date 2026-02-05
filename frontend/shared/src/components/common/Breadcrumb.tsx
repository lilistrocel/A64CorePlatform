/**
 * Breadcrumb Component
 *
 * Provides hierarchical navigation showing the current page location.
 * Used on detail pages to enable easy navigation back to parent pages.
 */

import { Link } from 'react-router-dom';
import styled from 'styled-components';

// ============================================================================
// TYPES
// ============================================================================

export interface BreadcrumbItem {
  label: string;
  path?: string; // If undefined, item is not clickable (current page)
  icon?: string;
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
  color: #3B82F6;
  text-decoration: none;
  font-weight: 500;
  transition: color 150ms ease-in-out;

  &:hover {
    color: #1976D2;
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid #3B82F6;
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

const BreadcrumbCurrent = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  color: #616161;
  font-weight: 500;
`;

const Separator = styled.span`
  color: #9E9E9E;
  font-size: 12px;
`;

const Icon = styled.span`
  font-size: 14px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

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
                  {item.icon && <Icon>{item.icon}</Icon>}
                  {item.label}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbCurrent aria-current={isLast ? 'page' : undefined}>
                  {item.icon && <Icon>{item.icon}</Icon>}
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
