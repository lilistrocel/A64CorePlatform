/**
 * DeliveryFormPage — Wave 3 (T-200.5)
 *
 * Three modes via URL params:
 *   /sales/deliveries/new                      → create DRAFT DN (manual, rare)
 *   /sales/deliveries/from-so/:soDocEntry      → pre-fill from Sales Order (primary flow)
 *   /sales/deliveries/:docId/edit              → edit DRAFT DN
 *
 * From-SO mode (headline UX — unblocks T-200.4's Create Delivery button):
 *   Fetches the source SO, pre-fills customer + all open lines into the form.
 *   Each line shows the SO line's openQty as default deliveryQty.
 *   User can ship LESS than openQty (partial delivery) but NOT more.
 *   Submission calls createDeliveryFromSO endpoint.
 *   SO may auto-close when all lines fully delivered.
 *
 * Header fields: customer (locked from SO), docDate, actualDeliveryDate, notes.
 * Lines table (useFieldArray): soLineId, itemCode/itemName, description,
 *   quantity (max = openQty in from-SO mode), uom, warehouseId.
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 * NO Audit History button — sales audit endpoint pending T-200.x.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2, Plus } from 'lucide-react';
import axios from 'axios';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
import {
  useDelivery,
  useCreateDeliveryFromSO,
  useUpdateDelivery,
} from '../../hooks/queries/useDeliveries';
import { useSalesOrderV2 } from '../../hooks/queries/useSalesOrders';
import { useAuthStore } from '../../stores/auth.store';
import { SalesItemCombobox } from '../../components/sales/SalesItemCombobox';
import { CompanyCombobox, shouldShowCompanyField } from '../../components/sales/CompanyCombobox';
import type { SalesItemSelection } from '../../components/sales/SalesItemCombobox';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { useCompanies } from '../../hooks/queries/useCompanies';
import type { SalesOrderLine } from '../../services/salesApi';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const lineSchema = z.object({
  soLineId: z.string().min(1, 'Required'),
  soLineNumber: z.coerce.number().int().positive(),
  itemId: z.string().min(1, 'Required'),
  itemCode: z.string().min(1, 'Required'),
  itemName: z.string().min(1, 'Required'),
  description: z.string().optional().nullable(),
  quantity: z.coerce.number().positive('Must be > 0'),
  uom: z.string().min(1, 'Required'),
  warehouseId: z.string().min(1, 'Warehouse is required'),
  costCenterId: z.string().optional().nullable(),
  // Display-only: max quantity allowed (openQty from SO line)
  maxQty: z.coerce.number().optional(),
});

const formSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  customerName: z.string().min(1, 'Customer is required'),
  companyCode: z.string().optional().default(''),
  docDate: z.string().min(1, 'Document date is required'),
  actualDeliveryDate: z.string().min(1, 'Actual delivery date is required'),
  notes: z.string().optional().nullable(),
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
  &:disabled {
    color: ${({ theme }) => theme.colors.muted};
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

const FieldError = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.bright.coral};
`;

const InfoBanner = styled.div`
  background: ${({ theme }) => theme.colors.infoBg};
  border: 1px solid rgba(107, 138, 224, 0.45);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.bright.lapis};
  margin-bottom: 20px;
`;

const LinesHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
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
  padding: 10px;
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

const LineInput = styled.input<{ $error?: boolean }>`
  ${glassControl}
  padding: 7px 8px;
  font-size: 13px;
  width: 100%;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.textPrimary};
  border-color: ${({ $error, theme }) => ($error ? theme.colors.bright.coral : theme.colors.glass.border)};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ $error, theme }) => ($error ? theme.colors.bright.coral : theme.colors.secondary[500])};
    box-shadow: ${({ $error }) => ($error ? 'none' : '0 0 0 3px rgba(220, 185, 79, 0.15)')};
  }
  &:disabled {
    color: ${({ theme }) => theme.colors.muted};
    cursor: not-allowed;
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
`;

const SubmitRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
`;

// Primary CTA — the ONE gold budget item on this page (spec §3/§4).
const PrimaryButton = styled.button`
  padding: 11px 28px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
`;

const SecondaryButton = styled.button`
  ${glassControl}
  padding: 11px 24px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const ErrorBanner = styled.div`
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.bright.coral};
  margin-bottom: 16px;
`;

// Ghost/ancillary button — transparent, celeste text/border (spec §4).
const AddLineButton = styled.button`
  margin-top: 12px;
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

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Derive form mode from URL params.
 * - soDocEntry present  → from-SO mode
 * - docId + /edit path  → edit mode
 * - otherwise           → new mode
 */
