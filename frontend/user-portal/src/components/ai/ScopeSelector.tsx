/**
 * ScopeSelector Component
 *
 * Dropdown for selecting the AI monitoring scope:
 * global (all farms read-only) or a specific farm (with write capability).
 */

import styled from 'styled-components';
import { Globe, Building2, ChevronDown } from 'lucide-react';
import type { AIScope } from '../../types/farmAI';

// ============================================================================
// TYPES
// ============================================================================

interface FarmOption {
  farmId: string;
  name: string;
}

interface ScopeSelectorProps {
  farms: FarmOption[];
  scope: AIScope;
  onScopeChange: (scope: AIScope) => void;
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const SelectorWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const SelectorIcon = styled.div`
  position: absolute;
  left: 10px;
  display: flex;
  align-items: center;
  pointer-events: none;
  color: #10B981;
  z-index: 1;
`;

const ChevronIcon = styled.div`
  position: absolute;
  right: 10px;
  display: flex;
  align-items: center;
  pointer-events: none;
  color: #616161;
  z-index: 1;
`;

const SelectElement = styled.select`
  appearance: none;
  padding: 7px 36px 7px 34px;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  background: #f0fdf4;
  color: #065f46;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  min-width: 220px;

  &:focus {
    outline: none;
    border-color: #10B981;
    box-shadow: 0 0 0 2px #10B98125;
    background: white;
  }

  &:hover {
    border-color: #86efac;
    background: #dcfce7;
  }
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function ScopeSelector({ farms, scope, onScopeChange }: ScopeSelectorProps) {
  const currentValue = scope.level === 'global' ? 'global' : scope.farmId;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'global') {
      onScopeChange({ level: 'global' });
    } else {
      const farm = farms.find(f => f.farmId === value);
      if (farm) {
        onScopeChange({ level: 'farm', farmId: farm.farmId, farmName: farm.name });
      }
    }
  };

  const currentIcon = scope.level === 'global'
    ? <Globe size={14} />
    : <Building2 size={14} />;

  return (
    <SelectorWrapper>
      <SelectorIcon aria-hidden="true">
        {currentIcon}
      </SelectorIcon>
      <SelectElement
        value={currentValue}
        onChange={handleChange}
        aria-label="Select monitoring scope"
      >
        <option value="global">All Farms (Monitoring)</option>
        {farms.map(farm => (
          <option key={farm.farmId} value={farm.farmId}>
            {farm.name}
          </option>
        ))}
      </SelectElement>
      <ChevronIcon aria-hidden="true">
        <ChevronDown size={14} />
      </ChevronIcon>
    </SelectorWrapper>
  );
}
