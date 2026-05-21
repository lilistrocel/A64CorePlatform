/**
 * BlockViewToggle Component
 *
 * Compact segmented control (pill style) with two options:
 *   - "Physical layout"  (value = 'physical')
 *   - "Virtual only"     (value = 'virtual')
 *
 * Accessibility: uses role="tablist" / role="tab" with aria-selected.
 * Keyboard: Tab moves between segments; Enter/Space activates.
 */

import { type KeyboardEvent } from 'react';
import styled from 'styled-components';
import type { BlockViewMode } from '../../hooks/farm/useBlockViewMode';

interface BlockViewToggleProps {
  value: BlockViewMode;
  onChange: (mode: BlockViewMode) => void;
}

const OPTIONS: { value: BlockViewMode; label: string; icon: string }[] = [
  { value: 'physical', label: 'Physical layout', icon: '🏗️' },
  { value: 'virtual', label: 'Virtual only', icon: '🌱' },
];

export function BlockViewToggle({ value, onChange }: BlockViewToggleProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, optionValue: BlockViewMode) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange(optionValue);
    }
  };

  return (
    <Wrapper role="tablist" aria-label="Blocks view mode">
      {OPTIONS.map((option) => {
        const isSelected = value === option.value;
        return (
          <Segment
            key={option.value}
            role="tab"
            type="button"
            aria-selected={isSelected}
            $isSelected={isSelected}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => handleKeyDown(e, option.value)}
            tabIndex={isSelected ? 0 : -1}
          >
            <SegmentIcon aria-hidden="true">{option.icon}</SegmentIcon>
            {option.label}
          </Segment>
        );
      })}
    </Wrapper>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Wrapper = styled.div`
  display: inline-flex;
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
`;

const Segment = styled.button<{ $isSelected: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  white-space: nowrap;

  background: ${({ $isSelected, theme }) =>
    $isSelected ? theme.colors.accent.sage : 'transparent'};
  color: ${({ $isSelected, theme }) =>
    $isSelected ? 'white' : theme.colors.text.secondary};

  &:hover {
    background: ${({ $isSelected, theme }) =>
      $isSelected ? theme.colors.accent.sageDeep : theme.colors.border.subtle};
    color: ${({ $isSelected, theme }) =>
      $isSelected ? 'white' : theme.colors.text.primary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 2px;
  }
`;

const SegmentIcon = styled.span`
  font-size: 14px;
`;
