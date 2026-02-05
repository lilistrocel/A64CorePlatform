import styled from 'styled-components';
import { useState, useEffect } from 'react';
import { Card, Button, Input } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { authService } from '../../services/auth.service';
import { useToastStore } from '../../stores/toast.store';

export function Profile() {
  const { user, loadUser } = useAuthStore();
  const { addToast } = useToastStore();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
  });

  // Sync form data when user changes or edit mode is entered
  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: (user as any).phone || '',
      });
    }
  }, [user]);

  const handleEdit = () => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: (user as any).phone || '',
      });
    }
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: (user as any).phone || '',
      });
    }
  };

  const handleSave = async () => {
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      addToast('error', 'First name and last name are required');
      return;
    }

    setIsSaving(true);
    try {
      const updatePayload: Record<string, string> = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
      };
      if (formData.phone.trim()) {
        updatePayload.phone = formData.phone.trim();
      }

      await authService.updateProfile(updatePayload);
      // Reload user data from the server to update the store
      await loadUser();
      setIsEditing(false);
      addToast('success', 'Profile updated successfully');
    } catch (error: any) {
      const msg = error.response?.data?.message || error.response?.data?.detail || 'Failed to update profile';
      addToast('error', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const formatRole = (role: string) => {
    return role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <ProfileContainer>
      <Title>Profile</Title>

      <Card
        title="Personal Information"
        actions={
          !isEditing ? (
            <Button variant="outline" size="small" onClick={handleEdit}>
              Edit Profile
            </Button>
          ) : undefined
        }
      >
        {isEditing ? (
          <EditForm>
            <FormGrid>
              <Input
                label="First Name"
                value={formData.firstName}
                onChange={handleChange('firstName')}
                fullWidth
                placeholder="Enter first name"
              />
              <Input
                label="Last Name"
                value={formData.lastName}
                onChange={handleChange('lastName')}
                fullWidth
                placeholder="Enter last name"
              />
              <Input
                label="Phone"
                value={formData.phone}
                onChange={handleChange('phone')}
                fullWidth
                placeholder="Enter phone number"
              />
              <InputWrapper>
                <DisabledLabel>Email</DisabledLabel>
                <DisabledValue>{user?.email || 'N/A'}</DisabledValue>
                <HelperText>Email cannot be changed</HelperText>
              </InputWrapper>
            </FormGrid>
            <ButtonRow>
              <Button variant="primary" size="small" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" size="small" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
            </ButtonRow>
          </EditForm>
        ) : (
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
              <RoleBadge>{user?.role ? formatRole(user.role) : 'N/A'}</RoleBadge>
            </InfoItem>
          </InfoGrid>
        )}
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

const RoleBadge = styled.div`
  display: inline-flex;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => `${theme.colors.primary[500]}15`};
  border: 1px solid ${({ theme }) => theme.colors.primary[500]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.primary[500]};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  width: fit-content;
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

const EditForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${({ theme }) => theme.spacing.md};

  @media (min-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const ButtonRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  padding-top: ${({ theme }) => theme.spacing.sm};
`;

const InputWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const DisabledLabel = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const DisabledValue = styled.div`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[100]};
  opacity: 0.6;
`;

const HelperText = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textSecondary};
`;
