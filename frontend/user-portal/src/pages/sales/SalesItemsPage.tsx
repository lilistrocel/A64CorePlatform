/**
 * SalesItemsPage  (T-200.9)
 *
 * Admin/setup surface for per-item sales finance configuration.
 * Displays the sale_item_finance_ext records from the finance microservice.
 * Allows accountants to view and edit the GL account mappings and tax code
 * that are snapshotted onto each sales document line at create time.
 *
 * Route: /sales/items
 * Roles: accountant, finance_admin, finance_reviewer, auditor, admin, super_admin
 *
 * This is a settings page, not a document CRUD — so no status badges,
 * no contextual action bar, and no document lifecycle buttons.
 *
 * Architecture note: items are fetched from the finance service's
 * GET /api/v1/finance/item-finance-ext endpoint which returns ext records
 * already containing itemCode and itemName (denormalized from ops at create
 * time).  Items with no ext record are not visible here (they cannot be
 * created from this page — the finance admin would need to use the API
 * or the item must go through the delivery flow at least once for the
 * code to call the finance service and create the record).
 *
 * Edit modal:
 *  - Does NOT close on overlay click (project rule — data-entry modals).
 *  - Closes only via the X button.
 *  - Save → PATCH /api/v1/finance/item-finance-ext/{itemId}
 *
 * Night Observatory (T-901): the page's own local "PageHeader" styled div
 * has been replaced by the shared PageHeader component. The edit modal now
 * uses the canonical glassPanel-at-blur-24px modal treatment (spec §4).
 */

