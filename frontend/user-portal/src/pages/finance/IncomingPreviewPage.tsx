/**
 * IncomingPreviewPage
 *
 * Finance-side read-only view of operational documents (PR + PO)
 * that are currently in "Pending Approval" status.
 *
 * Per INTEGRATION_MODEL.md §3.1:
 *   "Pending Approval | Finance shows a thin 'Incoming' preview by reading
 *    the operational doc through a read-through endpoint that proxies to the
 *    main app. No materialization."
 *
 * In v1 there is no separate proxy endpoint — the finance UI calls the main
 * app's existing purchasing endpoints directly using the user's JWT (same SPA).
 *
 * Route: /finance/incoming
 *
 * Role gating (READ ONLY — no actions of any kind):
 *   accountant, finance_admin, auditor, admin, super_admin
 *
 * This is NOT an approval page. There are intentionally no Approve / Reject
 * buttons here. Approvals happen on the operational side via /purchasing/approvals.
 */

import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useAuthStore } from '../../stores/auth.store';
import {
  useIncomingPRs,
  useIncomingPOs,
  useIncomingPRDetail,
  useIncomingPODetail,
} from '../../hooks/queries/useIncomingDocs';
import { useFinanceCompanies } from '../../hooks/queries/useFinanceCompanies';
import type {
  PurchaseRequest,
  PurchaseOrder,
  DocumentLine,
} from '../../services/purchasingApi';

// ─── Role gate ─────────────────────────────────────────────────────────────────

const READ_ROLES = new Set([
  'accountant',
  'finance_admin',
  'auditor',
  'admin',
  'super_admin',
]);

const PLATFORM_DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';

// ─── Doc type filter ───────────────────────────────────────────────────────────

type DocTypeFilter = 'all' | 'PR' | 'PO';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format an ISO datetime as a relative time string ("2 hours ago", "3 days ago").
 */
function relativeTime(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
    const diffMon = Math.floor(diffDay / 30);
    return `${diffMon} month${diffMon !== 1 ? 's' : ''} ago`;
  } catch {
    return isoString;
  }
}

/**
 * Format a date string as short readable date.
 */
function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

/**
 * Format a decimal string or number as AED currency.
 */
