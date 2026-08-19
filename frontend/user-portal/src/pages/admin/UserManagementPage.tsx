import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Card, PageHeader, glassPanel, phaseBadge } from '@a64core/shared';
import { apiClient } from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';
import { useToastStore } from '../../stores/toast.store';
import { useOrganizations } from '../../hooks/queries/useOrganizations';
import { assignUserOrganization } from '../../services/tenantBootstrapService';

interface User {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  mfaEnabled?: boolean;
  mfaSetupRequired?: boolean;
  createdAt: string;
  lastLoginAt?: string;
  /** Organization this user belongs to. Absent/null on a JIT-provisioned
   *  Cloudflare Access account until an admin assigns one. */
  organizationId?: string | null;
  /** Which credential flow provisioned/authenticates this account. */
  authProvider?: 'password' | 'cloudflare_access';
}

interface UsersResponse {
  data: User[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

/** Shape of GET /api/v1/admin/users — flat pagination fields (see src/models/user.py::UserListResponse),
 *  distinct from the /v1/users list's nested `meta` shape above. */
interface AdminUserListResponse {
  data: User[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

const ROLE_OPTIONS = ['super_admin', 'admin', 'moderator', 'user', 'guest'];

/**
 * Roles the CURRENT viewer is permitted to assign to another user via
 * PATCH /v1/users/{userId}/role. Mirrors `can_change_role` in
 * `src/middleware/permissions.py` — keep the two in sync; this is a UI-only
 * courtesy (the server independently re-checks and 403s any request outside
 * this policy, so it is not the security boundary, just what the role
 * dropdown offers):
 *
 * - super_admin: may assign any role
 * - admin: may assign only moderator / user / guest (never admin or super_admin)
 * - anyone else: none (this page is route-gated to admin/super_admin only —
 *   see ProtectedRoute's allowedRoles in App.tsx — so this branch is a
 *   defensive fallback, not an expected path)
 */
function getAssignableRoles(viewerRole: string | undefined): string[] {
  if (viewerRole === 'super_admin') return ROLE_OPTIONS;
  if (viewerRole === 'admin') return ['moderator', 'user', 'guest'];
  return [];
}

type UserTab = 'all' | 'pending';

export function UserManagementPage() {
  const { user: currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, page: 1, perPage: 20, totalPages: 1 });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState('');

  // Cloudflare Access — "Pending activation" tab, backed by the existing
  // GET /api/v1/admin/users?is_active=false (admin.py), a separate router
  // from the /v1/users list used by the "All Users" tab above. Deliberately
  // NOT filtered further to authProvider==='cloudflare_access' client-side:
  // any inactive account (manually suspended or CF JIT-provisioned) belongs
  // in an admin's "needs attention" queue, and the Provider badge column
  // lets them tell the two apart at a glance.
  const [activeTab, setActiveTab] = useState<UserTab>('all');
  // orgId selected per-row for a pending user with no organizationId yet —
  // required before "Activate" is enabled for that row.
  const [orgSelections, setOrgSelections] = useState<Record<string, string>>({});
  const [activatingUserId, setActivatingUserId] = useState<string | null>(null);
  const { data: organizations } = useOrganizations();

  // Reset to page 1 whenever the tab changes so stale pagination from the
  // other tab's result set never leaks in. Also clear statusFilter when
  // leaving the "All Users" tab — the pending tab forces isActive=false
  // server-side and hides the status dropdown, so a stale value would only
  // cause a misleading "Clear Filters" button to appear.
  useEffect(() => {
    setPage(1);
    if (activeTab !== 'all') {
      setStatusFilter('');
    }
  }, [activeTab]);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (activeTab === 'pending') {
        // admin.py declares snake_case query params (page, per_page,
        // is_active), unlike /v1/users's camelCase aliases below.
        const params = new URLSearchParams();
        params.set('page', page.toString());
        params.set('per_page', '20');
        params.set('is_active', 'false');
        if (search) params.set('search', search);
        if (roleFilter) params.set('role', roleFilter);

        const response = await apiClient.get<AdminUserListResponse>(`/v1/admin/users?${params.toString()}`);
        setUsers(response.data.data);
        setMeta({
          total: response.data.total,
          page: response.data.page,
          perPage: response.data.perPage,
          totalPages: response.data.totalPages,
        });
        return;
      }

      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('perPage', '20');
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('isActive', statusFilter);

      const response = await apiClient.get<UsersResponse>(`/v1/users?${params.toString()}`);
      setUsers(response.data.data);
      setMeta(response.data.meta);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to load users';
      setError(msg);
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter, activeTab]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await apiClient.patch(`/v1/users/${userId}/role`, { role });
      addToast('success', 'User role updated successfully');
      fetchUsers();
      setEditingUser(null);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to update role';
      addToast('error', msg);
    }
  };

