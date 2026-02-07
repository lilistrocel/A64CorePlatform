import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Card } from '@a64core/shared';
import { getSpacingCategories, updateSpacingStandards, resetSpacingStandards } from '../../services/farmApi';
import type { SpacingCategoryInfo, SpacingCategory } from '../../types/farm';
import { SPACING_CATEGORY_LABELS, SPACING_CATEGORY_EXAMPLES } from '../../types/farm';
import { useAuthStore } from '../../stores/auth.store';
import { authService, type MfaStatusResponse } from '../../services/auth.service';
import { useToastStore } from '../../stores/toast.store';

// Common timezone options (IANA timezone names)
const TIMEZONE_OPTIONS = [
  { value: 'Asia/Dubai', label: 'Asia/Dubai (UTC+04:00)' },
  { value: 'Asia/Abu_Dhabi', label: 'Asia/Abu Dhabi (UTC+04:00)' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (UTC+03:00)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (UTC+05:30)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+08:00)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+09:00)' },
  { value: 'Europe/London', label: 'Europe/London (UTC+00:00)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (UTC+01:00)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (UTC+01:00)' },
  { value: 'America/New_York', label: 'America/New York (UTC-05:00)' },
  { value: 'America/Chicago', label: 'America/Chicago (UTC-06:00)' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles (UTC-08:00)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (UTC+12:00)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (UTC+10:00)' },
  { value: 'UTC', label: 'UTC (UTC+00:00)' },
];

