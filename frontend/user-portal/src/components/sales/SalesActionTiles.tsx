/**
 * SalesActionTiles Component
 *
 * Cross-sub-navigation tile bar shared across the Sales module pages.
 * Renders three navigation tiles (Orders, Inventory, Purchase Orders).
 * Pass `activeKey` to highlight the current page's tile.
 *
 * Night Observatory (T-901) accent note: "Stock" used to draw its accent
 * from the gold ramp. Gold is budget-limited to the logo/active-nav/primary
 * CTA/harvest-status (spec §3) — a persistent nav tile is not on that list.
 * "Stock" now uses `theme.colors.bright.lavender`, a flat hex (not a
 * [50..900] ramp like emerald/lapis/gold/terracotta). There is no ramp for
 * `bright.*` tokens, so there's no theme-provided hover shade to reach for;
 * per the spec author's own guidance this is a rarely-hovered tile, so the
 * hover state simply reuses the same flat hex rather than hand-rolling a
 * darken() helper for one call site (YAGNI).
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

/** Ramp-based accent — resolves against a theme [50..900] ramp object. */
type AccentRamp = 'emerald';

interface TileConfig {
  key: SalesActionKey;
  label: string;
  subtitle: string;
  icon: React.ElementType;
  /** Ramp-based accent (theme.colors[accentRamp][500/600]). */
  accentRamp?: AccentRamp;
  /**
   * Flat bright.* hex accent for tiles that don't map to an existing ramp.
   * No ramp exists for bright.* tokens, so hover reuses the same hex.
   */
  accentHex?: string;
  route: string;
}

// ============================================================================
// TILE CONFIG
// ============================================================================
// "Sales Orders" keeps its success-green accent (emerald — order fulfilment
// reads as a positive/growth action). "Stock" moved off gold (spec §3 — gold
// is not an ordinary accent for a persistent nav tile) onto bright.lavender.

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
    accentHex: '', // resolved at render time from theme.colors.bright.lavender
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
    background: ${theme.colors.glass.base};
    border: 1px solid ${theme.colors.glass.border};
    border-left: 4px solid ${$accent};

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px -4px rgba(4, 6, 18, 0.4);
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

  /* Active: semi-transparent onDark background + onDark icon. The fill
     behind this badge is emerald/lavender, never gold, so onDark (not
     onAccent — onAccent is cosmos-dark text, correct only on a gold fill). */
  ${({ $active, theme }) =>
    $active &&
    `
    background: ${theme.colors.onDark}33;
    color: ${theme.colors.onDark};
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
  color: ${({ $active, theme }) => ($active ? theme.colors.onDark : theme.colors.textPrimary)};
`;

const TileSubtitle = styled.p<TileTextProps>`
  font-size: 13px;
  margin: 4px 0 0 0;
  line-height: 1.4;
  color: ${({ $active, theme }) =>
    $active ? `${theme.colors.onDark}D9` : theme.colors.textSecondary};
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
        const accent = tile.accentRamp
          ? theme.colors[tile.accentRamp][500]
          : theme.colors.bright.lavender;
        const accentHover = tile.accentRamp
          ? theme.colors[tile.accentRamp][600]
          : theme.colors.bright.lavender;

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
