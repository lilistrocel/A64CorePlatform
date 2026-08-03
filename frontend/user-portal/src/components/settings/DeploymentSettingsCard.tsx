/**
 * DeploymentSettingsCard — Deployment identity + Cloudflare Access (super_admin only).
 *
 * Lets a super_admin configure `PUBLIC_BASE_URL` / `FRONTEND_URL` and the six
 * `CF_ACCESS_*` keys from the browser, so a fresh deployment never requires
 * shell access or `.env` editing: bring the stack up, log in with the seeded
 * super_admin password account, configure everything here, then flip on
 * Cloudflare Access. Password login always exists first — there is no
 * bootstrap paradox.
 *
 * Backed by GET/PATCH /api/v1/admin/deployment-settings
 * (src/services/deployment_settings_service.py — read that module's
 * docstring before changing any guardrail-related behaviour here).
 *
 * Key behaviours (all mandated, not incidental):
 * - Env-pinned keys (`editable: false`, `source: 'env'`) render read-only
 *   with an explanatory badge — editing them requires a `.env` change +
 *   container recreate, not this UI.
 * - `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` are secrets: the API never
 *   returns their value, only `isSet` + a last-4-character `maskedHint`.
 *   The input for these is ALWAYS blank on load — typing a value stages a
 *   REPLACEMENT, never an edit of something rendered. There is no
 *   show/hide toggle; there is nothing to reveal.
 * - Every save requires the acting super_admin's current password,
 *   confirmed in a modal that closes ONLY via the X button (project
 *   standing rule — no accidental dismissal of data-entry modals on
 *   backdrop click).
 * - Flipping `CF_ACCESS_EXCLUSIVE` on requires ITS OWN distinct
 *   confirmation (separate from the password modal) because the
 *   consequence — password login only working from the server itself — is
 *   qualitatively different from every other field on this card.
 * - The two guardrail errors an admin will actually hit (Cloudflare JWKS
 *   validation failure on the team domain, and the exclusive-mode block
 *   when no CF Access sign-in has been recorded yet) get actionable inline
 *   messages next to the relevant field, not a generic toast.
 */

