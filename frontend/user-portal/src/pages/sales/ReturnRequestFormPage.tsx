/**
 * ReturnRequestFormPage — Wave 3 (T-200.6)
 *
 * Three modes via URL params:
 *   /sales/return-requests/new                           → blank form (manual, rare)
 *   /sales/return-requests/from-delivery/:dnDocEntry     → pre-fill from Delivery (primary)
 *   /sales/return-requests/:docId/edit                   → edit DRAFT RR
 *
 * From-Delivery mode (headline UX — the natural entry point from DeliveryDetailPage):
 *   Fetches the source Delivery, pre-fills customer + all posted lines into the form.
 *   Each line shows the Delivery line's quantity as default requestedQty.
 *   User can return LESS than delivered quantity (partial return) but NOT more.
 *   Submission calls createReturnRequestFromDelivery (which maps to createReturnRequest).
 *
 * Header fields: customer (locked in from-delivery mode), docDate, validUntilDate,
 *   reason (dropdown), reasonText (free-text), notes.
 * Lines table (useFieldArray): itemCode, itemName, description, requestedQty (≤ deliveredQty),
 *   uom. Customer and lines locked when from-delivery.
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 * NO Audit History button — sales audit endpoint pending T-200.x.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2 } from 'lucide-react';
import axios from 'axios';
import {
  useReturnRequest,
  useCreateReturnRequestFromDelivery,
  useCreateReturnRequest,
  useUpdateReturnRequest,
} from '../../hooks/queries/useReturnRequests';
import { useDelivery } from '../../hooks/queries/useDeliveries';
import { useAuthStore } from '../../stores/auth.store';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import type { DeliveryLine, ReturnReason } from '../../services/salesApi';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const lineSchema = z.object({
  lineId: z.string().optional(),         // from source Delivery line
  itemId: z.string().min(1, 'Required'),
  itemCode: z.string().min(1, 'Required'),
  itemName: z.string().min(1, 'Required'),
  description: z.string().optional().nullable(),
  requestedQty: z.coerce.number().positive('Must be > 0'),
  uom: z.string().min(1, 'Required'),
  unitPrice: z.coerce.number().min(0, 'Must be ≥ 0'),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  taxCodeId: z.string().optional().nullable(),
  warehouseId: z.string().optional().nullable(),
  costCenterId: z.string().optional().nullable(),
  // Source DN line reference (required — every RR line must link back to a DN line)
  baseDocRefDocType: z.string().default('DELIVERY'),
  baseDocRefDocId: z.string().min(1),
  baseDocRefDocNumber: z.string().min(1),
  baseDocRefLineId: z.string().optional().nullable(),
  // Display-only: max quantity from source (Delivery line delivered qty)
  maxQty: z.coerce.number().optional(),
});

const formSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  customerName: z.string().min(1, 'Customer is required'),
  companyCode: z.string().default('A001'),
  docDate: z.string().min(1, 'Document date is required'),
  validUntilDate: z.string().min(1, 'Valid until date is required'),
  reason: z.enum([
    'damaged', 'wrong_item', 'overshipped', 'customer_change', 'quality', 'other',
  ] as const),
  reasonText: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  // Header-level base doc ref (source Delivery)
  baseDocRefDocType: z.string().default('DELIVERY'),
  baseDocRefDocId: z.string().optional().nullable(),
  baseDocRefDocNumber: z.string().optional().nullable(),
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

const Title = styled.h1`
  font-size: 24px;
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
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 20px;
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Input = styled.input<{ $hasError?: boolean }>`
  padding: 9px 12px;
  border: 1px solid ${({ $hasError, theme }) =>
    $hasError ? '#dc2626' : theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[400]}; }
  &:disabled { background: ${({ theme }) => theme.colors.neutral[100]}; color: ${({ theme }) => theme.colors.textSecondary}; }
`;

const Select = styled.select<{ $hasError?: boolean }>`
  padding: 9px 12px;
  border: 1px solid ${({ $hasError, theme }) =>
    $hasError ? '#dc2626' : theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[400]}; }
  &:disabled { background: ${({ theme }) => theme.colors.neutral[100]}; color: ${({ theme }) => theme.colors.textSecondary}; }
`;

const Textarea = styled.textarea`
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  resize: vertical;
  min-height: 72px;
  font-family: inherit;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[400]}; }
`;

const ErrorText = styled.span`
  font-size: 12px;
  color: #dc2626;
`;

const LockedValue = styled.div`
  padding: 9px 12px;
  background: ${({ theme }) => theme.colors.neutral[50]};
  border: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  border-radius: 8px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  padding: 9px 10px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 8px 10px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: top;
`;

const TdInput = styled.input<{ $hasError?: boolean }>`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid ${({ $hasError }) => ($hasError ? '#dc2626' : '#e5e7eb')};
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  &:focus { outline: none; border-color: #3b82f6; }
  &:disabled { background: #f9fafb; color: #6b7280; }
`;

const MaxQtyHint = styled.span`
  font-size: 11px;
  color: #9ca3af;
  margin-top: 2px;
  display: block;
`;

const DeleteLineButton = styled.button`
  padding: 5px 8px;
  background: none;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #dc2626;
  cursor: pointer;
  &:hover { background: #fef2f2; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const ActionBar = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
`;

const PrimaryButton = styled.button`
  padding: 10px 28px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.primary[600]}; }
`;

const SecondaryButton = styled.button`
  padding: 10px 22px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textPrimary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
`;

const SubmitError = styled.div`
  padding: 12px 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #991b1b;
  font-size: 14px;
  margin-bottom: 16px;
`;

const SourceBanner = styled.div`
  padding: 10px 16px;
  background: ${({ theme }) => theme.colors.primary[50]};
  border: 1px solid ${({ theme }) => theme.colors.primary[200]};
  border-radius: 8px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.primary[700]};
  margin-bottom: 20px;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REASON_OPTIONS: Array<{ value: ReturnReason; label: string }> = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'overshipped', label: 'Overshipped' },
  { value: 'customer_change', label: 'Customer Changed Mind' },
  { value: 'quality', label: 'Quality Issue' },
  { value: 'other', label: 'Other' },
];

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function thirtyDaysLater(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReturnRequestFormPage() {
  const navigate = useNavigate();
  const { docId, dnDocEntry } = useParams<{ docId?: string; dnDocEntry?: string }>();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';

  // Determine mode
  const isFromDelivery = Boolean(dnDocEntry);
  const isEdit = Boolean(docId);

  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch source Delivery when in from-delivery mode
  const { data: delivery, isLoading: deliveryLoading } = useDelivery(
    dnDocEntry,
    orgId,
  );

  // Fetch existing RR for edit mode
  const { data: existingRr, isLoading: rrLoading } = useReturnRequest(
    docId,
    orgId,
  );

  const createFromDeliveryMut = useCreateReturnRequestFromDelivery();
  const createDirectMut = useCreateReturnRequest();
  const updateMut = useUpdateReturnRequest();

  // ── Form setup ────────────────────────────────────────────────────────────

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyCode: 'A001',
      docDate: today(),
      validUntilDate: thirtyDaysLater(),
      reason: 'damaged',
      reasonText: '',
      notes: '',
      customerId: '',
      customerName: '',
      baseDocRefDocType: 'DELIVERY',
      baseDocRefDocId: '',
      baseDocRefDocNumber: '',
      lines: [],
    },
  });

  const { fields, remove } = useFieldArray({ control, name: 'lines' });
  const watchedLines = watch('lines');

  // Pre-fill from Delivery when data arrives
  useEffect(() => {
    if (!delivery || !isFromDelivery) return;
    const deliveryLines = delivery.lines as DeliveryLine[];
    reset({
      companyCode: delivery.companyCode ?? 'A001',
      customerId: delivery.customerId,
      customerName: delivery.customerName,
      docDate: today(),
      validUntilDate: thirtyDaysLater(),
      reason: 'damaged',
      reasonText: '',
      notes: '',
      baseDocRefDocType: 'DELIVERY',
      baseDocRefDocId: delivery.docEntry,
      baseDocRefDocNumber: delivery.docNumber,
      lines: deliveryLines.map((l) => ({
        lineId: l.lineId,
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        description: l.description ?? '',
        requestedQty: l.quantity,
        uom: l.uom,
        unitPrice: l.unitCost ?? 0,
        discountPercent: 0,
        taxPercent: 0,
        taxCodeId: null,
        warehouseId: l.warehouseId ?? null,
        costCenterId: l.costCenterId ?? null,
        baseDocRefDocType: 'DELIVERY',
        baseDocRefDocId: delivery.docEntry,
        baseDocRefDocNumber: delivery.docNumber,
        baseDocRefLineId: l.lineId,
        maxQty: l.quantity,
      })),
    });
  }, [delivery, isFromDelivery, reset]);

  // Pre-fill from existing RR for edit mode
  useEffect(() => {
    if (!existingRr || !isEdit) return;
    reset({
      companyCode: existingRr.companyCode,
      customerId: existingRr.customerId,
      customerName: existingRr.customerName,
      docDate: existingRr.docDate,
      validUntilDate: existingRr.validUntilDate,
      reason: existingRr.reason,
      reasonText: existingRr.reasonText ?? '',
      notes: existingRr.notes ?? '',
      baseDocRefDocType: (existingRr.baseDocRef as { docType?: string } | null)?.docType ?? 'DELIVERY',
      baseDocRefDocId: (existingRr.baseDocRef as { docId?: string } | null)?.docId ?? '',
      baseDocRefDocNumber: (existingRr.baseDocRef as { docNumber?: string } | null)?.docNumber ?? '',
      lines: existingRr.lines.map((l) => ({
        lineId: l.lineId,
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        description: l.description ?? '',
        requestedQty: l.requestedQty,
        uom: l.uom,
        unitPrice: Number(l.unitPrice),
        discountPercent: Number(l.discountPercent),
        taxPercent: Number(l.taxPercent),
        taxCodeId: l.taxCodeId ?? null,
        warehouseId: l.warehouseId ?? null,
        costCenterId: l.costCenterId ?? null,
        baseDocRefDocType: (l.baseDocRef as { docType?: string } | null)?.docType ?? 'DELIVERY',
        baseDocRefDocId: (l.baseDocRef as { docId?: string } | null)?.docId ?? '',
        baseDocRefDocNumber: (l.baseDocRef as { docNumber?: string } | null)?.docNumber ?? '',
        baseDocRefLineId: (l.baseDocRef as { lineId?: string } | null)?.lineId ?? null,
        maxQty: undefined,
      })),
    });
  }, [existingRr, isEdit, reset]);

  // ── Submit handler ─────────────────────────────────────────────────────────

  const onSubmit = async (data: FormData) => {
    setSubmitError('');
    setIsSubmitting(true);
    try {
      const payload = {
        companyCode: data.companyCode,
        customerId: data.customerId,
        customerName: data.customerName,
        docDate: data.docDate,
        validUntilDate: data.validUntilDate,
        reason: data.reason,
        reasonText: data.reasonText ?? null,
        notes: data.notes ?? null,
        baseDocRef: {
          docType: data.baseDocRefDocType,
          docId: data.baseDocRefDocId ?? '',
          docNumber: data.baseDocRefDocNumber ?? '',
          lineId: null,
        },
        lines: data.lines.map((l) => ({
          itemId: l.itemId,
          itemCode: l.itemCode,
          itemName: l.itemName,
          description: l.description ?? null,
          requestedQty: l.requestedQty,
          uom: l.uom,
          unitPrice: l.unitPrice,
          discountPercent: l.discountPercent,
          taxPercent: l.taxPercent,
          taxCodeId: l.taxCodeId ?? null,
          warehouseId: l.warehouseId ?? null,
          costCenterId: l.costCenterId ?? null,
          baseDocRef: {
            docType: l.baseDocRefDocType,
            docId: l.baseDocRefDocId,
            docNumber: l.baseDocRefDocNumber,
            lineId: l.baseDocRefLineId ?? null,
          },
        })),
      };

      let result;
      if (isEdit && docId) {
        result = await updateMut.mutateAsync({
          docId,
          data: {
            docDate: payload.docDate,
            validUntilDate: payload.validUntilDate,
            reason: payload.reason,
            reasonText: payload.reasonText,
            notes: payload.notes,
            lines: payload.lines,
          },
          orgId,
        });
      } else if (isFromDelivery) {
        result = await createFromDeliveryMut.mutateAsync({ data: payload, orgId });
      } else {
        result = await createDirectMut.mutateAsync({ data: payload, orgId });
      }

      navigate(`/sales/return-requests/${result.docEntry}`);
    } catch (err) {
      let msg = 'Failed to save Return Request. Please try again.';
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        if (typeof detail === 'string') msg = detail;
      }
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Loading / error states ─────────────────────────────────────────────────

  const isLoading = (isFromDelivery && deliveryLoading) || (isEdit && rrLoading);

  if (isLoading) {
    return (
      <Container>
        <BackLink onClick={() => navigate(-1)}>← Back</BackLink>
        <Title>Loading...</Title>
      </Container>
    );
  }

  if (isFromDelivery && !delivery) {
    return (
      <Container>
        <BackLink onClick={() => navigate(-1)}>← Back</BackLink>
        <Title>Delivery not found</Title>
        <SubmitError>Could not load the source Delivery. Please navigate back and try again.</SubmitError>
      </Container>
    );
  }

  if (isEdit && !existingRr) {
    return (
      <Container>
        <BackLink onClick={() => navigate(-1)}>← Back</BackLink>
        <Title>Return Request not found</Title>
      </Container>
    );
  }

  const pageTitle = isEdit
    ? `Edit ${existingRr?.docNumber ?? 'Return Request'}`
    : isFromDelivery
    ? `New Return Request from ${delivery?.docNumber ?? ''}`
    : 'New Return Request';

  return (
    <Container>
      <BackLink onClick={() => navigate(-1)}>← Back</BackLink>
      <Title>{pageTitle}</Title>

      {isFromDelivery && delivery && (
        <SourceBanner>
          Creating Return Request from Delivery <strong>{delivery.docNumber}</strong> — {delivery.customerName}.
          Lines are pre-filled from the Delivery. You may reduce the requested quantity per line (not increase it).
        </SourceBanner>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* ── Header card ── */}
        <Card>
          <SectionTitle>Header</SectionTitle>
          <FormGrid>
            {/* Customer — locked in from-delivery mode */}
            <Field>
              <Label>Customer *</Label>
              {isFromDelivery || isEdit ? (
                <LockedValue>{watch('customerName') || '—'}</LockedValue>
              ) : (
                <>
                  <Input
                    {...register('customerName')}
                    placeholder="Customer name"
                    $hasError={Boolean(errors.customerName)}
                  />
                  {errors.customerName && <ErrorText>{errors.customerName.message}</ErrorText>}
                </>
              )}
              {/* Hidden customerId input */}
              <input type="hidden" {...register('customerId')} />
              <input type="hidden" {...register('baseDocRefDocId')} />
              <input type="hidden" {...register('baseDocRefDocNumber')} />
              <input type="hidden" {...register('baseDocRefDocType')} />
            </Field>

            {/* Document Date */}
            <Field>
              <Label>Document Date *</Label>
              <Input
                type="date"
                {...register('docDate')}
                $hasError={Boolean(errors.docDate)}
              />
              {errors.docDate && <ErrorText>{errors.docDate.message}</ErrorText>}
            </Field>

            {/* Valid Until Date */}
            <Field>
              <Label>Valid Until (RMA Window) *</Label>
              <Input
                type="date"
                {...register('validUntilDate')}
                $hasError={Boolean(errors.validUntilDate)}
              />
              {errors.validUntilDate && <ErrorText>{errors.validUntilDate.message}</ErrorText>}
            </Field>

            {/* Reason */}
            <Field>
              <Label>Return Reason *</Label>
              <Select {...register('reason')} $hasError={Boolean(errors.reason)}>
                {REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
              {errors.reason && <ErrorText>{errors.reason.message as string}</ErrorText>}
            </Field>

            {/* Reason Text */}
            <Field style={{ gridColumn: 'span 2' }}>
              <Label>Reason Details</Label>
              <Textarea
                {...register('reasonText')}
                placeholder="Additional details about the return reason..."
              />
            </Field>

            {/* Notes */}
            <Field style={{ gridColumn: 'span 2' }}>
              <Label>Internal Notes</Label>
              <Textarea
                {...register('notes')}
                placeholder="Internal notes (not shown to customer)..."
              />
            </Field>
          </FormGrid>
        </Card>

        {/* ── Lines card ── */}
        <Card>
          <SectionTitle>Return Lines</SectionTitle>
          {errors.lines && !Array.isArray(errors.lines) && (
            <SubmitError style={{ marginBottom: 16 }}>
              {(errors.lines as { message?: string }).message ?? 'Lines error'}
            </SubmitError>
          )}
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <Th style={{ width: 40 }}>#</Th>
                  <Th>Item Code</Th>
                  <Th>Item Name</Th>
                  <Th>Description</Th>
                  <Th style={{ width: 120 }}>Requested Qty *</Th>
                  <Th style={{ width: 80 }}>UOM</Th>
                  <Th style={{ width: 80 }}>Unit Price</Th>
                  {!isFromDelivery && <Th style={{ width: 60 }}>Remove</Th>}
                </tr>
              </thead>
              <tbody>
                {fields.length === 0 ? (
                  <tr>
                    <Td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#9ca3af' }}>
                      No lines yet.
                      {isFromDelivery && ' (Loading from Delivery...)'}
                    </Td>
                  </tr>
                ) : (
                  fields.map((field, idx) => {
                    const maxQty = watchedLines?.[idx]?.maxQty;
                    return (
                      <tr key={field.id}>
                        <Td style={{ color: '#9ca3af', fontWeight: 600 }}>{idx + 1}</Td>

                        {/* Item Code — read-only in from-delivery mode */}
                        <Td>
                          <TdInput
                            {...register(`lines.${idx}.itemCode`)}
                            disabled={isFromDelivery}
                          />
                        </Td>

                        {/* Item Name — read-only in from-delivery mode */}
                        <Td>
                          <TdInput
                            {...register(`lines.${idx}.itemName`)}
                            disabled={isFromDelivery}
                          />
                        </Td>

                        {/* Description */}
                        <Td>
                          <TdInput {...register(`lines.${idx}.description`)} />
                        </Td>

                        {/* Requested Qty */}
                        <Td>
                          <TdInput
                            type="number"
                            step="0.001"
                            min={0.001}
                            max={maxQty}
                            $hasError={Boolean(errors.lines?.[idx]?.requestedQty)}
                            {...register(`lines.${idx}.requestedQty`)}
                          />
                          {maxQty != null && (
                            <MaxQtyHint>Max: {maxQty}</MaxQtyHint>
                          )}
                          {errors.lines?.[idx]?.requestedQty && (
                            <MaxQtyHint style={{ color: '#dc2626' }}>
                              {errors.lines[idx]?.requestedQty?.message}
                            </MaxQtyHint>
                          )}
                        </Td>

                        {/* UOM */}
                        <Td>
                          <TdInput
                            {...register(`lines.${idx}.uom`)}
                            disabled={isFromDelivery}
                          />
                        </Td>

                        {/* Unit Price */}
                        <Td>
                          <TdInput
                            type="number"
                            step="0.01"
                            min={0}
                            {...register(`lines.${idx}.unitPrice`)}
                            disabled={isFromDelivery}
                          />
                        </Td>

                        {!isFromDelivery && (
                          <Td>
                            <DeleteLineButton
                              type="button"
                              disabled={fields.length <= 1}
                              onClick={() => remove(idx)}
                              aria-label={`Remove line ${idx + 1}`}
                            >
                              <Trash2 size={14} />
                            </DeleteLineButton>
                          </Td>
                        )}

                        {/* Hidden fields */}
                        <input type="hidden" {...register(`lines.${idx}.itemId`)} />
                        <input type="hidden" {...register(`lines.${idx}.lineId`)} />
                        <input type="hidden" {...register(`lines.${idx}.baseDocRefDocType`)} />
                        <input type="hidden" {...register(`lines.${idx}.baseDocRefDocId`)} />
                        <input type="hidden" {...register(`lines.${idx}.baseDocRefDocNumber`)} />
                        <input type="hidden" {...register(`lines.${idx}.baseDocRefLineId`)} />
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </div>
        </Card>

        {/* ── Attachments ── */}
        {(isEdit && docId) && (
          <Card>
            <SectionTitle>Attachments</SectionTitle>
            <AttachmentList
              docType="RETURN_REQUEST"
              docId={docId}
              readOnly={false}
            />
          </Card>
        )}

        {/* ── Submit ── */}
        {submitError && <SubmitError>{submitError}</SubmitError>}
        <ActionBar>
          <SecondaryButton type="button" onClick={() => navigate(-1)}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Return Request'}
          </PrimaryButton>
        </ActionBar>
      </form>
    </Container>
  );
}
