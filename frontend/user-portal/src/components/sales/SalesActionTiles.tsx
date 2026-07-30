/**
 * SalesActionTiles Component
 *
 * Cross-sub-navigation tile bar shared across the Sales module pages.
 * Renders three navigation tiles (Orders, Inventory, Purchase Orders).
 * Pass `activeKey` to highlight the current page's tile.
 */

import { useNavigate } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { Receipt, Package } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type SalesActionKey = 'orders' | 'stock';

export interface SalesActionTilesProps {
  activeKey?: SalesActionKey;
}

// Categorical ramp each tile draws its accent from — resolved against the
// theme at render time (module-scope config can't call useTheme()).
type AccentRamp = 'emerald' | 'gold';

interface TileConfig {
  key: SalesActionKey;
  label: string;
  subtitle: string;
  icon: React.ElementType;
  accentRamp: AccentRamp;
  route: string;
}

// ============================================================================
// TILE CONFIG
// ============================================================================
// "Sales Orders" keeps its original success-green accent (emerald — order
// fulfilment reads as a positive/growth action). "Stock" keeps its original
// amber accent (gold — inventory/harvest is a highlight, not a semantic
// success/error state).

const TILES: TileConfig[] = [
  {
    key: 'orders',
    label: 'Sales Orders',
    subtitle: 'Create, track & fulfill customer orders',
    icon: Receipt,
    accentRamp: 'emerald',
    route: '/sales/orders',
  },
  {
    key: 'stock',
    label: 'Stock',
    subtitle: 'Sellable harvest & waste',
    icon: Package,
    accentRamp: 'gold',
    route: '/sales/stock',
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
    background: ${theme.colors.background};
    border: 1px solid ${theme.colors.neutral[300]};
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

  /* Active: semi-transparent onAccent background + onAccent icon */
  ${({ $active, theme }) =>
    $active &&
    `
    background: ${theme.colors.onAccent}33;
    color: ${theme.colors.onAccent};
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
  color: ${({ $active, theme }) => ($active ? theme.colors.onAccent : theme.colors.textPrimary)};
`;

const TileSubtitle = styled.p<TileTextProps>`
  font-size: 13px;
  margin: 4px 0 0 0;
  line-height: 1.4;
  color: ${({ $active, theme }) =>
    $active ? `${theme.colors.onAccent}D9` : theme.colors.textSecondary};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function SalesActionTiles({ activeKey }: SalesActionTilesProps) {
  const navigate = useNavigate();
  const theme = useTheme();

  return (
    <TilesGrid>
      {TILES.map((tile) => {
        const isActive = tile.key === activeKey;
        const Icon = tile.icon;
        const accent = theme.colors[tile.accentRamp][500];
        const accentHover = theme.colors[tile.accentRamp][600];

        return (
          <ActionTile
            key={tile.key}
            $accent={accent}
            $accentHover={accentHover}
            $active={isActive}
            onClick={() => navigate(tile.route)}
            aria-current={isActive ? 'page' : undefined}
          >
            <TileIconBadge $accent={accent} $active={isActive}>
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
