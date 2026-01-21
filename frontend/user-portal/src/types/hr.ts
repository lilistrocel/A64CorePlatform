/**
 * HR (Human Resources) Types
 *
 * Type definitions for the HR module.
 */

// ============================================================================
// EMPLOYEE TYPES
// ============================================================================

export type EmployeeStatus = 'active' | 'on_leave' | 'terminated';

export interface EmergencyContact {
  name?: string;
  phone?: string;
  relationship?: string;
}

export interface Employee {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  department?: string;
  position?: string;
  hireDate?: string;
  status: EmployeeStatus;
  emergencyContact?: EmergencyContact;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// CONTRACT TYPES
// ============================================================================

export type ContractType = 'full_time' | 'part_time' | 'contractor' | 'intern';
export type ContractStatus = 'active' | 'expired' | 'terminated';

export interface Contract {
  contractId: string;
  employeeId: string;
  type: ContractType;
  startDate: string;
  endDate?: string;
  salary?: number;
  currency?: string;
  benefits?: string[];
  status: ContractStatus;
  documentUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// VISA TYPES
// ============================================================================

export type VisaStatus = 'valid' | 'expired' | 'pending_renewal';

export interface Visa {
  visaId: string;
  employeeId: string;
  visaType: string;
  country: string;
  issueDate: string;
  expiryDate: string;
  status: VisaStatus;
  documentUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// INSURANCE TYPES
// ============================================================================

export type InsuranceType = 'health' | 'life' | 'dental' | 'vision';

export interface Insurance {
  insuranceId: string;
  employeeId: string;
  provider: string;
  policyNumber: string;
  type: InsuranceType;
  coverage?: number;
  startDate: string;
  endDate?: string;
  monthlyCost?: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PERFORMANCE REVIEW TYPES
// ============================================================================

export interface PerformanceReview {
  reviewId: string;
  employeeId: string;
  reviewDate: string;
  reviewerId: string;
  rating: number; // 1-5
  happinessScore?: number; // 1-10
  strengths?: string[];
  areasForImprovement?: string[];
  goals?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

// Employee
export interface EmployeeCreate {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  department?: string;
  position?: string;
  hireDate?: string;
  status: EmployeeStatus;
  emergencyContact?: EmergencyContact;
}

export interface EmployeeUpdate {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  hireDate?: string;
  status?: EmployeeStatus;
  emergencyContact?: EmergencyContact;
}

export interface EmployeeSearchParams {
  page?: number;
  perPage?: number;
  search?: string;
  status?: EmployeeStatus;
  department?: string;
}

export interface PaginatedEmployees {
  items: Employee[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// Contract
export interface ContractCreate {
  type: ContractType;
  startDate: string;
  endDate?: string;
  salary?: number;
  currency?: string;
  benefits?: string[];
  status: ContractStatus;
  documentUrl?: string;
}

export interface ContractUpdate {
  type?: ContractType;
  startDate?: string;
  endDate?: string;
  salary?: number;
  currency?: string;
  benefits?: string[];
  status?: ContractStatus;
  documentUrl?: string;
}

// Visa
export interface VisaCreate {
  visaType: string;
  country: string;
  issueDate: string;
  expiryDate: string;
  status: VisaStatus;
  documentUrl?: string;
}

export interface VisaUpdate {
  visaType?: string;
  country?: string;
  issueDate?: string;
  expiryDate?: string;
  status?: VisaStatus;
  documentUrl?: string;
}

// Insurance
export interface InsuranceCreate {
  provider: string;
  policyNumber: string;
  type: InsuranceType;
  coverage?: number;
  startDate: string;
  endDate?: string;
  monthlyCost?: number;
}

export interface InsuranceUpdate {
  provider?: string;
  policyNumber?: string;
  type?: InsuranceType;
  coverage?: number;
  startDate?: string;
  endDate?: string;
  monthlyCost?: number;
}

// Performance Review
export interface PerformanceReviewCreate {
  reviewDate: string;
  reviewerId: string;
  rating: number;
  happinessScore?: number;
  strengths?: string[];
  areasForImprovement?: string[];
  goals?: string[];
  notes?: string;
}

export interface PerformanceReviewUpdate {
  reviewDate?: string;
  reviewerId?: string;
  rating?: number;
  happinessScore?: number;
  strengths?: string[];
  areasForImprovement?: string[];
  goals?: string[];
  notes?: string;
}

// Dashboard
export interface HRDashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  onLeaveEmployees: number;
  terminatedEmployees: number;
  recentHires: Employee[];
  upcomingVisaExpirations: Visa[];
  averagePerformanceRating: number;
}
