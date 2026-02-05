import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { StatWidget, ChartWidget, Spinner } from '@a64core/shared';
import { useDashboardStore, waitForHydration } from '../../stores/dashboard.store';
import GridLayout, { type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';

export function Dashboard() {
  const {
    widgets,
    widgetData,
    layout,
    isLoading,
    error,
    loadDashboard,
    refreshAllWidgets,
    updateLayout,
    resetLayout,
  } = useDashboardStore();

  const [isEditing, setIsEditing] = useState(false);
  const [columns, setColumns] = useState(4);
  const [gridWidth, setGridWidth] = useState(0);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const prevColumnsRef = useRef<number>(4);
  const initialLoadDoneRef = useRef(false);

  // Measure grid container width synchronously before paint
  // Column breakpoints based on VIEWPORT width for consistent responsive behavior:
  // - >= 1200px viewport: 4 columns (large desktop)
  // - >= 900px viewport: 3 columns (desktop/tablet landscape)
  // - >= 600px viewport: 2 columns (tablet portrait)
  // - < 600px viewport: 1 column (mobile)
  useLayoutEffect(() => {
    const measure = () => {
      if (gridContainerRef.current) {
        const containerWidth = gridContainerRef.current.offsetWidth;
        setGridWidth(containerWidth);

        // Use viewport width for responsive breakpoints (not container width)
        // This ensures consistent column counts regardless of sidebar state
        const viewportWidth = window.innerWidth;
        if (viewportWidth < 600) {
          setColumns(1);
        } else if (viewportWidth < 900) {
          setColumns(2);
        } else if (viewportWidth < 1200) {
          setColumns(3);
        } else {
          setColumns(4);
        }
      }
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    // Wait for Zustand persist hydration before loading dashboard
    // This ensures stored layout from localStorage is available when loadDashboard runs
    waitForHydration().then(() => {
      loadDashboard().then(() => {
        initialLoadDoneRef.current = true;
      });
    });
  }, [loadDashboard]);

  // Adjust layout ONLY when columns actually change (responsive resize), not on initial load
  useEffect(() => {
    // Skip if initial load hasn't completed yet or columns haven't changed
    if (!initialLoadDoneRef.current || columns === prevColumnsRef.current) {
      prevColumnsRef.current = columns;
      return;
    }
    prevColumnsRef.current = columns;

    if (layout.length > 0 && widgets.length > 0) {
      const adjustedLayout: Layout[] = [];
      let currentX = 0;
      let currentY = 0;

      const sortedLayout = [...layout].sort((a, b) => {
        if (a.y === b.y) return a.x - b.x;
        return a.y - b.y;
      });

      sortedLayout.forEach(item => {
        const widget = widgets.find(w => w.id === item.i);
        if (!widget) return;

        let idealWidth = item.w;
        if (columns === 1) {
          idealWidth = 1; // All widgets take full width on mobile
        } else if (columns === 2) {
          idealWidth = widget.size === 'large' || widget.size === 'wide' ? 2 : 1;
        } else if (columns === 3) {
          idealWidth = widget.size === 'large' ? 2 : widget.size === 'wide' ? 3 : 1;
        } else {
          idealWidth = widget.size === 'large' ? 2 : widget.size === 'wide' ? 4 : 1;
        }

        const width = Math.min(idealWidth, columns);

        if (currentX + width > columns) {
          currentX = 0;
          currentY = adjustedLayout.reduce((max, l) => Math.max(max, l.y + l.h), currentY);
        }

        adjustedLayout.push({
          ...item,
          x: currentX,
          y: currentY,
          w: width,
        });

        currentX += width;
      });

      updateLayout(adjustedLayout);
    }
  }, [columns]);

  if (isLoading && widgets.length === 0) {
    return (
      <LoadingContainer>
        <Spinner size="large" />
        <LoadingText>Loading dashboard...</LoadingText>
      </LoadingContainer>
    );
  }

  if (error && widgets.length === 0) {
    return (
      <ErrorContainer>
        <ErrorText>{error}</ErrorText>
        <RetryButton onClick={loadDashboard}>Retry</RetryButton>
      </ErrorContainer>
    );
  }

  return (
    <DashboardContainer>
      <DashboardHeader>
        <HeaderLeft>
          <Title>CCM Dashboard</Title>
          <Subtitle>
            Centralized Controls Monitoring - Real-time insights across all modules
          </Subtitle>
        </HeaderLeft>
        <HeaderRight>
          <ActionButton onClick={() => setIsEditing(!isEditing)} $variant={isEditing ? 'primary' : 'secondary'}>
            {isEditing ? '✓ Done' : '✏️ Edit Layout'}
          </ActionButton>
          {isEditing && (
            <ActionButton onClick={resetLayout} $variant="secondary">
              ↺ Reset
            </ActionButton>
          )}
          <RefreshButton onClick={refreshAllWidgets}>
            🔄 Refresh All
          </RefreshButton>
        </HeaderRight>
      </DashboardHeader>

      {error && (
        <ErrorBanner>
          {error}
          <CloseButton onClick={() => useDashboardStore.getState().clearError()}>×</CloseButton>
        </ErrorBanner>
      )}

      {isEditing && (
        <EditModeBanner>
          ✏️ <strong>Edit Mode:</strong> Drag widgets to rearrange them. Click "Done" when finished.
        </EditModeBanner>
      )}

      <GridContainer ref={gridContainerRef}>
        {gridWidth > 0 && widgets.length > 0 && layout.length > 0 && (
          <GridLayout
            className="layout"
            layout={layout}
            cols={columns}
            rowHeight={150}
            width={gridWidth}
            onDragStop={(_layout: Layout[]) => {
              // Only save layout after user drag interaction
              updateLayout(_layout);
            }}
            onResizeStop={(_layout: Layout[]) => {
              // Only save layout after user resize interaction
              updateLayout(_layout);
            }}
            isDraggable={isEditing}
            isResizable={isEditing}
            compactType="vertical"
            preventCollision={false}
          >
          {widgets.map((widget) => {
            const widgetState = widgetData[widget.id];
            const isChart = widget.type === 'chart';

            return (
              <WidgetContainer key={widget.id}>
                {isChart ? (
                  <ChartWidget
                    widget={{ ...widget, chartType: widgetState?.data?.chartType }}
                    data={widgetState?.data || null}
                    loading={widgetState?.loading || false}
                    error={widgetState?.error || null}
                    onRefresh={() => useDashboardStore.getState().refreshWidget(widget.id)}
                  />
                ) : (
                  <StatWidget
                    widget={widget}
                    data={widgetState?.data || null}
                    loading={widgetState?.loading || false}
                    error={widgetState?.error || null}
                  />
                )}
              </WidgetContainer>
            );
          })}
          </GridLayout>
        )}
      </GridContainer>

      {widgets.length === 0 && !isLoading && (
        <EmptyState>
          <EmptyIcon>📊</EmptyIcon>
          <EmptyTitle>No widgets configured</EmptyTitle>
          <EmptyText>Add widgets to your dashboard to start monitoring your business</EmptyText>
        </EmptyState>
      )}
    </DashboardContainer>
  );
}

const DashboardContainer = styled.div`
  padding: 1rem;
  width: 100%;
  height: 100%;

  @media (min-width: 768px) {
    padding: 1.5rem;
  }

  @media (min-width: 1024px) {
    padding: 2rem;
  }
`;

const DashboardHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;

  @media (min-width: 768px) {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
  }
`;

const HeaderLeft = styled.div`
  flex: 1;
`;

const HeaderRight = styled.div`
  display: flex;
  gap: 0.75rem;
`;

const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 0.5rem 0;

  @media (min-width: 768px) {
    font-size: 1.875rem;
  }
`;

const Subtitle = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;

  @media (min-width: 768px) {
    font-size: 1rem;
  }
`;

const RefreshButton = styled.button`
  padding: 0.5rem 1rem;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: background 0.2s ease;
  white-space: nowrap;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[600]};
  }

  &:active {
    transform: scale(0.98);
  }
