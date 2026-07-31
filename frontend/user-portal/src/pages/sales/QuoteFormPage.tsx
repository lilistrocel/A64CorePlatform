/**
 * QuoteFormPage — Wave 3 (T-200.3)
 *
 * Two modes via URL params:
 *   /sales/quotes/new            → create DRAFT Quote
 *   /sales/quotes/:docId/edit    → edit DRAFT Quote (DRAFT only)
 *
 * Header: customer combobox, docDate, validUntilDate, currency, exchangeRate,
 *         paymentTermsId (text input — purchasing combobox is in purchasing module),
 *         bpRefNo, notes.
 *
 * Lines table (useFieldArray): itemCode/itemName, description, qty, uom,
 *   unitPrice, discountPercent, taxPercent, warehouseId, costCenterId.
 *
 * Totals card with live recalculation.
 * Attachments via AttachmentList (docType="QUOTE").
 * Submit creates/updates DRAFT; status transitions happen on the detail page.
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 * NO Audit History button — sales audit endpoint not yet built (T-200.x).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
import { useQuote, useCreateQuote, useUpdateQuote } from '../../hooks/queries/useQuotes';
import { useAuthStore } from '../../stores/auth.store';
import { CustomerCombobox } from '../../components/sales/CustomerCombobox';
import { SalesItemCombobox } from '../../components/sales/SalesItemCombobox';
import { CurrencyCombobox } from '../../components/sales/CurrencyCombobox';
import { PaymentTermsCombobox } from '../../components/sales/PaymentTermsCombobox';
import type { SalesItemSelection } from '../../components/sales/SalesItemCombobox';
import type { PaymentTermsSelection } from '../../components/sales/PaymentTermsCombobox';
import { useTenantBaseCurrency } from '../../hooks/queries/useTenantBaseCurrency';
import { useTaxCodes } from '../../hooks/queries/useTaxCodes';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import type { Customer } from '../../types/crm';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const lineSchema = z.object({
  itemId: z.string().min(1, 'Required'),
  itemCode: z.string().min(1, 'Required'),
  itemName: z.string().min(1, 'Required'),
  description: z.string().optional(),
  quantity: z.coerce.number().positive('Must be > 0'),
  uom: z.string().min(1, 'Required'),
  unitPrice: z.coerce.number().min(0, 'Must be ≥ 0'),
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
  docDate: z.string().min(1, 'Date is required'),
  validUntilDate: z.string().min(1, 'Valid until date is required'),
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
  margin: 0 0 28px;
`;

const Card = styled.div`
  ${glassPanel}
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
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;

const Input = styled.input<{ $error?: boolean }>`
  ${glassControl}
  padding: 10px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $error, theme }) => ($error ? theme.colors.bright.coral : theme.colors.glass.border)};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ $error, theme }) => ($error ? theme.colors.bright.coral : theme.colors.secondary[500])};
    box-shadow: ${({ $error }) => ($error ? 'none' : '0 0 0 3px rgba(220, 185, 79, 0.15)')};
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

const FieldError = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.bright.coral};
`;

const LinesHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

// Ghost/ancillary button — transparent, celeste text/border (spec §4).
const AddLineBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const LinesTable = styled.div`
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
`;

const Th = styled.th`
  ${monoLabel}
  padding: 10px 10px;
  color: ${({ theme }) => theme.colors.celeste};
  text-align: left;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 8px 6px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: top;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const LineInput = styled.input`
  ${glassControl}
  padding: 7px 8px;
  font-size: 13px;
  width: 100%;
  min-width: 80px;
  box-sizing: border-box;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.textPrimary};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

// Destructive — coral-b tinted glass, never solid red (spec §4).
const DeleteLineBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(240, 138, 112, 0.45);
  background: rgba(240, 138, 112, 0.16);
  color: ${({ theme }) => theme.colors.bright.coral};
  border-radius: 6px;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover {
    background: rgba(240, 138, 112, 0.26);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// Nested one level inside a glassPanel Card — stays a plain `line` border
// with no fill rather than a second glass layer (spec §2 two-layer limit).
const TotalsCard = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.line};
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
  color: ${({ theme }) => theme.colors.celeste};
`;

const TotalsGross = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  padding-top: 10px;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
`;

// Primary CTA — the ONE gold budget item on this page (spec §3/§4).
const SubmitBtn = styled.button`
  padding: 12px 28px;
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
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const CancelBtn = styled.button`
  ${glassControl}
  padding: 12px 20px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.glass.hi}; }
`;

const ErrorBanner = styled.div`
  padding: 14px 18px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 14px;
  margin-bottom: 20px;
`;

// ─── Default line ─────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcLineTotals(line: {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
}) {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unitPrice) || 0;
  const disc = Number(line.discountPercent) || 0;
  const tax = Number(line.taxPercent) || 0;
  const lineNet = qty * price * (1 - disc / 100);
  const lineTax = lineNet * (tax / 100);
  const lineGross = lineNet + lineTax;
  return { lineNet, lineTax, lineGross };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuoteFormPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { docId } = useParams<{ docId?: string }>();
  const isEditMode = Boolean(docId);

  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';

  const { data: existingQuote, isLoading: isLoadingQuote } = useQuote(
    isEditMode ? docId : undefined,
    isEditMode ? orgId : undefined,
  );

  const createMutation = useCreateQuote();
  const updateMutation = useUpdateQuote();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: '',
      customerName: '',
      docDate: new Date().toISOString().split('T')[0],
      validUntilDate: '',
      currency: 'AED',
      exchangeRate: 1,
      paymentTermsId: null,
      bpRefNo: null,
      notes: null,
      journalMemo: null,
      lines: [DEFAULT_LINE],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });

  // Pre-fill form from existing quote when editing
  useEffect(() => {
    if (existingQuote && isEditMode) {
      setValue('customerId', existingQuote.customerId);
      setValue('customerName', existingQuote.customerName);
      setValue('docDate', existingQuote.docDate.split('T')[0]);
      setValue('validUntilDate', existingQuote.validUntilDate.split('T')[0]);
      setValue('currency', existingQuote.currency);
      setValue('exchangeRate', existingQuote.exchangeRate);
      setValue('paymentTermsId', existingQuote.paymentTermsId ?? null);
      setValue('bpRefNo', existingQuote.bpRefNo ?? null);
      setValue('notes', existingQuote.notes ?? null);
      setValue('journalMemo', existingQuote.journalMemo ?? null);
      setValue(
        'lines',
        existingQuote.lines.map((l) => ({
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
      );
    }
  }, [existingQuote, isEditMode, setValue]);

  // Tax codes (used to look up tax rate when an item is picked)
  const { data: taxCodesData } = useTaxCodes(orgId);
  const taxCodes = taxCodesData ?? [];

  // Live totals calculation — useWatch is reactive on inner field-array changes
  // (plain `watch('lines')` returns a stale snapshot for nested updates in
  // react-hook-form v7+ field arrays).
  const watchedLines = useWatch({ control, name: 'lines' });
  const liveTotals = useMemo(() => {
    let net = 0;
    let tax = 0;
    for (const line of watchedLines ?? []) {
      const t = calcLineTotals(line);
      net += t.lineNet;
      tax += t.lineTax;
    }
    return { net, tax, gross: net + tax };
  }, [watchedLines]);

  function handleCustomerSelect(customer: Customer) {
    setValue('customerId', customer.customerId);
    setValue('customerName', customer.name);
  }

  function handleCustomerClear() {
    setValue('customerId', '');
    setValue('customerName', '');
  }

  const currentCustomerId = watch('customerId');
  const currentCustomerName = watch('customerName');

  // Exchange rate visibility: only show when currency !== base currency.
  const baseCurrency = useTenantBaseCurrency();
  const watchedCurrency = watch('currency');
  const showExchangeRate = watchedCurrency !== baseCurrency;

  // Keep a display name for the PaymentTermsCombobox chip in edit mode.
  const [paymentTermsName, setPaymentTermsName] = useState<string>('');

  // When currency reverts to base, reset exchangeRate to 1.0 in form state.
  useEffect(() => {
    if (!showExchangeRate) {
      setValue('exchangeRate', 1);
    }
  }, [showExchangeRate, setValue]);

  async function onSubmit(data: FormData) {
    try {
      if (isEditMode && docId) {
        await updateMutation.mutateAsync({
          docId,
          data: {
            customerId: data.customerId,
            customerName: data.customerName,
            bpRefNo: data.bpRefNo ?? null,
            docDate: data.docDate,
            validUntilDate: data.validUntilDate,
            currency: data.currency,
            exchangeRate: data.exchangeRate,
            paymentTermsId: data.paymentTermsId ?? null,
            journalMemo: data.journalMemo ?? null,
            notes: data.notes ?? null,
            lines: data.lines,
          },
          orgId,
        });
        navigate(`/sales/quotes/${docId}`);
      } else {
        const created = await createMutation.mutateAsync({
          data: {
            customerId: data.customerId,
            customerName: data.customerName,
            bpRefNo: data.bpRefNo ?? null,
            docDate: data.docDate,
            validUntilDate: data.validUntilDate,
            currency: data.currency,
            exchangeRate: data.exchangeRate,
            paymentTermsId: data.paymentTermsId ?? null,
            journalMemo: data.journalMemo ?? null,
            notes: data.notes ?? null,
            lines: data.lines,
          },
          orgId,
        });
        navigate(`/sales/quotes/${created.docEntry}`);
      }
    } catch {
      // Error surfaces via mutation.error — no additional handling needed.
    }
  }

  const mutationError = createMutation.error ?? updateMutation.error;

  if (isEditMode && isLoadingQuote) {
    return (
      <Container>
        <BackLink onClick={() => navigate('/sales/quotes')}>← Back to Quotes</BackLink>
        <p style={{ color: theme.colors.textSecondary }}>Loading quote…</p>
      </Container>
    );
  }

  if (isEditMode && existingQuote && existingQuote.status !== 'draft') {
    return (
      <Container>
        <BackLink onClick={() => navigate(`/sales/quotes/${docId}`)}>← Back to Quote</BackLink>
        <ErrorBanner>
          Only DRAFT quotes can be edited. This quote is currently{' '}
          <strong>{existingQuote.status}</strong>.
        </ErrorBanner>
      </Container>
    );
  }

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/quotes')}>← Back to Quotes</BackLink>
      <PageTitle>{isEditMode ? `Edit Quote ${existingQuote?.docNumber ?? ''}` : 'New Sales Quote'}</PageTitle>

      {mutationError && (
        <ErrorBanner>
          {mutationError instanceof Error
            ? mutationError.message
            : 'Failed to save quote. Please try again.'}
        </ErrorBanner>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* Header */}
        <Card>
          <SectionTitle>Quote Header</SectionTitle>
          <Grid $cols={2}>
            <Field style={{ gridColumn: '1 / -1' }}>
              <Label>Customer *</Label>
              <Controller
                name="customerId"
                control={control}
                render={() => (
                  <CustomerCombobox
                    valueCustomerId={currentCustomerId || null}
                    valueCustomerName={currentCustomerName}
                    onCustomerSelect={handleCustomerSelect}
                    onClear={handleCustomerClear}
                    error={errors.customerId?.message}
                    disabled={isSubmitting}
                  />
                )}
              />
            </Field>

            <Field>
              <Label>Quote Date *</Label>
              <Input
                type="date"
                $error={Boolean(errors.docDate)}
                {...register('docDate')}
              />
              {errors.docDate && <FieldError>{errors.docDate.message}</FieldError>}
            </Field>

            <Field>
              <Label>Valid Until *</Label>
              <Input
                type="date"
                $error={Boolean(errors.validUntilDate)}
                {...register('validUntilDate')}
              />
              {errors.validUntilDate && <FieldError>{errors.validUntilDate.message}</FieldError>}
            </Field>

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

            <Field>
              <Label>BP Ref No</Label>
              <Input
                type="text"
                placeholder="Customer's RFQ number"
                {...register('bpRefNo')}
              />
            </Field>

            <Field style={{ gridColumn: '1 / -1' }}>
              <Label>Notes</Label>
              <Textarea
                placeholder="Internal notes or terms..."
                {...register('notes')}
              />
            </Field>
          </Grid>
        </Card>

        {/* Lines */}
        <Card>
          <LinesHeader>
            <SectionTitle style={{ margin: 0 }}>Quote Lines</SectionTitle>
            <AddLineBtn
              type="button"
              onClick={() => append({ ...DEFAULT_LINE })}
            >
              <Plus size={14} />
              Add Line
            </AddLineBtn>
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
                  <Th style={{ width: 30 }}>#</Th>
                  <Th style={{ minWidth: 220 }}>Item</Th>
                  <Th style={{ minWidth: 120 }}>Description</Th>
                  <Th style={{ width: 70 }}>Qty</Th>
                  <Th style={{ width: 60 }}>UoM</Th>
                  <Th style={{ width: 100 }}>Unit Price</Th>
                  <Th style={{ width: 70 }}>Disc %</Th>
                  <Th style={{ width: 70 }}>Tax %</Th>
                  <Th style={{ width: 100 }}>Warehouse</Th>
                  <Th style={{ width: 100 }}>Cost Centre</Th>
                  <Th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => (
                  <tr key={field.id}>
                    <Td style={{ color: theme.colors.textDisabled, fontSize: 13, textAlign: 'center' }}>
                      {index + 1}
                    </Td>
                    <Td>
                      {/* SalesItemCombobox — stamps UUID itemId, itemCode, itemName, salesTaxCode */}
                      {/*
                        SalesItemCombobox — Controller wraps itemId (the UUID).
                        itemCode and itemName are stamped via setValue; they are
                        registered as hidden inputs so RHF validation fires on them.
                        We do NOT register itemId separately (Controller owns it).
                      */}
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
                                  // Look up the rate for this tax code and stamp taxPercent
                                  // so line totals + Tax Total recompute immediately.
                                  const tc = taxCodes.find(
                                    (t) => t.taxCode === selection.salesTaxCode,
                                  );
                                  const rate = tc ? Number(tc.rate) : 0;
                                  setValue(`lines.${index}.taxPercent`, rate);
                                }
                              } else {
                                field.onChange('');
                                setValue(`lines.${index}.itemCode`, '', { shouldValidate: true });
                                setValue(`lines.${index}.itemName`, '', { shouldValidate: true });
                                setValue(`lines.${index}.taxCodeId`, null);
                                setValue(`lines.${index}.taxPercent`, 0);
                              }
                            }}
                            hasError={Boolean(errors.lines?.[index]?.itemId || errors.lines?.[index]?.itemCode)}
                            disabled={isSubmitting}
                            placeholder="Search item…"
                          />
                        )}
                      />
                      {/* itemCode and itemName registered so Zod validates them */}
                      <input type="hidden" {...register(`lines.${index}.itemCode`)} />
                      <input type="hidden" {...register(`lines.${index}.itemName`)} />
                    </Td>
                    <Td>
                      <LineInput
                        placeholder="Optional description"
                        {...register(`lines.${index}.description`)}
                      />
                    </Td>
                    <Td>
                      <LineInput
                        type="number"
                        step="1"
                        min="0"
                        placeholder="1"
                        style={{ textAlign: 'right' }}
                        {...register(`lines.${index}.quantity`)}
                      />
                    </Td>
                    <Td>
                      <LineInput
                        placeholder="pcs"
                        {...register(`lines.${index}.uom`)}
                      />
                    </Td>
                    <Td>
                      <LineInput
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        style={{ textAlign: 'right' }}
                        {...register(`lines.${index}.unitPrice`)}
                      />
                    </Td>
                    <Td>
                      <LineInput
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="0"
                        style={{ textAlign: 'right' }}
                        {...register(`lines.${index}.discountPercent`)}
                      />
                    </Td>
                    <Td>
                      <LineInput
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="0"
                        style={{ textAlign: 'right' }}
                        {...register(`lines.${index}.taxPercent`)}
                      />
                    </Td>
                    <Td>
                      <LineInput
                        placeholder="WH-01"
                        {...register(`lines.${index}.warehouseId`)}
                      />
                    </Td>
                    <Td>
                      <LineInput
                        placeholder="CC-01"
                        {...register(`lines.${index}.costCenterId`)}
                      />
                    </Td>
                    <Td>
                      <DeleteLineBtn
                        type="button"
                        aria-label={`Remove line ${index + 1}`}
                        onClick={() => fields.length > 1 && remove(index)}
                        disabled={fields.length <= 1}
                      >
                        <Trash2 size={14} />
                      </DeleteLineBtn>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </LinesTable>

          {/* Totals */}
          <TotalsCard style={{ marginTop: 20 }}>
            <TotalsRow>
              <span>Net Total</span>
              <span>
                {liveTotals.net.toLocaleString('en-AE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </TotalsRow>
            <TotalsRow>
              <span>Tax Total</span>
              <span>
                {liveTotals.tax.toLocaleString('en-AE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </TotalsRow>
            <TotalsGross>
              <span>Gross Total</span>
              <span>
                {watch('currency') || 'AED'}{' '}
                {liveTotals.gross.toLocaleString('en-AE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </TotalsGross>
          </TotalsCard>
        </Card>

        {/* Attachments — only in edit mode (need existing docEntry) */}
        {isEditMode && docId && (
          <Card>
            <SectionTitle>Attachments</SectionTitle>
            <AttachmentList
              docType="QUOTE"
              docId={docId}
              organizationId={orgId}
            />
          </Card>
        )}

        <ActionRow>
          <CancelBtn
            type="button"
            onClick={() => navigate(isEditMode ? `/sales/quotes/${docId}` : '/sales/quotes')}
          >
            Cancel
          </CancelBtn>
          <SubmitBtn type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Saving…'
              : isEditMode
              ? 'Save Changes'
              : 'Create Draft Quote'}
          </SubmitBtn>
        </ActionRow>
      </form>
    </Container>
  );
}
