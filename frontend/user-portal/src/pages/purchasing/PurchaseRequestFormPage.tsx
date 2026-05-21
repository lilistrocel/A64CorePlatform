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
import {
  useCreatePurchaseRequest,
  useUpdatePurchaseRequest,
  usePurchaseRequest,
  usePurchaseItems,
  useVendors,
} from '../../hooks/queries/usePurchasing';
import { useTaxCodes } from '../../hooks/queries/useTaxCodes';
import { useItemMappingsMap } from '../../hooks/queries/useItemMappingsMap';
import { FALLBACK_TAX_CODES } from '../../services/taxCodesService';
import { useAuthStore } from '../../stores/auth.store';
import type { DocumentLineCreate, UrgencyLevel } from '../../services/purchasingApi';

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
  padding: 8px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  vertical-align: top;
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

const DangerIconButton = styled.button`
  padding: 6px 10px;
  background: transparent;
  color: ${({ theme }) => theme.colors.status.danger || '#ef4444'};
  border: 1px solid ${({ theme }) => theme.colors.status.danger || '#ef4444'};
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: ${({ theme }) => theme.colors.status.danger || '#fef2f2'}; }
`;

const AddLineButton = styled.button`
  padding: 8px 16px;
  background: transparent;
  color: ${({ theme }) => theme.colors.accent.sageDeep || '#2563eb'};
  border: 1px dashed ${({ theme }) => theme.colors.accent.sage || '#60a5fa'};
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  width: 100%;
  margin-top: 8px;
  &:hover { background: ${({ theme }) => theme.colors.accent.sageSoft || '#eff6ff'}; }
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.status.danger || '#ef4444'};
  font-size: 13px;
  margin: 8px 0 0;
`;

// ─── Urgency Chips ────────────────────────────────────────────────────────────

const UrgencyChips = styled.div`
  display: flex;
  gap: 8px;
`;

const UrgencyChip = styled.button<{ $active: boolean; $urgency: UrgencyLevel }>`
  padding: 7px 14px;
  border-radius: 99px;
  border: 1px solid ${({ $active, $urgency }) => {
    if (!$active) return '#d1d5db';
    return $urgency === 'high' ? '#ef4444' : $urgency === 'normal' ? '#f59e0b' : '#6b7280';
  }};
  background: ${({ $active, $urgency }) => {
    if (!$active) return 'transparent';
    return $urgency === 'high' ? '#fef2f2' : $urgency === 'normal' ? '#fef3c7' : '#f9fafb';
  }};
  color: ${({ $active, $urgency }) => {
    if (!$active) return '#6b7280';
    return $urgency === 'high' ? '#dc2626' : $urgency === 'normal' ? '#92400e' : '#374151';
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
    taxCode: null,
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
            taxCode: l.taxCode,
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
        taxCode: l.taxCode || null,
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
  const isReadOnly = isEdit && existingPR && existingPR.status !== 'Draft';

  return (
    <Container>
      <BackLink onClick={() => navigate(isEdit ? `/purchasing/pr/${docId}` : '/purchasing/pr')}>
        &larr; {isEdit ? `Back to ${existingPR?.docNumber ?? 'PR'}` : 'Back to Purchase Requests'}
      </BackLink>
      <Title>{isEdit ? 'Edit Purchase Request' : 'New Purchase Request'}</Title>

      {isReadOnly && (
        <Card style={{ borderLeft: '4px solid #f59e0b', padding: '12px 20px', marginBottom: 16 }}>
          <p style={{ margin: 0, color: '#92400e', fontSize: 14 }}>
            This PR is in <strong>{existingPR?.status}</strong> status and cannot be edited.
          </p>
        </Card>
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
              <Th style={{ width: 100 }}>UOM</Th>
              <Th style={{ width: 90 }}>Qty *</Th>
              <Th style={{ width: 110 }}>Unit Price (AED)</Th>
              <Th style={{ width: 150 }}>Suggested Vendor</Th>
              <Th style={{ width: 80 }}>Tax Code</Th>
              <Th style={{ width: 70 }}>Net</Th>
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
                      style={{ width: '100px' }}
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