  const handleActivate = async (userId: string) => {
    try {
      await apiClient.post(`/v1/users/${userId}/activate`);
      addToast('success', 'User activated successfully');
      fetchUsers();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to activate user';
      addToast('error', msg);
    }
  };

  /**
   * Activate a pending-tab user. Wires the two EXISTING admin.py endpoints
   * per task scope (no new backend routes):
   *  - PATCH /api/v1/admin/users/{id}/organization — only when the account
   *    has no organizationId yet (the common case for a Cloudflare Access
   *    JIT-provisioned account, which is created org-less by design).
   *  - PATCH /api/v1/admin/users/{id}/status — sets isActive: true.
   * The org assignment intentionally runs first: activating a user into no
   * organization would leave them stuck exactly like a super_admin with no
   * org (see ProtectedRoute's tenant-setup gate), so an org must be picked
   * for any org-less row before the button is enabled at all.
   */
  const handleActivatePending = async (targetUser: User) => {
    if (!targetUser.organizationId && !orgSelections[targetUser.userId]) {
      addToast('error', 'Select an organization before activating this user.');
      return;
    }

    setActivatingUserId(targetUser.userId);
    try {
      if (!targetUser.organizationId) {
        await assignUserOrganization(targetUser.userId, {
          organizationId: orgSelections[targetUser.userId],
        });
      }
      await apiClient.patch(`/v1/admin/users/${targetUser.userId}/status`, { isActive: true });
      addToast('success', `${targetUser.email} activated successfully`);
      setOrgSelections((prev) => {
        const next = { ...prev };
        delete next[targetUser.userId];
        return next;
      });
      fetchUsers();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to activate user';
      addToast('error', msg);
    } finally {
      setActivatingUserId(null);
    }
  };

