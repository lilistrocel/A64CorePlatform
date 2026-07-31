/**
 * HRDashboardPage Component
 *
 * Overview dashboard with employee statistics and quick insights.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { AlertTriangle } from 'lucide-react';
import { hrApi } from '../../services/hrService';
import { formatNumber } from '../../utils/formatNumber';
import type { HRDashboardStats } from '../../types/hr';
import { PageHeader, glassPanel, glassPanelHover, monoLabel } from '@a64core/shared';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
`;

const StatCard = styled.div`
  ${glassPanel}
  border-radius: 16px;
  padding: 24px;
`;

const StatLabel = styled.div`
  ${monoLabel}
  font-size: 0.66rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 10px;
`;

const StatValue = styled.div<{ $color?: string }>`
  font-size: 36px;
  font-weight: 800;
  color: ${({ $color, theme }) => $color || theme.colors.textPrimary};
`;

const WidgetsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 24px;
  margin-bottom: 32px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const Widget = styled.div`
  ${glassPanel}
  border-radius: 16px;
  padding: 24px;
`;

const WidgetTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 16px 0;
`;

const EmployeeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const EmployeeItem = styled.div`
  ${glassPanelHover}
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 10px;
`;

const EmployeeName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const EmployeeDate = styled.span`
  ${monoLabel}
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.muted};
`;

/* Upcoming visa expirations are the "pending / awaiting approval" phase
   (fruitingInit / terra), not gold — gold is reserved for the Harvesting
   status only (spec §5.2), matching the treatment in VisaTab.tsx. */
const VisaItem = styled.div`
  padding: 12px;
  background: rgba(232, 147, 95, 0.16);
  border: 1px solid rgba(232, 147, 95, 0.45);
  border-radius: 10px;
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
`;

const VisaEmployee = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.bright.terra};
`;

const VisaExpiry = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.bright.terra};
  margin-top: 4px;
`;

const QuickActions = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;
`;

const PrimaryActionButton = styled.button`
  padding: 12px 24px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[300]}, ${({ theme }) => theme.colors.secondary[500]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    filter: brightness(1.05);
  }
`;

const SecondaryActionButton = styled.button`
  padding: 12px 24px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.muted};
`;

const ErrorContainer = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  color: ${({ theme }) => theme.colors.bright.coral};
  padding: 16px;
  border-radius: 10px;
  margin-bottom: 24px;
`;

const EmptyText = styled.div`
  text-align: center;
  padding: 24px;
  color: ${({ theme }) => theme.colors.muted};
`;

const DepartmentItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const DepartmentName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const DepartmentCount = styled.span`
  ${monoLabel}
  font-size: 0.74rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.bright.lapis};
  background: rgba(107, 138, 224, 0.16);
  border: 1px solid rgba(107, 138, 224, 0.35);
  padding: 4px 12px;
  border-radius: 16px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function HRDashboardPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const [stats, setStats] = useState<HRDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await hrApi.getDashboardStats();
      setStats(data);
    } catch (err: any) {
      console.error('Failed to load dashboard stats:', err);
      setError(err.response?.data?.message || 'Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleViewEmployeeList = () => {
    navigate('/hr/employees');
  };

  const handleAddEmployee = () => {
    navigate('/hr/employees/new');
  };

  if (loading) {
    return (
      <Container>
        <LoadingContainer>Loading dashboard...</LoadingContainer>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <ErrorContainer>{error}</ErrorContainer>
      </Container>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <Container>
      <PageHeader
        breadcrumb="HR · LIVE"
        title="Human Resources"
        emphasizeLastWord
        description="Employee management and HR overview"
      />

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Employees</StatLabel>
          <StatValue>{formatNumber(stats.totalEmployees)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Active</StatLabel>
          <StatValue $color={theme.colors.bright.emerald}>{formatNumber(stats.activeEmployees)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>On Leave</StatLabel>
          <StatValue $color={theme.colors.bright.rose}>{formatNumber(stats.onLeaveEmployees)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Average Performance</StatLabel>
          <StatValue>{formatNumber(stats.averagePerformanceRating, { decimals: 1 })}/5</StatValue>
        </StatCard>
      </StatsGrid>

      <WidgetsRow>
        <Widget>
          <WidgetTitle>Recent Hires</WidgetTitle>
          {stats.recentHires && stats.recentHires.length > 0 ? (
            <EmployeeList>
              {stats.recentHires.map((employee) => (
                <EmployeeItem
                  key={employee.employeeId}
                  onClick={() => navigate(`/hr/employees/${employee.employeeId}`)}
                >
                  <EmployeeName>
                    {employee.firstName} {employee.lastName}
                  </EmployeeName>
                  <EmployeeDate>
                    {employee.hireDate ? new Date(employee.hireDate).toLocaleDateString() : 'N/A'}
                  </EmployeeDate>
                </EmployeeItem>
              ))}
            </EmployeeList>
          ) : (
            <EmptyText>No recent hires</EmptyText>
          )}
        </Widget>

        <Widget>
          <WidgetTitle>Visa Expirations (Next 60 Days)</WidgetTitle>
          {stats.upcomingVisaExpirations && stats.upcomingVisaExpirations.length > 0 ? (
            stats.upcomingVisaExpirations.map((visa) => (
              <VisaItem key={visa.visaId}>
                <AlertTriangle size={15} strokeWidth={1.8} />
                <div>
                  <VisaEmployee>Employee ID: {visa.employeeId}</VisaEmployee>
                  <VisaExpiry>
                    {visa.visaType} expires: {new Date(visa.expiryDate).toLocaleDateString()}
                  </VisaExpiry>
                </div>
              </VisaItem>
            ))
          ) : (
            <EmptyText>No upcoming visa expirations</EmptyText>
          )}
        </Widget>
      </WidgetsRow>

      <WidgetsRow>
        <Widget>
          <WidgetTitle>Department Distribution</WidgetTitle>
          {stats.departmentDistribution && stats.departmentDistribution.length > 0 ? (
            stats.departmentDistribution.map((dept) => (
              <DepartmentItem key={dept.department}>
                <DepartmentName>{dept.department}</DepartmentName>
                <DepartmentCount>{formatNumber(dept.count)}</DepartmentCount>
              </DepartmentItem>
            ))
          ) : (
            <EmptyText>No department data available</EmptyText>
          )}
        </Widget>
      </WidgetsRow>

      <QuickActions>
        <SecondaryActionButton onClick={handleViewEmployeeList}>View All Employees</SecondaryActionButton>
        <PrimaryActionButton onClick={handleAddEmployee}>Add New Employee</PrimaryActionButton>
      </QuickActions>
    </Container>
  );
}
