/**
 * QuickServiceChargeModal — T-201.11
 *
 * UX shortcut: raises a service-only AR Invoice in 1 modal instead of 6 clicks
 * across two form pages. Intended for accountants who frequently log ad-hoc
 * late fees, retainers, or surcharges against a customer.
 *
 * On submit the component orchestrates a 4-step chain:
 *   1. POST /sales/orders-v2       — create service-only SO (DRAFT)
 *   2. PATCH /sales/orders-v2/:id/transition { newStatus: 'open' }
 *   3. POST /sales/ar-invoices/from-so/:soDocEntry
 *   4. PATCH /sales/ar-invoices/:id/transition { newStatus: 'open' }
 *
 * Partial-failure policy (decided 2026-06-04):
 *   No auto-rollback. Each step that fails surfaces a human-readable error
 *   message explaining what already exists so the accountant can clean up
 *   manually — which is the SAP B1 pattern and safer than issuing DELETEs
 *   that also write audit rows.
 *
 * Modal close rules (project rule — data-entry modals):
 *   - Overlay div intentionally has no onClick handler.
 *   - Modal content uses e.stopPropagation() as belt-and-suspenders.
 *   - Only the X button (top-right) and the Cancel button close the modal.
 *   - Escape key: NOT handled — keeps it consistent with other data-entry modals
 *     in this project that also do not close on Escape while an operation is in
 *     progress or the form is dirty.
 *
 * taxPercent client-side computation (see footnote in task):
 *   The SO backend stamps taxPercent=0 when the client does not send taxCodeId.
 *   For T-201.11 we pass the item's salesTaxCode so the SO totals are correct
 *   and the from-SO ARI inherits the right tax. taxPercent is computed from
 *   FALLBACK_TAX_CODES: "S"→5%, everything else→0 (safe approximation for display
 *   only — the backend is the authoritative source of the posted amount).
 *
 * Styled-components: all transient props use the $ prefix (UI-Standards.md).
 * TypeScript: no 'any'. React Hook Form + Zod for form validation.
 */

import { useState, useEffect, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled, { useTheme } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { SalesItemCombobox } from './SalesItemCombobox';
import type { SalesItemSelection } from './SalesItemCombobox';
import { useCreateSalesOrderV2, useTransitionSalesOrderV2 } from '../../hooks/queries/useSalesOrders';
import { useCreateARInvoiceFromSO, useTransitionArInvoice } from '../../hooks/queries/useArInvoices';
import { useTenantBaseCurrency } from '../../hooks/queries/useTenantBaseCurrency';
import { useTaxCodes } from '../../hooks/queries/useTaxCodes';
import { FALLBACK_TAX_CODES } from '../../services/taxCodesService';
import type { Customer } from '../../types/crm';

// ============================================================================
// Types
// ============================================================================

export interface QuickServiceChargeModalProps {
  customer: Customer;
  onClose: () => void;
  onSuccess: (ariDocEntry: string) => void;
}

/** The four sequential steps shown in the progress panel. */
type StepStatus = 'pending' | 'inProgress' | 'success' | 'failure';

interface ProgressStep {
  label: string;
  status: StepStatus;
  errorMessage?: string;
}

// ============================================================================
// Zod schema
// ============================================================================

const schema = z.object({
  itemId: z.string().min(1, 'Item required'),
  itemCode: z.string().min(1),
  itemName: z.string().min(1),
  salesTaxCode: z.string().nullable().optional(),
  quantity: z.coerce.number().positive('Must be > 0'),
  unitPrice: z.coerce.number().min(0, 'Must be ≥ 0'),
  notes: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

// ============================================================================
// Styled components — mirrors SalesItemsPage edit-modal pattern
// ============================================================================

/**
 * Overlay: intentionally has no onClick handler.
 * Project rule: data-entry modals close only via X button or Cancel.
 */
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  /* Intentionally no onClick — overlay click must NOT close modal. */
`;

const ModalBox = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 12px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  width: 520px;
  max-width: calc(100vw - 32px);
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
`;

const ModalTitle = styled.h2`
  font-size: 1.0625rem;
  font-weight: 700;
  margin: 0;
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 1.3;
`;

const ModalTitleSub = styled.span`
  font-size: 0.875rem;
  font-weight: 400;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: block;
  margin-top: 2px;
`;

const ModalClose = styled.button`
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 4px;
  border-radius: 4px;
  line-height: 1;
  flex-shrink: 0;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const ModalBody = styled.div`
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const ModalFooter = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 24px 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const FooterButtons = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const FooterNote = styled.p`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
  text-align: right;
`;

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FormLabel = styled.label`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const RequiredMark = styled.span`
  color: ${({ theme }) => theme.colors.error};
  margin-left: 2px;
`;

const FormInput = styled.input<{ $hasError?: boolean }>`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid
    ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.border)};
  border-radius: 6px;
  font-size: 0.875rem;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  box-sizing: border-box;
  transition: border-color 150ms ease-in-out, box-shadow 150ms ease-in-out;
  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.primary[500])};
    box-shadow: 0 0 0 2px
      ${({ $hasError, theme }) =>
        $hasError ? `${theme.colors.error}1A` : `${theme.colors.primary[500]}1A`};
  }
  &:disabled {
    background: ${({ theme }) => theme.colors.neutral[100]};
    cursor: not-allowed;
    opacity: 0.7;
  }