// Common locale options
const LOCALE_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-AE', label: 'English (UAE)' },
  { value: 'ar-AE', label: 'Arabic (UAE)' },
  { value: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
  { value: 'hi-IN', label: 'Hindi (India)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'de-DE', label: 'German (Germany)' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'ja-JP', label: 'Japanese (Japan)' },
];

export function Settings() {
  const { user, loadUser } = useAuthStore();
  const { addToast } = useToastStore();

  const [spacingCategories, setSpacingCategories] = useState<SpacingCategoryInfo[]>([]);
  const [loadingSpacing, setLoadingSpacing] = useState(false);
  const [spacingError, setSpacingError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);

  // Edit mode state for spacing
  const [isEditing, setIsEditing] = useState(false);
  const [editedDensities, setEditedDensities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // User preferences state
  const [selectedTimezone, setSelectedTimezone] = useState<string>('');
  const [selectedLocale, setSelectedLocale] = useState<string>('');
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsChanged, setPrefsChanged] = useState(false);

  // MFA status state
  const [mfaStatus, setMfaStatus] = useState<MfaStatusResponse | null>(null);
  const [loadingMfa, setLoadingMfa] = useState(false);

  // MFA regenerate backup codes modal state
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerateTotpCode, setRegenerateTotpCode] = useState('');
  const [regeneratePassword, setRegeneratePassword] = useState('');
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null);
  const [backupCodesCopied, setBackupCodesCopied] = useState(false);

  // Initialize preferences from user data
  useEffect(() => {
    if (user) {
      const tz = (user as any).timezone || 'Asia/Dubai';
      const loc = (user as any).locale || 'en-US';
      setSelectedTimezone(tz);
      setSelectedLocale(loc);
    }
  }, [user]);

  // Track changes
  useEffect(() => {
    if (user) {
      const origTz = (user as any).timezone || 'Asia/Dubai';
      const origLoc = (user as any).locale || 'en-US';
      setPrefsChanged(selectedTimezone !== origTz || selectedLocale !== origLoc);
    }
  }, [selectedTimezone, selectedLocale, user]);

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    try {
      await authService.updateProfile({
        timezone: selectedTimezone,
        locale: selectedLocale,
      });
      await loadUser();
      addToast('success', 'Preferences updated successfully');
      setPrefsChanged(false);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Failed to update preferences';
      addToast('error', msg);
    } finally {
      setSavingPrefs(false);
    }
  };

  useEffect(() => {
    loadSpacingCategories();
    loadMfaStatus();
  }, []);

  const loadMfaStatus = async () => {
    try {
      setLoadingMfa(true);
      const status = await authService.getMfaStatus();
      setMfaStatus(status);
    } catch (error) {
      console.error('Error loading MFA status:', error);
      // Don't show error - MFA status is not critical
    } finally {
      setLoadingMfa(false);
    }
  };

  const handleOpenRegenerateModal = () => {
    setShowRegenerateModal(true);
    setRegenerateTotpCode('');
    setRegeneratePassword('');
    setRegenerateError(null);
    setNewBackupCodes(null);
    setBackupCodesCopied(false);
  };

  const handleCloseRegenerateModal = () => {
    setShowRegenerateModal(false);
    setRegenerateTotpCode('');
    setRegeneratePassword('');
    setRegenerateError(null);
    // If new codes were generated, reload MFA status
    if (newBackupCodes) {
      setNewBackupCodes(null);
      loadMfaStatus();
    }
  };

  const handleRegenerateBackupCodes = async () => {
    if (regenerateTotpCode.length !== 6) {
      setRegenerateError('Please enter a valid 6-digit TOTP code');
      return;
    }
    if (!regeneratePassword) {
      setRegenerateError('Please enter your password');
      return;
    }

    setRegenerating(true);
    setRegenerateError(null);

    try {
      const response = await authService.regenerateBackupCodes(regenerateTotpCode, regeneratePassword);
      setNewBackupCodes(response.backupCodes);
      addToast('success', 'Backup codes regenerated successfully');
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Failed to regenerate backup codes';
      setRegenerateError(typeof msg === 'string' ? msg : 'Failed to regenerate backup codes');
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopyBackupCodes = async () => {
    if (!newBackupCodes) return;
    const codesText = newBackupCodes.join('\n');
    try {
      await navigator.clipboard.writeText(codesText);
      setBackupCodesCopied(true);
      setTimeout(() => setBackupCodesCopied(false), 2000);
    } catch (err) {
      // Fallback for browsers that don't support clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = codesText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setBackupCodesCopied(true);
      setTimeout(() => setBackupCodesCopied(false), 2000);
    }
  };

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
            <SettingLabel htmlFor="locale-select">Language / Locale</SettingLabel>
            <PreferenceSelect
              id="locale-select"
              value={selectedLocale}
              onChange={(e) => setSelectedLocale(e.target.value)}
              disabled={savingPrefs}
              aria-label="Locale preference"
            >
              {LOCALE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </PreferenceSelect>
            <SettingDescription>Select your language and regional format preference</SettingDescription>
          </SettingItem>

          <SettingItem>
            <SettingLabel htmlFor="timezone-select">Timezone</SettingLabel>
            <PreferenceSelect
              id="timezone-select"
              value={selectedTimezone}
              onChange={(e) => setSelectedTimezone(e.target.value)}
              disabled={savingPrefs}
              aria-label="Timezone preference"
            >
              {TIMEZONE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </PreferenceSelect>
            <SettingDescription>Set your local timezone for date and time display</SettingDescription>
          </SettingItem>

          {prefsChanged && (
            <PrefsButtonRow>
              <PrimaryButton onClick={handleSavePreferences} disabled={savingPrefs}>
                {savingPrefs ? 'Saving...' : 'Save Preferences'}
              </PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  const origTz = (user as any)?.timezone || 'Asia/Dubai';
                  const origLoc = (user as any)?.locale || 'en-US';
                  setSelectedTimezone(origTz);
                  setSelectedLocale(origLoc);
                }}
                disabled={savingPrefs}
              >
                Cancel
              </SecondaryButton>
            </PrefsButtonRow>
          )}
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
            {loadingMfa ? (
              <SettingValue>Loading...</SettingValue>
            ) : mfaStatus?.isEnabled ? (
              <>
                <MfaEnabledBadge>Enabled</MfaEnabledBadge>
                {mfaStatus.backupCodesRemaining > 0 && (
                  <SettingDescription>
                    {mfaStatus.backupCodesRemaining} backup code{mfaStatus.backupCodesRemaining !== 1 ? 's' : ''} remaining
                  </SettingDescription>
                )}
                {mfaStatus.backupCodesRemaining === 0 && (
                  <MfaWarning>No backup codes remaining - generate new codes for account recovery</MfaWarning>
                )}
                {mfaStatus.lastUsed && (
                  <SettingDescription>
                    Last used: {new Date(mfaStatus.lastUsed).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </SettingDescription>
                )}
              </>
            ) : mfaStatus?.setupRequired ? (
              <>
                <MfaPendingBadge>Setup Pending</MfaPendingBadge>
                <SettingDescription>Complete MFA setup to secure your account</SettingDescription>
                <MfaActionsRow>
                  <PrimaryButton onClick={() => window.location.href = '/mfa/setup'}>
                    Complete Setup
                  </PrimaryButton>
                </MfaActionsRow>
              </>
            ) : (
              <>
                <SettingValue>Not Configured</SettingValue>
                <SettingDescription>Add an extra layer of security to your account</SettingDescription>
                <MfaActionsRow>
                  <PrimaryButton onClick={() => window.location.href = '/mfa/setup'}>
                    Set Up MFA
                  </PrimaryButton>
                </MfaActionsRow>
              </>
            )}

            {mfaStatus?.isEnabled && (
              <MfaActionsRow>
                <SecondaryButton onClick={handleOpenRegenerateModal}>
                  Regenerate Backup Codes
                </SecondaryButton>
              </MfaActionsRow>
            )}
          </SettingItem>

          <SettingItem>
            <SettingLabel>Active Sessions</SettingLabel>
            <SettingValue>1 Session</SettingValue>
            <SettingDescription>Manage your active login sessions</SettingDescription>
          </SettingItem>
        </SettingsContent>
      </Card>

      {/* Regenerate Backup Codes Modal */}
      {showRegenerateModal && (
        <ModalOverlay onClick={handleCloseRegenerateModal}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalTitle>
              {newBackupCodes ? 'New Backup Codes' : 'Regenerate Backup Codes'}
            </ModalTitle>

            {newBackupCodes ? (
              <>
                <ModalWarning>
                  <strong>Important:</strong> These codes are shown only once. Store them safely!
                </ModalWarning>
                <BackupCodesContainer>
                  <BackupCodesGrid>
                    {newBackupCodes.map((code, index) => (
                      <BackupCodeItem key={index}>{code}</BackupCodeItem>
                    ))}
                  </BackupCodesGrid>
                  <CopyCodesButton onClick={handleCopyBackupCodes}>
                    {backupCodesCopied ? 'Copied!' : 'Copy All Codes'}
                  </CopyCodesButton>
                </BackupCodesContainer>
                <ModalButtonRow>
                  <PrimaryButton onClick={handleCloseRegenerateModal}>
                    I've Saved My Codes
                  </PrimaryButton>
                </ModalButtonRow>
              </>
            ) : (
              <>
                <ModalDescription>
                  To regenerate your backup codes, please verify your identity by entering your current TOTP code from your authenticator app and your password.
                </ModalDescription>

                {regenerateError && (
                  <ModalError>{regenerateError}</ModalError>
                )}

                <ModalForm onSubmit={(e) => { e.preventDefault(); handleRegenerateBackupCodes(); }}>
                  <ModalFormGroup>
                    <ModalLabel htmlFor="totp-code">TOTP Code (from authenticator app)</ModalLabel>
                    <TotpCodeInput
                      id="totp-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="000000"
                      value={regenerateTotpCode}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setRegenerateTotpCode(value);
                        setRegenerateError(null);
                      }}
                      autoFocus
                      aria-label="6-digit TOTP code"
                    />
                  </ModalFormGroup>

                  <ModalFormGroup>
                    <ModalLabel htmlFor="password">Password</ModalLabel>
                    <PasswordInput
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={regeneratePassword}
                      onChange={(e) => {
                        setRegeneratePassword(e.target.value);
                        setRegenerateError(null);
                      }}
                      aria-label="Password"
                    />
                  </ModalFormGroup>

                  <ModalButtonRow>
                    <SecondaryButton type="button" onClick={handleCloseRegenerateModal} disabled={regenerating}>
                      Cancel
                    </SecondaryButton>
                    <PrimaryButton
                      type="submit"
                      disabled={regenerating || regenerateTotpCode.length !== 6 || !regeneratePassword}
                    >
                      {regenerating ? 'Regenerating...' : 'Regenerate Codes'}
                    </PrimaryButton>
                  </ModalButtonRow>
                </ModalForm>
              </>
            )}
          </ModalContent>
        </ModalOverlay>
      )}
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
  /* Striped rows for readability - alternating row colors */
  &:nth-child(even) {
    background: ${({ theme }: any) => theme.colors.neutral[50]};
  }

  &:nth-child(odd) {
    background: #ffffff;
  }

  &:hover {
    background: ${({ theme }: any) => theme.colors.neutral[100]};
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

const PreferenceSelect = styled.select`
  padding: ${({ theme }: any) => theme.spacing.sm} ${({ theme }: any) => theme.spacing.md};
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  border: 1px solid ${({ theme }: any) => theme.colors.neutral[300]};
  border-radius: 6px;
  color: ${({ theme }: any) => theme.colors.primary[600]};
  background: ${({ theme }: any) => theme.colors.white};
  cursor: pointer;
  width: 100%;
  max-width: 350px;
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
`;

const PrefsButtonRow = styled.div`
  display: flex;
  gap: ${({ theme }: any) => theme.spacing.md};
  margin-top: ${({ theme }: any) => theme.spacing.md};
`;

// MFA Status styled components
const MfaEnabledBadge = styled.span`
  display: inline-block;
  padding: 4px 12px;
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.semibold};
  color: #059669;
  background: #d1fae5;
  border-radius: 4px;
`;

const MfaPendingBadge = styled.span`
  display: inline-block;
  padding: 4px 12px;
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.semibold};
  color: #b45309;
  background: #fef3c7;
  border-radius: 4px;
`;

const MfaWarning = styled.div`
  font-size: ${({ theme }: any) => theme.typography.fontSize.xs};
  color: ${({ theme }: any) => theme.colors.error[600]};
  margin-top: ${({ theme }: any) => theme.spacing.xs};
`;

const MfaActionsRow = styled.div`
  margin-top: ${({ theme }: any) => theme.spacing.md};
  display: flex;
  gap: ${({ theme }: any) => theme.spacing.sm};
`;

// Modal styled components
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: ${({ theme }: any) => theme.spacing.md};
`;

const ModalContent = styled.div`
  background: white;
  border-radius: ${({ theme }: any) => theme.borderRadius.lg};
  padding: ${({ theme }: any) => theme.spacing.xl};
  max-width: 480px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
`;

const ModalTitle = styled.h2`
  font-size: ${({ theme }: any) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.semibold};
  color: ${({ theme }: any) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }: any) => theme.spacing.md} 0;
