/**
 * Operations Dashboard Page
 *
 * Mobile-first farm selection view showing pending task counts for each farm.
 * Farmers can select a farm to view blocks and their tasks.
 *
 * Features:
 * - Farming year filter for consistent filtering across operations
 * - Task counts filtered by selected farming year
 *
 * Night Observatory (T-901, spec §4/§5): glass cards over the sky, task
 * counts routed onto the phase map (pending -> fruitingInit, in progress ->
 * inoculated per spec §5.2), summary counts folded into the PageHeader stat
 * tiles rather than a separate duplicate summary row.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Mountain, Pause, Play, ArrowRight, AlertTriangle } from 'lucide-react';
import { PageHeader, Button, glassPanelHover, monoLabel, phaseBadge, type PageHeaderStat } from '@a64core/shared';
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

  const totalPending = farms.reduce((sum, farm) => sum + farm.pendingTaskCount, 0);
  const totalInProgress = farms.reduce((sum, farm) => sum + farm.inProgressTaskCount, 0);

  const headerStats: PageHeaderStat[] = [
    { value: totalPending, label: 'Pending' },
    { value: totalInProgress, label: 'In progress', alive: true },
    ...(selectedFarmingYear !== null ? [{ value: selectedFarmingYear, label: 'Year' }] : []),
  ];

  const description =
    farms.length > 0
      ? 'Select a farm to view its blocks and tasks'
      : undefined;

  return (
    <PageWrapper>
      <PageHeader
        breadcrumb="Operations · Live"
        title="Farm Operations"
        emphasizeLastWord
        description={description}
        stats={farms.length > 0 ? headerStats : undefined}
      />

      {loading && (
        <StateBox>
          <Spinner />
          <StateText>Loading farms…</StateText>
        </StateBox>
      )}

      {!loading && error && (
        <StateBox>
          <ErrorIcon aria-hidden="true"><AlertTriangle size={32} strokeWidth={1.6} /></ErrorIcon>
          <StateText>{error}</StateText>
          <Button variant="secondary" size="small" onClick={loadFarmsWithTaskCounts}>
            Retry
          </Button>
        </StateBox>
      )}

      {!loading && !error && farms.length === 0 && (
        <EmptyState>
          <EmptyTitle>No farms available</EmptyTitle>
          <EmptyText>Contact your manager to get assigned to a farm.</EmptyText>
        </EmptyState>
      )}

      {!loading && !error && farms.length > 0 && (
        <FarmList>
          {farms.map((farm) => {
            const hasTasks = farm.pendingTaskCount > 0 || farm.inProgressTaskCount > 0;
            return (
              <FarmCard
                key={farm.farmId}
                onClick={() => handleFarmClick(farm.farmId)}
                $hasTasks={hasTasks}
              >
                <FarmHeader>
                  <FarmIconWrap aria-hidden="true">
                    <Mountain size={22} strokeWidth={1.6} />
                  </FarmIconWrap>
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
                    <TaskBadge $phaseKey="fruitingInit">
                      <Pause size={12} strokeWidth={2} />
                      {farm.pendingTaskCount} Pending
                    </TaskBadge>
                  )}
                  {farm.inProgressTaskCount > 0 && (
                    <TaskBadge $phaseKey="inoculated">
                      <Play size={12} strokeWidth={2} />
                      {farm.inProgressTaskCount} In progress
                    </TaskBadge>
                  )}
                  {farm.pendingTaskCount === 0 && farm.inProgressTaskCount === 0 && (
                    <NoTasksText>No pending tasks</NoTasksText>
                  )}
                </TaskCounts>

                <ViewButton>
                  View Blocks
                  <ArrowRight size={15} strokeWidth={2} />
                </ViewButton>
              </FarmCard>
            );
          })}
        </FarmList>
      )}
    </PageWrapper>
  );
}

// ============================================================================
// STYLED COMPONENTS
// Night Observatory (T-901 GAP-FILL) — transparent page container, glass
// cards, phase-map badges. Visual idiom: MushroomRoomMonitor.tsx.
// ============================================================================

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100%;
`;

const StateBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 60px 24px;
`;

const StateText = styled.p`
  font-size: 0.9rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

const ErrorIcon = styled.div`
  color: ${({ theme }) => theme.colors.bright.coral};
  display: flex;
`;

const Spinner = styled.div`
  width: 36px;
  height: 36px;
  border: 3px solid ${({ theme }) => theme.colors.line};
  border-top-color: ${({ theme }) => theme.colors.secondary[500]};
  border-radius: 50%;
  animation: spinAnim 0.9s linear infinite;

  @keyframes spinAnim {
    to {
      transform: rotate(360deg);
    }
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  text-align: center;
`;

const EmptyTitle = styled.h3`
  font-family: ${({ theme }) => theme.typography.fontFamily.display};
  font-style: italic;
  font-weight: 400;
  font-size: 1.3rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 8px 0;
`;

const EmptyText = styled.p`
  font-size: 0.9rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

const FarmList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
`;

const FarmCard = styled.div<{ $hasTasks: boolean }>`
  ${glassPanelHover}
  padding: 20px;
  border-left: 3px solid
    ${({ theme, $hasTasks }) => ($hasTasks ? theme.colors.phase.inoculated : theme.colors.line)};
`;

const FarmHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
`;

const FarmIconWrap = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.glass.hi};
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
`;

const FarmInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const FarmName = styled.h3`
  font-size: 1.05rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px 0;
`;

const FarmLocation = styled.p`
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

const TaskCounts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
`;

const TaskBadge = styled.div<{ $phaseKey: 'fruitingInit' | 'inoculated' }>`
  ${({ $phaseKey }) => phaseBadge($phaseKey)}
`;

const NoTasksText = styled.p`
  font-size: 0.82rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`;

const ViewButton = styled.div`
  ${monoLabel}
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 0.72rem;
  transition: background 150ms ease, color 150ms ease;

  ${FarmCard}:hover & {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;