  const handleDeactivate = async (userId: string) => {
    try {
      await apiClient.post(`/v1/users/${userId}/deactivate`);
      addToast('success', 'User deactivated successfully');
      fetchUsers();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to deactivate user';
      addToast('error', msg);
    }
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!window.confirm(`Are you sure you want to delete user ${email}? This action cannot be undone.`)) {
      return;
    }
    try {
      await apiClient.delete(`/v1/users/${userId}`);
      addToast('success', 'User deleted successfully');
      fetchUsers();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to delete user';
      addToast('error', msg);
    }
  };

  const handleResetMfa = async (userId: string, email: string) => {
    if (!window.confirm(
      `Are you sure you want to reset MFA for ${email}?\n\n` +
      `This will remove Multi-Factor Authentication from the user's account. ` +
      `They will need to set up MFA again on their next login.`
    )) {
      return;
    }
    try {
      await apiClient.put(`/v1/admin/users/${userId}/mfa/reset`);
      addToast('success', `MFA reset successfully for ${email}`);
      fetchUsers();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to reset MFA';
      addToast('error', msg);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setRoleFilter('');
    setStatusFilter('');
    setPage(1);
  };

  const hasActiveFilters = search || roleFilter || statusFilter;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isCurrentUser = (userId: string) => currentUser?.userId === userId;

  // Only admin or super_admin can reset MFA
  const canResetMfa = () => {
    const role = (currentUser as any)?.role;
    return role === 'admin' || role === 'super_admin';
  };

  // Roles the viewer may offer in the role-edit dropdown (see
  // getAssignableRoles' doc comment — mirrors can_change_role).
  const assignableRoles = getAssignableRoles(currentUser?.role);

  return (
    <Container>
      <PageHeader
        breadcrumb="Admin · Users"
        title="User Management"
        description="Manage system users, roles, and permissions"
        stats={[{ value: meta.total, label: 'Total users' }]}
      />

      <TabsRow role="tablist" aria-label="User list view">
        <TabButton
          role="tab"
          type="button"
          $active={activeTab === 'all'}
          aria-selected={activeTab === 'all'}
          onClick={() => setActiveTab('all')}
        >
          All Users
        </TabButton>
        <TabButton
          role="tab"
          type="button"
          $active={activeTab === 'pending'}
          aria-selected={activeTab === 'pending'}
          onClick={() => setActiveTab('pending')}
        >
          Pending Activation
        </TabButton>
      </TabsRow>

      <FiltersCard>
        <FiltersRow>
          <SearchForm onSubmit={handleSearch}>
            <SearchInput
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </SearchForm>

          <FilterSelect
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map(role => (
              <option key={role} value={role}>{role.replace('_', ' ')}</option>
            ))}
          </FilterSelect>

          {activeTab === 'all' && (
            <FilterSelect
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </FilterSelect>
          )}

          {hasActiveFilters && (
            <ClearButton onClick={clearFilters}>Clear Filters</ClearButton>
          )}
        </FiltersRow>
      </FiltersCard>

      <Card>
        {loading ? (
          <LoadingText>Loading users...</LoadingText>
        ) : error ? (
          <ErrorText>{error}</ErrorText>
        ) : users.length === 0 ? (
          <EmptyText>No users found</EmptyText>
        ) : (
          <>
            <Table aria-label="User management table">
              <thead>
                <tr>
                  <TableHeader scope="col">User</TableHeader>
                  <TableHeader scope="col">Email</TableHeader>
                  <TableHeader scope="col">Role</TableHeader>
                  <TableHeader scope="col">Provider</TableHeader>
                  <TableHeader scope="col">Status</TableHeader>
                  <TableHeader scope="col">MFA</TableHeader>
                  <TableHeader scope="col">Joined</TableHeader>
                  <TableHeader scope="col">Last Login</TableHeader>
                  <TableHeader scope="col">Actions</TableHeader>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <TableRow key={user.userId}>
                    <TableCell>
                      <UserName>
                        {user.firstName} {user.lastName}
                        {isCurrentUser(user.userId) && <YouBadge>You</YouBadge>}
                      </UserName>
                    </TableCell>
                    <TableCell>
                      <EmailText>{user.email}</EmailText>
                      {!user.isEmailVerified && <UnverifiedBadge>Unverified</UnverifiedBadge>}
                    </TableCell>
                    <TableCell>
                      {editingUser?.userId === user.userId ? (
                        <RoleEditRow>
                          <RoleSelect
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value)}
                          >
                            {/* Assignable-by-viewer only — NOT the full ROLE_OPTIONS list.
                                See getAssignableRoles' doc comment. */}
                            {assignableRoles.map(role => (
                              <option key={role} value={role}>{role.replace('_', ' ')}</option>
                            ))}
                          </RoleSelect>
                          <SmallButton onClick={() => handleRoleChange(user.userId, newRole)}>Save</SmallButton>
                          <SmallButton onClick={() => setEditingUser(null)}>Cancel</SmallButton>
                        </RoleEditRow>
                      ) : (
                        <RoleBadge role={user.role}>{user.role.replace('_', ' ')}</RoleBadge>
                      )}
                    </TableCell>
                    <TableCell>
                      <ProviderBadge $provider={user.authProvider ?? 'password'}>
                        {user.authProvider === 'cloudflare_access' ? 'Cloudflare Access' : 'Password'}
                      </ProviderBadge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge $active={user.isActive}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {user.mfaEnabled ? (
                        <MfaEnabledBadge>Enabled</MfaEnabledBadge>
                      ) : user.mfaSetupRequired ? (
                        <MfaPendingBadge>Pending</MfaPendingBadge>
                      ) : (
                        <MfaDisabledBadge>Off</MfaDisabledBadge>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                    <TableCell>{formatDate(user.lastLoginAt)}</TableCell>
                    <TableCell>
                      <ActionsRow>
                        {!isCurrentUser(user.userId) && (
                          <>
                            <ActionButton
                              onClick={() => {
                                setEditingUser(user);
                                // Seed the dropdown with the target's current role only
                                // if the viewer is actually permitted to (re-)assign it;
                                // otherwise fall back to the viewer's lowest assignable
                                // role so the visible selection always matches what would
                                // actually be submitted (never a role absent from the
                                // rendered <option> list — see assignableRoles above).
                                setNewRole(
                                  assignableRoles.includes(user.role)
                                    ? user.role
                                    : (assignableRoles[0] ?? '')
                                );
                              }}
                              title="Change Role"
                            >
                              Role
                            </ActionButton>
                            {user.isActive ? (
                              <ActionButton
                                onClick={() => handleDeactivate(user.userId)}
                                title="Deactivate User"
                              >
                                Deactivate
                              </ActionButton>
                            ) : activeTab === 'pending' ? (
                              <PendingActivateGroup>
                                {!user.organizationId && (
                                  <FilterSelect
                                    aria-label={`Organization for ${user.email}`}
                                    value={orgSelections[user.userId] ?? ''}
                                    onChange={(e) =>
                                      setOrgSelections((prev) => ({ ...prev, [user.userId]: e.target.value }))
                                    }
                                  >
                                    <option value="">Select organization…</option>
                                    {(organizations ?? []).map((org) => (
                                      <option key={org.organizationId} value={org.organizationId}>
                                        {org.name}
                                      </option>
                                    ))}
                                  </FilterSelect>
                                )}
                                <ActionButton
                                  onClick={() => handleActivatePending(user)}
                                  disabled={
                                    activatingUserId === user.userId ||
                                    (!user.organizationId && !orgSelections[user.userId])
                                  }
                                  title={
                                    user.organizationId
                                      ? 'Activate User'
                                      : 'Select an organization, then activate'
                                  }
                                >
                                  {activatingUserId === user.userId ? 'Activating…' : 'Activate'}
                                </ActionButton>
                              </PendingActivateGroup>
                            ) : (
                              <ActionButton
                                onClick={() => handleActivate(user.userId)}
                                title="Activate User"
                              >
                                Activate
                              </ActionButton>
                            )}
                            <DeleteButton
                              onClick={() => handleDelete(user.userId, user.email)}
                              title="Delete User"
                            >
                              Delete
                            </DeleteButton>
                            {user.mfaEnabled && canResetMfa() && (
                              <ResetMfaButton
                                onClick={() => handleResetMfa(user.userId, user.email)}
                                title="Reset MFA - removes 2FA from this account"
                              >
                                Reset MFA
                              </ResetMfaButton>
                            )}
                          </>
                        )}
                      </ActionsRow>
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>

            <Pagination>
              <PageInfo>
                Showing {((meta.page - 1) * meta.perPage) + 1} to {Math.min(meta.page * meta.perPage, meta.total)} of {meta.total} users
              </PageInfo>
              <PageButtons>
                <PageButton
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </PageButton>
                <PageIndicator>Page {page} of {meta.totalPages}</PageIndicator>
                <PageButton
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </PageButton>
              </PageButtons>
            </Pagination>
          </>
        )}
      </Card>
    </Container>
  );
}

