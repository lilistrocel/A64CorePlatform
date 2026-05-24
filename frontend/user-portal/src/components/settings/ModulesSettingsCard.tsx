/**
 * ModulesSettingsCard — Wave 0 (T-059.4)
 *
 * Super_admin-only Tenant Settings → Modules section. Lets a tenant
 * operator toggle the finance module on/off. Confirmation modal on
 * disable. Audit-logged on the backend.
 *
 * Modals close ONLY via X/Cancel/Confirm — never on overlay click
 * (project preference: no accidental dismissal of data-entry modals).
 */

import { useState } from 'react';
import styled from 'styled-components';
import { Card } from '@a64core/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth.store';
import { useToastStore } from '../../stores/toast.store';
import {
  useCapabilities,
  CAPABILITIES_QUERY_KEY,
} from '../../hooks/useCapabilities';
import { updateOrganizationModules } from '../../services/systemService';

export function ModulesSettingsCard() {
  const { user, refreshUser } = useAuthStore();
  const { addToast } = useToastStore();
  const queryClient = useQueryClient();
  const { data: capabilities, isLoading } = useCapabilities();

  const [showConfirmDisable, setShowConfirmDisable] = useState(false);

  const orgId = user?.organizationId ?? null;
  const isSuperAdmin = user?.role === 'super_admin';
  const financeEnabled = capabilities?.modules.finance.enabled ?? false;

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

  if (!isSuperAdmin) return null;

  const handleToggle = (next: boolean) => {
    if (!next) {
      // Disable → confirmation modal.
      setShowConfirmDisable(true);
      return;
    }
    mutation.mutate(true);
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
                ×
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
  background: #fef3c7;
  border: 1px solid #f59e0b;
  color: #92400e;
  padding: 0.625rem 0.875rem;
  border-radius: 6px;
  font-size: 0.8125rem;
`;

// ── Modal styles ────────────────────────────────────────────────────────

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
`;

const ModalContent = styled.div`
  background: ${({ theme }: any) => theme.colors.background};
  border-radius: 8px;
  max-width: 480px;
  width: 100%;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
  padding: 1rem 1.25rem;
  border-bottom: 1px solid ${({ theme }: any) => theme.colors.neutral[200]};
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
    background: ${({ theme }: any) => theme.colors.neutral[100]};
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
  border-top: 1px solid ${({ theme }: any) => theme.colors.neutral[200]};
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
`;

const SecondaryButton = styled.button`
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  background: ${({ theme }: any) => theme.colors.background};
  color: ${({ theme }: any) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }: any) => theme.colors.neutral[300]};
  border-radius: 6px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }: any) => theme.colors.neutral[50]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DangerButton = styled.button`
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  background: ${({ theme }: any) => theme.colors.error?.[500] ?? '#dc2626'};
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }: any) => theme.colors.error?.[600] ?? '#b91c1c'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
