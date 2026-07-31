/**
 * ReturnFormPage — Wave 3 (T-200.7)
 *
 * Four modes via URL params:
 *   /sales/returns-v2/new                              → blank form (very rare)
 *   /sales/returns-v2/from-rr/:rrDocEntry             → pre-fill from Return Request (primary RMA path)
 *   /sales/returns-v2/from-delivery/:dnDocEntry        → pre-fill from Delivery (skip-RMA path)
 *   /sales/returns-v2/:docId/edit                      → edit DRAFT RTN
 *
 * From-RR mode (primary RMA-gated path):
 *   Fetches the source RR (via useReturnRequest), pre-fills customer + lines.
 *   Each line default quantity = (requestedQty - consumedQty) — the remaining authorised qty.
 *   User can reduce; NOT increase (capped at remaining).
 *   Submits to POST /returns-v2/from-request/:rrDocEntry via createReturnFromRR.
 *
 * From-Delivery mode (skip-RMA / trusted-customer path):
 *   Fetches the source Delivery (via useDelivery), pre-fills customer + all posted lines.
 *   Each line default quantity = (quantity - (returnedQty ?? 0)) — the un-returned qty.
 *   User can reduce; NOT increase.
 *   No dedicated backend endpoint — submits to POST /returns-v2 with DN as baseDocRef
 *   via createReturnFromDelivery (client-side approach, same as T-200.6 did for RR).
 *
 * Header fields: customer (locked in from-X modes), docDate, actualReturnDate
 *   (when goods physically arrived — defaults to docDate), notes.
 * Lines table (useFieldArray): itemCode, itemName, description, returnedQty,
 *   uom, warehouseId, optional reason override.
 *
 * Modals do NOT close on overlay click — X button only (project rule).
 * NO Audit History button — sales audit endpoint pending T-200.x.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2, Plus } from 'lucide-react';
import axios from 'axios';
import { glassPanel, glassControl, monoLabel } from '@a64core/shared';
import { useReturn, useCreateReturnFromRR, useCreateReturnFromDelivery, useCreateReturn, useUpdateReturn } from '../../hooks/queries/useReturns';
import { useReturnRequest } from '../../hooks/queries/useReturnRequests';
import { useDelivery } from '../../hooks/queries/useDeliveries';
import { useAuthStore } from '../../stores/auth.store';
import { SalesItemCombobox } from '../../components/sales/SalesItemCombobox';
import { CompanyCombobox, shouldShowCompanyField } from '../../components/sales/CompanyCombobox';
import type { SalesItemSelection } from '../../components/sales/SalesItemCombobox';
import { AttachmentList } from '../../components/attachments/AttachmentList';
import { useCompanies } from '../../hooks/queries/useCompanies';
import type { ReturnRequestLine, DeliveryLine } from '../../services/salesApi';

// ─── Zod schema ───────────────────────────────────────────────────────────────

const lineSchema = z.object({
  itemId: z.string().min(1, 'Required'),
  itemCode: z.string().min(1, 'Required'),
  itemName: z.string().min(1, 'Required'),
  description: z.string().optional().nullable(),
  returnedQty: z.coerce.number().positive('Must be > 0'),
  uom: z.string().min(1, 'Required'),
  warehouseId: z.string().min(1, 'Warehouse is required'),
  unitPrice: z.coerce.number().min(0, 'Must be ≥ 0').default(0),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  taxCodeId: z.string().optional().nullable(),
  costCenterId: z.string().optional().nullable(),
  // Source line reference (required on every line)
  baseDocRefDocType: z.string().min(1),
  baseDocRefDocId: z.string().min(1),
  baseDocRefDocNumber: z.string().min(1),
  baseDocRefLineId: z.string().optional().nullable(),
  // Display-only: max qty (remaining from source)
  maxQty: z.coerce.number().optional(),
});

const formSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  customerName: z.string().min(1, 'Customer is required'),
  companyCode: z.string().optional().default(''),
  docDate: z.string().min(1, 'Document date is required'),
  actualReturnDate: z.string().min(1, 'Actual return date is required'),
  notes: z.string().max(1000).optional().nullable(),
  // Header-level base doc ref (for from-DN mode — RR mode uses the rr_doc_entry URL param)
  baseDocRefDocType: z.string().optional().nullable(),
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
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 20px;
  &:hover { text-decoration: underline; color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 4px;
`;

const Subtitle = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.celeste};
  margin: 0 0 28px;
`;

const Card = styled.div`
  ${glassPanel}
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
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;

const Input = styled.input<{ $hasError?: boolean }>`
  ${glassControl}
  padding: 9px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  width: 100%;
  box-sizing: border-box;
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.bright.coral : theme.colors.glass.border)};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.secondary[500]}; box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15); }
  &:disabled { color: ${({ theme }) => theme.colors.muted}; }
`;

const Textarea = styled.textarea`
  ${glassControl}
  padding: 9px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 80px;
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.secondary[500]}; box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15); }
`;

const ErrorMsg = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.bright.coral};
`;

const LinesTable = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  ${monoLabel}
  padding: 9px 10px;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  text-align: left;
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 8px 10px;
  font-size: 13px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SmallInput = styled.input<{ $hasError?: boolean; $width?: string }>`
  ${glassControl}
  padding: 7px 9px;
  font-size: 13px;
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  color: ${({ theme }) => theme.colors.textPrimary};
  width: ${({ $width }) => $width ?? '100%'};
  box-sizing: border-box;
  border-color: ${({ $hasError, theme }) => ($hasError ? theme.colors.bright.coral : theme.colors.glass.border)};
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.secondary[500]}; box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15); }
  &:disabled { color: ${({ theme }) => theme.colors.muted}; }
`;

const MaxQtyHint = styled.span`
  display: block;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 2px;
`;

// Destructive — coral-b tinted glass, never solid red (spec §4).
const RemoveBtn = styled.button`
  background: rgba(240, 138, 112, 0.16);
  border: 1px solid rgba(240, 138, 112, 0.45);
  color: ${({ theme }) => theme.colors.bright.coral};
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 150ms ease;
  &:hover { background: rgba(240, 138, 112, 0.26); }
`;

// Ghost/ancillary button — transparent, celeste text/border (spec §4).
const AddLineBtn = styled.button`
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 8px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms ease;
  &:hover { background: rgba(180, 200, 220, 0.07); color: ${({ theme }) => theme.colors.textPrimary}; }
`;

const FooterActions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
`;

// Primary CTA — the ONE gold budget item on this page (spec §3/§4).
const SubmitButton = styled.button`
  padding: 10px 28px;
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

const CancelButton = styled.button`
  ${glassControl}
  padding: 10px 22px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.glass.hi}; }
`;

const ErrorBanner = styled.div`
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 14px;
  margin-bottom: 16px;
`;

const InfoBanner = styled.div`
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.infoBg};
  border: 1px solid rgba(107, 138, 224, 0.45);
  border-radius: 8px;
  color: ${({ theme }) => theme.colors.bright.lapis};
  font-size: 14px;
  margin-bottom: 20px;
`;

const LockedValue = styled.div`
  ${glassControl}
  padding: 9px 12px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`;

// ─── Component ────────────────────────────────────────────────────────────────

export function ReturnFormPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { rrDocEntry, dnDocEntry, docId } = useParams<{
    rrDocEntry?: string;
    dnDocEntry?: string;
    docId?: string;
  }>();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.organizationId ?? '';

  const today = new Date().toISOString().slice(0, 10);

  // ─── Mode detection ───────────────────────────────────────────────────────

  const isFromRR = Boolean(rrDocEntry);
  const isFromDN = Boolean(dnDocEntry);
  const isEdit = Boolean(docId);

  // Companies — for CompanyCombobox
  const { data: companies = [], isLoading: companiesLoading } = useCompanies(orgId);
  const showCompanyField = shouldShowCompanyField(companies, companiesLoading);

  // ─── Source doc fetches ───────────────────────────────────────────────────

  const { data: rr, isLoading: rrLoading } = useReturnRequest(rrDocEntry, orgId);
  const { data: dn, isLoading: dnLoading } = useDelivery(dnDocEntry, orgId);
  const { data: existingRtn, isLoading: rtnLoading } = useReturn(docId, orgId);

  // ─── Mutation hooks ───────────────────────────────────────────────────────

  const createFromRR = useCreateReturnFromRR();
  const createFromDN = useCreateReturnFromDelivery();
  const createBlank = useCreateReturn();
  const updateRtn = useUpdateReturn();

  const [submitError, setSubmitError] = useState('');
  const [prefilled, setPrefilled] = useState(false);

  // ─── React Hook Form ──────────────────────────────────────────────────────

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyCode: '',
      docDate: today,
      actualReturnDate: today,
      lines: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  // ─── Pre-fill from Return Request ─────────────────────────────────────────

  useEffect(() => {
    if (!rr || prefilled) return;
    setPrefilled(true);

    setValue('customerId', rr.customerId);
    setValue('customerName', rr.customerName);
    setValue('companyCode', rr.companyCode ?? '');
    setValue('docDate', today);
    setValue('actualReturnDate', today);

    // Build lines from RR lines; default qty = requestedQty - consumedQty (remaining)
    const newLines = rr.lines.map((l: ReturnRequestLine) => {
      const remaining = Number(l.requestedQty) - Number(l.consumedQty ?? 0);
      return {
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        description: l.description ?? null,
        returnedQty: Math.max(0, remaining),
        uom: l.uom,
        warehouseId: l.warehouseId ?? '',
        unitPrice: Number(l.unitPrice) || 0,
        discountPercent: Number(l.discountPercent) || 0,
        taxPercent: Number(l.taxPercent) || 0,
        taxCodeId: l.taxCodeId ?? null,
        costCenterId: l.costCenterId ?? null,
        baseDocRefDocType: 'RR',
        baseDocRefDocId: rr.docEntry,
        baseDocRefDocNumber: rr.docNumber,
        baseDocRefLineId: l.lineId,
        maxQty: Math.max(0, remaining),
      };
    }).filter((l) => l.maxQty > 0); // only lines with remaining qty

    if (newLines.length > 0) {
      // Replace all fields
      newLines.forEach((l) => append(l));
    }
  }, [rr, prefilled, setValue, append, today]);

  // ─── Pre-fill from Delivery ───────────────────────────────────────────────

  useEffect(() => {
    if (!dn || prefilled) return;
    setPrefilled(true);

    setValue('customerId', dn.customerId);
    setValue('customerName', dn.customerName);
    setValue('companyCode', dn.companyCode ?? '');
    setValue('docDate', today);
    setValue('actualReturnDate', today);
    setValue('baseDocRefDocType', 'DELIVERY');
    setValue('baseDocRefDocId', dn.docEntry);
    setValue('baseDocRefDocNumber', dn.docNumber);

    // Build lines from Delivery lines; default qty = quantity - (returnedQty ?? 0)
    const newLines = dn.lines.map((l: DeliveryLine) => {
      const alreadyReturned = Number(l.returnedQty ?? 0);
      const available = Number(l.quantity) - alreadyReturned;
      return {
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        description: l.description ?? null,
        returnedQty: Math.max(0, available),
        uom: l.uom,
        warehouseId: l.warehouseId ?? '',
        unitPrice: 0, // Delivery lines don't carry price — will be validated by backend via DN
        discountPercent: 0,
        taxPercent: 0,
        taxCodeId: null,
        costCenterId: l.costCenterId ?? null,
        baseDocRefDocType: 'DELIVERY',
        baseDocRefDocId: dn.docEntry,
        baseDocRefDocNumber: dn.docNumber,
        baseDocRefLineId: l.lineId,
        maxQty: Math.max(0, available),
      };
    }).filter((l) => l.maxQty > 0);

    if (newLines.length > 0) {
      newLines.forEach((l) => append(l));
    }
  }, [dn, prefilled, setValue, append, today]);

  // ─── Pre-fill from existing RTN (edit mode) ───────────────────────────────

  useEffect(() => {
    if (!existingRtn || prefilled) return;
    setPrefilled(true);

    setValue('customerId', existingRtn.customerId);
    setValue('customerName', existingRtn.customerName);
    setValue('companyCode', existingRtn.companyCode ?? '');
    setValue('docDate', existingRtn.docDate);
    setValue('actualReturnDate', existingRtn.actualReturnDate);
    setValue('notes', existingRtn.notes ?? null);
    if (existingRtn.baseDocRef) {
      const ref = existingRtn.baseDocRef as Record<string, string>;
      setValue('baseDocRefDocType', ref.docType ?? '');
      setValue('baseDocRefDocId', ref.docId ?? '');
      setValue('baseDocRefDocNumber', ref.docNumber ?? '');
    }

    existingRtn.lines.forEach((l) => {
      append({
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        description: l.description ?? null,
        returnedQty: Number(l.returnedQty),
        uom: l.uom,
        warehouseId: l.warehouseId ?? '',
        unitPrice: Number(l.unitPrice) || 0,
        discountPercent: Number(l.discountPercent) || 0,
        taxPercent: Number(l.taxPercent) || 0,
        taxCodeId: l.taxCodeId ?? null,
        costCenterId: l.costCenterId ?? null,
        baseDocRefDocType: (l.baseDocRef as Record<string, string> | null)?.docType ?? 'DELIVERY',
        baseDocRefDocId: (l.baseDocRef as Record<string, string> | null)?.docId ?? '',
        baseDocRefDocNumber: (l.baseDocRef as Record<string, string> | null)?.docNumber ?? '',
        baseDocRefLineId: (l.baseDocRef as Record<string, string> | null)?.lineId ?? null,
        maxQty: undefined,
      });
    });
  }, [existingRtn, prefilled, setValue, append]);

  // ─── Submit ───────────────────────────────────────────────────────────────

  const onSubmit = async (data: FormData) => {
    setSubmitError('');
    try {
      const lines = data.lines.map((l) => ({
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        description: l.description ?? null,
        returnedQty: l.returnedQty,
        uom: l.uom,
        warehouseId: l.warehouseId,
        unitPrice: l.unitPrice ?? 0,
        discountPercent: l.discountPercent ?? 0,
        taxCodeId: l.taxCodeId ?? null,
        taxPercent: l.taxPercent ?? 0,
        costCenterId: l.costCenterId ?? null,
        baseDocRef: {
          docType: l.baseDocRefDocType,
          docId: l.baseDocRefDocId,
          docNumber: l.baseDocRefDocNumber,
          lineId: l.baseDocRefLineId ?? null,
        },
      }));

      if (isFromRR && rrDocEntry) {
        const result = await createFromRR.mutateAsync({
          rrDocEntry,
          data: {
            companyCode: data.companyCode ?? '',
            docDate: data.docDate,
            actualReturnDate: data.actualReturnDate,
            notes: data.notes ?? null,
            lines,
          },
          orgId,
        });
        navigate(`/sales/returns-v2/${result.docEntry}`);
      } else if (isFromDN) {
        const result = await createFromDN.mutateAsync({
          data: {
            companyCode: data.companyCode ?? '',
            customerId: data.customerId,
            customerName: data.customerName,
            docDate: data.docDate,
            actualReturnDate: data.actualReturnDate,
            baseDocRef: {
              docType: data.baseDocRefDocType ?? 'DELIVERY',
              docId: data.baseDocRefDocId ?? dnDocEntry ?? '',
              docNumber: data.baseDocRefDocNumber ?? '',
              lineId: null,
            },
            notes: data.notes ?? null,
            lines,
          },
          orgId,
        });
        navigate(`/sales/returns-v2/${result.docEntry}`);
      } else if (isEdit && docId) {
        const result = await updateRtn.mutateAsync({
          docId,
          data: {
            docDate: data.docDate,
            actualReturnDate: data.actualReturnDate,
            notes: data.notes ?? null,
            lines,
          },
          orgId,
        });
        navigate(`/sales/returns-v2/${result.docEntry}`);
      } else {
        // Blank form — new manual RTN (very rare)
        const result = await createBlank.mutateAsync({
          data: {
            companyCode: data.companyCode ?? '',
            customerId: data.customerId,
            customerName: data.customerName,
            docDate: data.docDate,
            actualReturnDate: data.actualReturnDate,
            baseDocRef: {
              docType: data.baseDocRefDocType ?? 'DELIVERY',
              docId: data.baseDocRefDocId ?? '',
              docNumber: data.baseDocRefDocNumber ?? '',
              lineId: null,
            },
            notes: data.notes ?? null,
            lines,
          },
          orgId,
        });
        navigate(`/sales/returns-v2/${result.docEntry}`);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        setSubmitError(typeof detail === 'string' ? detail : JSON.stringify(detail));
      } else {
        setSubmitError('An unexpected error occurred. Please try again.');
      }
    }
  };

  // ─── Loading states ───────────────────────────────────────────────────────

  const sourceLoading = (isFromRR && rrLoading) || (isFromDN && dnLoading) || (isEdit && rtnLoading);

  if (sourceLoading) {
    return <Container><p style={{ color: theme.colors.textSecondary }}>Loading...</p></Container>;
  }

  if (isFromRR && !rr) {
    return <Container><p style={{ color: theme.colors.error }}>Return Request not found.</p></Container>;
  }
  if (isFromDN && !dn) {
    return <Container><p style={{ color: theme.colors.error }}>Delivery Note not found.</p></Container>;
  }
  if (isEdit && !existingRtn) {
    return <Container><p style={{ color: theme.colors.error }}>Return Note not found.</p></Container>;
  }

  // ─── Derive page title and subtitle ──────────────────────────────────────

  let pageTitle = 'New Return Note';
  let pageSubtitle = 'Create a Return Note to record goods received back into inventory.';
  if (isFromRR && rr) {
    pageTitle = `Return Note — from ${rr.docNumber}`;
    pageSubtitle = `RMA-gated path: returning goods authorised by ${rr.docNumber}. Qty is capped at the RR remaining authorised quantity.`;
  } else if (isFromDN && dn) {
    pageTitle = `Return Note — from ${dn.docNumber}`;
    pageSubtitle = `Skip-RMA path: recording a direct return from Delivery ${dn.docNumber} (trusted customer).`;
  } else if (isEdit && existingRtn) {
    pageTitle = `Edit Return Note ${existingRtn.docNumber}`;
    pageSubtitle = 'Only DRAFT Return Notes can be edited.';
  }

  const customerLocked = isFromRR || isFromDN;
  const watchedCustomerName = watch('customerName');

  return (
    <Container>
      <BackLink onClick={() => navigate('/sales/returns-v2')}>← Return Notes</BackLink>
      <Title>{pageTitle}</Title>
      <Subtitle>{pageSubtitle}</Subtitle>

      {isFromRR && (
        <InfoBanner>
          Pre-filled from Return Request {rr?.docNumber}. Line quantities default to the remaining
          authorised quantity (requestedQty − consumedQty). You may reduce but not increase them.
        </InfoBanner>
      )}
      {isFromDN && (
        <InfoBanner>
          Pre-filled from Delivery {dn?.docNumber}. Line quantities default to the un-returned
          quantity (deliveredQty − already returnedQty). You may reduce but not increase them.
        </InfoBanner>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* ─ Header section ─────────────────────────────────────────────── */}
        <Card>
          <SectionTitle>Header</SectionTitle>
          <FormGrid>
            {/* Customer */}
            <Field>
              <Label htmlFor="rtn-customer">Customer</Label>
              {customerLocked ? (
                <LockedValue>{watchedCustomerName}</LockedValue>
              ) : (
                <Input
                  id="rtn-customer"
                  {...register('customerName')}
                  $hasError={Boolean(errors.customerName)}
                  placeholder="Customer name"
                />
              )}
              {errors.customerName && <ErrorMsg>{errors.customerName.message}</ErrorMsg>}
              <input type="hidden" {...register('customerId')} />
            </Field>

            {/* Company Code — hidden for single-company orgs, picker for multi */}
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
                      disabled={customerLocked}
                      hasError={Boolean(errors.companyCode)}
                      describedBy={errors.companyCode ? 'companyCode-error' : undefined}
                    />
                  )}
                />
                {errors.companyCode && (
                  <ErrorMsg id="companyCode-error">{errors.companyCode.message}</ErrorMsg>
                )}
              </Field>
            )}

            {/* Doc Date */}
            <Field>
              <Label htmlFor="rtn-doc-date">Document Date</Label>
              <Input
                id="rtn-doc-date"
                type="date"
                {...register('docDate')}
                $hasError={Boolean(errors.docDate)}
              />
              {errors.docDate && <ErrorMsg>{errors.docDate.message}</ErrorMsg>}
            </Field>

            {/* Actual Return Date */}
            <Field>
              <Label htmlFor="rtn-actual-date">Actual Return Date</Label>
              <Input
                id="rtn-actual-date"
                type="date"
                {...register('actualReturnDate')}
                $hasError={Boolean(errors.actualReturnDate)}
              />
              {errors.actualReturnDate && <ErrorMsg>{errors.actualReturnDate.message}</ErrorMsg>}
            </Field>

            {/* Notes */}
            <Field style={{ gridColumn: '1 / -1' }}>
              <Label htmlFor="rtn-notes">Notes</Label>
              <Textarea id="rtn-notes" {...register('notes')} placeholder="Internal notes (optional)" />
            </Field>
          </FormGrid>
        </Card>

        {/* ─ Lines section ──────────────────────────────────────────────── */}
        <Card>
          <SectionTitle>Lines</SectionTitle>
          {errors.lines?.root && (
            <ErrorBanner>{errors.lines.root.message}</ErrorBanner>
          )}

          <LinesTable>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Item</Th>
                <Th>Description</Th>
                <Th>Qty</Th>
                <Th>UOM</Th>
                <Th>Warehouse</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, idx) => {
                const lineErrors = errors.lines?.[idx];
                const maxQty = field.maxQty;
                return (
                  <tr key={field.id}>
                    <Td style={{ width: 32, color: theme.colors.textDisabled }}>{idx + 1}</Td>
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
                            hasError={Boolean(lineErrors?.itemId || lineErrors?.itemCode)}
                            disabled={isFromRR || isFromDN || isSubmitting}
                            placeholder="Search item…"
                          />
                        )}
                      />
                      <input type="hidden" {...register(`lines.${idx}.itemCode`)} />
                      <input type="hidden" {...register(`lines.${idx}.itemName`)} />
                      <input type="hidden" {...register(`lines.${idx}.baseDocRefDocType`)} />
                      <input type="hidden" {...register(`lines.${idx}.baseDocRefDocId`)} />
                      <input type="hidden" {...register(`lines.${idx}.baseDocRefDocNumber`)} />
                      <input type="hidden" {...register(`lines.${idx}.baseDocRefLineId`)} />
                      <input type="hidden" {...register(`lines.${idx}.unitPrice`)} />
                      <input type="hidden" {...register(`lines.${idx}.taxCodeId`)} />
                      <input type="hidden" {...register(`lines.${idx}.taxPercent`)} />
                      {lineErrors?.itemCode && <ErrorMsg>{lineErrors.itemCode.message}</ErrorMsg>}
                    </Td>
                    <Td>
                      <SmallInput
                        {...register(`lines.${idx}.description`)}
                        placeholder="Description"
                        $width="200px"
                      />
                    </Td>
                    <Td>
                      <SmallInput
                        {...register(`lines.${idx}.returnedQty`)}
                        type="number"
                        step="0.001"
                        min="0.001"
                        max={maxQty}
                        $hasError={Boolean(lineErrors?.returnedQty)}
                        $width="80px"
                      />
                      {maxQty !== undefined && (
                        <MaxQtyHint>max {maxQty.toLocaleString('en-AE', { maximumFractionDigits: 3 })}</MaxQtyHint>
                      )}
                      {lineErrors?.returnedQty && <ErrorMsg>{lineErrors.returnedQty.message}</ErrorMsg>}
                    </Td>
                    <Td>
                      <SmallInput
                        {...register(`lines.${idx}.uom`)}
                        $hasError={Boolean(lineErrors?.uom)}
                        $width="60px"
                        placeholder="UOM"
                        disabled={isFromRR || isFromDN}
                      />
                    </Td>
                    <Td>
                      <SmallInput
                        {...register(`lines.${idx}.warehouseId`)}
                        $hasError={Boolean(lineErrors?.warehouseId)}
                        $width="120px"
                        placeholder="Warehouse ID"
                      />
                      {lineErrors?.warehouseId && <ErrorMsg>{lineErrors.warehouseId.message}</ErrorMsg>}
                    </Td>
                    <Td>
                      {(!isFromRR && !isFromDN) && (
                        <RemoveBtn
                          type="button"
                          onClick={() => remove(idx)}
                          aria-label={`Remove line ${idx + 1}`}
                        >
                          <Trash2 size={15} />
                        </RemoveBtn>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </LinesTable>

          {(!isFromRR && !isFromDN) && (
            <AddLineBtn
              type="button"
              onClick={() =>
                append({
                  itemId: '',
                  itemCode: '',
                  itemName: '',
                  description: null,
                  returnedQty: 1,
                  uom: 'EA',
                  warehouseId: '',
                  unitPrice: 0,
                  discountPercent: 0,
                  taxPercent: 0,
                  taxCodeId: null,
                  costCenterId: null,
                  baseDocRefDocType: 'DELIVERY',
                  baseDocRefDocId: '',
                  baseDocRefDocNumber: '',
                  baseDocRefLineId: null,
                })
              }
            >
              <Plus size={14} /> Add Line
            </AddLineBtn>
          )}
        </Card>

        {/* ─ Attachments ────────────────────────────────────────────────── */}
        {isEdit && docId && (
          <Card>
            <SectionTitle>Attachments</SectionTitle>
            <AttachmentList docType="RETURN" docId={docId} />
          </Card>
        )}

        {/* ─ Footer actions ─────────────────────────────────────────────── */}
        {submitError && <ErrorBanner>{submitError}</ErrorBanner>}
        <FooterActions>
          <CancelButton type="button" onClick={() => navigate('/sales/returns-v2')}>
            Cancel
          </CancelButton>
          <SubmitButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Return Note (Draft)'}
          </SubmitButton>
        </FooterActions>
      </form>
    </Container>
  );
}
