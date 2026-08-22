/**
 * PurchaseRequestFormPage
 *
 * Create or edit a Purchase Request.
 * Routes: /purchasing/pr/new (create) | /purchasing/pr/:docId/edit (edit)
 *
 * Modals do NOT close on overlay click — X button only.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { Plus, X } from 'lucide-react';
import { PageHeader, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import type { PhaseKey } from '@a64core/shared';
import {
  useCreatePurchaseRequest,
  useUpdatePurchaseRequest,
  usePurchaseRequest,
  usePurchaseItems,
  useVendors,
} from '../../hooks/queries/usePurchasing';
import { useTaxCodes } from '../../hooks/queries/useTaxCodes';
import { useItemMappingsMap } from '../../hooks/queries/useItemMappingsMap';
import { useCostCenters } from '../../hooks/queries/useCostCenters';
import { FALLBACK_TAX_CODES } from '../../services/taxCodesService';
import { useFinanceEnabled } from '../../hooks/useCapabilities';
import { FinanceUnreachableBanner } from '../../components/finance/FinanceUnreachableBanner';
import { useAuthStore } from '../../stores/auth.store';
import type { DocumentLineCreate, UrgencyLevel } from '../../services/purchasingApi';
import { purchasingStatusToPhase, statusDisplayLabel } from './statusPhase';

// ─── Styled components ────────────────────────────────────────────────────────
// Night Observatory (T-901 Phase 3). Container stays transparent (spec §7 —
// the sky must show through). Cards/tables compose the shared glass mixins
// instead of hand-rolled surfaces; inputs/selects/textareas compose
// glassControl per spec §4 "Inputs/selects/textareas".

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

// Numeric variant — Space Mono, tabular figures (spec §6: quantities render
// in Space Mono). CSS-only; the underlying number input keeps its existing
// type/value/onChange wiring.
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

  /* The native <select> popover can't inherit blur/glass — force a legible
     opaque option list (spec §2's glassOpaque intent for popovers). */
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
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding-top: 16px;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 10px;
`;

// Primary CTA — the ONE gold budget item on this page (spec §3/§4): gold
// gradient fill, cosmos (onAccent) text. Previously primary[500] (lapis)
// fill with onAccent text — a mismatch under onAccent's new meaning ("text
// on a GOLD fill"). Fixed by making the fill gold (matching
// PurchaseRequestDetailPage's PrimaryButton) rather than swapping the text
// colour, since gold-fill + onAccent is the correct pairing.
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

// Add-line — ghost, celeste, NOT gold (spec §3/§4/§8: gold is reserved and
// must stay under budget on this page).
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
// canonical purchasingStatusToPhase() map + phaseBadge mixin (./statusPhase.ts),
// matching every other purchasing status badge in this shard.
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

// ─── Urgency Chips ────────────────────────────────────────────────────────────
// Urgency is not a document-lifecycle phase, so it doesn't route through
// purchasingStatusToPhase — but it still has to respect gold discipline
// (spec §3): 'normal' previously used theme.colors.warning, which is gold-b
// under the Night Observatory remap (reserved for the Harvesting phase).
// Swapped to bright.terra (orange) so no urgency level renders gold.
// CSS-only — the $urgency/$active props and the click handler are unchanged.
const UrgencyChips = styled.div`
  display: flex;
  gap: 8px;
`;

const URGENCY_TINT: Record<UrgencyLevel, { text: 'coral' | 'terra' | 'celeste'; border: string; bg: string }> = {
  high: { text: 'coral', border: 'rgba(240, 138, 112, 0.45)', bg: 'rgba(240, 138, 112, 0.16)' },
  normal: { text: 'terra', border: 'rgba(232, 147, 95, 0.45)', bg: 'rgba(232, 147, 95, 0.16)' },
  low: { text: 'celeste', border: 'rgba(180, 200, 220, 0.4)', bg: 'rgba(180, 200, 220, 0.12)' },
};

const UrgencyChip = styled.button<{ $active: boolean; $urgency: UrgencyLevel }>`
  padding: 7px 14px;
  border-radius: 99px;
  border: 1px solid ${({ $active, $urgency, theme }) =>
    $active ? URGENCY_TINT[$urgency].border : theme.colors.glass.border};
  background: ${({ $active, $urgency }) => ($active ? URGENCY_TINT[$urgency].bg : 'transparent')};
  color: ${({ $active, $urgency, theme }) => {
    if (!$active) return theme.colors.muted;
    const tint = URGENCY_TINT[$urgency].text;
    return tint === 'celeste' ? theme.colors.celeste : theme.colors.bright[tint];
  }};
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  cursor: pointer;
  transition: all 120ms ease;
