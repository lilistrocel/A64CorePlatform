/**
 * Operations Dashboard Page
 *
 * Mobile-first farm selection view showing pending task counts for each farm.
 * Farmers can select a farm to view blocks and their tasks.
 *
 * Features:
 * - Farming year filter for consistent filtering across operations
 * - Task counts filtered by selected farming year
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { getFarms } from '../../services/farmApi';
import { getFarmTasks } from '../../services/tasksApi';
import { useFarmingYearStore } from '../../stores/farmingYear.store';
import type { Farm } from '../../types/farm';

interface FarmWithTasks extends Farm {
  pendingTaskCount: number;
  inProgressTaskCount: number;
}

export function OperationsDashboard() {
  const navigate = useNavigate();
  const [farms, setFarms] = useState<FarmWithTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use the global farming year from sidebar
  const { selectedYear: selectedFarmingYear } = useFarmingYearStore();

  useEffect(() => {
    loadFarmsWithTaskCounts();
  }, [selectedFarmingYear]);

  const loadFarmsWithTaskCounts = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all farms
      const farmsResponse = await getFarms(1, 100);
      const farmsData = farmsResponse.items;

      // Load tasks for each farm and count by status (filtered by farming year if selected)
      const farmsWithTasks: FarmWithTasks[] = await Promise.all(
        farmsData.map(async (farm) => {
          try {
            // Get all tasks for this farm (not just user's tasks)
            const tasksResponse = await getFarmTasks(farm.farmId, {
              page: 1,
              perPage: 100,
              farmingYear: selectedFarmingYear ?? undefined,
            });
            const farmTasks = tasksResponse.items;

            const pendingCount = farmTasks.filter((task) => task.status === 'pending').length;
            const inProgressCount = farmTasks.filter((task) => task.status === 'in_progress').length;

            return {
              ...farm,
              pendingTaskCount: pendingCount,
              inProgressTaskCount: inProgressCount,
            };
          } catch (error) {
            console.error(`Failed to load tasks for farm ${farm.farmId}:`, error);
            // Return farm with zero task counts if task loading fails
            return {
              ...farm,
              pendingTaskCount: 0,
              inProgressTaskCount: 0,
            };
          }
        })
      );

      setFarms(farmsWithTasks);
    } catch (err) {
      console.error('Failed to load farms with tasks:', err);
      setError('Failed to load farms. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFarmClick = (farmId: string) => {
    navigate(`/operations/${farmId}`);
  };

  const renderHeader = () => (
    <Header>
      <HeaderTop>
        <HeaderTitles>
          <Title>Operations</Title>
          <Subtitle>
            Select a farm to view tasks
            {selectedFarmingYear !== null && (
              <FarmingYearBadge>Year {selectedFarmingYear}</FarmingYearBadge>
            )}
          </Subtitle>
        </HeaderTitles>
      </HeaderTop>
    </Header>
  );

  if (loading) {
    return (
      <Container>
        {renderHeader()}
        <LoadingContainer>
          <LoadingSpinner />
          <LoadingText>Loading farms...</LoadingText>
        </LoadingContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        {renderHeader()}
        <ErrorContainer>
          <ErrorIcon>❌</ErrorIcon>
          <ErrorText>{error}</ErrorText>
          <RetryButton onClick={loadFarmsWithTaskCounts}>Retry</RetryButton>
        </ErrorContainer>
      </Container>
    );
  }

  if (farms.length === 0) {
    return (
      <Container>
        {renderHeader()}
        <EmptyContainer>
          <EmptyIcon>🏞️</EmptyIcon>
          <EmptyText>No farms available</EmptyText>
          <EmptySubtext>Contact your manager to get assigned to a farm.</EmptySubtext>
        </EmptyContainer>
      </Container>
    );
  }

  const totalPending = farms.reduce((sum, farm) => sum + farm.pendingTaskCount, 0);
  const totalInProgress = farms.reduce((sum, farm) => sum + farm.inProgressTaskCount, 0);

  return (
    <Container>
      {renderHeader()}

      {/* Summary */}
      <Summary>
        <SummaryCard>
          <SummaryIcon>⏸️</SummaryIcon>
          <SummaryValue>{totalPending}</SummaryValue>
          <SummaryLabel>Pending</SummaryLabel>
        </SummaryCard>
        <SummaryCard>
          <SummaryIcon>▶️</SummaryIcon>
          <SummaryValue>{totalInProgress}</SummaryValue>
          <SummaryLabel>In Progress</SummaryLabel>
        </SummaryCard>
      </Summary>

      {/* Farm List */}
      <FarmList>
        {farms.map((farm) => (
          <FarmCard
            key={farm.farmId}
            onClick={() => handleFarmClick(farm.farmId)}
            $hasTasks={farm.pendingTaskCount > 0 || farm.inProgressTaskCount > 0}
          >
            <FarmHeader>
              <FarmIcon>🏞️</FarmIcon>
              <FarmInfo>
                <FarmName>{farm.name}</FarmName>
                <FarmLocation>
                  {farm.location?.city && farm.location?.state
                    ? `${farm.location.city}, ${farm.location.state}`
                    : farm.location?.city || farm.location?.state || 'No location specified'}
                </FarmLocation>
              </FarmInfo>
            </FarmHeader>

            <TaskCounts>
              {farm.pendingTaskCount > 0 && (
                <TaskBadge $status="pending">
                  <BadgeIcon>⏸️</BadgeIcon>
                  <BadgeCount>{farm.pendingTaskCount}</BadgeCount>
                  <BadgeLabel>Pending</BadgeLabel>
                </TaskBadge>
              )}
              {farm.inProgressTaskCount > 0 && (
                <TaskBadge $status="in_progress">
                  <BadgeIcon>▶️</BadgeIcon>
                  <BadgeCount>{farm.inProgressTaskCount}</BadgeCount>
                  <BadgeLabel>In Progress</BadgeLabel>
                </TaskBadge>
              )}
              {farm.pendingTaskCount === 0 && farm.inProgressTaskCount === 0 && (
                <NoTasksText>No pending tasks</NoTasksText>
              )}
            </TaskCounts>

            <ViewButton>
              View Blocks
              <ArrowIcon>→</ArrowIcon>
            </ViewButton>
          </FarmCard>
        ))}
      </FarmList>
    </Container>
  );
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral[50]};
  padding-bottom: ${({ theme }) => theme.spacing.xl};
