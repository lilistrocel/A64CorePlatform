/**
 * ChartOfAccountsPage
 *
 * Two-pane GL Chart of Accounts management page.
 * Left pane: hierarchical account tree grouped by drawer.
 * Right pane: read-only detail for the selected account, plus Edit / Deactivate actions.
 *
 * Modals do NOT close on overlay click — X button only.
 * (Project-wide rule: data-entry modals close via X button, never on backdrop click.)
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { useAuthStore } from '../../stores/auth.store';
import { showSuccessToast } from '../../stores/toast.store';
import {
  useFinanceAccounts,
  useCreateFinanceAccount,
  useUpdateFinanceAccount,
  useDeactivateFinanceAccount,
  useReactivateFinanceAccount,
} from '../../hooks/queries/useFinanceAccounts';
import {
  DRAWER_ORDER,
  DRAWER_LABELS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_LEVEL_LABELS,
  ACCOUNT_ROLE_LABELS,
  type GLAccount,
  type GLAccountCreate,
  type DrawerEnum,
  type AccountTypeEnum,
  type AccountLevel,
  type AccountRole,
} from '../../services/financeAccountsService';
import { parseApiErrors } from '../../utils/apiErrors';
import type { ApiErrorItem } from '../../utils/apiErrors';

// ─── Role gate ─────────────────────────────────────────────────────────────────

const WRITE_ROLES = new Set(['finance_admin', 'super_admin', 'admin']);
const PLATFORM_DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

// ─── API field map for 422 errors ──────────────────────────────────────────────

const ACCOUNT_FIELD_MAP: Record<string, string> = {
  account_number: 'accountNumber',
  accountNumber: 'accountNumber',
  account_name: 'accountName',
  accountName: 'accountName',
  description: 'description',
  drawer: 'drawer',
  account_type: 'accountType',
  accountType: 'accountType',
  account_level: 'accountLevel',
  accountLevel: 'accountLevel',
  account_role: 'accountRole',
  accountRole: 'accountRole',
  ifrs_tag: 'ifrsTag',
  ifrsTag: 'ifrsTag',
  parent_account_id: 'parentAccountId',
  parentAccountId: 'parentAccountId',
  is_header: 'isHeader',
  isHeader: 'isHeader',
  is_active: 'isActive',
  isActive: 'isActive',
  organization_id: 'organizationId',
  organizationId: 'organizationId',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

/** Build a depth-first list of accounts in tree order within a drawer. */
function buildTree(
  accounts: GLAccount[],
  parentId: string | null = null,
  depth: number = 0
): Array<{ account: GLAccount; depth: number }> {
  const children = accounts.filter((a) => a.parentAccountId === parentId);
  const result: Array<{ account: GLAccount; depth: number }> = [];
  for (const child of children) {
    result.push({ account: child, depth });
    result.push(...buildTree(accounts, child.accountId, depth + 1));
  }
  return result;
}

// ─── Styled components ─────────────────────────────────────────────────────────

const PageContainer = styled.div`
  padding: 24px 32px;
  max-width: 1600px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const ToolbarRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 200px;
  padding: 9px 13px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &::placeholder { color: ${({ theme }) => theme.colors.text.tertiary}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
`;

const FilterSelect = styled.select`
  padding: 9px 13px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
`;

const PrimaryButton = styled.button`
  padding: 9px 18px;
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.accent.sageDeep}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  padding: 8px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; color: ${({ theme }) => theme.colors.text.primary}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const DangerButton = styled.button`
  padding: 8px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.status.danger};
  border: 1px solid ${({ theme }) => theme.colors.status.danger};
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.status.danger}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SuccessButton = styled.button`
  padding: 8px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.status.success || '#0F6E56'};
  border: 1px solid ${({ theme }) => theme.colors.status.success || '#0F6E56'};
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.accent.sageSoft || '#ecfdf5'}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const TwoPaneLayout = styled.div`
  display: grid;
  grid-template-columns: 40% 60%;
  gap: 20px;
  align-items: start;

  @media (max-width: 1023px) {
    grid-template-columns: 1fr;
  }
`;

// ─── Left pane — account tree ──────────────────────────────────────────────────

const TreePanel = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 12px;
  overflow: hidden;
  /* Allow the tree to scroll independently on tall viewports */
  max-height: calc(100vh - 220px);
  overflow-y: auto;
`;

const DrawerSection = styled.div``;

const DrawerHeader = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 16px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }
`;

const DrawerLabel = styled.span`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const DrawerCaret = styled.span<{ $open: boolean }>`
  font-size: 11px;
  transition: transform 0.15s ease;
  transform: ${({ $open }) => ($open ? 'rotate(0deg)' : 'rotate(-90deg)')};
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const DrawerCount = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  margin-left: 6px;
`;

interface AccountRowProps {
  $depth: number;
  $isHeader: boolean;
  $isActive: boolean;
  $isSelected: boolean;
}

const AccountRow = styled.button<AccountRowProps>`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 16px;
  padding-left: ${({ $depth }) => 16 + $depth * 20}px;
  background: ${({ $isSelected, theme }) =>
    $isSelected ? `${theme.colors.accent.sage}15` : 'transparent'};
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  opacity: ${({ $isActive }) => ($isActive ? 1 : 0.55)};
  transition: background 100ms ease;

  &:hover {
    background: ${({ $isSelected, theme }) =>
      $isSelected ? `${theme.colors.accent.sage}20` : theme.colors.surface.canvas};
  }

  &:last-child {
    border-bottom: none;
  }
`;

