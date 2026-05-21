/**
 * ApprovalRulesPage
 *
 * Finance-side management page for the approval engine's rule set.
 * The purchasing engine calls GET /finance/master-data/approval-rules/resolve
 * on every PR/PO submit — this page is the admin UI for those rules.
 *
 * Route: /finance/approval-rules
 *
 * Role gating:
 *   Read: accountant, finance_admin, auditor, admin, super_admin
 *   Write (create/edit/delete): finance_admin, admin, super_admin
 *
 * Modals do NOT close on overlay click — X button only.
 * (Project-wide rule: data-entry modals close via X button, never on backdrop click.)
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useAuthStore } from '../../stores/auth.store';
import { showSuccessToast } from '../../stores/toast.store';
import {
  useApprovalRules,
  useCreateApprovalRule,
  useUpdateApprovalRule,
  useDeleteApprovalRule,
  useReactivateApprovalRule,
  useResolveApprovalRule,
} from '../../hooks/queries/useApprovalRules';
import { useFinanceCompanies } from '../../hooks/queries/useFinanceCompanies';
import {
  DOC_TYPE_LABELS,
  DOC_TYPE_ORDER,
  ROLE_LABELS,
  APPROVER_ROLES,
  type ApprovalRule,
  type ApprovalRuleCreate,
  type ApprovalRuleUpdate,
  type DocType,
} from '../../services/approvalRulesService';
import type { Company } from '../../services/financeCompaniesService';
import { parseApiErrors } from '../../utils/apiErrors';
import type { ApiErrorItem } from '../../utils/apiErrors';

// ─── Role gates ────────────────────────────────────────────────────────────────

const READ_ROLES = new Set([
  'accountant',
  'finance_admin',
  'auditor',
  'admin',
  'super_admin',
]);

const WRITE_ROLES = new Set(['finance_admin', 'admin', 'super_admin']);

const PLATFORM_DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

// ─── API field map for 422 errors ──────────────────────────────────────────────

const APPROVAL_RULE_FIELD_MAP: Record<string, string> = {
  organization_id: 'companyCode',
  organizationId: 'companyCode',
  company_code: 'companyCode',
  companyCode: 'companyCode',
  doc_type: 'docType',
  docType: 'docType',
  threshold_amount: 'thresholdAmount',
  thresholdAmount: 'thresholdAmount',
  approver_role: 'approverRole',
  approverRole: 'approverRole',
  always_required: 'approvalMode',
  alwaysRequired: 'approvalMode',
  priority: 'priority',
  is_active: 'isActive',
  isActive: 'isActive',
  notes: 'notes',
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

function formatThreshold(amount: string | null): string {
  if (amount === null || amount === '') return '—';
  const num = parseFloat(amount);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

// ─── Styled Components ─────────────────────────────────────────────────────────

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

const PageSubtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 4px 0 0;
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
  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const FilterSelect = styled.select`
  padding: 9px 13px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
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
  &:hover {
    background: ${({ theme }) => theme.colors.accent.sageDeep};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
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
  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
    color: ${({ theme }) => theme.colors.text.primary};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
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
  &:hover {
    background: ${({ theme }) => theme.colors.status.danger};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
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
  &:hover {
    background: ${({ theme }) => theme.colors.accent.sageSoft || '#ecfdf5'};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text.secondary};
  transition: all 120ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
    color: ${({ theme }) => theme.colors.text.primary};
    border-color: ${({ theme }) => theme.colors.border.subtle};
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const DangerIconButton = styled(IconButton)`
  &:hover {
    color: ${({ theme }) => theme.colors.status.danger};
    border-color: ${({ theme }) => theme.colors.status.danger};
    background: ${({ theme }) => theme.colors.status.danger};
  }
`;

// ─── Table ─────────────────────────────────────────────────────────────────────

const TableWrapper = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 12px;
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const Thead = styled.thead`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

type SortDirection = 'asc' | 'desc';
type SortKey = 'docType' | 'companyCode' | 'approverRole' | 'thresholdAmount' | 'priority' | 'updatedAt';

interface ThProps {
  $sortable?: boolean;
  $active?: boolean;
}

const Th = styled.th<ThProps>`
  padding: 10px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ $active, theme }) =>
    $active ? theme.colors.accent.sage : theme.colors.text.secondary};
  white-space: nowrap;
  cursor: ${({ $sortable }) => ($sortable ? 'pointer' : 'default')};
  user-select: none;
  &:hover {
    color: ${({ $sortable, theme }) =>
      $sortable ? theme.colors.text.primary : theme.colors.text.secondary};
  }
`;

const Tbody = styled.tbody``;

interface TrProps {
  $inactive?: boolean;
}

const Tr = styled.tr<TrProps>`
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  opacity: ${({ $inactive }) => ($inactive ? 0.55 : 1)};
  transition: background 100ms ease;
  &:last-child {
    border-bottom: none;
  }
  &:hover {
    background: ${({ theme }) => theme.colors.surface.canvas};
  }
`;

const Td = styled.td`
  padding: 10px 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  vertical-align: middle;
`;

const ActionCell = styled.td`
  padding: 8px 14px;
  vertical-align: middle;
`;

const ActionsGroup = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
`;

// ─── Pills ─────────────────────────────────────────────────────────────────────

const AlwaysPill = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ theme }) => theme.colors.accent.sageSoft || '#ecfdf5'};
  color: ${({ theme }) => theme.colors.status.success || '#0F6E56'};
`;

const StatusBadge = styled.span<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.accent.sageSoft || '#ecfdf5' : theme.colors.surface.raised};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.status.success || '#0F6E56' : theme.colors.text.tertiary};
`;

const DocTypeBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  background: ${({ theme }) => theme.colors.surface.sunken || 'rgba(15,110,86,0.05)'};
  color: ${({ theme }) => theme.colors.status.info || '#0F6E56'};
`;

// ─── Empty / Loading states ────────────────────────────────────────────────────

const EmptyState = styled.div`
  padding: 48px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.tertiary};
  font-size: 14px;
`;

// ─── Modal styled components ───────────────────────────────────────────────────

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
  max-width: 560px;
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
  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
  }
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
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
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
  border: 1px solid
    ${({ $hasError, theme }) =>
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
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: ${({ theme }) => theme.colors.surface.canvas};
  }
`;

const FormSelect = styled.select<{ $hasError?: boolean }>`
  padding: 10px 14px;
  border: 1px solid
    ${({ $hasError, theme }) =>
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
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: ${({ theme }) => theme.colors.surface.canvas};
  }
`;

const FormTextarea = styled.textarea<{ $hasError?: boolean }>`
  padding: 10px 14px;
  border: 1px solid
    ${({ $hasError, theme }) =>
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
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: ${({ theme }) => theme.colors.surface.canvas};
  }
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

// ─── Radio group for Approval Mode ────────────────────────────────────────────

const RadioGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const RadioLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  transition: background 100ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.surface.canvas};
  }
`;

// ─── Test Resolution Widget ────────────────────────────────────────────────────

const TesterCard = styled.div`
  margin-top: 28px;
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 12px;
  padding: 20px 24px;
`;

const TesterTitle = styled.h3`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 16px;
`;

const TesterRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-end;
`;

const TesterField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 160px;
`;

const TesterLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-transform: uppercase;
  letter-spacing: 0.3px;
`;

const TesterInput = styled.input`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  font-family: inherit;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const TesterSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  font-family: inherit;
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const TesterResult = styled.div<{ $requiresApproval: boolean | null }>`
  margin-top: 14px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  background: ${({ $requiresApproval, theme }) => {
    if ($requiresApproval === null) return theme.colors.surface.canvas;
    return $requiresApproval
      ? theme.colors.status.warning || 'rgba(184,132,42,0.06)'
      : theme.colors.accent.sageSoft || '#ecfdf5';
  }};
  color: ${({ $requiresApproval, theme }) => {
    if ($requiresApproval === null) return theme.colors.text.tertiary;
    return $requiresApproval
      ? theme.colors.status.warning || '#B8842A'
      : theme.colors.status.success || '#0B5644';
  }};
  border: 1px solid ${({ $requiresApproval, theme }) => {
    if ($requiresApproval === null) return theme.colors.surface.sunken;
    return $requiresApproval
      ? theme.colors.status.warning || '#fde68a'
      : theme.colors.status.success || '#6ee7b7';
  }};
`;

// ─── Confirm Dialog ────────────────────────────────────────────────────────────

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
          <SecondaryButton onClick={onCancel} disabled={isPending}>
            Cancel
          </SecondaryButton>
          <DangerButton onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Working...' : 'Confirm'}
          </DangerButton>
        </ModalFooter>
      </Modal>
    </ModalOverlay>
  );
}

// ─── Form types ────────────────────────────────────────────────────────────────

type ApprovalMode = 'always' | 'threshold';

interface RuleFormState {
  companyCode: string;
  docType: DocType | '';
  approverRole: string;
  approvalMode: ApprovalMode | '';
  thresholdAmount: string;
  priority: string;
  isActive: boolean;
  notes: string;
}

// ─── Rule Form Modal ───────────────────────────────────────────────────────────

interface RuleFormModalProps {
  rule?: ApprovalRule | null;
  organizationId: string;
  companies: Company[];
  companiesLoading: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function RuleFormModal({
  rule,
  organizationId,
  companies,
  companiesLoading,
  onClose,
  onSaved,
}: RuleFormModalProps) {
  const isEdit = !!rule;

  const initialApprovalMode: ApprovalMode | '' = rule
    ? rule.alwaysRequired
      ? 'always'
      : 'threshold'
    : '';

  // When creating a new rule, default to the first available company code.
  // Falls back to empty string if the fetch hasn't resolved yet.
  const defaultCompanyCode = rule?.companyCode ?? (companies[0]?.companyCode ?? '');

  const [form, setForm] = useState<RuleFormState>({
    companyCode: defaultCompanyCode,
    docType: (rule?.docType as DocType | undefined) ?? '',
    approverRole: rule?.approverRole ?? '',
    approvalMode: initialApprovalMode,
    thresholdAmount:
      rule && !rule.alwaysRequired && rule.thresholdAmount !== null
        ? rule.thresholdAmount
        : '',
    priority: rule ? String(rule.priority) : '100',
    isActive: rule?.isActive ?? true,
    notes: rule?.notes ?? '',
  });

  const [bannerError, setBannerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const createMutation = useCreateApprovalRule();
  const updateMutation = useUpdateApprovalRule();
  const isLoading = createMutation.isPending || updateMutation.isPending;

  const clearFieldError = useCallback((key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleChange = useCallback(
    (
      key: keyof RuleFormState
    ) =>
      (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >
      ) => {
        const value =
          e.target.type === 'checkbox'
            ? (e.target as HTMLInputElement).checked
            : e.target.value;
        setForm((prev) => ({ ...prev, [key]: value }));
        clearFieldError(key as string);
      },
    [clearFieldError]
  );

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!form.companyCode.trim()) errors.companyCode = 'Company code is required.';
    if (!form.docType) errors.docType = 'Document type is required.';
    if (!form.approverRole) errors.approverRole = 'Approver role is required.';
    if (!form.approvalMode) errors.approvalMode = 'Please select an approval mode.';
    if (form.approvalMode === 'threshold') {
      if (!form.thresholdAmount.trim()) {
        errors.thresholdAmount = 'Threshold amount is required when mode is "Above threshold".';
      } else {
        const val = parseFloat(form.thresholdAmount);
        if (isNaN(val) || val < 0) {
          errors.thresholdAmount = 'Threshold must be a number 0 or greater.';
        }
      }
    }
    if (!form.priority.trim()) {
      errors.priority = 'Priority is required.';
    } else {
      const p = parseInt(form.priority, 10);
      if (isNaN(p) || p < 1 || p > 9999 || String(p) !== form.priority.trim()) {
        errors.priority = 'Priority must be 1 or greater (max 9999).';
      }
    }
    if (form.notes.length > 1000) {
      errors.notes = 'Notes must be 1000 characters or fewer.';
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

    const alwaysRequired = form.approvalMode === 'always';
    const thresholdAmount = alwaysRequired
      ? null
      : form.thresholdAmount.trim() || null;

    try {
      if (isEdit) {
        const updatePayload: ApprovalRuleUpdate = {
          approverRole: form.approverRole,
          alwaysRequired,
          thresholdAmount,
          priority: parseInt(form.priority, 10),
          isActive: form.isActive,
          notes: form.notes.trim() || null,
        };
        await updateMutation.mutateAsync({
          ruleId: rule!.ruleId,
          orgId: organizationId,
          data: updatePayload,
        });
      } else {
        const createPayload: ApprovalRuleCreate = {
          organizationId,
          companyCode: form.companyCode,
          docType: form.docType as DocType,
          approverRole: form.approverRole,
          alwaysRequired,
          thresholdAmount,
          priority: parseInt(form.priority, 10),
          notes: form.notes.trim() || null,
        };
        await createMutation.mutateAsync(createPayload);
      }
      onSaved();
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { detail?: unknown }; status?: number };
        message?: string;
      };
      const detail = axiosErr?.response?.data?.detail;

      if (Array.isArray(detail)) {
        const parsed = parseApiErrors(detail as ApiErrorItem[], APPROVAL_RULE_FIELD_MAP);
        const { __banner__, ...perField } = parsed;
        setFieldErrors(perField);
        if (__banner__) setBannerError(__banner__);
      } else if (typeof detail === 'string') {
        setBannerError(detail);
      } else {
        setBannerError(
          (axiosErr?.message as string | undefined) ??
            'An unexpected error occurred. Please try again.'
        );
      }
    }
  };

  return (
    <ModalOverlay>
      {/* Modal must NOT close on overlay click — X button only */}
      <Modal onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>{isEdit ? 'Edit Approval Rule' : 'New Approval Rule'}</ModalTitle>
          <CloseButton onClick={onClose} aria-label="Close modal">
            ✕
          </CloseButton>
        </ModalHeader>
        <ModalBody>
          {bannerError && <BannerError role="alert">{bannerError}</BannerError>}

          {/* Row 1: Doc Type + Company Code */}
          <FormRow>
            <Field>
              <FormLabel htmlFor="ar-docType">Document Type *</FormLabel>
              <FormSelect
                id="ar-docType"
                value={form.docType}
                onChange={handleChange('docType')}
                disabled={isEdit}
                $hasError={!!fieldErrors.docType}
                aria-invalid={!!fieldErrors.docType}
              >
                <option value="">— Select —</option>
                {DOC_TYPE_ORDER.map((dt) => (
                  <option key={dt} value={dt}>
                    {DOC_TYPE_LABELS[dt]}
                  </option>
                ))}
              </FormSelect>
              {isEdit && (
                <HintText>
                  Document type cannot be changed. Create a new rule to change it.
                </HintText>
              )}
              {fieldErrors.docType && (
                <FieldError role="alert">{fieldErrors.docType}</FieldError>
              )}
            </Field>

            <Field>
              <FormLabel htmlFor="ar-companyCode">Company Code *</FormLabel>
              <FormSelect
                id="ar-companyCode"
                value={form.companyCode}
                onChange={handleChange('companyCode')}
                disabled={isEdit}
                $hasError={!!fieldErrors.companyCode}
                aria-invalid={!!fieldErrors.companyCode}
              >
                {companiesLoading ? (
                  <option disabled>Loading companies...</option>
                ) : (
                  companies.map((c) => (
                    <option key={c.companyCode} value={c.companyCode}>
                      {c.companyCode} — {c.legalName}
                    </option>
                  ))
                )}
              </FormSelect>
              {fieldErrors.companyCode && (
                <FieldError role="alert">{fieldErrors.companyCode}</FieldError>
              )}
            </Field>
          </FormRow>

          {/* Approver Role */}
          <Field>
            <FormLabel htmlFor="ar-approverRole">Approver Role *</FormLabel>
            <FormSelect
              id="ar-approverRole"
              value={form.approverRole}
              onChange={handleChange('approverRole')}
              $hasError={!!fieldErrors.approverRole}
              aria-invalid={!!fieldErrors.approverRole}
            >
              <option value="">— Select —</option>
              {APPROVER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </FormSelect>
            {fieldErrors.approverRole && (
              <FieldError role="alert">{fieldErrors.approverRole}</FieldError>
            )}
          </Field>

          {/* Approval Mode — radio buttons expose the alwaysRequired/threshold UX clearly */}
          <Field>
            <FormLabel as="span">Approval Mode *</FormLabel>
            <RadioGroup role="radiogroup" aria-label="Approval mode">
              <RadioLabel>
                <input
                  type="radio"
                  name="approvalMode"
                  value="always"
                  checked={form.approvalMode === 'always'}
                  onChange={() => {
                    setForm((prev) => ({
                      ...prev,
                      approvalMode: 'always',
                      thresholdAmount: '',
                    }));
                    clearFieldError('approvalMode');
                    clearFieldError('thresholdAmount');
                  }}
                />
                Always required — approval needed regardless of amount
              </RadioLabel>
              <RadioLabel>
                <input
                  type="radio"
                  name="approvalMode"
                  value="threshold"
                  checked={form.approvalMode === 'threshold'}
                  onChange={() => {
                    setForm((prev) => ({ ...prev, approvalMode: 'threshold' }));
                    clearFieldError('approvalMode');
                  }}
                />
                Above threshold — approval triggered when amount meets threshold
              </RadioLabel>
            </RadioGroup>
            {fieldErrors.approvalMode && (
              <FieldError role="alert">{fieldErrors.approvalMode}</FieldError>
            )}
          </Field>

          {/* Threshold Amount — only shown when mode = threshold */}
          {form.approvalMode === 'threshold' && (
            <Field>
              <FormLabel htmlFor="ar-threshold">Threshold Amount * (AED)</FormLabel>
              <FormInput
                id="ar-threshold"
                type="number"
                min="0"
                step="0.01"
                value={form.thresholdAmount}
                onChange={handleChange('thresholdAmount')}
                placeholder="e.g. 10000.00"
                $hasError={!!fieldErrors.thresholdAmount}
                aria-invalid={!!fieldErrors.thresholdAmount}
                aria-describedby={fieldErrors.thresholdAmount ? 'ar-threshold-err' : undefined}
              />
              <HintText>Approval is required when the document amount is at or above this value.</HintText>
              {fieldErrors.thresholdAmount && (
                <FieldError id="ar-threshold-err" role="alert">
                  {fieldErrors.thresholdAmount}
                </FieldError>
              )}
            </Field>
          )}

          {/* Priority */}
          <Field>
            <FormLabel htmlFor="ar-priority">Priority *</FormLabel>
            <FormInput
              id="ar-priority"
              type="number"
              min="1"
              max="9999"
              step="1"
              value={form.priority}
              onChange={handleChange('priority')}
              placeholder="100"
              $hasError={!!fieldErrors.priority}
              aria-invalid={!!fieldErrors.priority}
              aria-describedby="ar-priority-hint"
            />
            <HintText id="ar-priority-hint">
              Lower number = higher priority. Used when multiple rules match the same doc type.
            </HintText>
            {fieldErrors.priority && (
              <FieldError role="alert">{fieldErrors.priority}</FieldError>
            )}
          </Field>

          {/* Active checkbox */}
          <Field>
            <CheckboxRow htmlFor="ar-isActive">
              <input
                id="ar-isActive"
                type="checkbox"
                checked={form.isActive}
                onChange={handleChange('isActive')}
              />
              Active
            </CheckboxRow>
          </Field>

          {/* Notes */}
          <Field>
            <FormLabel htmlFor="ar-notes">Notes</FormLabel>
            <FormTextarea
              id="ar-notes"
              value={form.notes}
              onChange={handleChange('notes')}
              placeholder="Optional — explain the business reason for this rule (max 1000 characters)"
              rows={3}
              maxLength={1000}
              $hasError={!!fieldErrors.notes}
              aria-describedby={fieldErrors.notes ? 'ar-notes-err' : undefined}
              aria-invalid={!!fieldErrors.notes}
            />
            {form.notes.length > 900 && (
              <HintText>{1000 - form.notes.length} characters remaining</HintText>
            )}
            {fieldErrors.notes && (
              <FieldError id="ar-notes-err" role="alert">
                {fieldErrors.notes}
              </FieldError>
            )}
          </Field>
        </ModalBody>
        <ModalFooter>
          <SecondaryButton onClick={onClose} disabled={isLoading}>
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={isLoading}>
            {isLoading
              ? 'Saving...'
              : isEdit
              ? 'Save Changes'
              : 'Create Rule'}
          </PrimaryButton>
        </ModalFooter>
      </Modal>
    </ModalOverlay>
  );
}