const Container = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  max-width: 1400px;
  margin: 0 auto;

  @media (min-width: 768px) {
    padding: ${({ theme }) => theme.spacing.lg};
  }
`;

const TabsRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const TabButton = styled.button<{ $active: boolean }>`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.secondary[500] : theme.colors.glass.border)};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme, $active }) =>
    $active ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium};
  background: ${({ theme, $active }) => ($active ? theme.colors.glass.hi : theme.colors.glass.base)};
  color: ${({ theme, $active }) => ($active ? theme.colors.textPrimary : theme.colors.textSecondary)};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const FiltersCard = styled.div`
  ${glassPanel}
  padding: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const FiltersRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: center;
`;

const SearchForm = styled.form`
  flex: 1;
  min-width: 200px;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textPrimary};

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

const FilterSelect = styled.select`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;
  min-width: 140px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.secondary[500]};
    box-shadow: 0 0 0 3px rgba(220, 185, 79, 0.15);
  }
`;

// Destructive-adjacent action — coral-b tinted glass, never solid red (spec §4).
const ClearButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid rgba(240, 138, 112, 0.45);
  border-radius: 6px;
  background: rgba(240, 138, 112, 0.16);
  color: ${({ theme }) => theme.colors.bright.coral};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  cursor: pointer;

  &:hover {
    background: rgba(240, 138, 112, 0.26);
  }
`;

const LoadingText = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ErrorText = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.bright.coral};
`;

const EmptyText = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

// Tables — spec §4: no solid chrome, Space Mono uppercase celeste headers,
// `line` row dividers, transparent rows, hover rgba(180,200,220,.05).
const TableHeader = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-family: ${({ theme }) => theme.typography.fontFamily.mono};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.celeste};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`;

const TableRow = styled.tr`
  &:hover {
    background: rgba(180, 200, 220, 0.05);
  }
`;

