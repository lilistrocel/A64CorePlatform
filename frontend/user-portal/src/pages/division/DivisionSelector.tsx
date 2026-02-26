import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useDivisionStore, type Division } from '../../stores/division.store';
import { Spinner } from '@a64core/shared';

// Industry type display helpers
const INDUSTRY_ICONS: Record<Division['industryType'], string> = {
  vegetable_fruits: '🌿',
  mushroom: '🍄',
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
    error,
    loadDivisions,
    setCurrentDivision,
  } = useDivisionStore();

  // Load available divisions on mount (only if not already loaded)
  useEffect(() => {
    if (availableDivisions.length === 0 && !isLoading) {
      loadDivisions();
    }
  }, [availableDivisions.length, isLoading, loadDivisions]);

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
          <LogoImg src="/a64logo_dark.png" alt="A64 Core Platform" />
        </LogoWrapper>

        <Heading>Select Your Division</Heading>
        <SubHeading>
          Choose the division you want to work in. You can switch divisions at any time from the
          sidebar.
        </SubHeading>

        {error && (
          <ErrorBanner role="alert" aria-live="polite">
            <ErrorIcon aria-hidden="true">!</ErrorIcon>
            <span>{error}</span>
          </ErrorBanner>
        )}

        {availableDivisions.length === 0 && !isLoading ? (
          <EmptyState>
            <EmptyIcon aria-hidden="true">🏢</EmptyIcon>
            <EmptyTitle>No Divisions Available</EmptyTitle>
            <EmptyDescription>
              You have not been assigned to any divisions yet. Please contact your administrator.
            </EmptyDescription>
          </EmptyState>
        ) : (
          <DivisionGrid aria-label="Available divisions">
            {availableDivisions.map((division) => (
              <DivisionCard
                key={division.divisionId}
                onClick={() => handleSelectDivision(division)}
                $isSelected={currentDivision?.divisionId === division.divisionId}
                $isLoading={isLoading}
                aria-pressed={currentDivision?.divisionId === division.divisionId}
                aria-label={`Select ${division.name} division`}
                disabled={isLoading}
              >
                <CardIndustryIcon aria-hidden="true">
                  {INDUSTRY_ICONS[division.industryType]}
                </CardIndustryIcon>

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
            ))}
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

const PageContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral[50]};
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
  height: 56px;
  width: auto;
`;

const Heading = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  text-align: center;
  margin: 0;
`;

const SubHeading = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  max-width: 480px;
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};
  margin: 0;
`;

const LoadingText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const ErrorBanner = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  width: 100%;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => `${theme.colors.error}15`};
  border: 1px solid ${({ theme }) => `${theme.colors.error}40`};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const ErrorIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ theme }) => theme.colors.error};
  color: white;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  flex-shrink: 0;
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
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.xl};
  background: ${({ theme }) => theme.colors.surface};
  border: 2px solid
    ${({ theme, $isSelected }) =>
      $isSelected ? theme.colors.primary[500] : theme.colors.neutral[200]};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme, $isSelected }) =>
    $isSelected ? `0 0 0 4px ${theme.colors.primary[500]}20` : theme.shadows.md};
  cursor: ${({ $isLoading }) => ($isLoading ? 'not-allowed' : 'pointer')};
  text-align: center;
  transition: all 0.2s ease;
  overflow: hidden;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: ${({ theme }) => `0 0 0 4px ${theme.colors.primary[500]}20`};
    transform: translateY(-2px);
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.7;
  }
`;

const CardIndustryIcon = styled.span`
  font-size: 3rem;
  line-height: 1;
`;

const CardBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const CardName = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const CardCode = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

interface CardIndustryBadgeProps {
  $industryType: Division['industryType'];
}

const CardIndustryBadge = styled.span<CardIndustryBadgeProps>`
  display: inline-block;
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  margin-top: ${({ theme }) => theme.spacing.xs};
  background: ${({ $industryType, theme }) =>
    $industryType === 'vegetable_fruits'
      ? `${theme.colors.success}20`
      : `${theme.colors.primary[500]}15`};
  color: ${({ $industryType, theme }) =>
    $industryType === 'vegetable_fruits' ? theme.colors.success : theme.colors.primary[600]};
`;

const CardDescription = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};
  margin: ${({ theme }) => theme.spacing.xs} 0 0;
`;

const CardLoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => `${theme.colors.surface}cc`};
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing['2xl']};
  text-align: center;
`;

const EmptyIcon = styled.span`
  font-size: 3rem;
`;

const EmptyTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const EmptyDescription = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textSecondary};
  max-width: 400px;
  line-height: ${({ theme }) => theme.typography.lineHeight.normal};
  margin: 0;
`;
