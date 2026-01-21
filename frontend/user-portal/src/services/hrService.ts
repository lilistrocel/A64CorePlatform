/**
 * HR API Service
 *
 * This service provides all API calls for the HR (Human Resources) module.
 * All endpoints use the /api/v1/hr base URL.
 */

import { apiClient } from './api';
import type {
  Employee,
  EmployeeCreate,
  EmployeeUpdate,
  EmployeeSearchParams,
  PaginatedEmployees,
  Contract,
  ContractCreate,
  ContractUpdate,
  Visa,
  VisaCreate,
  VisaUpdate,
  Insurance,
  InsuranceCreate,
  InsuranceUpdate,
  PerformanceReview,
  PerformanceReviewCreate,
  PerformanceReviewUpdate,
  HRDashboardStats,
} from '../types/hr';

// ============================================================================
// EMPLOYEE MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get all employees with search and pagination
 */
export async function getEmployees(params?: EmployeeSearchParams): Promise<PaginatedEmployees> {
  const response = await apiClient.get<any>('/v1/hr/employees', {
    params: {
      page: params?.page || 1,
      perPage: params?.perPage || 20,
      search: params?.search,
      status: params?.status,
      department: params?.department,
    },
  });

  return {
    items: response.data.data || [],
    total: response.data.meta?.total || 0,
    page: response.data.meta?.page || 1,
    perPage: response.data.meta?.perPage || 20,
    totalPages: response.data.meta?.totalPages || 1,
  };
}

/**
 * Search employees by query
 */
export async function searchEmployees(query: string): Promise<Employee[]> {
  const response = await apiClient.get<{ data: Employee[] }>('/v1/hr/employees/search', {
    params: { q: query },
  });
  return response.data.data;
}

/**
 * Get a single employee by ID
 */
export async function getEmployee(employeeId: string): Promise<Employee> {
  const response = await apiClient.get<{ data: Employee }>(`/v1/hr/employees/${employeeId}`);
  return response.data.data;
}

/**
 * Create new employee
 */
export async function createEmployee(data: EmployeeCreate): Promise<Employee> {
  const response = await apiClient.post<{ data: Employee }>('/v1/hr/employees', data);
  return response.data.data;
}

/**
 * Update existing employee
 */
export async function updateEmployee(employeeId: string, data: EmployeeUpdate): Promise<Employee> {
  const response = await apiClient.patch<{ data: Employee }>(`/v1/hr/employees/${employeeId}`, data);
  return response.data.data;
}

/**
 * Delete employee
 */
export async function deleteEmployee(employeeId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/hr/employees/${employeeId}`);
  return response.data;
}

// ============================================================================
// CONTRACT MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get all contracts for an employee
 */
export async function getEmployeeContracts(employeeId: string): Promise<Contract[]> {
  const response = await apiClient.get<{ data: Contract[] }>(`/v1/hr/employees/${employeeId}/contracts`);
  return response.data.data;
}

/**
 * Create new contract for employee
 */
export async function createContract(employeeId: string, data: ContractCreate): Promise<Contract> {
  const response = await apiClient.post<{ data: Contract }>(`/v1/hr/employees/${employeeId}/contracts`, data);
  return response.data.data;
}

/**
 * Update existing contract
 */
export async function updateContract(contractId: string, data: ContractUpdate): Promise<Contract> {
  const response = await apiClient.patch<{ data: Contract }>(`/v1/hr/contracts/${contractId}`, data);
  return response.data.data;
}

/**
 * Delete contract
 */
export async function deleteContract(contractId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/hr/contracts/${contractId}`);
  return response.data;
}

// ============================================================================
// VISA MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get all visas for an employee
 */
export async function getEmployeeVisas(employeeId: string): Promise<Visa[]> {
  const response = await apiClient.get<{ data: Visa[] }>(`/v1/hr/employees/${employeeId}/visas`);
  return response.data.data;
}

/**
 * Create new visa for employee
 */
export async function createVisa(employeeId: string, data: VisaCreate): Promise<Visa> {
  const response = await apiClient.post<{ data: Visa }>(`/v1/hr/employees/${employeeId}/visas`, data);
  return response.data.data;
}

/**
 * Update existing visa
 */
export async function updateVisa(visaId: string, data: VisaUpdate): Promise<Visa> {
  const response = await apiClient.patch<{ data: Visa }>(`/v1/hr/visas/${visaId}`, data);
  return response.data.data;
}

/**
 * Delete visa
 */
export async function deleteVisa(visaId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/hr/visas/${visaId}`);
  return response.data;
}

// ============================================================================
// INSURANCE MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get all insurance records for an employee
 */
export async function getEmployeeInsurance(employeeId: string): Promise<Insurance[]> {
  const response = await apiClient.get<{ data: Insurance[] }>(`/v1/hr/employees/${employeeId}/insurance`);
  return response.data.data;
}

/**
 * Create new insurance record for employee
 */
export async function createInsurance(employeeId: string, data: InsuranceCreate): Promise<Insurance> {
  const response = await apiClient.post<{ data: Insurance }>(`/v1/hr/employees/${employeeId}/insurance`, data);
  return response.data.data;
}

/**
 * Update existing insurance record
 */
export async function updateInsurance(insuranceId: string, data: InsuranceUpdate): Promise<Insurance> {
  const response = await apiClient.patch<{ data: Insurance }>(`/v1/hr/insurance/${insuranceId}`, data);
  return response.data.data;
}

/**
 * Delete insurance record
 */
export async function deleteInsurance(insuranceId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/hr/insurance/${insuranceId}`);
  return response.data;
}

