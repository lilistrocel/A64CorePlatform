import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { AlertTriangle, Building2, Leaf, Sprout } from 'lucide-react';
import { useDivisionStore, type Division } from '../../stores/division.store';
import { useThemeStore } from '../../stores/theme.store';
import { Spinner, glassPanel, glassPanelHover, monoLabel } from '@a64core/shared';

// Industry type display helpers — Night Observatory (T-901 GAP-FILL, spec
// §6): emoji icons replaced with lucide-react line icons.
const INDUSTRY_ICONS: Record<Division['industryType'], typeof Leaf> = {
  vegetable_fruits: Leaf,
  mushroom: Sprout,
};

const INDUSTRY_LABELS: Record<Division['industryType'], string> = {
  vegetable_fruits: 'Vegetable & Fruits',
  mushroom: 'Mushroom Farming',
};

export function DivisionSelector() {
  const navigate = useNavigate();
  const {
    availableDivisions,
    currentDivision,
    isLoading,
    hasFetchedOnce,
    error,
    loadDivisions,
    setCurrentDivision,
  } = useDivisionStore();
  // Lockup ships as separate cream/cosmos-text SVGs — pick per theme (spec §5).
  const { mode } = useThemeStore();
  const logoSrc = mode === 'dark' ? '/brand/lockup_cosmos.svg' : '/brand/lockup_cream.svg';

  // Load available divisions on mount, exactly once.
  // Gated on hasFetchedOnce (not length === 0) so a legitimate [] response
  // from a user with no division access doesn't loop — same fix pattern as
  // ProtectedRoute in 553bc89 (closed #2). Without this guard, the previous
  // commit's storm-prevention was half-applied: the loop could still happen
  // if a no-division user landed on /select-division directly.
  useEffect(() => {
    if (!hasFetchedOnce && !isLoading) {
      loadDivisions();
    }
  }, [hasFetchedOnce, isLoading, loadDivisions]);

  // Auto-select if only one division is available
  useEffect(() => {
    if (!isLoading && availableDivisions.length === 1 && !currentDivision) {
      handleSelectDivision(availableDivisions[0]);
    }
  }, [isLoading, availableDivisions, currentDivision]); // eslint-disable-line react-hooks/exhaustive-deps

  // If a division is already selected and we were redirected here, go to dashboard
  useEffect(() => {
    if (currentDivision && availableDivisions.length > 1) {
      navigate('/dashboard', { replace: true });
    }
  }, [currentDivision, availableDivisions.length, navigate]);

  const handleSelectDivision = async (division: Division) => {
    try {
      await setCurrentDivision(division);
      navigate('/dashboard', { replace: true });
    } catch {
      // Error is stored in division store — the UI will display it
    }
  };

  if (isLoading && availableDivisions.length === 0) {
    return (
      <PageContainer>
        <CenteredContent>
          <Spinner size="large" />
          <LoadingText>Loading your divisions...</LoadingText>
        </CenteredContent>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <CenteredContent>
        <LogoWrapper>
          <LogoImg src={logoSrc} alt="A20Core" />
        </LogoWrapper>

        <Heading>Select Your Division</Heading>
        <SubHeading>
          Choose the division you want to work in. You can switch divisions at any time from the
          sidebar.
        </SubHeading>

        {error && (
          <ErrorBanner role="alert" aria-live="polite">
            <AlertTriangle size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{error}</span>
          </ErrorBanner>
        )}

        {availableDivisions.length === 0 && !isLoading ? (
          <EmptyState>
            <EmptyIconWrap aria-hidden="true">
              <Building2 size={36} strokeWidth={1.4} />
            </EmptyIconWrap>
            <EmptyTitle>No Divisions Available</EmptyTitle>
            <EmptyDescription>
              You have not been assigned to any divisions yet. Please contact your administrator.
            </EmptyDescription>
          </EmptyState>
        ) : (
          <DivisionGrid aria-label="Available divisions">
            {availableDivisions.map((division) => {
              const IndustryIcon = INDUSTRY_ICONS[division.industryType];
              return (
                <DivisionCard
                  key={division.divisionId}
                  onClick={() => handleSelectDivision(division)}
                  $isSelected={currentDivision?.divisionId === division.divisionId}
                  $isLoading={isLoading}
                  aria-pressed={currentDivision?.divisionId === division.divisionId}
                  aria-label={`Select ${division.name} division`}
                  disabled={isLoading}
                >
                  <CardIndustryIconWrap aria-hidden="true">
                    <IndustryIcon size={30} strokeWidth={1.5} />
                  </CardIndustryIconWrap>

                  <CardBody>
                    <CardName>{division.name}</CardName>
                    <CardCode>{division.divisionCode}</CardCode>
                    <CardIndustryBadge $industryType={division.industryType}>
                      {INDUSTRY_LABELS[division.industryType]}
                    </CardIndustryBadge>
                    {division.description && (
                      <CardDescription>{division.description}</CardDescription>
                    )}
                  </CardBody>

                  {isLoading && currentDivision?.divisionId === division.divisionId && (
                    <CardLoadingOverlay>
                      <Spinner size="small" />
                    </CardLoadingOverlay>
                  )}
                </DivisionCard>
              );
            })}
          </DivisionGrid>
        )}
      </CenteredContent>
    </PageContainer>
  );
}

// ─── Animations ─────────────────────────────────────────────────────────────

const fadeInUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

// ─── Styled Components ───────────────────────────────────────────────────────
// Night Observatory (T-901 GAP-FILL): DivisionSelector renders before the app
// shell (no sidebar), so — like the auth screens — it sits directly on the
// bare sky. No opaque/gradient ground on top of the fixed Sky layer; visual
// idiom follows pages/auth/Login.tsx.

const PageContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: ${({ theme }) => theme.spacing.xl};
`;

const CenteredContent = styled.div`
  width: 100%;
  max-width: 800px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xl};
  animation: ${fadeInUp} 0.4s ease-out;