import { useEffect, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import { X, ShieldAlert } from 'lucide-react';
import { Card, glassPanel } from '@a64core/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth.store';
import {
  getDeploymentSettings,
  updateDeploymentSettings,
  DEPLOYMENT_SETTINGS_QUERY_KEY,
  type DeploymentSettingsMap,
  type DeploymentSettingValue,
} from '../../services/systemService';

// Keys that never return their value — see module docstring.
const SECRET_KEYS = new Set(['CF_ACCESS_TEAM_DOMAIN', 'CF_ACCESS_AUD']);
const BOOL_KEYS = new Set(['CF_ACCESS_ENABLED', 'CF_ACCESS_EXCLUSIVE', 'CF_ACCESS_JIT_PROVISION']);

// Mirrors UserRole (src/models/user.py) — CF_ACCESS_DEFAULT_ROLE is
// validated server-side against exactly this set.
const ROLE_OPTIONS = ['user', 'guest', 'moderator', 'admin', 'super_admin'] as const;

const FIELD_LABELS: Record<string, string> = {
  PUBLIC_BASE_URL: 'Public base URL',
  FRONTEND_URL: 'Frontend URL',
  CF_ACCESS_ENABLED: 'Enable Cloudflare Access',
  CF_ACCESS_TEAM_DOMAIN: 'Team domain',
  CF_ACCESS_AUD: 'Application Audience (AUD) tag',
  CF_ACCESS_EXCLUSIVE: 'Exclusive mode (disable password login)',
  CF_ACCESS_JIT_PROVISION: 'Just-in-time provisioning',
  CF_ACCESS_DEFAULT_ROLE: 'Default role for JIT-provisioned users',
};

/** Human-readable value for the password-confirmation modal's change list —
 * never the raw secret value, even for staged (not-yet-saved) input. */
function describeChange(key: string, value: DeploymentSettingValue): string {
  if (SECRET_KEYS.has(key)) return 'new value provided';
  if (typeof value === 'boolean') return value ? 'enabled' : 'disabled';
  return String(value);
}

/** Extract FastAPI's `detail` string from an Axios error, falling back to a
 * generic message. Mirrors the pattern already used in Settings.tsx
 * (handleRegenerateBackupCodes) rather than inventing a new one. */
function extractDetail(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

export function DeploymentSettingsCard() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === 'super_admin';

  const query = useQuery({
    queryKey: DEPLOYMENT_SETTINGS_QUERY_KEY,
    queryFn: getDeploymentSettings,
    enabled: isSuperAdmin,
  });
  const settings: DeploymentSettingsMap = query.data?.settings ?? {};

  // Staged edits — sparse map, only keys the user has actually touched.
  // Secret fields (CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD) start absent on
  // every fetch (never prefilled); non-secret fields are seeded lazily on
  // first render of each field via `displayValue` below, and overwritten
  // here as the user edits.
  const [edits, setEdits] = useState<Record<string, DeploymentSettingValue>>({});
  const [cardError, setCardError] = useState<string | null>(null);
  const [teamDomainError, setTeamDomainError] = useState<string | null>(null);
  const [exclusiveError, setExclusiveError] = useState<string | null>(null);

  // Reset staged edits whenever a fresh fetch lands (e.g. after a
  // successful save, or a key's `source` changed underneath us).
  useEffect(() => {
    setEdits({});
  }, [query.dataUpdatedAt]);

  const [showExclusiveConfirm, setShowExclusiveConfirm] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (changes: Record<string, DeploymentSettingValue>) =>
      updateDeploymentSettings({ currentPassword: password, changes }),
    onSuccess: async () => {
      setShowPasswordModal(false);
      setPassword('');
      setPasswordError(null);
      setCardError(null);
      setTeamDomainError(null);
      setExclusiveError(null);
      await queryClient.invalidateQueries({ queryKey: DEPLOYMENT_SETTINGS_QUERY_KEY });
    },
    onError: (err: unknown, changes) => {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        // Wrong password — keep the modal open, let them retry.
        setPasswordError(extractDetail(err, 'Current password is incorrect.'));
        return;
      }

      // Every other failure is not a password problem — close the modal
      // (retyping the password won't fix a pinned key or a bad team
      // domain) and surface it where it's actionable. Staged edits are
      // deliberately NOT cleared so the user doesn't lose typed input.
      setShowPasswordModal(false);
      setPassword('');
      setPasswordError(null);

      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const detail = extractDetail(err, 'The change was rejected.');
        if ('CF_ACCESS_EXCLUSIVE' in changes && detail.toLowerCase().includes('exclusive mode')) {
          setExclusiveError(detail);
          return;
        }
        // Pinned-by-environment conflict — refetch so the field's
        // editable/source flips to read-only in the UI immediately.
        setCardError(detail);
        query.refetch();
        return;
      }

      if (axios.isAxiosError(err) && err.response?.status === 422) {
        const detail = extractDetail(err, 'Validation failed.');
        if ('CF_ACCESS_TEAM_DOMAIN' in changes && detail.includes('CF_ACCESS_TEAM_DOMAIN')) {
          setTeamDomainError(detail);
          return;
        }
        setCardError(detail);
        return;
      }

      setCardError(extractDetail(err, 'Failed to update deployment settings.'));
    },
  });

  if (!isSuperAdmin) return null;

  /** Effective displayed value for a non-secret field: staged edit if the
   * user has touched it, otherwise the resolved value from the API. */
  function displayValue(key: string): DeploymentSettingValue {
    if (key in edits) return edits[key];
    const item = settings[key];
    if (!item) return BOOL_KEYS.has(key) ? false : '';
    return (item.value ?? (BOOL_KEYS.has(key) ? false : '')) as DeploymentSettingValue;
  }

  function stageEdit(key: string, value: DeploymentSettingValue) {
    setCardError(null);
    if (key === 'CF_ACCESS_TEAM_DOMAIN') setTeamDomainError(null);
    if (key === 'CF_ACCESS_EXCLUSIVE') setExclusiveError(null);
    setEdits((prev) => ({ ...prev, [key]: value }));
  }

  function handleExclusiveToggle(next: boolean) {
    if (next) {
      // Distinct confirmation — do NOT stage the edit until confirmed.
      setShowExclusiveConfirm(true);
      return;
    }
    stageEdit('CF_ACCESS_EXCLUSIVE', false);
  }

  function confirmExclusive() {
    stageEdit('CF_ACCESS_EXCLUSIVE', true);
    setShowExclusiveConfirm(false);
  }

  // Only send keys that actually changed. For secret fields, "changed"
  // means the user typed something non-empty (an empty staged value means
  // "leave unchanged", never "clear the secret" — there's no affordance
  // for that here).
  const changes: Record<string, DeploymentSettingValue> = {};
  for (const key of Object.keys(edits)) {
    const staged = edits[key];
    if (SECRET_KEYS.has(key)) {
      if (typeof staged === 'string' && staged.length > 0) changes[key] = staged;
      continue;
    }
    const baseline = settings[key]?.value;
    if (staged !== baseline) changes[key] = staged;
  }
  const hasChanges = Object.keys(changes).length > 0;

  function renderStringField(key: string, warning?: string) {
    const item = settings[key];
    const editable = item?.editable ?? true;

    if (!editable) {
      return (
        <FieldRow key={key}>
          <FieldHeader>
            <FieldLabel>{FIELD_LABELS[key] ?? key}</FieldLabel>
            <EnvBadge>Set in environment</EnvBadge>
          </FieldHeader>
          <ReadOnlyValue>{String(item?.value ?? '(empty)')}</ReadOnlyValue>
          <FieldHint>
            Pinned by this deployment&apos;s environment — edit <code>.env</code> and
            recreate the container to change it.
          </FieldHint>
        </FieldRow>
      );
    }

    return (
      <FieldRow key={key}>
        <FieldHeader>
          <FieldLabel htmlFor={`dep-${key}`}>{FIELD_LABELS[key] ?? key}</FieldLabel>
        </FieldHeader>
        <TextInput
          id={`dep-${key}`}
          type="text"
          value={displayValue(key) as string}
          onChange={(e) => stageEdit(key, e.target.value)}
          disabled={mutation.isPending}
        />
        {warning && <FieldWarning role="note">{warning}</FieldWarning>}
      </FieldRow>
    );
  }

  function renderSecretField(key: string, inlineError: string | null) {
    const item = settings[key];
    const editable = item?.editable ?? true;
    const staged = (edits[key] as string | undefined) ?? '';

    if (!editable) {
      return (
        <FieldRow key={key}>
          <FieldHeader>
            <FieldLabel>{FIELD_LABELS[key] ?? key}</FieldLabel>
            <EnvBadge>Set in environment</EnvBadge>
          </FieldHeader>
          <ReadOnlyValue>{item?.isSet ? `Set (${item.maskedHint ?? '••••'})` : 'Not set'}</ReadOnlyValue>
          <FieldHint>
            Pinned by this deployment&apos;s environment — edit <code>.env</code> and
            recreate the container to change it.
          </FieldHint>
        </FieldRow>
      );
    }

    return (
      <FieldRow key={key}>
        <FieldHeader>
          <FieldLabel htmlFor={`dep-${key}`}>{FIELD_LABELS[key] ?? key}</FieldLabel>
        </FieldHeader>
        <ReadOnlyValue>{item?.isSet ? `Set (${item.maskedHint ?? '••••'})` : 'Not set'}</ReadOnlyValue>
        <TextInput
          id={`dep-${key}`}
          type="password"
          autoComplete="off"
          placeholder="Type a new value to replace it — leave blank to keep the current one"
          value={staged}
          onChange={(e) => stageEdit(key, e.target.value)}
          disabled={mutation.isPending}
          aria-describedby={inlineError ? `${key}-error` : undefined}
        />
        {inlineError && (
          <InlineFieldError id={`${key}-error`} role="alert" aria-live="assertive">
            {inlineError}
          </InlineFieldError>
        )}
      </FieldRow>
    );
  }

  function renderBoolField(key: string) {
    const item = settings[key];
    const editable = item?.editable ?? true;
    const value = displayValue(key) as boolean;

    if (!editable) {
      return (
        <FieldRow key={key}>
          <FieldHeader>
            <FieldLabel>{FIELD_LABELS[key] ?? key}</FieldLabel>
            <EnvBadge>Set in environment</EnvBadge>
          </FieldHeader>
          <ReadOnlyValue>{item?.value ? 'Enabled' : 'Disabled'}</ReadOnlyValue>
          <FieldHint>
            Pinned by this deployment&apos;s environment — edit <code>.env</code> and
            recreate the container to change it.
          </FieldHint>
        </FieldRow>
      );
    }

    const onChange = key === 'CF_ACCESS_EXCLUSIVE'
      ? handleExclusiveToggle
      : (next: boolean) => stageEdit(key, next);

    return (
      <FieldRow key={key}>
        <CheckboxLabel htmlFor={`dep-${key}`}>
          <Checkbox
            id={`dep-${key}`}
            type="checkbox"
            checked={value}
            disabled={mutation.isPending}
            onChange={(e) => onChange(e.target.checked)}
          />
          <FieldLabel as="span">{FIELD_LABELS[key] ?? key}</FieldLabel>
        </CheckboxLabel>
        {key === 'CF_ACCESS_EXCLUSIVE' && exclusiveError && (
          <InlineFieldError role="alert" aria-live="assertive">
            {exclusiveError}
          </InlineFieldError>
        )}
      </FieldRow>
    );
  }

  function renderRoleField(key: string) {
    const item = settings[key];
    const editable = item?.editable ?? true;

    if (!editable) {
      return (
        <FieldRow key={key}>
          <FieldHeader>
            <FieldLabel>{FIELD_LABELS[key] ?? key}</FieldLabel>
            <EnvBadge>Set in environment</EnvBadge>
          </FieldHeader>
          <ReadOnlyValue>{String(item?.value ?? '')}</ReadOnlyValue>
        </FieldRow>
      );
    }

    return (
      <FieldRow key={key}>
        <FieldHeader>
          <FieldLabel htmlFor={`dep-${key}`}>{FIELD_LABELS[key] ?? key}</FieldLabel>
        </FieldHeader>
        <Select
          id={`dep-${key}`}
          value={displayValue(key) as string}
          onChange={(e) => stageEdit(key, e.target.value)}
          disabled={mutation.isPending}
        >
          {ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </Select>
        <FieldHint>
          Role automatically assigned to a brand-new user the first time they sign in
          via Cloudflare Access (only used when JIT provisioning is enabled).
        </FieldHint>
      </FieldRow>
    );
  }

  return (
    <>
      <Card title="Deployment Identity">
        <Content>
          {cardError && (
            <CardErrorBanner role="alert" aria-live="assertive">
              {cardError}
            </CardErrorBanner>
          )}
          {query.isLoading ? (
            <Muted>Loading…</Muted>
          ) : (
            <>
              {renderStringField(
                'PUBLIC_BASE_URL',
                'This value is printed into vessel-label QR codes. A wrong value ships on physical ' +
                  'labels and is NOT recoverable after printing — every affected label must be ' +
                  'reprinted. Double-check before saving.'
              )}
              {renderStringField('FRONTEND_URL')}
            </>
          )}
        </Content>
      </Card>

      <Card title="Cloudflare Access">
        <Content>
          <Intro>
            Configure single sign-on via Cloudflare Access. Password login always keeps
            working unless you separately enable exclusive mode below.
          </Intro>
          {query.isLoading ? (
            <Muted>Loading…</Muted>
          ) : (
            <>
              {renderBoolField('CF_ACCESS_ENABLED')}
              {renderSecretField('CF_ACCESS_TEAM_DOMAIN', teamDomainError)}
              {renderSecretField('CF_ACCESS_AUD', null)}
              {renderBoolField('CF_ACCESS_EXCLUSIVE')}
              {renderBoolField('CF_ACCESS_JIT_PROVISION')}
              {renderRoleField('CF_ACCESS_DEFAULT_ROLE')}
            </>
          )}
        </Content>
      </Card>

      <SaveBar>
        <SaveButton
          disabled={!hasChanges || mutation.isPending || query.isLoading}
          onClick={() => setShowPasswordModal(true)}
        >
          Save Deployment Settings
        </SaveButton>
        {hasChanges && <SaveHint>Unsaved changes — confirm your password to apply them.</SaveHint>}
      </SaveBar>

      {/* Distinct confirmation for exclusive mode — separate from the
          password-confirmation modal because the consequence (password
          login only working from the server itself) is qualitatively
          different from every other field here. */}
      {showExclusiveConfirm && (
        <ModalOverlay>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitleRow>
                <ShieldAlert size={18} strokeWidth={1.8} />
                <ModalTitle>Enable Exclusive Cloudflare Access Mode?</ModalTitle>
              </ModalTitleRow>
              <CloseButton aria-label="Close" onClick={() => setShowExclusiveConfirm(false)}>
                <X size={16} strokeWidth={1.8} />
              </CloseButton>
            </ModalHeader>
            <ModalBody>
              <p>
                Once saved, password login will <strong>only work from the server itself</strong>{' '}
                (the break-glass path). Every other sign-in must go through Cloudflare Access.
              </p>
              <p>
                Make sure at least one super_admin can already sign in successfully via
                Cloudflare Access before turning this on — the backend refuses to save this
                change until a Cloudflare Access sign-in has actually been recorded.
              </p>
            </ModalBody>
            <ModalActions>
              <SecondaryButton onClick={() => setShowExclusiveConfirm(false)}>Cancel</SecondaryButton>
              <DangerButton onClick={confirmExclusive}>I understand — stage this change</DangerButton>
            </ModalActions>
          </ModalContent>
        </ModalOverlay>
      )}

      {/* Password re-authentication — mandatory before ANY save. Closes
          ONLY via the X button (project standing rule: never on overlay
          click for a data-entry modal). */}
      {showPasswordModal && (
        <ModalOverlay>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Confirm Deployment Settings Change</ModalTitle>
              <CloseButton
                aria-label="Close"
                onClick={() => {
                  setShowPasswordModal(false);
                  setPassword('');
                  setPasswordError(null);
                }}
                disabled={mutation.isPending}
              >
                <X size={16} strokeWidth={1.8} />
              </CloseButton>
            </ModalHeader>
            <ModalBody>
              <p>Re-enter your password to apply the following change(s):</p>
              <ChangeList>
                {Object.entries(changes).map(([key, value]) => (
                  <li key={key}>
                    <strong>{FIELD_LABELS[key] ?? key}</strong>: {describeChange(key, value)}
                  </li>
                ))}
              </ChangeList>

              {passwordError && (
                <InlineFieldError role="alert" aria-live="assertive">
                  {passwordError}
                </InlineFieldError>
              )}

              <ModalForm
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!password) {
                    setPasswordError('Please enter your password.');
                    return;
                  }
                  mutation.mutate(changes);
                }}
              >
                <ModalLabel htmlFor="deployment-password">Password</ModalLabel>
                <TextInput
                  id="deployment-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(null);
                  }}
                  autoFocus
                  aria-label="Current password"
                />
                <ModalFormActions>
                  <SecondaryButton
                    type="button"
                    onClick={() => {
                      setShowPasswordModal(false);
                      setPassword('');
                      setPasswordError(null);
                    }}
                    disabled={mutation.isPending}
                  >
                    Cancel
                  </SecondaryButton>
                  <SaveButton type="submit" disabled={mutation.isPending || !password}>
                    {mutation.isPending ? 'Saving…' : 'Confirm & Save'}
                  </SaveButton>
                </ModalFormActions>
              </ModalForm>
            </ModalBody>
          </ModalContent>
        </ModalOverlay>
      )}
    </>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const Intro = styled.p`
  margin: 0;
  font-size: 0.875rem;
  color: ${({ theme }: any) => theme.colors.textSecondary};
  line-height: 1.5;
`;