const AccountNumber = styled.span<{ $isHeader: boolean }>`
  font-size: 12px;
  font-weight: ${({ $isHeader }) => ($isHeader ? 700 : 400)};
  color: ${({ $isHeader, theme }) => ($isHeader ? theme.colors.text.primary : theme.colors.text.secondary)};
  font-family: 'JetBrains Mono', monospace;
  min-width: 110px;
  flex-shrink: 0;
`;

const AccountName = styled.span<{ $isHeader: boolean }>`
  font-size: 13px;
  font-weight: ${({ $isHeader }) => ($isHeader ? 600 : 400)};
  color: ${({ theme }) => theme.colors.text.primary};
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const BadgePill = styled.span<{ $variant: 'control' | 'inactive' | 'locked' }>`
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 600;
  flex-shrink: 0;
  ${({ $variant, theme }) => {
    if ($variant === 'control') {
      return `
        background: ${theme.colors.surface.sunken || 'rgba(15,110,86,0.05)'};
        color: ${theme.colors.status.info || '#0F6E56'};
      `;
    }
    if ($variant === 'inactive') {
      return `
        background: ${theme.colors.surface.raised};
        color: ${theme.colors.text.tertiary};
      `;
    }
    // locked
    return `
      background: ${theme.colors.status.warning || '#fffbeb'};
      color: ${theme.colors.status.warning || '#B8842A'};
    `;
  }}
`;

// ─── Right pane — detail ───────────────────────────────────────────────────────

const DetailPanel = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 12px;
  padding: 28px;
`;

const EmptyDetail = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  font-size: 14px;
`;

const DetailHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  gap: 16px;
`;

const DetailTitle = styled.div``;

const DetailAccountNumber = styled.div`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  font-family: 'JetBrains Mono', monospace;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const DetailAccountName = styled.div`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-top: 4px;
`;

const DetailActions = styled.div`
  display: flex;
  gap: 8px;
  flex-shrink: 0;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 24px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const FieldItem = styled.div``;

const FieldLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.text.tertiary};
  margin-bottom: 4px;
`;

const FieldValue = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const ParentLink = styled.button`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.accent.sage};
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
  &:hover { color: ${({ theme }) => theme.colors.accent.sageDeep}; }
`;

const StatusBadge = styled.span<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.accent.sageSoft || '#ecfdf5' : theme.colors.surface.raised};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.status.success || '#0F6E56' : theme.colors.text.tertiary};
`;

const FlagRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
`;

/** Multi-line description text in the detail pane. */
const DetailDescription = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
`;

/**
 * Pill badge for accountLevel.
 * active = green, title = neutral-blue, drawer = warm amber.
 */
const LevelBadge = styled.span<{ $level: AccountLevel }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  ${({ $level, theme }) => {
    if ($level === 'active') {
      return `
        background: ${theme.colors.accent.sageSoft || '#ecfdf5'};
        color: ${theme.colors.status.success || '#0F6E56'};
      `;
    }
    if ($level === 'title') {
      return `
        background: ${theme.colors.surface.sunken || 'rgba(15,110,86,0.05)'};
        color: ${theme.colors.status.info || '#0F6E56'};
      `;
    }
    // drawer
    return `
      background: ${theme.colors.status.warning || '#fffbeb'};
      color: ${theme.colors.status.warning || '#B8842A'};
    `;
  }}
`;

/** Pill badge for accountRole — neutral style. */
const RoleBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ theme }) => theme.colors.surface.raised};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

/** Small inline label for IFRS tag. */
const IfrsTagLabel = styled.span`
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  padding: 2px 8px;
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.surface.raised};
  color: ${({ theme }) => theme.colors.text.secondary};
  letter-spacing: 0.5px;
`;

// ─── Modal styled components ───────────────────────────────────────────────────
// Mirrors VendorsPage modal pattern exactly.

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 16px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  flex-shrink: 0;
`;

const ModalTitle = styled.h2`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text.secondary};
  padding: 4px;
  border-radius: 6px;
  line-height: 1;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }
`;

const ModalBody = styled.div`
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
`;

const ModalFooter = styled.div`
  padding: 16px 28px 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  flex-shrink: 0;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  @media (max-width: 600px) { grid-template-columns: 1fr; }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FormLabel = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const FormInput = styled.input<{ $hasError?: boolean }>`
  padding: 10px 14px;
  border: 1px solid ${({ $hasError, theme }) =>
    $hasError ? theme.colors.status.danger : theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  font-family: inherit;
  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) =>
      $hasError ? theme.colors.status.danger : theme.colors.accent.sage};
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; background: ${({ theme }) => theme.colors.surface.canvas}; }
`;

const FormTextarea = styled.textarea<{ $hasError?: boolean }>`
  padding: 10px 14px;
  border: 1px solid ${({ $hasError, theme }) =>
    $hasError ? theme.colors.status.danger : theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  font-family: inherit;
  resize: vertical;
  min-height: 72px;
  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) =>
      $hasError ? theme.colors.status.danger : theme.colors.accent.sage};
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; background: ${({ theme }) => theme.colors.surface.canvas}; }
`;

const FormSelect = styled.select<{ $hasError?: boolean }>`
  padding: 10px 14px;
  border: 1px solid ${({ $hasError, theme }) =>
    $hasError ? theme.colors.status.danger : theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
  font-family: inherit;
  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) =>
      $hasError ? theme.colors.status.danger : theme.colors.accent.sage};
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; background: ${({ theme }) => theme.colors.surface.canvas}; }
`;

const FieldError = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.status.danger};
  margin-top: 2px;
`;

