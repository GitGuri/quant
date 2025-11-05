import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Pencil, Trash2, Plus, Loader2, Search as SearchIcon, X as XIcon, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../AuthPage';
import { Header } from '../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';

const API_BASE_URL = 'https://quantnow-sa1e.onrender.com';

interface User {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
  officeCode?: string;
  branches?: Array<{ id: string; code: string; name: string; is_primary: boolean }>;
}

interface Branch {
  id: string;
  code: string;
  name: string;
}

export default function UserManagementPage() {
  const { isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<User>>({});
  const [editUserRoles, setEditUserRoles] = useState<string[]>([]);

  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [primaryBranchId, setPrimaryBranchId] = useState<string | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({
    displayName: '',
    email: '',
    password: '',
    officeCode: '',
    roles: [] as string[],
  });

  const [searchText, setSearchText] = useState('');
  const [searchApplied, setSearchApplied] = useState('');

  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isSavingAdd, setIsSavingAdd] = useState(false);
  const [isHardRefreshing, setIsHardRefreshing] = useState(false);

  const allRoles = [
    'admin','ceo','manager','cashier','accountant','pos-transact','transactions','financials','import','tasks',
    'agent','super-agent','data-analytics','dashboard','invoice','payroll','pos-admin','projections','accounting',
    'documents','chat','user-management','personel-setup','profile-setup',
  ];

  const fetchJson = async (url: string, init?: RequestInit) => {
    const r = await fetch(url, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', ...(init?.headers || {}) },
      ...init,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };

  const makeTempId = () => {
    try { return crypto.randomUUID(); } catch { return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`; }
  };

  const upsertUser = (next: User) =>
    setUsers(prev => {
      const i = prev.findIndex(u => u.id === next.id || u.email === next.email);
      if (i === -1) return [next, ...prev];
      const copy = prev.slice();
      copy[i] = { ...prev[i], ...next };
      return copy;
    });

  const removeUser = (id: string) => setUsers(prev => prev.filter(u => u.id !== id));

  // --- Fetchers --------------------------------------------------------------

  const fetchUsers = useCallback(async () => {
    if (!token) {
      setUsers([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const data = await fetchJson(`${API_BASE_URL}/users`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(`Failed to load users: ${err.message}.`);
    }
  }, [token]);

  const fetchBranches = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchJson(`${API_BASE_URL}/api/branches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBranches(data || []);
    } catch (e) {
      console.error('Error loading branches:', e);
    }
  }, [token]);

  // Hydrate each user's memberships (branches) so the table updates instantly
  const hydrateUserMemberships = useCallback(async (userId: string) => {
    if (!token) return [];
    try {
      const r = await fetch(`${API_BASE_URL}/api/users/${userId}/branches`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!r.ok) return [];
      const data = await r.json();
      const items: Array<{ branch_id: string; is_primary: boolean; code?: string; name?: string }> = data?.memberships || [];
      // Map membership to the known branch list for code/name
      return items.map(m => {
        const meta = branches.find(b => b.id === m.branch_id);
        return {
          id: m.branch_id,
          code: meta?.code || '',
          name: meta?.name || '',
          is_primary: m.is_primary,
        };
      });
    } catch (e) {
      console.error('hydrateUserMemberships error', e);
      return [];
    }
  }, [token, branches]);

  // Hard refresh: fetch users, then hydrate branches for all of them
  const hardRefreshUsers = useCallback(async () => {
    if (!token) return;
    setIsHardRefreshing(true);
    setLoading(true);
    try {
      await fetchUsers();
      // After users are in state, hydrate memberships in parallel
      const list = await fetchJson(`${API_BASE_URL}/users`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });

      const array: User[] = Array.isArray(list) ? list : [];
      const hydrated = await Promise.all(
        array.map(async (u) => {
          const branchesForU = await hydrateUserMemberships(u.id);
          return { ...u, branches: branchesForU };
        })
      );
      setUsers(hydrated);
    } catch (e) {
      // fetchUsers already sets error if it fails
    } finally {
      setIsHardRefreshing(false);
      setLoading(false);
    }
  }, [token, fetchUsers, hydrateUserMemberships]);

  // Initial load
  useEffect(() => {
    if (isAuthenticated && token) {
      (async () => {
        setLoading(true);
        await Promise.all([fetchUsers(), fetchBranches()]);
        // first hydration
        await hardRefreshUsers();
      })();
    } else {
      setUsers([]);
      setBranches([]);
      setLoading(false);
    }
  }, [isAuthenticated, token, fetchUsers, fetchBranches, hardRefreshUsers]);

  // Revalidate on focus, online, and visibility change
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    const onFocus = () => hardRefreshUsers();
    const onOnline = () => hardRefreshUsers();
    const onVisibility = () => { if (document.visibilityState === 'visible') hardRefreshUsers(); };

    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isAuthenticated, token, hardRefreshUsers]);

  // Optional light polling (30s)
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    const id = setInterval(() => hardRefreshUsers(), 30000);
    return () => clearInterval(id);
  }, [isAuthenticated, token, hardRefreshUsers]);

  // --- Edit modal helpers ----------------------------------------------------

  const loadUserMemberships = useCallback(async (userId: string) => {
    const memberships = await hydrateUserMemberships(userId);
    setSelectedBranchIds(memberships.map(m => m.id));
    const primary = memberships.find(m => m.is_primary);
    setPrimaryBranchId(primary ? primary.id : null);
  }, [hydrateUserMemberships]);

  const openDeleteModal = (user: User) => {
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete || !token) return;
    setLoading(true);
    const deletedId = userToDelete.id;
    const snapshot = users;
    removeUser(deletedId);

    try {
      const response = await fetch(`${API_BASE_URL}/users/${deletedId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      toast({ title: 'User Deleted', description: `User ${userToDelete.displayName} has been successfully deleted.` });
      await hardRefreshUsers(); // make sure table reflects server truth
    } catch (e: any) {
      console.error('Error deleting user:', e);
      setUsers(snapshot); // rollback
      toast({ title: 'Deletion Failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
      setLoading(false);
    }
  };

  const openEditModal = async (user: User) => {
    setUserToEdit(user);
    setEditFormData({ id: user.id, displayName: user.displayName, email: user.email });
    setEditUserRoles(Array.from(new Set(user.roles)));
    await loadUserMemberships(user.id);
    setIsEditModalOpen(true);
  };

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRoleToggle = (role: string) => {
    setEditUserRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const toggleBranch = (branchId: string) => {
    setSelectedBranchIds(prev => {
      if (prev.includes(branchId)) {
        if (primaryBranchId === branchId) setPrimaryBranchId(null);
        return prev.filter(id => id !== branchId);
      }
      return [...prev, branchId];
    });
  };

  const pickPrimary = (branchId: string) => {
    if (!selectedBranchIds.includes(branchId)) {
      setSelectedBranchIds(prev => [...prev, branchId]);
    }
    setPrimaryBranchId(branchId);
  };

  const saveUserEdit = async () => {
    if (!userToEdit || !token) return;
    setIsSavingEdit(true);
    try {
      const uniqueRoles = Array.from(new Set(editUserRoles));

      // optimistic UI
      upsertUser({
        ...userToEdit,
        displayName: editFormData.displayName || userToEdit.displayName,
        email: (editFormData.email || userToEdit.email)!,
        roles: uniqueRoles,
      });

      // 1) basic details
      {
        const res = await fetch(`${API_BASE_URL}/users/${userToEdit.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ displayName: editFormData.displayName, email: editFormData.email }),
          cache: 'no-store',
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }
      }

      // 2) roles
      {
        const res = await fetch(`${API_BASE_URL}/users/${userToEdit.id}/roles`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ roles: uniqueRoles }),
          cache: 'no-store',
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }
      }

      // 3) branches (optional)
      if (selectedBranchIds.length > 0) {
        const effectivePrimary =
          primaryBranchId && selectedBranchIds.includes(primaryBranchId)
            ? primaryBranchId
            : selectedBranchIds[0];

        const memberships = selectedBranchIds.map(id => ({
          branchId: id,
          isPrimary: id === effectivePrimary,
        }));

        const r = await fetch(`${API_BASE_URL}/api/users/${userToEdit.id}/branches`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ memberships }),
          cache: 'no-store',
        });
        if (!r.ok) {
          const errorData = await r.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to update branch memberships (${r.status})`);
        }
      }

      toast({ title: 'User Updated', description: `User ${editFormData.displayName || userToEdit.displayName} has been successfully updated.` });

      // hard refresh to hydrate memberships so the table reflects changes instantly
      await hardRefreshUsers();
    } catch (e: any) {
      console.error('Error updating user:', e);
      toast({ title: 'Update Failed', description: e.message, variant: 'destructive' });
      await hardRefreshUsers();
    } finally {
      setIsSavingEdit(false);
      setIsEditModalOpen(false);
      setUserToEdit(null);
    }
  };

  const openAddModal = () => {
    setNewUserData({ displayName: '', email: '', password: '', officeCode: '', roles: [] });
    setIsAddModalOpen(true);
  };

  const addNewUser = async () => {
    if (!token) return;
    setIsSavingAdd(true);

    const tempId = makeTempId();
    const tempUser: User = {
      id: tempId,
      displayName: newUserData.displayName,
      email: newUserData.email,
      roles: [...(newUserData.roles || [])],
      officeCode: newUserData.officeCode || undefined,
    };
    setUsers(prev => [tempUser, ...prev]);

    try {
      const payload = {
        displayName: newUserData.displayName.trim(),
        email: newUserData.email.trim().toLowerCase(),
        password: newUserData.password,
        roles: newUserData.roles,
        officeCode: newUserData.officeCode?.trim() || null,
      };

      const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });

      const body = await response.json().catch(() => ({ error: 'Unknown error' }));

      if (!response.ok) {
        const msg = body?.error || `HTTP error! status: ${response.status}`;
        removeUser(tempId);
        if (response.status === 409 || /duplicate|unique constraint|users_email_key/i.test(msg)) {
          toast({
            title: 'Email Already Exists',
            description: 'A user with this email address already exists in the system. Please use a different email address.',
            variant: 'destructive',
          });
          return;
        }
        throw new Error(msg);
      }

      const created: User | undefined = body?.user || body;
      if (created?.id) {
        setUsers(prev =>
          prev.map(u =>
            (u.id === tempId || u.email === created.email)
              ? { ...u, ...created, roles: u.roles?.length ? u.roles : (created.roles || []) }
              : u
          )
        );
      }

      toast({ title: 'User Added Successfully', description: `The user "${newUserData.displayName}" has been created.` });

      setIsAddModalOpen(false);
      setNewUserData({ displayName: '', email: '', password: '', officeCode: '', roles: [] });

      // hard refresh so we immediately show branch & role truth from the server
      await hardRefreshUsers();
    } catch (e: any) {
      console.error('Error adding new user:', e);
      removeUser(tempId);
      toast({
        title: 'Add User Failed',
        description: e.message || 'An unexpected error occurred while adding the user. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingAdd(false);
    }
  };

  // --- Search ----------------------------------------------------------------

  const displayedUsers = useMemo(() => {
    const q = (searchApplied || '').trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => {
      const inName = (u.displayName || '').toLowerCase().includes(q);
      const inEmail = (u.email || '').toLowerCase().includes(q);
      const inRoles = (u.roles || []).some(r => r.toLowerCase().includes(q));
      return inName || inEmail || inRoles;
    });
  }, [users, searchApplied]);

  const onApplySearch = () => setSearchApplied(searchText);
  const onClearSearch = () => { setSearchText(''); setSearchApplied(''); };

  return (
    <div className='flex-1 space-y-4 p-4 md:p-6 lg:p-8'>
      <Header title='User Management' />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className='space-y-6'>
        <Card>
          <CardHeader className='flex flex-col gap-3 md:flex-row md:justify-between md:items-center'>
            <div className='flex items-center gap-3 w-full md:w-auto'>
              <CardTitle>User Accounts</CardTitle>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {displayedUsers.length} / {users.length}
              </span>
              <Button variant="ghost" size="sm" onClick={hardRefreshUsers} disabled={isHardRefreshing}>
                {isHardRefreshing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Refresh
              </Button>
            </div>

            <div className='flex w-full md:w-auto items-center gap-2'>
              <div className="relative w-full md:w-72">
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search name, email or role..."
                  className="pr-9"
                />
                {searchText && (
                  <button
                    type="button"
                    onClick={onClearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100"
                    aria-label="Clear search"
                    title="Clear"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button variant="secondary" onClick={onApplySearch}>
                <SearchIcon className="h-4 w-4 mr-1" />
                Search
              </Button>

              <Button onClick={openAddModal}>
                <Plus className="h-4 w-4 mr-2" />
                Add New User
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-4 border-blue-500 border-opacity-25"></div>
              </div>
            ) : error ? (
              <div className="bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg relative" role="alert">
                <span className="block sm:inline">{error}</span>
              </div>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full'>
                  <thead>
                    <tr className='border-b'>
                      <th className='text-left p-3'>Name</th>
                      <th className='text-left p-3'>Email</th>
                      <th className='text-left p-3'>Roles</th>
                      <th className='text-left p-3'>Branches</th>
                      <th className='text-right p-3'>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-muted-foreground">
                          No users found.
                        </td>
                      </tr>
                    ) : (
                      displayedUsers.map((user) => (
                        <motion.tr
                          key={user.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className='border-b last:border-b-0 hover:bg-muted/50'
                        >
                          <td className='p-3 font-medium'>{user.displayName}</td>
                          <td className='p-3 text-muted-foreground'>{user.email}</td>
                          <td className='p-3 text-muted-foreground'>
                            {user.roles?.length ? user.roles.join(', ') : <span className="text-xs italic text-muted-foreground">none</span>}
                          </td>
                          <td className='p-3'>
                            <div className="flex flex-wrap gap-1">
                              {user.branches?.length
                                ? user.branches.map(b => (
                                    <Badge key={b.id} variant={b.is_primary ? 'default' : 'secondary'}>
                                      {b.code || b.name}{b.is_primary ? ' • primary' : ''}
                                    </Badge>
                                  ))
                                : <span className="text-xs italic text-muted-foreground">—</span>}
                            </div>
                          </td>
                          <td className='p-3 text-right'>
                            <div className='flex justify-end space-x-2'>
                              <Button variant='ghost' size='sm' onClick={() => openEditModal(user)}>
                                <Pencil className='h-4 w-4' />
                              </Button>
                              <Button variant='ghost' size='sm' onClick={() => openDeleteModal(user)} className='text-red-600 hover:bg-red-100'>
                                <Trash2 className='h-4 w-4' />
                              </Button>
                            </div>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && userToDelete && (
          <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Deletion</DialogTitle>
              </DialogHeader>
              <div className='space-y-4'>
                <p>Are you sure you want to delete user <strong>{userToDelete.displayName}</strong>? This action cannot be undone.</p>
                <div className='flex justify-end gap-2 mt-4'>
                  <Button variant='outline' onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
                  <Button variant='destructive' onClick={confirmDeleteUser}>Delete</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          {userToEdit && (
            <div className='space-y-6 py-2'>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor='edit-name'>Name</Label>
                  <Input id='edit-name' type='text' name='displayName' value={editFormData.displayName || ''} onChange={handleEditFormChange} />
                </div>
                <div>
                  <Label htmlFor='edit-email'>Email</Label>
                  <Input id='edit-email' type='email' name='email' value={editFormData.email || ''} onChange={handleEditFormChange} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Roles</Label>
                <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto p-2 border rounded-md">
                  {allRoles.map(role => (
                    <div key={role} className="flex items-center space-x-2">
                      <Checkbox id={`role-${role}`} checked={editUserRoles.includes(role)} onCheckedChange={() => handleRoleToggle(role)} />
                      <Label htmlFor={`role-${role}`} className="capitalize">{role}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Branches (optional)</Label>
                <div className="border rounded-md p-2 max-h-60 overflow-y-auto">
                  {branches.length === 0 ? (
                    <div className="text-sm text-muted-foreground px-1 py-2">No branches yet. Create branches in Profile &gt; Branches.</div>
                  ) : branches.map(b => {
                    const checked = selectedBranchIds.includes(b.id);
                    const isPrimary = primaryBranchId === b.id;
                    return (
                      <div key={b.id} className="flex items-center justify-between py-1 px-1">
                        <div className="flex items-center gap-2">
                          <Checkbox id={`branch-${b.id}`} checked={checked} onCheckedChange={() => toggleBranch(b.id)} />
                          <Label htmlFor={`branch-${b.id}`}>{b.name} <span className="text-xs text-muted-foreground">({b.code})</span></Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="radio" name="primaryBranch" checked={isPrimary} onChange={() => pickPrimary(b.id)} disabled={!checked} aria-label="Primary" />
                          <span className="text-xs">{isPrimary ? 'Primary' : 'Set primary'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-muted-foreground">You can select multiple branches. If none are selected, we’ll simply leave memberships unchanged.</div>
              </div>

              <div className='flex justify-end gap-2 mt-4'>
                <Button variant='outline' onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
                <Button onClick={saveUserEdit} disabled={isSavingEdit}>
                  {isSavingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add New User Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="add-name">Name</Label>
              <Input id="add-name" type="text" value={newUserData.displayName} onChange={(e) => setNewUserData({ ...newUserData, displayName: e.target.value })} placeholder="Full name" required />
            </div>

            <div>
              <Label htmlFor="add-email">Email</Label>
              <Input id="add-email" type="email" value={newUserData.email} onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })} placeholder="user@example.com" required />
            </div>

            <div>
              <Label htmlFor="add-password">Password</Label>
              <Input id="add-password" type="password" value={newUserData.password} onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })} placeholder="Set a password" required />
            </div>

            <div className="space-y-2 border-2 border-red-500 rounded-md p-3 bg-red-50">
              <Label className="text-red-700 font-semibold">Assign Roles <span className="text-red-500">*</span></Label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {allRoles.map((role) => (
                  <div key={role} className="flex items-center space-x-2">
                    <Checkbox
                      id={`add-role-${role}`}
                      checked={(newUserData.roles || []).includes(role)}
                      onCheckedChange={() => {
                        const roles = newUserData.roles || [];
                        const updated = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
                        setNewUserData({ ...newUserData, roles: updated });
                      }}
                    />
                    <Label htmlFor={`add-role-${role}`} className="capitalize">{role}</Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-red-700">Select at least one role before saving.</p>
            </div>

            <div>
              <Label htmlFor="add-office">Office Code (optional)</Label>
              <Input id="add-office" type="text" value={newUserData.officeCode} onChange={(e) => setNewUserData({ ...newUserData, officeCode: e.target.value })} placeholder="e.g. HQ-01" />
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setNewUserData({ displayName: '', email: '', password: '', officeCode: '', roles: [] });
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!newUserData.roles?.length) {
                    toast({ title: 'Role Required', description: 'Please select at least one role for the new user.', variant: 'destructive' });
                    return;
                  }
                  addNewUser();
                }}
                disabled={isSavingAdd}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSavingAdd && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add User
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
