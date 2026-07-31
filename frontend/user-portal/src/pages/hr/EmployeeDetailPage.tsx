/**
 * EmployeeDetailPage Component
 *
 * Employee detail view with tabbed interface for Overview, Contracts, Visas, Insurance, and Performance.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { EmployeeForm } from '../../components/hr/EmployeeForm';
import { ContractTab } from '../../components/hr/ContractTab';
import { VisaTab } from '../../components/hr/VisaTab';
import { InsuranceTab } from '../../components/hr/InsuranceTab';
import { PerformanceTab } from '../../components/hr/PerformanceTab';
import { hrApi, getEmployeeFullName, getEmployeeStatusLabel, getEmployeeStatusColor } from '../../services/hrService';
import { showSuccessToast, showErrorToast } from '../../stores/toast.store';
import { Breadcrumb, glassPanel, monoLabel } from '@a64core/shared';
import type { BreadcrumbItem } from '@a64core/shared';
import type { Employee, EmployeeUpdate } from '../../types/hr';

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 32px;
  max-width: 1200px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 12px;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'danger' }>`
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 150ms ease-in-out;

  ${({ $variant, theme }) => {
    if ($variant === 'danger') {
      return `
        background: transparent;
        color: ${theme.colors.error};
        border: 1px solid ${theme.colors.error};
        &:hover {
          background: ${theme.colors.errorBg};
        }
      `;
    }
    return `
      background: transparent;
      color: ${theme.colors.celeste};
      border: 1px solid ${theme.colors.glass.border};
      &:hover {
        background: rgba(180, 200, 220, 0.07);
        color: ${theme.colors.textPrimary};
      }
    `;
  }}

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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

const DetailsCard = styled.div`
  ${glassPanel}
  padding: 32px;
  border-radius: 18px;
`;

const EmployeeHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const EmployeeInfo = styled.div`
  flex: 1;
`;

const EmployeeName = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 8px 0;
`;

const EmployeeCode = styled.div`
  ${monoLabel}
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.muted};
`;

/* Status colour comes from hrService.getEmployeeStatusColor(), already
   routed onto colors.phase.* (spec §5.2) — applies the §4 badge visual. */
const StatusBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  border-radius: 99px;
  ${monoLabel}
  font-size: 0.72rem;
  font-weight: 700;
  background: ${({ $color }) => `${$color}29`};
  color: ${({ $color }) => $color};
  border: 1px solid ${({ $color }) => `${$color}73`};

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px currentColor;
  }