`;

const Header = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.lg};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const HeaderTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const HeaderTitles = styled.div`
  flex: 1;
  min-width: 200px;
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
`;

const Subtitle = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`;

const FarmingYearBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.primary[50]};
  color: ${({ theme }) => theme.colors.primary[700]};
  border: 1px solid ${({ theme }) => theme.colors.primary[200]};
`;

const Summary = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
`;

const SummaryCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.lg};
  text-align: center;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const SummaryIcon = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const SummaryValue = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const SummaryLabel = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const FarmList = styled.div`
  padding: 0 ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const FarmCard = styled.div<{ $hasTasks: boolean }>`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  padding: ${({ theme }) => theme.spacing.lg};
  box-shadow: ${({ theme }) => theme.shadows.md};
  cursor: pointer;
  transition: all 0.2s ease;
  border-left: 4px solid
    ${({ theme, $hasTasks }) => ($hasTasks ? theme.colors.primary[500] : theme.colors.neutral[300])};

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.lg};
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const FarmHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const FarmIcon = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
`;

const FarmInfo = styled.div`
  flex: 1;
`;

const FarmName = styled.h3`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
`;

const FarmLocation = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const TaskCounts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const TaskBadge = styled.div<{ $status: 'pending' | 'in_progress' }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.md}`};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ theme, $status }) =>
    $status === 'pending' ? `${theme.colors.neutral[500]}15` : `${theme.colors.primary[500]}15`};
  color: ${({ theme, $status }) =>
    $status === 'pending' ? theme.colors.neutral[700] : theme.colors.primary[700]};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const BadgeIcon = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
`;

const BadgeCount = styled.span`
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
`;

const BadgeLabel = styled.span``;

const NoTasksText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const ViewButton = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.primary[50]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.primary[700]};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  transition: background 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[100]};
  }
`;

const ArrowIcon = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing['3xl']};
  gap: ${({ theme }) => theme.spacing.lg};
`;

const LoadingSpinner = styled.div`
  width: 48px;
  height: 48px;
  border: 4px solid ${({ theme }) => theme.colors.neutral[200]};
  border-top-color: ${({ theme }) => theme.colors.primary[500]};
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const LoadingText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing['3xl']};
  gap: ${({ theme }) => theme.spacing.lg};
`;

const ErrorIcon = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['4xl']};
`;

const ErrorText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.error};
  margin: 0;
  text-align: center;
`;

const RetryButton = styled.button`
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.xl}`};
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[600]};
  }

  &:active {
    background: ${({ theme }) => theme.colors.primary[700]};
  }
`;

const EmptyContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing['3xl']};
  gap: ${({ theme }) => theme.spacing.md};
`;

const EmptyIcon = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize['4xl']};
`;

const EmptyText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const EmptySubtext = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  text-align: center;
`;
