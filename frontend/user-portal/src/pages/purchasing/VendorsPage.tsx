/**
 * VendorsPage
 *
 * Vendor master data management page.
 * Paginated list with search, create/edit modals, and soft-delete.
 *
 * Modals do NOT close on overlay click — X button only.
 */

import { useState, useCallback } from 'react';
import styled from 'styled-components';
import {
  useVendors,
  useCreateVendor,
  useUpdateVendor,
  useDeleteVendor,
  usePaymentTerms,
} from '../../hooks/queries/usePurchasing';
import { useAuthStore } from '../../stores/auth.store';
import type { Vendor, VendorCreate, VendorUpdate } from '../../services/purchasingApi';
import { parseApiErrors } from '../../utils/apiErrors';
import type { ApiErrorItem } from '../../utils/apiErrors';

// ─── Styled components ──────────────────────────────────────────────────────

const Container = styled.div`
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const Title = styled.h1`
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 220px;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  &::placeholder { color: ${({ theme }) => theme.colors.text.tertiary}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
`;

const Select = styled.select`
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 8px;
  font-size: 14px;
  background: ${({ theme }) => theme.colors.surface.canvas};
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.accent.sage}; }
`;

const PrimaryButton = styled.button`
  padding: 10px 20px;
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

const DangerButton = styled.button`
  padding: 6px 14px;
  background: transparent;
  color: ${({ theme }) => theme.colors.status.danger};
  border: 1px solid ${({ theme }) => theme.colors.status.danger};
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms ease;
  &:hover { background: ${({ theme }) => theme.colors.status.danger}; }
`;

const GhostButton = styled.button`
  padding: 6px 14px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 12px;
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const Th = styled.th`
  padding: 14px 16px;
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
  padding: 14px 16px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.raised};
`;

const Tr = styled.tr`
  cursor: pointer;
  transition: background 100ms ease;
  &:hover { background: ${({ theme }) => theme.colors.surface.canvas}; }
  &:last-child td { border-bottom: none; }
`;

const Badge = styled.span<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.accent.sageSoft || '#ecfdf5' : theme.colors.surface.raised};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.status.success || '#0F6E56' : theme.colors.text.tertiary};
`;

const BlockedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ theme }) => theme.colors.status.danger};
  color: ${({ theme }) => theme.colors.status.danger};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 32px;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 15px;
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const PageButtons = styled.div`
  display: flex;
  gap: 8px;
`;

// ─── Modal ──────────────────────────────────────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border-radius: 16px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  width: 100%;
  max-width: 620px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  flex-shrink: 0;
`;

const ModalTitle = styled.h2`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text.secondary};
  padding: 4px;
  border-radius: 6px;
  line-height: 1;
  &:hover { background: ${({ theme }) => theme.colors.surface.raised}; }
`;

const ModalBody = styled.div`
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
`;

const ModalFooter = styled.div`
  padding: 16px 28px 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.surface.sunken};
  flex-shrink: 0;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  @media (max-width: 600px) { grid-template-columns: 1fr; }
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
  &[disabled] { opacity: 0.6; cursor: not-allowed; }
`;

const Hint = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.tertiary};
`;

const ErrorText = styled.p`
  color: ${({ theme }) => theme.colors.status.danger};
  font-size: 13px;
  margin: 0;
`;

/** Per-field inline error shown directly below the offending input. */
const FieldError = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.status.danger};
  margin-top: 2px;
`;

/** Input variant that shows a red border when the field has an error. */
const InputWithError = styled(Input)<{ $hasError?: boolean }>`
  border-color: ${({ $hasError, theme }) =>
    $hasError ? theme.colors.status.danger : undefined};
  &:focus {
    border-color: ${({ $hasError, theme }) =>
      $hasError ? theme.colors.status.danger : theme.colors.accent.sage};
  }