// ─── Test Resolution Widget ────────────────────────────────────────────────────

interface TesterWidgetProps {
  organizationId: string;
  companies: Company[];
  companiesLoading: boolean;
}

function TesterWidget({ organizationId, companies, companiesLoading }: TesterWidgetProps) {
  const [testerDocType, setTesterDocType] = useState<DocType | ''>('');
  // Default to first company once loaded; empty string is safe (query is disabled when empty).
  const [testerCompany, setTesterCompany] = useState('');
  const [testerAmount, setTesterAmount] = useState('');
  const [runTest, setRunTest] = useState(false);

  // Sync testerCompany to the first available company when the list first loads.
  useEffect(() => {
    if (!testerCompany && companies.length > 0) {
      setTesterCompany(companies[0].companyCode);
    }
  }, [companies, testerCompany]);

  const { data: resolveData, isFetching, isError, refetch } = useResolveApprovalRule(
    organizationId,
    {
      companyCode: testerCompany,
      docType: testerDocType as DocType,
      amount: testerAmount ? parseFloat(testerAmount) : undefined,
    },
    runTest
  );

  const handleTest = () => {
    setRunTest(true);
    // refetch each time button is clicked, even with same params
    refetch();
  };

  const result = resolveData;

  return (
    <TesterCard>
      <TesterTitle>Test Resolution</TesterTitle>
      <TesterRow>
        <TesterField>
          <TesterLabel htmlFor="tester-docType">Doc Type</TesterLabel>
          <TesterSelect
            id="tester-docType"
            value={testerDocType}
            onChange={(e) => {
              setTesterDocType(e.target.value as DocType | '');
              setRunTest(false);
            }}
          >
            <option value="">— Select —</option>
            {DOC_TYPE_ORDER.map((dt) => (
              <option key={dt} value={dt}>
                {DOC_TYPE_LABELS[dt]}
              </option>
            ))}
          </TesterSelect>
        </TesterField>

        <TesterField>
          <TesterLabel htmlFor="tester-company">Company</TesterLabel>
          <TesterSelect
            id="tester-company"
            value={testerCompany}
            onChange={(e) => {
              setTesterCompany(e.target.value);
              setRunTest(false);
            }}
          >
            {companiesLoading ? (
              <option disabled>Loading companies...</option>
            ) : (
              companies.map((c) => (
                <option key={c.companyCode} value={c.companyCode}>
                  {c.companyCode} — {c.legalName}
                </option>
              ))
            )}
          </TesterSelect>
        </TesterField>

        <TesterField>
          <TesterLabel htmlFor="tester-amount">Amount (AED)</TesterLabel>
          <TesterInput
            id="tester-amount"
            type="number"
            min="0"
            step="0.01"
            value={testerAmount}
            onChange={(e) => {
              setTesterAmount(e.target.value);
              setRunTest(false);
            }}
            placeholder="Optional"
          />
        </TesterField>

        <SecondaryButton
          onClick={handleTest}
          disabled={!testerDocType || isFetching}
          style={{ alignSelf: 'flex-end', height: 38 }}
        >
          {isFetching ? 'Checking...' : 'Test'}
        </SecondaryButton>
      </TesterRow>

      {isError && (
        <TesterResult $requiresApproval={null}>
          Failed to check — verify that active rules exist for the selected combination.
        </TesterResult>
      )}

      {!isError && result && (
        <TesterResult $requiresApproval={result.requiresApproval}>
          <strong>{result.requiresApproval ? 'Approval required' : 'No approval needed'}</strong>
          {result.matchedRule && (
            <>
              {' '}— Approver:{' '}
              <strong>
                {ROLE_LABELS[result.matchedRule.approverRole as keyof typeof ROLE_LABELS] ??
                  result.matchedRule.approverRole}
              </strong>{' '}
              (Rule priority {result.matchedRule.priority})
            </>
          )}
          <br />
          <span style={{ fontSize: 12, opacity: 0.85 }}>{result.reason}</span>
        </TesterResult>
      )}

      {!isError && !result && !isFetching && (
        <TesterResult $requiresApproval={null}>
          Select a document type and click Test to check approval requirements.
        </TesterResult>
      )}
    </TesterCard>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────────

export function ApprovalRulesPage() {
  const { user } = useAuthStore();
  // Reason: showSuccessToast is a module-level helper, imported directly above.

  // Resolve org ID from user runtime shape.
  // Per project memory: runtime shape uses userId not id.
  const organizationId: string = useMemo(() => {
    if (user?.organizationId) return user.organizationId;
    if (user?.role === 'super_admin') return PLATFORM_DEFAULT_ORG;
    return '';
  }, [user]);

  const canRead = READ_ROLES.has(user?.role ?? '');
  const canWrite = WRITE_ROLES.has(user?.role ?? '');

  // ── Companies fetch ────────────────────────────────────────────────────────

  const {
    data: companiesData,
    isLoading: companiesLoading,
    isError: companiesError,
  } = useFinanceCompanies(organizationId || null);

  // If the fetch errored, fall back to a minimal list so the page stays usable.
  const companies: Company[] = companiesError
    ? [{ companyCode: '1000', organizationId, legalName: '1000', trn: null,
        fiscalYearStartMonth: 1, fiscalYearStartDay: 1, defaultCurrency: 'AED',
        isLocked: false, createdAt: '', updatedAt: '' }]
    : (companiesData ?? []);

  if (companiesError) {
    console.error('[ApprovalRulesPage] Failed to load companies; falling back to ["1000"].');
  }

  // ── Toolbar state ──────────────────────────────────────────────────────────

  const [searchText, setSearchText] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<DocType | ''>('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // ── Sort state ────────────────────────────────────────────────────────────

  const [sortKey, setSortKey] = useState<SortKey>('docType');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey]
  );

  const sortArrow = (key: SortKey) => {
    if (key !== sortKey) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  // ── Data fetch ─────────────────────────────────────────────────────────────

  const serverFilters = useMemo(() => {
    const f: Record<string, unknown> = {};
    if (docTypeFilter) f.docType = docTypeFilter;
    if (companyFilter) f.companyCode = companyFilter;
    if (activeFilter !== 'all') f.isActive = activeFilter === 'active';
    return f;
  }, [docTypeFilter, companyFilter, activeFilter]);

  const { data, isLoading, isError } = useApprovalRules(organizationId, serverFilters);
  const allRules: ApprovalRule[] = data?.items ?? [];

  // ── Client-side search (approverRole + notes) ──────────────────────────────

  const filteredRules = useMemo(() => {
    if (!searchText.trim()) return allRules;
    const q = searchText.trim().toLowerCase();
    return allRules.filter(
      (r) =>
        r.approverRole.toLowerCase().includes(q) ||
        (r.notes ?? '').toLowerCase().includes(q)
    );
  }, [allRules, searchText]);

  // ── Client-side sort ───────────────────────────────────────────────────────

  const sortedRules = useMemo(() => {
    return [...filteredRules].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      if (sortKey === 'docType') {
        aVal = DOC_TYPE_ORDER.indexOf(a.docType as DocType);
        bVal = DOC_TYPE_ORDER.indexOf(b.docType as DocType);
      } else if (sortKey === 'companyCode') {
        aVal = a.companyCode;
        bVal = b.companyCode;
      } else if (sortKey === 'approverRole') {
        aVal = a.approverRole;
        bVal = b.approverRole;
      } else if (sortKey === 'thresholdAmount') {
        aVal = a.thresholdAmount === null ? -1 : parseFloat(a.thresholdAmount);
        bVal = b.thresholdAmount === null ? -1 : parseFloat(b.thresholdAmount);
      } else if (sortKey === 'priority') {
        aVal = a.priority;
        bVal = b.priority;
      } else if (sortKey === 'updatedAt') {
        aVal = a.updatedAt;
        bVal = b.updatedAt;
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      // Secondary sort: priority asc when primary keys are equal
      return a.priority - b.priority;
    });
  }, [filteredRules, sortKey, sortDir]);

  // ── Modal state ────────────────────────────────────────────────────────────

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null);

  // Confirm dialogs
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<ApprovalRule | null>(null);
  const [confirmReactivateRule, setConfirmReactivateRule] = useState<ApprovalRule | null>(null);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const deleteMutation = useDeleteApprovalRule();
  const reactivateMutation = useReactivateApprovalRule();

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingRule(null);
    setShowFormModal(true);
  };

  const openEdit = (rule: ApprovalRule) => {
    setEditingRule(rule);
    setShowFormModal(true);
  };

  const closeModal = () => {
    setShowFormModal(false);
    setEditingRule(null);
  };

  const handleSaved = () => {
    closeModal();
    showSuccessToast(
      editingRule ? 'Approval rule updated.' : 'Approval rule created.'
    );
  };

  const handleDelete = async () => {
    if (!confirmDeleteRule) return;
    try {
      await deleteMutation.mutateAsync({
        ruleId: confirmDeleteRule.ruleId,
        orgId: organizationId,
      });
      showSuccessToast(
        `Rule for ${DOC_TYPE_LABELS[confirmDeleteRule.docType as DocType] ?? confirmDeleteRule.docType} deactivated.`
      );
      setConfirmDeleteRule(null);
    } catch {
      setConfirmDeleteRule(null);
    }
  };

  const handleReactivate = async () => {
    if (!confirmReactivateRule) return;
    try {
      await reactivateMutation.mutateAsync({
        ruleId: confirmReactivateRule.ruleId,
        orgId: organizationId,
      });
      showSuccessToast('Approval rule reactivated.');
      setConfirmReactivateRule(null);
    } catch {
      setConfirmReactivateRule(null);
    }
  };

  // ── No access guard ────────────────────────────────────────────────────────

  if (!canRead) {
    return (
      <PageContainer>
        <EmptyState>You don't have permission to view approval rules.</EmptyState>
      </PageContainer>
    );
  }

  if (!organizationId) {
    return (
      <PageContainer>
        <EmptyState>No organization assigned to this account.</EmptyState>
      </PageContainer>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageHeader>
        <div>
          <PageTitle>Approval Rules</PageTitle>
          <PageSubtitle>
            Rules that determine whether PRs and POs require approval before processing.
          </PageSubtitle>
        </div>
        {canWrite && (
          <PrimaryButton onClick={openCreate}>+ New Rule</PrimaryButton>
        )}
      </PageHeader>

      <ToolbarRow>
        <SearchInput
          placeholder="Search by approver role or notes..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          aria-label="Search approval rules"
        />
        <FilterSelect
          value={docTypeFilter}
          onChange={(e) => setDocTypeFilter(e.target.value as DocType | '')}
          aria-label="Filter by document type"
        >
          <option value="">All Doc Types</option>
          {DOC_TYPE_ORDER.map((dt) => (
            <option key={dt} value={dt}>
              {DOC_TYPE_LABELS[dt]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          aria-label="Filter by company code"
        >
          <option value="">All Companies</option>
          {companiesLoading ? (
            <option disabled>Loading companies...</option>
          ) : (
            companies.map((c) => (
              <option key={c.companyCode} value={c.companyCode}>
                {c.companyCode} — {c.legalName}
              </option>
            ))
          )}
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

      {isLoading && <EmptyState>Loading approval rules...</EmptyState>}

      {isError && (
        <EmptyState style={{ color: 'var(--color-error)' }}>
          Failed to load approval rules. Please refresh the page.
        </EmptyState>
      )}

      {!isLoading && !isError && (
        <TableWrapper>
          <Table aria-label="Approval rules">
            <Thead>
              <tr>
                <Th
                  $sortable
                  $active={sortKey === 'docType'}
                  onClick={() => handleSort('docType')}
                >
                  Doc Type{sortArrow('docType')}
                </Th>
                <Th
                  $sortable
                  $active={sortKey === 'companyCode'}
                  onClick={() => handleSort('companyCode')}
                >
                  Company{sortArrow('companyCode')}
                </Th>
                <Th
                  $sortable
                  $active={sortKey === 'approverRole'}
                  onClick={() => handleSort('approverRole')}
                >
                  Approver Role{sortArrow('approverRole')}
                </Th>
                <Th
                  $sortable
                  $active={sortKey === 'thresholdAmount'}
                  onClick={() => handleSort('thresholdAmount')}
                >
                  Threshold{sortArrow('thresholdAmount')}
                </Th>
                <Th>Always Required</Th>
                <Th
                  $sortable
                  $active={sortKey === 'priority'}
                  onClick={() => handleSort('priority')}
                >
                  Priority{sortArrow('priority')}
                </Th>
                <Th>Active</Th>
                <Th
                  $sortable
                  $active={sortKey === 'updatedAt'}
                  onClick={() => handleSort('updatedAt')}
                >
                  Updated{sortArrow('updatedAt')}
                </Th>
                {canWrite && <Th>Actions</Th>}
              </tr>
            </Thead>
            <Tbody>
              {sortedRules.length === 0 ? (
                <tr>
                  <td
                    colSpan={canWrite ? 9 : 8}
                    style={{ padding: '48px 32px', textAlign: 'center' }}
                  >
                    <EmptyState style={{ padding: 0 }}>
                      {searchText || docTypeFilter || companyFilter || activeFilter !== 'all'
                        ? 'No rules match the current filters.'
                        : 'No approval rules yet. Create the first one.'}
                    </EmptyState>
                  </td>
                </tr>
              ) : (
                sortedRules.map((rule) => (
                  <Tr key={rule.ruleId} $inactive={!rule.isActive}>
                    <Td>
                      <DocTypeBadge title={DOC_TYPE_LABELS[rule.docType as DocType]}>
                        {rule.docType}
                      </DocTypeBadge>
                      <div
                        style={{
                          fontSize: 11,
                          marginTop: 2,
                          color: 'var(--color-text-disabled)',
                        }}
                      >
                        {DOC_TYPE_LABELS[rule.docType as DocType] ?? rule.docType}
                      </div>
                    </Td>
                    <Td>{rule.companyCode}</Td>
                    <Td>
                      {ROLE_LABELS[rule.approverRole as keyof typeof ROLE_LABELS] ??
                        rule.approverRole}
                    </Td>
                    <Td>{formatThreshold(rule.thresholdAmount)}</Td>
                    <Td>
                      {rule.alwaysRequired ? <AlwaysPill>Always</AlwaysPill> : '—'}
                    </Td>
                    <Td>{rule.priority}</Td>
                    <Td>
                      <StatusBadge $active={rule.isActive}>
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </StatusBadge>
                    </Td>
                    <Td>{formatDate(rule.updatedAt)}</Td>
                    {canWrite && (
                      <ActionCell>
                        <ActionsGroup>
                          <IconButton
                            onClick={() => openEdit(rule)}
                            title="Edit rule"
                            aria-label={`Edit approval rule for ${rule.docType}`}
                          >
                            ✏️
                          </IconButton>
                          {rule.isActive ? (
                            <DangerIconButton
                              onClick={() => setConfirmDeleteRule(rule)}
                              title="Deactivate rule"
                              aria-label={`Deactivate approval rule for ${rule.docType}`}
                              disabled={deleteMutation.isPending}
                            >
                              🗑️
                            </DangerIconButton>
                          ) : (
                            <IconButton
                              onClick={() => setConfirmReactivateRule(rule)}
                              title="Reactivate rule"
                              aria-label={`Reactivate approval rule for ${rule.docType}`}
                              disabled={reactivateMutation.isPending}
                              style={{
                                color: 'var(--color-success, #0F6E56)',
                                borderColor: 'currentColor',
                              }}
                            >
                              ↩️
                            </IconButton>
                          )}
                        </ActionsGroup>
                      </ActionCell>
                    )}
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>

          {data && data.total > 0 && (
            <div
              style={{
                padding: '10px 14px',
                fontSize: 12,
                color: 'var(--color-text-disabled)',
                borderTop: '1px solid var(--color-neutral-100)',
              }}
            >
              {filteredRules.length} of {data.total} rule{data.total !== 1 ? 's' : ''}
              {searchText ? ` matching "${searchText}"` : ''}
            </div>
          )}
        </TableWrapper>
      )}

      {/* Test Resolution widget */}
      {!isLoading && !isError && organizationId && (
        <TesterWidget
          organizationId={organizationId}
          companies={companies}
          companiesLoading={companiesLoading}
        />
      )}

      {/* Create / Edit modal */}
      {showFormModal && (
        <RuleFormModal
          rule={editingRule}
          organizationId={organizationId}
          companies={companies}
          companiesLoading={companiesLoading}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}

      {/* Deactivate confirm */}
      {confirmDeleteRule && (
        <ConfirmDialog
          message={`Deactivate the approval rule for "${
            DOC_TYPE_LABELS[confirmDeleteRule.docType as DocType] ?? confirmDeleteRule.docType
          }" (company ${confirmDeleteRule.companyCode})? The rule will be marked inactive and will no longer trigger approval checks.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDeleteRule(null)}
          isPending={deleteMutation.isPending}
        />
      )}

      {/* Reactivate confirm */}
      {confirmReactivateRule && (
        <ConfirmDialog
          message={`Reactivate the approval rule for "${
            DOC_TYPE_LABELS[confirmReactivateRule.docType as DocType] ??
            confirmReactivateRule.docType
          }" (company ${confirmReactivateRule.companyCode})?`}
          onConfirm={handleReactivate}
          onCancel={() => setConfirmReactivateRule(null)}
          isPending={reactivateMutation.isPending}
        />
      )}
    </PageContainer>
  );
}
