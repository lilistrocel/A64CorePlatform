import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import type { LucideIcon } from 'lucide-react';
import { Leaf, Sprout } from 'lucide-react';
import { useDivisionStore, type Division } from '../../stores/division.store';

// Night Observatory (T-901, spec §6): emoji replaced with lucide-react line
// icons — same mapping as pages/division/DivisionSelector.tsx (🌿→Leaf,
// 🍄→Sprout per the spec's replacement table).
const INDUSTRY_ICONS: Record<Division['industryType'], LucideIcon> = {
  vegetable_fruits: Leaf,
  mushroom: Sprout,
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
    const CurrentIcon = INDUSTRY_ICONS[currentDivision.industryType];
    return (
      <SingleDivisionDisplay aria-label={`Current division: ${currentDivision.name}`}>
        <DivisionIcon aria-hidden="true">
          <CurrentIcon size={17} strokeWidth={1.6} />
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

  const CurrentIcon = INDUSTRY_ICONS[currentDivision.industryType];

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
          <CurrentIcon size={17} strokeWidth={1.6} />
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
          {otherDivisions.map((division) => {
            const OptionIconComponent = INDUSTRY_ICONS[division.industryType];
            return (
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
                <OptionIcon aria-hidden="true">
                  <OptionIconComponent size={13} strokeWidth={1.6} />
                </OptionIcon>
                <OptionInfo>
                  <OptionName>{division.name}</OptionName>
                  <OptionIndustry>{INDUSTRY_LABELS[division.industryType]}</OptionIndustry>
                </OptionInfo>
              </DropdownOption>
            );
          })}
        </Dropdown>
      )}
    </Container>
  );
}

// ─── Styled Components ───────────────────────────────────────────────────────

// Night Observatory (T-901 Phase 2) — the sidebar "org / workspace" glass
// chip, spec §4 "Sidebar" / mockup `.org` (l.82-86,256-259). Restyled only;
// all switching/dropdown behaviour above is unchanged.

const Container = styled.div`
  position: relative;
  width: 100%;
`;

const SingleDivisionDisplay = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);

  @supports not (backdrop-filter: blur(1px)) {
    background: ${({ theme }) => theme.colors.glass.opaque};
  }
`;

interface TriggerProps {
  $isOpen: boolean;
}

const TriggerButton = styled.button<TriggerProps>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme, $isOpen }) =>
    $isOpen ? theme.colors.secondary[500] : theme.colors.glass.border};
  border-radius: 12px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;

  @supports not (backdrop-filter: blur(1px)) {
    background: ${({ theme }) => theme.colors.glass.opaque};
  }

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const DivisionIcon = styled.span`
  width: 30px;
  height: 30px;
  border-radius: 9px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 1rem;
  background: rgba(84, 211, 155, 0.16);
  border: 1px solid rgba(84, 211, 155, 0.35);
  color: ${({ theme }) => theme.colors.bright.emerald};
`;

const DivisionInfo = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
`;

const DivisionName = styled.span`
  font-size: 0.84rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const DivisionIndustry = styled.span`
  font-size: 0.64rem;
  color: ${({ theme }) => theme.colors.muted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

interface ChevronIconProps {
  $isOpen: boolean;
}

const ChevronIcon = styled.span<ChevronIconProps>`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
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
  background: ${({ theme }) => theme.colors.cosmosHi};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(4, 6, 18, 0.5);
  overflow: hidden;
`;

const DropdownHeader = styled.div`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.6rem;
  font-weight: 400;
  color: ${({ theme }) => theme.colors.celeste};
  text-transform: uppercase;
  letter-spacing: 0.14em;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const DropdownOption = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: -2px;
  }

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.line};
  }
`;

const OptionIcon = styled.span`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.bright.emerald};
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
  color: ${({ theme }) => theme.colors.muted};
`;
