/**
 * SalesOrderFormPage — Wave 3 (T-200.4)
 *
 * Three modes via URL params:
 *   /sales/orders-v2/new                          → create DRAFT SO (manual)
 *   /sales/orders-v2/from-quote/:quoteDocEntry    → pre-fill from Quote (from-quote mode)
 *   /sales/orders-v2/:docId/edit                  → edit DRAFT SO
 *
 * From-quote mode (headline UX win):
 *   Fetches the source Quote, pre-fills customer + all lines into the form.
 *   Lines are editable; submission calls createSalesOrderFromQuote endpoint.
 *   Quote is auto-closed by backend when all lines consumed.
 *
 * Header fields: customer, docDate, deliveryDate (required for SO),
 *   currency, exchangeRate, paymentTermsId, bpRefNo, notes.
 *
 * Lines table (useFieldArray): itemCode/itemName, description, qty, uom,
 *   unitPrice, discountPercent, taxPercent, warehouseId, costCenterId.
 *
 * Live totals with useMemo.
 * Credit-limit error: red alert banner above submit button.
 * Attachments via AttachmentList (docType="SALES_ORDER").
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 * NO Audit History button — sales audit endpoint pending T-200.x.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import axios from 'axios';
import {
  useSalesOrderV2,
  useCreateSalesOrderV2,
  useCreateSalesOrderFromQuote,
  useUpdateSalesOrderV2,
} from '../../hooks/queries/useSalesOrders';
import { useQuote } from '../../hooks/queries/useQuotes';
import { useAuthStore } from '../../stores/auth.store';
import { CustomerCombobox } from '../../components/sales/CustomerCombobox';
import { SalesItemCombobox } from '../../components/sales/SalesItemCombobox';
import { CurrencyCombobox } from '../../components/sales/CurrencyCombobox';
import { PaymentTermsCombobox } from '../../components/sales/PaymentTermsCombobox';
import type { SalesItemSelection } from '../../components/sales/SalesItemCombobox';
import type { PaymentTermsSelection } from '../../components/sales/PaymentTermsCombobox';
import { useTenantBaseCurrency } from '../../hooks/queries/useTenantBaseCurrency';
import { useSaleItemFinanceExtList } from '../../hooks/queries/useSaleItemFinanceExt';
import { AttachmentList } from '../../components/attachments/AttachmentList';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const lineSchema = z.object({
  itemId: z.string().min(1, 'Required'),
  itemCode: z.string().min(1, 'Required'),
  itemName: z.string().min(1, 'Required'),
  description: z.string().optional().nullable(),
  quantity: z.coerce.number().positive('Must be > 0'),
  uom: z.string().min(1, 'Required'),
  unitPrice: z.coerce.number().min(0, 'Must be >= 0'),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  taxCodeId: z.string().optional().nullable(),
  warehouseId: z.string().optional().nullable(),
  costCenterId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const formSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  customerName: z.string().min(1, 'Customer is required'),
  docDate: z.string().min(1, 'Order date is required'),
  deliveryDate: z.string().optional().nullable(),
  currency: z.string().default('AED'),
  exchangeRate: z.coerce.number().min(0).default(1),
  paymentTermsId: z.string().optional().nullable(),
  bpRefNo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  journalMemo: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, 'At least one line is required'),
});

type FormData = z.infer<typeof formSchema>;

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1200px;
  margin: 0 auto;
`;

const BackLink = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary[500]};
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 20px;
  &:hover { text-decoration: underline; }
`;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 28px;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
`;

const SectionTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 20px;
`;

const Grid = styled.div<{ $cols?: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols ?? 2}, 1fr);
  gap: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Input = styled.input<{ $error?: boolean }>`
  padding: 10px 12px;
  border: 1px solid ${({ $error, theme }) =>
    $error ? theme.colors.error : theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus {
    outline: none;
    border-color: ${({ $error, theme }) =>
      $error ? theme.colors.error : theme.colors.primary[500]};
  }
`;

const Textarea = styled.textarea`
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  min-height: 80px;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const FieldError = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.error};
`;

const LinesHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const AddLineBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px dashed ${({ theme }) => theme.colors.primary[400]};
  background: ${({ theme }) => theme.colors.primary[50]};
  color: ${({ theme }) => theme.colors.primary[600]};
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.colors.primary[100]};
  }
`;

const LinesTable = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 960px;
`;

const Th = styled.th`
  padding: 10px;
  background: ${({ theme }) => theme.colors.neutral[50]};
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: left;
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 8px 6px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: top;
`;

const LineInput = styled.input`
  padding: 7px 8px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  font-size: 13px;
  width: 100%;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const DeleteLineBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.terracotta[600]};
  border-radius: 6px;
  cursor: pointer;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  &:hover {
    background: ${({ theme }) => theme.colors.errorBg};
    border-color: ${({ theme }) => theme.colors.terracotta[600]};
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  /* Ensure SVG icon inherits color and stays visible. */
  & > svg {
    width: 16px;
    height: 16px;
    color: currentColor;
    stroke: currentColor;
  }