const Muted = styled.div`
  color: ${({ theme }: any) => theme.colors.textSecondary};
  font-size: 0.875rem;
`;

const FieldRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid ${({ theme }: any) => theme.colors.line};

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
`;

const FieldHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const FieldLabel = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${({ theme }: any) => theme.colors.textPrimary};
`;

const FieldHint = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  color: ${({ theme }: any) => theme.colors.textSecondary};
  line-height: 1.5;

  code {
    font-family: ${({ theme }: any) => theme.typography.fontFamily.mono};
    font-size: 0.75rem;
  }
`;

const FieldWarning = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  color: ${({ theme }: any) => theme.colors.warning};
  background: ${({ theme }: any) => theme.colors.warningBg};
  border: 1px solid ${({ theme }: any) => theme.colors.warning};
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  line-height: 1.5;
`;

const ReadOnlyValue = styled.div`
  font-size: 0.875rem;
  color: ${({ theme }: any) => theme.colors.textSecondary};
  font-family: ${({ theme }: any) => theme.typography.fontFamily.mono};
`;

const EnvBadge = styled.span`
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: ${({ theme }: any) => theme.colors.textSecondary};
  background: ${({ theme }: any) => theme.colors.glass.base};
  border: 1px solid ${({ theme }: any) => theme.colors.glass.border};
  border-radius: 999px;
  padding: 0.125rem 0.5rem;
`;

