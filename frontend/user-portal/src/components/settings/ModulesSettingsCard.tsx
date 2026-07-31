/**
 * ModulesSettingsCard — Wave 0 (T-059.4) + T-804 public-info-page follow-up
 *
 * Super_admin-only Tenant Settings → Modules section. Lets a tenant
 * operator toggle the finance module on/off, and (T-804 follow-up) the
 * public genetics label-info page — `PATCH /api/v1/organizations/{orgId}
 * /modules` accepted `publicInfoPage` for a while with no UI control for
 * it; this card is that control. Confirmation modal on disabling either
 * master switch. Audit-logged on the backend.
 *
 * `publicInfoPage`'s four `show*` flags are sent as single-field partial
 * patches (`{ publicInfoPage: { showOperatorName: true } }`), never a full
 * object rebuilt from local state — the backend
 * (`PublicInfoPageConfigUpdate`) merges only the keys present in the body
 * onto the stored config, and sending the whole object would silently
 * reset whatever a previous toggle set for the other three flags.
 *
 * Modals close ONLY via X/Cancel/Confirm — never on overlay click
 * (project preference: no accidental dismissal of data-entry modals).
 */

import { useState } from 'react';
import styled from 'styled-components';
import { X } from 'lucide-react';
import { Card, glassPanel } from '@a64core/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth.store';
import { useToastStore } from '../../stores/toast.store';
import {
  useCapabilities,
  CAPABILITIES_QUERY_KEY,
} from '../../hooks/useCapabilities';
import {
  getOrganization,
  updateOrganizationModules,
  type PublicInfoPageConfigPatch,
} from '../../services/systemService';

const ORGANIZATION_QUERY_KEY = (orgId: string) => ['organization', orgId] as const;

/** Every `show*` flag's key + the copy shown next to its checkbox — kept as
 * one array so adding a fifth flag later is a one-line change, not a
 * hand-duplicated JSX block per flag. */
const PUBLIC_INFO_SHOW_FLAGS: {
  key: keyof Omit<PublicInfoPageConfigPatch, 'enabled'>;
  label: string;
  hint: string;
}[] = [
  {
    key: 'showOperatorName',
    label: "Show technician's full name",
    hint: 'Off: only initials are shown. Full name is a personal-data disclosure on a permanently public page.',
  },
  {
    key: 'showMediumIngredients',
    label: 'Show medium ingredient list',
    hint: 'Off: only the recipe name is shown. Ingredient ratios are commercially sensitive.',
  },
  {
    key: 'showProtocolSteps',
    label: 'Show protocol step text',
    hint: 'Off: only the SOP code/title/version are shown, not the step-by-step procedure.',
  },
  {
    key: 'showFacilityName',
    label: 'Show facility name',
    hint: 'Room, unit and position are never shown on this page regardless of this flag.',
  },
];

