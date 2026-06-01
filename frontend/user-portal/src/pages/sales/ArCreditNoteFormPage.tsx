/**
 * ArCreditNoteFormPage — Wave 3 (T-200.8)
 *
 * Four modes via URL params:
 *   /sales/ar-credit-notes/new                             → blank form (rare)
 *   /sales/ar-credit-notes/from-rtn/:rtnDocEntry           → pre-fill from RTN
 *   /sales/ar-credit-notes/from-invoice/:ariDocEntry       → pre-fill from AR Invoice
 *   /sales/ar-credit-notes/:docId/edit                     → edit DRAFT ARC
 *
 * From-RTN mode (financial completion of physical return):
 *   Fetches the source RTN, pre-fills customer (locked) + lines at RTN quantities.
 *   baseReturnDocRef = RTN; baseDocRef inherits from RTN's chain (ARI).
 *   Submits via createArCreditNoteFromRTN.
 *
 * From-Invoice mode (direct financial reversal — discounts, corrections):
 *   Fetches the source ARI, pre-fills customer (locked) + all open lines.
 *   User adjusts which lines and quantities to credit.
 *   baseReturnDocRef = null; baseDocRef = ARI line refs.
 *   Auto-populates first allocation row with full ARI gross amount.
 *   Submits via createArCreditNoteFromInvoice.
 *
 * Header: customer (locked in from-X), docDate, dateOfSupply, invoiceDate,
 *   currency, exchangeRate, paymentTermsId, bpRefNo, creditReason, notes.
 * Lines table (useFieldArray): item, description, creditedQty, uom, unitPrice,
 *   discountPercent, taxPercent, warehouseId, costCenterId, baseDocRef.
 * Allocations table (useFieldArray): pick ARI, amount applied.
 *   Sum of allocations must equal gross total (validated on submit).
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 * NO Audit History button — sales audit endpoint pending T-200.x.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2, Plus } from 'lucide-react';
import {
  useArCreditNote,
  useCreateArCreditNoteFromRTN,
  useCreateArCreditNoteFromInvoice,
  useCreateArCreditNote,
  useUpdateArCreditNote,
} from '../../hooks/queries/useArCreditNotes';
import { useReturn } from '../../hooks/queries/useReturns';
import { useArInvoice } from '../../hooks/queries/useArInvoices';
import { useAuthStore } from '../../stores/auth.store';
import type { CreditReason } from '../../services/salesApi';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const lineSchema = z.object({
  itemId: z.string().min(1, 'Required'),
  itemCode: z.string().min(1, 'Required'),
  itemName: z.string().min(1, 'Required'),
  description: z.string().optional().nullable(),
  creditedQty: z.coerce.number().positive('Must be > 0'),
  uom: z.string().min(1, 'Required'),
  unitPrice: z.coerce.number().min(0, 'Must be ≥ 0'),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  taxCodeId: z.string().optional().nullable(),
  revenueAccountId: z.string().min(1, 'Revenue account is required'),
  warehouseId: z.string().optional().nullable(),
  costCenterId: z.string().optional().nullable(),
  // Source line doc ref fields
  baseDocRefDocType: z.string().min(1, 'Required'),
  baseDocRefDocId: z.string().min(1, 'Required'),
  baseDocRefDocNumber: z.string().min(1, 'Required'),
  baseDocRefLineId: z.string().optional().nullable(),
});

const allocationSchema = z.object({
  arInvoiceDocEntry: z.string().min(1, 'Required'),
  arInvoiceDocNumber: z.string().min(1, 'Required'),
  amountApplied: z.coerce.number().positive('Must be > 0'),
});

const formSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  customerName: z.string().min(1, 'Customer is required'),
  companyCode: z.string().optional().default(''),
  bpRefNo: z.string().max(100).optional().nullable(),
  docDate: z.string().min(1, 'Document date is required'),
  dateOfSupply: z.string().min(1, 'Date of supply is required'),
  invoiceDate: z.string().min(1, 'Invoice date is required'),
  currency: z.string().default('AED'),
  exchangeRate: z.coerce.number().min(0).default(1),
  paymentTermsId: z.string().optional().nullable(),
  creditReason: z.enum([
    'return', 'price_adjustment', 'discount', 'goodwill', 'cancellation', 'other',
  ] as [CreditReason, ...CreditReason[]]),
  creditReasonText: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  journalMemo: z.string().max(500).optional().nullable(),
  // Base return doc ref (set in from-RTN mode)
  baseReturnDocRefDocType: z.string().optional().nullable(),
  baseReturnDocRefDocId: z.string().optional().nullable(),
  baseReturnDocRefDocNumber: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1, 'At least one line is required'),
  allocations: z.array(allocationSchema).min(1, 'At least one allocation is required'),
});

type FormValues = z.infer<typeof formSchema>;

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1280px;
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
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 28px 0;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const CardTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 20px 0;
`;

const FormGrid = styled.div<{ $cols?: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols = 3 }) => $cols}, 1fr);
  gap: 20px;
  @media (max-width: 900px) { grid-template-columns: repeat(2, 1fr); }
  @media (max-width: 600px) { grid-template-columns: 1fr; }
`;

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Input = styled.input<{ $error?: boolean }>`
  padding: 9px 12px;
  border: 1px solid ${({ $error, theme }) =>
    $error ? (theme.colors.error || '#dc2626') : theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.surface};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[400]};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary[100]};
  }
  &:read-only {
    background: ${({ theme }) => theme.colors.neutral[50]};
    color: ${({ theme }) => theme.colors.textSecondary};
    cursor: not-allowed;
  }
`;

const Select = styled.select<{ $error?: boolean }>`
  padding: 9px 12px;
  border: 1px solid ${({ $error, theme }) =>
    $error ? (theme.colors.error || '#dc2626') : theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.surface};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[400]};
  }
`;

const Textarea = styled.textarea`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.surface};
  resize: vertical;
  min-height: 80px;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[400]};
  }
`;

const ErrorMsg = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.error || '#dc2626'};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const Th = styled.th`
  padding: 10px 8px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 8px;
  vertical-align: middle;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
`;

const SmallInput = styled.input`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  font-size: 13px;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[400]};
  }
`;

const IconButton = styled.button`
  padding: 6px;
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover {
    background: ${({ theme }) => theme.colors.errorBg || '#fef2f2'};
    color: ${({ theme }) => theme.colors.error || '#dc2626'};
    border-color: ${({ theme }) => theme.colors.error || '#dc2626'};
  }
`;

const AddLineButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: none;
  border: 1px dashed ${({ theme }) => theme.colors.primary[400]};
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.primary[500]};
  font-size: 13px;
  cursor: pointer;
  margin-top: 12px;
  &:hover { background: ${({ theme }) => theme.colors.primary[50]}; }
`;

const TotalsCard = styled.div`
  background: ${({ theme }) => theme.colors.neutral[50]};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 10px;
  padding: 16px 20px;
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
`;

const TotalsRow = styled.div`
  display: flex;
  gap: 24px;
  font-size: 14px;
`;

const TotalsLabel = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
  min-width: 100px;
  text-align: right;
`;

const TotalsValue = styled.span`
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  min-width: 100px;
  text-align: right;
`;

const TotalsGross = styled(TotalsRow)`
  font-size: 16px;
  font-weight: 700;
  border-top: 2px solid ${({ theme }) => theme.colors.neutral[200]};
  padding-top: 8px;
  margin-top: 4px;
`;

const FormActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
`;

const PrimaryButton = styled.button`
  padding: 11px 24px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.primary[700]}; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  padding: 11px 24px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
`;

const ErrorBanner = styled.div`
  background: ${({ theme }) => theme.colors.errorBg || '#fef2f2'};
  color: ${({ theme }) => theme.colors.error || '#dc2626'};
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 14px;
`;

const LoadingState = styled.div`
  padding: 64px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const InfoBanner = styled.div`
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 13px;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function calcLineTotals(line: {
  creditedQty: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
}) {
  const qty = line.creditedQty || 0;
  const price = line.unitPrice || 0;
  const disc = line.discountPercent || 0;
  const tax = line.taxPercent || 0;
  const lineNet = qty * price * (1 - disc / 100);
  const lineTax = lineNet * (tax / 100);
  const lineGross = lineNet + lineTax;
  return { lineNet, lineTax, lineGross };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ArCreditNoteFormPage() {
  const navigate = useNavigate();
  const { rtnDocEntry, ariDocEntry, docId } = useParams<{
    rtnDocEntry?: string;
    ariDocEntry?: string;
    docId?: string;
  }>();
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? '';

  // Determine form mode
  const isEditMode = Boolean(docId && docId !== 'new');
  const isFromRTN = Boolean(rtnDocEntry);
  const isFromInvoice = Boolean(ariDocEntry);

  // ── Source data fetches ──────────────────────────────────────────────────────

  const { data: existingArc, isLoading: arcLoading } = useArCreditNote(
    isEditMode ? docId : undefined,
    orgId,
  );

  const { data: sourceRTN, isLoading: rtnLoading } = useReturn(
    isFromRTN ? rtnDocEntry : undefined,
    orgId,
  );

  const { data: sourceARI, isLoading: ariLoading } = useArInvoice(
    isFromInvoice ? ariDocEntry : undefined,
    orgId,
  );

  // ── Mutations ────────────────────────────────────────────────────────────────

  const createFromRTN = useCreateArCreditNoteFromRTN();
  const createFromInvoice = useCreateArCreditNoteFromInvoice();
  const createBlank = useCreateArCreditNote();
  const updateMutation = useUpdateArCreditNote();

  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Form setup ───────────────────────────────────────────────────────────────

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyCode: '',
      currency: 'AED',
      exchangeRate: 1,
      creditReason: 'other',
      docDate: today(),
      dateOfSupply: today(),
      invoiceDate: today(),
      lines: [],
      allocations: [],
    },
  });

  const { fields: lineFields, append: appendLine, remove: removeLine } = useFieldArray({
    control,
    name: 'lines',
  });

  const { fields: allocFields, append: appendAlloc, remove: removeAlloc } = useFieldArray({
    control,
    name: 'allocations',
  });

  const watchedLines = useWatch({ control, name: 'lines' });

  // ── Live totals calculation ──────────────────────────────────────────────────

  const totals = useMemo(() => {
    if (!watchedLines) return { net: 0, tax: 0, gross: 0 };
    return watchedLines.reduce(
      (acc, line) => {
        const { lineNet, lineTax, lineGross } = calcLineTotals(line as {
          creditedQty: number;
          unitPrice: number;
          discountPercent: number;
          taxPercent: number;
        });
        return {
          net: acc.net + lineNet,
          tax: acc.tax + lineTax,
          gross: acc.gross + lineGross,
        };
      },
      { net: 0, tax: 0, gross: 0 },
    );
  }, [watchedLines]);

  // ── Pre-fill on source data load ─────────────────────────────────────────────

  // Pre-fill from RTN
  useEffect(() => {
    if (!isFromRTN || !sourceRTN) return;

    const rtnLines = (sourceRTN.lines ?? []).map((line) => ({
      itemId: line.itemId,
      itemCode: line.itemCode,
      itemName: line.itemName,
      description: line.description ?? '',
      creditedQty: line.returnedQty,
      uom: line.uom,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      taxPercent: line.taxPercent,
      taxCodeId: line.taxCodeId ?? null,
      revenueAccountId: line.revenueAccountId ?? '',
      warehouseId: line.warehouseId ?? null,
      costCenterId: line.costCenterId ?? null,
      baseDocRefDocType: 'RETURN',
      baseDocRefDocId: sourceRTN.docEntry,
      baseDocRefDocNumber: sourceRTN.docNumber,
      baseDocRefLineId: line.lineId,
    }));

    // Build allocation from the RTN's baseDocRef (the source ARI)
    const sourceAriRef = sourceRTN.baseDocRef;
    const allocations = sourceAriRef
      ? [{
        arInvoiceDocEntry: sourceAriRef.docId,
        arInvoiceDocNumber: sourceAriRef.docNumber,
        amountApplied: 0, // user fills in gross after totals calc
      }]
      : [];

    reset({
      companyCode: '',
      customerId: sourceRTN.customerId,
      customerName: sourceRTN.customerName,
      currency: sourceRTN.currency ?? 'AED',
      exchangeRate: sourceRTN.exchangeRate ?? 1,
      docDate: today(),
      dateOfSupply: sourceRTN.docDate,
      invoiceDate: sourceRTN.docDate,
      creditReason: 'return',
      creditReasonText: `Credit note for Return Note ${sourceRTN.docNumber}`,
      notes: sourceRTN.notes ?? '',
      // RTN baseDocRef becomes baseReturnDocRef on the ARC
      baseReturnDocRefDocType: 'RETURN',
      baseReturnDocRefDocId: sourceRTN.docEntry,
      baseReturnDocRefDocNumber: sourceRTN.docNumber,
      lines: rtnLines,
      allocations,
    });
  }, [isFromRTN, sourceRTN, reset]);

  // Pre-fill from ARI (direct credit)
  useEffect(() => {
    if (!isFromInvoice || !sourceARI) return;

    const ariLines = (sourceARI.lines ?? []).map((line) => ({
      itemId: line.itemId,
      itemCode: line.itemCode,
      itemName: line.itemName,
      description: line.description ?? '',
      creditedQty: line.invoicedQty - (line.creditedQty ?? 0) - (line.cancelledQty ?? 0),
      uom: line.uom,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      taxPercent: line.taxPercent,
      taxCodeId: line.taxCodeId ?? null,
      revenueAccountId: line.revenueAccountId ?? '',
      warehouseId: line.warehouseId ?? null,
      costCenterId: line.costCenterId ?? null,
      baseDocRefDocType: 'AR_INVOICE',
      baseDocRefDocId: sourceARI.docEntry,
      baseDocRefDocNumber: sourceARI.docNumber,
      baseDocRefLineId: line.lineId,
    }));

    // Auto-populate allocation to the source ARI with its gross total
    const allocations = [{
      arInvoiceDocEntry: sourceARI.docEntry,
      arInvoiceDocNumber: sourceARI.docNumber,
      amountApplied: sourceARI.totals.gross,
    }];

    reset({
      companyCode: '',
      customerId: sourceARI.customerId,
      customerName: sourceARI.customerName,
      currency: sourceARI.currency,
      exchangeRate: sourceARI.exchangeRate,
      docDate: today(),
      dateOfSupply: sourceARI.dateOfSupply,
      invoiceDate: sourceARI.invoiceDate,
      creditReason: 'price_adjustment',
      notes: '',
      baseReturnDocRefDocType: null,
      baseReturnDocRefDocId: null,
      baseReturnDocRefDocNumber: null,
      lines: ariLines,
      allocations,
    });
  }, [isFromInvoice, sourceARI, reset]);

  // Pre-fill from existing DRAFT ARC (edit mode)
  useEffect(() => {
    if (!isEditMode || !existingArc) return;

    reset({
      companyCode: existingArc.companyCode,
      customerId: existingArc.customerId,
      customerName: existingArc.customerName,
      bpRefNo: existingArc.bpRefNo ?? '',
      docDate: existingArc.docDate,
      dateOfSupply: existingArc.dateOfSupply,
      invoiceDate: existingArc.invoiceDate,
      currency: existingArc.currency,
      exchangeRate: existingArc.exchangeRate,
      creditReason: existingArc.creditReason as CreditReason,
      creditReasonText: existingArc.creditReasonText ?? '',
      notes: existingArc.notes ?? '',
      journalMemo: existingArc.journalMemo ?? '',
      baseReturnDocRefDocType: existingArc.baseReturnDocRef?.docType ?? null,
      baseReturnDocRefDocId: existingArc.baseReturnDocRef?.docId ?? null,
      baseReturnDocRefDocNumber: existingArc.baseReturnDocRef?.docNumber ?? null,
      lines: existingArc.lines.map(l => ({
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        description: l.description ?? '',
        creditedQty: l.creditedQty,
        uom: l.uom,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        taxPercent: l.taxPercent,
        taxCodeId: l.taxCodeId ?? null,
        revenueAccountId: l.revenueAccountId,
        warehouseId: l.warehouseId ?? null,
        costCenterId: l.costCenterId ?? null,
        baseDocRefDocType: l.baseDocRef?.docType ?? '',
        baseDocRefDocId: l.baseDocRef?.docId ?? '',
        baseDocRefDocNumber: l.baseDocRef?.docNumber ?? '',
        baseDocRefLineId: l.baseDocRef?.lineId ?? null,
      })),
      allocations: existingArc.allocations.map(a => ({
        arInvoiceDocEntry: a.arInvoiceDocEntry,
        arInvoiceDocNumber: a.arInvoiceDocNumber,
        amountApplied: a.amountApplied,
      })),
    });
  }, [isEditMode, existingArc, reset]);

  // ── Submit handler ───────────────────────────────────────────────────────────

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null);

    const payload = {
      companyCode: values.companyCode,
      customerId: values.customerId,
      customerName: values.customerName,
      bpRefNo: values.bpRefNo || null,
      docDate: values.docDate,
      dateOfSupply: values.dateOfSupply,
      invoiceDate: values.invoiceDate,
      currency: values.currency,
      exchangeRate: values.exchangeRate,
      paymentTermsId: values.paymentTermsId || null,
      creditReason: values.creditReason,
      creditReasonText: values.creditReasonText || null,
      notes: values.notes || null,
      journalMemo: values.journalMemo || null,
      baseReturnDocRef:
        values.baseReturnDocRefDocType && values.baseReturnDocRefDocId
          ? {
              docType: values.baseReturnDocRefDocType,
              docId: values.baseReturnDocRefDocId,
              docNumber: values.baseReturnDocRefDocNumber ?? '',
            }
          : null,
      allocations: values.allocations.map(a => ({
        arInvoiceDocEntry: a.arInvoiceDocEntry,
        arInvoiceDocNumber: a.arInvoiceDocNumber,
        amountApplied: a.amountApplied,
      })),
      lines: values.lines.map(l => ({
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        description: l.description || null,
        creditedQty: l.creditedQty,
        uom: l.uom,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent ?? 0,
        taxCodeId: l.taxCodeId || null,
        taxPercent: l.taxPercent ?? 0,
        revenueAccountId: l.revenueAccountId,
        warehouseId: l.warehouseId || null,
        costCenterId: l.costCenterId || null,
        baseDocRef: {
          docType: l.baseDocRefDocType,
          docId: l.baseDocRefDocId,
          docNumber: l.baseDocRefDocNumber,
          lineId: l.baseDocRefLineId || null,
        },
      })),
    };

    try {
      let result;

      if (isEditMode && existingArc) {
        result = await updateMutation.mutateAsync({
          docId: existingArc.docEntry,
          data: {
            bpRefNo: payload.bpRefNo,
            docDate: payload.docDate,
            dateOfSupply: payload.dateOfSupply,
            invoiceDate: payload.invoiceDate,
            currency: payload.currency,
            exchangeRate: payload.exchangeRate,
            creditReason: payload.creditReason,
            creditReasonText: payload.creditReasonText,
            notes: payload.notes,
            journalMemo: payload.journalMemo,
            lines: payload.lines,
            allocations: payload.allocations,
          },
          orgId,
        });
      } else if (isFromRTN) {
        result = await createFromRTN.mutateAsync({ data: payload, orgId });
      } else if (isFromInvoice) {
        result = await createFromInvoice.mutateAsync({ data: payload, orgId });
      } else {
        result = await createBlank.mutateAsync({ data: payload, orgId });
      }

      navigate(`/sales/ar-credit-notes/${result.docEntry}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save AR Credit Note.';
      setSubmitError(msg);
    }
  };

  // ── Loading states ───────────────────────────────────────────────────────────

  const sourceLoading = (isFromRTN && rtnLoading) || (isFromInvoice && ariLoading) || (isEditMode && arcLoading);

  if (sourceLoading) {
    return (
      <Container>
        <LoadingState role="status">Loading…</LoadingState>
      </Container>
    );
  }

  const customerLocked = isFromRTN || isFromInvoice;
  const pageTitle = isEditMode
    ? `Edit AR Credit Note ${existingArc?.docNumber ?? ''}`
    : isFromRTN
    ? `New AR Credit Note — from Return ${sourceRTN?.docNumber ?? rtnDocEntry}`
    : isFromInvoice
    ? `New AR Credit Note — from Invoice ${sourceARI?.docNumber ?? ariDocEntry}`
    : 'New AR Credit Note';

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/ar-credit-notes')}>
        ← Back to AR Credit Notes
      </BackLink>
      <PageTitle>{pageTitle}</PageTitle>

      {isFromRTN && sourceRTN && (
        <InfoBanner>
          Financial completion of physical return. Customer and lines are pre-filled
          from Return Note <strong>{sourceRTN.docNumber}</strong>. Verify quantities and
          update the allocation amount to match the credit note gross total.
        </InfoBanner>
      )}

      {isFromInvoice && sourceARI && (
        <InfoBanner>
          Direct credit against AR Invoice <strong>{sourceARI.docNumber}</strong>.
          Customer is locked. Adjust lines and quantities to credit. The allocation
          row is pre-filled with the invoice gross — update if partially crediting.
        </InfoBanner>
      )}

      {submitError && <ErrorBanner role="alert">{submitError}</ErrorBanner>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* ── Header Card ── */}
        <Card>
          <CardTitle>Header</CardTitle>
          <FormGrid $cols={3}>
            <FieldGroup>
              <Label htmlFor="customerName">Customer *</Label>
              <Input
                id="customerName"
                {...register('customerName')}
                readOnly={customerLocked}
                $error={Boolean(errors.customerName)}
                placeholder="Customer name"
              />
              {errors.customerName && <ErrorMsg>{errors.customerName.message}</ErrorMsg>}
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="bpRefNo">BP Ref No</Label>
              <Input
                id="bpRefNo"
                {...register('bpRefNo')}
                placeholder="Customer's own reference"
              />
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="creditReason">Credit Reason *</Label>
              <Select id="creditReason" {...register('creditReason')} $error={Boolean(errors.creditReason)}>
                <option value="return">Return</option>
                <option value="price_adjustment">Price Adjustment</option>
                <option value="discount">Discount</option>
                <option value="goodwill">Goodwill</option>
                <option value="cancellation">Cancellation</option>
                <option value="other">Other</option>
              </Select>
              {errors.creditReason && <ErrorMsg>{errors.creditReason.message}</ErrorMsg>}
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="docDate">Doc Date *</Label>
              <Input
                id="docDate"
                type="date"
                {...register('docDate')}
                $error={Boolean(errors.docDate)}
              />
              {errors.docDate && <ErrorMsg>{errors.docDate.message}</ErrorMsg>}
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="dateOfSupply">Date of Supply *</Label>
              <Input
                id="dateOfSupply"
                type="date"
                {...register('dateOfSupply')}
                $error={Boolean(errors.dateOfSupply)}
              />
              {errors.dateOfSupply && <ErrorMsg>{errors.dateOfSupply.message}</ErrorMsg>}
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="invoiceDate">Invoice Date *</Label>
              <Input
                id="invoiceDate"
                type="date"
                {...register('invoiceDate')}
                $error={Boolean(errors.invoiceDate)}
              />
              {errors.invoiceDate && <ErrorMsg>{errors.invoiceDate.message}</ErrorMsg>}
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                {...register('currency')}
                placeholder="AED"
                readOnly={customerLocked}
              />
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="exchangeRate">Exchange Rate</Label>
              <Input
                id="exchangeRate"
                type="number"
                step="0.0001"
                min="0"
                {...register('exchangeRate')}
              />
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="creditReasonText">Reason Details</Label>
              <Input
                id="creditReasonText"
                {...register('creditReasonText')}
                placeholder="Free-text expansion of reason"
              />
            </FieldGroup>

            <FieldGroup style={{ gridColumn: '1 / -1' }}>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" {...register('notes')} placeholder="Optional notes" />
            </FieldGroup>
          </FormGrid>
        </Card>

        {/* ── Lines Card ── */}
        <Card>
          <CardTitle>Credit Note Lines</CardTitle>

          {errors.lines && typeof errors.lines === 'object' && 'message' in errors.lines && (
            <ErrorMsg style={{ display: 'block', marginBottom: 12 }}>
              {(errors.lines as { message?: string }).message}
            </ErrorMsg>
          )}

          <div style={{ overflowX: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Item Code</Th>
                  <Th>Description</Th>
                  <Th>Qty</Th>
                  <Th>UOM</Th>
                  <Th>Unit Price</Th>
                  <Th>Disc %</Th>
                  <Th>Tax %</Th>
                  <Th>Revenue Account</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody>
                {lineFields.map((field, idx) => {
                  // Compute per-line totals for display (used indirectly via TotalsCard)
                  void calcLineTotals({
                    creditedQty: Number(watchedLines?.[idx]?.creditedQty) || 0,
                    unitPrice: Number(watchedLines?.[idx]?.unitPrice) || 0,
                    discountPercent: Number(watchedLines?.[idx]?.discountPercent) || 0,
                    taxPercent: Number(watchedLines?.[idx]?.taxPercent) || 0,
                  });

                  return (
                    <tr key={field.id}>
                      <Td style={{ color: '#9ca3af', fontSize: 12 }}>{idx + 1}</Td>
                      <Td>
                        <SmallInput
                          {...register(`lines.${idx}.itemCode`)}
                          placeholder="Item code"
                          readOnly={customerLocked}
                        />
                      </Td>
                      <Td>
                        <SmallInput
                          {...register(`lines.${idx}.description`)}
                          placeholder="Description"
                        />
                      </Td>
                      <Td style={{ width: 80 }}>
                        <SmallInput
                          type="number"
                          step="0.01"
                          min="0.01"
                          {...register(`lines.${idx}.creditedQty`)}
                        />
                      </Td>
                      <Td style={{ width: 70 }}>
                        <SmallInput {...register(`lines.${idx}.uom`)} placeholder="PCS" readOnly={customerLocked} />
                      </Td>
                      <Td style={{ width: 100 }}>
                        <SmallInput type="number" step="0.01" min="0" {...register(`lines.${idx}.unitPrice`)} />
                      </Td>
                      <Td style={{ width: 70 }}>
                        <SmallInput type="number" step="0.01" min="0" max="100" {...register(`lines.${idx}.discountPercent`)} />
                      </Td>
                      <Td style={{ width: 70 }}>
                        <SmallInput type="number" step="0.01" min="0" max="100" {...register(`lines.${idx}.taxPercent`)} />
                      </Td>
                      <Td>
                        <SmallInput {...register(`lines.${idx}.revenueAccountId`)} placeholder="Revenue acct ID" />
                      </Td>
                      <Td>
                        <IconButton
                          type="button"
                          onClick={() => removeLine(idx)}
                          aria-label={`Remove line ${idx + 1}`}
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          {!customerLocked && (
            <AddLineButton
              type="button"
              onClick={() =>
                appendLine({
                  itemId: '',
                  itemCode: '',
                  itemName: '',
                  description: '',
                  creditedQty: 1,
                  uom: 'PCS',
                  unitPrice: 0,
                  discountPercent: 0,
                  taxPercent: 5,
                  taxCodeId: null,
                  revenueAccountId: '',
                  warehouseId: null,
                  costCenterId: null,
                  baseDocRefDocType: '',
                  baseDocRefDocId: '',
                  baseDocRefDocNumber: '',
                  baseDocRefLineId: null,
                })
              }
            >
              <Plus size={14} /> Add Line
            </AddLineButton>
          )}

          {/* Live totals */}
          <TotalsCard>
            <TotalsRow>
              <TotalsLabel>Net Total</TotalsLabel>
              <TotalsValue>
                {totals.net.toFixed(2)} {watchedLines?.[0] ? 'AED' : ''}
              </TotalsValue>
            </TotalsRow>
            <TotalsRow>
              <TotalsLabel>VAT / Tax</TotalsLabel>
              <TotalsValue>
                {totals.tax.toFixed(2)} {watchedLines?.[0] ? 'AED' : ''}
              </TotalsValue>
            </TotalsRow>
            <TotalsGross>
              <TotalsLabel>Gross Total</TotalsLabel>
              <TotalsValue>
                {totals.gross.toFixed(2)} {watchedLines?.[0] ? 'AED' : ''}
              </TotalsValue>
            </TotalsGross>
          </TotalsCard>
        </Card>

        {/* ── Allocations Card ── */}
        <Card>
          <CardTitle>Invoice Allocations</CardTitle>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 0, marginBottom: 16 }}>
            The sum of all allocation amounts must equal the credit note gross total ({totals.gross.toFixed(2)}).
          </p>

          {errors.allocations && typeof errors.allocations === 'object' && 'message' in errors.allocations && (
            <ErrorMsg style={{ display: 'block', marginBottom: 12 }}>
              {(errors.allocations as { message?: string }).message}
            </ErrorMsg>
          )}

          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>AR Invoice Doc Entry</Th>
                <Th>AR Invoice Number</Th>
                <Th>Amount Applied</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {allocFields.map((field, idx) => (
                <tr key={field.id}>
                  <Td style={{ color: '#9ca3af', fontSize: 12 }}>{idx + 1}</Td>
                  <Td>
                    <SmallInput
                      {...register(`allocations.${idx}.arInvoiceDocEntry`)}
                      placeholder="AR Invoice UUID"
                    />
                  </Td>
                  <Td>
                    <SmallInput
                      {...register(`allocations.${idx}.arInvoiceDocNumber`)}
                      placeholder="ARI-2026-XXXX"
                    />
                  </Td>
                  <Td style={{ width: 140 }}>
                    <SmallInput
                      type="number"
                      step="0.01"
                      min="0.01"
                      {...register(`allocations.${idx}.amountApplied`)}
                    />
                  </Td>
                  <Td>
                    <IconButton
                      type="button"
                      onClick={() => removeAlloc(idx)}
                      aria-label={`Remove allocation ${idx + 1}`}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <AddLineButton
            type="button"
            onClick={() =>
              appendAlloc({
                arInvoiceDocEntry: '',
                arInvoiceDocNumber: '',
                amountApplied: 0,
              })
            }
          >
            <Plus size={14} /> Add Allocation
          </AddLineButton>
        </Card>

        {/* ── Form actions ── */}
        <FormActions>
          <SecondaryButton type="button" onClick={() => navigate('/sales/ar-credit-notes')}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving…'
              : isEditMode
              ? 'Update Credit Note'
              : 'Create Credit Note (Draft)'}
          </PrimaryButton>
        </FormActions>
      </form>
    </Container>
  );
}

export default ArCreditNoteFormPage;