`;

const ErrorBanner = styled.div`
  background: ${({ theme }) => `${theme.colors.error}10`};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  color: ${({ theme }) => theme.colors.error};
  font-size: 0.875rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.error};
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    opacity: 0.7;
  }
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 0.5rem 1rem;
  background: ${({ theme, $variant }) =>
    $variant === 'primary' ? theme.colors.primary[500] : theme.colors.neutral[200]};
  color: ${({ theme, $variant }) =>
    $variant === 'primary' ? 'white' : theme.colors.textPrimary};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;

  &:hover {
    background: ${({ theme, $variant }) =>
      $variant === 'primary' ? theme.colors.primary[600] : theme.colors.neutral[300]};
  }

  &:active {
    transform: scale(0.98);
  }
`;

const EditModeBanner = styled.div`
  background: ${({ theme }) => `${theme.colors.info}10`};
  border: 1px solid ${({ theme }) => theme.colors.info};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  color: ${({ theme }) => theme.colors.info};
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const WidgetContainer = styled.div`
  height: 100%;
  width: 100%;
`;

const GridContainer = styled.div`
  width: 100%;
  max-width: 100%;

  .react-grid-layout {
    position: relative;
  }

  .react-grid-item {
    transition: all 200ms ease;
    transition-property: left, top, width, height;
    box-sizing: border-box;
  }

  .react-grid-item.cssTransforms {
    transition-property: transform, width, height;
  }

  .react-grid-item.react-draggable-dragging {
    transition: none;
    z-index: 100;
    will-change: transform;
  }

  .react-grid-item.resizing {
    transition: none;
    z-index: 100;
    will-change: transform;
  }

  .react-grid-item > .react-resizable-handle {
    position: absolute;
    width: 20px;
    height: 20px;
    bottom: 0;
    right: 0;
    cursor: se-resize;
  }

  .react-grid-item > .react-resizable-handle::after {
    content: "";
    position: absolute;
    right: 3px;
    bottom: 3px;
    width: 5px;
    height: 5px;
    border-right: 2px solid rgba(0, 0, 0, 0.4);
    border-bottom: 2px solid rgba(0, 0, 0, 0.4);
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 1rem;
`;

const LoadingText = styled.p`
  font-size: 1rem;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 1.5rem;
`;

const ErrorText = styled.p`
  font-size: 1rem;
  color: ${({ theme }) => theme.colors.error};
  text-align: center;
`;

const RetryButton = styled.button`
  padding: 0.75rem 1.5rem;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.primary[600]};
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
  gap: 1rem;
`;

const EmptyIcon = styled.div`
  font-size: 4rem;
`;

const EmptyTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0;
`;

const EmptyText = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  max-width: 400px;
  margin: 0;
`;