// ============================================================================
// PERFORMANCE REVIEW ENDPOINTS
// ============================================================================

/**
 * Get all performance reviews for an employee
 */
export async function getEmployeePerformanceReviews(employeeId: string): Promise<PerformanceReview[]> {
  const response = await apiClient.get<{ data: PerformanceReview[] }>(`/v1/hr/employees/${employeeId}/performance`);
  return response.data.data;
}

/**
 * Create new performance review for employee
 */
export async function createPerformanceReview(employeeId: string, data: PerformanceReviewCreate): Promise<PerformanceReview> {
  const response = await apiClient.post<{ data: PerformanceReview }>(`/v1/hr/employees/${employeeId}/performance`, data);
  return response.data.data;
}

/**
 * Update existing performance review
 */
export async function updatePerformanceReview(reviewId: string, data: PerformanceReviewUpdate): Promise<PerformanceReview> {
  const response = await apiClient.patch<{ data: PerformanceReview }>(`/v1/hr/performance/${reviewId}`, data);
  return response.data.data;
}

/**
 * Delete performance review
 */
export async function deletePerformanceReview(reviewId: string): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>(`/v1/hr/performance/${reviewId}`);
  return response.data;
}

// ============================================================================
// DASHBOARD ENDPOINTS
// ============================================================================

/**
 * Get HR dashboard statistics
 */
export async function getDashboardStats(): Promise<HRDashboardStats> {
  const response = await apiClient.get<{ data: HRDashboardStats }>('/v1/hr/dashboard');
  return response.data.data;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get employee full name
 */
export function getEmployeeFullName(employee: Employee): string {
  return `${employee.firstName} ${employee.lastName}`;
}

/**
 * Get employee status color
 */
export function getEmployeeStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return '#10B981'; // green
    case 'on_leave':
      return '#F59E0B'; // amber
    case 'terminated':
      return '#EF4444'; // red
    default:
      return '#6B7280'; // gray
  }
}

/**
 * Get employee status label
 */
export function getEmployeeStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'on_leave':
      return 'On Leave';
    case 'terminated':
      return 'Terminated';
    default:
      return status;
  }
}

/**
 * Get contract type label
 */
export function getContractTypeLabel(type: string): string {
  switch (type) {
    case 'full_time':
      return 'Full Time';
    case 'part_time':
      return 'Part Time';
    case 'contractor':
      return 'Contractor';
    case 'intern':
      return 'Intern';
    default:
      return type;
  }
}

/**
 * Get contract status color
 */
export function getContractStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return '#10B981'; // green
    case 'expired':
      return '#6B7280'; // gray
    case 'terminated':
      return '#EF4444'; // red
    default:
      return '#6B7280';
  }
}

/**
 * Get visa status color
 */
export function getVisaStatusColor(status: string): string {
  switch (status) {
    case 'valid':
      return '#10B981'; // green
    case 'expired':
      return '#EF4444'; // red
    case 'pending_renewal':
      return '#F59E0B'; // amber
    default:
      return '#6B7280';
  }
}

/**
 * Get insurance type label
 */
export function getInsuranceTypeLabel(type: string): string {
  switch (type) {
    case 'health':
      return 'Health';
    case 'life':
      return 'Life';
    case 'dental':
      return 'Dental';
    case 'vision':
      return 'Vision';
    default:
      return type;
  }
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Format date
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Check if visa is expiring soon (within 60 days)
 */
export function isVisaExpiringSoon(visa: Visa): boolean {
  const expiryDate = new Date(visa.expiryDate);
  const now = new Date();
  const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntilExpiry > 0 && daysUntilExpiry <= 60;
}

// Export all functions as a single object for convenience
export const hrApi = {
  // Employees
  getEmployees,
  searchEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  // Contracts
  getEmployeeContracts,
  createContract,
  updateContract,
  deleteContract,
  // Visas
  getEmployeeVisas,
  createVisa,
  updateVisa,
  deleteVisa,
  // Insurance
  getEmployeeInsurance,
  createInsurance,
  updateInsurance,
  deleteInsurance,
  // Performance
  getEmployeePerformanceReviews,
  createPerformanceReview,
  updatePerformanceReview,
  deletePerformanceReview,
  // Dashboard
  getDashboardStats,
  // Utilities
  getEmployeeFullName,
  getEmployeeStatusColor,
  getEmployeeStatusLabel,
  getContractTypeLabel,
  getContractStatusColor,
  getVisaStatusColor,
  getInsuranceTypeLabel,
  formatCurrency,
  formatDate,
  isVisaExpiringSoon,
};

export default hrApi;