const TextInput = styled.input`
  width: 100%;
  max-width: 480px;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  background: ${({ theme }: any) => theme.colors.glass.base};
  color: ${({ theme }: any) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }: any) => theme.colors.glass.border};
  border-radius: 6px;

  &:focus {
    outline: 2px solid ${({ theme }: any) => theme.colors.primary[500]};
    outline-offset: 1px;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Select = styled.select`
  width: 100%;
  max-width: 240px;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  background: ${({ theme }: any) => theme.colors.glass.base};
  color: ${({ theme }: any) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }: any) => theme.colors.glass.border};
  border-radius: 6px;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
`;

const Checkbox = styled.input`
  width: 16px;
  height: 16px;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const InlineFieldError = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  color: ${({ theme }: any) => theme.colors.error};
  background: ${({ theme }: any) => theme.colors.errorBg};
  border: 1px solid ${({ theme }: any) => theme.colors.error};
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  line-height: 1.5;
`;

const CardErrorBanner = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }: any) => theme.colors.error};
  background: ${({ theme }: any) => theme.colors.errorBg};
  border: 1px solid ${({ theme }: any) => theme.colors.error};
  border-radius: 6px;
  padding: 0.625rem 0.875rem;
  line-height: 1.5;
`;

const SaveBar = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0;
`;

const SaveHint = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }: any) => theme.colors.warning};
`;