export function ModulesSettingsCard() {
  const { user, refreshUser } = useAuthStore();
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const { data: capabilities, isLoading } = useCapabilities();

  const [showConfirmDisable, setShowConfirmDisable] = useState(false);
  const [showConfirmDisablePublicInfo, setShowConfirmDisablePublicInfo] = useState(false);

  const orgId = user?.organizationId ?? null;
  const isSuperAdmin = user?.role === 'super_admin';
  const financeEnabled = capabilities?.modules.finance.enabled ?? false;

  // `useCapabilities()` doesn't carry `publicInfoPage` (it exists to gate
  // finance-service reachability, not to mirror every module's config) —
  // fetch the organization directly to seed this section's toggle states.
  const orgQuery = useQuery({
    queryKey: orgId ? ORGANIZATION_QUERY_KEY(orgId) : ['organization', 'none'],
    queryFn: () => getOrganization(orgId as string),
    // Reason: this whole card renders null for non-super-admins below — no
    // point firing the GET for a role that will never see the result.
    enabled: !!orgId && isSuperAdmin,
  });
  const publicInfoPage = orgQuery.data?.modules.publicInfoPage;

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (!orgId) {
        throw new Error('No organization context — cannot update modules.');
      }
      return updateOrganizationModules(orgId, { financeEnabled: next });
    },
    onSuccess: async (_data, next) => {
      addToast(
        'success',
        `Finance module ${next ? 'enabled' : 'disabled'} for this tenant.`
      );
      await queryClient.invalidateQueries({ queryKey: CAPABILITIES_QUERY_KEY });
      // Reason: /auth/me carries a capabilities snapshot; refresh it so the
      // sidebar updates without a hard reload.
      await refreshUser();
      setShowConfirmDisable(false);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.detail ??
        err?.message ??
        'Failed to update module setting.';
      addToast('error', msg);
    },
  });

  const publicInfoMutation = useMutation({
    mutationFn: async (patch: PublicInfoPageConfigPatch) => {
      if (!orgId) {
        throw new Error('No organization context — cannot update modules.');
      }
      // Single-field patch only — see file docstring for why the whole
      // local publicInfoPage object is never sent.
      return updateOrganizationModules(orgId, { publicInfoPage: patch });
    },
    onSuccess: (updated, patch) => {
      // The PATCH response already carries the server-merged result —
      // write it straight into the cache rather than invalidating and
      // refetching, so the other three flags' checkboxes never flicker.
      if (orgId) {
        queryClient.setQueryData(ORGANIZATION_QUERY_KEY(orgId), updated);
      }
      if ('enabled' in patch) {
        addToast(
          'success',
          `Public label-info page ${patch.enabled ? 'enabled' : 'disabled'} for this tenant.`
        );
        setShowConfirmDisablePublicInfo(false);
      } else {
        addToast('success', 'Public label-info page visibility setting updated.');
      }
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.detail ??
        err?.message ??
        'Failed to update public label-info page setting.';
      addToast('error', msg);
    },
  });

  if (!isSuperAdmin) return null;

  const handleToggle = (next: boolean) => {
    if (!next) {
      // Disable → confirmation modal.
      setShowConfirmDisable(true);
      return;
    }
    mutation.mutate(true);
  };

  const handleTogglePublicInfoEnabled = (next: boolean) => {
    if (!next) {
      // Disable → confirmation modal (immediately 404s the page for
      // anonymous callers on this tenant's accessions).
      setShowConfirmDisablePublicInfo(true);
      return;
    }
    publicInfoMutation.mutate({ enabled: true });
  };

  return (
    <>
      <Card title="Tenant Modules">
        <Content>
          <Intro>
            Per-tenant module toggles. Switching a module off hides every
            related page and sidebar entry for all users in this tenant
            and stops queuing new domain events for the module's
            consumer. Posted data is preserved — never deleted.
          </Intro>

          {isLoading ? (
            <Muted>Loading…</Muted>
          ) : (
            <Row>
              <CheckboxLabel>
                <Checkbox
                  type="checkbox"
                  checked={financeEnabled}
                  disabled={mutation.isPending}
                  onChange={(e) => handleToggle(e.target.checked)}
                />
                <CheckboxText>
                  <strong>Enable Finance module</strong>
                  <Hint>
                    When on: tenants see the Finance sidebar, journal
                    entries, AP aging, posting setup, cost centres, tax
                    codes, etc. When off: purchasing forms degrade to
                    free-text for tax codes / cost centres; no events
                    are queued to the finance outbox.
                  </Hint>
                </CheckboxText>
              </CheckboxLabel>
            </Row>
          )}

          {capabilities && !capabilities.modules.finance.reachable && (
            <UnreachableNote>
              Note: finance service is currently unreachable
              (version cache: {capabilities.modules.finance.version ?? '—'}).
              The toggle still applies — the change just won't take effect
              for the consumer until finance is back.
            </UnreachableNote>
          )}
        </Content>
      </Card>

      <Card title="Public Genetics Label Page">
        <Content>
          <Intro>
            Controls the unauthenticated page a printed vessel label's QR
            code opens (<code>/i/&#123;token&#125;</code>). The master switch
            below decides whether that page exists at all for anonymous
            visitors. The four flags under it decide{' '}
            <strong>only what an anonymous stranger sees</strong> — a
            logged-in staff member scanning the same label always sees full
            detail (operator name, medium ingredients, protocol steps,
            facility name) regardless of how these are set. These are not a
            general permission; they are a public-exposure filter.
          </Intro>

          {orgQuery.isLoading ? (
            <Muted>Loading…</Muted>
          ) : !publicInfoPage ? (
            <Muted>Couldn&apos;t load current setting.</Muted>
          ) : (
            <>
              <Row>
                <CheckboxLabel>
                  <Checkbox
                    type="checkbox"
                    checked={publicInfoPage.enabled}
                    disabled={publicInfoMutation.isPending}
                    onChange={(e) => handleTogglePublicInfoEnabled(e.target.checked)}
                  />
                  <CheckboxText>
                    <strong>Enable public label-info page</strong>
                    <Hint>
                      When off: scanning a label as an anonymous visitor
                      shows &quot;No record found for this label&quot; —
                      identical to an unknown token, so this can never be
                      used to fingerprint a disabled tenant. Logged-in
                      staff are unaffected either way.
                    </Hint>
                  </CheckboxText>
                </CheckboxLabel>
              </Row>

              <SubRow>
                <SubRowLabel>What an anonymous scan reveals</SubRowLabel>
                {PUBLIC_INFO_SHOW_FLAGS.map((flag) => (
                  <CheckboxLabel key={flag.key}>
                    <Checkbox
                      type="checkbox"
                      checked={publicInfoPage[flag.key]}
                      disabled={publicInfoMutation.isPending || !publicInfoPage.enabled}
                      onChange={(e) =>
                        publicInfoMutation.mutate({ [flag.key]: e.target.checked })
                      }
                    />
                    <CheckboxText>
                      <strong>{flag.label}</strong>
                      <Hint>{flag.hint}</Hint>
                    </CheckboxText>
                  </CheckboxLabel>
                ))}
              </SubRow>
            </>
          )}
        </Content>
      </Card>

      {showConfirmDisable && (
        <ModalOverlay>
          {/* Reason: overlay click does NOT close — modals must close only
              via explicit user action (X / Cancel / Confirm). */}
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Disable Finance Module?</ModalTitle>
              <CloseButton
                aria-label="Close"
                onClick={() => setShowConfirmDisable(false)}
                disabled={mutation.isPending}
              >
                <X size={16} strokeWidth={1.8} />
              </CloseButton>
            </ModalHeader>
            <ModalBody>
              <p>
                Disabling the Finance module hides all finance-only
                routes for every user in this tenant. Posted journal
                entries are <strong>preserved</strong> but not visible
                until the module is re-enabled.
              </p>
              <p>
                Purchasing forms will keep working — tax codes and cost
                centres become free-text inputs.
              </p>
              <p>Proceed?</p>
            </ModalBody>
            <ModalActions>
              <SecondaryButton
                onClick={() => setShowConfirmDisable(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </SecondaryButton>
              <DangerButton
                onClick={() => mutation.mutate(false)}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Disabling…' : 'Disable Finance'}
              </DangerButton>
            </ModalActions>
          </ModalContent>
        </ModalOverlay>
      )}

      {showConfirmDisablePublicInfo && (
        <ModalOverlay>
          {/* Reason: overlay click does NOT close — modals must close only
              via explicit user action (X / Cancel / Confirm). */}
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Disable Public Label-Info Page?</ModalTitle>
              <CloseButton
                aria-label="Close"
                onClick={() => setShowConfirmDisablePublicInfo(false)}
                disabled={publicInfoMutation.isPending}
              >
                <X size={16} strokeWidth={1.8} />
              </CloseButton>
            </ModalHeader>
            <ModalBody>
              <p>
                Disabling this immediately 404s{' '}
                <code>/i/&#123;token&#125;</code> for anonymous visitors on
                every one of this tenant&apos;s printed vessel labels —
                identical to an unknown token, so a disabled tenant can&apos;t
                be distinguished from one that never existed.
              </p>
              <p>
                Logged-in staff are <strong>unaffected</strong> — this is a
                public-exposure switch, not an access-control gate for
                authenticated users.
              </p>
              <p>Proceed?</p>
            </ModalBody>
            <ModalActions>
              <SecondaryButton
                onClick={() => setShowConfirmDisablePublicInfo(false)}
                disabled={publicInfoMutation.isPending}
              >
                Cancel
              </SecondaryButton>
              <DangerButton
                onClick={() => publicInfoMutation.mutate({ enabled: false })}
                disabled={publicInfoMutation.isPending}
              >
                {publicInfoMutation.isPending ? 'Disabling…' : 'Disable Public Page'}
              </DangerButton>
            </ModalActions>
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
  gap: 1rem;
`;

const Intro = styled.p`
  margin: 0;
  font-size: 0.875rem;
  color: ${({ theme }: any) => theme.colors.textSecondary};
  line-height: 1.5;
`;

const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

// Indented/bordered sub-group for the four show* flags — visually subordinate
// to the master `enabled` switch above (Row), signalling "these only matter
// while the master switch is on" without needing separate disabled-section
// chrome.
const SubRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  margin-left: 1.75rem;
  padding-left: 0.875rem;
  border-left: 2px solid ${({ theme }: any) => theme.colors.glass.border};
`;

const SubRowLabel = styled.span`
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: ${({ theme }: any) => theme.colors.textSecondary};
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  cursor: pointer;
`;

const Checkbox = styled.input`
  margin-top: 4px;
  width: 16px;
  height: 16px;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const CheckboxText = styled.span`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: ${({ theme }: any) => theme.colors.textPrimary};
`;

const Hint = styled.span`
  color: ${({ theme }: any) => theme.colors.textSecondary};
  font-size: 0.8125rem;
  line-height: 1.5;
`;

const Muted = styled.div`
  color: ${({ theme }: any) => theme.colors.textSecondary};
  font-size: 0.875rem;
`;

const UnreachableNote = styled.div`
  background: ${({ theme }: any) => theme.colors.warningBg};
  border: 1px solid ${({ theme }: any) => theme.colors.warning};
  color: ${({ theme }: any) => theme.colors.warning};
  padding: 0.625rem 0.875rem;
  border-radius: 6px;
  font-size: 0.8125rem;
`;

// ── Modal styles ────────────────────────────────────────────────────────

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  /* Cosmos scrim, spec §4 "Modals/drawers" (rgba(10,14,36,.6)). */
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
  max-width: 480px;
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

const ModalTitle = styled.h2`
  margin: 0;
  font-size: 1.125rem;
  color: ${({ theme }: any) => theme.colors.textPrimary};
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
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

const ModalActions = styled.div`
  padding: 1rem 1.25rem;
  border-top: 1px solid ${({ theme }: any) => theme.colors.line};
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
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

// Destructive action — coral-b tinted glass, never solid red (spec §4).
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

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