function formatAED(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Derive initials from a userId for the avatar.
 * Takes the first two characters (uppercased) as a placeholder.
 */
function userInitials(userId: string | null | undefined): string {
  if (!userId) return '?';
  // If it looks like a UUID, use first 2 chars of the first segment.
  // If it looks like an email, use first char before @ and first char after @.
  if (userId.includes('@')) {
    const parts = userId.split('@');
    return `${(parts[0]?.[0] ?? '?').toUpperCase()}${(parts[1]?.[0] ?? '').toUpperCase()}`;
  }
  return userId.slice(0, 2).toUpperCase();
}

/**
 * Human-friendly label for an approver role string.
 */
const ROLE_LABELS: Record<string, string> = {
  procurement_manager: 'Procurement Manager',
  finance_admin: 'Finance Admin',
  admin: 'Admin',
  super_admin: 'Super Admin',
  department_head: 'Department Head',
  cfo: 'CFO',
};

function roleLabel(role: string | null | undefined): string {
  if (!role) return '—';
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ');
}

// ─── Styled Components ─────────────────────────────────────────────────────────

const PageContainer = styled.div`
  padding: 24px 32px;
  max-width: 1600px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
`;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const PageSubtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 4px 0 0;
`;

const PendingBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 700;
  background: ${({ theme }) => theme.colors.status.warning ?? 'rgba(184,132,42,0.06)'};
  color: ${({ theme }) => theme.colors.status.warning ?? '#B8842A'};
  border: 1px solid ${({ theme }) => theme.colors.status.warning ?? '#fde68a'};
  white-space: nowrap;
  align-self: center;
`;

// ─── Toolbar ───────────────────────────────────────────────────────────────────

const ToolbarRow = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  align-items: center;
`;

// Doc type pill toggle
const PillGroup = styled.div`
  display: inline-flex;
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
`;

interface PillButtonProps {
  $active: boolean;
}

const PillButton = styled.button<PillButtonProps>`
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 120ms ease;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.surface.raised : 'transparent'};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.text.primary : theme.colors.text.secondary};
  box-shadow: ${({ $active }) => ($active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none')};
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 2px;
  }
`;

const FilterSelect = styled.select`
  padding: 9px 13px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 200px;
  padding: 9px 13px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &::placeholder {
    color: ${({ theme }) => theme.colors.text.tertiary};
  }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
`;

const RefreshButton = styled.button`
  padding: 8px 14px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 120ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
    color: ${({ theme }) => theme.colors.text.primary};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ─── Table ─────────────────────────────────────────────────────────────────────

const TableWrapper = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 12px;
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`;

const Thead = styled.thead`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const Th = styled.th`
  padding: 10px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: ${({ theme }) => theme.colors.text.secondary};
  white-space: nowrap;
`;

const Tbody = styled.tbody``;

interface TrProps {
  $expanded?: boolean;
}

const Tr = styled.tr<TrProps>`
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  transition: background 100ms ease;
  background: ${({ $expanded, theme }) =>
    $expanded ? theme.colors.surface.canvas : 'transparent'};
  &:last-child {
    border-bottom: none;
  }
  &:hover {
    background: ${({ theme }) => theme.colors.surface.canvas};
  }
`;

const ExpansionTr = styled.tr`
  background: ${({ theme }) => theme.colors.surface.canvas};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const Td = styled.td`
  padding: 10px 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  vertical-align: middle;
`;

const TdWide = styled.td`
  padding: 0;
`;

// ─── Pills / Badges ────────────────────────────────────────────────────────────

const PRPill = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  background: ${({ theme }) => theme.colors.surface.sunken ?? 'rgba(15,110,86,0.05)'};
  color: ${({ theme }) => theme.colors.status.info ?? '#0F6E56'};
`;

const POPill = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  background: ${({ theme }) => theme.colors.accent.sageSoft ?? '#ecfdf5'};
  color: ${({ theme }) => theme.colors.status.success ?? '#0F6E56'};
`;

const UrgentPill = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 700;
  background: ${({ theme }) => theme.colors.status.danger ?? 'rgba(158,42,42,0.06)'};
  color: ${({ theme }) => theme.colors.status.danger ?? '#9E2A2A'};
  margin-left: 6px;
`;

// ─── Avatar ────────────────────────────────────────────────────────────────────

const AvatarWrapper = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const Avatar = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.accent.sageSoft};
  color: ${({ theme }) => theme.colors.accent.sageDeep};
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
`;

// ─── View button ───────────────────────────────────────────────────────────────

interface ViewButtonProps {
  $expanded: boolean;
}

const ViewButton = styled.button<ViewButtonProps>`
  padding: 5px 12px;
  background: transparent;
  color: ${({ $expanded, theme }) =>
    $expanded ? theme.colors.accent.sageDeep : theme.colors.accent.sage};
  border: 1px solid
    ${({ $expanded, theme }) =>
      $expanded ? theme.colors.accent.sageDeep : theme.colors.accent.sageSoft};
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 120ms ease;
  &:hover {
    background: ${({ theme }) => theme.colors.accent.sageSoft};
    border-color: ${({ theme }) => theme.colors.accent.sage};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.sage};
    outline-offset: 2px;
  }
`;

// ─── Expansion Panel ───────────────────────────────────────────────────────────

const ExpansionPanel = styled.div`
  padding: 20px 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
`;

const ExpansionSection = styled.div`
  margin-bottom: 20px;
  &:last-child {
    margin-bottom: 0;
  }
`;

const ExpansionSectionTitle = styled.h3`
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 10px;
`;

const LinesTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
`;

const LinesThead = styled.thead`
  background: ${({ theme }) => theme.colors.surface.raised};
`;

const LinesTh = styled.th`
  padding: 7px 10px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: ${({ theme }) => theme.colors.text.secondary};
  white-space: nowrap;
`;

const LinesTd = styled.td`
  padding: 7px 10px;
  color: ${({ theme }) => theme.colors.text.primary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
  vertical-align: middle;
`;

const LinesWrapper = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 8px;
  overflow: hidden;
`;

const ApprovalTimeline = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0;
  line-height: 1.6;
`;

const NotesBox = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.surface.canvas};
  border: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  border-radius: 6px;
  padding: 10px 14px;
  margin: 0;
  line-height: 1.5;
`;

const LoadingInPanel = styled.div`
  padding: 20px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.tertiary};
  font-size: 13px;
`;

const ErrorInPanel = styled.div`
  padding: 20px;
  text-align: center;
  color: ${({ theme }) => theme.colors.status.danger};
  font-size: 13px;
