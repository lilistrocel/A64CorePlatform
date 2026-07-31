/**
 * FarmQuickSwitcher Component
 *
 * Compact dropdown that lets users switch between farms directly from the
 * Farm Detail page without navigating back to the farm list.
 *
 * Accessibility: button trigger, Escape closes, click-outside closes.
 * Renders a "Loading farms…" fallback while data is in flight.
 * Does NOT block the page render if the farm list is unavailable.
 *
 * Night Observatory (T-901 GAP-FILL, spec §4): glassControl trigger,
 * glassOpaque popover menu (menus never stack a second glass layer over the
 * page's glass panels — spec §2's two-layer rule), emoji replaced with
 * lucide-react icons.
 */

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ChevronDown, MapPin, Wheat } from 'lucide-react';
import { glassControl, glassOpaque, monoLabel } from '@a64core/shared';
import { useFarms } from '../../hooks/queries/useFarms';
import type { Farm } from '../../types/farm';

interface FarmQuickSwitcherProps {
  currentFarmId: string;
  currentFarmName: string;
}

export function FarmQuickSwitcher({ currentFarmId, currentFarmName }: FarmQuickSwitcherProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Fetch all farms (up to 100). Non-blocking: if still loading, show fallback.
  const { data: farmsData, isLoading } = useFarms(1, 100);
  const farms: Farm[] = (farmsData?.items ?? []) as Farm[];

  // Close on Escape key
  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  const handleListKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = listboxRef.current?.querySelectorAll<HTMLLIElement>('[role="option"]');
    if (!items || items.length === 0) return;

    const focused = document.activeElement as HTMLElement;
    const focusedIndex = Array.from(items).indexOf(focused as HTMLLIElement);

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = items[focusedIndex + 1] ?? items[0];
      next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = items[focusedIndex - 1] ?? items[items.length - 1];
      prev.focus();
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  // Close when clicking outside the component
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Move focus into the listbox after open
      requestAnimationFrame(() => {
        const firstOption = listboxRef.current?.querySelector<HTMLElement>('[role="option"]');
        firstOption?.focus();
      });
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, handleClickOutside]);

  const handleSelect = (farmId: string) => {
    setIsOpen(false);
    triggerRef.current?.focus();
    if (farmId !== currentFarmId) {
      navigate(`/farm/farms/${farmId}`);
    }
  };

  const otherfarms = farms.filter((f: Farm) => f.farmId !== currentFarmId);

  return (
    <Container ref={containerRef}>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Current farm: ${currentFarmName}. Click to switch farm.`}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
      >
        <TriggerIcon aria-hidden="true"><Wheat size={15} strokeWidth={1.8} /></TriggerIcon>
        <TriggerLabel>{currentFarmName}</TriggerLabel>
        <TriggerChevron $open={isOpen} aria-hidden="true">
          <ChevronDown size={13} strokeWidth={1.8} />
        </TriggerChevron>
      </Trigger>

      {isOpen && (
        <Popover>
          {isLoading && (
            <LoadingRow>Loading farms…</LoadingRow>
          )}

          {!isLoading && farms.length === 0 && (
            <EmptyRow>No other farms available</EmptyRow>
          )}

          {!isLoading && farms.length > 0 && (
            <Listbox
              ref={listboxRef}
              role="listbox"
              aria-label="Select a farm"
              onKeyDown={handleListKeyDown}
            >
              {/* Current farm first (marked as selected) */}
              <Option
                key={currentFarmId}
                role="option"
                tabIndex={0}
                aria-selected={true}
                $isSelected={true}
                onClick={() => handleSelect(currentFarmId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect(currentFarmId);
                  }
                }}
              >
                <OptionIcon aria-hidden="true"><Wheat size={14} strokeWidth={1.8} /></OptionIcon>
                <OptionInfo>
                  <OptionName>{currentFarmName}</OptionName>
                  <OptionBadge>Current</OptionBadge>
                </OptionInfo>
              </Option>

              {otherfarms.length > 0 && <Divider />}

              {otherfarms.map((farm: Farm) => (
                <Option
                  key={farm.farmId}
                  role="option"
                  tabIndex={0}
                  aria-selected={false}
                  $isSelected={false}
                  onClick={() => handleSelect(farm.farmId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(farm.farmId);
                    }
                  }}
                >
                  <OptionIcon aria-hidden="true"><Wheat size={14} strokeWidth={1.8} /></OptionIcon>
                  <OptionInfo>
                    <OptionName>{farm.name}</OptionName>
                    {farm.location?.city && (
                      <OptionLocation>
                        <MapPin size={11} strokeWidth={1.8} aria-hidden="true" />
                        {farm.location.city}
                        {farm.location.country ? `, ${farm.location.country}` : ''}
                      </OptionLocation>
                    )}
                  </OptionInfo>
                  {!farm.isActive && <InactiveBadge>Inactive</InactiveBadge>}
                </Option>
              ))}
            </Listbox>
          )}
        </Popover>
      )}
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  position: relative;
  display: inline-block;
  margin-bottom: 20px;
`;

const Trigger = styled.button`
  ${glassControl}
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }
`;

const TriggerIcon = styled.span`
  display: flex;
  color: ${({ theme }) => theme.colors.celeste};
`;

const TriggerLabel = styled.span`
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TriggerChevron = styled.span<{ $open?: boolean }>`
  display: flex;
  color: ${({ theme }) => theme.colors.muted};
  transition: transform 150ms ease-in-out;
  transform: ${({ $open }) => ($open ? 'rotate(180deg)' : 'rotate(0deg)')};
`;

const Popover = styled.div`
  ${glassOpaque}
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 280px;
  max-width: 360px;
  border-radius: 12px;
  z-index: ${({ theme }) => theme.zIndex.dropdown};
  overflow: hidden;
`;

const Listbox = styled.ul`
  list-style: none;
  margin: 0;
  padding: 6px 0;
  max-height: 320px;
  overflow-y: auto;

  &:focus {
    outline: none;
  }
`;

const Option = styled.li<{ $isSelected: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  border-left: 3px solid
    ${({ $isSelected, theme }) =>
      $isSelected ? theme.colors.secondary[500] : 'transparent'};
  background: ${({ $isSelected, theme }) =>
    $isSelected ? 'rgba(220, 185, 79, 0.1)' : 'transparent'};
  transition: background 100ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }

  &:focus {
    outline: none;
    background: rgba(180, 200, 220, 0.07);
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: -2px;
  }
`;

const OptionIcon = styled.span`
  display: flex;
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.celeste};
`;

const OptionInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const OptionName = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const OptionLocation = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 2px;
`;

// The gold left-border + tint on the selected row already carries the
// "current" signal (matches MainLayout's FyItem precedent) — this label
// stays celeste so it isn't a second gold element for the same fact
// (spec §3: secondary emphasis is celeste, never gold).
const OptionBadge = styled.span`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;

const InactiveBadge = styled.span`
  ${monoLabel}
  padding: 2px 7px;
  border-radius: 99px;
  background: rgba(126, 134, 166, 0.16);
  color: ${({ theme }) => theme.colors.muted};
  flex-shrink: 0;
`;

const Divider = styled.li`
  height: 1px;
  background: ${({ theme }) => theme.colors.line};
  margin: 4px 0;
  list-style: none;
`;

const LoadingRow = styled.div`
  padding: 16px 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`;

const EmptyRow = styled.div`
  padding: 16px 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`;