`;

// ─── Empty line factory ───────────────────────────────────────────────────────

interface LineFormState extends DocumentLineCreate {
  _key: string;
}

function emptyLine(): LineFormState {
  return {
    _key: Math.random().toString(36).slice(2),
    itemId: '',
    description: '',
    uom: 'KG',
    quantity: 1,
    unitPrice: 0,
    discountPercent: 0,
    taxCode: null,
    costCenterId: null,
    warehouseId: null,
    requestedVendorId: null,
    notes: null,
  };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PurchaseRequestFormPage() {
  const { docId } = useParams<{ docId: string }>();
  const isEdit = !!docId;
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? '';

  // Fetch existing PR for edit
  const { data: existingPR } = usePurchaseRequest(isEdit ? docId : undefined, orgId);

  // Fetch items for typeahead
  const { data: itemsData } = usePurchaseItems({ organizationId: orgId, isActive: true, perPage: 200 });
  const itemsList = itemsData?.data ?? [];

  // Fetch vendors for dropdown
  const { data: vendorsData } = useVendors({ organizationId: orgId, isActive: true, perPage: 200 });
  const vendorsList = vendorsData?.data ?? [];

  // Item finance mappings — used to auto-default taxCode when user picks an item.
  const itemMappings = useItemMappingsMap(orgId || null);

  // Wave 0 — per-tenant finance capability. When false the dropdowns
  // below degrade to free-text inputs so ops-only deployments can still
  // capture a typed tax code / cost-centre without finance master data.
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
      console.warn('[PurchaseRequestFormPage] Failed to load tax codes from API; using fallback list.');
      return FALLBACK_TAX_CODES.filter((c) => c.isActive);
    }
    return (taxCodesData ?? []).filter((c) => c.isActive);
  }, [taxCodesData, taxCodesError]);

  const createMutation = useCreatePurchaseRequest();
  const updateMutation = useUpdatePurchaseRequest();

  const [department, setDepartment] = useState('');
  const [urgency, setUrgency] = useState<UrgencyLevel>('normal');
  const [notes, setNotes] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [lines, setLines] = useState<LineFormState[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  // Populate form from existing PR
  useEffect(() => {
    if (existingPR && isEdit) {
      setDepartment(existingPR.department ?? '');
      setUrgency(existingPR.urgency);
      setNotes(existingPR.notes ?? '');
      setExpectedDeliveryDate(
        existingPR.expectedDeliveryDate
          ? existingPR.expectedDeliveryDate.split('T')[0]
          : ''
      );
      if (existingPR.lines.length > 0) {
        setLines(
          existingPR.lines.map((l) => ({
            _key: l.lineId,
            itemId: l.itemId,
            description: l.description ?? '',
            uom: l.uom,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountPercent: l.discountPercent ?? 0,
            taxCode: l.taxCode,
            costCenterId: l.costCenterId ?? null,
            warehouseId: l.warehouseId,
            requestedVendorId: l.requestedVendorId,
            notes: l.notes,
          }))
        );
      }
    }
  }, [existingPR, isEdit]);

  const setLine = (key: string, field: keyof LineFormState, value: any) => {
    setLines((prev) =>
      prev.map((l) => (l._key === key ? { ...l, [field]: value } : l))
    );
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l._key !== key));
  };

  const handleSubmit = async () => {
    setError(null);

    const validLines = lines.filter((l) => l.itemId);
    if (validLines.length === 0) {
      setError('At least one line with an item is required.');
      return;
    }

    const payload = {
      department: department || null,
      urgency,
      notes: notes || null,
      expectedDeliveryDate: expectedDeliveryDate || null,
      lines: validLines.map((l) => ({
        itemId: l.itemId,
        description: l.description || null,
        uom: l.uom,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        discountPercent: Number(l.discountPercent ?? 0),
        taxCode: l.taxCode || null,
        costCenterId: l.costCenterId || null,
        warehouseId: l.warehouseId || null,
        requestedVendorId: l.requestedVendorId || null,
        notes: l.notes || null,
      })),
    };

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ docId: docId!, data: payload, organizationId: orgId });
        navigate(`/purchasing/pr/${docId}`);
      } else {
        const created = await createMutation.mutateAsync({ data: payload, organizationId: orgId });
        navigate(`/purchasing/pr/${created.docId}`);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? err?.message ?? 'Failed to save.');
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  // T-811: gating now compares against the stored backend vocabulary ('draft').
  const isReadOnly = isEdit && existingPR && existingPR.status !== 'draft';
  const pageTitle = isEdit ? 'Edit Purchase Request' : 'New Purchase Request';

  return (
    <Container>
      <BackLink onClick={() => navigate(isEdit ? `/purchasing/pr/${docId}` : '/purchasing/pr')}>
        &larr; {isEdit ? `Back to ${existingPR?.docNumber ?? 'PR'}` : 'Back to Purchase Requests'}
      </BackLink>

      <PageHeader
        breadcrumb="— PURCHASING · PURCHASE REQUESTS"
        title={pageTitle}
        emphasizeLastWord
        description={isEdit ? `${existingPR?.docNumber ?? ''}` : 'Fill in the header and line items below.'}
      />

      <FinanceUnreachableBanner />

      {isReadOnly && existingPR && (
        <ReadOnlyCard $phase={purchasingStatusToPhase(existingPR.status)}>
          <ReadOnlyText>
            This PR is in <StatusBadge $status={existingPR.status}>{statusDisplayLabel(existingPR.status, 'PR')}</StatusBadge> status and cannot be edited.
          </ReadOnlyText>
        </ReadOnlyCard>
      )}

      {/* Header */}
      <Card>
        <CardTitle>Request Header</CardTitle>
        <FormRow>
          <Field>
            <Label>Department</Label>
            <Input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Operations, Finance, Farm"
              disabled={isReadOnly}
            />
          </Field>
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
        <Field style={{ marginBottom: 16 }}>
          <Label>Urgency</Label>
          <UrgencyChips>
            {(['low', 'normal', 'high'] as UrgencyLevel[]).map((u) => (
              <UrgencyChip
                key={u}
                $active={urgency === u}
                $urgency={u}
                type="button"
                onClick={() => !isReadOnly && setUrgency(u)}
              >
                {u.charAt(0).toUpperCase() + u.slice(1)}
              </UrgencyChip>
            ))}
          </UrgencyChips>
        </Field>
        <Field>
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes..."
            disabled={isReadOnly}
          />
        </Field>
      </Card>

      {/* Lines */}
      <Card>
        <CardTitle>Line Items</CardTitle>
        <Table>
          <thead>
            <tr>
              <Th style={{ width: 220 }}>Item *</Th>
              <Th style={{ width: 80 }}>UOM</Th>
              <Th style={{ width: 80 }}>Qty *</Th>
              <Th style={{ width: 100 }}>Unit Price (AED)</Th>
              <Th style={{ width: 70 }}>Disc %</Th>
              <Th style={{ width: 140 }}>Suggested Vendor</Th>
              <Th style={{ width: 80 }}>Tax Code</Th>
              <Th style={{ width: 130 }}>Cost Center</Th>
              <Th style={{ width: 70 }}>Net</Th>
              <Th style={{ width: 50 }}></Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              // Client-side recompute mirrors backend _compute_line_totals:
              //   lineNet = qty * unitPrice * (1 - discountPercent/100)
              // so the displayed Net updates as the user edits qty / price / Disc%.
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
                        // Auto-default taxCode from item's configured finance mapping.
                        // Only applies when item is newly selected — manual tax code
                        // edits are not overwritten because they trigger a separate
                        // onChange on the tax code select itself.
                        const defaultTaxCode = itemMappings.get(newItemId)?.taxCodeDefault ?? null;
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
                      style={{ width: '80px' }}
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
                      style={{ width: '90px' }}
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
                    <Select
                      value={line.requestedVendorId ?? ''}
                      onChange={(e) => setLine(line._key, 'requestedVendorId', e.target.value || null)}
                      disabled={isReadOnly}
                      style={{ width: '100%' }}
                    >
                      <option value="">— Optional —</option>
                      {vendorsList.map((v) => (
                        <option key={v.vendorId} value={v.vendorId}>
                          {v.vendorCode} — {v.name}
                        </option>
                      ))}
                    </Select>
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
                  <Td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'inherit' }}>
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

      {error && <ErrorText>{error}</ErrorText>}

      {!isReadOnly && (
        <FooterRow>
          <div />
          <ButtonGroup>
            <GhostButton onClick={() => navigate(isEdit ? `/purchasing/pr/${docId}` : '/purchasing/pr')}>
              Cancel
            </GhostButton>
            <PrimaryButton onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Draft'}
            </PrimaryButton>
          </ButtonGroup>
        </FooterRow>
      )}
    </Container>
  );
}
