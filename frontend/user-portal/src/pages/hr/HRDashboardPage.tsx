/**
 * HRDashboardPage Component
 *
 * Overview dashboard with employee statistics and quick insights.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { hrApi } from '../../services/hrService';
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
  color: #212121;
  margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
  font-size: 16px;
  color: #616161;
  margin: 0;
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
`;

const StatCard = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #e0e0e0;
  transition: all 150ms ease-in-out;

  &:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: #616161;
  margin-bottom: 8px;
`;

const StatValue = styled.div`
  font-size: 36px;
  font-weight: 600;
  color: #212121;
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
  background: white;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #e0e0e0;
`;

const WidgetTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #212121;
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
  background: #fafafa;
  border-radius: 8px;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #f5f5f5;
  }
`;

const EmployeeName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: #212121;
`;

const EmployeeDate = styled.span`
  font-size: 12px;
  color: #9e9e9e;
`;

const VisaItem = styled.div`
  padding: 12px;
  background: #fef3c7;
  border: 1px solid #fbbf24;
  border-radius: 8px;
  margin-bottom: 8px;
`;

const VisaEmployee = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: #92400e;
`;

const VisaExpiry = styled.div`
  font-size: 12px;
  color: #92400e;
  margin-top: 4px;
`;

const QuickActions = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;
`;

const ActionButton = styled.button`
  padding: 12px 24px;
  background: #3B82F6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  &:hover {
    background: #1976d2;
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  font-size: 16px;
  color: #9e9e9e;
`;

const ErrorContainer = styled.div`
  background: #FEE2E2;
  border: 1px solid #EF4444;
  color: #991B1B;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
`;

const EmptyText = styled.div`
  text-align: center;
  padding: 24px;
  color: #9e9e9e;
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
          <StatValue>{stats.totalEmployees}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Active</StatLabel>
          <StatValue style={{ color: '#10B981' }}>{stats.activeEmployees}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>On Leave</StatLabel>
          <StatValue style={{ color: '#F59E0B' }}>{stats.onLeaveEmployees}</StatValue>
        </StatCard>

        <StatCard>
          <StatLabel>Average Performance</StatLabel>
          <StatValue>{stats.averagePerformanceRating.toFixed(1)}/5</StatValue>
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

      <QuickActions>
        <ActionButton onClick={handleViewEmployeeList}>View All Employees</ActionButton>
        <ActionButton onClick={handleAddEmployee}>Add New Employee</ActionButton>
      </QuickActions>
    </Container>
  );
}
