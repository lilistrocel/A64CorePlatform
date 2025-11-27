import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Card } from '@a64core/shared';
import { getSpacingCategories, updateSpacingStandards, resetSpacingStandards } from '../../services/farmApi';
import type { SpacingCategoryInfo, SpacingCategory } from '../../types/farm';
import { SPACING_CATEGORY_LABELS, SPACING_CATEGORY_EXAMPLES } from '../../types/farm';

export function Settings() {
  const [spacingCategories, setSpacingCategories] = useState<SpacingCategoryInfo[]>([]);
  const [loadingSpacing, setLoadingSpacing] = useState(false);
  const [spacingError, setSpacingError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editedDensities, setEditedDensities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSpacingCategories();
  }, []);

  const loadSpacingCategories = async () => {
    try {
      setLoadingSpacing(true);
      setSpacingError(null);
      const response = await getSpacingCategories();
      setSpacingCategories(response.categories);
      setLastUpdated(response.lastUpdated);
      setUpdatedBy(response.updatedBy);
      // Initialize edited densities
      const densities: Record<string, number> = {};
      response.categories.forEach((cat: SpacingCategoryInfo) => {
        densities[cat.value] = cat.currentDensity;
      });
      setEditedDensities(densities);
    } catch (error) {
      console.error('Error loading spacing categories:', error);
      setSpacingError('Failed to load spacing standards');
    } finally {
      setLoadingSpacing(false);
    }
  };

  const handleEditClick = () => {
    setIsEditing(true);
    setSuccessMessage(null);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    // Reset to current values
    const densities: Record<string, number> = {};
    spacingCategories.forEach((cat) => {
      densities[cat.value] = cat.currentDensity;
    });
    setEditedDensities(densities);
  };

  const handleDensityChange = (category: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setEditedDensities((prev) => ({
      ...prev,
      [category]: numValue,
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSpacingError(null);
      await updateSpacingStandards(editedDensities as Record<SpacingCategory, number>);
      setSuccessMessage('Spacing standards updated successfully!');
      setIsEditing(false);
      // Reload to get fresh data
      await loadSpacingCategories();
    } catch (error: any) {
      console.error('Error saving spacing standards:', error);
      const message = error.response?.data?.detail || 'Failed to save spacing standards. Make sure you have admin privileges.';
      setSpacingError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to reset all spacing standards to their default values?')) {
      return;
    }

    try {
      setSaving(true);
      setSpacingError(null);
      await resetSpacingStandards();
      setSuccessMessage('Spacing standards reset to defaults!');
      setIsEditing(false);
      // Reload to get fresh data
      await loadSpacingCategories();
    } catch (error: any) {
      console.error('Error resetting spacing standards:', error);
      const message = error.response?.data?.detail || 'Failed to reset spacing standards. Make sure you have admin privileges.';
      setSpacingError(message);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = () => {
    return spacingCategories.some(
      (cat) => editedDensities[cat.value] !== cat.currentDensity
    );
  };

  const hasModifiedValues = () => {
    return spacingCategories.some((cat) => cat.isModified);
  };

  return (
    <SettingsContainer>
      <Title>Settings</Title>

      <Card title="Farm Spacing Standards">
        <SettingsContent>
          <SpacingIntro>
            Plant spacing standards determine how many plants fit in a given area.
            These values are used for automatic plant count calculations when planting.
          </SpacingIntro>

          {loadingSpacing && <LoadingText>Loading spacing standards...</LoadingText>}
          {spacingError && <ErrorText>{spacingError}</ErrorText>}
          {successMessage && <SuccessText>{successMessage}</SuccessText>}

          {!loadingSpacing && !spacingError && (
            <>
              <SpacingTable>
                <thead>
                  <tr>
                    <TableHeader>Category</TableHeader>
                    <TableHeader>Examples</TableHeader>
                    <TableHeader style={{ textAlign: 'right' }}>Plants per 100m²</TableHeader>
                    <TableHeader style={{ textAlign: 'center' }}>Status</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  {spacingCategories.map((category) => (
                    <TableRow key={category.value}>
                      <TableCell>
                        <CategoryName>{SPACING_CATEGORY_LABELS[category.value] || category.name}</CategoryName>
                        <CategoryCode>{category.value.toUpperCase()}</CategoryCode>
                      </TableCell>
                      <TableCell>
                        <ExampleText>{SPACING_CATEGORY_EXAMPLES[category.value] || '-'}</ExampleText>
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        {isEditing ? (
                          <DensityInput
                            type="number"
                            min="1"
                            max="10000"
                            value={editedDensities[category.value] || ''}
                            onChange={(e) => handleDensityChange(category.value, e.target.value)}
                            disabled={saving}
                          />
                        ) : (
                          <>
                            <DensityValue>{category.currentDensity}</DensityValue>
                            {category.isModified && (
                              <DefaultValue>default: {category.defaultDensity}</DefaultValue>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell style={{ textAlign: 'center' }}>
                        {isEditing ? (
                          editedDensities[category.value] !== category.defaultDensity ? (
                            <ModifiedBadge>Modified</ModifiedBadge>
                          ) : (
                            <DefaultBadge>Default</DefaultBadge>
                          )
                        ) : (
                          category.isModified ? (
                            <ModifiedBadge>Modified</ModifiedBadge>
                          ) : (
                            <DefaultBadge>Default</DefaultBadge>
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </SpacingTable>

              <ButtonRow>
                {isEditing ? (
                  <>
                    <SecondaryButton onClick={handleCancelEdit} disabled={saving}>
                      Cancel
                    </SecondaryButton>
                    <PrimaryButton onClick={handleSave} disabled={saving || !hasChanges()}>
                      {saving ? 'Saving...' : 'Save Changes'}
                    </PrimaryButton>
                  </>
                ) : (
                  <>
                    {hasModifiedValues() && (
                      <DangerButton onClick={handleReset} disabled={saving}>
                        Reset to Defaults
                      </DangerButton>
                    )}
                    <PrimaryButton onClick={handleEditClick}>
                      Edit Densities
                    </PrimaryButton>
                  </>
                )}
              </ButtonRow>

              {lastUpdated && (
                <LastUpdatedInfo>
                  Last updated: {new Date(lastUpdated).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {updatedBy && ` by ${updatedBy}`}
                </LastUpdatedInfo>
              )}

              <SpacingNote>
                Admin privileges required to modify spacing standards.
                Higher values = more plants per 100m² (denser planting).
              </SpacingNote>
            </>
          )}
        </SettingsContent>
      </Card>

      <Card title="General Settings">
        <SettingsContent>
          <SettingItem>
            <SettingLabel>Theme</SettingLabel>
            <SettingValue>Light Mode</SettingValue>
            <SettingDescription>Choose your preferred theme</SettingDescription>
          </SettingItem>

          <SettingItem>
            <SettingLabel>Language</SettingLabel>
            <SettingValue>English (US)</SettingValue>
            <SettingDescription>Select your language preference</SettingDescription>
          </SettingItem>

          <SettingItem>
            <SettingLabel>Timezone</SettingLabel>
            <SettingValue>UTC+00:00</SettingValue>
            <SettingDescription>Set your local timezone</SettingDescription>
          </SettingItem>
        </SettingsContent>
      </Card>

      <Card title="Notifications">
        <SettingsContent>
          <SettingItem>
            <SettingLabel>Email Notifications</SettingLabel>
            <SettingValue>Enabled</SettingValue>
            <SettingDescription>Receive email updates and alerts</SettingDescription>
          </SettingItem>

          <SettingItem>
            <SettingLabel>Push Notifications</SettingLabel>
            <SettingValue>Disabled</SettingValue>
            <SettingDescription>Get push notifications in your browser</SettingDescription>
          </SettingItem>
        </SettingsContent>
      </Card>

      <Card title="Security">
        <SettingsContent>
          <SettingItem>
            <SettingLabel>Two-Factor Authentication</SettingLabel>
            <SettingValue>Not Configured</SettingValue>
            <SettingDescription>Add an extra layer of security to your account</SettingDescription>
          </SettingItem>

          <SettingItem>
            <SettingLabel>Active Sessions</SettingLabel>
            <SettingValue>1 Session</SettingValue>
            <SettingDescription>Manage your active login sessions</SettingDescription>
          </SettingItem>
        </SettingsContent>
      </Card>
    </SettingsContainer>
  );
}

const SettingsContainer = styled.div`
  padding: ${({ theme }: any) => theme.spacing.md};
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }: any) => theme.spacing.md};
  width: 100%;

  @media (min-width: 768px) {
    padding: ${({ theme }: any) => theme.spacing.lg};
    gap: ${({ theme }: any) => theme.spacing.lg};
  }

  @media (min-width: 1024px) {
    padding: ${({ theme }: any) => theme.spacing.xl};
    max-width: 1200px;
  }
`;

const Title = styled.h1`
  font-size: ${({ theme }: any) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.bold};
  color: ${({ theme }: any) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }: any) => theme.spacing.md} 0;

  @media (min-width: 768px) {
    font-size: ${({ theme }: any) => theme.typography.fontSize['3xl']};
    margin-bottom: ${({ theme }: any) => theme.spacing.lg};
  }
`;

const SettingsContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }: any) => theme.spacing.lg};

  @media (min-width: 768px) {
    gap: ${({ theme }: any) => theme.spacing.xl};
  }
`;

const SettingItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }: any) => theme.spacing.xs};
  padding-bottom: ${({ theme }: any) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }: any) => theme.colors.neutral[200]};

  @media (min-width: 768px) {
    padding-bottom: ${({ theme }: any) => theme.spacing.lg};
  }

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
`;

const SettingLabel = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.semibold};
  color: ${({ theme }: any) => theme.colors.textPrimary};

  @media (min-width: 768px) {
    font-size: ${({ theme }: any) => theme.typography.fontSize.base};
  }
`;

const SettingValue = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
  color: ${({ theme }: any) => theme.colors.primary[500]};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.medium};

  @media (min-width: 768px) {
    font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  }
`;

const SettingDescription = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
  color: ${({ theme }: any) => theme.colors.textSecondary};

  @media (min-width: 768px) {
    font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  }
`;

// Spacing Standards styled components
const SpacingIntro = styled.p`
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  color: ${({ theme }: any) => theme.colors.textSecondary};
  margin: 0 0 ${({ theme }: any) => theme.spacing.lg} 0;
  line-height: 1.6;
`;

const SpacingTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-bottom: ${({ theme }: any) => theme.spacing.md};
`;

const TableHeader = styled.th`
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.semibold};
  color: ${({ theme }: any) => theme.colors.textSecondary};
  text-align: left;
  padding: ${({ theme }: any) => theme.spacing.sm} ${({ theme }: any) => theme.spacing.md};
  border-bottom: 2px solid ${({ theme }: any) => theme.colors.neutral[200]};
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const TableRow = styled.tr`
  &:hover {
    background: ${({ theme }: any) => theme.colors.neutral[50]};
  }
`;

const TableCell = styled.td`
  padding: ${({ theme }: any) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }: any) => theme.colors.neutral[200]};
  vertical-align: middle;
`;

const CategoryName = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.semibold};
  color: ${({ theme }: any) => theme.colors.textPrimary};
`;

const CategoryCode = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
  color: ${({ theme }: any) => theme.colors.textSecondary};
  font-family: monospace;
`;

const ExampleText = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  color: ${({ theme }: any) => theme.colors.textSecondary};
`;

const DensityValue = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.lg};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.bold};
  color: ${({ theme }: any) => theme.colors.primary[600]};
`;

const DefaultValue = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
  color: ${({ theme }: any) => theme.colors.textSecondary};
`;

const ModifiedBadge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.medium};
  color: #b45309;
  background: #fef3c7;
  border-radius: 4px;
`;

const DefaultBadge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.medium};
  color: #059669;
  background: #d1fae5;
  border-radius: 4px;
`;

const LastUpdatedInfo = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
  color: ${({ theme }: any) => theme.colors.textSecondary};
  margin-top: ${({ theme }: any) => theme.spacing.md};
`;

const SpacingNote = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
  color: ${({ theme }: any) => theme.colors.textSecondary};
  padding: ${({ theme }: any) => theme.spacing.md};
  background: ${({ theme }: any) => theme.colors.neutral[100]};
  border-radius: 6px;
  margin-top: ${({ theme }: any) => theme.spacing.md};
`;

const LoadingText = styled.div`
  text-align: center;
  padding: ${({ theme }: any) => theme.spacing.xl};
  color: ${({ theme }: any) => theme.colors.textSecondary};
`;

const ErrorText = styled.div`
  color: ${({ theme }: any) => theme.colors.error[500]};
  padding: ${({ theme }: any) => theme.spacing.md};
  background: ${({ theme }: any) => theme.colors.error[50]};
  border-radius: 6px;
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
`;

const SuccessText = styled.div`
  color: ${({ theme }: any) => theme.colors.success[700]};
  padding: ${({ theme }: any) => theme.spacing.md};
  background: ${({ theme }: any) => theme.colors.success[50]};
  border-radius: 6px;
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
`;

const DensityInput = styled.input`
  width: 80px;
  padding: ${({ theme }: any) => theme.spacing.sm} ${({ theme }: any) => theme.spacing.md};
  font-size: ${({ theme }: any) => theme.typography.fontSize.base};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.semibold};
  text-align: right;
  border: 2px solid ${({ theme }: any) => theme.colors.primary[300]};
  border-radius: 6px;
  color: ${({ theme }: any) => theme.colors.primary[600]};
  background: ${({ theme }: any) => theme.colors.white};
  transition: border-color 0.2s, box-shadow 0.2s;

  &:focus {
    outline: none;
    border-color: ${({ theme }: any) => theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${({ theme }: any) => theme.colors.primary[100]};
  }

  &:disabled {
    background: ${({ theme }: any) => theme.colors.neutral[100]};
    cursor: not-allowed;
  }

  /* Hide spinner buttons */
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  -moz-appearance: textfield;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: ${({ theme }: any) => theme.spacing.md};
  justify-content: flex-end;
  margin-top: ${({ theme }: any) => theme.spacing.lg};
  padding-top: ${({ theme }: any) => theme.spacing.lg};
  border-top: 1px solid ${({ theme }: any) => theme.colors.neutral[200]};
`;

const BaseButton = styled.button`
  padding: ${({ theme }: any) => theme.spacing.sm} ${({ theme }: any) => theme.spacing.lg};
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.semibold};
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PrimaryButton = styled(BaseButton)`
  background: ${({ theme }: any) => theme.colors.primary[500]};
  color: white;
  border: none;

  &:hover:not(:disabled) {
    background: ${({ theme }: any) => theme.colors.primary[600]};
  }
`;

const SecondaryButton = styled(BaseButton)`
  background: white;
  color: ${({ theme }: any) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }: any) => theme.colors.neutral[300]};

  &:hover:not(:disabled) {
    background: ${({ theme }: any) => theme.colors.neutral[50]};
    border-color: ${({ theme }: any) => theme.colors.neutral[400]};
  }
`;

const DangerButton = styled(BaseButton)`
  background: white;
  color: ${({ theme }: any) => theme.colors.error[600]};
  border: 1px solid ${({ theme }: any) => theme.colors.error[300]};

  &:hover:not(:disabled) {
    background: ${({ theme }: any) => theme.colors.error[50]};
    border-color: ${({ theme }: any) => theme.colors.error[500]};
  }
`;
