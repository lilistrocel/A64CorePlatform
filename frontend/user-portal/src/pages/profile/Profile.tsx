import styled from 'styled-components';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Button, Input, PageHeader } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { authService } from '../../services/auth.service';
import { useToastStore } from '../../stores/toast.store';

export function Profile() {
  const { user, loadUser } = useAuthStore();
  const { addToast } = useToastStore();
  const [searchParams] = useSearchParams();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
  });

  // Arriving from AutoNameBanner's "Set your real name" link (?focus=name):
  // jump straight into edit mode and focus First Name, so the fields the
  // banner is nudging toward don't require hunting for "Edit Profile" first.
  // Guarded by a ref (not just the query param) so a later loadUser()
  // refresh — e.g. right after Save — doesn't re-open edit mode; this should
  // fire exactly once, on arrival.
  const autoOpenedForNameFocus = useRef(false);
  const firstNameInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusName = searchParams.get('focus') === 'name';

  useEffect(() => {
    if (shouldFocusName && user && !autoOpenedForNameFocus.current) {
      autoOpenedForNameFocus.current = true;
      // formData itself is kept in sync by the "Sync form data" effect
      // below, which already reruns on every `user` change — no need to
      // duplicate that assignment here.
      setIsEditing(true);
    }
  }, [shouldFocusName, user]);

  useEffect(() => {
    if (shouldFocusName && isEditing) {
      firstNameInputRef.current?.focus();
    }
  }, [shouldFocusName, isEditing]);

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
      <PageHeader breadcrumb="Account · Live" title="Profile" />

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
                ref={firstNameInputRef}
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
  background: ${({ theme }) => theme.colors.infoBg};
  border: 1px solid ${({ theme }) => theme.colors.bright.lapis}66;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.bright.lapis};
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
  background: ${({ theme }) => theme.colors.glass.base};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.celeste};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const NoPermissions = styled.div`
  color: ${({ theme }) => theme.colors.muted};
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
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSize.base};
  color: ${({ theme }) => theme.colors.muted};
  background: ${({ theme }) => theme.colors.glass.base};
`;

const HelperText = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.muted};
`;