`;

// ─── Vendor Form Modal ───────────────────────────────────────────────────────

interface VendorFormModalProps {
  vendor?: Vendor | null;
  paymentTermsList: { termsCode: string; description: string }[];
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Field names we know how to map from the 422 detail loc array. */
const API_FIELD_MAP: Record<string, string> = {
  name: 'name',
  vendor_code: 'vendorCode',
  trn: 'trn',
  address_line1: 'addressLine1',
  city: 'city',
  country: 'country',
  contact_name: 'contactName',
  contact_email: 'contactEmail',
  contact_phone: 'contactPhone',
  payment_terms_code: 'paymentTermsCode',
  credit_limit: 'creditLimit',
  notes: 'notes',
  bank_name: 'bankName',
  account_number: 'accountNumber',
  iban: 'iban',
  swift: 'swift',
};

/** Email validation — simple but effective for a form field. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** UAE TRN must be exactly 15 digits. */
const TRN_RE = /^\d{15}$/;

function validateForm(form: {
  name: string;
  trn: string;
  contactEmail: string;
  creditLimit: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.name.trim()) {
    errors.name = 'Vendor name is required.';
  }
  if (form.trn.trim() && !TRN_RE.test(form.trn.trim())) {
    errors.trn = 'TRN must be exactly 15 digits.';
  }
  if (form.contactEmail.trim() && !EMAIL_RE.test(form.contactEmail.trim())) {
    errors.contactEmail = 'Enter a valid email address.';
  }
  if (form.creditLimit.trim() !== '') {
    const val = Number(form.creditLimit);
    if (isNaN(val) || val < 0) {
      errors.creditLimit = 'Credit limit must be a non-negative number.';
    }
  }

  return errors;
}


function VendorFormModal({
  vendor,
  paymentTermsList,
  organizationId,
  onClose,
  onSaved,
}: VendorFormModalProps) {
  const createMutation = useCreateVendor();
  const updateMutation = useUpdateVendor();
  const isEdit = !!vendor;

  const [form, setForm] = useState({
    vendorCode: vendor?.vendorCode ?? '',
    name: vendor?.name ?? '',
    trn: vendor?.trn ?? '',
    addressLine1: vendor?.addressLine1 ?? '',
    city: vendor?.city ?? '',
    country: vendor?.country ?? 'United Arab Emirates',
    contactName: vendor?.contactName ?? '',
    contactEmail: vendor?.contactEmail ?? '',
    contactPhone: vendor?.contactPhone ?? '',
    paymentTermsCode: vendor?.paymentTermsCode ?? '',
    creditLimit: vendor?.creditLimit != null ? String(vendor.creditLimit) : '',
    notes: vendor?.notes ?? '',
    bankName: (vendor?.bankDetails as Record<string, unknown> | undefined)?.bankName as string ?? '',
    accountNumber: (vendor?.bankDetails as Record<string, unknown> | undefined)?.accountNumber as string ?? '',
    iban: (vendor?.bankDetails as Record<string, unknown> | undefined)?.iban as string ?? '',
    swift: (vendor?.bankDetails as Record<string, unknown> | undefined)?.swift as string ?? '',
  });

  /** Top-level non-field error (network failures, 500s, unmapped 422s). */
  const [bannerError, setBannerError] = useState<string | null>(null);
  /** Per-field validation errors keyed by form field name. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isLoading = createMutation.isPending || updateMutation.isPending;

  /** Update a single form field and clear its error immediately. */
  const set = (key: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      if (fieldErrors[key]) {
        setFieldErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    };

  const handleSubmit = async () => {
    // Clear previous errors before each attempt.
    setBannerError(null);

    // --- Client-side validation ---
    const clientErrors = validateForm(form);
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return; // Do not hit the API if local validation fails.
    }

    setFieldErrors({});

    const bankDetails =
      form.bankName || form.accountNumber || form.iban || form.swift
        ? {
            bankName: form.bankName || null,
            accountNumber: form.accountNumber || null,
            iban: form.iban || null,
            swift: form.swift || null,
          }
        : null;

    try {
      if (isEdit) {
        const update: VendorUpdate = {
          name: form.name || undefined,
          trn: form.trn || null,
          addressLine1: form.addressLine1 || null,
          city: form.city || null,
          country: form.country || undefined,
          contactName: form.contactName || null,
          contactEmail: form.contactEmail || null,
          contactPhone: form.contactPhone || null,
          paymentTermsCode: form.paymentTermsCode || null,
          creditLimit: form.creditLimit ? Number(form.creditLimit) : null,
          bankDetails,
          notes: form.notes || null,
        };
        await updateMutation.mutateAsync({ vendorId: vendor!.vendorId, data: update });
      } else {
        const create: VendorCreate = {
          organizationId,
          vendorCode: form.vendorCode || undefined,
          name: form.name,
          trn: form.trn || null,
          addressLine1: form.addressLine1 || null,
          city: form.city || null,
          country: form.country,
          contactName: form.contactName || null,
          contactEmail: form.contactEmail || null,
          contactPhone: form.contactPhone || null,
          paymentTermsCode: form.paymentTermsCode || null,
          currencyCode: 'AED',
          creditLimit: form.creditLimit ? Number(form.creditLimit) : null,
          bankDetails,
          notes: form.notes || null,
        };
        await createMutation.mutateAsync(create);
      }
      onSaved();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: unknown }; status?: number }; message?: string };
      const detail = axiosErr?.response?.data?.detail;

      if (Array.isArray(detail)) {
        // FastAPI 422 — parse into per-field errors
        const parsed = parseApiErrors(detail as ApiErrorItem[], API_FIELD_MAP);
        const { __banner__, ...perField } = parsed;
        setFieldErrors(perField);
        if (__banner__) {
          setBannerError(__banner__);
        }
      } else if (typeof detail === 'string') {
        setBannerError(detail);
      } else {
        setBannerError(axiosErr?.message ?? 'An unexpected error occurred. Please try again.');
      }
    }
  };

  return (
    <Overlay>
      {/* Reason: modal must NOT close on overlay click — X button only */}
      <Modal onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>{isEdit ? 'Edit Vendor' : 'New Vendor'}</ModalTitle>
          <CloseButton onClick={onClose} aria-label="Close modal">✕</CloseButton>
        </ModalHeader>
        <ModalBody>
          {/* Top-level banner: only non-field errors (500s, network, unmapped 422s) */}
          {bannerError && <ErrorText role="alert">{bannerError}</ErrorText>}

          <FormRow>
            <Field>
              <Label htmlFor="vf-vendorCode">Vendor Code</Label>
              <InputWithError
                id="vf-vendorCode"
                value={form.vendorCode}
                onChange={set('vendorCode')}
                placeholder="Auto-generated if blank"
                disabled={isEdit}
                $hasError={false}
              />
              {!isEdit && <Hint>Leave blank for auto-generated code</Hint>}
            </Field>
            <Field>
              <Label htmlFor="vf-name">Name *</Label>
              <InputWithError
                id="vf-name"
                value={form.name}
                onChange={set('name')}
                placeholder="Vendor display name"
                $hasError={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? 'vf-name-err' : undefined}
                aria-invalid={!!fieldErrors.name}
              />
              {fieldErrors.name && (
                <FieldError id="vf-name-err" role="alert">{fieldErrors.name}</FieldError>
              )}
            </Field>
          </FormRow>

          <FormRow>
            <Field>
              <Label htmlFor="vf-trn">TRN (UAE)</Label>
              <InputWithError
                id="vf-trn"
                value={form.trn}
                onChange={set('trn')}
                placeholder="15-digit TRN"
                maxLength={15}
                $hasError={!!fieldErrors.trn}
                aria-describedby={fieldErrors.trn ? 'vf-trn-err' : 'vf-trn-hint'}
                aria-invalid={!!fieldErrors.trn}
              />
              {fieldErrors.trn ? (
                <FieldError id="vf-trn-err" role="alert">{fieldErrors.trn}</FieldError>
              ) : (
                <Hint id="vf-trn-hint">Exactly 15 digits — leave blank if not VAT registered</Hint>
              )}
            </Field>
            <Field>
              <Label htmlFor="vf-paymentTerms">Payment Terms</Label>
              <select
                id="vf-paymentTerms"
                value={form.paymentTermsCode}
                onChange={set('paymentTermsCode')}
                style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}
              >
                <option value="">— Select —</option>
                {paymentTermsList.map((t) => (
                  <option key={t.termsCode} value={t.termsCode}>{t.termsCode} — {t.description}</option>
                ))}
              </select>
            </Field>
          </FormRow>

          <FormRow>
            <Field>
              <Label htmlFor="vf-address">Address Line 1</Label>
              <InputWithError
                id="vf-address"
                value={form.addressLine1}
                onChange={set('addressLine1')}
                placeholder="Street address"
                $hasError={false}
              />
            </Field>
            <Field>
              <Label htmlFor="vf-city">City</Label>
              <InputWithError
                id="vf-city"
                value={form.city}
                onChange={set('city')}
                placeholder="City"
                $hasError={false}
              />
            </Field>
          </FormRow>

          <FormRow>
            <Field>
              <Label htmlFor="vf-contactName">Contact Name</Label>
              <InputWithError
                id="vf-contactName"
                value={form.contactName}
                onChange={set('contactName')}
                placeholder="Primary contact"
                $hasError={false}
              />
            </Field>
            <Field>
              <Label htmlFor="vf-contactEmail">Contact Email</Label>
              <InputWithError
                id="vf-contactEmail"
                value={form.contactEmail}
                onChange={set('contactEmail')}
                type="email"
                placeholder="name@vendor.com"
                $hasError={!!fieldErrors.contactEmail}
                aria-describedby={
                  fieldErrors.contactEmail ? 'vf-email-err' : 'vf-email-hint'
                }
                aria-invalid={!!fieldErrors.contactEmail}
              />
              {fieldErrors.contactEmail ? (
                <FieldError id="vf-email-err" role="alert">{fieldErrors.contactEmail}</FieldError>
              ) : (
                <Hint id="vf-email-hint">Format: name@vendor.com</Hint>
              )}
            </Field>
          </FormRow>

          <FormRow>
            <Field>
              <Label htmlFor="vf-contactPhone">Contact Phone</Label>
              <InputWithError
                id="vf-contactPhone"
                value={form.contactPhone}
                onChange={set('contactPhone')}
                placeholder="+971 xx xxx xxxx"
                $hasError={false}
              />
            </Field>
            <Field>
              <Label htmlFor="vf-creditLimit">Credit Limit (AED)</Label>
              <InputWithError
                id="vf-creditLimit"
                value={form.creditLimit}
                onChange={set('creditLimit')}
                type="number"
                min="0"
                placeholder="0.00"
                $hasError={!!fieldErrors.creditLimit}
                aria-describedby={
                  fieldErrors.creditLimit ? 'vf-credit-err' : 'vf-credit-hint'
                }
                aria-invalid={!!fieldErrors.creditLimit}
              />
              {fieldErrors.creditLimit ? (
                <FieldError id="vf-credit-err" role="alert">{fieldErrors.creditLimit}</FieldError>
              ) : (
                <Hint id="vf-credit-hint">Numeric, AED — currency locked to AED in v1</Hint>
              )}
            </Field>
          </FormRow>

          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#4B4844', marginBottom: 8 }}>
              Bank Details (optional)
            </summary>
            <FormRow>
              <Field>
                <Label htmlFor="vf-bankName">Bank Name</Label>
                <InputWithError
                  id="vf-bankName"
                  value={form.bankName}
                  onChange={set('bankName')}
                  placeholder="Bank name"
                  $hasError={!!fieldErrors.bankName}
                />
                {fieldErrors.bankName && (
                  <FieldError role="alert">{fieldErrors.bankName}</FieldError>
                )}
              </Field>
              <Field>
                <Label htmlFor="vf-accountNumber">Account Number</Label>
                <InputWithError
                  id="vf-accountNumber"
                  value={form.accountNumber}
                  onChange={set('accountNumber')}
                  $hasError={!!fieldErrors.accountNumber}
                />
                {fieldErrors.accountNumber && (
                  <FieldError role="alert">{fieldErrors.accountNumber}</FieldError>
                )}
              </Field>
            </FormRow>
            <FormRow>
              <Field>
                <Label htmlFor="vf-iban">IBAN</Label>
                <InputWithError
                  id="vf-iban"
                  value={form.iban}
                  onChange={set('iban')}
                  placeholder="AE xx xxxx..."
                  $hasError={!!fieldErrors.iban}
                />
                {fieldErrors.iban && (
                  <FieldError role="alert">{fieldErrors.iban}</FieldError>
                )}
              </Field>
              <Field>
                <Label htmlFor="vf-swift">SWIFT / BIC</Label>
                <InputWithError
                  id="vf-swift"
                  value={form.swift}
                  onChange={set('swift')}
                  $hasError={!!fieldErrors.swift}
                />
                {fieldErrors.swift && (
                  <FieldError role="alert">{fieldErrors.swift}</FieldError>
                )}
              </Field>
            </FormRow>
          </details>

          <Field>
            <Label htmlFor="vf-notes">Notes</Label>
            <InputWithError
              id="vf-notes"
              value={form.notes}
              onChange={set('notes')}
              placeholder="Internal notes"
              $hasError={false}
            />
          </Field>
        </ModalBody>
        <ModalFooter>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          {/* Reason: always enabled — validation runs on click to give the user
              field-level feedback rather than silently disabling the button. */}
          <PrimaryButton onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Vendor'}
          </PrimaryButton>
        </ModalFooter>
      </Modal>
    </Overlay>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function VendorsPage() {
  const { user } = useAuthStore();
  const organizationId = user?.organizationId ?? '';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  const deleteMutation = useDeleteVendor();

  const isActiveParam =
    activeFilter === 'active' ? true : activeFilter === 'inactive' ? false : undefined;

  const { data, isLoading, isError, refetch } = useVendors({
    organizationId,
    page,
    perPage: 20,
    search: search || undefined,
    isActive: isActiveParam,
  });

  // Fetch payment terms for the dropdown in the vendor form (always called at top level)
  const { data: rawPaymentTerms } = usePaymentTerms({ organizationId, isActive: true });
  const paymentTermsList = Array.isArray(rawPaymentTerms) ? rawPaymentTerms : [];

  const handleDelete = useCallback(
    async (vendor: Vendor, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm(`Soft-delete vendor "${vendor.name}"? This action can be reversed.`)) return;
      try {
        await deleteMutation.mutateAsync(vendor.vendorId);
      } catch {
        alert('Failed to delete vendor. Please try again.');
      }
    },
    [deleteMutation]
  );

  const openCreate = () => {
    setEditingVendor(null);
    setShowModal(true);
  };

  const openEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingVendor(null);
  };

  const onSaved = () => {
    closeModal();
    refetch();
  };

  const vendors = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, perPage: 20, totalPages: 1 };

  return (
    <Container>
      <Header>
        <Title>Vendors</Title>
        <PrimaryButton onClick={openCreate}>+ New Vendor</PrimaryButton>
      </Header>

      <FilterRow>
        <SearchInput
          placeholder="Search by name or code..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <Select value={activeFilter} onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }}>
          <option value="all">All Vendors</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </Select>
      </FilterRow>

      {isLoading && <EmptyState>Loading vendors...</EmptyState>}
      {isError && <EmptyState>Failed to load vendors. Please try again.</EmptyState>}
      {!isLoading && !isError && vendors.length === 0 && (
        <EmptyState>No vendors found. Create your first vendor to get started.</EmptyState>
      )}

      {!isLoading && !isError && vendors.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>TRN</Th>
                <Th>Payment Terms</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <Tr key={v.vendorId} onClick={() => openEdit(v)}>
                  <Td><code style={{ fontSize: 12 }}>{v.vendorCode}</code></Td>
                  <Td>{v.name}</Td>
                  <Td>{v.trn ?? '—'}</Td>
                  <Td>{v.paymentTermsCode ?? '—'}</Td>
                  <Td>
                    <Badge $active={v.isActive}>{v.isActive ? 'Active' : 'Inactive'}</Badge>
                    {v.isBlocked && <BlockedBadge style={{ marginLeft: 6 }}>Blocked</BlockedBadge>}
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <DangerButton onClick={(e) => handleDelete(v, e)}>Delete</DangerButton>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination>
            <span>Showing {vendors.length} of {meta.total} vendors</span>
            <PageButtons>
              <GhostButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Previous
              </GhostButton>
              <span style={{ padding: '6px 12px', fontSize: 13 }}>Page {meta.page} / {meta.totalPages}</span>
              <GhostButton onClick={() => setPage((p) => p + 1)} disabled={page >= meta.totalPages}>
                Next
              </GhostButton>
            </PageButtons>
          </Pagination>
        </>
      )}

      {showModal && (
        <VendorFormModal
          vendor={editingVendor}
          paymentTermsList={paymentTermsList ?? []}
          organizationId={organizationId}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </Container>
  );
}

