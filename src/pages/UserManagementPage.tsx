import React, { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../AuthPage';
import { Header } from '../components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';

const API_BASE_URL = 'https://quantnow-sa1e.onrender.com';

// Define an interface for the user data
interface User {
  id: string;            // users.id (uuid)
  displayName: string;
  email: string;
  roles: string[];
  officeCode?: string;
  // optional for display: memberships fetched lazily
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

  // Branch selection state for the edit modal
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [primaryBranchId, setPrimaryBranchId] = useState<string | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({ displayName: '', email: '', password: '', role: 'user', officeCode: '' });

  // A predefined list of roles for the select dropdowns
  const allRoles = [
    'admin','ceo','manager','cashier','accountant','pos-transact','transactions','financials','import','tasks',
    'agent','super-agent','data-analytics','dashboard','invoice','payroll','pos-admin','projections','accounting',
    'documents','chat','user-management','personel-setup','profile-setup',
  ];

  // ---------- helpers (no-cache fetch + optimistic state) ----------
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
    // crypto.randomUUID() fallback
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

  const removeUser = (id: string) =>
    setUsers(prev => prev.filter(u => u.id !== id));

  // ---------- fetchers ----------
  const fetchUsers = useCallback(async () => {
    if (!token) {
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson(`${API_BASE_URL}/users`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Error fetching users:", err);
      setError(`Failed to load users: ${err.message}.`);
    } finally {
      setLoading(false);
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

  // initial load + focus refetch
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchUsers();
      fetchBranches();
    } else {
      setUsers([]);
      setBranches([]);
      setLoading(false);
    }
  }, [isAuthenticated, token, fetchUsers, fetchBranches]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    const onFocus = () => fetchUsers();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isAuthenticated, token, fetchUsers]);

  // optional light polling (30s)
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    const id = setInterval(() => fetchUsers(), 30000);
    return () => clearInterval(id);
  }, [isAuthenticated, token, fetchUsers]);

  // Load a single user's memberships when opening the edit modal
  const loadUserMemberships = useCallback(async (userId: string) => {
    if (!token) return;
    try {
      const r = await fetch(`${API_BASE_URL}/api/users/${userId}/branches`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!r.ok) return;
      const data = await r.json();
      const memberships: Array<{ branch_id: string; is_primary: boolean }> = data?.memberships || [];
      setSelectedBranchIds(memberships.map(m => m.branch_id));
      const primary = memberships.find(m => m.is_primary);
      setPrimaryBranchId(primary ? primary.branch_id : null);
    } catch (e) {
      console.error('loadUserMemberships error', e);
    }
  }, [token]);

  const openDeleteModal = (user: User) => {
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  // optimistic delete
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
      toast({ title: "User Deleted", description: `User ${userToDelete.displayName} has been successfully deleted.` });
    } catch (e: any) {
      console.error("Error deleting user:", e);
      setUsers(snapshot); // rollback
      toast({ title: "Deletion Failed", description: e.message, variant: "destructive" });
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

    // Load current memberships
    await loadUserMemberships(user.id);
    setIsEditModalOpen(true);
  };

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRoleToggle = (role: string) => {
    setEditUserRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  // Branch checkbox toggle
  const toggleBranch = (branchId: string) => {
    setSelectedBranchIds(prev => {
      if (prev.includes(branchId)) {
        if (primaryBranchId === branchId) setPrimaryBranchId(null);
        return prev.filter(id => id !== branchId);
      }
      return [...prev, branchId];
    });
  };

  // Pick a primary (must also be selected)
  const pickPrimary = (branchId: string) => {
    if (!selectedBranchIds.includes(branchId)) {
      setSelectedBranchIds(prev => [...prev, branchId]);
    }
    setPrimaryBranchId(branchId);
  };

  // optimistic edit
  const saveUserEdit = async () => {
    if (!userToEdit || !token) return;
    setLoading(true);
    try {
      const uniqueRoles = Array.from(new Set(editUserRoles));

      // optimistic update for list
      upsertUser({
        ...userToEdit,
        displayName: editFormData.displayName || userToEdit.displayName,
        email: (editFormData.email || userToEdit.email)!,
        roles: uniqueRoles,
      });

      // 1) basic details
      const updateDetailsResponse = await fetch(`${API_BASE_URL}/users/${userToEdit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ displayName: editFormData.displayName, email: editFormData.email }),
        cache: 'no-store',
      });
      if (!updateDetailsResponse.ok) {
        const errorData = await updateDetailsResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${updateDetailsResponse.status}`);
      }

      // 2) roles
      const updateRolesResponse = await fetch(`${API_BASE_URL}/users/${userToEdit.id}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roles: uniqueRoles }),
        cache: 'no-store',
      });
      if (!updateRolesResponse.ok) {
        const errorData = await updateRolesResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${updateRolesResponse.status}`);
      }

      // 3) branches
      if (!primaryBranchId) throw new Error('Please select a primary branch for this user.');
      if (!selectedBranchIds.includes(primaryBranchId)) throw new Error('Primary branch must be in the selected branches list.');

      const memberships = selectedBranchIds.map(id => ({ branchId: id, isPrimary: id === primaryBranchId }));
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

      toast({ title: "User Updated", description: `User ${editFormData.displayName} has been successfully updated.` });
      // Reconcile with server
      await fetchUsers();
    } catch (e: any) {
      console.error("Error updating user:", e);
      toast({ title: "Update Failed", description: e.message, variant: "destructive" });
      await fetchUsers(); // roll back to server truth
    } finally {
      setIsEditModalOpen(false);
      setUserToEdit(null);
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setNewUserData({ displayName: '', email: '', password: '', role: 'user', officeCode: '' });
    setIsAddModalOpen(true);
  };

  // optimistic add
  const addNewUser = async () => {
    if (!token) return;
    setLoading(true);

    const tempId = makeTempId();
    const tempUser: User = {
      id: tempId,
      displayName: newUserData.displayName,
      email: newUserData.email,
      roles: [newUserData.role],
      officeCode: newUserData.officeCode || undefined,
    };
    setUsers(prev => [tempUser, ...prev]);

    try {
      const payload = {
        displayName: newUserData.displayName,
        email: newUserData.email,
        password: newUserData.password,
        role: newUserData.role,
        officeCode: newUserData.officeCode,
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
        // rollback optimistic
        removeUser(tempId);

        if (
          response.status === 409 ||
          /duplicate|unique constraint|users_email_key/i.test(msg)
        ) {
          toast({
            title: "Email Already Exists",
            description: "A user with this email address already exists in the system. Please use a different email address.",
            variant: "destructive"
          });
          return;
        }

        throw new Error(msg);
      }

      // If API returns created user, merge it; otherwise refetch
      const created: User | undefined = body?.user || body;
      if (created?.id) {
        setUsers(prev =>
          prev.map(u => (u.id === tempId || u.email === created.email ? { ...u, ...created } : u))
        );
      } else {
        await fetchUsers();
      }

      toast({
        title: "User Added Successfully",
        description: `The user "${newUserData.displayName}" has been created.`
      });
      setIsAddModalOpen(false);
      setNewUserData({ displayName: '', email: '', password: '', role: 'user', officeCode: '' });
    } catch (e: any) {
      console.error("Error adding new user:", e);
      // rollback optimistic
      removeUser(tempId);
      toast({
        title: "Add User Failed",
        description: e.message || "An unexpected error occurred while adding the user. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='flex-1 space-y-4 p-4 md:p-6 lg:p-8'>
      <Header title='User Management' />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className='space-y-6'>
        <Card>
          <CardHeader className='flex flex-row justify-between items-center'>
            <CardTitle>User Accounts</CardTitle>
            <Button onClick={openAddModal}>
              <Plus className="h-4 w-4 mr-2" />
              Add New User
            </Button>
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
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-muted-foreground">
                          No users found.
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => (
                        <motion.tr
                          key={user.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className='border-b last:border-b-0 hover:bg-muted/50'
                        >
                          <td className='p-3 font-medium'>{user.displayName}</td>
                          <td className='p-3 text-muted-foreground'>{user.email}</td>
                          <td className='p-3 text-muted-foreground'>{user.roles.join(', ')}</td>
                          <td className='p-3'>
                            <div className="flex flex-wrap gap-1">
                              {user.branches?.map(b => (
                                <Badge key={b.id} variant={b.is_primary ? 'default' : 'secondary'}>
                                  {b.code || b.name}{b.is_primary ? ' • primary' : ''}
                                </Badge>
                              )) || null}
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
                  <Button variant='outline' onClick={() => setIsDeleteModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant='destructive' onClick={confirmDeleteUser}>
                    Delete
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {userToEdit && (
            <div className='space-y-6 py-2'>
              {/* Basic fields */}
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

              {/* Roles */}
              <div className="space-y-2">
                <Label>Roles</Label>
                <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto p-2 border rounded-md">
                  {allRoles.map(role => (
                    <div key={role} className="flex items-center space-x-2">
                      <Checkbox
                        id={`role-${role}`}
                        checked={editUserRoles.includes(role)}
                        onCheckedChange={() => handleRoleToggle(role)}
                      />
                      <Label htmlFor={`role-${role}`} className="capitalize">
                        {role}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Branch assignments */}
              <div className="space-y-2">
                <Label>Branches (select one primary)</Label>
                <div className="border rounded-md p-2 max-h-60 overflow-y-auto">
                  {branches.length === 0 ? (
                    <div className="text-sm text-muted-foreground px-1 py-2">No branches yet. Create branches in Profile &gt; Branches.</div>
                  ) : branches.map(b => {
                    const checked = selectedBranchIds.includes(b.id);
                    const isPrimary = primaryBranchId === b.id;
                    return (
                      <div key={b.id} className="flex items-center justify-between py-1 px-1">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`branch-${b.id}`}
                            checked={checked}
                            onCheckedChange={() => toggleBranch(b.id)}
                          />
                          <Label htmlFor={`branch-${b.id}`}>{b.name} <span className="text-xs text-muted-foreground">({b.code})</span></Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="primaryBranch"
                            checked={isPrimary}
                            onChange={() => pickPrimary(b.id)}
                            disabled={!checked}
                            aria-label="Primary"
                          />
                          <span className="text-xs">{isPrimary ? 'Primary' : 'Set primary'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-xs text-muted-foreground">
                  Tip: You can select multiple branches, but exactly one must be primary.
                </div>
              </div>

              <div className='flex justify-end gap-2 mt-4'>
                <Button variant='outline' onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={saveUserEdit}>Save Changes</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add New User Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <div className='space-y-4 py-4'>
            <div>
              <Label htmlFor='add-name'>Name</Label>
              <Input
                id='add-name'
                type='text'
                name='displayName'
                value={newUserData.displayName}
                onChange={(e) => setNewUserData({ ...newUserData, displayName: e.target.value })}
                placeholder='User Name'
              />
            </div>
            <div>
              <Label htmlFor='add-email'>Email</Label>
              <Input
                id='add-email'
                type='email'
                name='email'
                value={newUserData.email}
                onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                placeholder='user@example.com'
              />
            </div>
            <div>
              <Label htmlFor='add-password'>Password</Label>
              <Input
                id='add-password'
                type='password'
                name='password'
                value={newUserData.password}
                onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                placeholder='Set a password'
                required
              />
            </div>
            <div>
              <Label htmlFor='add-role'>Role</Label>
              <Select
                name='role'
                value={newUserData.role}
                onValueChange={(value) => setNewUserData({ ...newUserData, role: value })}
              >
                <SelectTrigger id='add-role'>
                  <SelectValue placeholder='Select role' />
                </SelectTrigger>
                <SelectContent>
                  {allRoles.map(role => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Optional legacy field; you can remove if you’re moving fully to branches */}
            <div>
              <Label htmlFor='add-office'>Office Code (legacy)</Label>
              <Input
                id='add-office'
                type='text'
                name='officeCode'
                value={newUserData.officeCode}
                onChange={(e) => setNewUserData({ ...newUserData, officeCode: e.target.value })}
                placeholder='e.g. JHB-01'
              />
            </div>

            <div className='flex justify-end gap-2 mt-4'>
              <Button
                variant='outline'
                onClick={() => {
                  setIsAddModalOpen(false);
                  setNewUserData({ displayName: '', email: '', role: 'user', password: '', officeCode: '' });
                }}
              >
                Cancel
              </Button>
              <Button onClick={addNewUser}>Add User</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
