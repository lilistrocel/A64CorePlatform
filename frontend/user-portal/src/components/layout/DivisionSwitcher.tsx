import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useDivisionStore, type Division } from '../../stores/division.store';

const INDUSTRY_ICONS: Record<Division['industryType'], string> = {
  vegetable_fruits: '🌿',
  mushroom: '🍄',
};

const INDUSTRY_LABELS: Record<Division['industryType'], string> = {
  vegetable_fruits: 'Vegetable & Fruits',
  mushroom: 'Mushroom Farming',
};

export function DivisionSwitcher() {
  const navigate = useNavigate();
  const { currentDivision, availableDivisions, switchDivision } = useDivisionStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when the user clicks outside
  const handleOutsideClick = useCallback((event: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen, handleOutsideClick]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Don't render if there are no divisions or only one (no point in switching)
  if (!currentDivision || availableDivisions.length <= 1) {
    if (!currentDivision) return null;

    // Single division — display without the dropdown affordance
    return (
      <SingleDivisionDisplay aria-label={`Current division: ${currentDivision.name}`}>
        <DivisionIcon aria-hidden="true">
          {INDUSTRY_ICONS[currentDivision.industryType]}
        </DivisionIcon>
        <DivisionInfo>
          <DivisionName>{currentDivision.name}</DivisionName>
          <DivisionIndustry>{INDUSTRY_LABELS[currentDivision.industryType]}</DivisionIndustry>
        </DivisionInfo>
      </SingleDivisionDisplay>
    );
  }

  const otherDivisions = availableDivisions.filter(
    (d) => d.divisionId !== currentDivision.divisionId
  );

  const handleSwitchDivision = async (division: Division) => {
    setIsOpen(false);
    try {
      await switchDivision(division);
      navigate('/dashboard', { replace: true });
    } catch {
      // Error surfaced via the division store and toast system
    }
  };

  return (
    <Container ref={containerRef}>
      <TriggerButton
        onClick={() => setIsOpen((prev) => !prev)}
        $isOpen={isOpen}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Current division: ${currentDivision.name}. Click to switch.`}
      >
        <DivisionIcon aria-hidden="true">
          {INDUSTRY_ICONS[currentDivision.industryType]}
        </DivisionIcon>
        <DivisionInfo>
          <DivisionName>{currentDivision.name}</DivisionName>
          <DivisionIndustry>{INDUSTRY_LABELS[currentDivision.industryType]}</DivisionIndustry>
        </DivisionInfo>
        <ChevronIcon $isOpen={isOpen} aria-hidden="true">▾</ChevronIcon>
      </TriggerButton>

      {isOpen && (
        <Dropdown role="listbox" aria-label="Switch division">
          <DropdownHeader>Switch Division</DropdownHeader>
          {otherDivisions.map((division) => (
            <DropdownOption
              key={division.divisionId}
              role="option"
              aria-selected={false}
              onClick={() => handleSwitchDivision(division)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSwitchDivision(division);
                }
              }}
            >
              <OptionIcon aria-hidden="true">{INDUSTRY_ICONS[division.industryType]}</OptionIcon>
              <OptionInfo>
                <OptionName>{division.name}</OptionName>
                <OptionIndustry>{INDUSTRY_LABELS[division.industryType]}</OptionIndustry>
              </OptionInfo>
            </DropdownOption>
          ))}
        </Dropdown>
      )}
    </Container>
  );
}

// ─── Styled Components ───────────────────────────────────────────────────────

const Container = styled.div`
  position: relative;
  width: 100%;
`;

const SingleDivisionDisplay = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.neutral[100]};
`;

interface TriggerProps {
  $isOpen: boolean;
}

const TriggerButton = styled.button<TriggerProps>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme, $isOpen }) =>
    $isOpen ? theme.colors.neutral[100] : 'transparent'};
  border: 1px solid ${({ theme, $isOpen }) =>
    $isOpen ? theme.colors.primary[500] : theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const DivisionIcon = styled.span`
  font-size: 1.25rem;
  flex-shrink: 0;
`;

const DivisionInfo = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
`;

const DivisionName = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const DivisionIndustry = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

interface ChevronIconProps {
  $isOpen: boolean;
}

const ChevronIcon = styled.span<ChevronIconProps>`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  flex-shrink: 0;
  transition: transform 0.2s ease;
  transform: ${({ $isOpen }) => ($isOpen ? 'rotate(180deg)' : 'rotate(0deg)')};
`;

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + ${({ theme }) => theme.spacing.xs});
  left: 0;
  right: 0;
  z-index: 1000;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  overflow: hidden;
`;

const DropdownHeader = styled.div`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const DropdownOption = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: -2px;
  }

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  }
`;

const OptionIcon = styled.span`
  font-size: 1.125rem;
  flex-shrink: 0;
`;

const OptionInfo = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const OptionName = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const OptionIndustry = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
`;
