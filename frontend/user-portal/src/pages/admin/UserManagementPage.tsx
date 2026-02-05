import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Card } from '@a64core/shared';
import { apiClient } from '../../services/api';
import { useAuthStore } from '../../stores/auth.store';
import { useToastStore } from '../../stores/toast.store';

interface User {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: string;
  lastLoginAt?: string;
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

const ROLE_OPTIONS = ['super_admin', 'admin', 'moderator', 'user', 'guest'];

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

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
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
  }, [page, search, roleFilter, statusFilter]);

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
      await apiClient.put(`/v1/users/${userId}/role`, { role });
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

  return (
    <Container>
      <Header>
        <Title>User Management</Title>
        <Subtitle>Manage system users, roles, and permissions</Subtitle>
      </Header>

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

          <FilterSelect
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </FilterSelect>

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
            <Table>
              <thead>
                <tr>
                  <TableHeader>User</TableHeader>
                  <TableHeader>Email</TableHeader>
                  <TableHeader>Role</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Joined</TableHeader>
                  <TableHeader>Last Login</TableHeader>
                  <TableHeader>Actions</TableHeader>
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
                            {ROLE_OPTIONS.map(role => (
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
                      <StatusBadge $active={user.isActive}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </StatusBadge>
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
                                setNewRole(user.role);
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

const Header = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSize['2xl']};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  color: ${({ theme }) => theme.colors.textPrimary};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;

  @media (min-width: 768px) {
    font-size: ${({ theme }) => theme.typography.fontSize['3xl']};
  }
`;

const Subtitle = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`;

const FiltersCard = styled.div`
  background: white;
  border-radius: 8px;
  padding: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const FilterSelect = styled.select`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  background: white;
  cursor: pointer;
  min-width: 140px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const ClearButton = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.error[300]};
  border-radius: 6px;
  background: white;
  color: ${({ theme }) => theme.colors.error[600]};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.error[50]};
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
  color: ${({ theme }) => theme.colors.error[600]};
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

const TableHeader = styled.th`
  text-align: left;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 2px solid ${({ theme }) => theme.colors.neutral[200]};
`;

const TableRow = styled.tr`
  /* Striped rows for readability - alternating row colors */
  &:nth-child(even) {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }

  &:nth-child(odd) {
    background: #ffffff;
  }

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[100]};
  }
`;

const TableCell = styled.td`
  padding: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.neutral[200]};
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
  background: ${({ theme }) => theme.colors.primary[100]};
  color: ${({ theme }) => theme.colors.primary[700]};
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: normal;
`;

const EmailText = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const UnverifiedBadge = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  background: ${({ theme }) => theme.colors.warning[100]};
  color: ${({ theme }) => theme.colors.warning[700]};
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: ${({ theme }) => theme.spacing.xs};
`;

const RoleBadge = styled.span<{ role: string }>`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  text-transform: capitalize;
  background: ${({ role, theme }) => {
    switch (role) {
      case 'super_admin': return theme.colors.error[100];
      case 'admin': return theme.colors.warning[100];
      case 'moderator': return theme.colors.info[100];
      case 'user': return theme.colors.success[100];
      default: return theme.colors.neutral[100];
    }
  }};
  color: ${({ role, theme }) => {
    switch (role) {
      case 'super_admin': return theme.colors.error[700];
      case 'admin': return theme.colors.warning[700];
      case 'moderator': return theme.colors.info[700];
      case 'user': return theme.colors.success[700];
      default: return theme.colors.neutral[700];
    }
  }};
`;

const StatusBadge = styled.span<{ $active: boolean }>`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  background: ${({ $active, theme }) => $active ? theme.colors.success[100] : theme.colors.neutral[100]};
  color: ${({ $active, theme }) => $active ? theme.colors.success[700] : theme.colors.neutral[600]};
`;

const RoleEditRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const RoleSelect = styled.select`
  padding: 4px 8px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 4px;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
`;

const SmallButton = styled.button`
  padding: 4px 8px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 4px;
  background: white;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[50]};
  }
`;

const ActionsRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const ActionButton = styled.button`
  padding: 4px 8px;
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 4px;
  background: white;
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textSecondary};

  &:hover {
    background: ${({ theme }) => theme.colors.neutral[50]};
    color: ${({ theme }) => theme.colors.textPrimary};
  }
`;

const DeleteButton = styled(ActionButton)`
  border-color: ${({ theme }) => theme.colors.error[300]};
  color: ${({ theme }) => theme.colors.error[600]};

  &:hover {
    background: ${({ theme }) => theme.colors.error[50]};
    color: ${({ theme }) => theme.colors.error[700]};
  }
`;

const Pagination = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.neutral[200]};
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
  border: 1px solid ${({ theme }) => theme.colors.neutral[300]};
  border-radius: 6px;
  background: white;
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral[50]};
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
