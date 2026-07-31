/**
 * APInvoiceFormPage
 *
 * Three modes:
 *   /purchasing/ap/new              — GR picker → redirect to from-GR mode
 *   /purchasing/ap/from-gr/:grDocId — create AP from a specific Posted GR
 *   /purchasing/ap/:docId/edit      — edit a Draft AP Invoice
 *
 * From-GR mode:
 *   - Fetches the GR detail to pre-populate lines.
 *   - Lines: Item Code/Name, Qty (locked), UoM, PO Unit Price (locked),
 *     Invoice Unit Price (editable, defaults to PO price), Tax Code (editable),
 *     Line Net / Tax / Gross / Variance (all computed live).
 *   - Variance display: amber row highlight when price differs, red/green value.
 *   - Totals auto-update as user edits prices.
 *   - Submit → POST /ap/from-gr/{grDocId} → redirect to detail.
 *
 * Edit mode: similar but loads existing AP; only editable when status=Draft.
 *
 * Role gating: procurement_officer, procurement_manager, accountant,
 *   finance_admin, admin, super_admin.
 * Modals do NOT close on overlay click — X button only.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { PageHeader, glassPanel, glassControl, monoLabel } from '@a64core/shared';
import {
  usePostedGRsForAP,
  useCreateAPFromGR,
  useUpdateAPInvoice,
  useAPInvoice,
  useAPInvoices,
} from '../../hooks/queries/useAPInvoices';
import { useGoodsReceipt } from '../../hooks/queries/useGoodsReceipts';
import { useTaxCodes } from '../../hooks/queries/useTaxCodes';
import { useItemMappingsMap } from '../../hooks/queries/useItemMappingsMap';
import { FALLBACK_TAX_CODES } from '../../services/taxCodesService';
import { useFinanceEnabled } from '../../hooks/useCapabilities';
import { FinanceUnreachableBanner } from '../../components/finance/FinanceUnreachableBanner';
import { useAuthStore } from '../../stores/auth.store';
import type { APLineCreate } from '../../services/apInvoicesService';

// ─── Styled components ────────────────────────────────────────────────────────
// Night Observatory (T-901 Phase 3). Container stays transparent (spec §7).

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

const FormRow3 = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
  @media (max-width: 900px) { grid-template-columns: 1fr 1fr; }
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
  min-height: 72px;
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

// Space Mono for computed currency/quantity values (spec §6).
const AmountValue = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const DocCode = styled.code`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

/** Coral-tinted row flag when the invoice price differs from the PO price.
 * Was previously theme.colors.gold[50] (amber) — gold is reserved for the
 * Harvesting phase / primary CTA / breadcrumb / focus ring (spec §3), and
 * this exact fix was already made in APInvoiceDetailPage.tsx's LineRow;
 * mirrored here verbatim (rgba(240, 138, 112, 0.05)) so the two screens
 * read as one system. CSS-only — `$hasVariance` is computed exactly as
 * before. */
const LineRow = styled.tr<{ $hasVariance: boolean }>`
  background: ${({ $hasVariance }) => ($hasVariance ? 'rgba(240, 138, 112, 0.05)' : 'transparent')};
  transition: background 100ms ease;
`;

// Sign colouring matches APInvoiceDetailPage's VarianceValue: bright.coral
// (unfavourable — vendor invoiced more than the PO), bright.emerald
// (favourable), muted (zero). Was terracotta[600]/emerald[600].
const VarianceCell = styled.span<{ $sign: 'positive' | 'negative' | 'zero' }>`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: ${({ $sign }) => ($sign === 'zero' ? '400' : '600')};
  color: ${({ $sign, theme }) => {
    if ($sign === 'positive') return theme.colors.bright.coral;
    if ($sign === 'negative') return theme.colors.bright.emerald;
    return theme.colors.muted;
  }};
`;

/** Totals block — right-aligned */
const TotalsBlock = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const TotalsRow = styled.div`
  display: flex;
  gap: 24px;
  align-items: baseline;
  font-size: 14px;
`;

const TotalsLabel = styled.span`
  color: ${({ theme }) => theme.colors.celeste};
  min-width: 140px;
  text-align: right;
`;