import {
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import styled, { useTheme } from 'styled-components';
import { X } from 'lucide-react';
import { glassPanel, glassControl, monoLabel, PageHeader } from '@a64core/shared';
import { useAuthStore } from '../../stores/auth.store';
import {
  useSaleItemFinanceExtList,
  useUpdateSaleItemFinanceExt,
} from '../../hooks/queries/useSaleItemFinanceExt';
import { useFinanceAccounts } from '../../hooks/queries/useFinanceAccounts';
import { useTaxCodes } from '../../hooks/queries/useTaxCodes';
import { AccountCombobox } from '../../components/finance/AccountCombobox';
import type { SaleItemFinanceExt } from '../../services/salesApi';
import type { GLAccount } from '../../services/financeAccountsService';

// ─── Styled components ────────────────────────────────────────────────────────

const PageWrapper = styled.div`
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
`;

const TableWrapper = styled.div`
  ${glassPanel}
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
`;

const Th = styled.th`
  ${monoLabel}
  text-align: left;
  padding: 10px 14px;
  color: ${({ theme }) => theme.colors.celeste};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 10px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  vertical-align: middle;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Tr = styled.tr`
  &:last-child td {
    border-bottom: none;
  }
  &:hover td {
    background: rgba(180, 200, 220, 0.05);
  }
`;

const ItemCodeBadge = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.8rem;
  background: rgba(180, 200, 220, 0.05);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 4px;
  padding: 2px 6px;
  white-space: nowrap;
`;

const AccountLabel = styled.span`
  font-size: 0.8125rem;
`;

const AccountNumber = styled.span`
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.celeste};
  margin-right: 6px;
`;

const UnconfiguredBadge = styled.span`
  color: ${({ theme }) => theme.colors.bright.gold};
  font-size: 0.8rem;
  font-style: italic;
`;

const TaxCodePill = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  background: ${({ theme }) => theme.colors.infoBg};
  color: ${({ theme }) => theme.colors.bright.lapis};
`;

const SellableChip = styled.span<{ $active: boolean }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  background: ${({ $active, theme }) => ($active ? theme.colors.successBg : 'transparent')};
  border: 1px solid ${({ $active, theme }) => ($active ? 'transparent' : theme.colors.line)};
  color: ${({ $active, theme }) => ($active ? theme.colors.bright.emerald : theme.colors.muted)};
`;

/**
 * T-201.8 — Type badge: Stock (lapis) / Service (gold-b warning tint).
 * $isStock=true  → Stock   (lapis family, mirrors "active/in-progress" phase language)
 * $isStock=false → Service (gold-b warning tint, visually distinct but not alarming)
 */
const TypeChip = styled.span<{ $isStock: boolean }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  background: ${({ $isStock, theme }) => ($isStock ? theme.colors.infoBg : theme.colors.warningBg)};
  color: ${({ $isStock, theme }) => ($isStock ? theme.colors.bright.lapis : theme.colors.bright.gold)};
`;

const ActionBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.celeste};
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: ${({ theme }) => theme.colors.muted};
`;

const LoadingState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: ${({ theme }) => theme.colors.muted};
`;

const ErrorState = styled.div`
  padding: 16px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 0.875rem;
`;

// ─── Edit Modal ───────────────────────────────────────────────────────────────
// Canonical modal treatment (spec §4): glassPanel at blur 24px over a cosmos
// scrim, 20px radius. Does NOT close on overlay click (project rule).

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 36, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  /* Intentionally no onClick handler — overlay click must NOT close modal. */
`;

const ModalBox = styled.div`
  ${glassPanel}
  border-radius: 20px;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  width: 560px;
  max-width: calc(100vw - 32px);
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
`;

const ModalTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const ModalClose = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.celeste};
  padding: 4px;
  border-radius: 4px;
  line-height: 1;
  &:hover {
    background: rgba(180, 200, 220, 0.07);
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const ModalBody = styled.div`
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 24px 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FormLabel = styled.label`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const FormHint = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
`;

const FormSelect = styled.select`
  ${glassControl}
  width: 100%;
  padding: 8px 12px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ToggleInput = styled.input`
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: ${({ theme }) => theme.colors.secondary[500]};
`;

const SaveButton = styled.button<{ $loading?: boolean }>`
  padding: 9px 20px;
  border-radius: 10px;
  font-size: 0.875rem;
  font-weight: 700;
  border: none;
  background: linear-gradient(145deg, ${({ theme }) => theme.colors.secondary[500]}, ${({ theme }) => theme.colors.secondary[600]});
  color: ${({ theme }) => theme.colors.onAccent};
  cursor: ${({ $loading }) => ($loading ? 'not-allowed' : 'pointer')};
  opacity: ${({ $loading }) => ($loading ? 0.7 : 1)};
  transition: transform 150ms ease, box-shadow 150ms ease;
  box-shadow: 0 4px 14px rgba(4, 6, 18, 0.35);
  &:hover:not([disabled]) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(4, 6, 18, 0.45), 0 0 16px rgba(220, 185, 79, 0.25);
  }
`;

const CancelButton = styled.button`
  ${glassControl}
  padding: 9px 20px;
  font-size: 0.875rem;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const ErrorBanner = styled.div`
  padding: 10px 14px;
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.errorBg};
  border: 1px solid rgba(240, 138, 112, 0.45);
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: 0.8125rem;
`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditFormState {
  revenueAccountId: string | null;
  cogsAccountId: string | null;
  salesTaxCode: string;
  isSellable: boolean;
  /** T-201.8 — true = physical stock item; false = service / fee / freight. */
  isStock: boolean;
  notes: string;
}

// ─── Helper functions ─────────────────────────────────────────────────────────

/** Render a GL account label — returns accountNumber + name, or "(none)" if null. */
function renderAccount(
  accountId: string | null,
  accounts: GLAccount[],
): React.ReactNode {
  if (!accountId) {
    return <UnconfiguredBadge>— not set —</UnconfiguredBadge>;
  }
  const acct = accounts.find((a) => a.accountId === accountId);
  if (!acct) {
    return <UnconfiguredBadge>Unknown ({accountId.slice(0, 8)})</UnconfiguredBadge>;
  }
  return (
    <AccountLabel>
      <AccountNumber>{acct.accountNumber}</AccountNumber>
      {acct.accountName}
    </AccountLabel>
  );
}

// ─── Edit Modal component ─────────────────────────────────────────────────────

interface EditModalProps {
  ext: SaleItemFinanceExt;
  allAccounts: GLAccount[];
  onClose: () => void;
  onSaved: () => void;
  orgId: string;
}

function EditModal({ ext, allAccounts, onClose, onSaved, orgId }: EditModalProps) {
  const theme = useTheme();
  const updateMutation = useUpdateSaleItemFinanceExt(orgId);
  const { data: taxCodes = [] } = useTaxCodes(orgId);

  const revenueAccounts = useMemo(
    () => allAccounts.filter((a) => a.drawer === 'REVENUE' && !a.isHeader && a.isActive),
    [allAccounts],
  );

  const cogsAccounts = useMemo(
    () => allAccounts.filter((a) => a.drawer === 'COST_OF_SALES' && !a.isHeader && a.isActive),
    [allAccounts],
  );

  const [form, setForm] = useState<EditFormState>({
    revenueAccountId: ext.revenueAccountId,
    cogsAccountId: ext.cogsAccountId,
    salesTaxCode: ext.salesTaxCode ?? '',
    isSellable: ext.isSellable,
    // T-201.8 — default to true if undefined (conservative: treat unknown legacy
    // records as stock to avoid accidentally enabling direct-invoice on stock items).
    isStock: ext.isStock ?? true,
    notes: ext.notes ?? '',
  });

  const [saveError, setSaveError] = useState<string | null>(null);

  // Close on Escape key is intentionally NOT implemented —
  // data-entry modals must only close via the X button (project rule).
  const modalRef = useRef<HTMLDivElement>(null);

  // Stop propagation so overlay clicks (if any parent adds one) don't bubble.
  const stopProp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    try {
      await updateMutation.mutateAsync({
        itemId: ext.itemId,
        body: {
          revenueAccountId: form.revenueAccountId,
          cogsAccountId: form.cogsAccountId,
          salesTaxCode: form.salesTaxCode || null,
          isSellable: form.isSellable,
          isStock: form.isStock,
          notes: form.notes || null,
        },
      });
      onSaved();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to save — check the console for details.';
      setSaveError(msg);
    }
  }, [ext.itemId, form, updateMutation, onSaved]);

  return (
    <ModalOverlay>
      <ModalBox ref={modalRef} onClick={stopProp}>
        <ModalHeader>
          <ModalTitle>
            Edit Finance Config — {ext.itemCode ?? ext.itemId}
          </ModalTitle>
          <ModalClose onClick={onClose} aria-label="Close modal">
            <X size={18} strokeWidth={1.8} />
          </ModalClose>
        </ModalHeader>

        <ModalBody>
          {/* Item info (read-only) */}
          <FormField>
            <FormLabel>Item</FormLabel>
            <div style={{ fontSize: '0.875rem', color: theme.colors.textPrimary }}>
              <ItemCodeBadge>{ext.itemCode ?? '—'}</ItemCodeBadge>
              {ext.itemName && (
                <span style={{ marginLeft: 8 }}>{ext.itemName}</span>
              )}
            </div>
          </FormField>

          {/* Revenue account */}
          <FormField>
            <FormLabel htmlFor="edit-revenue-account">
              Revenue Account
            </FormLabel>
            <FormHint>
              drawer=REVENUE — used by the AR Invoice JE (DR AR / CR Revenue)
            </FormHint>
            <AccountCombobox
              id="edit-revenue-account"
              valueAccountId={form.revenueAccountId}
              accounts={revenueAccounts}
              onChange={(id) =>
                setForm((prev) => ({ ...prev, revenueAccountId: id }))
              }
              placeholder="Search revenue accounts…"
            />
          </FormField>

          {/* COGS account */}
          <FormField>
            <FormLabel htmlFor="edit-cogs-account">
              COGS Account
            </FormLabel>
            <FormHint>
              drawer=COST_OF_SALES — used by the Delivery JE (DR COGS / CR Inventory)
            </FormHint>
            <AccountCombobox
              id="edit-cogs-account"
              valueAccountId={form.cogsAccountId}
              accounts={cogsAccounts}
              onChange={(id) =>
                setForm((prev) => ({ ...prev, cogsAccountId: id }))
              }
              placeholder="Search COGS accounts…"
            />
          </FormField>

          {/* Tax code */}
          <FormField>
            <FormLabel htmlFor="edit-tax-code">Sales Tax Code</FormLabel>
            <FormHint>
              Output VAT code applied at AR Invoice creation
            </FormHint>
            <FormSelect
              id="edit-tax-code"
              value={form.salesTaxCode}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, salesTaxCode: e.target.value }))
              }
            >
              <option value="">— not set —</option>
              {taxCodes.map((tc) => (
                <option key={tc.taxCode} value={tc.taxCode}>
                  {tc.taxCode} — {tc.description} ({tc.rate}%)
                </option>
              ))}
            </FormSelect>
          </FormField>

          {/* isSellable toggle */}
          <FormField>
            <FormLabel>Sellable</FormLabel>
            <ToggleRow>
              <ToggleInput
                type="checkbox"
                id="edit-is-sellable"
                checked={form.isSellable}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, isSellable: e.target.checked }))
                }
              />
              <FormLabel htmlFor="edit-is-sellable" style={{ marginBottom: 0, cursor: 'pointer' }}>
                {form.isSellable
                  ? 'Item is available for sale'
                  : 'Item is NOT available for sale'}
              </FormLabel>
            </ToggleRow>
          </FormField>

          {/* Item type (T-201.8). Two-option radio group rather than a single
              checkbox because Stock vs Service is a category choice — modelling
              it as a boolean checkbox creates ambiguous UX (whichever label sits
              next to an unchecked box implies it's what ticking does). */}
          <FormField>
            <FormLabel>Item type</FormLabel>
            <ToggleRow>
              <ToggleRow as="label" style={{ cursor: 'pointer', gap: 6 }}>
                <ToggleInput
                  type="radio"
                  name="edit-item-type"
                  value="stock"
                  checked={form.isStock === true}
                  onChange={() => setForm((prev) => ({ ...prev, isStock: true }))}
                />
                <span>Stock item</span>
              </ToggleRow>
              <ToggleRow as="label" style={{ cursor: 'pointer', gap: 6 }}>
                <ToggleInput
                  type="radio"
                  name="edit-item-type"
                  value="service"
                  checked={form.isStock === false}
                  onChange={() => setForm((prev) => ({ ...prev, isStock: false }))}
                />
                <span>Service item</span>
              </ToggleRow>
            </ToggleRow>
            <FormHint>
              Stock items decrement inventory and post COGS when delivered.
              Pick Service for fees, freight, retainers, and other non-physical
              charges. Service items are the only ones that can be invoiced directly
              without a Delivery Note.
            </FormHint>
          </FormField>

          {/* Notes */}
          <FormField>
            <FormLabel htmlFor="edit-notes">Notes</FormLabel>
            <textarea
              id="edit-notes"
              value={form.notes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, notes: e.target.value }))
              }
              rows={3}
              maxLength={500}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${theme.colors.line}`,
                borderRadius: '6px',
                fontSize: '0.875rem',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                background: theme.colors.glass.base,
                color: theme.colors.textPrimary,
              }}
              placeholder="Optional notes about this item's finance config…"
            />
          </FormField>

          {saveError && <ErrorBanner>{saveError}</ErrorBanner>}
        </ModalBody>

        <ModalFooter>
          <CancelButton onClick={onClose}>Cancel</CancelButton>
          <SaveButton
            onClick={handleSave}
            $loading={updateMutation.isPending}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
          </SaveButton>
        </ModalFooter>
      </ModalBox>
    </ModalOverlay>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

