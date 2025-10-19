import styled from 'styled-components';
import { Card } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';

export function Profile() {
  const { user } = useAuthStore();

  return (
    <ProfileContainer>
      <Title>Profile</Title>

      <Card title="Personal Information">
        <InfoGrid>
          <InfoItem>
            <Label>First Name</Label>
            <Value>{user?.firstName || 'N/A'}</Value>
          </InfoItem>

          <InfoItem>
            <Label>Last Name</Label>
            <Value>{user?.lastName || 'N/A'}</Value>
          </InfoItem>

          <InfoItem>
            <Label>Email</Label>
            <Value>{user?.email || 'N/A'}</Value>
          </InfoItem>

          <InfoItem>
            <Label>Role</Label>
            <Value style={{ textTransform: 'capitalize' }}>{user?.role || 'N/A'}</Value>
          </InfoItem>
        </InfoGrid>
      </Card>

      <Card title="Permissions">
        <PermissionsList>
          {user?.permissions && user.permissions.length > 0 ? (
            user.permissions.map((permission, index) => (
              <PermissionItem key={index}>{permission}</PermissionItem>
            ))
          ) : (
            <NoPermissions>No permissions assigned</NoPermissions>
          )}
        </PermissionsList>
      </Card>
    </ProfileContainer>
  );
}

const ProfileContainer = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  width: 100%;

  @media (min-width: 768px) {
    padding: ${({ theme }) => theme.spacing.lg};
    gap: ${({ theme }) => theme.spacing.lg};
  }

  @media (min-width: 1024px) {
    padding: ${({ theme }) => theme.spacing.xl};
  }

  @media (min-width: 1600px) {
    max-width: 1400px;
  }
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.md} 0;

  @media (min-width: 768px) {
    font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
    margin-bottom: ${({ theme }) => theme.spacing.lg};
  }
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.lg};

  @media (min-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
    gap: ${({ theme }) => theme.spacing.xl};
  }

  @media (min-width: 1024px) {
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  }
`;

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Label = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Value = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.lg};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const PermissionsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const PermissionItem = styled.div`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => `${theme.colors.primary[500]}15`};
  border: 1px solid ${({ theme }) => theme.colors.primary[500]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.primary[500]};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
`;

const NoPermissions = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-style: italic;
`;