const TotalsValue = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  min-width: 120px;
  text-align: right;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TotalsVariance = styled.span<{ $sign: 'positive' | 'negative' | 'zero' }>`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 14px;
  min-width: 120px;
  text-align: right;
  color: ${({ $sign, theme }) => {
    if ($sign === 'positive') return theme.colors.bright.coral;
    if ($sign === 'negative') return theme.colors.bright.emerald;
    return theme.colors.muted;
  }};
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
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

// Row-level "Select" action in the GR picker table — deliberately NOT the
// gold PrimaryButton (spec §3 gold-discipline budget): one per row in a
// paginated list would blow well past the ≤4-gold-elements-per-viewport
// limit. Secondary glass treatment instead.
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

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 13px;
  margin: 8px 0 0;
`;

// Variance is a "needs review" heads-up, not a validation error — but it
// must NOT render gold (theme.colors.warning/gold[*] is gold-b, reserved
// for the Harvesting phase per spec §3). Coral matches the sign colouring
// already used for variance everywhere else on this page (VarianceCell,
// TotalsVariance), so the whole variance story reads as one colour.
const VarianceHelpText = styled.p`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.bright.coral};
  background: rgba(240, 138, 112, 0.12);
  border: 1px solid rgba(240, 138, 112, 0.35);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 12px 0 0;
`;

// ─── Line state ───────────────────────────────────────────────────────────────

