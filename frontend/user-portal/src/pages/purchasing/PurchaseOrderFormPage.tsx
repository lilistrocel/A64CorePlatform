/**
 * PurchaseOrderFormPage
 *
 * Create or edit a Purchase Order.
 * Routes:
 *   /purchasing/po/new              — create manual PO
 *   /purchasing/po/:docId/edit      — edit Draft PO
 *   /purchasing/po/from-pr/:prDocId — create PO from approved PR
 *
 * Modals do NOT close on overlay click — X button only.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import {
  useCreatePurchaseOrder,
  useUpdatePurchaseOrder,
  useConvertPRToPO,
  usePurchaseOrder,
  usePurchaseRequest,
  usePurchaseItems,
  useVendors,
  usePaymentTerms,
} from '../../hooks/queries/usePurchasing';
import { useTaxCodes } from '../../hooks/queries/useTaxCodes';
import { FALLBACK_TAX_CODES } from '../../services/taxCodesService';
import { useAuthStore } from '../../stores/auth.store';
import type { DocumentLineCreate } from '../../services/purchasingApi';

// ─── Styled components (same pattern as PurchaseRequestFormPage) ──────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1100px;
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
  font-size: 26px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 24px;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 12px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: 24px 28px;
  margin-bottom: 20px;
`;

const CardTitle = styled.h2`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 16px;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Input = styled.input`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[500]}; }
`;

const Select = styled.select`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[500]}; }
`;

const Textarea = styled.textarea`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textPrimary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary[500]}; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  padding: 10px 8px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.neutral[50]};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const Td = styled.td`
  padding: 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[100]};
  vertical-align: top;
`;

const FooterRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
`;

const PrimaryButton = styled.button`
  padding: 10px 24px;
  background: ${({ theme }) => theme.colors.primary[500]};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.primary[700]}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const GhostButton = styled.button`
  padding: 10px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral[100]}; }
`;

const DangerIconButton = styled.button`
  padding: 6px 10px;
  background: transparent;
  color: ${({ theme }) => theme.colors.error || '#ef4444'};
  border: 1px solid ${({ theme }) => theme.colors.error || '#ef4444'};
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.errorBg || '#fef2f2'}; }
`;

const AddLineButton = styled.button`
  padding: 8px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.primary[600] || '#2563eb'};
  border: 1px dashed ${({ theme }) => theme.colors.primary[400] || '#60a5fa'};
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  width: 100%;
  margin-top: 8px;
  &:hover { background: ${({ theme }) => theme.colors.primary[50] || '#eff6ff'}; }
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.error || '#ef4444'};
  font-size: 13px;
  margin: 8px 0 0;
`;

// ─── Empty line factory ───────────────────────────────────────────────────────

interface LineFormState extends DocumentLineCreate {
  _key: string;
}

function emptyLine(): LineFormState {
  return {
    _key: Math.random().toString(36).slice(2),
    itemId: '',
    uom: 'KG',
    quantity: 1,
    unitPrice: 0,
    taxCode: 'S',
    description: null,
    warehouseId: null,
    requestedVendorId: null,
    notes: null,
  };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PurchaseOrderFormPage() {
  // Detect mode from URL — /from-pr/:prDocId or /new or /:docId/edit
  const params = useParams<{ docId?: string; prDocId?: string }>();
  const docId = params.docId;
  const prDocId = params.prDocId;
  const isFromPR = !!prDocId;
  const isEdit = !!docId && !isFromPR;

  const navigate = useNavigate();
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? '';

  // Fetch existing PO for edit
  const { data: existingPO } = usePurchaseOrder(isEdit ? docId : undefined, orgId);
  // Fetch source PR when creating from PR
  const { data: sourcePR } = usePurchaseRequest(isFromPR ? prDocId : undefined, orgId);

  const { data: itemsData } = usePurchaseItems({ organizationId: orgId, isActive: true, perPage: 200 });
  const itemsList = itemsData?.data ?? [];

  const { data: vendorsData } = useVendors({ organizationId: orgId, isActive: true, perPage: 200 });
  const vendorsList = vendorsData?.data ?? [];

  const { data: rawPaymentTerms } = usePaymentTerms({ organizationId: orgId, isActive: true });
  const paymentTermsList = Array.isArray(rawPaymentTerms) ? rawPaymentTerms : [];

  // Fetch tax codes from finance service; fall back to seeded codes on error
  const { data: taxCodesData, isLoading: taxCodesLoading, isError: taxCodesError } = useTaxCodes(orgId || null);
  const activeTaxCodes = useMemo(() => {
    if (taxCodesError) {
      console.warn('[PurchaseOrderFormPage] Failed to load tax codes from API; using fallback list.');
      return FALLBACK_TAX_CODES.filter((c) => c.isActive);
    }
    return (taxCodesData ?? []).filter((c) => c.isActive);
  }, [taxCodesData, taxCodesError]);

  const createMutation = useCreatePurchaseOrder();
  const updateMutation = useUpdatePurchaseOrder();
  const convertMutation = useConvertPRToPO();

  const [vendorId, setVendorId] = useState('');
  const [paymentTermsCode, setPaymentTermsCode] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineFormState[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  // Populate form from existing PO (edit mode)
  useEffect(() => {
    if (existingPO && isEdit) {
      setVendorId(existingPO.vendorId ?? '');
      setPaymentTermsCode(existingPO.paymentTermsCode ?? '');
      setExpectedDeliveryDate(existingPO.expectedDeliveryDate?.split('T')[0] ?? '');
      setNotes(existingPO.notes ?? '');
      if (existingPO.lines.length > 0) {
        setLines(existingPO.lines.map((l) => ({
          _key: l.lineId,
          itemId: l.itemId,
          description: l.description,
          uom: l.uom,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxCode: l.taxCode,
          warehouseId: l.warehouseId,
          requestedVendorId: l.requestedVendorId,
          notes: l.notes,
        })));
      }
    }
  }, [existingPO, isEdit]);

  // Pre-fill lines from source PR (from-pr mode)
  useEffect(() => {
    if (sourcePR && isFromPR && sourcePR.lines.length > 0) {
      setLines(sourcePR.lines.map((l) => ({
        _key: l.lineId,
        itemId: l.itemId,
        description: l.description,
        uom: l.uom,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxCode: l.taxCode ?? 'S',
        warehouseId: l.warehouseId,
        requestedVendorId: null,
        notes: l.notes,
      })));
    }
  }, [sourcePR, isFromPR]);

  const setLine = (key: string, field: keyof LineFormState, value: any) =>
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, [field]: value } : l)));

  const removeLine = (key: string) =>
    setLines((prev) => prev.filter((l) => l._key !== key));

  const isReadOnly = isEdit && existingPO && existingPO.status !== 'Draft';

  const handleSubmit = async () => {
    setError(null);

    if (!vendorId) {
      setError('Vendor is required for Purchase Orders.');
      return;
    }

    const validLines = lines.filter((l) => l.itemId);
    if (validLines.length === 0) {
      setError('At least one line with an item is required.');
      return;
    }

    const linePayload = validLines.map((l) => ({
      itemId: l.itemId,
      description: l.description || null,
      uom: l.uom,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      taxCode: l.taxCode || null,
      warehouseId: l.warehouseId || null,
      notes: l.notes || null,
    }));

    try {
      if (isFromPR) {
        // Create PO from PR — lines come from the PR, we only need vendor/terms
        const created = await convertMutation.mutateAsync({
          prDocId: prDocId!,
          data: {
            vendorId,
            paymentTermsCode: paymentTermsCode || null,
            expectedDeliveryDate: expectedDeliveryDate || null,
            notes: notes || null,
          },
          organizationId: orgId,
        });
        navigate(`/purchasing/po/${created.docId}`);
      } else if (isEdit) {
        await updateMutation.mutateAsync({
          docId: docId!,
          data: {
            vendorId: vendorId || undefined,
            paymentTermsCode: paymentTermsCode || null,
            expectedDeliveryDate: expectedDeliveryDate || null,
            notes: notes || null,
            lines: linePayload,
          },
          organizationId: orgId,
        });
        navigate(`/purchasing/po/${docId}`);
      } else {
        const created = await createMutation.mutateAsync({
          data: {
            vendorId,
            paymentTermsCode: paymentTermsCode || null,
            expectedDeliveryDate: expectedDeliveryDate || null,
            notes: notes || null,
            lines: linePayload,
          },
          organizationId: orgId,
        });
        navigate(`/purchasing/po/${created.docId}`);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? err?.message ?? 'Failed to save.');
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending || convertMutation.isPending;

  const pageTitle = isFromPR
    ? `New PO from ${sourcePR?.docNumber ?? 'PR'}`
    : isEdit
    ? 'Edit Purchase Order'
    : 'New Purchase Order';

  return (
    <Container>
      <BackLink onClick={() => {
        if (isFromPR) navigate(`/purchasing/pr/${prDocId}`);
        else if (isEdit) navigate(`/purchasing/po/${docId}`);
        else navigate('/purchasing/po');
      }}>
        &larr; Back
      </BackLink>
      <Title>{pageTitle}</Title>

      {isReadOnly && (
        <Card style={{ borderLeft: '4px solid #f59e0b', padding: '12px 20px', marginBottom: 16 }}>
          <p style={{ margin: 0, color: '#92400e', fontSize: 14 }}>
            This PO is in <strong>{existingPO?.status}</strong> status and cannot be edited.
          </p>
        </Card>
      )}

      {/* Header */}
      <Card>
        <CardTitle>PO Header</CardTitle>
        <FormRow>
          <Field>
            <Label>Vendor *</Label>
            <Select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              disabled={isReadOnly}
            >
              <option value="">— Select Vendor —</option>
              {vendorsList.map((v) => (
                <option key={v.vendorId} value={v.vendorId}>
                  {v.vendorCode} — {v.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>Payment Terms</Label>
            <Select
              value={paymentTermsCode}
              onChange={(e) => setPaymentTermsCode(e.target.value)}
              disabled={isReadOnly}
            >
              <option value="">— Select Terms —</option>
              {paymentTermsList.map((t) => (
                <option key={t.termsId} value={t.termsCode}>
                  {t.termsCode} — {t.description} ({t.netDays} days)
                </option>
              ))}
            </Select>
          </Field>
        </FormRow>
        <FormRow>
          <Field>
            <Label>Expected Delivery Date</Label>
            <Input
              type="date"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              disabled={isReadOnly}
            />
          </Field>
        </FormRow>
        <Field>
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Delivery instructions, special requirements..."
            disabled={isReadOnly}
          />
        </Field>
      </Card>

      {/* Lines — hidden for from-PR mode (lines come from the PR automatically) */}
      {!isFromPR && (
        <Card>
          <CardTitle>Line Items</CardTitle>
          <Table>
            <thead>
              <tr>
                <Th style={{ width: 220 }}>Item *</Th>
                <Th style={{ width: 80 }}>UOM</Th>
                <Th style={{ width: 90 }}>Qty *</Th>
                <Th style={{ width: 120 }}>Unit Price (AED) *</Th>
                <Th style={{ width: 80 }}>Tax Code</Th>
                <Th style={{ width: 80 }}>Net</Th>
                <Th style={{ width: 50 }}></Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const net = (Number(line.quantity) * Number(line.unitPrice)).toFixed(2);
                return (
                  <tr key={line._key}>
                    <Td>
                      <Select
                        value={line.itemId}
                        onChange={(e) => {
                          const item = itemsList.find((i) => i.itemId === e.target.value);
                          setLine(line._key, 'itemId', e.target.value);
                          if (item) setLine(line._key, 'uom', item.uom);
                        }}
                        disabled={isReadOnly}
                        style={{ width: '100%' }}
                      >
                        <option value="">— Select Item —</option>
                        {itemsList.map((item) => (
                          <option key={item.itemId} value={item.itemId}>
                            {item.itemCode} — {item.name}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td>
                      <Input
                        value={line.uom}
                        onChange={(e) => setLine(line._key, 'uom', e.target.value)}
                        style={{ width: '70px' }}
                        disabled={isReadOnly}
                      />
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        min="0.001"
                        step="any"
                        value={line.quantity}
                        onChange={(e) => setLine(line._key, 'quantity', e.target.value)}
                        style={{ width: '80px' }}
                        disabled={isReadOnly}
                      />
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => setLine(line._key, 'unitPrice', e.target.value)}
                        style={{ width: '110px' }}
                        disabled={isReadOnly}
                      />
                    </Td>
                    <Td>
                      <Select
                        value={line.taxCode ?? ''}
                        onChange={(e) => setLine(line._key, 'taxCode', e.target.value || null)}
                        disabled={isReadOnly}
                        style={{ width: '100%' }}
                      >
                        <option value="">None / Untaxed</option>
                        {taxCodesLoading && !taxCodesError
                          ? <option disabled>Loading...</option>
                          : activeTaxCodes.map((tc) => (
                              <option key={tc.taxCode} value={tc.taxCode}>
                                {tc.taxCode} — {tc.description} ({tc.rate}%)
                              </option>
                            ))
                        }
                      </Select>
                    </Td>
                    <Td style={{ textAlign: 'right', fontWeight: 600 }}>{net}</Td>
                    <Td>
                      {!isReadOnly && lines.length > 1 && (
                        <DangerIconButton onClick={() => removeLine(line._key)}>✕</DangerIconButton>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {!isReadOnly && (
            <AddLineButton type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              + Add Line
            </AddLineButton>
          )}
        </Card>
      )}

      {isFromPR && sourcePR && (
        <Card style={{ borderLeft: '4px solid #2563eb' }}>
          <p style={{ margin: 0, fontSize: 14, color: '#1d4ed8' }}>
            Lines will be copied from <strong>{sourcePR.docNumber}</strong>{' '}
            ({sourcePR.lines.length} lines, total{' '}
            {new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED' }).format(sourcePR.totalGross)}).
          </p>
        </Card>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      {!isReadOnly && (
        <FooterRow>
          <GhostButton onClick={() => navigate('/purchasing/po')}>Cancel</GhostButton>
          <PrimaryButton onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Draft'}
          </PrimaryButton>
        </FooterRow>
      )}
    </Container>
  );
}