`;

const LogoWrapper = styled.div`
  display: flex;
  justify-content: center;
`;

const LogoImg = styled.img`
  /* Hero-level on the division-picker; logo is banner ~2.9:1. */
  height: clamp(72px, 10vw, 150px);
  width: auto;
`;

const Heading = styled.h1`
  font-size: 1.9rem;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textPrimary};
  letter-spacing: -0.01em;
  text-align: center;
  margin: 0;
`;

const SubHeading = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.muted};
  text-align: center;
  max-width: 480px;
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};
  margin: 0;
`;

const LoadingText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

const ErrorBanner = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.error}66;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const DivisionGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.lg};
  width: 100%;

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

interface DivisionCardProps {
  $isSelected: boolean;
  $isLoading: boolean;
}

const DivisionCard = styled.button<DivisionCardProps>`
  ${glassPanelHover}
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.xl};
  text-align: center;
  cursor: ${({ $isLoading }) => ($isLoading ? 'not-allowed' : 'pointer')};
  border-color: ${({ theme, $isSelected }) =>
    $isSelected ? theme.colors.secondary[500] : theme.colors.glass.border};
  box-shadow: ${({ $isSelected }) =>
    $isSelected
      ? '0 0 0 3px rgba(220, 185, 79, 0.18), 0 18px 40px rgba(4, 6, 18, 0.55)'
      : undefined};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.secondary[500]};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;

const CardIndustryIconWrap = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.colors.glass.hi};
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
`;

const CardBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const CardName = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CardCode = styled.span`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.muted};
`;

interface CardIndustryBadgeProps {
  $industryType: Division['industryType'];
}

const CardIndustryBadge = styled.span<CardIndustryBadgeProps>`
  display: inline-block;
  padding: 4px 11px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: 600;
  margin-top: ${({ theme }) => theme.spacing.xs};
  background: ${({ $industryType, theme }) =>
    $industryType === 'vegetable_fruits' ? theme.colors.successBg : theme.colors.infoBg};
  color: ${({ $industryType, theme }) =>
    $industryType === 'vegetable_fruits' ? theme.colors.bright.emerald : theme.colors.bright.lapis};
`;

const CardDescription = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.muted};
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};
  margin: ${({ theme }) => theme.spacing.xs} 0 0;
`;

// Night Observatory bug fix (T-901 GAP-FILL): the previous "${theme.colors.
// surface}cc" hex-alpha suffix idiom silently produced invalid CSS —
// "surface" is now an rgba(...) string in the dark theme, so appending "cc"
// yielded "rgba(23,29,64,0.42)cc", dropped by the browser. Explicit rgba
// instead (cosmos-deep scrim, matches the glassPanel overlay convention).
const CardLoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 14, 36, 0.6);
  border-radius: 18px;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing['2xl']};
  text-align: center;
`;

const EmptyIconWrap = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
`;

const EmptyTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const EmptyDescription = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.muted};
  max-width: 400px;
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};
  margin: 0;
`;