`;

const ModalDescription = styled.p`
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  color: ${({ theme }: any) => theme.colors.textSecondary};
  margin: 0 0 ${({ theme }: any) => theme.spacing.lg} 0;
  line-height: 1.6;
`;

const ModalWarning = styled.div`
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: ${({ theme }: any) => theme.borderRadius.md};
  padding: ${({ theme }: any) => theme.spacing.md};
  margin-bottom: ${({ theme }: any) => theme.spacing.lg};
  color: #92400e;
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
`;

const ModalError = styled.div`
  background: ${({ theme }: any) => theme.colors.error[50]};
  border: 1px solid ${({ theme }: any) => theme.colors.error[300]};
  border-radius: ${({ theme }: any) => theme.borderRadius.md};
  padding: ${({ theme }: any) => theme.spacing.md};
  margin-bottom: ${({ theme }: any) => theme.spacing.lg};
  color: ${({ theme }: any) => theme.colors.error[600]};
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
`;

const ModalForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }: any) => theme.spacing.lg};
`;

const ModalFormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }: any) => theme.spacing.xs};
`;

const ModalLabel = styled.label`
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }: any) => theme.typography.fontWeight.medium};
  color: ${({ theme }: any) => theme.colors.textPrimary};
`;

const TotpCodeInput = styled.input`
  padding: ${({ theme }: any) => theme.spacing.md};
  font-size: 1.5rem;
  font-family: 'Courier New', monospace;
  text-align: center;
  letter-spacing: 0.5rem;
  border: 2px solid ${({ theme }: any) => theme.colors.neutral[300]};
  border-radius: ${({ theme }: any) => theme.borderRadius.md};
  transition: border-color 0.2s, box-shadow 0.2s;

  &:focus {
    outline: none;
    border-color: ${({ theme }: any) => theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${({ theme }: any) => theme.colors.primary[100]};
  }

  &::placeholder {
    color: ${({ theme }: any) => theme.colors.neutral[300]};
    letter-spacing: 0.5rem;
  }
`;

const PasswordInput = styled.input`
  padding: ${({ theme }: any) => theme.spacing.md};
  font-size: ${({ theme }: any) => theme.typography.fontSize.base};
  border: 2px solid ${({ theme }: any) => theme.colors.neutral[300]};
  border-radius: ${({ theme }: any) => theme.borderRadius.md};
  transition: border-color 0.2s, box-shadow 0.2s;

  &:focus {
    outline: none;
    border-color: ${({ theme }: any) => theme.colors.primary[500]};
    box-shadow: 0 0 0 3px ${({ theme }: any) => theme.colors.primary[100]};
  }
`;

const ModalButtonRow = styled.div`
  display: flex;
  gap: ${({ theme }: any) => theme.spacing.md};
  justify-content: flex-end;
  margin-top: ${({ theme }: any) => theme.spacing.md};
`;

const BackupCodesContainer = styled.div`
  background: ${({ theme }: any) => theme.colors.neutral[50]};
  border: 1px solid ${({ theme }: any) => theme.colors.neutral[200]};
  border-radius: ${({ theme }: any) => theme.borderRadius.md};
  padding: ${({ theme }: any) => theme.spacing.md};
  margin-bottom: ${({ theme }: any) => theme.spacing.lg};
`;

const BackupCodesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${({ theme }: any) => theme.spacing.sm};
  margin-bottom: ${({ theme }: any) => theme.spacing.md};
`;

const BackupCodeItem = styled.div`
  font-family: 'Courier New', monospace;
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  color: ${({ theme }: any) => theme.colors.textPrimary};
  background: white;
  padding: ${({ theme }: any) => theme.spacing.sm} ${({ theme }: any) => theme.spacing.md};
  border-radius: 4px;
  border: 1px solid ${({ theme }: any) => theme.colors.neutral[200]};
  text-align: center;
`;

const CopyCodesButton = styled.button`
  width: 100%;
  padding: ${({ theme }: any) => theme.spacing.sm};
  background: white;
  border: 1px solid ${({ theme }: any) => theme.colors.neutral[300]};
  border-radius: 4px;
  color: ${({ theme }: any) => theme.colors.primary[600]};
  font-size: ${({ theme }: any) => theme.typography.fontSize.sm};
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${({ theme }: any) => theme.colors.neutral[50]};
    border-color: ${({ theme }: any) => theme.colors.primary[500]};
  }
`;