`;

// ─── Empty/loading/error states ────────────────────────────────────────────────

const EmptyState = styled.div`
  padding: 64px 32px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text.tertiary};
  font-size: 15px;
  line-height: 1.6;
`;

const EmptyIcon = styled.div`
  font-size: 48px;
  margin-bottom: 12px;
`;

// ─── Unified doc row type ──────────────────────────────────────────────────────
// We combine PR and PO into a single list for the table.

interface DocRow {
  docId: string;
  docType: 'PR' | 'PO';
  docNumber: string;
  companyCode: string;
  requesterOrIssuer: string | null | undefined;
  deptOrVendor: string | null | undefined;
  totalGross: number;
  currencyCode: string;
  pendingSince: string | null | undefined;
  approvalRequestedFrom: string | null | undefined;
  urgency?: string | null;
  baseDocId?: string | null;
  notes?: string | null;
}

function prToRow(pr: PurchaseRequest): DocRow {
  return {
    docId: pr.docId,
    docType: 'PR',
    docNumber: pr.docNumber,
    companyCode: pr.companyCode,
    requesterOrIssuer: pr.requestedBy,
    deptOrVendor: pr.department,
    totalGross: pr.totalGross,
    currencyCode: pr.currencyCode,
    pendingSince: pr.approvalRequestedAt ?? pr.updatedAt,
    approvalRequestedFrom: pr.approvalRequestedFrom,
    urgency: pr.urgency,
    baseDocId: pr.baseDocId,
    notes: pr.notes,
  };
}

function poToRow(po: PurchaseOrder): DocRow {
  return {
    docId: po.docId,
    docType: 'PO',
    docNumber: po.docNumber,
    companyCode: po.companyCode,
    requesterOrIssuer: po.issuedBy,
    deptOrVendor: po.vendorCode ?? po.vendorName,
    totalGross: po.totalGross,
    currencyCode: po.currencyCode,
    pendingSince: po.approvalRequestedAt ?? po.updatedAt,
    approvalRequestedFrom: po.approvalRequestedFrom,
    urgency: undefined,
    baseDocId: po.baseDocId,
    notes: po.notes,
  };
}

// ─── Expansion Panel component ─────────────────────────────────────────────────

interface ExpansionProps {
  row: DocRow;
  organizationId: string;
}

function RowExpansion({ row, organizationId }: ExpansionProps) {
  const isPR = row.docType === 'PR';

  const prDetail = useIncomingPRDetail(
    isPR ? row.docId : null,
    isPR ? organizationId : null
  );
  const poDetail = useIncomingPODetail(
    !isPR ? row.docId : null,
    !isPR ? organizationId : null
  );

  const isLoading = isPR ? prDetail.isLoading : poDetail.isLoading;
  const isError = isPR ? prDetail.isError : poDetail.isError;
  const lines: DocumentLine[] = isPR
    ? (prDetail.data?.lines ?? [])
    : (poDetail.data?.lines ?? []);

  const requestedBy = isPR ? prDetail.data?.requestedBy : poDetail.data?.issuedBy;
  const requestedAt = isPR
    ? (prDetail.data?.approvalRequestedAt ?? prDetail.data?.docDate)
    : (poDetail.data?.approvalRequestedAt ?? poDetail.data?.docDate);

  if (isLoading) {
    return (
      <ExpansionPanel>
        <LoadingInPanel>Loading document details...</LoadingInPanel>
      </ExpansionPanel>
    );
  }

  if (isError) {
    return (
      <ExpansionPanel>
        <ErrorInPanel>Failed to load document details. Please try again.</ErrorInPanel>
      </ExpansionPanel>
    );
  }

  return (
    <ExpansionPanel>
      {/* Lines */}
      <ExpansionSection>
        <ExpansionSectionTitle>Line Items</ExpansionSectionTitle>
        {lines.length === 0 ? (
          <ApprovalTimeline>No line items found.</ApprovalTimeline>
        ) : (
          <LinesWrapper>
            <LinesTable aria-label={`Line items for ${row.docNumber}`}>
              <LinesThead>
                <tr>
                  <LinesTh>#</LinesTh>
                  <LinesTh>Item Code</LinesTh>
                  <LinesTh>Item Name</LinesTh>
                  <LinesTh>Qty</LinesTh>
                  <LinesTh>UOM</LinesTh>
                  <LinesTh>Unit Price</LinesTh>
                  <LinesTh>Net</LinesTh>
                </tr>
              </LinesThead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.lineId}>
                    <LinesTd>{line.lineNumber}</LinesTd>
                    <LinesTd style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {line.itemCode}
                    </LinesTd>
                    <LinesTd>{line.itemName}</LinesTd>
                    <LinesTd>{line.quantity}</LinesTd>
                    <LinesTd>{line.uom}</LinesTd>
                    <LinesTd>{formatAED(line.unitPrice)}</LinesTd>
                    <LinesTd style={{ fontWeight: 600 }}>{formatAED(line.lineNet)}</LinesTd>
                  </tr>
                ))}
              </tbody>
            </LinesTable>
          </LinesWrapper>
        )}
      </ExpansionSection>

      {/* Notes */}
      {row.notes && (
        <ExpansionSection>
          <ExpansionSectionTitle>Notes</ExpansionSectionTitle>
          <NotesBox>{row.notes}</NotesBox>
        </ExpansionSection>
      )}

      {/* Approval timeline */}
      <ExpansionSection>
        <ExpansionSectionTitle>Approval Timeline</ExpansionSectionTitle>
        <ApprovalTimeline>
          {isPR ? 'Requested' : 'Issued'} by{' '}
          <strong>{requestedBy ?? '—'}</strong>
          {requestedAt && ` on ${formatDate(requestedAt)}`}.{' '}
          Approval requested from{' '}
          <strong>{roleLabel(row.approvalRequestedFrom)}</strong>.
        </ApprovalTimeline>
      </ExpansionSection>

      {/* Base PR reference (PO only) */}
      {!isPR && row.baseDocId && (
        <ExpansionSection>
          <ExpansionSectionTitle>Source Document</ExpansionSectionTitle>
          <ApprovalTimeline>
            Created from PR (id: <code>{row.baseDocId}</code>).
          </ApprovalTimeline>
        </ExpansionSection>
      )}

      {/* Cross-link to the operational doc — finance observes here, approvals
          and edits happen on the Purchasing side. */}
      <ExpansionSection>
        <ExpansionSectionTitle>Take Action</ExpansionSectionTitle>
        <ApprovalTimeline>
          To approve, reject, or edit this document, open it in Purchasing:{' '}
          <Link
            to={isPR ? `/pr/${row.docId}` : `/po/${row.docId}`}
            style={{ fontWeight: 600 }}
          >
            Open {row.docNumber} in Purchasing →
          </Link>
          {' '}or visit the{' '}
          <Link to="/purchasing/approvals" style={{ fontWeight: 600 }}>
            Approval Inbox
          </Link>{' '}
          for all docs awaiting your approval.
        </ApprovalTimeline>
      </ExpansionSection>
    </ExpansionPanel>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────────

export function IncomingPreviewPage() {
  const { user } = useAuthStore();

  // Resolve org ID from user runtime shape (memory note: uses userId not id)
  const organizationId: string = useMemo(() => {
    if (user?.organizationId) return user.organizationId;
    if (user?.role === 'super_admin') return PLATFORM_DEFAULT_ORG;
    return '';
  }, [user]);

  const canRead = READ_ROLES.has(user?.role ?? '');

  // ── Company filter ─────────────────────────────────────────────────────────

  const { data: companiesData, isLoading: companiesLoading } = useFinanceCompanies(
    organizationId || null
  );
  const companies = companiesData ?? [];

  // ── Data fetches ───────────────────────────────────────────────────────────

  const {
    data: prData,
    isLoading: prLoading,
    isError: prError,
    refetch: refetchPRs,
  } = useIncomingPRs(organizationId || null);

  const {
    data: poData,
    isLoading: poLoading,
    isError: poError,
    refetch: refetchPOs,
  } = useIncomingPOs(organizationId || null);

  // ── Toolbar state ──────────────────────────────────────────────────────────

  const [docTypeFilter, setDocTypeFilter] = useState<DocTypeFilter>('all');
  const [companyFilter, setCompanyFilter] = useState('');
  const [searchText, setSearchText] = useState('');

  // ── Row expansion state ────────────────────────────────────────────────────
  // Only one row can be expanded at a time. Clicking a row that's already
  // expanded collapses it; clicking a different row expands it instead.

  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  const toggleExpand = useCallback((docId: string) => {
    setExpandedDocId((prev) => (prev === docId ? null : docId));
  }, []);

  // ── Merge + filter ─────────────────────────────────────────────────────────

  const allRows: DocRow[] = useMemo(() => {
    const rows: DocRow[] = [];
    if (docTypeFilter !== 'PO') {
      (prData?.data ?? []).forEach((pr) => rows.push(prToRow(pr)));
    }
    if (docTypeFilter !== 'PR') {
      (poData?.data ?? []).forEach((po) => rows.push(poToRow(po)));
    }
    return rows;
  }, [prData, poData, docTypeFilter]);

  const filteredRows = useMemo(() => {
    let rows = allRows;

    // Company filter
    if (companyFilter) {
      rows = rows.filter((r) => r.companyCode === companyFilter);
    }

    // Search: docNumber, vendorCode/dept, notes
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.docNumber.toLowerCase().includes(q) ||
          (r.deptOrVendor ?? '').toLowerCase().includes(q) ||
          (r.notes ?? '').toLowerCase().includes(q)
      );
    }

    return rows;
  }, [allRows, companyFilter, searchText]);

  // ── Pending count ──────────────────────────────────────────────────────────

  const totalPending = (prData?.meta.total ?? 0) + (poData?.meta.total ?? 0);

  // ── Refresh handler ────────────────────────────────────────────────────────

  const isLoading = prLoading || poLoading;
  const isRefetching = false; // Unused but could be extended

  const handleRefresh = useCallback(() => {
    void refetchPRs();
    void refetchPOs();
  }, [refetchPRs, refetchPOs]);

  // ── No access guard ────────────────────────────────────────────────────────

  if (!canRead) {
    return (
      <PageContainer>
        <EmptyState>You don&apos;t have permission to view incoming documents.</EmptyState>
      </PageContainer>
    );
  }

  if (!organizationId) {
    return (
      <PageContainer>
        <EmptyState>No organization assigned to this account.</EmptyState>
      </PageContainer>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const showEmptyState =
    !isLoading &&
    !prError &&
    !poError &&
    filteredRows.length === 0;

  return (
    <PageContainer>
      <PageHeader>
        <div>
          <PageTitle>Incoming Preview</PageTitle>
          <PageSubtitle>
            Read-only view of PRs and POs currently awaiting approval. Approvals
            are actioned on the operational side via Purchasing &rsaquo; Approval Inbox.
          </PageSubtitle>
        </div>
        {totalPending > 0 && (
          <PendingBadge aria-label={`${totalPending} documents pending approval`}>
            {totalPending} pending
          </PendingBadge>
        )}
      </PageHeader>

      <ToolbarRow>
        {/* Doc type pill toggle */}
        <PillGroup role="group" aria-label="Filter by document type">
          {(['all', 'PR', 'PO'] as DocTypeFilter[]).map((t) => (
            <PillButton
              key={t}
              $active={docTypeFilter === t}
              onClick={() => setDocTypeFilter(t)}
              aria-pressed={docTypeFilter === t}
            >
              {t === 'all' ? 'All' : t === 'PR' ? 'PR only' : 'PO only'}
            </PillButton>
          ))}
        </PillGroup>

        {/* Company filter */}
        <FilterSelect
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          aria-label="Filter by company code"
        >
          <option value="">All Companies</option>
          {companiesLoading ? (
            <option disabled>Loading...</option>
          ) : (
            companies.map((c) => (
              <option key={c.companyCode} value={c.companyCode}>
                {c.companyCode} — {c.legalName}
              </option>
            ))
          )}
        </FilterSelect>

        {/* Search */}
        <SearchInput
          type="search"
          placeholder="Search by doc number, vendor, department..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          aria-label="Search incoming documents"
        />

        {/* Refresh */}
        <RefreshButton
          onClick={handleRefresh}
          disabled={isLoading || isRefetching}
          aria-label="Refresh incoming documents"
          title="Refresh list"
        >
          ↻ Refresh
        </RefreshButton>
      </ToolbarRow>

      {/* Loading state */}
      {isLoading && <EmptyState>Loading incoming documents...</EmptyState>}

      {/* Error state */}
      {!isLoading && (prError || poError) && (
        <EmptyState style={{ color: 'var(--color-error)' }}>
          Failed to load documents. Please refresh the page.
        </EmptyState>
      )}

      {/* Table */}
      {!isLoading && !prError && !poError && (
        <TableWrapper>
          {showEmptyState ? (
            // Empty state — displayed inside the table wrapper area
            <EmptyState>
              <EmptyIcon aria-hidden="true">📭</EmptyIcon>
              No documents are currently pending approval. New submissions will
              appear here automatically.
            </EmptyState>
          ) : (
            <Table aria-label="Incoming documents pending approval">
              <Thead>
                <tr>
                  <Th>Doc Number</Th>
                  <Th>Type</Th>
                  <Th>Company</Th>
                  <Th>Requester / Issuer</Th>
                  <Th>Dept / Vendor</Th>
                  <Th>Total</Th>
                  <Th>Pending Since</Th>
                  <Th>Required From</Th>
                  <Th>Action</Th>
                </tr>
              </Thead>
              <Tbody>
                {filteredRows.map((row) => {
                  const isExpanded = expandedDocId === row.docId;
                  return (
                    <>
                      <Tr
                        key={row.docId}
                        $expanded={isExpanded}
                        aria-expanded={isExpanded}
                      >
                        {/* Doc Number — clickable to expand */}
                        <Td>
                          <button
                            onClick={() => toggleExpand(row.docId)}
                            aria-expanded={isExpanded}
                            aria-controls={`expansion-${row.docId}`}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 13,
                              fontWeight: 600,
                              color: 'inherit',
                              textDecoration: isExpanded ? 'underline' : 'none',
                            }}
                          >
                            {row.docNumber}
                          </button>
                          {row.docType === 'PR' && row.urgency === 'high' && (
                            <UrgentPill aria-label="High priority">High</UrgentPill>
                          )}
                        </Td>

                        {/* Type pill */}
                        <Td>
                          {row.docType === 'PR' ? (
                            <PRPill>PR</PRPill>
                          ) : (
                            <POPill>PO</POPill>
                          )}
                        </Td>

                        {/* Company Code */}
                        <Td>{row.companyCode}</Td>

                        {/* Requester / Issuer — initials avatar + tooltip */}
                        <Td>
                          {row.requesterOrIssuer ? (
                            <AvatarWrapper title={row.requesterOrIssuer}>
                              <Avatar aria-hidden="true">
                                {userInitials(row.requesterOrIssuer)}
                              </Avatar>
                              <span
                                style={{ fontSize: 12, color: 'var(--color-text-disabled)' }}
                              >
                                {row.requesterOrIssuer.length > 20
                                  ? `${row.requesterOrIssuer.slice(0, 18)}…`
                                  : row.requesterOrIssuer}
                              </span>
                            </AvatarWrapper>
                          ) : (
                            '—'
                          )}
                        </Td>

                        {/* Dept (PR) or Vendor (PO) */}
                        <Td>
                          <span title={row.deptOrVendor ?? ''}>
                            {row.deptOrVendor ?? '—'}
                          </span>
                        </Td>

                        {/* Total */}
                        <Td style={{ fontWeight: 600 }}>
                          {formatAED(row.totalGross)}
                        </Td>

                        {/* Pending since */}
                        <Td title={row.pendingSince ?? ''}>
                          {relativeTime(row.pendingSince)}
                        </Td>

                        {/* Required from */}
                        <Td>{roleLabel(row.approvalRequestedFrom)}</Td>

                        {/* View / Collapse */}
                        <Td>
                          <ViewButton
                            $expanded={isExpanded}
                            onClick={() => toggleExpand(row.docId)}
                            aria-controls={`expansion-${row.docId}`}
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? 'Collapse' : 'View'}
                          </ViewButton>
                        </Td>
                      </Tr>

                      {/* Inline expansion row — only visible when expanded */}
                      {isExpanded && (
                        <ExpansionTr key={`${row.docId}-expansion`}>
                          <TdWide
                            colSpan={9}
                            id={`expansion-${row.docId}`}
                            role="region"
                            aria-label={`Details for ${row.docNumber}`}
                          >
                            <RowExpansion
                              row={row}
                              organizationId={organizationId}
                            />
                          </TdWide>
                        </ExpansionTr>
                      )}
                    </>
                  );
                })}
              </Tbody>
            </Table>
          )}

          {/* Row count footer */}
          {!showEmptyState && (
            <div
              style={{
                padding: '10px 14px',
                fontSize: 12,
                color: 'var(--color-text-disabled)',
                borderTop: '1px solid var(--color-neutral-100)',
              }}
            >
              {filteredRows.length} document{filteredRows.length !== 1 ? 's' : ''}
              {totalPending > filteredRows.length
                ? ` (${totalPending} total)`
                : ''}
              {searchText ? ` matching "${searchText}"` : ''}
              {' '}— auto-refreshes every 30 seconds
            </div>
          )}
        </TableWrapper>
      )}
    </PageContainer>
  );
}