const TableCell = styled.td`
  padding: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
`;

const UserName = styled.div`
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const YouBadge = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  background: rgba(107, 138, 224, 0.16);
  color: ${({ theme }) => theme.colors.bright.lapis};
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: normal;
`;

const EmailText = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const UnverifiedBadge = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  background: ${({ theme }) => theme.colors.warningBg};
  color: ${({ theme }) => theme.colors.warning};
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: ${({ theme }) => theme.spacing.xs};
`;

// Categorical role chip — not a status, so it draws from the `bright.*`
// palette rather than the phase vocabulary (spec §5 is for status only).
const RoleBadge = styled.span<{ role: string }>`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  text-transform: capitalize;
  background: ${({ role }) => {
    switch (role) {
      case 'super_admin': return 'rgba(232, 147, 95, 0.16)';
      case 'admin': return 'rgba(195, 160, 207, 0.16)';
      case 'moderator': return 'rgba(107, 138, 224, 0.16)';
      case 'user': return 'rgba(84, 211, 155, 0.16)';
      default: return 'rgba(180, 200, 220, 0.1)';
    }
  }};
  color: ${({ role, theme }) => {
    switch (role) {
      case 'super_admin': return theme.colors.bright.terra;
      case 'admin': return theme.colors.bright.lavender;
      case 'moderator': return theme.colors.bright.lapis;
      case 'user': return theme.colors.bright.emerald;
      default: return theme.colors.muted;
    }
  }};
`;

// Auth-provider chip — categorical (which credential flow authenticates this
// account), not a status, so it draws from the `bright.*` palette per the
// same convention as RoleBadge above, not the phase vocabulary.
const ProviderBadge = styled.span<{ $provider: string }>`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  background: ${({ $provider }) =>
    $provider === 'cloudflare_access' ? 'rgba(87, 196, 188, 0.16)' : 'rgba(180, 200, 220, 0.1)'};
  color: ${({ $provider, theme }) =>
    $provider === 'cloudflare_access' ? theme.colors.bright.verdi : theme.colors.muted};
`;

// Active/inactive account — the closest §5.2 extrapolation is
// approved/posted ("fruiting") vs. cancelled/archived ("decommissioned").
const StatusBadge = styled.span<{ $active: boolean }>`
  ${({ $active }) => phaseBadge($active ? 'fruiting' : 'decommissioned')}
`;

const RoleEditRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const RoleSelect = styled.select`
  padding: 4px 8px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 4px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SmallButton = styled.button`
  padding: 4px 8px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.glass.base};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme }) => theme.colors.textPrimary};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
  }
`;

const ActionsRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
  flex-wrap: wrap;
  align-items: center;
`;

// Pending-tab activation: an org-select dropdown (only when the account has
// no organizationId yet) paired with the Activate button, kept visually
// grouped so the two-step "pick an org, then activate" relationship reads
// clearly in a dense table row.
const PendingActivateGroup = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const ActionButton = styled.button`
  padding: 4px 8px;
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 4px;
  background: ${({ theme }) => theme.colors.glass.base};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};

  &:hover {
    background: ${({ theme }) => theme.colors.glass.hi};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

// Destructive action — coral-b tinted glass, never solid red (spec §4).
const DeleteButton = styled(ActionButton)`
  border-color: rgba(240, 138, 112, 0.45);
  color: ${({ theme }) => theme.colors.bright.coral};

  &:hover {
    background: rgba(240, 138, 112, 0.16);
    color: ${({ theme }) => theme.colors.bright.coral};
  }
`;

// Security-sensitive action — warning-tinted, not the rare chrome gold.
const ResetMfaButton = styled(ActionButton)`
  border-color: rgba(232, 200, 106, 0.45);
  color: ${({ theme }) => theme.colors.warning};

  &:hover {
    background: ${({ theme }) => theme.colors.warningBg};
    color: ${({ theme }) => theme.colors.warning};
  }
`;

const MfaEnabledBadge = styled.span`
  ${phaseBadge('fruiting')}
`;

const MfaPendingBadge = styled.span`
  ${phaseBadge('fruitingInit')}
`;

const MfaDisabledBadge = styled.span`
  ${phaseBadge('empty')}
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`;

const PageInfo = styled.div`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PageButtons = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const PageButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.glass.border};
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.glass.base};
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.glass.hi};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PageIndicator = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export default UserManagementPage;