interface APLineFormState {
  grLineId: string;
  /** The operational item ID — used to look up the item's taxCodeDefault. */
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  quantity: number;
  poUnitPrice: number;
  invoiceUnitPrice: number;
  taxCode: string;
  // Inherited from the GR line (which inherited from the PO line). Read-only
  // here — surfaced for user visibility and used in the client-side recompute
  // so the displayed totals match what the backend will persist.
  discountPercent: number;
  costCenterId: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmt(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(amount);
}

function getTaxRate(taxCode: string, taxCodes: typeof FALLBACK_TAX_CODES): number {
  const tc = taxCodes.find((t) => t.taxCode === taxCode);
  return tc ? parseFloat(tc.rate) / 100 : 0;
}

function computeLineTotals(
  line: APLineFormState,
  taxCodes: typeof FALLBACK_TAX_CODES
): { lineNet: number; lineTax: number; lineGross: number; variance: number } {
  // Reason: mirror backend _build_ap_lines_from_gr — both lineNet and variance
  // are reduced by the discount factor inherited from the GR/PO chain so the
  // displayed totals match the JE the finance handler will post.
  const discountFactor = Math.max(0, 1 - (line.discountPercent ?? 0) / 100);
  const lineNet = line.invoiceUnitPrice * line.quantity * discountFactor;
  const taxRate = getTaxRate(line.taxCode, taxCodes);
  const lineTax = lineNet * taxRate;
  const lineGross = lineNet + lineTax;
  const variance =
    (line.invoiceUnitPrice - line.poUnitPrice) * line.quantity * discountFactor;
  return { lineNet, lineTax, lineGross, variance };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function getVarianceSign(amount: number): 'positive' | 'negative' | 'zero' {
  if (amount > 0) return 'positive';
  if (amount < 0) return 'negative';
  return 'zero';
}

function formatVarianceLabel(amount: number, currency: string): string {
  if (amount === 0) return '—';
  const abs = new Intl.NumberFormat('en-AE', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(Math.abs(amount));
  return amount > 0 ? `+${abs}` : `(${abs})`;
}

// ─── GR Picker sub-component ─────────────────────────────────────────────────

function GRPickerCard({
  organizationId,
  onSelect,
}: {
  organizationId: string;
  onSelect: (grDocId: string) => void;
}) {
  const navigate = useNavigate();
  const theme = useTheme();
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePostedGRsForAP({ organizationId, page, perPage: 20 });
  // Reason: one AP per GR in v1 (the backend enforces this). Fetch existing
  // non-rejected APs and build a Set of their source GR docIds so we can
  // hide GRs that have already been invoiced. Without this filter, users see
  // GRs they cannot legally use and only discover the conflict on submit.
  const { data: apListResp } = useAPInvoices({
    organizationId,
    perPage: 200,
  });
  const grsWithAp = useMemo(() => {
    const set = new Set<string>();
    for (const ap of apListResp?.data ?? []) {
      if (ap.status !== 'Rejected' && ap.baseDocId) {
        set.add(ap.baseDocId);
      }
    }
    return set;
  }, [apListResp]);
  const rawGRs = data?.data ?? [];
  const grs = rawGRs.filter((gr) => !grsWithAp.has(gr.docId));
  const meta = data?.meta ?? { total: 0, page: 1, perPage: 20, totalPages: 1 };

  if (isLoading) {
    return (
      <Card>
        <p style={{ fontSize: 14, color: theme.colors.textSecondary }}>Loading posted goods receipts...</p>
      </Card>
    );
  }

  if (grs.length === 0) {
    return (
      <Card>
        <CardTitle>Select Source GR</CardTitle>
        <p style={{ fontSize: 14, color: theme.colors.textSecondary }}>
          No posted GRs available. A GR must be in Posted status to create an AP Invoice.
        </p>
        <GhostButton onClick={() => navigate('/purchasing/gr')}>
          View Goods Receipts
        </GhostButton>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Select Source GR (Posted)</CardTitle>
      <p style={{ fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16 }}>
        Choose the Posted Goods Receipt you are invoicing against.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>GR Number</Th>
            <Th>PO Number</Th>
            <Th>Vendor</Th>
            <Th>Received Date</Th>
            <Th>Total Net</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {grs.map((gr) => (
            <Tr key={gr.docId}>
              <Td><DocCode>{gr.docNumber}</DocCode></Td>
              <Td>
                {gr.baseDocNumber ?? (
                  <span style={{ color: theme.colors.muted }}>—</span>
                )}
              </Td>
              <Td>{gr.vendorName ?? gr.vendorCode ?? '—'}</Td>
              <Td style={{ fontSize: 13 }}>
                {gr.receivedDate
                  ? new Date(gr.receivedDate).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })
                  : '—'}
              </Td>
              <Td>
                <AmountValue>
                  {new Intl.NumberFormat('en-AE', {
                    style: 'currency', currency: gr.currencyCode,
                  }).format(gr.subtotalNet)}
                </AmountValue>
              </Td>
              <Td>
                <SelectButton onClick={() => onSelect(gr.docId)}>
                  Select
                </SelectButton>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {meta.totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <GhostButton
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ padding: '6px 12px', fontSize: 13 }}
          >
            Previous
          </GhostButton>
          <span style={{ padding: '6px 8px', fontSize: 13, color: theme.colors.textSecondary }}>
            Page {meta.page} / {meta.totalPages}
          </span>
          <GhostButton
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= meta.totalPages}
            style={{ padding: '6px 12px', fontSize: 13 }}
          >
            Next
          </GhostButton>
        </div>
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function APInvoiceFormPage() {
  const rawParams = useParams<{ docId?: string; grDocId?: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? '';

  const editDocId = rawParams.docId;
  const routeGrDocId = rawParams.grDocId;
  const isEdit = !!editDocId;

  // In /new mode, user picks a GR first
  const [selectedGrDocId, setSelectedGrDocId] = useState<string | null>(
    routeGrDocId ?? null
  );
  const effectiveGrDocId = selectedGrDocId;

  // Fetch source GR when selected
  const { data: sourceGR } = useGoodsReceipt(effectiveGrDocId ?? undefined, orgId);

  // Fetch existing AP for edit mode
  const { data: existingAP } = useAPInvoice(
    isEdit ? editDocId : undefined,
    orgId
  );

  // Tax codes — fall back to hardcoded list on error
  const { data: fetchedTaxCodes } = useTaxCodes(orgId);
  const taxCodes = fetchedTaxCodes?.length ? fetchedTaxCodes : FALLBACK_TAX_CODES;

  // Wave 0 — per-tenant finance capability gate. When false the tax-code
  // dropdown degrades to free-text and the cost-centre column is hidden.
  const financeOn = useFinanceEnabled();

  // Item finance mappings — used to auto-default taxCode from the item's
  // configured taxCodeDefault when building lines from a GR.
  const itemMappings = useItemMappingsMap(orgId || null);

  const createMutation = useCreateAPFromGR();
  const updateMutation = useUpdateAPInvoice();

  // Header state
  const today = new Date().toISOString().split('T')[0];
  const [docDate, setDocDate] = useState(today);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, 30));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<APLineFormState[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Auto-update dueDate when invoiceDate changes: +30 days
  useEffect(() => {
    if (invoiceDate) {
      setDueDate(addDays(invoiceDate, 30));
    }
  }, [invoiceDate]);

  // Populate lines from source GR (create mode).
  // Tax code priority order:
  //   1. Item's configured taxCodeDefault from finance mapping
  //   2. The GR line's existing taxCode (inherited from the PO line)
  //   3. Hardcoded 'S' as last-resort UAE VAT default
  useEffect(() => {
    if (sourceGR && !isEdit && sourceGR.lines.length > 0) {
      setLines(
        sourceGR.lines.map((l) => ({
          // Reason: `l.grLineId` on a GR line is null — that field only
          // exists on AP lines as a back-reference to the source GR. The
          // GR line's own primary key is `l.lineId`. Passing the GR line's
          // lineId as the AP payload's grLineId is what the backend expects.
          grLineId: l.lineId,
          itemId: l.itemId,
          itemCode: l.itemCode,
          itemName: l.itemName,
          uom: l.uom,
          quantity: l.quantity,
          poUnitPrice: l.unitPrice,
          invoiceUnitPrice: l.unitPrice,  // default to PO price
          // GRLine does not carry a taxCode — only itemId is available here.
          // Use the item's finance mapping default; fall back to 'S'.
          taxCode: itemMappings.get(l.itemId)?.taxCodeDefault ?? 'S',
          discountPercent: l.discountPercent ?? 0,
          costCenterId: l.costCenterId ?? null,
        }))
      );
    }
  // itemMappings is a stable Map reference rebuilt via useMemo; include it so
  // the effect re-runs once the mapping data has loaded (avoids stale fallback).
  }, [sourceGR, isEdit, itemMappings]);

  // Populate form from existing AP (edit mode)
  useEffect(() => {
    if (existingAP && isEdit) {
      setDocDate(existingAP.docDate?.split('T')[0] ?? today);
      setInvoiceNumber(existingAP.invoiceNumber);
      setInvoiceDate(existingAP.invoiceDate?.split('T')[0] ?? today);
      setDueDate(existingAP.dueDate?.split('T')[0] ?? addDays(today, 30));
      setNotes(existingAP.notes ?? '');
      setLines(
        existingAP.lines.map((l) => {
          // Reason: the API returns the AP line's actual invoice price as
          // `unitPrice`. A nullable `invoiceUnitPrice` alias also exists but
          // is not populated by the current response builder, so reading it
          // alone yields undefined → React shows 0 in the number input.
          // Coalesce against unitPrice to get the real stored value.
          const recv = l as typeof l & { unitPrice?: number | string | null };
          const storedPrice =
            (l.invoiceUnitPrice ?? recv.unitPrice ?? 0) as number | string;
          return {
            grLineId: l.grLineId,
            // itemId may not be present on the AP line response shape — default
            // to empty string so the Map lookup returns undefined (no override).
            itemId: (l as typeof l & { itemId?: string }).itemId ?? '',
            itemCode: l.itemCode,
            itemName: l.itemName,
            uom: l.uom,
            quantity: l.quantity,
            poUnitPrice: Number(l.poUnitPrice ?? 0),
            invoiceUnitPrice: Number(storedPrice),
            taxCode: l.taxCode,
            discountPercent: l.discountPercent ?? 0,
            costCenterId: l.costCenterId ?? null,
          };
        })
      );
      if (!selectedGrDocId && existingAP.grDocId) {
        setSelectedGrDocId(existingAP.grDocId);
      }
    }
  }, [existingAP, isEdit]);

  // ── Live totals ────────────────────────────────────────────────────────────

  const computedLines = useMemo(
    () => lines.map((l) => ({ ...l, ...computeLineTotals(l, taxCodes) })),
    [lines, taxCodes]
  );

  const totals = useMemo(() => {
    const subtotalNet = computedLines.reduce((s, l) => s + l.lineNet, 0);
    const totalTax = computedLines.reduce((s, l) => s + l.lineTax, 0);
    const totalGross = subtotalNet + totalTax;
    const totalVariance = computedLines.reduce((s, l) => s + l.variance, 0);
    return { subtotalNet, totalTax, totalGross, totalVariance };
  }, [computedLines]);

  const currency = sourceGR?.currencyCode ?? existingAP?.currencyCode ?? 'AED';
  const hasAnyVariance = totals.totalVariance !== 0;

  // ── Line mutation helpers ──────────────────────────────────────────────────

  const setLineInvoicePrice = (grLineId: string, price: number) => {
    setLines((prev) =>
      prev.map((l) => (l.grLineId === grLineId ? { ...l, invoiceUnitPrice: price } : l))
    );
  };

  const setLineTaxCode = (grLineId: string, code: string) => {
    setLines((prev) =>
      prev.map((l) => (l.grLineId === grLineId ? { ...l, taxCode: code } : l))
    );
  };

  // ── Submit handler ─────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setError(null);

    if (!invoiceNumber.trim()) {
      setError('Vendor Invoice Number is required.');
      return;
    }
    if (!invoiceDate) {
      setError('Invoice Date is required.');
      return;
    }
    if (lines.length === 0) {
      setError('At least one line is required.');
      return;
    }

    const linePayload: APLineCreate[] = lines.map((l) => ({
      grLineId: l.grLineId,
      invoiceUnitPrice: Number(l.invoiceUnitPrice),
      taxCode: l.taxCode || null,
    }));

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          docId: editDocId!,
          data: {
            invoiceNumber: invoiceNumber.trim(),
            invoiceDate,
            dueDate: dueDate || null,
            notes: notes.trim() || null,
            lines: linePayload,
          },
          organizationId: orgId,
        });
        navigate(`/purchasing/ap/${editDocId}`);
      } else {
        const created = await createMutation.mutateAsync({
          grDocId: effectiveGrDocId!,
          data: {
            docDate,
            invoiceNumber: invoiceNumber.trim(),
            invoiceDate,
            dueDate: dueDate || null,
            notes: notes.trim() || null,
            lines: linePayload,
          },
          organizationId: orgId,
        });
        navigate(`/purchasing/ap/${created.docId}`);
      }
    } catch (err: unknown) {
      // Reason: FastAPI returns `detail` as either a string (business-rule
      // errors via ValueError) OR an array of validation objects (Pydantic
      // 422s). Setting state to the array and rendering it as a React child
      // throws "Objects are not valid as a React child" and blanks the page.
      // Stringify defensively so any shape lands as a readable banner.
      const axiosErr = err as {
        response?: { data?: { detail?: unknown } };
        message?: string;
      };
      const detail = axiosErr?.response?.data?.detail;
      let message: string;
      if (typeof detail === 'string') {
        message = detail;
      } else if (Array.isArray(detail)) {
        // Reason: translate Pydantic loc paths to human-friendly form errors.
        // Backend's loc looks like ["body", "lines", 0, "grLineId"] — we map
        // known fields and present row numbers as "Line N" instead of array
        // indices.
        const FIELD_LABELS: Record<string, string> = {
          invoiceNumber: 'Vendor Invoice Number',
          invoiceDate: 'Invoice Date',
          dueDate: 'Due Date',
          docDate: 'Posting Date',
          notes: 'Notes',
          grLineId: 'GR line reference',
          invoiceUnitPrice: 'Invoice Unit Price',
          taxCode: 'Tax Code',
          description: 'Description',
        };
        const humaniseLoc = (loc: unknown[]): string => {
          // Strip leading "body"
          const parts = loc[0] === 'body' ? loc.slice(1) : loc;
          // ["lines", 0, "grLineId"] → "Line 1 · GR line reference"
          if (parts.length === 3 && parts[0] === 'lines' && typeof parts[1] === 'number') {
            const fieldKey = String(parts[2]);
            return `Line ${(parts[1] as number) + 1} · ${FIELD_LABELS[fieldKey] ?? fieldKey}`;
          }
          // ["invoiceNumber"] → "Vendor Invoice Number"
          if (parts.length === 1) {
            const fieldKey = String(parts[0]);
            return FIELD_LABELS[fieldKey] ?? fieldKey;
          }
          return parts.map((p) => String(p)).join(' · ');
        };
        message = detail
          .map((d) => {
            if (typeof d === 'string') return d;
            if (d && typeof d === 'object') {
              const obj = d as { loc?: unknown[]; msg?: string };
              const loc = Array.isArray(obj.loc) ? humaniseLoc(obj.loc) : '';
              const rawMsg = obj.msg ?? 'invalid';
              // Friendly substitutions for the most common Pydantic msgs
              const friendlyMsg = rawMsg
                .replace(/^Input should be a valid string$/i, 'is required (missing or empty).')
                .replace(/^Field required$/i, 'is required.')
                .replace(/^Input should be greater than or equal to/i, 'must be ≥');
              return loc ? `${loc}: ${friendlyMsg}` : friendlyMsg;
            }
            return JSON.stringify(d);
          })
          .join('; ');
      } else {
        message = axiosErr?.message ?? 'Failed to save.';
      }
      setError(message);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const pageTitle = isEdit ? 'Edit AP Invoice' : 'New AP Invoice from GR';

  const handleBack = () => {
    if (isEdit) navigate(`/purchasing/ap/${editDocId}`);
    else navigate('/purchasing/ap');
  };

  // ── Picker mode ────────────────────────────────────────────────────────────

  if (!isEdit && !effectiveGrDocId) {
    return (
      <Container>
        <BackLink onClick={handleBack}>&larr; Back</BackLink>
        <PageHeader
          breadcrumb="— PURCHASING · AP INVOICES"
          title="New AP Invoice"
          emphasizeLastWord
          description="Select the posted GR to invoice against."
        />
        <GRPickerCard
          organizationId={orgId}
          onSelect={(id) => setSelectedGrDocId(id)}
        />
      </Container>
    );
  }

  // ── Form mode ──────────────────────────────────────────────────────────────

  return (
    <Container>
      <BackLink onClick={handleBack}>&larr; Back</BackLink>

      <PageHeader
        breadcrumb="— PURCHASING · AP INVOICES"
        title={pageTitle}
        emphasizeLastWord
        description={isEdit ? `${existingAP?.invoiceNumber ?? ''}` : 'Confirm invoice details against the source GR.'}
      />

      <FinanceUnreachableBanner />

      {/* Source GR context banner */}
      {sourceGR && !isEdit && (
        <Card style={{ borderLeft: `4px solid ${theme.colors.bright.lapis}`, padding: '12px 20px', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 14, color: theme.colors.celeste }}>
            Invoicing against GR <DocCode>{sourceGR.docNumber}</DocCode>{' '}
            {sourceGR.baseDocNumber && <>from PO <DocCode>{sourceGR.baseDocNumber}</DocCode> · </>}
            Vendor: <strong>{sourceGR.vendorName ?? sourceGR.vendorCode ?? '—'}</strong>
          </p>
        </Card>
      )}

      {/* Header fields */}
      <Card>
        <CardTitle>AP Invoice Header</CardTitle>
        <FormRow3>
          <Field>
            <Label htmlFor="ap-invoice-number">Vendor Invoice # *</Label>
            <Input
              id="ap-invoice-number"
              type="text"
              placeholder="Vendor's own invoice number"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="ap-invoice-date">Invoice Date *</Label>
            <Input
              id="ap-invoice-date"
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="ap-due-date">Due Date</Label>
            <Input
              id="ap-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </FormRow3>
        {!isEdit && (
          <FormRow>
            <Field>
              <Label htmlFor="ap-doc-date">AP Document Date *</Label>
              <Input
                id="ap-doc-date"
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
              />
            </Field>
            <div /> {/* spacer */}
          </FormRow>
        )}
        <Field>
          <Label htmlFor="ap-notes">Notes</Label>
          <Textarea
            id="ap-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Payment instructions, discrepancy notes..."
          />
        </Field>
      </Card>

      {/* Lines */}
      {lines.length > 0 ? (
        <Card>
          <CardTitle>Invoice Lines</CardTitle>
          {hasAnyVariance && (
            <VarianceHelpText>
              Variance detected. Rows highlighted have a difference between the
              agreed PO price and the vendor's invoice price.
              Variance &gt; 0 means the vendor invoiced more than agreed.
              The difference posts to Purchase Price Variance at approval.
            </VarianceHelpText>
          )}
          <Table style={{ marginTop: hasAnyVariance ? 12 : 8 }}>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Qty</Th>
                <Th>UoM</Th>
                <Th>PO Unit Price</Th>
                <Th style={{ minWidth: 140 }}>Invoice Unit Price *</Th>
                <Th>Disc %</Th>
                <Th>Tax Code</Th>
                {financeOn && <Th>Cost Center</Th>}
                <Th>Line Net</Th>
                <Th>Tax</Th>
                <Th>Line Gross</Th>
                <Th>Variance</Th>
              </tr>
            </thead>
            <tbody>
              {computedLines.map((line) => {
                const varSign = getVarianceSign(line.variance);
                const varLabel = formatVarianceLabel(line.variance, currency);
                return (
                  <LineRow key={line.grLineId} $hasVariance={line.variance !== 0}>
                    <Td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{line.itemCode}</div>
                      <div style={{ fontSize: 11, color: theme.colors.textSecondary }}>{line.itemName}</div>
                    </Td>
                    <Td style={{ color: theme.colors.textSecondary }}>
                      <AmountValue>{line.quantity}</AmountValue>
                    </Td>
                    <Td>{line.uom}</Td>
                    <Td style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
                      <AmountValue>{formatAmt(line.poUnitPrice, currency)}</AmountValue>
                    </Td>
                    <Td>
                      <NumberInput
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.invoiceUnitPrice}
                        style={{ width: '120px' }}
                        onChange={(e) =>
                          setLineInvoicePrice(
                            line.grLineId,
                            parseFloat(e.target.value) || 0
                          )
                        }
                        aria-label={`Invoice unit price for ${line.itemCode}`}
                      />
                    </Td>
                    <Td style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
                      {line.discountPercent ? `${line.discountPercent}%` : '—'}
                    </Td>
                    <Td>
                      {financeOn ? (
                        <Select
                          value={line.taxCode}
                          style={{ width: '90px', fontSize: 13 }}
                          onChange={(e) => setLineTaxCode(line.grLineId, e.target.value)}
                          aria-label={`Tax code for ${line.itemCode}`}
                        >
                          {taxCodes.filter((tc) => tc.isActive).map((tc) => (
                            <option key={tc.taxCode} value={tc.taxCode}>
                              {tc.taxCode} ({tc.rate}%)
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          type="text"
                          value={line.taxCode}
                          style={{ width: '90px', fontSize: 13 }}
                          onChange={(e) => setLineTaxCode(line.grLineId, e.target.value)}
                          aria-label={`Tax code for ${line.itemCode}`}
                          placeholder="Tax code"
                        />
                      )}
                    </Td>
                    {financeOn && (
                      <Td style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
                        {line.costCenterId ?? '—'}
                      </Td>
                    )}
                    <Td style={{ fontSize: 13 }}>
                      <AmountValue>{formatAmt(line.lineNet, currency)}</AmountValue>
                    </Td>
                    <Td style={{ fontSize: 13 }}>
                      <AmountValue>{formatAmt(line.lineTax, currency)}</AmountValue>
                    </Td>
                    <Td style={{ fontSize: 13 }}>
                      <AmountValue style={{ fontWeight: 700 }}>{formatAmt(line.lineGross, currency)}</AmountValue>
                    </Td>
                    <Td>
                      <VarianceCell $sign={varSign}>{varLabel}</VarianceCell>
                    </Td>
                  </LineRow>
                );
              })}
            </tbody>
          </Table>

          {/* Totals */}
          <TotalsBlock>
            <TotalsRow>
              <TotalsLabel>Subtotal Net</TotalsLabel>
              <TotalsValue>{formatAmt(totals.subtotalNet, currency)}</TotalsValue>
            </TotalsRow>
            <TotalsRow>
              <TotalsLabel>Total Tax</TotalsLabel>
              <TotalsValue>{formatAmt(totals.totalTax, currency)}</TotalsValue>
            </TotalsRow>
            <TotalsRow>
              <TotalsLabel>Total Gross</TotalsLabel>
              <TotalsValue style={{ fontWeight: 700, fontSize: 16 }}>
                {formatAmt(totals.totalGross, currency)}
              </TotalsValue>
            </TotalsRow>
            {totals.totalVariance !== 0 && (
              <TotalsRow>
                <TotalsLabel>Total Variance</TotalsLabel>
                <TotalsVariance $sign={getVarianceSign(totals.totalVariance)}>
                  {formatVarianceLabel(totals.totalVariance, currency)}
                </TotalsVariance>
              </TotalsRow>
            )}
          </TotalsBlock>
        </Card>
      ) : (
        effectiveGrDocId && (
          <Card>
            <p style={{ fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center' }}>
              Loading GR lines...
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