`;

const FormTextarea = styled.textarea<{ $hasError?: boolean }>`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid
    ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.border)};
  border-radius: 6px;
  font-size: 0.875rem;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  box-sizing: border-box;
  resize: vertical;
  min-height: 72px;
  transition: border-color 150ms ease-in-out, box-shadow 150ms ease-in-out;
  font-family: inherit;
  &:focus {
    outline: none;
    border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.error : theme.colors.primary[500])};
    box-shadow: 0 0 0 2px
      ${({ $hasError, theme }) =>
        $hasError ? `${theme.colors.error}1A` : `${theme.colors.primary[500]}1A`};
  }
  &:disabled {
    background: ${({ theme }) => theme.colors.neutral[100]};
    cursor: not-allowed;
    opacity: 0.7;
  }
`;

const FormError = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.error};
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
`;

const SubtotalRow = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding: 10px 0 2px;
  border-top: 1px dashed ${({ theme }) => theme.colors.border};
`;

const SubtotalLabel = styled.span`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const SubtotalValue = styled.span`
  font-size: 1rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

// ─── Progress panel ───────────────────────────────────────────────────────────

const ProgressPanel = styled.div`
  background: ${({ theme }) => theme.colors.neutral[100]};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ProgressPanelTitle = styled.p`
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
`;

const ProgressItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.875rem;
`;

const ProgressIcon = styled.span<{ $status: StepStatus }>`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 700;
  margin-top: 1px;

  ${({ $status, theme }) => {
    switch ($status) {
      case 'pending':
        return `background: ${theme.colors.neutral[200]}; color: ${theme.colors.textDisabled};`;
      case 'inProgress':
        return `background: ${theme.colors.warningBg}; color: ${theme.colors.gold[600]}; animation: pulse 1s ease-in-out infinite;`;
      case 'success':
        return `background: ${theme.colors.successBg}; color: ${theme.colors.emerald[600]};`;
      case 'failure':
        return `background: ${theme.colors.errorBg}; color: ${theme.colors.terracotta[600]};`;
    }
  }}

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;

const ProgressText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const ProgressLabel = styled.span<{ $status: StepStatus }>`
  color: ${({ $status, theme }) => {
    if ($status === 'success') return theme.colors.emerald[600];
    if ($status === 'failure') return theme.colors.terracotta[600];
    if ($status === 'inProgress') return theme.colors.gold[600];
    return theme.colors.textSecondary;
  }};
`;

const ProgressError = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.terracotta[600]};
`;

// ─── Buttons ──────────────────────────────────────────────────────────────────

const SubmitButton = styled.button<{ $loading?: boolean }>`
  padding: 9px 22px;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  border: none;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onAccent};
  cursor: ${({ $loading }) => ($loading ? 'not-allowed' : 'pointer')};
  opacity: ${({ $loading }) => ($loading ? 0.7 : 1)};
  transition: opacity 0.15s, background 0.15s;
  &:hover:not([disabled]) {
    background: ${({ theme }) => theme.colors.primary[700]};
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
`;

const CancelButton = styled.button`
  padding: 9px 22px;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
  }
