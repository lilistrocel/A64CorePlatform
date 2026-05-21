/**
 * Tenant Bootstrap Service
 *
 * API calls needed exclusively for the Tenant Setup Wizard:
 *  - listOrganizations  — GET /organizations/
 *  - createOrganization — POST /organizations/
 *  - assignUserOrganization — PATCH /admin/users/{user_id}/organization
 *
 * Finance bootstrap calls (createCompany, createPeriod) are handled by the
 * existing financeCompaniesService and fiscalPeriodsService respectively.
 *
 * All endpoints return bare objects (no SuccessResponse envelope) on the
 * main-app side.
 */

import { apiClient } from './api';

// ─── Organization types ────────────────────────────────────────────────────────

export interface OrganizationResponse {
  organizationId: string;
  name: string;
  slug: string;
  industries: string[];
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrganizationPayload {
  name: string;
  slug: string;
  industries: string[];
  logoUrl?: string;
}

// ─── User assignment types ─────────────────────────────────────────────────────

export interface UserOrganizationAssignment {
  organizationId: string;
  divisionAccess?: string[];
  defaultDivisionId?: string;
}

/** Minimal UserResponse shape — includes the fields we care about after assignment. */
export interface AssignedUserResponse {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string | null;
  divisionAccess?: string[];
  defaultDivisionId?: string | null;
  isActive?: boolean;
}

// ─── API functions ─────────────────────────────────────────────────────────────

/**
 * Fetch all active organizations.
 * GET /api/v1/organizations/
 *
 * Returns bare OrganizationResponse[] (no envelope).
 * Available to all authenticated users.
 */
export async function listOrganizations(): Promise<OrganizationResponse[]> {
  const response = await apiClient.get<OrganizationResponse[]>('/v1/organizations/');
  return response.data;
}

/**
 * Create a new organization.
 * POST /api/v1/organizations/
 *
 * Super admin only. Returns bare OrganizationResponse (no envelope).
 * Throws 409 if slug already in use.
 */
export async function createOrganization(
  payload: CreateOrganizationPayload
): Promise<OrganizationResponse> {
  const response = await apiClient.post<OrganizationResponse>('/v1/organizations/', payload);
  return response.data;
}

/**
 * Assign an organization (and optional divisions) to a user.
 * PATCH /api/v1/admin/users/{user_id}/organization
 *
 * Super admin only. Returns bare UserResponse (no envelope).
 * Throws 403 if caller is not super_admin; 404 if user not found.
 */
export async function assignUserOrganization(
  userId: string,
  payload: UserOrganizationAssignment
): Promise<AssignedUserResponse> {
  const response = await apiClient.patch<AssignedUserResponse>(
    `/v1/admin/users/${userId}/organization`,
    payload
  );
  return response.data;
}
