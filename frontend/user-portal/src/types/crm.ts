/**
 * CRM (Customer Relationship Management) Types
 *
 * Type definitions for the CRM module.
 */

// ============================================================================
// CUSTOMER TYPES
// ============================================================================

export type CustomerType = 'individual' | 'business';

export type CustomerStatus = 'active' | 'inactive' | 'lead' | 'prospect';

export interface CustomerAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface Customer {
  customerId: string;
  customerCode: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  address?: CustomerAddress;
  type: CustomerType;
  status: CustomerStatus;
  notes?: string;
  tags?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface CustomerCreate {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  address?: CustomerAddress;
  type: CustomerType;
  status: CustomerStatus;
  notes?: string;
  tags?: string[];
}

export interface CustomerUpdate {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: CustomerAddress;
  type?: CustomerType;
  status?: CustomerStatus;
  notes?: string;
  tags?: string[];
}

export interface CustomerSearchParams {
  page?: number;
  perPage?: number;
  search?: string;
  type?: CustomerType;
  status?: CustomerStatus;
}

export interface PaginatedCustomers {
  items: Customer[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}