`;

const TotalsCard = styled.div`
  background: ${({ theme }) => theme.colors.neutral[50]};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 10px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 360px;
  margin-left: auto;
`;

const TotalsRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const TotalsGross = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-top: 2px solid ${({ theme }) => theme.colors.neutral[300]};
  padding-top: 10px;
`;

const CreditErrorBanner = styled.div`
  padding: 14px 18px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.terracotta[200]};
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.terracotta[700]};
  font-size: 14px;
  margin-bottom: 16px;
`;

const FromQuoteBanner = styled.div`
  padding: 12px 18px;
  background: ${({ theme }) => theme.colors.infoBg};
  border: 1px solid ${({ theme }) => theme.colors.lapis[200]};
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.lapis[700]};
  font-size: 13px;
  margin-bottom: 20px;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
`;

const SubmitBtn = styled.button`
  padding: 12px 28px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.primary[700]}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const CancelBtn = styled.button`
  padding: 12px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
`;

const ErrorBanner = styled.div`
  padding: 16px 20px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid ${({ theme }) => theme.colors.terracotta[200]};
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.terracotta[700]};
  font-size: 14px;
  margin-bottom: 24px;
`;

/**
 * T-201.10 — Type badge for line-type visual hint in the SO form.
 * Mirrors the TypeChip from SalesItemsPage (T-201.8) — same palette.
 * $isStock=true → Stock (blue tint); $isStock=false → Service (amber).
 */
const TypeChip = styled.span<{ $isStock: boolean }>`
  display: inline-block;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 600;
  background: ${({ $isStock, theme }) =>
    $isStock
      ? theme.colors.primary[50]
      : theme.colors.warningBg};
  color: ${({ $isStock, theme }) =>
    $isStock
      ? theme.colors.primary[500]
      : theme.colors.gold[800]};
