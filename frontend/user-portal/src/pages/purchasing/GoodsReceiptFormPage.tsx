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
import styled from 'styled-components';
import {
  useCreateGRFromPO,
  useUpdateGoodsReceipt,
  useGoodsReceipt,
} from '../../hooks/queries/useGoodsReceipts';
import { usePurchaseOrder, usePurchaseOrders } from '../../hooks/queries/usePurchasing';
import { useAuthStore } from '../../stores/auth.store';
import type { GRLineCreate } from '../../services/goodsReceiptsService';

// ─── Styled components ────────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1100px;
  margin: 0 auto;
`;

const BackLink = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.accent.sage};
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 20px;
  &:hover { text-decoration: underline; }
`;

const Title = styled.h1`
  font-size: 26px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 24px;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 12px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
  padding: 24px 28px;
  margin-bottom: 20px;
`;

const CardTitle = styled.h2`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
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
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const Input = styled.input`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
  &:disabled { opacity: 0.6; background: ${({ theme }) => theme.colors.surface.raised}; }
`;

const Select = styled.select`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
`;

const Textarea = styled.textarea`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
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
  color: ${({ theme }) => theme.colors.text.secondary};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const Td = styled.td`
  padding: 10px 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  vertical-align: middle;
`;

const FooterRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 16px;
`;

const PrimaryButton = styled.button`
  padding: 10px 24px;
  background: ${({ theme }) => theme.colors.accent.sage};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.accent.sageDeep}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const GhostButton = styled.button`
  padding: 10px 20px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.status.danger || '#ef4444'};
  font-size: 13px;
  margin: 8px 0 0;
`;

const ValidationHint = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.status.danger || '#ef4444'};
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

  if (isLoading) return <Card><p style={{ fontSize: 14, color: '#6b7280' }}>Loading open POs...</p></Card>;

  if (allReceivable.length === 0) {
    return (
      <Card>
        <CardTitle>Select Source PO</CardTitle>
        <p style={{ fontSize: 14, color: '#6b7280' }}>
          No open or sent POs available. A PO must be in Open or Sent status to create a GR.
        </p>
        <GhostButton onClick={() => navigate('/purchasing/po')}>View Purchase Orders</GhostButton>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Select Source PO</CardTitle>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
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
            <tr key={po.docId}>
              <Td><code style={{ fontWeight: 600 }}>{po.docNumber}</code></Td>
              <Td>{po.vendorName ?? po.vendorCode ?? '—'}</Td>
              <Td>
                <span style={{
                  background: po.status === 'Open' ? '#dbeafe' : '#d1fae5',
                  color: po.status === 'Open' ? '#1d4ed8' : '#065f46',
                  padding: '2px 8px',
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 600,
                }}>
                  {po.status}
                </span>
              </Td>
              <Td>
                {new Intl.NumberFormat('en-AE', {
                  style: 'currency', currency: po.currencyCode,
                }).format(po.totalGross)}
              </Td>
              <Td>
                <PrimaryButton
                  style={{ padding: '6px 14px', fontSize: 13 }}
                  onClick={() => onSelect(po.docId)}
                >
                  Select
                </PrimaryButton>
              </Td>
            </tr>
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
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function GoodsReceiptFormPage() {
  const params = useParams<{ docId?: string; poDocId?: string }>();
  const navigate = useNavigate();
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

  const handleBack = () => {
    if (isEdit) navigate(`/purchasing/gr/${editDocId}`);
    else navigate('/purchasing/gr');
  };

  // If in "new from PO" mode but no PO selected yet, show picker
  if (!isEdit && !effectivePoDocId) {
    return (
      <Container>
        <BackLink onClick={handleBack}>&larr; Back</BackLink>
        <Title>New Goods Receipt — Select PO</Title>
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
      <Title>{pageTitle}</Title>

      {sourcePO && !isEdit && (
        <Card style={{ borderLeft: '4px solid #2563eb', padding: '12px 20px', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#1d4ed8' }}>
            Receiving against <strong>{sourcePO.docNumber}</strong>{' '}
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
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const isOver = line.quantity > line.maxQuantity;
                const isZero = line.quantity <= 0;
                return (
                  <tr key={line.baseLineId}>
                    <Td>
                      <div style={{ fontWeight: 600 }}>{line.itemCode}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{line.itemName}</div>
                    </Td>
                    <Td>{line.uom}</Td>
                    <Td style={{ color: '#6b7280' }}>{line.maxQuantity}</Td>
                    <Td>
                      <Input
                        type="number"
                        min="0"
                        max={line.maxQuantity}
                        step="any"
                        value={line.quantity}
                        style={{
                          width: '100px',
                          borderColor: isOver || isZero ? '#ef4444' : undefined,
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
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : (
        effectivePoDocId && (
          <Card>
            <p style={{ fontSize: 14, color: '#6b7280', textAlign: 'center' }}>
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
