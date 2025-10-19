import { useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { StatWidget, ChartWidget, Spinner } from '@a64core/shared';
import { useDashboardStore } from '../../stores/dashboard.store';
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
  const [containerWidth, setContainerWidth] = useState(1200);
  const [columns, setColumns] = useState(4);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        setContainerWidth(width);

        // Set columns based on viewport width
        if (width < 768) {
          setColumns(2); // Mobile: 2 columns
        } else if (width < 1024) {
          setColumns(3); // Tablet: 3 columns
        } else {
          setColumns(4); // Desktop: 4 columns
        }
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Adjust layout when columns change to make it truly responsive
  useEffect(() => {
    if (layout.length > 0 && columns && widgets.length > 0) {
      // Always reflow layout when columns change
      const adjustedLayout: Layout[] = [];
      let currentX = 0;
      let currentY = 0;

      // Sort layout by original position to maintain order
      const sortedLayout = [...layout].sort((a, b) => {
        if (a.y === b.y) return a.x - b.x;
        return a.y - b.y;
      });

      sortedLayout.forEach(item => {
        // Find the widget to get its original intended size
        const widget = widgets.find(w => w.id === item.i);
        if (!widget) return;

        // Calculate ideal width based on widget size and current columns
        let idealWidth = item.w;
        if (columns === 2) {
          // On mobile: large widgets take full width, medium take half
          idealWidth = widget.size === 'large' || widget.size === 'wide' ? 2 : 1;
        } else if (columns === 3) {
          // On tablet: adjust proportionally
          idealWidth = widget.size === 'large' ? 2 : widget.size === 'wide' ? 3 : 1;
        } else {
          // On desktop: use original sizing
          idealWidth = widget.size === 'large' ? 2 : widget.size === 'wide' ? 4 : 1;
        }

        const width = Math.min(idealWidth, columns);

        // If widget doesn't fit in current row, move to next row
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

      // Check if layout actually changed before updating
      const layoutChanged = adjustedLayout.some((adjusted) => {
        const original = layout.find(l => l.i === adjusted.i);
        return !original ||
               original.x !== adjusted.x ||
               original.y !== adjusted.y ||
               original.w !== adjusted.w;
      });

      if (layoutChanged) {
        updateLayout(adjustedLayout);
      }
    }
  }, [columns, widgets]);

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

      <GridContainer ref={containerRef}>
        <GridLayout
          className="layout"
          layout={layout}
          cols={columns}
          rowHeight={150}
          width={containerWidth}
          onLayoutChange={(newLayout) => updateLayout(newLayout)}
          isDraggable={isEditing}
          isResizable={isEditing}
          compactType={null}
          preventCollision={true}
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
    width: 100% !important;
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

const WidgetGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  width: 100%;

  @media (min-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(4, 1fr);
    gap: 1.5rem;
  }

  @media (min-width: 1600px) {
    gap: 2rem;
  }
`;

const WidgetWrapper = styled.div<{ $size?: string }>`
  /* Default: medium - 1 column */
  grid-column: span 1;

  /* Large widgets span 2 columns on tablet and up */
  ${({ $size }) =>
    $size === 'large' &&
    `
    @media (min-width: 640px) {
      grid-column: span 2;
    }
  `}

  /* Wide widgets span full width on desktop */
  ${({ $size }) =>
    $size === 'wide' &&
    `
    @media (min-width: 1024px) {
      grid-column: span 4;
    }
  `}

  /* Full-width widgets always span all columns */
  ${({ $size }) =>
    $size === 'full-width' &&
    `
    grid-column: 1 / -1;
  `}
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
