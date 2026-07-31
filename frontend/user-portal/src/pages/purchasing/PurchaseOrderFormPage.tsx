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
import styled, { useTheme } from 'styled-components';
import { Plus, X } from 'lucide-react';
import { PageHeader, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
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
import { useItemMappingsMap } from '../../hooks/queries/useItemMappingsMap';
import { useCostCenters } from '../../hooks/queries/useCostCenters';
import { FALLBACK_TAX_CODES } from '../../services/taxCodesService';
import { useFinanceEnabled } from '../../hooks/useCapabilities';
import { FinanceUnreachableBanner } from '../../components/finance/FinanceUnreachableBanner';
import { useAuthStore } from '../../stores/auth.store';
import type { DocumentLineCreate } from '../../services/purchasingApi';
import { purchasingStatusToPhase } from './statusPhase';

// ─── Styled components (same pattern as PurchaseRequestFormPage) ──────────────
// Night Observatory (T-901 Phase 3). Container stays transparent (spec §7).

const Container = styled.div`
  padding: 32px;
  max-width: 1100px;
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
  transition: color 150ms ease;
  &:hover { color: ${({ theme }) => theme.colors.textPrimary}; text-decoration: underline; }
`;

const Card = styled.div`
  ${glassPanel}
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

// Space Mono uppercase micro-label above each field (spec §4).
const Label = styled.label`
  ${monoLabel}
  color: ${({ theme }) => theme.colors.celeste};
`;

const Input = styled.input`
  ${glassControl}
  padding: 10px 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 150ms ease, box-shadow 150ms ease;
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

// Numeric variant — Space Mono, tabular figures (spec §6).
const NumberInput = styled(Input)`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-variant-numeric: tabular-nums;
  text-align: right;
`;

const Select = styled.select`
  ${glassControl}
  padding: 10px 14px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 150ms ease, box-shadow 150ms ease;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }

  option {
    background: ${({ theme }) => theme.colors.cosmosHi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const Textarea = styled.textarea`
  ${glassControl}
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
  box-sizing: border-box;
  color: ${({ theme }) => theme.colors.textPrimary};
  transition: border-color 150ms ease, box-shadow 150ms ease;
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

// Space Mono uppercase celeste column headers, no solid chrome (spec §4 "Tables").
const Th = styled.th`
  ${monoLabel}
  padding: 10px 8px;
  text-align: left;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const Td = styled.td`
  padding: 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: top;
`;

const Tr = styled.tr`
  transition: background 100ms ease;
  &:hover { background: rgba(180, 200, 220, 0.05); }
`;

// Space Mono for computed currency values in table cells (spec §6).
const NetValue = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const FooterRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
`;

// Primary CTA — the ONE gold budget item on this page (spec §3/§4). Previously
// primary[500] (lapis) fill with onAccent text — a mismatch under onAccent's
// new meaning ("text on a GOLD fill"). Fixed by making the fill gold rather
// than swapping the text colour.
const PrimaryButton = styled.button`
  padding: 10px 24px;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  border: none;
  border-radius: 10px;
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

// Ghost — transparent, celeste text/border (spec §4 "Buttons").
const GhostButton = styled.button`
  padding: 10px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
  transition: all 150ms ease;
  &:hover { background: rgba(180, 200, 220, 0.07); color: ${({ theme }) => theme.colors.textPrimary}; }
`;

// Destructive — coral-b tinted glass, never solid red (spec §4).
const DangerIconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
  background: rgba(240, 138, 112, 0.16);
  color: ${({ theme }) => theme.colors.bright.coral};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 8px;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: rgba(240, 138, 112, 0.26); }
`;

// Add-line — ghost, celeste, NOT gold (spec §3/§4/§8).
const AddLineButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  border: 1px dashed ${({ theme }) => theme.colors.glass.border};
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
  width: 100%;
  margin-top: 8px;
  transition: background 150ms ease;
  &:hover { background: rgba(180, 200, 220, 0.07); }
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 13px;
  margin: 8px 0 0;
`;

// Read-only banner — the doc's own status routes through the single
// canonical purchasingStatusToPhase() map + phaseBadge mixin.
const ReadOnlyCard = styled(Card)<{ $phase: PhaseKey }>`
  border-left: 3px solid ${({ theme, $phase }) => theme.colors.phase[$phase]};
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 14px 20px;
`;

const ReadOnlyText = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const StatusBadge = styled.span<{ $status: string }>`
  ${({ $status }) => phaseBadge(purchasingStatusToPhase($status))}
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
    discountPercent: 0,
    taxCode: 'S',
    costCenterId: null,
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
  const theme = useTheme();

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

  // Item finance mappings — used to auto-default taxCode when user picks an item.
  const itemMappings = useItemMappingsMap(orgId || null);

  // Wave 0 — per-tenant finance capability gate. When false, the tax-code
  // and cost-centre per-line columns degrade to free-text inputs.
  const financeOn = useFinanceEnabled();

  // Cost centres for the per-line dropdown — long-lived master data (5-min cache).
  const { data: costCentersData } = useCostCenters(orgId || null);
  const activeCostCenters = useMemo(
    () => (costCentersData ?? []).filter((c) => c.isActive),
    [costCentersData]
  );

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
          discountPercent: l.discountPercent ?? 0,
          taxCode: l.taxCode,
          costCenterId: l.costCenterId ?? null,
          warehouseId: l.warehouseId,
          requestedVendorId: l.requestedVendorId,
          notes: l.notes,
        })));
      }
    }
  }, [existingPO, isEdit]);

  // Pre-fill lines from source PR (from-pr mode).
  // Preserve the PR line's taxCode — it was already defaulted from the item
  // mapping (or manually chosen) when the PR was created. Fall back to null
  // rather than hardcoding 'S' so the AP form's fallback chain works correctly.
  useEffect(() => {
    if (sourcePR && isFromPR && sourcePR.lines.length > 0) {
      setLines(sourcePR.lines.map((l) => ({
        _key: l.lineId,
        itemId: l.itemId,
        description: l.description,
        uom: l.uom,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent ?? 0,
        taxCode: l.taxCode ?? null,
        costCenterId: l.costCenterId ?? null,
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
      discountPercent: Number(l.discountPercent ?? 0),
      taxCode: l.taxCode || null,
      costCenterId: l.costCenterId || null,
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
      <PageHeader
        breadcrumb="— PURCHASING · PURCHASE ORDERS"
        title={pageTitle}
        emphasizeLastWord={!isFromPR}
        description={isEdit ? `${existingPO?.docNumber ?? ''}` : 'Fill in the header and line items below.'}
      />

      <FinanceUnreachableBanner />

      {isReadOnly && existingPO && (
        <ReadOnlyCard $phase={purchasingStatusToPhase(existingPO.status)}>
          <ReadOnlyText>
            This PO is in <StatusBadge $status={existingPO.status}>{existingPO.status}</StatusBadge> status and cannot be edited.
          </ReadOnlyText>
        </ReadOnlyCard>
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
                <Th style={{ width: 70 }}>UOM</Th>
                <Th style={{ width: 80 }}>Qty *</Th>
                <Th style={{ width: 110 }}>Unit Price (AED) *</Th>
                <Th style={{ width: 70 }}>Disc %</Th>
                <Th style={{ width: 80 }}>Tax Code</Th>
                <Th style={{ width: 130 }}>Cost Center</Th>
                <Th style={{ width: 80 }}>Net</Th>
                <Th style={{ width: 50 }}></Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                // Client-side recompute mirrors backend _compute_line_totals.
                const discFactor = Math.max(0, 1 - Number(line.discountPercent ?? 0) / 100);
                const net = (Number(line.quantity) * Number(line.unitPrice) * discFactor).toFixed(2);
                return (
                  <Tr key={line._key}>
                    <Td>
                      <Select
                        value={line.itemId}
                        onChange={(e) => {
                          const newItemId = e.target.value;
                          const item = itemsList.find((i) => i.itemId === newItemId);
                          setLine(line._key, 'itemId', newItemId);
                          if (item) setLine(line._key, 'uom', item.uom);
                          // Auto-default taxCode from item's finance mapping.
                          // Falls back to 'S' (Standard Rate) as last resort when
                          // no mapping exists — sensible UAE VAT default for POs.
                          const defaultTaxCode =
                            itemMappings.get(newItemId)?.taxCodeDefault ?? 'S';
                          setLine(line._key, 'taxCode', defaultTaxCode);
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
                      <NumberInput
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
                      <NumberInput
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => setLine(line._key, 'unitPrice', e.target.value)}
                        style={{ width: '100px' }}
                        disabled={isReadOnly}
                      />
                    </Td>
                    <Td>
                      <NumberInput
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={line.discountPercent ?? 0}
                        onChange={(e) => setLine(line._key, 'discountPercent', e.target.value)}
                        style={{ width: '60px' }}
                        disabled={isReadOnly}
                      />
                    </Td>
                    <Td>
                      {financeOn ? (
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
                      ) : (
                        <Input
                          type="text"
                          value={line.taxCode ?? ''}
                          onChange={(e) => setLine(line._key, 'taxCode', e.target.value || null)}
                          disabled={isReadOnly}
                          placeholder="Tax code (free-text)"
                          style={{ width: '100%' }}
                        />
                      )}
                    </Td>
                    <Td>
                      {financeOn ? (
                        <Select
                          value={line.costCenterId ?? ''}
                          onChange={(e) => setLine(line._key, 'costCenterId', e.target.value || null)}
                          disabled={isReadOnly}
                          style={{ width: '100%' }}
                        >
                          <option value="">— None —</option>
                          {activeCostCenters.map((cc) => (
                            <option key={cc.costCenterId} value={cc.costCenterId}>
                              {cc.costCenterId} — {cc.name}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          type="text"
                          value={line.costCenterId ?? ''}
                          onChange={(e) => setLine(line._key, 'costCenterId', e.target.value || null)}
                          disabled={isReadOnly}
                          placeholder="Cost centre (free-text)"
                          style={{ width: '100%' }}
                        />
                      )}
                    </Td>
                    <Td style={{ textAlign: 'right', fontWeight: 600 }}>
                      <NetValue>{net}</NetValue>
                    </Td>
                    <Td>
                      {!isReadOnly && lines.length > 1 && (
                        <DangerIconButton onClick={() => removeLine(line._key)} aria-label="Remove line">
                          <X size={13} strokeWidth={1.8} />
                        </DangerIconButton>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          {!isReadOnly && (
            <AddLineButton type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              <Plus size={14} strokeWidth={1.8} />
              Add Line
            </AddLineButton>
          )}
        </Card>
      )}

      {isFromPR && sourcePR && (
        <Card style={{ borderLeft: `4px solid ${theme.colors.primary[600]}` }}>
          <p style={{ margin: 0, fontSize: 14, color: theme.colors.primary[700] }}>
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