/** Modal state discriminated union — null means no modal open. */
type ModalState =
  | { type: 'edit'; ext: SaleItemFinanceExt }
  | null;

export function SalesItemsPage() {
  const { user } = useAuthStore();
  const orgId = user?.organizationId ?? null;

  const {
    data: extItems = [],
    isLoading,
    isError,
    error,
  } = useSaleItemFinanceExtList(orgId);

  const { data: accountsData } = useFinanceAccounts(orgId ?? '', { isActive: true });
  // useFinanceAccounts returns paginated { items, total, page, size, pages }.
  // Earlier `.data` here was always undefined → empty list → "Unknown" name
  // labels in the table + empty dropdowns in the edit modal.
  const allAccounts: GLAccount[] = accountsData?.items ?? [];

  const [modalState, setModalState] = useState<ModalState>(null);

  const openEdit = useCallback((ext: SaleItemFinanceExt) => {
    setModalState({ type: 'edit', ext });
  }, []);

  const closeModal = useCallback(() => {
    setModalState(null);
  }, []);

  const handleSaved = useCallback(() => {
    setModalState(null);
  }, []);

  // ─── Keyboard: Escape only closes modals — but NOT for data-entry modals.
  // Per project rule: data-entry modals close only via X button.
  // So we intentionally do NOT wire Escape to close.
  // (Left as a comment to document the decision.)

  const errorMessage =
    isError && error instanceof Error
      ? error.message
      : isError
        ? 'Failed to load item finance configurations.'
        : null;

  return (
    <PageWrapper>
      <PageHeader
        breadcrumb="SALES · SETUP"
        title="Sales Items — Finance Config"
        description="Per-item GL account and VAT code settings used by the AR Invoice and Delivery journal entry handlers. Changes take effect on new documents only."
      />

      {isLoading && (
        <LoadingState>Loading item finance configurations…</LoadingState>
      )}

      {errorMessage && <ErrorState>{errorMessage}</ErrorState>}

      {!isLoading && !errorMessage && (
        <TableWrapper>
          {extItems.length === 0 ? (
            <EmptyState>
              <p style={{ fontWeight: 600 }}>No items configured</p>
              <p style={{ fontSize: '0.875rem' }}>
                Items appear here once a sale_item_finance_ext record exists for
                them in the finance service. Create deliveries against items to
                trigger automatic record creation, or use the POST endpoint
                directly.
              </p>
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <Tr>
                  <Th>Item Code</Th>
                  <Th>Item Name</Th>
                  <Th>Type</Th>
                  <Th>Revenue Account</Th>
                  <Th>COGS Account</Th>
                  <Th>Tax Code</Th>
                  <Th>Sellable</Th>
                  <Th style={{ width: 80 }}>Actions</Th>
                </Tr>
              </thead>
              <tbody>
                {extItems.map((ext) => (
                  <Tr key={ext.sale_item_finance_ext_id}>
                    <Td>
                      <ItemCodeBadge>{ext.itemCode ?? ext.itemId.slice(0, 8)}</ItemCodeBadge>
                    </Td>
                    <Td>{ext.itemName ?? '—'}</Td>
                    <Td>
                      {/* T-201.8 — default undefined (legacy) to Stock (conservative). */}
                      <TypeChip $isStock={ext.isStock ?? true}>
                        {(ext.isStock ?? true) ? 'Stock' : 'Service'}
                      </TypeChip>
                    </Td>
                    <Td>{renderAccount(ext.revenueAccountId, allAccounts)}</Td>
                    <Td>{renderAccount(ext.cogsAccountId, allAccounts)}</Td>
                    <Td>
                      {ext.salesTaxCode ? (
                        <TaxCodePill>{ext.salesTaxCode}</TaxCodePill>
                      ) : (
                        <UnconfiguredBadge>— not set —</UnconfiguredBadge>
                      )}
                    </Td>
                    <Td>
                      <SellableChip $active={ext.isSellable}>
                        {ext.isSellable ? 'Active' : 'Inactive'}
                      </SellableChip>
                    </Td>
                    <Td>
                      <ActionBtn
                        onClick={() => openEdit(ext)}
                        aria-label={`Edit finance config for ${ext.itemCode ?? ext.itemId}`}
                      >
                        Edit
                      </ActionBtn>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </TableWrapper>
      )}

      {/* Edit modal — renders when modalState.type === 'edit' */}
      {modalState?.type === 'edit' && (
        <EditModal
          ext={modalState.ext}
          allAccounts={allAccounts}
          onClose={closeModal}
          onSaved={handleSaved}
          orgId={orgId!}
        />
      )}
    </PageWrapper>
  );
}

export default SalesItemsPage;