`;

// ============================================================================
// Helper — taxPercent lookup
// ============================================================================

/**
 * Compute client-side taxPercent from a salesTaxCode string.
 *
 * The SO backend stamps taxPercent=0 when no taxCodeId is provided. For T-201.11
 * we pass the item's salesTaxCode so SO totals are correct and the from-SO ARI
 * inherits the right code. We derive taxPercent from FALLBACK_TAX_CODES:
 *   "S"  → 5  (UAE standard rate)
 *   "SR" → 5  (Reverse charge — same rate for display)
 *   other → 0 (Z / E / N / unknown)
 *
 * This is a display-only approximation. The backend is the authoritative source
 * of the posted tax amount.
 */
function resolveTaxPercent(taxCode: string | null | undefined): number {
  if (!taxCode) return 0;
  const match = FALLBACK_TAX_CODES.find((tc) => tc.taxCode === taxCode);
  return match ? parseFloat(match.rate) : 0;
}

/** Format ISO date string yyyy-MM-dd for today. */
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/** Format a number with 2 decimal places. */
function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Extract a user-friendly error message from an unknown axios / JS error. */
function extractErrorMessage(err: unknown): string {
  if (
    err &&
    typeof err === 'object' &&
    'response' in err &&
    (err as { response?: { data?: { message?: string; detail?: string } } }).response
  ) {
    const resp = (err as { response: { data?: { message?: string; detail?: string } } }).response;
    return resp.data?.message ?? resp.data?.detail ?? 'Unknown server error';
  }
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

// ============================================================================
// Component
// ============================================================================

export function QuickServiceChargeModal({
  customer,
  onClose,
  onSuccess,
}: QuickServiceChargeModalProps) {
  const theme = useTheme();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';

  const baseCurrency = useTenantBaseCurrency();
  const { data: taxCodes } = useTaxCodes(orgId);
  // Keep reference to resolved tax codes; fall back to FALLBACK_TAX_CODES on error.
  const resolvedTaxCodes = taxCodes && taxCodes.length > 0 ? taxCodes : FALLBACK_TAX_CODES;

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createSO = useCreateSalesOrderV2();
  const transitionSO = useTransitionSalesOrderV2();
  const createARI = useCreateARInvoiceFromSO();
  const transitionARI = useTransitionArInvoice();

  // ── Form ─────────────────────────────────────────────────────────────────────
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      itemId: '',
      itemCode: '',
      itemName: '',
      salesTaxCode: null,
      quantity: '' as unknown as number,
      unitPrice: '' as unknown as number,
      notes: '',
    },
  });

  const quantity = watch('quantity');
  const unitPrice = watch('unitPrice');

  const subtotal = (Number(quantity) || 0) * (Number(unitPrice) || 0);

  // ── Submit flow state ─────────────────────────────────────────────────────────
  const [submitted, setSubmitted] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[]>([
    { label: 'Sales Order created', status: 'pending' },
    { label: 'Sales Order posted', status: 'pending' },
    { label: 'AR Invoice created', status: 'pending' },
    { label: 'AR Invoice posted', status: 'pending' },
  ]);

  /** Update a single step by index. */
  const updateStep = (index: number, patch: Partial<ProgressStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  // Ref so the async submit handler always sees the latest navigate function.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // ── Submit handler ────────────────────────────────────────────────────────────
  const onSubmit = async (values: FormValues) => {
    setSubmitted(true);

    const today = todayISO();

    // Resolve taxPercent from loaded tax codes, or from FALLBACK_TAX_CODES.
    // Priority: live tax codes from the API > FALLBACK_TAX_CODES > 0.
    const taxPercent = (() => {
      if (!values.salesTaxCode) return 0;
      const fromLive = resolvedTaxCodes.find((tc) => tc.taxCode === values.salesTaxCode);
      return fromLive ? parseFloat(fromLive.rate) : resolveTaxPercent(values.salesTaxCode);
    })();

    // ── Step 1: Create service-only SO ────────────────────────────────────────
    updateStep(0, { status: 'inProgress' });

    let soDocEntry: string;
    let soDocNumber: string;
    let soLineId: string;

    try {
      const so = await createSO.mutateAsync({
        orgId,
        data: {
          customerId: customer.customerId,
          customerName: customer.name,
          companyCode: '', // backend auto-resolves for single-company orgs (T-201.0)
          docDate: today,
          // deliveryDate omitted — service-only SO never spawns a Delivery Note
          currency: baseCurrency,
          exchangeRate: 1,
          bpRefNo: null,
          notes: values.notes || null,
          lines: [
            {
              itemId: values.itemId,
              itemCode: values.itemCode,
              itemName: values.itemName,
              quantity: values.quantity,
              uom: 'unit',
              unitPrice: values.unitPrice,
              discountPercent: 0,
              taxPercent,
              // Pass salesTaxCode from the item selection so the SO line carries the
              // right tax code. The from-SO ARI will inherit it. T-201.11 footnote 1.
              taxCodeId: values.salesTaxCode ?? null,
              warehouseId: null,  // service items have no warehouse
              costCenterId: null,
              notes: null,
            },
          ],
        },
      });

      soDocEntry = so.docEntry;
      soDocNumber = so.docNumber;
      soLineId = so.lines[0]?.lineId ?? '';
      updateStep(0, { status: 'success' });
    } catch (err) {
      updateStep(0, {
        status: 'failure',
        errorMessage: `Failed to create Sales Order: ${extractErrorMessage(err)}`,
      });
      return; // Abort — nothing was posted yet.
    }

    // ── Step 2: Transition SO DRAFT → OPEN ────────────────────────────────────
    updateStep(1, { status: 'inProgress' });

    try {
      await transitionSO.mutateAsync({
        docId: soDocEntry,
        orgId,
        transition: { newStatus: 'open' },
      });
      updateStep(1, { status: 'success' });
    } catch (err) {
      updateStep(1, {
        status: 'failure',
        errorMessage:
          `Sales Order ${soDocNumber} was created but could not be posted: ` +
          `${extractErrorMessage(err)}. ` +
          `You can post it manually from Sales Orders.`,
      });
      // Fail-soft: the SO is DRAFT. Surface the error and abort.
      return;
    }

    // ── Step 3: Create from-SO AR Invoice ─────────────────────────────────────
    updateStep(2, { status: 'inProgress' });

    let ariDocEntry: string;
    let ariDocNumber: string;

    try {
      const ari = await createARI.mutateAsync({
        soDocEntry,
        orgId,
        data: {
          bpRefNo: null,
          docDate: today,
          invoiceDate: today,
          dateOfSupply: today,
          currency: baseCurrency,
          exchangeRate: 1,
          paymentTermsId: null, // TODO: respect customer default once available (T-203)
          journalMemo: values.notes || `Quick service charge for ${customer.name}`,
          notes: values.notes || null,
          lines: [
            {
              soLineId,
              quantity: values.quantity,
              // Pass unitPrice from the form — matches the SO line; backend will also
              // accept the SO line's price but we pass it explicitly for consistency.
              unitPrice: values.unitPrice,
            },
          ],
        },
      });

      ariDocEntry = ari.docEntry;
      ariDocNumber = ari.docNumber;
      updateStep(2, { status: 'success' });
    } catch (err) {
      updateStep(2, {
        status: 'failure',
        errorMessage:
          `Sales Order ${soDocNumber} is posted (OPEN). ` +
          `AR Invoice could not be created: ${extractErrorMessage(err)}. ` +
          `You can create the AR Invoice manually from the Sales Order detail page.`,
      });
      return;
    }

    // ── Step 4: Transition ARI DRAFT → OPEN ──────────────────────────────────
    updateStep(3, { status: 'inProgress' });

    try {
      await transitionARI.mutateAsync({
        docId: ariDocEntry,
        orgId,
        transition: { newStatus: 'open', reason: null },
      });
      updateStep(3, { status: 'success' });
    } catch (err) {
      updateStep(3, {
        status: 'failure',
        errorMessage:
          `AR Invoice ${ariDocNumber} was created but could not be posted: ` +
          `${extractErrorMessage(err)}. ` +
          `The Sales Order is fully invoiced; the AR Invoice just needs posting from AR Invoices.`,
      });
      // Fail-soft: ARI is DRAFT, SO is OPEN. Surface error.
      // We still call onSuccess so the parent can navigate to the ARI detail page
      // where the accountant can post it manually with one click.
      onSuccess(ariDocEntry);
      return;
    }

    // ── All four steps succeeded ──────────────────────────────────────────────
    onSuccess(ariDocEntry!);
  };

  // Determine if an operation is currently in flight.
  const isRunning = steps.some((s) => s.status === 'inProgress');
  const hasStarted = submitted;

  return (
    <ModalOverlay>
      {/* stopPropagation: belt-and-suspenders in case parent attaches onClick to overlay */}
      <ModalBox role="dialog" aria-modal="true" aria-labelledby="qsc-modal-title" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <ModalHeader>
          <div>
            <ModalTitle id="qsc-modal-title">Quick Service Charge</ModalTitle>
            <ModalTitleSub>{customer.name}</ModalTitleSub>
          </div>
          <ModalClose
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            disabled={isRunning}
          >
            ×
          </ModalClose>
        </ModalHeader>

        {/* ── Body ── */}
        <ModalBody>
          {/* Item picker */}
          <FormField>
            <FormLabel htmlFor="qsc-item">
              Item<RequiredMark aria-hidden="true">*</RequiredMark>
              <span style={{ fontWeight: 400, color: theme.colors.textSecondary, marginLeft: 8, fontSize: '0.75rem' }}>
                (service items only)
              </span>
            </FormLabel>
            <Controller
              name="itemId"
              control={control}
              render={() => (
                <SalesItemCombobox
                  valueItemId={watch('itemId')}
                  valueItemCode={watch('itemCode') ? `${watch('itemCode')} — ${watch('itemName')}` : ''}
                  filterIsStock={false}
                  hasError={Boolean(errors.itemId)}
                  describedBy={errors.itemId ? 'qsc-item-error' : undefined}
                  disabled={hasStarted}
                  onChange={(item: SalesItemSelection | null) => {
                    if (item) {
                      setValue('itemId', item.itemId, { shouldValidate: true });
                      setValue('itemCode', item.itemCode);
                      setValue('itemName', item.itemName);
                      setValue('salesTaxCode', item.salesTaxCode);
                    } else {
                      setValue('itemId', '');
                      setValue('itemCode', '');
                      setValue('itemName', '');
                      setValue('salesTaxCode', null);
                    }
                  }}
                />
              )}
            />
            {errors.itemId && (
              <FormError id="qsc-item-error" role="alert">
                {errors.itemId.message}
              </FormError>
            )}
          </FormField>

          {/* Quantity + Unit Price */}
          <FormRow>
            <FormField>
              <FormLabel htmlFor="qsc-quantity">
                Quantity<RequiredMark aria-hidden="true">*</RequiredMark>
              </FormLabel>
              <FormInput
                id="qsc-quantity"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="any"
                $hasError={Boolean(errors.quantity)}
                aria-describedby={errors.quantity ? 'qsc-qty-error' : undefined}
                disabled={hasStarted}
                {...register('quantity')}
              />
              {errors.quantity && (
                <FormError id="qsc-qty-error" role="alert">
                  {errors.quantity.message}
                </FormError>
              )}
            </FormField>

            <FormField>
              <FormLabel htmlFor="qsc-price">
                Unit Price<RequiredMark aria-hidden="true">*</RequiredMark>
              </FormLabel>
              <FormInput
                id="qsc-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                $hasError={Boolean(errors.unitPrice)}
                aria-describedby={errors.unitPrice ? 'qsc-price-error' : undefined}
                disabled={hasStarted}
                {...register('unitPrice')}
              />
              {errors.unitPrice && (
                <FormError id="qsc-price-error" role="alert">
                  {errors.unitPrice.message}
                </FormError>
              )}
            </FormField>
          </FormRow>

          {/* Notes */}
          <FormField>
            <FormLabel htmlFor="qsc-notes">Notes (optional)</FormLabel>
            <FormTextarea
              id="qsc-notes"
              placeholder="e.g. Late fee for invoice #INV-2026-0042"
              disabled={hasStarted}
              {...register('notes')}
            />
          </FormField>

          {/* Subtotal */}
          <SubtotalRow aria-live="polite">
            <SubtotalLabel>Subtotal:</SubtotalLabel>
            <SubtotalValue>
              {baseCurrency} {formatAmount(subtotal)}
            </SubtotalValue>
          </SubtotalRow>

          {/* Progress panel — shown after submit is clicked */}
          {hasStarted && (
            <ProgressPanel role="status" aria-live="polite" aria-label="Processing progress">
              <ProgressPanelTitle>Processing</ProgressPanelTitle>
              {steps.map((step, i) => (
                <ProgressItem key={i}>
                  <ProgressIcon $status={step.status} aria-hidden="true">
                    {step.status === 'pending' && '○'}
                    {step.status === 'inProgress' && '⏳'}
                    {step.status === 'success' && '✓'}
                    {step.status === 'failure' && '✗'}
                  </ProgressIcon>
                  <ProgressText>
                    <ProgressLabel $status={step.status}>{step.label}</ProgressLabel>
                    {step.errorMessage && (
                      <ProgressError>{step.errorMessage}</ProgressError>
                    )}
                  </ProgressText>
                </ProgressItem>
              ))}
            </ProgressPanel>
          )}
        </ModalBody>

        {/* ── Footer ── */}
        <ModalFooter>
          <FooterButtons>
            <CancelButton type="button" onClick={onClose}>
              Cancel
            </CancelButton>
            <SubmitButton
              type="button"
              $loading={isRunning}
              disabled={hasStarted}
              onClick={handleSubmit(onSubmit)}
            >
              {isRunning ? 'Processing…' : hasStarted ? 'Done' : 'Submit'}
            </SubmitButton>
          </FooterButtons>
          {hasStarted && (
            <FooterNote>
              Cancel will close this dialog but won't undo already-posted documents.
            </FooterNote>
          )}
        </ModalFooter>
      </ModalBox>
    </ModalOverlay>
  );
}
