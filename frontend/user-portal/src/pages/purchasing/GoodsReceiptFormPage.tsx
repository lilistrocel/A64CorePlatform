/**
 * GoodsReceiptFormPage
 *
 * Create a Goods Receipt from an approved/open PO.
 *   - Loads the PO, shows its lines.
 *   - Defaults each GR line quantity to PO line openQuantity.
 *   - User can reduce (but not exceed openQuantity).
 *   - Receive Date, Warehouse, Notes on the header.
 *   - Save → POST /gr/from-po/{poDocId}
 *
 * Also handles editing an existing Draft GR: /purchasing/gr/:docId/edit
 *
 * Routes:
 *   /purchasing/gr/new             → PO picker then form
 *   /purchasing/gr/from-po/:poDocId → direct from-PO form
 *   /purchasing/gr/:docId/edit      → edit Draft GR
 *
 * Role gating: procurement_officer, procurement_manager, admin, super_admin.
 * Modals do NOT close on overlay click — X button only.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { PageHeader, glassPanel, glassControl, monoLabel, phaseBadge } from '@a64core/shared';
import {
  useCreateGRFromPO,
  useUpdateGoodsReceipt,
  useGoodsReceipt,
} from '../../hooks/queries/useGoodsReceipts';
import { usePurchaseOrder, usePurchaseOrders } from '../../hooks/queries/usePurchasing';
import { useAuthStore } from '../../stores/auth.store';
import { useFinanceEnabled } from '../../hooks/useCapabilities';
import { FinanceUnreachableBanner } from '../../components/finance/FinanceUnreachableBanner';
import type { GRLineCreate } from '../../services/goodsReceiptsService';
import { purchasingStatusToPhase } from './statusPhase';

// ─── Styled components ────────────────────────────────────────────────────────
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
  padding: 10px 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
`;

const Tr = styled.tr`
  transition: background 100ms ease;
  &:hover { background: rgba(180, 200, 220, 0.05); }
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

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 13px;
  margin: 8px 0 0;
`;

const ValidationHint = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.bright.coral};
`;

// Status pill for the PO picker — routes through the single canonical
// purchasingStatusToPhase() map + phaseBadge mixin (./statusPhase.ts),
// replacing the previous inline-style primary/emerald pill.
const StatusBadge = styled.span<{ $status: string }>`
  ${({ $status }) => phaseBadge(purchasingStatusToPhase($status))}
`;

// Space Mono for document-code/currency display (spec §6).
const DocCode = styled.code`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const AmountValue = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

// Row-level "Select" action in the PO picker table — deliberately NOT the
// gold PrimaryButton (spec §3 gold-discipline budget): one per row in a
// list would blow well past the ≤4-gold-elements-per-viewport limit once
// more than a couple of POs are listed. Secondary glass treatment instead.
const SelectButton = styled.button`
  ${glassControl}
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.glass.hi}; }
`;

// ─── PO Picker (shown at /purchasing/gr/new before a PO is selected) ──────────

function POPickerCard({
  organizationId,
  onSelect,
}: {
  organizationId: string;
  onSelect: (poDocId: string) => void;
}) {
  const navigate = useNavigate();
  const theme = useTheme();
  // Only show Open/Sent POs (ones that have openQuantity)
  const { data, isLoading } = usePurchaseOrders({
    organizationId,
    perPage: 50,
    status: 'Open',
  });
  const { data: sentData } = usePurchaseOrders({
    organizationId,
    perPage: 50,
    status: 'Sent',
  });

  const openPos = data?.data ?? [];
  const sentPos = sentData?.data ?? [];
  const allReceivable = [...openPos, ...sentPos];

  if (isLoading) return <Card><p style={{ fontSize: 14, color: theme.colors.textSecondary }}>Loading open POs...</p></Card>;

  if (allReceivable.length === 0) {
    return (
      <Card>
        <CardTitle>Select Source PO</CardTitle>
        <p style={{ fontSize: 14, color: theme.colors.textSecondary }}>
          No open or sent POs available. A PO must be in Open or Sent status to create a GR.
        </p>
        <GhostButton onClick={() => navigate('/purchasing/po')}>View Purchase Orders</GhostButton>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Select Source PO</CardTitle>
      <p style={{ fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16 }}>
        Choose the Purchase Order you are receiving goods against.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>PO Number</Th>
            <Th>Vendor</Th>
            <Th>Status</Th>
            <Th>Total Gross</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {allReceivable.map((po) => (
            <Tr key={po.docId}>
              <Td><DocCode>{po.docNumber}</DocCode></Td>
              <Td>{po.vendorName ?? po.vendorCode ?? '—'}</Td>
              <Td>
                <StatusBadge $status={po.status}>{po.status}</StatusBadge>
              </Td>
              <Td>
                <AmountValue>
                  {new Intl.NumberFormat('en-AE', {
                    style: 'currency', currency: po.currencyCode,
                  }).format(po.totalGross)}
                </AmountValue>
              </Td>
              <Td>
                <SelectButton onClick={() => onSelect(po.docId)}>
                  Select
                </SelectButton>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

// ─── Line state ───────────────────────────────────────────────────────────────

interface GRLineFormState {
  baseLineId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  maxQuantity: number;   // PO line openQuantity — upper bound for validation
  quantity: number;
  // Inherited from the source PO line — surfaced as read-only context so the
  // user can see what will land on the JE. Backend re-derives both during GR
  // creation; these are display-only here (not part of the submit payload).
  discountPercent: number;
  costCenterId: string | null;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function GoodsReceiptFormPage() {
  const params = useParams<{ docId?: string; poDocId?: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? '';

  const editDocId = params.docId;
  const routePoDocId = params.poDocId;
  const isEdit = !!editDocId;

  // For /purchasing/gr/new — user picks a PO first
  const [selectedPoDocId, setSelectedPoDocId] = useState<string | null>(
    routePoDocId ?? null
  );
  const effectivePoDocId = selectedPoDocId;

  // Fetch source PO when we have one selected
  const { data: sourcePO } = usePurchaseOrder(
    effectivePoDocId ?? undefined,
    orgId
  );

  // Fetch existing GR for edit mode
  const { data: existingGR } = useGoodsReceipt(
    isEdit ? editDocId : undefined,
    orgId
  );

  const createMutation = useCreateGRFromPO();
  const updateMutation = useUpdateGoodsReceipt();

  // Header form state
  const [receivedDate, setReceivedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<GRLineFormState[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Populate lines from source PO when it loads (create mode)
  useEffect(() => {
    if (sourcePO && !isEdit && sourcePO.lines.length > 0) {
      setLines(
        sourcePO.lines
          .filter((l) => l.openQuantity > 0)
          .map((l) => ({
            baseLineId: l.lineId,
            itemCode: l.itemCode,
            itemName: l.itemName,
            uom: l.uom,
            maxQuantity: l.openQuantity,
            quantity: l.openQuantity,
            discountPercent: l.discountPercent ?? 0,
            costCenterId: l.costCenterId ?? null,
          }))
      );
    }
  }, [sourcePO, isEdit]);

  // Populate form from existing GR (edit mode)
  useEffect(() => {
    if (existingGR && isEdit) {
      setReceivedDate(existingGR.receivedDate?.split('T')[0] ?? '');
      setWarehouseId(existingGR.warehouseId ?? '');
      setNotes(existingGR.notes ?? '');
      // For edit mode, we need the source PO to know maxQuantity;
      // use current GR quantity as-is and let the backend validate.
      setLines(
        existingGR.lines.map((l) => ({
          baseLineId: l.baseLineId,
          itemCode: l.itemCode,
          itemName: l.itemName,
          uom: l.uom,
          maxQuantity: l.quantity,   // best-effort: GR qty itself (backend enforces limits)
          quantity: l.quantity,
          discountPercent: l.discountPercent ?? 0,
          costCenterId: l.costCenterId ?? null,
        }))
      );
      if (!selectedPoDocId) {
        setSelectedPoDocId(existingGR.baseDocId);
      }
    }
  }, [existingGR, isEdit]);

  const setLineQty = (baseLineId: string, qty: number) => {
    setLines((prev) =>
      prev.map((l) => (l.baseLineId === baseLineId ? { ...l, quantity: qty } : l))
    );
  };

  const handleSubmit = async () => {
    setError(null);

    if (!receivedDate) {
      setError('Received Date is required.');
      return;
    }

    const validLines = lines.filter((l) => l.quantity > 0);
    if (validLines.length === 0) {
      setError('At least one line with quantity > 0 is required.');
      return;
    }

    // Validate quantities
    const overMax = validLines.find((l) => l.quantity > l.maxQuantity);
    if (overMax) {
      setError(
        `Line for ${overMax.itemCode}: quantity ${overMax.quantity} exceeds available ` +
        `open quantity ${overMax.maxQuantity}.`
      );
      return;
    }

    const linePayload: GRLineCreate[] = validLines.map((l) => ({
      baseLineId: l.baseLineId,
      quantity: Number(l.quantity),
    }));

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          docId: editDocId!,
          data: {
            receivedDate,
            warehouseId: warehouseId || null,
            notes: notes || null,
            lines: linePayload,
          },
          organizationId: orgId,
        });
        navigate(`/purchasing/gr/${editDocId}`);
      } else {
        const created = await createMutation.mutateAsync({
          poDocId: effectivePoDocId!,
          data: {
            receivedDate,
            warehouseId: warehouseId || null,
            notes: notes || null,
            lines: linePayload,
          },
          organizationId: orgId,
        });
        navigate(`/purchasing/gr/${created.docId}`);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(
        axiosErr?.response?.data?.detail ?? axiosErr?.message ?? 'Failed to save.'
      );
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const pageTitle = isEdit ? 'Edit Goods Receipt' : 'New Goods Receipt from PO';

  // Wave 0 — hide the cost-centre column entirely when finance is off
  // (matches the design audit table — GR shows cost centre as display only).
  const financeOn = useFinanceEnabled();

  const handleBack = () => {
    if (isEdit) navigate(`/purchasing/gr/${editDocId}`);
    else navigate('/purchasing/gr');
  };

  // If in "new from PO" mode but no PO selected yet, show picker
  if (!isEdit && !effectivePoDocId) {
    return (
      <Container>
        <BackLink onClick={handleBack}>&larr; Back</BackLink>
        <PageHeader
          breadcrumb="— PURCHASING · GOODS RECEIPTS"
          title="New Goods Receipt"
          emphasizeLastWord
          description="Select the source PO to receive against."
        />
        <POPickerCard
          organizationId={orgId}
          onSelect={(id) => setSelectedPoDocId(id)}
        />
      </Container>
    );
  }

  return (
    <Container>
      <BackLink onClick={handleBack}>&larr; Back</BackLink>

      <PageHeader
        breadcrumb="— PURCHASING · GOODS RECEIPTS"
        title={pageTitle}
        emphasizeLastWord
        description={isEdit ? `${existingGR?.docNumber ?? ''}` : 'Fill in the header and confirm the quantities received.'}
      />

      <FinanceUnreachableBanner />

      {sourcePO && !isEdit && (
        <Card style={{ borderLeft: `4px solid ${theme.colors.bright.lapis}`, padding: '12px 20px', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: theme.colors.celeste }}>
            Receiving against <DocCode>{sourcePO.docNumber}</DocCode>{' '}
            from vendor <strong>{sourcePO.vendorName ?? sourcePO.vendorCode ?? '—'}</strong>
          </p>
        </Card>
      )}

      {/* Header */}
      <Card>
        <CardTitle>GR Header</CardTitle>
        <FormRow>
          <Field>
            <Label htmlFor="gr-received-date">Received Date *</Label>
            <Input
              id="gr-received-date"
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="gr-warehouse">Warehouse</Label>
            <Input
              id="gr-warehouse"
              type="text"
              placeholder="Warehouse ID (optional)"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            />
          </Field>
        </FormRow>
        <Field>
          <Label htmlFor="gr-notes">Notes</Label>
          <Textarea
            id="gr-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Delivery notes, batch info, condition remarks..."
          />
        </Field>
      </Card>

      {/* Lines */}
      {lines.length > 0 ? (
        <Card>
          <CardTitle>Lines to Receive</CardTitle>
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>UOM</Th>
                <Th>Max (Open Qty)</Th>
                <Th style={{ width: 130 }}>Qty to Receive *</Th>
                <Th style={{ width: 70 }}>Disc %</Th>
                {financeOn && <Th style={{ width: 160 }}>Cost Center</Th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const isOver = line.quantity > line.maxQuantity;
                const isZero = line.quantity <= 0;
                return (
                  <Tr key={line.baseLineId}>
                    <Td>
                      <div style={{ fontWeight: 600 }}>{line.itemCode}</div>
                      <div style={{ fontSize: 12, color: theme.colors.textSecondary }}>{line.itemName}</div>
                    </Td>
                    <Td>{line.uom}</Td>
                    <Td style={{ color: theme.colors.textSecondary }}>
                      <AmountValue>{line.maxQuantity}</AmountValue>
                    </Td>
                    <Td>
                      <NumberInput
                        type="number"
                        min="0"
                        max={line.maxQuantity}
                        step="any"
                        value={line.quantity}
                        style={{
                          width: '100px',
                          borderColor: isOver || isZero ? theme.colors.error : undefined,
                        }}
                        onChange={(e) =>
                          setLineQty(line.baseLineId, parseFloat(e.target.value) || 0)
                        }
                        aria-label={`Quantity for ${line.itemCode}`}
                      />
                      {isOver && (
                        <ValidationHint> Max {line.maxQuantity}</ValidationHint>
                      )}
                    </Td>
                    <Td style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
                      {line.discountPercent ? `${line.discountPercent}%` : '—'}
                    </Td>
                    {financeOn && (
                      <Td style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
                        {line.costCenterId ?? '—'}
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : (
        effectivePoDocId && (
          <Card>
            <p style={{ fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center' }}>
              Loading PO lines...
            </p>
          </Card>
        )
      )}

      {error && <ErrorText>{error}</ErrorText>}

      <FooterRow>
        <GhostButton onClick={handleBack}>Cancel</GhostButton>
        <PrimaryButton onClick={handleSubmit} disabled={isSaving || lines.length === 0}>
          {isSaving ? 'Saving...' : 'Save Draft'}
        </PrimaryButton>
      </FooterRow>
    </Container>
  );
}
