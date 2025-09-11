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

const API_BASE_URL = 'http://localhost:3000https://quantnow-cu1v.onrender.com';

// Define an interface for the user data
interface User {
  id: string;
  displayName: string;
  email: string;
  // The backend now returns an array of roles
  roles: string[];
  // Add officeCode to the user interface
  officeCode?: string;
}

// A predefined list of roles for the select dropdowns
const allRoles = [
  'admin',
  'ceo',
  'manager',
  'cashier',
  //'user',
  'accountant',
  'pos-transact',
  'transactions',
  'financials',
  'import',
  'tasks',
  'agent',
  'super-agent',
  'data-analytics',
  'dashboard',
  'invoice',
  'payroll',
  'pos-admin',
  'projections',
  'accounting',
  'documents',
  'chat',
  'user-management',
  'personel-setup',
  'profile-setup',
];

export default function UserManagementPage() {
  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<User>>({});
  // New state to manage roles during the edit process
  const [editUserRoles, setEditUserRoles] = useState<string[]>([]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // Initial state for new user data, now includes password and officeCode
  const [newUserData, setNewUserData] = useState({ displayName: '', email: '', password: '', role: 'user', officeCode: '' });

  // Refactored to fetch users from your local backend API
  const fetchUsers = useCallback(async () => {
    if (!token) {
      console.warn('No token found. User is not authenticated.');
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setUsers(data);
    } catch (err: any) {
      console.error("Error fetching users:", err);
      setError(`Failed to load users: ${err.message}.`);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Fetch users on initial load and when the token changes
  useEffect(() => {
    if (isAuthenticated && token) {
      fetchUsers();
    } else {
      setUsers([]);
      setLoading(false);
    }
  }, [isAuthenticated, token, fetchUsers]);

  // Handler for opening the delete confirmation modal
  const openDeleteModal = (user: User) => {
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  // Handler for confirming and performing user deletion via the API
  const confirmDeleteUser = async () => {
    if (!userToDelete || !token) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      toast({
        title: "User Deleted",
        description: `User ${userToDelete.displayName} has been successfully deleted.`,
      });

      fetchUsers(); // Re-fetch to update the list
    } catch (e: any) {
      console.error("Error deleting user:", e);
      toast({
        title: "Deletion Failed",
        description: `Could not delete user: ${e.message}`,
        variant: "destructive",
      });
    } finally {
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
      setLoading(false);
    }
  };

  // Handler for opening the edit modal
  const openEditModal = (user: User) => {
    setUserToEdit(user);
    setEditFormData({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
    });
    // --- FIX START: Deduplicate roles when setting initial state for the edit modal ---
    setEditUserRoles(Array.from(new Set(user.roles))); // Ensure initial roles are unique
    // --- FIX END ---
    setIsEditModalOpen(true);
  };

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRoleToggle = (role: string) => {
    setEditUserRoles(prevRoles =>
      prevRoles.includes(role)
        ? prevRoles.filter(r => r !== role)
        : [...prevRoles, role]
    );
  };

  // Handler for saving the user's edits via the API
  const saveUserEdit = async () => {
    if (!userToEdit || !token) return;
    setLoading(true);
    try {
      // API call to update user's display name and email
      const updateDetailsResponse = await fetch(`${API_BASE_URL}/users/${userToEdit.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName: editFormData.displayName,
          email: editFormData.email,
        }),
      });

      if (!updateDetailsResponse.ok) {
        const errorData = await updateDetailsResponse.json();
        throw new Error(errorData.error || `HTTP error! status: ${updateDetailsResponse.status}`);
      }

      // Ensure roles are unique before sending to backend (redundant if openEditModal is fixed, but good for robustness)
      const uniqueRoles = Array.from(new Set(editUserRoles));

      // Assuming a separate endpoint exists to handle role updates.
      const updateRolesResponse = await fetch(`${API_BASE_URL}/users/${userToEdit.id}/roles`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ roles: uniqueRoles }), // Send deduplicated roles
      });

      if (!updateRolesResponse.ok) {
        const errorData = await updateRolesResponse.json();
        throw new Error(errorData.error || `HTTP error! status: ${updateRolesResponse.status}`);
      }

      toast({
        title: "User Updated",
        description: `User ${editFormData.displayName} has been successfully updated.`,
      });

      fetchUsers(); // Re-fetch to update the list
    } catch (e: any) {
      console.error("Error updating user:", e);
      toast({
        title: "Update Failed",
        description: `Could not update user: ${e.message}`,
        variant: "destructive",
      });
    } finally {
      setIsEditModalOpen(false);
      setUserToEdit(null);
      setLoading(false);
    }
  };

  // Handler for opening the add new user modal
  const openAddModal = () => {
    setNewUserData({ displayName: '', email: '', password: '', role: 'user', officeCode: '' });
    setIsAddModalOpen(true);
  };

  // Handler for adding a new user via the API
  const addNewUser = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // Updated the payload to include officeCode
      const payload = {
        displayName: newUserData.displayName,
        email: newUserData.email,
        password: newUserData.password,
        role: newUserData.role,
        officeCode: newUserData.officeCode,
      };

      const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      toast({
        title: "User Added",
        description: `A new user has been successfully added.`,
      });

      fetchUsers(); // Re-fetch to update the list
    } catch (e: any) {
      console.error("Error adding new user:", e);
      toast({
        title: "Add User Failed",
        description: `Could not add new user: ${e.message}`,
        variant: "destructive",
      });
    } finally {
      setIsAddModalOpen(false);
      setLoading(false);
    }
  };

  return (
    <div className='flex-1 space-y-4 p-4 md:p-6 lg:p-8'>
      <Header title='User Management' />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className='space-y-6'
      >
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
                      <th className='text-right p-3'>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-12 text-muted-foreground">
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
                          <td className='p-3 text-muted-foreground'>
                            {/* Display roles as a comma-separated string */}
                            {user.roles.join(', ')}
                          </td>
                          <td className='p-3 text-right'>
                            <div className='flex justify-end space-x-2'>
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => openEditModal(user)}
                              >
                                <Pencil className='h-4 w-4' />
                              </Button>
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => openDeleteModal(user)}
                                className='text-red-600 hover:bg-red-100'
                              >
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {userToEdit && (
            <div className='space-y-4 py-4'>
              <Label htmlFor='edit-name'>Name</Label>
              <Input
                id='edit-name'
                type='text'
                name='displayName'
                value={editFormData.displayName || ''}
                onChange={handleEditFormChange}
              />
              <Label htmlFor='edit-email'>Email</Label>
              <Input
                id='edit-email'
                type='email'
                name='email'
                value={editFormData.email || ''}
                onChange={handleEditFormChange}
              />

              <div className="space-y-2">
                <Label>Roles</Label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border rounded-md">
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
            <Label htmlFor='add-name'>Name</Label>
            <Input
              id='add-name'
              type='text'
              name='displayName'
              value={newUserData.displayName}
              onChange={(e) => setNewUserData({ ...newUserData, displayName: e.target.value })}
              placeholder='User Name'
            />
            <Label htmlFor='add-email'>Email</Label>
            <Input
              id='add-email'
              type='email'
              name='email'
              value={newUserData.email}
              onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
              placeholder='user@example.com'
            />
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