`;

const TabsContainer = styled.div`
  display: flex;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  margin-bottom: 24px;
  overflow-x: auto;
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 12px 24px;
  background: transparent;
  color: ${({ $active, theme }) => ($active ? theme.colors.celeste : theme.colors.muted)};
  border: none;
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.celeste : 'transparent')};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-in-out;
  margin-bottom: -1px;
  white-space: nowrap;

  &:hover {
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const TabContent = styled.div`
  min-height: 300px;
`;

const Section = styled.div`
  margin-bottom: 32px;
  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 16px 0;
`;

const DetailGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const DetailItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const DetailLabel = styled.span`
  ${monoLabel}
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const DetailValue = styled.span`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const EmptyText = styled.span`
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
`;

const Metadata = styled.div`
  ${monoLabel}
  display: flex;
  gap: 24px;
  padding-top: 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  font-size: 0.62rem;
  color: ${({ theme }) => theme.colors.muted};
`;

// ============================================================================
// COMPONENT
// ============================================================================

type TabType = 'overview' | 'contracts' | 'visas' | 'insurance' | 'performance';

export function EmployeeDetailPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    if (employeeId === 'new') {
      setIsNew(true);
      setEditMode(true);
      setLoading(false);
      setEmployee(null);
    } else if (employeeId) {
      // Reset states when navigating to an existing employee (e.g., after creation)
      setIsNew(false);
      setEditMode(false);
      loadEmployee();
    }
  }, [employeeId]);

  const loadEmployee = async () => {
    if (!employeeId || employeeId === 'new') return;

    setLoading(true);
    setError(null);
    try {
      const data = await hrApi.getEmployee(employeeId);
      setEmployee(data);
    } catch (err: any) {
      console.error('Failed to load employee:', err);
      setError(err.response?.data?.message || 'Failed to load employee');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/hr/employees');
  };

  const handleEdit = () => {
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    if (isNew) {
      navigate('/hr/employees');
    } else {
      setEditMode(false);
    }
  };

  const handleSave = async (data: EmployeeUpdate) => {
    try {
      if (isNew) {
        const newEmployee = await hrApi.createEmployee(data);
        showSuccessToast('Employee created successfully');
        navigate(`/hr/employees/${newEmployee.employeeId}`);
      } else if (employeeId) {
        const updatedEmployee = await hrApi.updateEmployee(employeeId, data);
        setEmployee(updatedEmployee);
        setEditMode(false);
        showSuccessToast('Employee updated successfully');
      }
    } catch (err: any) {
      console.error('Failed to save employee:', err);
      showErrorToast('Failed to save employee. Please try again.');
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!employeeId || employeeId === 'new') return;

    if (window.confirm(`Are you sure you want to delete "${employee ? getEmployeeFullName(employee) : 'this employee'}"?`)) {
      try {
        await hrApi.deleteEmployee(employeeId);
        showSuccessToast('Employee deleted successfully');
        navigate('/hr/employees');
      } catch (err: any) {
        console.error('Failed to delete employee:', err);
        showErrorToast(err.response?.data?.message || 'Failed to delete employee');
      }
    }
  };

  if (loading) {
    return (
      <Container>
        <LoadingContainer>Loading employee...</LoadingContainer>
      </Container>
    );
  }

  // Breadcrumb items for navigation.
  // Note: the shared Breadcrumb component's `icon` prop is typed `string` and
  // renders it as raw text (not a lucide component) — it predates the icon
  // system and lives outside this shard (frontend/shared, phase-2 owned).
  // Rather than render emoji glyphs through it, the icon prop is simply
  // omitted here (it's optional) — see report for the mixin-gap note.
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'HR', path: '/hr' },
    { label: 'Employees', path: '/hr/employees' },
    { label: isNew ? 'New Employee' : employee ? getEmployeeFullName(employee) : 'Employee' },
  ];

  if (error) {
    return (
      <Container>
        <Breadcrumb items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'HR', path: '/hr' },
          { label: 'Employees', path: '/hr/employees' },
          { label: 'Error' },
        ]} />
        <ErrorContainer>{error}</ErrorContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Breadcrumb items={breadcrumbItems} />
        {!isNew && !editMode && activeTab === 'overview' && (
          <HeaderActions>
            <ActionButton onClick={handleEdit}>Edit</ActionButton>
            <ActionButton $variant="danger" onClick={handleDelete}>
              Delete
            </ActionButton>
          </HeaderActions>
        )}
      </Header>

      <DetailsCard>
        {editMode && activeTab === 'overview' ? (
          <EmployeeForm
            employee={employee || undefined}
            onSubmit={handleSave}
            onCancel={handleCancelEdit}
            isEdit={!isNew}
          />
        ) : employee ? (
          <>
            <EmployeeHeader>
              <EmployeeInfo>
                <EmployeeName>{getEmployeeFullName(employee)}</EmployeeName>
                <EmployeeCode>{employee.employeeCode}</EmployeeCode>
              </EmployeeInfo>
              <StatusBadge $color={getEmployeeStatusColor(employee.status)}>
                {getEmployeeStatusLabel(employee.status)}
              </StatusBadge>
            </EmployeeHeader>

            <TabsContainer>
              <Tab $active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
                Overview
              </Tab>
              <Tab $active={activeTab === 'contracts'} onClick={() => setActiveTab('contracts')}>
                Contracts
              </Tab>
              <Tab $active={activeTab === 'visas'} onClick={() => setActiveTab('visas')}>
                Visas
              </Tab>
              <Tab $active={activeTab === 'insurance'} onClick={() => setActiveTab('insurance')}>
                Insurance
              </Tab>
              <Tab $active={activeTab === 'performance'} onClick={() => setActiveTab('performance')}>
                Performance
              </Tab>
            </TabsContainer>

            <TabContent>
              {activeTab === 'overview' && (
                <>
                  <Section>
                    <SectionTitle>Contact Information</SectionTitle>
                    <DetailGrid>
                      <DetailItem>
                        <DetailLabel>Email</DetailLabel>
                        <DetailValue>{employee.email}</DetailValue>
                      </DetailItem>
                      <DetailItem>
                        <DetailLabel>Phone</DetailLabel>
                        <DetailValue>{employee.phone || <EmptyText>Not provided</EmptyText>}</DetailValue>
                      </DetailItem>
                      <DetailItem>
                        <DetailLabel>Department</DetailLabel>
                        <DetailValue>{employee.department || <EmptyText>Not provided</EmptyText>}</DetailValue>
                      </DetailItem>
                      <DetailItem>
                        <DetailLabel>Position</DetailLabel>
                        <DetailValue>{employee.position || <EmptyText>Not provided</EmptyText>}</DetailValue>
                      </DetailItem>
                      <DetailItem>
                        <DetailLabel>Hire Date</DetailLabel>
                        <DetailValue>
                          {employee.hireDate ? new Date(employee.hireDate).toLocaleDateString() : <EmptyText>Not provided</EmptyText>}
                        </DetailValue>
                      </DetailItem>
                    </DetailGrid>
                  </Section>

                  {employee.emergencyContact && (employee.emergencyContact.name || employee.emergencyContact.phone) && (
                    <Section>
                      <SectionTitle>Emergency Contact</SectionTitle>
                      <DetailGrid>
                        <DetailItem>
                          <DetailLabel>Name</DetailLabel>
                          <DetailValue>{employee.emergencyContact.name || <EmptyText>Not provided</EmptyText>}</DetailValue>
                        </DetailItem>
                        <DetailItem>
                          <DetailLabel>Phone</DetailLabel>
                          <DetailValue>{employee.emergencyContact.phone || <EmptyText>Not provided</EmptyText>}</DetailValue>
                        </DetailItem>
                        <DetailItem>
                          <DetailLabel>Relationship</DetailLabel>
                          <DetailValue>{employee.emergencyContact.relationship || <EmptyText>Not provided</EmptyText>}</DetailValue>
                        </DetailItem>
                      </DetailGrid>
                    </Section>
                  )}

                  <Metadata>
                    <span>Created: {new Date(employee.createdAt).toLocaleDateString()}</span>
                    <span>Updated: {new Date(employee.updatedAt).toLocaleDateString()}</span>
                    <span>Created by: {employee.createdBy}</span>
                  </Metadata>
                </>
              )}

              {activeTab === 'contracts' && <ContractTab employeeId={employee.employeeId} />}
              {activeTab === 'visas' && <VisaTab employeeId={employee.employeeId} />}
              {activeTab === 'insurance' && <InsuranceTab employeeId={employee.employeeId} />}
              {activeTab === 'performance' && <PerformanceTab employeeId={employee.employeeId} />}
            </TabContent>
          </>
        ) : null}
      </DetailsCard>
    </Container>
  );
}
