/**
 * HRDashboardPage Component
 *
 * Overview dashboard with employee statistics and quick insights.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { hrApi } from '../../services/hrService';
import { formatNumber } from '../../utils/formatNumber';
import type { HRDashboardStats } from '../../types/hr';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const Header = styled.div`
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
`;

const StatCard = styled.div`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 12px;
  padding: 24px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  transition: all 150ms ease-in-out;

  &:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-bottom: 8px;
`;

const StatValue = styled.div`
  font-size: 36px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
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
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 12px;
  padding: 24px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
`;

const WidgetTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 16px 0;
`;

const EmployeeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const EmployeeItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-radius: 8px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
  }
`;

const EmployeeName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const EmployeeDate = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const VisaItem = styled.div`
  padding: 12px;
  background: ${({ theme }) => theme.colors.status.warning};
  border: 1px solid ${({ theme }) => theme.colors.status.warning};
  border-radius: 8px;
  margin-bottom: 8px;
`;

const VisaEmployee = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: #B8842A;
`;

const VisaExpiry = styled.div`
  font-size: 12px;
  color: #B8842A;
  margin-top: 4px;
`;

const QuickActions = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;
`;

const ActionButton = styled.button`
  padding: 12px 24px;
  background: #0F6E56;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #0F6E56;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 16px;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const ErrorContainer = styled.div`
  background: ${({ theme }) => theme.colors.status.danger};
  border: 1px solid #9E2A2A;
  color: #9E2A2A;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
`;

const EmptyText = styled.div`
  text-align: center;
  padding: 24px;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const DepartmentItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 8px;
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const DepartmentName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const DepartmentCount = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #0F6E56;
  background: ${({ theme }) => theme.colors.surface.sunken};
  padding: 4px 12px;
  border-radius: 16px;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export function HRDashboardPage() {
  const navigate = useNavigate();
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
      <Header>
        <Title>Human Resources</Title>
        <Subtitle>Employee management and HR overview</Subtitle>
      </Header>

      <StatsGrid>
        <StatCard>
          <StatLabel>Total Employees</StatLabel>
          <StatValue>{formatNumber(stats.totalEmployees)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Active</StatLabel>
          <StatValue style={{ color: '#0F6E56' }}>{formatNumber(stats.activeEmployees)}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>On Leave</StatLabel>
          <StatValue style={{ color: '#B8842A' }}>{formatNumber(stats.onLeaveEmployees)}</StatValue>
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
                <VisaEmployee>Employee ID: {visa.employeeId}</VisaEmployee>
                <VisaExpiry>
                  {visa.visaType} expires: {new Date(visa.expiryDate).toLocaleDateString()}
                </VisaExpiry>
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
        <ActionButton onClick={handleViewEmployeeList}>View All Employees</ActionButton>
        <ActionButton onClick={handleAddEmployee}>Add New Employee</ActionButton>
      </QuickActions>
    </Container>
  );
}