const SaveButton = styled.button`
  padding: 0.625rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  background: ${({ theme }: any) => theme.colors.gold[500]};
  color: ${({ theme }: any) => theme.colors.onAccent};
  border: none;
  border-radius: 6px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }: any) => theme.colors.gold[400]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SecondaryButton = styled.button`
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  background: ${({ theme }: any) => theme.colors.glass.base};
  color: ${({ theme }: any) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }: any) => theme.colors.glass.border};
  border-radius: 6px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }: any) => theme.colors.glass.hi};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// Destructive/high-stakes confirmation — coral-b tinted glass, never solid red.
const DangerButton = styled.button`
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  background: rgba(240, 138, 112, 0.16);
  color: ${({ theme }: any) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 6px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: rgba(240, 138, 112, 0.26);
  }
`;

const ChangeList = styled.ul`
  margin: 0 0 0.75rem;
  padding-left: 1.25rem;
  font-size: 0.8125rem;
  color: ${({ theme }: any) => theme.colors.textSecondary};
  line-height: 1.6;
`;

// ── Modal styles ────────────────────────────────────────────────────────

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
`;

const ModalContent = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  max-width: 520px;
  width: 100%;
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
  padding: 1rem 1.25rem;
  border-bottom: 1px solid ${({ theme }: any) => theme.colors.line};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ModalTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: ${({ theme }: any) => theme.colors.warning};
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: 1.125rem;
  color: ${({ theme }: any) => theme.colors.textPrimary};
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }: any) => theme.colors.textSecondary};
  padding: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;

  &:hover:not(:disabled) {
    background: rgba(180, 200, 220, 0.07);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ModalBody = styled.div`
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  font-size: 0.875rem;
  color: ${({ theme }: any) => theme.colors.textPrimary};
  line-height: 1.5;

  p {
    margin: 0;
  }
`;

const ModalForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const ModalLabel = styled.label`
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${({ theme }: any) => theme.colors.textPrimary};
`;

const ModalActions = styled.div`
  padding: 1rem 1.25rem;
  border-top: 1px solid ${({ theme }: any) => theme.colors.line};
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
`;

const ModalFormActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;