`;

/** T-201.10 — Small subtitle below the page title indicating Service-Only mode. */
const ServiceOnlySubtitle = styled.p`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: -20px 0 24px;
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAmount(amount: number, currency = 'AED'): string {
  return `${currency} ${amount.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const DEFAULT_LINE = {
  itemId: '',
  itemCode: '',
  itemName: '',
  description: '',
  quantity: 1,
  uom: 'pcs',
  unitPrice: 0,
  discountPercent: 0,
  taxPercent: 0,
  taxCodeId: null,
  warehouseId: null,
  costCenterId: null,
  notes: null,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function SalesOrderFormPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { docId, quoteDocEntry } = useParams<{ docId?: string; quoteDocEntry?: string }>();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';

  // Determine mode
  const mode: 'new' | 'from-quote' | 'edit' = quoteDocEntry
    ? 'from-quote'
    : docId
    ? 'edit'
    : 'new';

  // Load existing SO for edit mode
  const { data: existingSo, isLoading: soLoading } = useSalesOrderV2(
    mode === 'edit' ? docId : undefined,
    orgId,
  );

  // Load source Quote for from-quote mode
  const { data: sourceQuote, isLoading: quoteLoading } = useQuote(
    mode === 'from-quote' ? quoteDocEntry : undefined,
    orgId,
  );

  // Mutations
  const createMut = useCreateSalesOrderV2();
  const fromQuoteMut = useCreateSalesOrderFromQuote();
  const updateMut = useUpdateSalesOrderV2();

  // Error state for credit-limit failure (409 from backend)
  const submitError = createMut.error ?? fromQuoteMut.error ?? updateMut.error ?? null;
  const creditError = useMemo(() => {
    if (!submitError) return null;
    // Extract message from axios error
    if (axios.isAxiosError(submitError)) {
      const detail = submitError.response?.data?.detail ?? '';
      if (typeof detail === 'string' && detail.toLowerCase().includes('credit limit')) {
        return detail;
      }
      if (typeof detail === 'string' && submitError.response?.status === 409) {
        return detail;
      }
    }
    return null;
  }, [submitError]);

  const generalError = useMemo(() => {
    if (!submitError || creditError) return null;
    if (axios.isAxiosError(submitError)) {
      return submitError.response?.data?.detail ?? submitError.message ?? 'Submission failed.';
    }
    return 'Submission failed. Please try again.';
  }, [submitError, creditError]);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: '',
      customerName: '',
      docDate: new Date().toISOString().slice(0, 10),
      deliveryDate: null,
      currency: 'AED',
      exchangeRate: 1,
      paymentTermsId: null,
      bpRefNo: null,
      notes: null,
      journalMemo: null,
      lines: [{ ...DEFAULT_LINE }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const lines = watch('lines');
  const currency = watch('currency');

  // Exchange rate visibility + base currency
  const baseCurrency = useTenantBaseCurrency();
  const showExchangeRate = currency !== baseCurrency;
  const [paymentTermsName, setPaymentTermsName] = useState<string>('');

  // T-201.10: Fetch all item finance exts so we can determine isStock per line.
  const { data: itemFinanceExts = [] } = useSaleItemFinanceExtList(orgId);
  const itemExtByItemId = useMemo(() => {
    const map = new Map<string, { isStock: boolean }>();
    for (const ext of itemFinanceExts) {
      map.set(ext.itemId, { isStock: ext.isStock ?? true });
    }
    return map;
  }, [itemFinanceExts]);

  // Derive line-type mix from the watched lines. Empty/default rows
  // (itemId === '') are excluded so the default "+ Add Line" blank row
  // doesn't poison the detection.
  //
  // NOTE: NOT memoised — `watch('lines')` from react-hook-form returns a
  // reference-stable array when individual line contents change (only
  // the inner objects mutate). useMemo's Object.is dep check missed
  // those mutations and served stale flags after a second line was
  // added. Recomputing per render is cheap for small line counts and
  // guarantees the mode reflects current form state.
  const lineTypeFlags = (lines ?? [])
    .filter((l) => Boolean(l?.itemId))
    .map((l) => itemExtByItemId.get(l.itemId)?.isStock ?? true);
  const hasLines = lineTypeFlags.length > 0;
  const allService = hasLines && lineTypeFlags.every((s) => s === false);
  const allStock = hasLines && lineTypeFlags.every((s) => s === true);
  const isMixed = hasLines && !allService && !allStock;

  // Reset exchangeRate to 1.0 when currency reverts to base.
  useEffect(() => {
    if (!showExchangeRate) {
      setValue('exchangeRate', 1);
    }
  }, [showExchangeRate, setValue]);

  // Pre-fill from Quote when in from-quote mode
  useEffect(() => {
    if (mode === 'from-quote' && sourceQuote) {
      reset({
        customerId: sourceQuote.customerId,
        customerName: sourceQuote.customerName,
        docDate: new Date().toISOString().slice(0, 10),
        deliveryDate: null,
        currency: sourceQuote.currency,
        exchangeRate: sourceQuote.exchangeRate,
        paymentTermsId: sourceQuote.paymentTermsId ?? null,
        bpRefNo: sourceQuote.bpRefNo ?? null,
        notes: sourceQuote.notes ?? null,
        journalMemo: sourceQuote.journalMemo ?? null,
        lines: sourceQuote.lines.map((l) => ({
          itemId: l.itemId,
          itemCode: l.itemCode,
          itemName: l.itemName,
          description: l.description ?? '',
          quantity: l.quantity,
          uom: l.uom,
          unitPrice: l.unitPrice,
          discountPercent: l.discountPercent,
          taxPercent: l.taxPercent,
          taxCodeId: l.taxCodeId ?? null,
          warehouseId: l.warehouseId ?? null,
          costCenterId: l.costCenterId ?? null,
          notes: l.notes ?? null,
        })),
      });
    }
  }, [mode, sourceQuote, reset]);

  // Pre-fill from existing SO for edit mode
  useEffect(() => {
    if (mode === 'edit' && existingSo) {
      reset({
        customerId: existingSo.customerId,
        customerName: existingSo.customerName,
        docDate: existingSo.docDate,
        deliveryDate: existingSo.deliveryDate ?? null,
        currency: existingSo.currency,
        exchangeRate: existingSo.exchangeRate,
        paymentTermsId: existingSo.paymentTermsId ?? null,
        bpRefNo: existingSo.bpRefNo ?? null,
        notes: existingSo.notes ?? null,
        journalMemo: existingSo.journalMemo ?? null,
        lines: existingSo.lines.map((l) => ({
          itemId: l.itemId,
          itemCode: l.itemCode,
          itemName: l.itemName,
          description: l.description ?? '',
          quantity: l.quantity,
          uom: l.uom,
          unitPrice: l.unitPrice,
          discountPercent: l.discountPercent,
          taxPercent: l.taxPercent,
          taxCodeId: l.taxCodeId ?? null,
          warehouseId: l.warehouseId ?? null,
          costCenterId: l.costCenterId ?? null,
          notes: l.notes ?? null,
        })),
      });
    }
  }, [mode, existingSo, reset]);

  // Live totals
  const totals = useMemo(() => {
    let net = 0;
    let tax = 0;
    for (const l of lines ?? []) {
      const qty = Number(l.quantity) || 0;
      const up = Number(l.unitPrice) || 0;
      const disc = Number(l.discountPercent) || 0;
      const taxPct = Number(l.taxPercent) || 0;
      const lineNet = qty * up * (1 - disc / 100);
      const lineTax = lineNet * (taxPct / 100);
      net += lineNet;
      tax += lineTax;
    }
    return { net, tax, gross: net + tax };
  }, [lines]);

  async function onSubmit(data: FormData) {
    // Reason: companyCode is now auto-resolved by the backend via the company_resolver.
    // Do not pass it from the frontend — omit from the create payload entirely.
    const linePayload = data.lines.map((l) => ({
      itemId: l.itemId,
      itemCode: l.itemCode,
      itemName: l.itemName,
      description: l.description ?? null,
      quantity: l.quantity,
      uom: l.uom,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      taxCodeId: l.taxCodeId ?? null,
      taxPercent: l.taxPercent,
      warehouseId: l.warehouseId ?? null,
      costCenterId: l.costCenterId ?? null,
      notes: l.notes ?? null,
    }));

    if (mode === 'from-quote' && quoteDocEntry) {
      const so = await fromQuoteMut.mutateAsync({
        quoteDocEntry,
        data: {
          deliveryDate: data.deliveryDate || null,
          notes: data.notes ?? null,
        },
        orgId,
      });
      navigate(`/sales/orders-v2/${so.docEntry}`);
    } else if (mode === 'edit' && docId) {
      const so = await updateMut.mutateAsync({
        docId,
        data: {
          customerId: data.customerId,
          customerName: data.customerName,
          bpRefNo: data.bpRefNo ?? null,
          docDate: data.docDate,
          deliveryDate: data.deliveryDate ?? null,
          currency: data.currency,
          exchangeRate: data.exchangeRate,
          paymentTermsId: data.paymentTermsId ?? null,
          journalMemo: data.journalMemo ?? null,
          notes: data.notes ?? null,
          lines: linePayload,
        },
        orgId,
      });
      navigate(`/sales/orders-v2/${so.docEntry}`);
    } else {
      const so = await createMut.mutateAsync({
        data: {
          customerId: data.customerId,
          customerName: data.customerName,
          bpRefNo: data.bpRefNo ?? null,
          docDate: data.docDate,
          deliveryDate: data.deliveryDate ?? null,
          currency: data.currency,
          exchangeRate: data.exchangeRate,
          paymentTermsId: data.paymentTermsId ?? null,
          journalMemo: data.journalMemo ?? null,
          notes: data.notes ?? null,
          lines: linePayload,
        },
        orgId,
      });
      navigate(`/sales/orders-v2/${so.docEntry}`);
    }
  }

  const pageTitle =
    mode === 'from-quote'
      ? 'New Sales Order from Quote'
      : mode === 'edit'
      ? 'Edit Sales Order'
      : 'New Sales Order';

  const isLoading = soLoading || quoteLoading;

  if (isLoading) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/orders-v2')}>← Sales Orders</BackLink>
        <PageTitle>{pageTitle}</PageTitle>
        <Card>
          <p style={{ color: theme.colors.textSecondary }}>Loading…</p>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/orders-v2')}>← Sales Orders</BackLink>
      <PageTitle>{pageTitle}</PageTitle>
      {/* T-201.10: service-only subtitle — shown only when all lines are service items */}
      {allService && (
        <ServiceOnlySubtitle>Service-Only Sales Order</ServiceOnlySubtitle>
      )}

      {mode === 'from-quote' && sourceQuote && (
        <FromQuoteBanner>
          Converted from Quote <strong>{sourceQuote.docNumber}</strong> — {sourceQuote.customerName}.
          Lines are pre-filled from the Quote. Adjust quantities or add a delivery date before saving.
        </FromQuoteBanner>
      )}

      {generalError && (
        <ErrorBanner>{generalError}</ErrorBanner>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* ── Header card ── */}
        <Card>
          <SectionTitle>Sales Order Header</SectionTitle>
          <Grid $cols={2}>
            {/* Customer */}
            <Field style={{ gridColumn: '1 / -1' }}>
              <Label>Customer *</Label>
              <CustomerCombobox
                valueCustomerId={watch('customerId') || null}
                valueCustomerName={watch('customerName') || ''}
                onCustomerSelect={(customer) => {
                  setValue('customerId', customer.customerId, { shouldValidate: true });
                  setValue('customerName', customer.name, { shouldValidate: true });
                }}
                onClear={() => {
                  setValue('customerId', '', { shouldValidate: true });
                  setValue('customerName', '', { shouldValidate: true });
                }}
                error={errors.customerId?.message}
                disabled={mode === 'from-quote'}
              />
              {/* CustomerCombobox renders errors.customerId internally via its
                  `error` prop — no external FieldError needed (was duplicating). */}
            </Field>

            {/* Doc Date */}
            <Field>
              <Label>Order Date *</Label>
              <Input
                type="date"
                $error={Boolean(errors.docDate)}
                {...register('docDate')}
              />
              {errors.docDate && <FieldError>{errors.docDate.message}</FieldError>}
            </Field>

            {/* Delivery Date — hidden when all lines are service items (T-201.10) */}
            {!allService && (
              <Field>
                <Label>Delivery Date</Label>
                <Input
                  type="date"
                  $error={Boolean(errors.deliveryDate)}
                  {...register('deliveryDate')}
                />
                {errors.deliveryDate && <FieldError>{errors.deliveryDate.message}</FieldError>}
              </Field>
            )}

            {/* Currency */}
            <Field>
              <Label>Currency</Label>
              <Controller
                name="currency"
                control={control}
                render={({ field }) => (
                  <CurrencyCombobox
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isSubmitting}
                    hasError={Boolean(errors.currency)}
                  />
                )}
              />
            </Field>

            {/* Exchange Rate — only visible when currency differs from base */}
            {showExchangeRate && (
              <Field>
                <Label>Exchange Rate</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  {...register('exchangeRate')}
                />
              </Field>
            )}

            {/* Payment Terms */}
            <Field>
              <Label>Payment Terms</Label>
              <Controller
                name="paymentTermsId"
                control={control}
                render={({ field }) => (
                  <PaymentTermsCombobox
                    valueTermsId={field.value ?? null}
                    valueTermsName={paymentTermsName}
                    onChange={(selection: PaymentTermsSelection | null) => {
                      field.onChange(selection?.termsId ?? null);
                      setPaymentTermsName(selection?.description ?? '');
                    }}
                    disabled={isSubmitting}
                    hasError={Boolean(errors.paymentTermsId)}
                  />
                )}
              />
            </Field>

            {/* BP Ref No */}
            <Field>
              <Label>BP Ref No (Customer PO #)</Label>
              <Input
                type="text"
                placeholder="Customer PO number"
                {...register('bpRefNo')}
              />
            </Field>

            {/* Notes */}
            <Field style={{ gridColumn: '1 / -1' }}>
              <Label>Notes</Label>
              <Textarea {...register('notes')} placeholder="Optional header notes…" />
            </Field>
          </Grid>
        </Card>

        {/* ── Lines card ── */}
        <Card>
          <LinesHeader>
            <SectionTitle style={{ margin: 0 }}>Order Lines</SectionTitle>
            {mode !== 'from-quote' && (
              <AddLineBtn
                type="button"
                onClick={() => append({ ...DEFAULT_LINE })}
              >
                <Plus size={14} />
                Add Line
              </AddLineBtn>
            )}
          </LinesHeader>

          {errors.lines?.root && (
            <FieldError style={{ display: 'block', marginBottom: 12 }}>
              {errors.lines.root.message}
            </FieldError>
          )}

          <LinesTable>
            <Table>
              <thead>
                <tr>
                  <Th style={{ minWidth: 200 }}>Item</Th>
                  {/* T-201.10: Type column shown in mixed mode only */}
                  {isMixed && <Th style={{ width: 72 }}>Type</Th>}
                  <Th style={{ width: 120 }}>Description</Th>
                  <Th style={{ width: 70 }}>Qty</Th>
                  <Th style={{ width: 60 }}>UOM</Th>
                  <Th style={{ width: 90 }}>Unit Price</Th>
                  <Th style={{ width: 70 }}>Disc %</Th>
                  <Th style={{ width: 60 }}>Tax %</Th>
                  {!allService && <Th style={{ width: 100 }}>Warehouse</Th>}
                  <Th style={{ width: 32 }}></Th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, idx) => (
                  <tr key={field.id}>
                    <Td>
                      <Controller
                        name={`lines.${idx}.itemId`}
                        control={control}
                        render={({ field }) => (
                          <SalesItemCombobox
                            valueItemId={field.value ?? ''}
                            valueItemCode={watch(`lines.${idx}.itemCode`) ?? ''}
                            onChange={(selection: SalesItemSelection | null) => {
                              if (selection) {
                                field.onChange(selection.itemId);
                                setValue(`lines.${idx}.itemCode`, selection.itemCode, { shouldValidate: true });
                                setValue(`lines.${idx}.itemName`, selection.itemName, { shouldValidate: true });
                                if (selection.salesTaxCode) {
                                  setValue(`lines.${idx}.taxCodeId`, selection.salesTaxCode);
                                }
                              } else {
                                field.onChange('');
                                setValue(`lines.${idx}.itemCode`, '', { shouldValidate: true });
                                setValue(`lines.${idx}.itemName`, '', { shouldValidate: true });
                                setValue(`lines.${idx}.taxCodeId`, null);
                              }
                            }}
                            hasError={Boolean(errors.lines?.[idx]?.itemId || errors.lines?.[idx]?.itemCode)}
                            disabled={mode === 'from-quote' || isSubmitting}
                            placeholder="Search item…"
                          />
                        )}
                      />
                      <input type="hidden" {...register(`lines.${idx}.itemCode`)} />
                      <input type="hidden" {...register(`lines.${idx}.itemName`)} />
                    </Td>
                    {/* T-201.10: Type badge column — shown only in mixed mode */}
                    {isMixed && (
                      <Td>
                        {lines[idx]?.itemId ? (
                          <TypeChip $isStock={itemExtByItemId.get(lines[idx].itemId)?.isStock ?? true}>
                            {(itemExtByItemId.get(lines[idx].itemId)?.isStock ?? true) ? 'Stock' : 'Service'}
                          </TypeChip>
                        ) : null}
                      </Td>
                    )}
                    <Td>
                      <LineInput
                        {...register(`lines.${idx}.description`)}
                        placeholder="Description"
                      />
                    </Td>
                    <Td>
                      <LineInput
                        type="number"
                        min="0.001"
                        step="0.001"
                        {...register(`lines.${idx}.quantity`)}
                      />
                    </Td>
                    <Td>
                      <LineInput
                        {...register(`lines.${idx}.uom`)}
                        placeholder="pcs"
                      />
                    </Td>
                    <Td>
                      <LineInput
                        type="number"
                        min="0"
                        step="0.01"
                        {...register(`lines.${idx}.unitPrice`)}
                      />
                    </Td>
                    <Td>
                      <LineInput
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        {...register(`lines.${idx}.discountPercent`)}
                      />
                    </Td>
                    <Td>
                      <LineInput
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        {...register(`lines.${idx}.taxPercent`)}
                      />
                    </Td>
                    {/* T-201.10: Warehouse hidden in service-only mode; shown per-row in mixed/stock */}
                    {!allService && (
                      <Td>
                        <LineInput
                          {...register(`lines.${idx}.warehouseId`)}
                          placeholder="WH-001"
                          disabled={!!(lines[idx]?.itemId && itemExtByItemId.get(lines[idx].itemId)?.isStock === false)}
                          style={{
                            opacity: (lines[idx]?.itemId && itemExtByItemId.get(lines[idx].itemId)?.isStock === false) ? 0.4 : 1,
                          }}
                          title={
                            (lines[idx]?.itemId && itemExtByItemId.get(lines[idx].itemId)?.isStock === false)
                              ? 'Warehouse not applicable for service items'
                              : undefined
                          }
                        />
                      </Td>
                    )}
                    <Td>
                      <DeleteLineBtn
                        type="button"
                        onClick={() => remove(idx)}
                        aria-label="Remove line"
                        disabled={fields.length === 1}
                      >
                        <Trash2 size={14} />
                      </DeleteLineBtn>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </LinesTable>

          {/* Live totals */}
          <TotalsCard style={{ marginTop: 24 }}>
            <TotalsRow>
              <span>Net Total</span>
              <span>{formatAmount(totals.net, currency)}</span>
            </TotalsRow>
            <TotalsRow>
              <span>Tax Total</span>
              <span>{formatAmount(totals.tax, currency)}</span>
            </TotalsRow>
            <TotalsGross>
              <span>Gross Total</span>
              <span>{formatAmount(totals.gross, currency)}</span>
            </TotalsGross>
          </TotalsCard>
        </Card>

        {/* Attachments (only shown in edit/existing-doc mode) */}
        {mode === 'edit' && docId && (
          <Card>
            <SectionTitle>Attachments</SectionTitle>
            <AttachmentList docType="SALES_ORDER" docId={docId} />
          </Card>
        )}

        {/* Credit-limit error banner above submit */}
        {creditError && (
          <CreditErrorBanner>
            <strong>Credit Limit Exceeded</strong> — {creditError}
          </CreditErrorBanner>
        )}

        <ActionRow>
          <CancelBtn type="button" onClick={() => navigate('/sales/orders-v2')}>
            Cancel
          </CancelBtn>
          <SubmitBtn type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving…'
              : mode === 'from-quote'
              ? 'Create Sales Order from Quote'
              : mode === 'edit'
              ? 'Save Changes'
              : 'Create Sales Order'}
          </SubmitBtn>
        </ActionRow>
      </form>
    </Container>
  );
}