export function DeliveryFormPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { soDocEntry, docId } = useParams<{ soDocEntry?: string; docId?: string }>();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';

  const isFromSO = Boolean(soDocEntry);
  const isEdit = Boolean(docId);
  const pageTitle = isFromSO
    ? 'Create Delivery from Sales Order'
    : isEdit
    ? 'Edit Delivery Note'
    : 'New Delivery Note';

  // Companies — for CompanyCombobox
  const { data: companies = [], isLoading: companiesLoading } = useCompanies(orgId);
  const showCompanyField = shouldShowCompanyField(companies, companiesLoading);

  // ── Data fetches ──────────────────────────────────────────────────────────

  // Load the source SO when in from-SO mode
  const {
    data: soData,
    isLoading: soLoading,
    error: soError,
  } = useSalesOrderV2(soDocEntry, orgId);

  // Load the existing DN when in edit mode
  const {
    data: existingDN,
    isLoading: dnLoading,
    error: dnError,
  } = useDelivery(docId, orgId);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createFromSO = useCreateDeliveryFromSO();
  const updateDN = useUpdateDelivery();

  // ── Form setup ────────────────────────────────────────────────────────────

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: '',
      customerName: '',
      companyCode: '',
      docDate: today,
      actualDeliveryDate: today,
      notes: '',
      lines: [],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'lines',
  });

  // ── Pre-fill from SO ──────────────────────────────────────────────────────

  useEffect(() => {
    if (isFromSO && soData) {
      setValue('customerId', soData.customerId);
      setValue('customerName', soData.customerName);
      setValue('companyCode', soData.companyCode);

      // Build delivery lines from SO open lines (openQty > 0)
      const openLines: FormData['lines'] = soData.lines
        .filter((l: SalesOrderLine) => {
          const openQty =
            Number(l.orderedQty) -
            Number(l.deliveredQty ?? 0) -
            Number(l.cancelledQty ?? 0);
          return openQty > 0;
        })
        .map((l: SalesOrderLine) => {
          const openQty =
            Number(l.orderedQty) -
            Number(l.deliveredQty ?? 0) -
            Number(l.cancelledQty ?? 0);
          return {
            soLineId: l.lineId,
            soLineNumber: l.lineNumber,
            itemId: l.itemId,
            itemCode: l.itemCode,
            itemName: l.itemName,
            description: l.description ?? null,
            quantity: openQty,
            uom: l.uom,
            warehouseId: l.warehouseId ?? '',
            costCenterId: l.costCenterId ?? null,
            maxQty: openQty,
          };
        });

      replace(openLines);
    }
  }, [isFromSO, soData, setValue, replace]);

  // ── Pre-fill from existing DN (edit mode) ─────────────────────────────────

  useEffect(() => {
    if (isEdit && existingDN) {
      reset({
        customerId: existingDN.customerId,
        customerName: existingDN.customerName,
        companyCode: existingDN.companyCode,
        docDate: existingDN.docDate,
        actualDeliveryDate: existingDN.actualDeliveryDate,
        notes: existingDN.notes ?? '',
        lines: existingDN.lines.map((l) => ({
          soLineId: l.soLineId,
          soLineNumber: l.soLineNumber,
          itemId: l.itemId,
          itemCode: l.itemCode,
          itemName: l.itemName,
          description: l.description ?? null,
          quantity: l.quantity,
          uom: l.uom,
          warehouseId: l.warehouseId,
          costCenterId: l.costCenterId ?? null,
          maxQty: undefined,
        })),
      });
    }
  }, [isEdit, existingDN, reset]);

  // ── Submit ────────────────────────────────────────────────────────────────

  const [submitError, setSubmitError] = useState('');

  const onSubmit = async (data: FormData) => {
    setSubmitError('');
    try {
      if (isFromSO && soDocEntry) {
        const payload = {
          companyCode: data.companyCode,
          docDate: data.docDate,
          actualDeliveryDate: data.actualDeliveryDate,
          notes: data.notes ?? null,
          lines: data.lines.map((l) => ({
            soLineId: l.soLineId,
            soLineNumber: l.soLineNumber,
            itemId: l.itemId,
            itemCode: l.itemCode,
            itemName: l.itemName,
            description: l.description ?? null,
            quantity: l.quantity,
            uom: l.uom,
            warehouseId: l.warehouseId,
            costCenterId: l.costCenterId ?? null,
          })),
        };
        const dn = await createFromSO.mutateAsync({ soDocEntry, data: payload, orgId });
        navigate(`/sales/deliveries/${dn.docEntry}`);
      } else if (isEdit && docId) {
        await updateDN.mutateAsync({
          docId,
          data: {
            docDate: data.docDate,
            actualDeliveryDate: data.actualDeliveryDate,
            notes: data.notes ?? null,
          },
          orgId,
        });
        navigate(`/sales/deliveries/${docId}`);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        setSubmitError(
          typeof detail === 'string'
            ? detail
            : 'Failed to save delivery. Please check your input.',
        );
      } else {
        setSubmitError('An unexpected error occurred.');
      }
    }
  };

  // ── Loading / error states ────────────────────────────────────────────────

  if (isFromSO && soLoading) return <Container>Loading Sales Order...</Container>;
  if (isFromSO && soError) return <Container style={{ color: theme.colors.error }}>Failed to load Sales Order.</Container>;
  if (isEdit && dnLoading) return <Container>Loading Delivery Note...</Container>;
  if (isEdit && dnError) return <Container style={{ color: theme.colors.error }}>Failed to load Delivery Note.</Container>;

  // ── Render ────────────────────────────────────────────────────────────────

  const watchedLines = watch('lines');
  const isCustomerLocked = isFromSO;

  return (
    <Container>
      <BackLink onClick={() => navigate(-1)}>← Back</BackLink>
      <PageTitle>{pageTitle}</PageTitle>

      {isFromSO && soData && (
        <InfoBanner>
          Creating delivery for Sales Order <strong>{soData.docNumber}</strong>.
          Lines pre-filled with open quantities — you may deliver less than the open qty.
        </InfoBanner>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* ── Header fields ── */}
        <Card>
          <SectionTitle>Header</SectionTitle>
          <Grid $cols={2}>
            <Field>
              <Label>Customer *</Label>
              <Input
                {...register('customerName')}
                disabled={isCustomerLocked}
                $error={Boolean(errors.customerName)}
                placeholder="Customer name"
              />
              {errors.customerName && (
                <FieldError>{errors.customerName.message}</FieldError>
              )}
            </Field>

            {showCompanyField && (
              <Field>
                <Label htmlFor="companyCode">Company Code *</Label>
                <Controller
                  control={control}
                  name="companyCode"
                  render={({ field }) => (
                    <CompanyCombobox
                      value={field.value}
                      onChange={field.onChange}
                      orgId={orgId}
                      hasError={Boolean(errors.companyCode)}
                      describedBy={errors.companyCode ? 'companyCode-error' : undefined}
                    />
                  )}
                />
                {errors.companyCode && (
                  <FieldError id="companyCode-error">{errors.companyCode.message}</FieldError>
                )}
              </Field>
            )}

            <Field>
              <Label>Document Date *</Label>
              <Input
                type="date"
                {...register('docDate')}
                $error={Boolean(errors.docDate)}
              />
              {errors.docDate && (
                <FieldError>{errors.docDate.message}</FieldError>
              )}
            </Field>

            <Field>
              <Label>Actual Delivery Date *</Label>
              <Input
                type="date"
                {...register('actualDeliveryDate')}
                $error={Boolean(errors.actualDeliveryDate)}
              />
              {errors.actualDeliveryDate && (
                <FieldError>{errors.actualDeliveryDate.message}</FieldError>
              )}
            </Field>

            <Field style={{ gridColumn: '1 / -1' }}>
              <Label>Notes</Label>
              <Textarea {...register('notes')} placeholder="Optional notes..." />
            </Field>
          </Grid>
        </Card>

        {/* ── Lines ── */}
        <Card>
          <LinesHeader>
            <SectionTitle style={{ margin: 0 }}>Lines</SectionTitle>
            {!isFromSO && (
              <span style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                Lines are copied from the source SO in from-SO mode
              </span>
            )}
          </LinesHeader>

          {errors.lines && typeof errors.lines === 'object' && 'message' in errors.lines && (
            <FieldError style={{ display: 'block', marginBottom: 12 }}>
              {(errors.lines as { message?: string }).message}
            </FieldError>
          )}

          <LinesTable>
            <Table>
              <thead>
                <tr>
                  <Th style={{ width: 50 }}>#</Th>
                  <Th style={{ minWidth: 200 }}>Item</Th>
                  <Th>Description</Th>
                  <Th style={{ width: 90 }}>Qty</Th>
                  <Th style={{ width: 70 }}>UoM</Th>
                  <Th>Warehouse</Th>
                  {isFromSO && <Th style={{ width: 80 }}>Max Qty</Th>}
                  <Th style={{ width: 40 }}></Th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, idx) => {
                  const maxQty = watchedLines[idx]?.maxQty;
                  return (
                    <tr key={field.id}>
                      <Td>
                        <span style={{ fontSize: 13, color: theme.colors.textDisabled }}>{idx + 1}</span>
                      </Td>
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
                                } else {
                                  field.onChange('');
                                  setValue(`lines.${idx}.itemCode`, '', { shouldValidate: true });
                                  setValue(`lines.${idx}.itemName`, '', { shouldValidate: true });
                                }
                              }}
                              hasError={Boolean(errors.lines?.[idx]?.itemId || errors.lines?.[idx]?.itemCode)}
                              disabled={isFromSO || isSubmitting}
                              placeholder="Search item…"
                            />
                          )}
                        />
                        <input type="hidden" {...register(`lines.${idx}.itemCode`)} />
                        <input type="hidden" {...register(`lines.${idx}.itemName`)} />
                      </Td>
                      <Td>
                        <LineInput
                          {...register(`lines.${idx}.description`)}
                          placeholder="Description"
                        />
                      </Td>
                      <Td>
                        <LineInput
                          type="number"
                          step="0.001"
                          min="0.001"
                          max={maxQty !== undefined ? String(maxQty) : undefined}
                          {...register(`lines.${idx}.quantity`)}
                          $error={Boolean(errors.lines?.[idx]?.quantity)}
                        />
                        {errors.lines?.[idx]?.quantity && (
                          <FieldError style={{ fontSize: 11 }}>
                            {errors.lines[idx]?.quantity?.message}
                          </FieldError>
                        )}
                      </Td>
                      <Td>
                        <LineInput
                          {...register(`lines.${idx}.uom`)}
                          disabled={isFromSO}
                          placeholder="UoM"
                        />
                      </Td>
                      <Td>
                        <LineInput
                          {...register(`lines.${idx}.warehouseId`)}
                          placeholder="Warehouse ID"
                          $error={Boolean(errors.lines?.[idx]?.warehouseId)}
                        />
                        {errors.lines?.[idx]?.warehouseId && (
                          <FieldError style={{ fontSize: 11 }}>Required</FieldError>
                        )}
                      </Td>
                      {isFromSO && (
                        <Td>
                          <span style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                            {maxQty !== undefined
                              ? Number(maxQty).toFixed(3)
                              : '—'}
                          </span>
                        </Td>
                      )}
                      <Td>
                        {!isFromSO && (
                          <DeleteLineBtn
                            type="button"
                            onClick={() => remove(idx)}
                            aria-label="Remove line"
                          >
                            <Trash2 size={15} />
                          </DeleteLineBtn>
                        )}
                      </Td>
                    </tr>
                  );
                })}
                {fields.length === 0 && (
                  <tr>
                    <td colSpan={isFromSO ? 9 : 8} style={{ padding: '20px', textAlign: 'center', color: theme.colors.textDisabled, fontSize: 14 }}>
                      {isFromSO
                        ? 'No open lines found on the source Sales Order.'
                        : 'No lines added yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </LinesTable>

          {!isFromSO && (
            <AddLineButton
              type="button"
              onClick={() =>
                append({
                  soLineId: '',
                  soLineNumber: fields.length + 1,
                  itemId: '',
                  itemCode: '',
                  itemName: '',
                  description: null,
                  quantity: 1,
                  uom: 'EA',
                  warehouseId: '',
                  costCenterId: null,
                  maxQty: undefined,
                })
              }
            >
              <Plus size={14} /> Add Line
            </AddLineButton>
          )}
        </Card>

        {/* ── Attachments (edit mode only — DN must exist first) ── */}
        {isEdit && docId && (
          <Card>
            <SectionTitle>Attachments</SectionTitle>
            <AttachmentList docId={docId} docType="DELIVERY" />
          </Card>
        )}

        {/* ── Submit ── */}
        {submitError && <ErrorBanner>{submitError}</ErrorBanner>}

        <SubmitRow>
          <SecondaryButton type="button" onClick={() => navigate(-1)}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Delivery Note'}
          </PrimaryButton>
        </SubmitRow>
      </form>
    </Container>
  );
}

export default DeliveryFormPage;
