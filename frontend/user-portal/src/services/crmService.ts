/**
 * CRM API Service
 *
 * This service provides all API calls for the CRM (Customer Relationship Management) module.
 * All endpoints use the /api/v1/crm base URL.
 */

import { apiClient } from './api';
import { lightTheme } from '@a64core/shared';
import type {
  Customer,
  CustomerCreate,
  CustomerUpdate,
  CustomerSearchParams,
  PaginatedCustomers,
} from '../types/crm';

// ============================================================================
// CUSTOMER MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get all customers with search and pagination
 */
export async function getCustomers(params?: CustomerSearchParams): Promise<PaginatedCustomers> {
  const response = await apiClient.get<any>('/v1/crm/customers', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search,
      type: params?.type,
      status: params?.status,
    },
  });

  // Transform backend response format to match frontend expectations
  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Search customers by query
 */
export async function searchCustomers(query: string): Promise<Customer[]> {
  const response = await apiClient.get<{ data: Customer[] }>('/v1/crm/customers/search', {
    params: { q: query },
  });
  return response.data.data;
}

/**
 * Get a single customer by ID
 */
export async function getCustomer(customerId: string): Promise<Customer> {
  const response = await apiClient.get<{ data: Customer }>(`/v1/crm/customers/${customerId}`);
  return response.data.data;
}

/**
 * Create new customer
 */
export async function createCustomer(data: CustomerCreate): Promise<Customer> {
  const response = await apiClient.post<{ data: Customer }>('/v1/crm/customers', data);
  return response.data.data;
}

/**
 * Update existing customer
 */
export async function updateCustomer(customerId: string, data: CustomerUpdate): Promise<Customer> {
  const response = await apiClient.patch<{ data: Customer }>(`/v1/crm/customers/${customerId}`, data);
  return response.data.data;
}

/**
 * Delete customer
 */
export async function deleteCustomer(customerId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/crm/customers/${customerId}`);
  return response.data;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format customer address as single line string
 */
export function formatCustomerAddress(address?: {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}): string {
  if (!address) return '';

  const parts = [
    address.street,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ].filter(Boolean);

  return parts.join(', ');
}

/**
 * Get customer status color
 */
export function getCustomerStatusColor(status: string): string {
  const c = lightTheme.colors;
  switch (status) {
    case 'active':
      return c.success; // emerald
    case 'inactive':
      return c.textSecondary;
    case 'lead':
      return c.primary[500]; // lapis
    case 'prospect':
      return c.warning; // gold
    default:
      return c.textSecondary;
  }
}

/**
 * Get customer type label
 */
export function getCustomerTypeLabel(type: string): string {
  switch (type) {
    case 'individual':
      return 'Individual';
    case 'business':
      return 'Business';
    default:
      return type;
  }
}

// Export all functions as a single object for convenience
export const crmApi = {
  getCustomers,
  searchCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  formatCustomerAddress,
  getCustomerStatusColor,
  getCustomerTypeLabel,
};

export default crmApi;