const BannerError = styled.p`
  color: ${({ theme }) => theme.colors.status.danger};
  font-size: 13px;
  margin: 0;
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.status.danger};
  border-radius: 8px;
`;

const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
`;

const HintText = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

// ─── Confirm dialog ────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

function ConfirmDialog({ message, onConfirm, onCancel, isPending }: ConfirmDialogProps) {
  return (
    <ModalOverlay>
      {/* Modal must NOT close on overlay click */}
      <Modal onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <ModalHeader>
          <ModalTitle>Confirm</ModalTitle>
          <CloseButton onClick={onCancel} aria-label="Cancel">✕</CloseButton>
        </ModalHeader>
        <ModalBody>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{message}</p>
        </ModalBody>
        <ModalFooter>
          <SecondaryButton onClick={onCancel} disabled={isPending}>Cancel</SecondaryButton>
          <DangerButton onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Working...' : 'Confirm'}
          </DangerButton>
        </ModalFooter>
      </Modal>
    </ModalOverlay>
  );
}

// ─── Account form modal ────────────────────────────────────────────────────────

interface AccountFormState {
  accountNumber: string;
  accountName: string;
  description: string;
  drawer: DrawerEnum | '';
  accountType: AccountTypeEnum | '';
  accountLevel: AccountLevel;
  accountRole: AccountRole;
  ifrsTag: string;
  parentAccountId: string;
  isHeader: boolean;
  isActive: boolean;
}

interface AccountFormModalProps {
  account?: GLAccount | null;   // null/undefined = create mode
  allAccounts: GLAccount[];
  organizationId: string;
  onClose: () => void;
  onSaved: (saved: GLAccount) => void;
}

function AccountFormModal({
  account,
  allAccounts,
  organizationId,
  onClose,
  onSaved,
}: AccountFormModalProps) {
  const isEdit = !!account;

  const [form, setForm] = useState<AccountFormState>({
    accountNumber: account?.accountNumber ?? '',
    accountName: account?.accountName ?? '',
    description: account?.description ?? '',
    drawer: account?.drawer ?? '',
    accountType: account?.accountType ?? '',
    accountLevel: account?.accountLevel ?? 'active',
    accountRole: account?.accountRole ?? null,
    ifrsTag: account?.ifrsTag ?? '',
    parentAccountId: account?.parentAccountId ?? '',
    isHeader: account?.isHeader ?? false,
    isActive: account?.isActive ?? true,
  });

  const [bannerError, setBannerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const createMutation = useCreateFinanceAccount();
  const updateMutation = useUpdateFinanceAccount();
  const isLoading = createMutation.isPending || updateMutation.isPending;

  /** Accounts in the same drawer that can be selected as parent. */
  const parentCandidates = useMemo(() => {
    if (!form.drawer) return [];
    return allAccounts.filter(
      (a) => a.drawer === form.drawer && a.accountId !== account?.accountId
    );
  }, [allAccounts, form.drawer, account?.accountId]);

  const set = useCallback(
    (key: keyof AccountFormState) =>
      (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >
      ) => {
        const value =
          e.target.type === 'checkbox'
            ? (e.target as HTMLInputElement).checked
            : e.target.value;
        setForm((f) => ({ ...f, [key]: value }));
        if (fieldErrors[key as string]) {
          setFieldErrors((prev) => {
            const next = { ...prev };
            delete next[key as string];
            return next;
          });
        }
      },
    [fieldErrors]
  );

  /**
   * Special setter for accountRole — converts the empty string sentinel
   * (used by the "None" <option>) back to null before storing in state.
   */
  const setAccountRole = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const raw = e.target.value;
      const value: AccountRole = raw === '' ? null : (raw as Exclude<AccountRole, null>);
      setForm((f) => ({ ...f, accountRole: value }));
      if (fieldErrors['accountRole']) {
        setFieldErrors((prev) => {
          const next = { ...prev };
          delete next['accountRole'];
          return next;
        });
      }
    },
    [fieldErrors]
  );

  const VALID_ACCOUNT_LEVELS: AccountLevel[] = ['drawer', 'title', 'active'];
  const VALID_ACCOUNT_ROLES: Exclude<AccountRole, null>[] = [
    'posting', 'bank', 'cash', 'reconciliation', 'clearing',
    'contra', 'revenue', 'expense', 'other',
  ];

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!form.accountNumber.trim()) errors.accountNumber = 'Account number is required.';
    if (!form.accountName.trim()) errors.accountName = 'Account name is required.';
    if (!form.drawer) errors.drawer = 'Drawer is required.';
    if (!form.accountType) errors.accountType = 'Account type is required.';
    if (form.description && form.description.length > 500) {
      errors.description = 'Description must be 500 characters or fewer.';
    }
    if (!VALID_ACCOUNT_LEVELS.includes(form.accountLevel)) {
      errors.accountLevel = 'Account level must be drawer, title, or active.';
    }
    if (form.accountRole !== null && !VALID_ACCOUNT_ROLES.includes(form.accountRole as Exclude<AccountRole, null>)) {
      errors.accountRole = 'Invalid account role.';
    }
    if (form.ifrsTag && form.ifrsTag.length > 10) {
      errors.ifrsTag = 'IFRS tag must be 10 characters or fewer.';
    }
    return errors;
  }

  const handleSubmit = async () => {
    setBannerError(null);
    const clientErrors = validate();
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }
    setFieldErrors({});

    try {
      let saved: GLAccount;
      if (isEdit) {
        saved = await updateMutation.mutateAsync({
          accountId: account!.accountId,
          orgId: organizationId,
          data: {
            accountName: form.accountName || undefined,
            description: form.description.trim() || null,
            accountRole: form.accountRole,
            ifrsTag: form.ifrsTag.trim() || null,
            parentAccountId: form.parentAccountId || null,
            isHeader: form.isHeader,
            isActive: form.isActive,
          },
        });
      } else {
        const payload: GLAccountCreate = {
          organizationId,
          accountNumber: form.accountNumber,
          accountName: form.accountName,
          description: form.description.trim() || null,
          drawer: form.drawer as DrawerEnum,
          accountType: form.accountType as AccountTypeEnum,
          accountLevel: form.accountLevel,
          accountRole: form.accountRole,
          ifrsTag: form.ifrsTag.trim() || null,
          parentAccountId: form.parentAccountId || null,
          isHeader: form.isHeader,
          isActive: form.isActive,
        };
        saved = await createMutation.mutateAsync(payload);
      }
      onSaved(saved);
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { detail?: unknown }; status?: number };
        message?: string;
      };
      const detail = axiosErr?.response?.data?.detail;

      if (Array.isArray(detail)) {
        const parsed = parseApiErrors(detail as ApiErrorItem[], ACCOUNT_FIELD_MAP);
        const { __banner__, ...perField } = parsed;
        setFieldErrors(perField);
        if (__banner__) setBannerError(__banner__);
      } else if (typeof detail === 'string') {
        setBannerError(detail);
      } else {
        setBannerError(axiosErr?.message ?? 'An unexpected error occurred. Please try again.');
      }
    }
  };

  return (
    <ModalOverlay>
      {/* Modal must NOT close on overlay click — X button only */}
      <Modal onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>{isEdit ? 'Edit Account' : 'New Account'}</ModalTitle>
          <CloseButton onClick={onClose} aria-label="Close modal">✕</CloseButton>
        </ModalHeader>
        <ModalBody>
          {bannerError && <BannerError role="alert">{bannerError}</BannerError>}

          {/* Row 1: Account Number + Account Name */}
          <FormRow>
            <Field>
              <FormLabel htmlFor="af-accountNumber">Account Number *</FormLabel>
              <FormInput
                id="af-accountNumber"
                value={form.accountNumber}
                onChange={set('accountNumber')}
                placeholder="e.g. 110000 or 110000-001"
                disabled={isEdit && (account?.isLockedNumber ?? false)}
                $hasError={!!fieldErrors.accountNumber}
                aria-describedby={fieldErrors.accountNumber ? 'af-an-err' : undefined}
                aria-invalid={!!fieldErrors.accountNumber}
              />
              {isEdit && account?.isLockedNumber && (
                <HintText>Account number is locked and cannot be changed.</HintText>
              )}
              {fieldErrors.accountNumber && (
                <FieldError id="af-an-err" role="alert">{fieldErrors.accountNumber}</FieldError>
              )}
            </Field>
            <Field>
              <FormLabel htmlFor="af-accountName">Account Name *</FormLabel>
              <FormInput
                id="af-accountName"
                value={form.accountName}
                onChange={set('accountName')}
                placeholder="Descriptive account name"
                $hasError={!!fieldErrors.accountName}
                aria-describedby={fieldErrors.accountName ? 'af-name-err' : undefined}
                aria-invalid={!!fieldErrors.accountName}
              />
              {fieldErrors.accountName && (
                <FieldError id="af-name-err" role="alert">{fieldErrors.accountName}</FieldError>
              )}
            </Field>
          </FormRow>

          {/* Description — full width */}
          <Field>
            <FormLabel htmlFor="af-description">Description</FormLabel>
            <FormTextarea
              id="af-description"
              value={form.description}
              onChange={set('description')}
              placeholder="Optional free-text description (max 500 characters)"
              rows={3}
              maxLength={500}
              $hasError={!!fieldErrors.description}
              aria-describedby={fieldErrors.description ? 'af-desc-err' : undefined}
              aria-invalid={!!fieldErrors.description}
            />
            {fieldErrors.description && (
              <FieldError id="af-desc-err" role="alert">{fieldErrors.description}</FieldError>
            )}
          </Field>

          {/* Row 2: Drawer + Account Type */}
          <FormRow>
            <Field>
              <FormLabel htmlFor="af-drawer">Drawer *</FormLabel>
              <FormSelect
                id="af-drawer"
                value={form.drawer}
                onChange={set('drawer')}
                disabled={isEdit}
                $hasError={!!fieldErrors.drawer}
                aria-invalid={!!fieldErrors.drawer}
              >
                <option value="">— Select —</option>
                {DRAWER_ORDER.map((d) => (
                  <option key={d} value={d}>{DRAWER_LABELS[d]}</option>
                ))}
              </FormSelect>
              {isEdit && (
                <HintText>Drawer cannot be changed after creation.</HintText>
              )}
              {fieldErrors.drawer && (
                <FieldError role="alert">{fieldErrors.drawer}</FieldError>
              )}
            </Field>
            <Field>
              <FormLabel htmlFor="af-accountType">Account Type *</FormLabel>
              <FormSelect
                id="af-accountType"
                value={form.accountType}
                onChange={set('accountType')}
                disabled={isEdit}
                $hasError={!!fieldErrors.accountType}
                aria-invalid={!!fieldErrors.accountType}
              >
                <option value="">— Select —</option>
                {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountTypeEnum[]).map((t) => (
                  <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
                ))}
              </FormSelect>
              {isEdit && (
                <HintText>Account type cannot be changed after creation.</HintText>
              )}
              {fieldErrors.accountType && (
                <FieldError role="alert">{fieldErrors.accountType}</FieldError>
              )}
            </Field>
          </FormRow>

          {/* Row 3: Account Level + Account Role */}
          <FormRow>
            <Field>
              <FormLabel htmlFor="af-accountLevel">Account Level *</FormLabel>
              <FormSelect
                id="af-accountLevel"
                value={form.accountLevel}
                onChange={set('accountLevel')}
                disabled={isEdit}
                $hasError={!!fieldErrors.accountLevel}
                aria-invalid={!!fieldErrors.accountLevel}
                aria-describedby={fieldErrors.accountLevel ? 'af-level-err' : undefined}
              >
                <option value="drawer">Drawer</option>
                <option value="title">Title (intermediate)</option>
                <option value="active">Active (postable)</option>
              </FormSelect>
              {isEdit ? (
                <HintText>Cannot change after creation — changing level affects posting eligibility.</HintText>
              ) : (
                <HintText>Only "Active" accounts can receive journal postings.</HintText>
              )}
              {fieldErrors.accountLevel && (
                <FieldError id="af-level-err" role="alert">{fieldErrors.accountLevel}</FieldError>
              )}
            </Field>
            <Field>
              <FormLabel htmlFor="af-accountRole">Account Role</FormLabel>
              <FormSelect
                id="af-accountRole"
                value={form.accountRole ?? ''}
                onChange={setAccountRole}
                $hasError={!!fieldErrors.accountRole}
                aria-invalid={!!fieldErrors.accountRole}
                aria-describedby={fieldErrors.accountRole ? 'af-role-err' : undefined}
              >
                <option value="">— None —</option>
                <option value="posting">Posting</option>
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
                <option value="reconciliation">Reconciliation</option>
                <option value="clearing">Clearing</option>
                <option value="contra">Contra</option>
                <option value="revenue">Revenue</option>
                <option value="expense">Expense</option>
                <option value="other">Other</option>
              </FormSelect>
              {fieldErrors.accountRole && (
                <FieldError id="af-role-err" role="alert">{fieldErrors.accountRole}</FieldError>
              )}
            </Field>
          </FormRow>

          {/* Row 4: Parent Account + IFRS Tag */}
          <FormRow>
            <Field>
              <FormLabel htmlFor="af-parent">Parent Account</FormLabel>
              <FormSelect
                id="af-parent"
                value={form.parentAccountId}
                onChange={set('parentAccountId')}
                disabled={!form.drawer}
              >
                <option value="">— None (top-level in drawer) —</option>
                {parentCandidates.map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.accountNumber} — {a.accountName}
                  </option>
                ))}
              </FormSelect>
              {!form.drawer && (
                <HintText>Select a drawer first to enable parent selection.</HintText>
              )}
            </Field>
            <Field>
              <FormLabel htmlFor="af-ifrsTag">IFRS Tag</FormLabel>
              <FormInput
                id="af-ifrsTag"
                value={form.ifrsTag}
                onChange={set('ifrsTag')}
                placeholder="e.g. IAS16"
                maxLength={10}
                $hasError={!!fieldErrors.ifrsTag}
                aria-describedby={fieldErrors.ifrsTag ? 'af-ifrs-err' : undefined}
                aria-invalid={!!fieldErrors.ifrsTag}
              />
              {fieldErrors.ifrsTag && (
                <FieldError id="af-ifrs-err" role="alert">{fieldErrors.ifrsTag}</FieldError>
              )}
            </Field>
          </FormRow>

          {/* Row 5: Is Header + Active flags */}
          <FormRow>
            <Field>
              <CheckboxRow htmlFor="af-isHeader">
                <input
                  id="af-isHeader"
                  type="checkbox"
                  checked={form.isHeader}
                  onChange={set('isHeader')}
                />
                Is Header (section title, cannot post to)
              </CheckboxRow>
            </Field>
            <Field>
              <CheckboxRow htmlFor="af-isActive">
                <input
                  id="af-isActive"
                  type="checkbox"
                  checked={form.isActive}
                  onChange={set('isActive')}
                />
                Active
              </CheckboxRow>
            </Field>
          </FormRow>
        </ModalBody>
        <ModalFooter>
          <SecondaryButton onClick={onClose} disabled={isLoading}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Account'}
          </PrimaryButton>
        </ModalFooter>
      </Modal>
    </ModalOverlay>
  );
}

// ─── Main page component ───────────────────────────────────────────────────────

export function ChartOfAccountsPage() {
  const { user } = useAuthStore();
  // Reason: showSuccessToast is a module-level helper, imported directly above.

  // Determine org ID from user state.
  // Runtime shape has userId (not id) per project memory.
  // organizationId is now typed on the User interface — no cast needed.
  const organizationId: string = useMemo(() => {
    if (user?.organizationId) return user.organizationId;
    // For super_admin, fall back to platform default org.
    if (user?.role === 'super_admin') return PLATFORM_DEFAULT_ORG;
    return '';
  }, [user]);

  const canWrite = WRITE_ROLES.has(user?.role ?? '');

  // ── Filters ────────────────────────────────────────────────────────────────

  const [searchText, setSearchText] = useState('');
  const [drawerFilter, setDrawerFilter] = useState<DrawerEnum | ''>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // ── Data fetch ─────────────────────────────────────────────────────────────

  const { data, isLoading, isError } = useFinanceAccounts(organizationId);
  const allAccounts: GLAccount[] = data?.items ?? [];

  // ── Selection state ────────────────────────────────────────────────────────

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const selectedAccount = useMemo(
    () => allAccounts.find((a) => a.accountId === selectedAccountId) ?? null,
    [allAccounts, selectedAccountId]
  );

  // ── Drawer collapse state ──────────────────────────────────────────────────

  const [collapsedDrawers, setCollapsedDrawers] = useState<Set<DrawerEnum>>(new Set());

  const toggleDrawer = useCallback((drawer: DrawerEnum) => {
    setCollapsedDrawers((prev) => {
      const next = new Set(prev);
      if (next.has(drawer)) next.delete(drawer);
      else next.add(drawer);
      return next;
    });
  }, []);

  // ── Modal state ────────────────────────────────────────────────────────────

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<GLAccount | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const deactivateMutation = useDeactivateFinanceAccount();
  const reactivateMutation = useReactivateFinanceAccount();

  // ── Computed tree data ─────────────────────────────────────────────────────

  /**
   * Client-side filter: applied to search + drawer filter + active filter.
   * The tree structure is built per-drawer from the filtered set.
   */
  const filteredAccounts = useMemo(() => {
    let result = allAccounts;

    if (activeFilter === 'active') result = result.filter((a) => a.isActive);
    else if (activeFilter === 'inactive') result = result.filter((a) => !a.isActive);

    if (drawerFilter) result = result.filter((a) => a.drawer === drawerFilter);

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.accountNumber.toLowerCase().includes(q) ||
          a.accountName.toLowerCase().includes(q)
      );
    }

    return result;
  }, [allAccounts, activeFilter, drawerFilter, searchText]);

  // Build a lookup from accountId → account for resolving parentAccountId in the detail pane.
  const accountLookup = useMemo(
    () => new Map(allAccounts.map((a) => [a.accountId, a])),
    [allAccounts]
  );

  // Group filtered accounts by drawer for rendering.
  const accountsByDrawer = useMemo(() => {
    const map = new Map<DrawerEnum, GLAccount[]>();
    for (const drawer of DRAWER_ORDER) map.set(drawer, []);
    for (const account of filteredAccounts) {
      map.get(account.drawer)?.push(account);
    }
    return map;
  }, [filteredAccounts]);

  // ── Event handlers ─────────────────────────────────────────────────────────

  const handleSelectAccount = useCallback((accountId: string) => {
    setSelectedAccountId(accountId);
  }, []);

  const openCreate = () => {
    setEditingAccount(null);
    setShowFormModal(true);
  };

  const openEdit = (account: GLAccount) => {
    setEditingAccount(account);
    setShowFormModal(true);
  };

  const closeModal = () => {
    setShowFormModal(false);
    setEditingAccount(null);
  };

  const handleSaved = (saved: GLAccount) => {
    closeModal();
    showSuccessToast(
      editingAccount
        ? `Account ${saved.accountNumber} updated.`
        : `Account ${saved.accountNumber} created.`
    );
    setSelectedAccountId(saved.accountId);
  };

  const handleDeactivate = async () => {
    if (!selectedAccount) return;
    try {
      await deactivateMutation.mutateAsync({
        accountId: selectedAccount.accountId,
        orgId: organizationId,
      });
      showSuccessToast(`Account ${selectedAccount.accountNumber} deactivated.`);
      setConfirmDeactivate(false);
      setSelectedAccountId(null);
    } catch {
      setConfirmDeactivate(false);
    }
  };

  const handleReactivate = async () => {
    if (!selectedAccount) return;
    try {
      await reactivateMutation.mutateAsync({
        accountId: selectedAccount.accountId,
        orgId: organizationId,
      });
      showSuccessToast(`Account ${selectedAccount.accountNumber} reactivated.`);
      setConfirmReactivate(false);
    } catch {
      setConfirmReactivate(false);
    }
  };

  // Clear selection if the account disappears from the filtered set.
  useEffect(() => {
    if (
      selectedAccountId &&
      !filteredAccounts.some((a) => a.accountId === selectedAccountId)
    ) {
      setSelectedAccountId(null);
    }
  }, [filteredAccounts, selectedAccountId]);

  // ── No org guard ────────────────────────────────────────────────────────────

  if (!organizationId) {
    return (
      <PageContainer>
        <EmptyDetail>No organization assigned to this account.</EmptyDetail>
      </PageContainer>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageHeader>
        <PageTitle>Chart of Accounts</PageTitle>
        {canWrite && (
          <PrimaryButton onClick={openCreate}>+ New Account</PrimaryButton>
        )}
      </PageHeader>

      <ToolbarRow>
        <SearchInput
          placeholder="Search by number or name..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          aria-label="Search accounts"
        />
        <FilterSelect
          value={drawerFilter}
          onChange={(e) => setDrawerFilter(e.target.value as DrawerEnum | '')}
          aria-label="Filter by drawer"
        >
          <option value="">All Drawers</option>
          {DRAWER_ORDER.map((d) => (
            <option key={d} value={d}>{DRAWER_LABELS[d]}</option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={activeFilter}
          onChange={(e) =>
            setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')
          }
          aria-label="Filter by status"
        >
          <option value="all">All Status</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </FilterSelect>
      </ToolbarRow>

      {isLoading && (
        <EmptyDetail style={{ marginTop: 40 }}>Loading chart of accounts...</EmptyDetail>
      )}
      {isError && (
        <EmptyDetail style={{ marginTop: 40, color: 'var(--color-error)' }}>
          Failed to load accounts. Please refresh the page.
        </EmptyDetail>
      )}

      {!isLoading && !isError && (
        <TwoPaneLayout>
          {/* ── Left pane: account tree ── */}
          <TreePanel aria-label="Account tree">
            {DRAWER_ORDER.map((drawer) => {
              const drawerAccounts = accountsByDrawer.get(drawer) ?? [];
              if (drawerAccounts.length === 0) return null;

              const isCollapsed = collapsedDrawers.has(drawer);

              // Find root-level accounts within this drawer for this filter set.
              // Roots are accounts whose parentAccountId is null OR whose parent
              // is not in the current filtered set (filtered parent is hidden).
              const filteredIds = new Set(drawerAccounts.map((a) => a.accountId));
              const roots = drawerAccounts.filter(
                (a) =>
                  a.parentAccountId === null ||
                  !filteredIds.has(a.parentAccountId)
              );

              // Only pass the drawer-scoped accounts to buildTree.
              const treeRows = buildTree(drawerAccounts, null);
              // If there are roots that aren't reached by null parent, add them directly.
              // Handle the case where roots have a parent outside the filtered set.
              const reachedIds = new Set(treeRows.map((r) => r.account.accountId));
              const unreachedRoots = roots.filter((r) => !reachedIds.has(r.accountId));
              const finalRows = [
                ...treeRows,
                ...unreachedRoots.map((r) => ({ account: r, depth: 0 })),
              ];

              return (
                <DrawerSection key={drawer}>
                  <DrawerHeader
                    onClick={() => toggleDrawer(drawer)}
                    aria-expanded={!isCollapsed}
                    aria-label={`${DRAWER_LABELS[drawer]} drawer`}
                  >
                    <DrawerLabel>
                      {DRAWER_LABELS[drawer]}
                      <DrawerCount>({drawerAccounts.length})</DrawerCount>
                    </DrawerLabel>
                    <DrawerCaret $open={!isCollapsed}>▾</DrawerCaret>
                  </DrawerHeader>

                  {!isCollapsed &&
                    finalRows.map(({ account, depth }) => (
                      <AccountRow
                        key={account.accountId}
                        $depth={depth}
                        $isHeader={account.isHeader}
                        $isActive={account.isActive}
                        $isSelected={account.accountId === selectedAccountId}
                        onClick={() => handleSelectAccount(account.accountId)}
                        aria-pressed={account.accountId === selectedAccountId}
                        aria-label={`${account.accountNumber} ${account.accountName}`}
                      >
                        <AccountNumber $isHeader={account.isHeader}>
                          {account.accountNumber}
                        </AccountNumber>
                        <AccountName $isHeader={account.isHeader}>
                          {account.accountName}
                        </AccountName>
                        {account.isControlAccount && (
                          <BadgePill $variant="control">Control</BadgePill>
                        )}
                        {!account.isActive && (
                          <BadgePill $variant="inactive">Inactive</BadgePill>
                        )}
                      </AccountRow>
                    ))}
                </DrawerSection>
              );
            })}

            {filteredAccounts.length === 0 && (
              <EmptyDetail>No accounts match the current filters.</EmptyDetail>
            )}
          </TreePanel>

          {/* ── Right pane: detail ── */}
          <DetailPanel aria-label="Account detail">
            {!selectedAccount ? (
              <EmptyDetail>Select an account on the left to view details.</EmptyDetail>
            ) : (
              <>
                <DetailHeader>
                  <DetailTitle>
                    <DetailAccountNumber>
                      {selectedAccount.accountNumber}
                      {selectedAccount.isLockedNumber && (
                        <BadgePill $variant="locked">Locked</BadgePill>
                      )}
                    </DetailAccountNumber>
                    <DetailAccountName>{selectedAccount.accountName}</DetailAccountName>
                  </DetailTitle>

                  {canWrite && (
                    <DetailActions>
                      <SecondaryButton
                        onClick={() => openEdit(selectedAccount)}
                        disabled={selectedAccount.isControlAccount}
                        title={
                          selectedAccount.isControlAccount
                            ? 'Control accounts cannot be edited'
                            : 'Edit account'
                        }
                      >
                        Edit
                      </SecondaryButton>
                      {selectedAccount.isActive ? (
                        <DangerButton
                          onClick={() => setConfirmDeactivate(true)}
                          disabled={selectedAccount.isControlAccount}
                          title={
                            selectedAccount.isControlAccount
                              ? 'Control accounts cannot be deactivated'
                              : 'Deactivate account'
                          }
                        >
                          Deactivate
                        </DangerButton>
                      ) : (
                        <SuccessButton
                          onClick={() => setConfirmReactivate(true)}
                        >
                          Reactivate
                        </SuccessButton>
                      )}
                    </DetailActions>
                  )}
                </DetailHeader>

                {selectedAccount.isHeader && (
                  <BannerError
                    role="note"
                    style={{ marginBottom: 20, background: '#fffbeb', color: '#B8842A', borderColor: '#fde68a' }}
                  >
                    This is a header account. It is a section title and cannot be posted to directly.
                  </BannerError>
                )}

                {/* Description — full width, shown below the account name header */}
                {selectedAccount.description ? (
                  <FieldItem style={{ marginBottom: 16 }}>
                    <FieldLabel>Description</FieldLabel>
                    <DetailDescription>{selectedAccount.description}</DetailDescription>
                  </FieldItem>
                ) : (
                  <FieldItem style={{ marginBottom: 16 }}>
                    <FieldLabel>Description</FieldLabel>
                    <FieldValue style={{ color: 'var(--color-text-disabled)' }}>—</FieldValue>
                  </FieldItem>
                )}

                <FieldGrid>
                  {/* Drawer */}
                  <FieldItem>
                    <FieldLabel>Drawer</FieldLabel>
                    <FieldValue>{DRAWER_LABELS[selectedAccount.drawer]}</FieldValue>
                  </FieldItem>

                  {/* Account Type */}
                  <FieldItem>
                    <FieldLabel>Account Type</FieldLabel>
                    <FieldValue>{ACCOUNT_TYPE_LABELS[selectedAccount.accountType]}</FieldValue>
                  </FieldItem>

                  {/* Account Level — always present, shown as a pill */}
                  <FieldItem>
                    <FieldLabel>Account Level</FieldLabel>
                    <FieldValue>
                      <LevelBadge $level={selectedAccount.accountLevel}>
                        {ACCOUNT_LEVEL_LABELS[selectedAccount.accountLevel]}
                      </LevelBadge>
                    </FieldValue>
                  </FieldItem>

                  {/* Account Role — only shown when non-null */}
                  {selectedAccount.accountRole && (
                    <FieldItem>
                      <FieldLabel>Account Role</FieldLabel>
                      <FieldValue>
                        <RoleBadge>
                          {ACCOUNT_ROLE_LABELS[selectedAccount.accountRole]}
                        </RoleBadge>
                      </FieldValue>
                    </FieldItem>
                  )}

                  {/* Parent Account */}
                  <FieldItem>
                    <FieldLabel>Parent Account</FieldLabel>
                    <FieldValue>
                      {selectedAccount.parentAccountId ? (
                        (() => {
                          const parent = accountLookup.get(selectedAccount.parentAccountId);
                          return parent ? (
                            <ParentLink
                              onClick={() => setSelectedAccountId(parent.accountId)}
                              title="Navigate to parent account"
                            >
                              {parent.accountNumber} — {parent.accountName}
                            </ParentLink>
                          ) : (
                            <span style={{ color: 'var(--color-text-disabled)' }}>
                              {selectedAccount.parentAccountId}
                            </span>
                          );
                        })()
                      ) : (
                        <span style={{ color: 'var(--color-text-disabled)' }}>None</span>
                      )}
                    </FieldValue>
                  </FieldItem>

                  {/* IFRS Tag — only shown when non-null */}
                  {selectedAccount.ifrsTag && (
                    <FieldItem>
                      <FieldLabel>IFRS Tag</FieldLabel>
                      <FieldValue>
                        <IfrsTagLabel>{selectedAccount.ifrsTag}</IfrsTagLabel>
                      </FieldValue>
                    </FieldItem>
                  )}

                  {/* Status */}
                  <FieldItem>
                    <FieldLabel>Status</FieldLabel>
                    <FieldValue>
                      <StatusBadge $active={selectedAccount.isActive}>
                        {selectedAccount.isActive ? 'Active' : 'Inactive'}
                      </StatusBadge>
                    </FieldValue>
                  </FieldItem>

                  {/* Type Flags */}
                  {(selectedAccount.isHeader || selectedAccount.isControlAccount) && (
                    <FieldItem style={{ gridColumn: '1 / -1' }}>
                      <FieldLabel>Type Flags</FieldLabel>
                      <FlagRow>
                        {selectedAccount.isHeader && (
                          <BadgePill $variant="control">Header</BadgePill>
                        )}
                        {selectedAccount.isControlAccount && (
                          <BadgePill $variant="control">Control Account</BadgePill>
                        )}
                      </FlagRow>
                    </FieldItem>
                  )}

                  {/* Timestamps */}
                  <FieldItem>
                    <FieldLabel>Created</FieldLabel>
                    <FieldValue>{formatDate(selectedAccount.createdAt)}</FieldValue>
                  </FieldItem>

                  <FieldItem>
                    <FieldLabel>Last Updated</FieldLabel>
                    <FieldValue>{formatDate(selectedAccount.updatedAt)}</FieldValue>
                  </FieldItem>
                </FieldGrid>
              </>
            )}
          </DetailPanel>
        </TwoPaneLayout>
      )}

      {/* ── Modals ── */}

      {showFormModal && (
        <AccountFormModal
          account={editingAccount}
          allAccounts={allAccounts}
          organizationId={organizationId}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}

      {confirmDeactivate && selectedAccount && (
        <ConfirmDialog
          message={`Deactivate account ${selectedAccount.accountNumber} "${selectedAccount.accountName}"? This will mark it inactive and it will no longer appear by default.`}
          onConfirm={handleDeactivate}
          onCancel={() => setConfirmDeactivate(false)}
          isPending={deactivateMutation.isPending}
        />
      )}

      {confirmReactivate && selectedAccount && (
        <ConfirmDialog
          message={`Reactivate account ${selectedAccount.accountNumber} "${selectedAccount.accountName}"?`}
          onConfirm={handleReactivate}
          onCancel={() => setConfirmReactivate(false)}
          isPending={reactivateMutation.isPending}
        />
      )}
    </PageContainer>
  );
}
