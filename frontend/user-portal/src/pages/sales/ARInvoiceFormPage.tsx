/**
 * ARInvoiceFormPage — Wave 3 (T-200.0 / T-201.10)
 *
 * Shared form page for creating, editing, and "copy-from-source-doc" AR Invoices.
 *
 * Four modes (determined by URL params):
 *   new              — no params → direct create (service items only)
 *   from-delivery    — has deliveryDocId URL param → copy-from-delivery create
 *   from-so          — has soDocEntry URL param → copy service lines from SO (T-201.10)
 *   edit             — has docId param (from /ar-invoices/:docId/edit) → update
 *
 * Submit creates the doc in DRAFT status. Status transition (DRAFT → OPEN)
 * is a separate action on the detail page action bar.
 *
 * Reuses:
 *   - CustomerCombobox (typeahead customer selector)
 *   - useTaxCodes (tax code dropdown)
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 * Route: /sales/ar-invoices/new
 *      | /sales/ar-invoices/from-delivery/:deliveryDocId
 *      | /sales/ar-invoices/from-so/:soDocEntry
 *      | /sales/ar-invoices/:docId/edit
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import styled from 'styled-components';
import axios from 'axios';
import { Trash2, Plus } from 'lucide-react';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import { useArInvoice, useCreateArInvoice, useUpdateArInvoice, useCreateArInvoiceFromDelivery, useCreateARInvoiceFromSO } from '../../hooks/queries/useArInvoices';
import { useDelivery } from '../../hooks/queries/useDeliveries';
import { useSalesOrderV2 } from '../../hooks/queries/useSalesOrders';
import { CustomerCombobox } from '../../components/sales/CustomerCombobox';
import { SalesItemCombobox } from '../../components/sales/SalesItemCombobox';
import { CurrencyCombobox } from '../../components/sales/CurrencyCombobox';
import { CompanyCombobox, shouldShowCompanyField } from '../../components/sales/CompanyCombobox';
import type { SalesItemSelection } from '../../components/sales/SalesItemCombobox';
import { useTenantBaseCurrency } from '../../hooks/queries/useTenantBaseCurrency';
import { useTaxCodes } from '../../hooks/queries/useTaxCodes';
import { FALLBACK_TAX_CODES } from '../../services/taxCodesService';
import { useCompanies } from '../../hooks/queries/useCompanies';
import type { Customer } from '../../types/crm';
import type { ARInvoiceLineCreate } from '../../services/salesApi';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const lineSchema = z.object({
  // Set only in from-Delivery mode — the source Delivery line UUID required by the backend.
  deliveryLineId: z.string().nullable().optional(),
  // Set only in from-SO mode — the source SO line UUID required by the backend.
  soLineId: z.string().nullable().optional(),
  itemId: z.string().min(1, 'Item ID required'),
  itemCode: z.string().min(1, 'Item code required'),
  itemName: z.string().min(1, 'Item name required'),
  description: z.string().optional(),
  quantity: z.coerce.number().positive('Must be > 0'),
  uom: z.string().min(1, 'UoM required'),
  unitPrice: z.coerce.number().min(0, 'Must be ≥ 0'),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  taxCodeId: z.string().nullable().optional(),
  warehouseId: z.string().nullable().optional(),
  costCenterId: z.string().nullable().optional(),
});

const formSchema = z.object({
  companyCode: z.string().optional().default(''),
  customerId: z.string().min(1, 'Customer required'),
  customerName: z.string().min(1, 'Customer name required'),
  bpRefNo: z.string().nullable().optional(),
  docDate: z.string().min(1, 'Doc date required'),
  dateOfSupply: z.string().min(1, 'Date of supply required'),
  invoiceDate: z.string().min(1, 'Invoice date required'),
  paymentTermsId: z.string().nullable().optional(),
  currency: z.string().default('AED'),
  exchangeRate: z.coerce.number().positive().default(1),
  journalMemo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1, 'At least one line required'),
});

type FormData = z.infer<typeof formSchema>;

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1280px;
  margin: 0 auto;
`;

const BackLink = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 20px;
  &:hover { text-decoration: underline; color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 32px 0;
`;

const Card = styled.div`
  ${glassPanel}
  padding: 24px;
  margin-bottom: 24px;
`;

const CardTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 20px 0;
`;

const Grid = styled.div<{ $cols?: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols ?? 3}, 1fr);
  gap: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const FieldGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;

const Input = styled.input<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 10px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.bright.coral : theme.colors.glass.border)};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;


const Textarea = styled.textarea`
  ${glassControl}
  padding: 10px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  min-height: 80px;
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.bright.coral};
`;

const LinesTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const LTh = styled.th`
  ${monoLabel}
  padding: 10px 12px;
  text-align: left;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const LThRight = styled(LTh)`
  text-align: right;
`;

const LTd = styled.td`
  padding: 8px 10px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const LTdRight = styled(LTd)`
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
`;

const LineInput = styled.input`
  ${glassControl}
  width: 100%;
  padding: 6px 8px;
  font-size: 13px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
  &:disabled,
  &[readonly] {
    color: ${({ theme }) => theme.colors.muted};
    cursor: not-allowed;
  }
`;

const LineSelect = styled.select`
  ${glassControl}
  width: 100%;
  padding: 6px 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
  option {
    background: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

// Destructive — coral-b tinted glass, never solid red (spec §4).
const IconButton = styled.button`
  background: rgba(240, 138, 112, 0.16);
  border: 1px solid rgba(240, 138, 112, 0.45);
  cursor: pointer;
  padding: 4px;
  color: ${({ theme }) => theme.colors.bright.coral};
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: background 150ms ease;
  &:hover {
    background: rgba(240, 138, 112, 0.26);
  }
`;

// Ghost/ancillary button — transparent, celeste text/border (spec §4).
const AddLineButton = styled.button`
  margin-top: 12px;
  padding: 8px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 150ms ease;
  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

// Nested one level inside a glassPanel Card — stays a plain `line` border
// with no fill rather than a second glass layer (spec §2 two-layer limit).
const TotalsCard = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 8px;
  padding: 16px 20px;
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
`;

const TotalsRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 48px;
  font-size: 14px;
`;

const TotalsLabel = styled.span`
  color: ${({ theme }) => theme.colors.celeste};
`;

const TotalsValue = styled.span`
  font-variant-numeric: tabular-nums;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TotalsGross = styled(TotalsRow)`
  font-size: 16px;
  font-weight: 700;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  padding-top: 8px;
  margin-top: 4px;
`;

const ActionBar = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 32px;
`;

// Primary CTA — the ONE gold budget item on this page (spec §3/§4).
const PrimaryButton = styled.button`
  padding: 10px 24px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const SecondaryButton = styled.button`
  ${glassControl}
  padding: 10px 24px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.glass.hi}; }
`;

const ErrorBanner = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  color: ${({ theme }) => theme.colors.bright.coral};
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 14px;
`;

const InfoBanner = styled.div`
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.bright.lapis};
  border: 1px solid rgba(107, 138, 224, 0.45);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 14px;
`;

/**
 * T-201.8 - contextual help note shown in the Lines section of direct-create mode.
 * Reuses the InfoBanner palette but is inlined within the Card (no bottom margin).
 */
