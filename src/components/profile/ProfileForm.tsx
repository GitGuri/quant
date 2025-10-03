import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Upload,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Shield,
  Edit3,
  Building2,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '../../AuthPage';

// --- Define API Base URL ---
const API_BASE_URL = 'https://quantnow-sa1e.onrender.com';
// --- End Define API Base URL ---

type Branch = {
  id: string;
  company_user_id: string;
  code: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type BranchForm = {
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
};

export function ProfileForm() {
  const { isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    position: '',
    address: '',
    city: '',
    province: '',
    postalCode: '',
    country: '',
    bio: '',
    website: '',
    linkedin: '',
    timezone: '',
    language: '',
    currency: '',
    userId: '',
  });

  const [loading, setLoading] = useState(true);
  const [changePassword, setChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Self-downgrade busy flag
  const [roleBusy, setRoleBusy] = useState(false);

  // ===== Logo state =====
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ===== Branches state =====
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState<BranchForm>({
    code: '',
    name: '',
    phone: '',
    email: '',
    address_line1: '',
    address_line2: '',
    city: '',
    province: '',
    postal_code: '',
    country: '',
  });
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id?: string }>({
    open: false,
  });

  // ---- helpers ----
  const alertErr = (msg: string) =>
    alert(msg || 'Something went wrong. Please try again.');

  // Fetch profile + current logo URL
  useEffect(() => {
    const fetchProfile = async () => {
      if (!isAuthenticated || !token) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // Profile
        const res = await fetch(`${API_BASE_URL}/api/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to load profile.');
        }
        const data = await res.json();
        const [firstName, ...lastNameParts] = (data.name || '').split(' ');
        setFormData({
          firstName: firstName || '',
          lastName: lastNameParts.join(' ') || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          company: data.company || '',
          position: data.position || '',
          city: data.city || '',
          province: data.province || '',
          postalCode: data.postal_code || '',
          country: data.country || '',
          bio: data.bio || '',
          website: data.website || '',
          linkedin: data.linkedin || '',
          timezone: data.timezone || '',
          language: data.language || '',
          currency: data.currency || '',
          userId: data.user_id || '',
        });

        // Logo URL
        const lres = await fetch(`${API_BASE_URL}/logo`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (lres.ok) {
          const ldata = await lres.json().catch(() => ({}));
          setLogoUrl(ldata?.url || null);
        } else {
          setLogoUrl(null);
        }
      } catch (err: any) {
        console.error('Could not fetch profile:', err);
        alertErr(`Could not fetch profile: ${err?.message || 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [isAuthenticated, token]);

  // Fetch branches for this company
  const loadBranches = async () => {
    if (!isAuthenticated || !token) return;
    setBranchesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/branches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to load branches');
      }
      const data: Branch[] = await res.json();
      setBranches(data || []);
    } catch (e: any) {
      console.error('[branches] load error:', e);
      alertErr(e?.message || 'Failed to load branches');
    } finally {
      setBranchesLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && token) {
      loadBranches();
    }
  }, [isAuthenticated, token]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!isAuthenticated || !token) {
      alert('You are not authenticated.');
      return;
    }
    try {
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
      const payload = {
        name: fullName,
        contact_person: fullName,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        company: formData.company,
        position: formData.position,
        city: formData.city,
        province: formData.province,
        postal_code: formData.postalCode,
        country: formData.country,
        bio: formData.bio,
        website: formData.website,
        linkedin: formData.linkedin,
        timezone: formData.timezone,
        language: formData.language,
        currency: formData.currency,
      };

      const res = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Profile update failed.');
      }

      if (changePassword) {
        if (!newPassword || newPassword !== confirmPassword) {
          alert('Passwords do not match.');
          return;
        }
        if (newPassword.length < 6) {
          alert('Password must be at least 6 characters long.');
          return;
        }

        const passRes = await fetch(`${API_BASE_URL}/api/profile/password`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password: newPassword }),
        });

        if (!passRes.ok) {
          const errorData = await passRes.json().catch(() => ({}));
          throw new Error(errorData.error || 'Password update failed.');
        }
      }

      alert('Profile saved successfully!');
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      alertErr(`Failed to save profile: ${err?.message || 'Unknown error'}`);
    }
  };

  // ===== Self-downgrade handler =====
  const handleSelfDowngrade = async () => {
    if (!isAuthenticated || !token) {
      alert('You are not authenticated.');
      return;
    }
    const password = window.prompt('Enter the Qx password to upgrade your role to User:');
    if (password == null) return; // user cancelled
    if (!password.trim()) {
      alert('Password is required.');
      return;
    }

    setRoleBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/self-role-downgrade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || 'Failed to downgrade role.');
        return;
      }

      alert('Role changed to user. For safety, please log in again.');
      localStorage.removeItem('token');
      window.location.href = '/login';
    } catch (e: any) {
      console.error('[self-role-downgrade] error:', e);
      alertErr(e?.message || 'Failed to downgrade role.');
    } finally {
      setRoleBusy(false);
    }
  };

  // ===== Logo handlers =====
  const uploadLogo = async (file: File) => {
    if (!isAuthenticated || !token) {
      alert('You are not authenticated.');
      return;
    }
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append('logo', file); // field name expected by /upload-logo
      const res = await fetch(`${API_BASE_URL}/upload-logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to upload logo');
      }
      // refresh logo url
      const lres = await fetch(`${API_BASE_URL}/logo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ldata = await lres.json().catch(() => ({}));
      setLogoUrl(ldata?.url || null);
    } catch (e: any) {
      alertErr(e?.message || 'Logo upload failed');
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const deleteLogo = async () => {
    if (!isAuthenticated || !token) return;
    setLogoBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/logo`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to delete logo');
      }
      setLogoUrl(null);
    } catch (e: any) {
      alertErr(e?.message || 'Logo delete failed');
    } finally {
      setLogoBusy(false);
    }
  };

  // ===== Branch CRUD handlers =====
  const resetBranchForm = () => {
    setBranchForm({
      code: '',
      name: '',
      phone: '',
      email: '',
      address_line1: '',
      address_line2: '',
      city: '',
      province: '',
      postal_code: '',
      country: '',
    });
  };

  const openCreateBranch = () => {
    setEditingBranch(null);
    resetBranchForm();
    setBranchModalOpen(true);
  };

  const openEditBranch = (b: Branch) => {
    setEditingBranch(b);
    setBranchForm({
      code: b.code || '',
      name: b.name || '',
      phone: b.phone || '',
      email: b.email || '',
      address_line1: b.address_line1 || '',
      address_line2: b.address_line2 || '',
      city: b.city || '',
      province: b.province || '',
      postal_code: b.postal_code || '',
      country: b.country || '',
    });
    setBranchModalOpen(true);
  };

  const saveBranch = async () => {
    if (!isAuthenticated || !token) return;
    if (!branchForm.code?.trim() || !branchForm.name?.trim()) {
      alert('Code and Name are required.');
      return;
    }
    setBranchBusy(true);
    try {
      const method = editingBranch ? 'PUT' : 'POST';
      const url = editingBranch
        ? `${API_BASE_URL}/api/branches/${editingBranch.id}`
        : `${API_BASE_URL}/api/branches`;
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(branchForm),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to save branch');
      }
      setBranchModalOpen(false);
      await loadBranches();
    } catch (e: any) {
      alertErr(e?.message || 'Failed to save branch');
    } finally {
      setBranchBusy(false);
    }
  };

  const toggleActive = async (b: Branch) => {
    if (!isAuthenticated || !token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/branches/${b.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: !b.is_active }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to update branch');
      }
      await loadBranches();
    } catch (e: any) {
      alertErr(e?.message || 'Failed to update branch');
    }
  };

  const deleteBranch = async (id?: string) => {
    if (!id || !isAuthenticated || !token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/branches/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to delete branch');
      }
      setConfirmDelete({ open: false, id: undefined });
      await loadBranches();
    } catch (e: any) {
      alertErr(e?.message || 'Failed to delete branch');
    }
  };

  if (loading) return <Skeleton className="h-[400px] w-full max-w-4xl mx-auto" />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Personal Information Card */}
      <Card>
        <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input id="firstName" placeholder="First Name" value={formData.firstName} onChange={e => handleChange('firstName', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input id="lastName" placeholder="Last Name" value={formData.lastName} onChange={e => handleChange('lastName', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="Email" value={formData.email} onChange={e => handleChange('email', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" placeholder="Phone" value={formData.phone} onChange={e => handleChange('phone', e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" placeholder="Bio" value={formData.bio} onChange={e => handleChange('bio', e.target.value)} rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Company Information Card */}
      <Card>
        <CardHeader><CardTitle>Company Information</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Input id="company" placeholder="Company" value={formData.company} onChange={e => handleChange('company', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="position">Position</Label>
            <Input id="position" placeholder="Position" value={formData.position} onChange={e => handleChange('position', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input id="website" type="url" placeholder="https://example.com" value={formData.website} onChange={e => handleChange('website', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="linkedin">LinkedIn</Label>
            <Input id="linkedin" type="url" placeholder="https://linkedin.com/in/username" value={formData.linkedin} onChange={e => handleChange('linkedin', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Company Logo */}
      <Card>
        <CardHeader><CardTitle>Company Logo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg p-4 flex items-center justify-center bg-muted/30 min-h-40">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Company Logo" className="max-h-28 object-contain" />
            ) : (
              <div className="text-muted-foreground flex items-center gap-2">
                <ImageIcon className="h-5 w-5" /> No logo uploaded
              </div>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadLogo(f);
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => fileRef.current?.click()} disabled={logoBusy}>
              {logoBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {logoUrl ? 'Replace Logo' : 'Upload Logo'}
            </Button>
            {logoUrl && (
              <Button variant="destructive" onClick={deleteLogo} disabled={logoBusy}>
                <Trash2 className="h-4 w-4 mr-2" /> Remove
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Supported: PNG, JPG, WEBP, SVG. Max 5 MB.
          </p>
        </CardContent>
      </Card>

      {/* Branches Manager */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Branches
          </CardTitle>
          <Button onClick={openCreateBranch}>
            <Plus className="h-4 w-4 mr-2" />
            Add Branch
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {branchesLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : branches.length === 0 ? (
            <div className="text-sm text-muted-foreground">No branches yet. Click “Add Branch” to create your first branch.</div>
          ) : (
            <div className="grid gap-3">
              {branches.map((b) => (
                <div
                  key={b.id}
                  className="border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{b.name}</span>
                      <Badge variant={b.is_active ? 'default' : 'secondary'}>
                        {b.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Code: {b.code}
                      {b.city ? ` • ${b.city}` : ''}{b.province ? `, ${b.province}` : ''}
                    </div>
                    {b.address_line1 ? (
                      <div className="text-xs text-muted-foreground">
                        {b.address_line1}{b.address_line2 ? `, ${b.address_line2}` : ''}{b.postal_code ? `, ${b.postal_code}` : ''}
                      </div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      {b.phone ? `Tel: ${b.phone}` : ''}{b.phone && b.email ? ' • ' : ''}{b.email ? `Email: ${b.email}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={() => openEditBranch(b)}>
                      <Edit3 className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button variant="outline" onClick={() => toggleActive(b)}>
                      {b.is_active ? (
                        <>
                          <ToggleLeft className="h-4 w-4 mr-2" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <ToggleRight className="h-4 w-4 mr-2" />
                          Activate
                        </>
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setConfirmDelete({ open: true, id: b.id })}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Address Information Card */}
      <Card>
        <CardHeader><CardTitle>Address Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" placeholder="Street Address" value={formData.address} onChange={e => handleChange('address', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" placeholder="City" value={formData.city} onChange={e => handleChange('city', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="province">Province</Label>
              <Input id="province" placeholder="Province" value={formData.province} onChange={e => handleChange('province', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input id="postalCode" placeholder="Postal Code" value={formData.postalCode} onChange={e => handleChange('postalCode', e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="country-select">Country</Label>
            <Select value={formData.country} onValueChange={value => handleChange('country', value)}>
              <SelectTrigger id="country-select">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="South Africa">South Africa</SelectItem>
                <SelectItem value="Zimbabwe">Zimbabwe</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Role & Access Section */}
      <Card>
        <CardHeader><CardTitle>Role & Access</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            If you currently have <strong>admin</strong> access and want to switch to <strong>user</strong> for this company,
            you can upgrade yourself below. You will be asked for the QxAnalytix password. To get this password you need to contact the QxAnalytix team.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              onClick={handleSelfDowngrade}
              disabled={!isAuthenticated || roleBusy}
              title="Upgrade your role from admin to user"
            >
              {roleBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
              Upgrade my role to User
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            You will be logged out after the change so your permissions refresh.
          </p>
        </CardContent>
      </Card>

      {/* Change Password Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                id="changePasswordCheckbox"
                type="checkbox"
                checked={changePassword}
                onChange={e => setChangePassword(e.target.checked)}
              />
              <Label htmlFor="changePasswordCheckbox">Change Password</Label>
            </div>
            {changePassword && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    placeholder="New Password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm Password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!isAuthenticated}>
          <Loader2 className="h-4 w-4 mr-2 hidden group-aria-[busy=true]:inline-block animate-spin" />
          Save Profile
        </Button>
      </div>

      {/* Create/Edit Branch Modal */}
      <Dialog open={branchModalOpen} onOpenChange={setBranchModalOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editingBranch ? 'Edit Branch' : 'Add Branch'}</DialogTitle>
            <DialogDescription>
              {editingBranch ? 'Update this branch details.' : 'Create a new branch for your company.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="b-code">Code</Label>
              <Input
                id="b-code"
                value={branchForm.code}
                onChange={(e) => setBranchForm((p) => ({ ...p, code: e.target.value }))}
                placeholder="JHB-01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-name">Name</Label>
              <Input
                id="b-name"
                value={branchForm.name}
                onChange={(e) => setBranchForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Johannesburg Branch"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-phone">Phone</Label>
              <Input
                id="b-phone"
                value={branchForm.phone}
                onChange={(e) => setBranchForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+27 11 000 0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-email">Email</Label>
              <Input
                id="b-email"
                type="email"
                value={branchForm.email}
                onChange={(e) => setBranchForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="branch@example.com"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="b-addr1">Address line 1</Label>
              <Input
                id="b-addr1"
                value={branchForm.address_line1}
                onChange={(e) => setBranchForm((p) => ({ ...p, address_line1: e.target.value }))}
                placeholder="Street address"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="b-addr2">Address line 2</Label>
              <Input
                id="b-addr2"
                value={branchForm.address_line2}
                onChange={(e) => setBranchForm((p) => ({ ...p, address_line2: e.target.value }))}
                placeholder="Suite, Building, etc."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-city">City</Label>
              <Input
                id="b-city"
                value={branchForm.city}
                onChange={(e) => setBranchForm((p) => ({ ...p, city: e.target.value }))}
                placeholder="City"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-province">Province</Label>
              <Input
                id="b-province"
                value={branchForm.province}
                onChange={(e) => setBranchForm((p) => ({ ...p, province: e.target.value }))}
                placeholder="Province"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-postal">Postal Code</Label>
              <Input
                id="b-postal"
                value={branchForm.postal_code}
                onChange={(e) => setBranchForm((p) => ({ ...p, postal_code: e.target.value }))}
                placeholder="Postal Code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-country">Country</Label>
              <Input
                id="b-country"
                value={branchForm.country}
                onChange={(e) => setBranchForm((p) => ({ ...p, country: e.target.value }))}
                placeholder="Country"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBranchModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveBranch} disabled={branchBusy}>
              {branchBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDelete.open} onOpenChange={(open) => setConfirmDelete({ open, id: open ? confirmDelete.id : undefined })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete branch</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the branch. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteBranch(confirmDelete.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
