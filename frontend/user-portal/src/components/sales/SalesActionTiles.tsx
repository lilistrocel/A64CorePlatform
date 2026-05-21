/**
 * SalesActionTiles Component
 *
 * Cross-sub-navigation tile bar shared across the Sales module pages.
 * Renders three navigation tiles (Orders, Inventory, Purchase Orders).
 * Pass `activeKey` to highlight the current page's tile.
 */

import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Receipt, Package, ShoppingCart } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type SalesActionKey = 'orders' | 'stock' | 'purchase-orders';

export interface SalesActionTilesProps {
  activeKey?: SalesActionKey;
}

interface TileConfig {
  key: SalesActionKey;
  label: string;
  subtitle: string;
  icon: React.ElementType;
  accent: string;
  accentHover: string;
  route: string;
}

// ============================================================================
// TILE CONFIG
// ============================================================================

const TILES: TileConfig[] = [
  {
    key: 'orders',
    label: 'Sales Orders',
    subtitle: 'Create, track & fulfill customer orders',
    icon: Receipt,
    accent: '#10B981',
    accentHover: '#059669',
    route: '/sales/orders',
  },
  {
    key: 'stock',
    label: 'Stock',
    subtitle: 'Sellable harvest & waste',
    icon: Package,
    accent: '#F59E0B',
    accentHover: '#D97706',
    route: '/sales/stock',
  },
  {
    key: 'purchase-orders',
    label: 'Purchase Orders',
    subtitle: 'Procurement & supplier orders',
    icon: ShoppingCart,
    accent: '#6366F1',
    accentHover: '#4F46E5',
    route: '/sales/purchase-orders',
  },
];

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const TilesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
`;

interface ActionTileStyledProps {
  $accent: string;
  $accentHover: string;
  $active: boolean;
}

const ActionTile = styled.button<ActionTileStyledProps>`
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 20px;
  border-radius: 12px;
  text-align: left;
  transition: all 150ms ease-in-out;
  cursor: ${({ $active }) => ($active ? 'default' : 'pointer')};

  /* --- Idle state --- */
  ${({ $active, $accent, $accentHover, theme }) =>
    !$active &&
    `
    background: ${theme.colors.surface.canvas};
    border: 1px solid ${theme.colors.border.subtle};
    border-left: 4px solid ${$accent};

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px -4px rgba(0, 0, 0, 0.1);
      border-left-color: ${$accentHover};
    }

    &:focus-visible {
      outline: 2px solid ${$accent};
      outline-offset: 2px;
    }
  `}

  /* --- Active state --- */
  ${({ $active, $accent, $accentHover }) =>
    $active &&
    `
    background: ${$accent};
    border: 1px solid ${$accent};

    &:hover {
      background: ${$accentHover};
      border-color: ${$accentHover};
    }

    &:focus-visible {
      outline: 2px solid ${$accent};
      outline-offset: 2px;
    }
  `}
`;

interface IconBadgeProps {
  $accent: string;
  $active: boolean;
}

const TileIconBadge = styled.div<IconBadgeProps>`
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;

  /* Idle: tinted accent background + accent icon */
  ${({ $active, $accent }) =>
    !$active &&
    `
    background: ${$accent}1f;
    color: ${$accent};
  `}

  /* Active: semi-transparent white background + white icon */
  ${({ $active }) =>
    $active &&
    `
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  `}
`;

interface TileTextProps {
  $active: boolean;
}

const TileTextColumn = styled.div`
  display: flex;
  flex-direction: column;
`;

const TileLabel = styled.p<TileTextProps>`
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: ${({ $active, theme }) => ($active ? '#fff' : theme.colors.text.primary)};
`;

const TileSubtitle = styled.p<TileTextProps>`
  font-size: 13px;
  margin: 4px 0 0 0;
  line-height: 1.4;
  color: ${({ $active, theme }) =>
    $active ? 'rgba(255, 255, 255, 0.85)' : theme.colors.text.secondary};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function SalesActionTiles({ activeKey }: SalesActionTilesProps) {
  const navigate = useNavigate();

  return (
    <TilesGrid>
      {TILES.map((tile) => {
        const isActive = tile.key === activeKey;
        const Icon = tile.icon;

        return (
          <ActionTile
            key={tile.key}
            $accent={tile.accent}
            $accentHover={tile.accentHover}
            $active={isActive}
            onClick={() => navigate(tile.route)}
            aria-current={isActive ? 'page' : undefined}
          >
            <TileIconBadge $accent={tile.accent} $active={isActive}>
              <Icon size={24} />
            </TileIconBadge>
            <TileTextColumn>
              <TileLabel $active={isActive}>{tile.label}</TileLabel>
              <TileSubtitle $active={isActive}>{tile.subtitle}</TileSubtitle>
            </TileTextColumn>
          </ActionTile>
        );
      })}
    </TilesGrid>
  );
}