const DirectCreateNote = styled.div`
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.bright.lapis};
  border: 1px solid rgba(107, 138, 224, 0.45);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 13px;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function calcLineNet(qty: number, price: number, discount: number): number {
  const net = qty * price * (1 - discount / 100);
  return Math.round(net * 100) / 100;
}

function calcLineTax(lineNet: number, taxRate: number): number {
  return Math.round(lineNet * taxRate) / 100;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const EMPTY_LINE = {
  deliveryLineId: null as string | null,
  soLineId: null as string | null,
  itemId: '',
  itemCode: '',
  itemName: '',
  description: '',
  quantity: 1,
  uom: 'EA',
  unitPrice: 0,
  discountPercent: 0,
  taxCodeId: null as string | null,
  warehouseId: null as string | null,
  costCenterId: null as string | null,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ARInvoiceFormPage() {
  const navigate = useNavigate();
  const { docId, deliveryDocId, soDocEntry } = useParams<{
    docId?: string;
    deliveryDocId?: string;
    soDocEntry?: string;
  }>();
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? '';

  // Determine form mode — exactly one of these is true at a time.
  const isEdit = Boolean(docId);
  const isFromDelivery = Boolean(deliveryDocId) && !docId && !soDocEntry;
  // T-201.10: from-SO mode — invoicing service lines directly from the SO.
  const isFromSo = Boolean(soDocEntry) && !docId && !deliveryDocId;
  // T-201.8: direct-create = no URL param. Only this mode restricts the item
  // picker to service/fee items (isStock=false).
  const isDirectCreate = !deliveryDocId && !docId && !soDocEntry;

  const pageTitle = isEdit
    ? 'Edit AR Invoice'
    : isFromDelivery
    ? 'New AR Invoice from Delivery'
    : isFromSo
    ? 'New AR Invoice from Sales Order'
    : 'New AR Invoice';

  // Fetch existing invoice for edit mode
  const { data: existingInvoice, isLoading: loadingInvoice } = useArInvoice(
    isEdit ? docId : undefined,
    isEdit ? orgId : undefined,
  );

  // Fetch source Delivery for from-Delivery mode (header + lines).
  const { data: sourceDelivery, isLoading: loadingDelivery } = useDelivery(
    isFromDelivery ? deliveryDocId : undefined,
    isFromDelivery ? orgId : undefined,
  );

  // Fetch source SO (via Delivery.baseDocRef) so we can inherit pricing —
  // Delivery lines themselves carry quantity + warehouse + cost only, not unitPrice/tax.
  const sourceSoDocId =
    isFromDelivery && sourceDelivery?.baseDocRef?.docType === 'SO'
      ? sourceDelivery.baseDocRef.docId
      : undefined;
  const { data: sourceSo, isLoading: loadingSourceSo } = useSalesOrderV2(
    sourceSoDocId,
    sourceSoDocId ? orgId : undefined,
  );

  // T-201.10: Fetch source SO for from-SO mode directly (soDocEntry IS the docEntry).
  const { data: fromSoSourceSo, isLoading: loadingFromSoSo } = useSalesOrderV2(
    isFromSo ? soDocEntry : undefined,
    isFromSo ? orgId : undefined,
  );

  // Mutations
  const createMutation = useCreateArInvoice();
  const updateMutation = useUpdateArInvoice();
  const fromDeliveryMutation = useCreateArInvoiceFromDelivery();
  const fromSoMutation = useCreateARInvoiceFromSO();

  const [submitError, setSubmitError] = useState<string | null>(null);

  // Tax codes
  const { data: fetchedTaxCodes } = useTaxCodes(orgId);
  const taxCodes = fetchedTaxCodes ?? FALLBACK_TAX_CODES;

  // Companies — for CompanyCombobox
  const { data: companies = [], isLoading: companiesLoading } = useCompanies(orgId);
  const showCompanyField = shouldShowCompanyField(companies, companiesLoading);

  // React Hook Form setup
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyCode: '',
      customerId: '',
      customerName: '',
      bpRefNo: '',
      docDate: today(),
      dateOfSupply: today(),
      invoiceDate: today(),
      paymentTermsId: null,
      currency: 'AED',
      exchangeRate: 1,
      journalMemo: '',
      notes: '',
      lines: [{ ...EMPTY_LINE }],
    },
  });

  // Pre-fill form in edit mode once data is loaded
  useEffect(() => {
    if (isEdit && existingInvoice) {
      reset({
        companyCode: existingInvoice.companyCode,
        customerId: existingInvoice.customerId,
        customerName: existingInvoice.customerName,
        bpRefNo: existingInvoice.bpRefNo ?? '',
        docDate: existingInvoice.docDate,
        dateOfSupply: existingInvoice.dateOfSupply,
        invoiceDate: existingInvoice.invoiceDate,
        paymentTermsId: existingInvoice.paymentTermsId ?? null,
        currency: existingInvoice.currency,
        exchangeRate: existingInvoice.exchangeRate,
        journalMemo: existingInvoice.journalMemo ?? '',
        notes: existingInvoice.notes ?? '',
        lines: existingInvoice.lines.map((l) => ({
          deliveryLineId: null,
          soLineId: null,
          itemId: l.itemId,
          itemCode: l.itemCode,
          itemName: l.itemName,
          description: l.description ?? '',
          quantity: Number(l.quantity),
          uom: l.uom,
          unitPrice: Number(l.unitPrice),
          discountPercent: Number(l.discountPercent),
          taxCodeId: l.taxCodeId ?? null,
          warehouseId: l.warehouseId ?? null,
          costCenterId: l.costCenterId ?? null,
        })),
      });
    }
  }, [isEdit, existingInvoice, reset]);

  // Pre-fill form in from-Delivery mode once the source Delivery (and its SO) load.
  // Customer, company, item data + qty come from the Delivery; pricing/tax come from the SO.
  useEffect(() => {
    if (!isFromDelivery || !sourceDelivery) return;
    // Wait for the SO too if we have a ref to chase — pricing depends on it.
    if (sourceSoDocId && !sourceSo) return;

    type SoLine = NonNullable<typeof sourceSo>['lines'][number];
    const soLineByItemId = new Map<string, SoLine>();
    if (sourceSo) {
      for (const sl of sourceSo.lines) {
        soLineByItemId.set(sl.itemId, sl);
      }
    }

    reset({
      companyCode: sourceDelivery.companyCode,
      customerId: sourceDelivery.customerId,
      customerName: sourceDelivery.customerName,
      bpRefNo: sourceSo?.bpRefNo ?? '',
      docDate: today(),
      dateOfSupply: sourceDelivery.actualDeliveryDate,
      invoiceDate: today(),
      paymentTermsId: sourceSo?.paymentTermsId ?? null,
      currency: sourceSo?.currency ?? 'AED',
      exchangeRate: sourceSo?.exchangeRate ?? 1,
      journalMemo: '',
      notes: '',
      lines: sourceDelivery.lines
        .map((dl) => {
          // open_invoice_qty = delivered − invoiced − credited − cancelled
          // Default to what's *left* to invoice, not the full delivered amount —
          // otherwise re-entering this form after a partial invoice would pre-fill
          // a qty the backend will reject.
          const openInvoiceQty = Math.max(
            0,
            Number(dl.quantity) -
              Number(dl.invoicedQty ?? 0) -
              Number((dl as { creditedQty?: number }).creditedQty ?? 0) -
              Number(dl.cancelledQty ?? 0),
          );
          // Prefer the SO line that this DN line points back to; fall back to itemId match.
          const soLineRef = dl.baseDocRef?.lineId ?? null;
          const soLine =
            (soLineRef && sourceSo?.lines.find((sl) => sl.lineId === soLineRef)) ||
            soLineByItemId.get(dl.itemId) ||
            null;
          return {
            deliveryLineId: dl.lineId,
            soLineId: null as string | null,
            itemId: dl.itemId,
            itemCode: dl.itemCode,
            itemName: dl.itemName,
            description: dl.description ?? '',
            quantity: openInvoiceQty,
            uom: dl.uom,
            unitPrice: soLine ? Number(soLine.unitPrice) : 0,
            discountPercent: soLine ? Number(soLine.discountPercent) : 0,
            taxCodeId: soLine?.taxCodeId ?? null,
            warehouseId: dl.warehouseId ?? null,
            costCenterId: dl.costCenterId ?? null,
            _openInvoiceQty: openInvoiceQty,
          };
        })
        // Skip lines with nothing left to invoice — they'd fail validation anyway.
        .filter((l) => l._openInvoiceQty > 0)
        .map(({ _openInvoiceQty: _drop, ...rest }) => {
          void _drop;
          return rest;
        }),
    });
  }, [isFromDelivery, sourceDelivery, sourceSo, sourceSoDocId, reset]);

  // T-201.10: Pre-fill form in from-SO mode once the source SO loads.
  // Only service lines (identified via SO line invoicedQty / open qty logic) are included.
  // The item ext's isStock flag is not projected onto SO lines, so we rely on the
  // backend to reject any stock lines at submit time (HTTP 422 with a clear message).
  // Client-side we pre-fill ALL lines with open invoice qty > 0 and show the note
  // explaining that stock lines are excluded.
  useEffect(() => {
    if (!isFromSo || !fromSoSourceSo) return;

    reset({
      companyCode: fromSoSourceSo.companyCode ?? '',
      customerId: fromSoSourceSo.customerId,
      customerName: fromSoSourceSo.customerName,
      bpRefNo: fromSoSourceSo.bpRefNo ?? '',
      docDate: today(),
      dateOfSupply: fromSoSourceSo.docDate,
      invoiceDate: today(),
      paymentTermsId: fromSoSourceSo.paymentTermsId ?? null,
      currency: fromSoSourceSo.currency ?? 'AED',
      exchangeRate: fromSoSourceSo.exchangeRate ?? 1,
      journalMemo: '',
      notes: '',
      lines: fromSoSourceSo.lines
        .map((sl) => {
          // open invoice qty = ordered − invoiced − cancelled
          // (SO lines track invoicedQty directly; no creditedQty on SO lines)
          const openInvoiceQty = Math.max(
            0,
            Number(sl.orderedQty) - Number(sl.invoicedQty ?? 0) - Number(sl.cancelledQty ?? 0),
          );
          return {
            soLineId: sl.lineId,
            deliveryLineId: null as string | null,
            itemId: sl.itemId,
            itemCode: sl.itemCode,
            itemName: sl.itemName,
            description: sl.description ?? '',
            quantity: openInvoiceQty,
            uom: sl.uom,
            unitPrice: Number(sl.unitPrice),
            discountPercent: Number(sl.discountPercent),
            taxCodeId: sl.taxCodeId ?? null,
            warehouseId: null as string | null,
            costCenterId: sl.costCenterId ?? null,
            _openQty: openInvoiceQty,
          };
        })
        // Only include lines with something left to invoice.
        .filter((l) => l._openQty > 0)
        .map(({ _openQty: _drop, ...rest }) => {
          void _drop;
          return rest;
        }),
    });
  }, [isFromSo, fromSoSourceSo, reset]);

  // Field array for invoice lines
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });

  // Exchange rate visibility
  const baseCurrency = useTenantBaseCurrency();
  const watchedCurrency = watch('currency');
  const showExchangeRate = watchedCurrency !== baseCurrency;

  // Reset exchangeRate to 1.0 when currency reverts to base.
  useEffect(() => {
    if (!showExchangeRate) {
      setValue('exchangeRate', 1);
    }
  }, [showExchangeRate, setValue]);

  // Watch lines for computed totals
  const watchedLines = watch('lines');

  const totals = useMemo(() => {
    let net = 0;
    let tax = 0;
    for (const line of watchedLines) {
      const qty = Number(line.quantity) || 0;
      const price = Number(line.unitPrice) || 0;
      const disc = Number(line.discountPercent) || 0;
      const lineNet = calcLineNet(qty, price, disc);
      const taxCode = taxCodes.find((tc) => tc.taxCode === line.taxCodeId);
      const taxRate = taxCode ? parseFloat(taxCode.rate) : 0;
      const lineTax = calcLineTax(lineNet, taxRate);
      net += lineNet;
      tax += lineTax;
    }
    return {
      net: Math.round(net * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      gross: Math.round((net + tax) * 100) / 100,
    };
  }, [watchedLines, taxCodes]);

  // Handle customer selection from CustomerCombobox
  const handleCustomerSelect = useCallback(
    (customer: Customer) => {
      setValue('customerId', customer.customerId, { shouldValidate: true });
      setValue('customerName', customer.name, { shouldValidate: true });
    },
    [setValue],
  );

  const handleCustomerClear = useCallback(() => {
    setValue('customerId', '', { shouldValidate: true });
    setValue('customerName', '', { shouldValidate: true });
  }, [setValue]);

  // Form submit
  const onSubmit = async (data: FormData) => {
    setSubmitError(null);
    try {
      const lines: ARInvoiceLineCreate[] = data.lines.map((l) => ({
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        description: l.description || undefined,
        quantity: l.quantity,
        uom: l.uom,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        taxCodeId: l.taxCodeId || null,
        warehouseId: l.warehouseId || null,
        costCenterId: l.costCenterId || null,
      }));

      if (isEdit && docId) {
        const result = await updateMutation.mutateAsync({
          docId,
          data: {
            bpRefNo: data.bpRefNo || null,
            docDate: data.docDate,
            dateOfSupply: data.dateOfSupply,
            invoiceDate: data.invoiceDate,
            paymentTermsId: data.paymentTermsId || null,
            currency: data.currency,
            exchangeRate: data.exchangeRate,
            journalMemo: data.journalMemo || null,
            notes: data.notes || null,
            lines,
          },
          orgId,
        });
        navigate(`/sales/ar-invoices/${result.docEntry}`);
      } else if (isFromDelivery && deliveryDocId) {
        // Each line carries the source Delivery line UUID (stamped during the
        // pre-fill effect). The backend inherits item/uom/warehouse from the
        // Delivery line and applies the prices/tax we send here.
        const fromDeliveryLines = data.lines.map((l) => {
          if (!l.deliveryLineId) {
            throw new Error(
              'Cannot submit a line without a source Delivery line reference. ' +
                'Reload the page or recreate the invoice from the Delivery.',
            );
          }
          return {
            deliveryLineId: l.deliveryLineId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountPercent: l.discountPercent,
            taxCodeId: l.taxCodeId || null,
            costCenterId: l.costCenterId || null,
          };
        });
        const result = await fromDeliveryMutation.mutateAsync({
          deliveryDocId,
          data: {
            companyCode: data.companyCode,
            bpRefNo: data.bpRefNo || null,
            docDate: data.docDate,
            invoiceDate: data.invoiceDate,
            dateOfSupply: data.dateOfSupply || null,
            paymentTermsId: data.paymentTermsId || null,
            currency: data.currency,
            exchangeRate: data.exchangeRate,
            journalMemo: data.journalMemo || null,
            notes: data.notes || null,
            lines: fromDeliveryLines,
          },
          orgId,
        });
        navigate(`/sales/ar-invoices/${result.docEntry}`);
      } else if (isFromSo && soDocEntry) {
        // T-201.10: Each line carries the source SO line UUID (soLineId).
        // The backend enforces that all referenced lines are service (non-stock) items.
        const fromSoLines = data.lines.map((l) => {
          if (!l.soLineId) {
            throw new Error(
              'Cannot submit a line without a source Sales Order line reference. ' +
                'Reload the page or recreate the invoice from the Sales Order.',
            );
          }
          return {
            soLineId: l.soLineId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountPercent: l.discountPercent,
            taxCodeId: l.taxCodeId || null,
            costCenterId: l.costCenterId || null,
          };
        });
        const result = await fromSoMutation.mutateAsync({
          soDocEntry,
          data: {
            companyCode: data.companyCode || undefined,
            bpRefNo: data.bpRefNo || null,
            docDate: data.docDate,
            invoiceDate: data.invoiceDate,
            dateOfSupply: data.dateOfSupply || null,
            paymentTermsId: data.paymentTermsId || null,
            currency: data.currency,
            exchangeRate: data.exchangeRate,
            journalMemo: data.journalMemo || null,
            notes: data.notes || null,
            lines: fromSoLines,
          },
          orgId,
        });
        navigate(`/sales/ar-invoices/${result.docEntry}`);
      } else {
        // Direct create
        const result = await createMutation.mutateAsync({
          data: {
            companyCode: data.companyCode,
            customerId: data.customerId,
            customerName: data.customerName,
            bpRefNo: data.bpRefNo || null,
            docDate: data.docDate,
            dateOfSupply: data.dateOfSupply,
            invoiceDate: data.invoiceDate,
            paymentTermsId: data.paymentTermsId || null,
            currency: data.currency,
            exchangeRate: data.exchangeRate,
            journalMemo: data.journalMemo || null,
            notes: data.notes || null,
            lines,
          },
          orgId,
        });
        navigate(`/sales/ar-invoices/${result.docEntry}`);
      }
    } catch (err) {
      // T-201.8: surface the backend's 422 detail message (e.g. stock item rejection)
      // directly rather than a generic fallback so the user knows exactly what to fix.
      let msg = 'An unexpected error occurred. Please try again.';
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        if (typeof detail === 'string') {
          msg = detail;
        } else if (err.message) {
          msg = err.message;
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setSubmitError(msg);
    }
  };

  if (isEdit && loadingInvoice) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/ar-invoices')}>← AR Invoices</BackLink>
        <PageTitle>Loading…</PageTitle>
      </Container>
    );
  }

  // In from-Delivery mode, wait for the Delivery (and its source SO if linked)
  // before painting — otherwise the form would briefly show blank fields and
  // the user would think nothing was inherited.
  if (isFromDelivery && (loadingDelivery || (sourceSoDocId && loadingSourceSo))) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/ar-invoices')}>← AR Invoices</BackLink>
        <PageTitle>Loading source Delivery…</PageTitle>
      </Container>
    );
  }

  // T-201.10: In from-SO mode, wait for the source SO to load before painting.
  if (isFromSo && loadingFromSoSo) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/ar-invoices')}>← AR Invoices</BackLink>
        <PageTitle>Loading source Sales Order…</PageTitle>
      </Container>
    );
  }

  const watchedCustomerId = watch('customerId');
  const watchedCustomerName = watch('customerName');

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/ar-invoices')} aria-label="Back to AR Invoices list">
        ← AR Invoices
      </BackLink>
      <PageTitle>{pageTitle}</PageTitle>

      {isFromDelivery && sourceDelivery && (
        <InfoBanner>
          Creating AR Invoice from Delivery <strong>{sourceDelivery.docNumber}</strong>. Customer
          and item lines are inherited from the Delivery; prices and tax codes come from the
          source Sales Order. Adjust quantities (for partial invoicing) or pricing as needed,
          then click Save as Draft.
        </InfoBanner>
      )}

      {/* T-201.10: from-SO mode info banner */}
      {isFromSo && fromSoSourceSo && (
        <InfoBanner>
          Invoicing service lines from Sales Order <strong>{fromSoSourceSo.docNumber}</strong>.
          Stock lines from this order are invoiced separately via the Delivery Note flow.
          Adjust quantities (for partial invoicing) or pricing as needed, then click Save as Draft.
        </InfoBanner>
      )}

      {submitError && <ErrorBanner>{submitError}</ErrorBanner>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* ── Header section ── */}
        <Card>
          <CardTitle>Header</CardTitle>
          <Grid $cols={3}>
            {showCompanyField && (
              <FieldGroup>
                <Label htmlFor="companyCode">Company Code *</Label>
                <Controller
                  control={control}
                  name="companyCode"
                  render={({ field }) => (
                    <CompanyCombobox
                      value={field.value}
                      onChange={field.onChange}
                      orgId={orgId}
                      disabled={isFromDelivery || isFromSo}
                      hasError={Boolean(errors.companyCode)}
                      describedBy={errors.companyCode ? 'companyCode-error' : undefined}
                    />
                  )}
                />
                {errors.companyCode && (
                  <ErrorText id="companyCode-error">{errors.companyCode.message}</ErrorText>
                )}
              </FieldGroup>
            )}

            <FieldGroup style={{ gridColumn: 'span 2' }}>
              <Label>Customer *</Label>
              <Controller
                control={control}
                name="customerId"
                render={() => (
                  <CustomerCombobox
                    valueCustomerId={watchedCustomerId || null}
                    valueCustomerName={watchedCustomerName}
                    onCustomerSelect={handleCustomerSelect}
                    onClear={handleCustomerClear}
                    error={errors.customerId?.message}
                    disabled={isFromDelivery || isFromSo || isSubmitting}
                  />
                )}
              />
              {/* CustomerCombobox renders errors.customerId internally via its
                  `error` prop — no external ErrorText needed (was duplicating). */}
            </FieldGroup>
          </Grid>

          <Grid $cols={3} style={{ marginTop: '16px' }}>
            <FieldGroup>
              <Label htmlFor="bpRefNo">BP Ref No (Customer PO #)</Label>
              <Input
                id="bpRefNo"
                placeholder="Customer's own reference"
                {...register('bpRefNo')}
              />
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="docDate">Doc Date *</Label>
              <Input
                id="docDate"
                type="date"
                $hasError={Boolean(errors.docDate)}
                {...register('docDate')}
              />
              {errors.docDate && (
                <ErrorText>{errors.docDate.message}</ErrorText>
              )}
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="dateOfSupply">Date of Supply *</Label>
              <Input
                id="dateOfSupply"
                type="date"
                $hasError={Boolean(errors.dateOfSupply)}
                {...register('dateOfSupply')}
              />
              {errors.dateOfSupply && (
                <ErrorText>{errors.dateOfSupply.message}</ErrorText>
              )}
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="invoiceDate">Invoice Date *</Label>
              <Input
                id="invoiceDate"
                type="date"
                $hasError={Boolean(errors.invoiceDate)}
                {...register('invoiceDate')}
              />
              {errors.invoiceDate && (
                <ErrorText>{errors.invoiceDate.message}</ErrorText>
              )}
            </FieldGroup>

            <FieldGroup>
              <Label htmlFor="currency">Currency</Label>
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
            </FieldGroup>

            {showExchangeRate && (
              <FieldGroup>
                <Label htmlFor="exchangeRate">Exchange Rate</Label>
                <Input
                  id="exchangeRate"
                  type="number"
                  step="0.0001"
                  $hasError={Boolean(errors.exchangeRate)}
                  {...register('exchangeRate')}
                />
                {errors.exchangeRate && (
                  <ErrorText>{errors.exchangeRate.message}</ErrorText>
                )}
              </FieldGroup>
            )}

            <FieldGroup style={{ gridColumn: 'span 3' }}>
              <Label htmlFor="journalMemo">Journal Memo</Label>
              <Input
                id="journalMemo"
                placeholder="GL journal memo (optional)"
                {...register('journalMemo')}
              />
            </FieldGroup>

            <FieldGroup style={{ gridColumn: 'span 3' }}>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Internal notes (not printed on invoice)"
                {...register('notes')}
              />
            </FieldGroup>
          </Grid>
        </Card>

        {/* ── Lines section ── */}
        <Card>
          <CardTitle>Invoice Lines</CardTitle>

          {/* T-201.8 — visible only in direct-create mode; explains the item restriction */}
          {isDirectCreate && (
            <DirectCreateNote role="note">
              Only service / fee items can be invoiced directly. To bill for delivered goods,
              use the <strong>Generate AR Invoice</strong> button on the source Delivery Note.
            </DirectCreateNote>
          )}

          {errors.lines?.root && (
            <ErrorText style={{ display: 'block', marginBottom: '12px' }}>
              {errors.lines.root.message}
            </ErrorText>
          )}
          {errors.lines?.message && (
            <ErrorText style={{ display: 'block', marginBottom: '12px' }}>
              {errors.lines.message as string}
            </ErrorText>
          )}

          <div style={{ overflowX: 'auto' }}>
            <LinesTable>
              <thead>
                <tr>
                  <LTh style={{ minWidth: '200px' }}>Item</LTh>
                  <LTh style={{ minWidth: '160px' }}>Description</LTh>
                  <LThRight style={{ minWidth: '80px' }}>Qty</LThRight>
                  <LTh style={{ minWidth: '60px' }}>UoM</LTh>
                  <LThRight style={{ minWidth: '100px' }}>Unit Price</LThRight>
                  <LThRight style={{ minWidth: '80px' }}>Disc %</LThRight>
                  <LThRight style={{ minWidth: '100px' }}>Line Net</LThRight>
                  <LTh style={{ minWidth: '80px' }}>Tax Code</LTh>
                  <LThRight style={{ minWidth: '90px' }}>Tax Amt</LThRight>
                  <LThRight style={{ minWidth: '100px' }}>Line Gross</LThRight>
                  <LTh style={{ minWidth: '40px' }}></LTh>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => {
                  const line = watchedLines[index] ?? {};
                  const qty = Number(line.quantity) || 0;
                  const price = Number(line.unitPrice) || 0;
                  const disc = Number(line.discountPercent) || 0;
                  const lineNet = calcLineNet(qty, price, disc);
                  const taxCode = taxCodes.find(
                    (tc) => tc.taxCode === line.taxCodeId,
                  );
                  const taxRate = taxCode ? parseFloat(taxCode.rate) : 0;
                  const lineTax = calcLineTax(lineNet, taxRate);
                  const lineGross = Math.round((lineNet + lineTax) * 100) / 100;

                  return (
                    <tr key={field.id}>
                      <LTd>
                        <Controller
                          name={`lines.${index}.itemId`}
                          control={control}
                          render={({ field }) => (
                            <SalesItemCombobox
                              valueItemId={field.value ?? ''}
                              valueItemCode={watch(`lines.${index}.itemCode`) ?? ''}
                              onChange={(selection: SalesItemSelection | null) => {
                                if (selection) {
                                  field.onChange(selection.itemId);
                                  setValue(`lines.${index}.itemCode`, selection.itemCode, { shouldValidate: true });
                                  setValue(`lines.${index}.itemName`, selection.itemName, { shouldValidate: true });
                                  if (selection.salesTaxCode) {
                                    setValue(`lines.${index}.taxCodeId`, selection.salesTaxCode);
                                  }
                                } else {
                                  field.onChange('');
                                  setValue(`lines.${index}.itemCode`, '', { shouldValidate: true });
                                  setValue(`lines.${index}.itemName`, '', { shouldValidate: true });
                                  setValue(`lines.${index}.taxCodeId`, null);
                                }
                              }}
                              hasError={Boolean(errors.lines?.[index]?.itemId || errors.lines?.[index]?.itemCode)}
                              disabled={isFromDelivery || isFromSo || isSubmitting}
                              // T-201.8: restrict to service items in direct-create mode;
                              // from-Delivery, from-SO, and edit modes have the picker disabled.
                              filterIsStock={isDirectCreate ? false : undefined}
                              placeholder="Search item…"
                              describedBy={`line-${index}-item-error`}
                            />
                          )}
                        />
                        <input type="hidden" {...register(`lines.${index}.itemCode`)} />
                        <input type="hidden" {...register(`lines.${index}.itemName`)} />
                      </LTd>
                      <LTd>
                        <LineInput
                          {...register(`lines.${index}.description`)}
                          placeholder="Description"
                          aria-label={`Line ${index + 1} description`}
                        />
                      </LTd>
                      <LTdRight>
                        <LineInput
                          type="number"
                          step="0.001"
                          {...register(`lines.${index}.quantity`)}
                          style={{ textAlign: 'right' }}
                          aria-label={`Line ${index + 1} quantity`}
                        />
                      </LTdRight>
                      <LTd>
                        <LineInput
                          {...register(`lines.${index}.uom`)}
                          placeholder="EA"
                          readOnly={isFromDelivery || isFromSo}
                          disabled={isFromDelivery || isFromSo}
                          aria-label={`Line ${index + 1} unit of measure`}
                        />
                      </LTd>
                      <LTdRight>
                        <LineInput
                          type="number"
                          step="0.01"
                          {...register(`lines.${index}.unitPrice`)}
                          style={{ textAlign: 'right' }}
                          aria-label={`Line ${index + 1} unit price`}
                        />
                      </LTdRight>
                      <LTdRight>
                        <LineInput
                          type="number"
                          step="0.01"
                          {...register(`lines.${index}.discountPercent`)}
                          style={{ textAlign: 'right' }}
                          aria-label={`Line ${index + 1} discount percent`}
                        />
                      </LTdRight>
                      <LTdRight>
                        <span>{formatAmount(lineNet)}</span>
                      </LTdRight>
                      <LTd>
                        <Controller
                          control={control}
                          name={`lines.${index}.taxCodeId`}
                          render={({ field: f }) => (
                            <LineSelect
                              value={f.value ?? ''}
                              onChange={(e) =>
                                f.onChange(e.target.value || null)
                              }
                              aria-label={`Line ${index + 1} tax code`}
                            >
                              <option value="">—</option>
                              {taxCodes
                                .filter((tc) => tc.isActive)
                                .map((tc) => (
                                  <option key={tc.taxCode} value={tc.taxCode}>
                                    {tc.taxCode} ({tc.rate}%)
                                  </option>
                                ))}
                            </LineSelect>
                          )}
                        />
                      </LTd>
                      <LTdRight>
                        <span>{formatAmount(lineTax)}</span>
                      </LTdRight>
                      <LTdRight>
                        <strong>{formatAmount(lineGross)}</strong>
                      </LTdRight>
                      <LTd>
                        {fields.length > 1 && (
                          <IconButton
                            type="button"
                            onClick={() => remove(index)}
                            aria-label={`Remove line ${index + 1}`}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        )}
                      </LTd>
                    </tr>
                  );
                })}
              </tbody>
            </LinesTable>
          </div>

          {!isFromDelivery && !isFromSo && (
            <AddLineButton
              type="button"
              onClick={() => append({ ...EMPTY_LINE })}
              aria-label="Add invoice line"
            >
              <Plus size={15} />
              Add Line
            </AddLineButton>
          )}

          <TotalsCard>
            <TotalsRow>
              <TotalsLabel>Net Amount</TotalsLabel>
              <TotalsValue>{formatAmount(totals.net)} AED</TotalsValue>
            </TotalsRow>
            <TotalsRow>
              <TotalsLabel>Tax Amount</TotalsLabel>
              <TotalsValue>{formatAmount(totals.tax)} AED</TotalsValue>
            </TotalsRow>
            <TotalsGross>
              <TotalsLabel>Total (Gross)</TotalsLabel>
              <TotalsValue>{formatAmount(totals.gross)} AED</TotalsValue>
            </TotalsGross>
          </TotalsCard>
        </Card>

        <ActionBar>
          <SecondaryButton
            type="button"
            onClick={() => navigate('/sales/ar-invoices')}
          >
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving…'
              : isEdit
              ? 'Save Changes'
              : 'Save as Draft'}
          </PrimaryButton>
        </ActionBar>
      </form>
    </Container>
  );
}

export default ARInvoiceFormPage;
